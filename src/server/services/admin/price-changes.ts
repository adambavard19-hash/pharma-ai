import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { getStripe, stripeConfigState } from "@/server/billing/stripe-client";
import { ensurePlanStripePrice, syncSubscriptionFromStripe } from "@/server/billing/subscriptions";
import { readSubscription } from "@/core/billing/stripe-shapes";
import { contractualPrice, validateContractPriceChange } from "@/core/billing/contract-price";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";

/**
 * La modification EXPLICITE du tarif contractuel d'une officine : le seul
 * chemin par lequel un abonnement existant change de prix.
 *
 *   - un motif est obligatoire, et le changement est inscrit à l'historique
 *     du tarif (`SubscriptionPriceChange`) et au journal d'audit ;
 *   - un abonnement facturé par Stripe est mis à jour chez Stripe EN MÊME
 *     TEMPS : sans Stripe configuré, on refuse plutôt que de laisser la fiche
 *     et la facturation diverger ;
 *   - le nouveau prix s'applique à la prochaine échéance, sans prorata ;
 *   - le catalogue (`Plan`) n'est jamais touché.
 */

export type ChangeContractPriceInput = { subscriptionId: string; nextCents: number; reason: string; adminId: string };

export type ChangeContractPriceResult =
  | { ok: true; changeId: string; previousCents: number; nextCents: number; appliedToStripe: boolean; effectiveAt: Date; message: string }
  | { ok: false; error: string };

export async function changeContractPrice(input: ChangeContractPriceInput): Promise<ChangeContractPriceResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: input.subscriptionId },
    include: { plan: true, organization: { select: { pharmacies: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true, name: true } } } } },
  });
  if (!subscription) return { ok: false, error: "Abonnement introuvable." };
  if (subscription.status === "CANCELED" || subscription.status === "INCOMPLETE_EXPIRED") {
    return { ok: false, error: "Cet abonnement est terminé : son tarif ne se modifie plus." };
  }

  const before = contractualPrice(subscription, subscription.plan);
  const checked = validateContractPriceChange({ previousCents: before.cents, nextCents: input.nextCents, reason: input.reason });
  if (!checked.ok) return { ok: false, error: checked.error };

  const pharmacy = subscription.organization.pharmacies[0] ?? null;
  let appliedToStripe = false;
  let effectiveAt = new Date();
  let stripePriceId: string | null = null;

  if (subscription.stripeSubscriptionId) {
    const state = stripeConfigState();
    if (!state.configured) {
      return { ok: false, error: `Stripe n'est pas configuré (${state.detail}) : cet abonnement est facturé par Stripe, son tarif ne peut pas changer sur la seule fiche. Rien n'a été modifié.` };
    }
    let updated: unknown;
    try {
      // Le nouveau prix vit sur le produit Stripe de l'offre : on s'assure qu'il existe.
      const ensured = await ensurePlanStripePrice(subscription.planId);
      if (!ensured.ok) return { ok: false, error: `Produit Stripe de l'offre indisponible : ${ensured.error}` };
      const plan = await prisma.plan.findUnique({ where: { id: subscription.planId }, select: { stripeProductId: true, currency: true, name: true } });
      if (!plan?.stripeProductId) return { ok: false, error: "Le produit Stripe de l'offre est introuvable. Rien n'a été modifié." };

      const stripe = getStripe();
      const current = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const item = current.items.data[0];
      if (!item) return { ok: false, error: "L'abonnement Stripe n'a aucune ligne à mettre à jour. Rien n'a été modifié." };

      const price = await stripe.prices.create({
        product: plan.stripeProductId,
        unit_amount: input.nextCents,
        currency: plan.currency,
        recurring: { interval: "month" },
        nickname: `${plan.name} — tarif contractuel${pharmacy ? ` ${pharmacy.name}` : ""}`.slice(0, 250),
        metadata: { pharmaboostPlanId: subscription.planId, pharmaboostSubscriptionId: subscription.id, kind: "contract_price" },
      });
      // Sans prorata : la période en cours reste facturée à l'ancien tarif, le nouveau s'applique à l'échéance.
      updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{ id: item.id, price: price.id }],
        proration_behavior: "none",
      });
      stripePriceId = price.id;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Stripe a refusé la modification : ${detail}. Rien n'a été modifié sur la fiche.` };
    }
    // À partir d'ici, Stripe facture le nouveau tarif : aucune erreur ne doit plus le taire.
    appliedToStripe = true;
    const shape = readSubscription(updated);
    effectiveAt = shape.currentPeriodEnd ?? subscription.currentPeriodEnd ?? new Date();
    // La ligne locale suit Stripe (prix, période) ; son tarif contractuel est écrit juste après.
    await syncSubscriptionFromStripe(shape).catch((error) => console.error("[tarif] relecture Stripe après changement impossible", error));
  }

  let change: { id: string };
  try {
    change = await prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id: subscription.id }, data: { contractPriceCents: input.nextCents, ...(stripePriceId ? { stripePriceId } : {}) } });
      return tx.subscriptionPriceChange.create({
        data: {
          subscriptionId: subscription.id,
          organizationId: subscription.organizationId,
          previousCents: before.cents,
          nextCents: input.nextCents,
          reason: checked.reason,
          appliedToStripe,
          effectiveAt,
          changedByAdminId: input.adminId,
        },
        select: { id: true },
      });
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!appliedToStripe) {
      return { ok: false, error: `L'enregistrement du nouveau tarif a échoué (${detail}). Rien n'a été modifié.` };
    }
    // Stripe a changé, la fiche non : l'écart est dit à l'administrateur, signalé à toute l'équipe et tracé.
    await reportStripeOnlyChange({ subscription, pharmacy, previousCents: before.cents, nextCents: input.nextCents, reason: checked.reason, adminId: input.adminId, effectiveAt, stripePriceId, detail });
    return {
      ok: false,
      error: `Attention : Stripe facturera ${formatEuros(input.nextCents)} HT/mois à partir du ${formatFrenchDate(effectiveAt)}, mais la fiche n'a pas pu être mise à jour (${detail}). Elle affiche toujours ${formatEuros(before.cents)} et l'historique du tarif n'a pas été écrit. Une alerte critique a été envoyée à l'équipe : corrigez la fiche (ou rétablissez l'ancien prix chez Stripe) avant l'échéance.`,
    };
  }

  await recordAudit({
    action: "billing.contract_price_changed",
    entityType: "Subscription",
    entityId: subscription.id,
    pharmacyId: pharmacy?.id ?? null,
    platformAdminId: input.adminId,
    metadata: {
      before: { contractPriceCents: subscription.contractPriceCents, effectiveCents: before.cents, source: before.source },
      after: { contractPriceCents: input.nextCents },
      changes: { contractPriceCents: { from: before.cents, to: input.nextCents } },
      reason: checked.reason,
      appliedToStripe,
      effectiveAt: effectiveAt.toISOString(),
      priceChangeId: change.id,
    },
  });

  const message = appliedToStripe
    ? `Tarif contractuel passé de ${formatEuros(before.cents)} à ${formatEuros(input.nextCents)} HT/mois. Stripe est à jour : le nouveau tarif s'applique à l'échéance du ${formatFrenchDate(effectiveAt)}, sans prorata.`
    : `Tarif contractuel passé de ${formatEuros(before.cents)} à ${formatEuros(input.nextCents)} HT/mois sur la fiche. Aucun abonnement Stripe n'est rattaché : rien n'a été changé chez Stripe.`;
  return { ok: true, changeId: change.id, previousCents: before.cents, nextCents: input.nextCents, appliedToStripe, effectiveAt, message };
}

/**
 * Stripe facture désormais le nouveau tarif mais la fiche n'a pas pu être
 * écrite : alerte CRITIQUE à l'équipe (ce qui a changé, ce qui reste à
 * corriger) et tentative d'audit. Chaque étape est protégée : une base
 * indisponible ne doit pas masquer l'erreur rendue à l'administrateur, et les
 * journaux du serveur gardent la trace en dernier recours.
 */
async function reportStripeOnlyChange(input: {
  subscription: { id: string; organizationId: string; stripeSubscriptionId: string | null; contractPriceCents: number | null };
  pharmacy: { id: string; name: string } | null;
  previousCents: number;
  nextCents: number;
  reason: string;
  adminId: string;
  effectiveAt: Date;
  stripePriceId: string | null;
  detail: string;
}): Promise<void> {
  const who = input.pharmacy?.name ?? `l'organisation ${input.subscription.organizationId}`;
  console.error("[tarif] Stripe modifié, fiche non mise à jour", { subscriptionId: input.subscription.id, stripeSubscriptionId: input.subscription.stripeSubscriptionId, previousCents: input.previousCents, nextCents: input.nextCents, stripePriceId: input.stripePriceId, detail: input.detail });
  try {
    await notifyAdmins({
      type: "CONTRACT_PRICE_DIVERGENCE",
      title: `${who} : tarif modifié chez Stripe, pas sur la fiche`,
      body: `Stripe facturera ${formatEuros(input.nextCents)} HT/mois à partir du ${formatFrenchDate(input.effectiveAt)} (abonnement ${input.subscription.stripeSubscriptionId ?? "?"}, prix ${input.stripePriceId ?? "?"}). La fiche indique toujours ${formatEuros(input.previousCents)} et l'historique du tarif n'a pas été écrit (${input.detail}). Motif saisi : ${input.reason}. À corriger : refaire la modification sur la fiche, ou rétablir l'ancien prix chez Stripe avant l'échéance.`,
      linkUrl: input.pharmacy ? `/admin/abonnements/${input.pharmacy.id}` : null,
      severity: "CRITICAL",
    });
  } catch (error) {
    console.error("[tarif] alerte critique impossible", error);
  }
  await recordAudit({
    action: "billing.contract_price_changed",
    entityType: "Subscription",
    entityId: input.subscription.id,
    pharmacyId: input.pharmacy?.id ?? null,
    platformAdminId: input.adminId,
    metadata: {
      before: { contractPriceCents: input.subscription.contractPriceCents, effectiveCents: input.previousCents },
      after: { stripeCents: input.nextCents, contractPriceCents: input.subscription.contractPriceCents },
      changes: {},
      reason: input.reason,
      appliedToStripe: true,
      savedOnRecord: false,
      error: input.detail,
      stripePriceId: input.stripePriceId,
      effectiveAt: input.effectiveAt.toISOString(),
    },
  });
}
