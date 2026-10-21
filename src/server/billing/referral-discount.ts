import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { referralState } from "@/server/services/referral";
import { formatEuros } from "@/core/billing/subscription";
import { referralCouponId, referralDiscountPlan } from "@/core/billing/checkout";
import { getStripe, stripeConfigState } from "./stripe-client";

/**
 * La remise de parrainage, appliquée chez Stripe.
 *
 * Le calcul est celui de `referralState` (10 % dès un filleul actif, ou les
 * montants d'offre s'ils sont plus avantageux, plafonnés par le tarif
 * contractuel). Il devient un coupon permanent `amount_off` en euros posé sur
 * l'abonnement Stripe du parrain : `pb-parrainage-1260` pour 12,60 € de moins
 * par mois. Un coupon par montant, partagé par tous les parrains au même montant.
 *
 * Idempotent : rejouée par chaque webhook qui peut changer la remise (un filleul
 * qui démarre, paie, ne paie plus, résilie ; un accès suspendu), puis chaque nuit
 * en rattrapage. Rien n'est envoyé à Stripe quand la remise posée est déjà la
 * bonne. Les autres remises éventuelles de l'abonnement sont gardées.
 * La remise s'applique aux factures suivantes (Stripe ne refait pas une facture émise).
 */

const ENDED = new Set(["CANCELED", "INCOMPLETE_EXPIRED"]);

export type ReferralSyncOutcome =
  | { status: "SKIPPED"; reason: string }
  | { status: "UNCHANGED"; discountCents: number }
  | { status: "UPDATED"; previousCents: number; discountCents: number };

type DiscountLike = { id: string; source?: { coupon?: string | { id: string } | null } | null; coupon?: string | { id: string } | null };

function couponOf(discount: DiscountLike): string | null {
  const coupon = discount.source?.coupon ?? discount.coupon ?? null;
  if (!coupon) return null;
  return typeof coupon === "string" ? coupon : coupon.id;
}

/** Le coupon d'un montant, créé s'il n'existe pas encore (un autre parrain au même montant a pu le créer). */
async function ensureReferralCoupon(stripe: Stripe, amountCents: number): Promise<string> {
  const id = referralCouponId(amountCents);
  try {
    await stripe.coupons.retrieve(id);
    return id;
  } catch {
    try {
      await stripe.coupons.create({ id, amount_off: amountCents, currency: "eur", duration: "forever", name: `Parrainage PharmaBoost (−${formatEuros(amountCents)} HT/mois)`, metadata: { pharmaboost: "referral" } });
    } catch (error) {
      // Créé entre-temps par un autre appel : on le relit, sinon l'erreur remonte.
      await stripe.coupons.retrieve(id).catch(() => {
        throw error;
      });
    }
    return id;
  }
}

/** Synchronise la remise de parrainage de cette officine chez Stripe. Ne lève jamais pour un parrain sans abonnement Stripe. */
export async function syncReferralDiscount(pharmacyId: string, stripe?: Stripe): Promise<ReferralSyncOutcome> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true, organization: { select: { subscription: { select: { id: true, status: true, stripeSubscriptionId: true, referralDiscountCents: true } } } } } });
  const subscription = pharmacy?.organization.subscription;
  if (!pharmacy || !subscription?.stripeSubscriptionId) return { status: "SKIPPED", reason: "aucun abonnement Stripe" };
  if (ENDED.has(subscription.status)) return { status: "SKIPPED", reason: "abonnement terminé" };
  if (!stripe && !stripeConfigState().configured) return { status: "SKIPPED", reason: "Stripe non configuré" };
  const client = stripe ?? getStripe();

  const { benefit } = await referralState(pharmacy.id);
  const desired = benefit.discountCents;
  const remote = await client.subscriptions.retrieve(subscription.stripeSubscriptionId, { expand: ["discounts"] });
  const current = (remote.discounts ?? []).flatMap((d) => (typeof d === "string" ? [{ discountId: d, couponId: null }] : [{ discountId: d.id, couponId: couponOf(d as unknown as DiscountLike) }]));
  const plan = referralDiscountPlan(current, desired);
  const previous = subscription.referralDiscountCents ?? 0;
  const now = new Date();

  if (!plan.changed) {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { referralDiscountCents: desired, referralCouponId: desired > 0 ? referralCouponId(desired) : null, referralSyncedAt: now } });
    return { status: "UNCHANGED", discountCents: desired };
  }
  if (desired > 0) await ensureReferralCoupon(client, desired);
  await client.subscriptions.update(subscription.stripeSubscriptionId, { discounts: plan.discounts.length ? plan.discounts : "" });
  await prisma.subscription.update({ where: { id: subscription.id }, data: { referralDiscountCents: desired, referralCouponId: desired > 0 ? referralCouponId(desired) : null, referralSyncedAt: now } });
  await recordAudit({
    action: "billing.referral_discount_synced",
    entityType: "Subscription",
    entityId: subscription.id,
    pharmacyId: pharmacy.id,
    metadata: { before: { discountCents: previous }, after: { discountCents: desired, basis: benefit.basis }, changes: { discountCents: { from: previous, to: desired } } },
  });
  return { status: "UPDATED", previousCents: previous, discountCents: desired };
}

/** Jamais bloquant : un webhook ou un geste de la console ne doit pas échouer pour une remise ; l'erreur est journalisée. */
export async function syncReferralDiscountSafely(pharmacyId: string | null | undefined, why: string): Promise<void> {
  if (!pharmacyId) return;
  try {
    await syncReferralDiscount(pharmacyId);
  } catch (error) {
    console.error(`[parrainage] remise non synchronisée (${why})`, error instanceof Error ? error.message : error);
  }
}

/** Le parrain de l'officine de cette organisation, à resynchroniser quand le filleul change d'état. */
export async function syncReferrerOfOrganization(organizationId: string | null | undefined, why: string): Promise<void> {
  if (!organizationId) return;
  try {
    const filleuls = await prisma.pharmacy.findMany({ where: { organizationId, referredById: { not: null } }, select: { referredById: true } });
    for (const referrerId of new Set(filleuls.map((f) => f.referredById))) await syncReferralDiscountSafely(referrerId, why);
  } catch (error) {
    console.error(`[parrainage] parrain non resynchronisé (${why})`, error instanceof Error ? error.message : error);
  }
}

/** Le rattrapage de nuit : tous les parrains dont l'abonnement est payé par Stripe. */
export async function syncAllReferralDiscounts(): Promise<{ checked: number; updated: number; failed: number }> {
  if (!stripeConfigState().configured) return { checked: 0, updated: 0, failed: 0 };
  const referrers = await prisma.pharmacy.findMany({
    where: { organization: { subscription: { stripeSubscriptionId: { not: null }, status: { notIn: ["CANCELED", "INCOMPLETE_EXPIRED"] } } }, OR: [{ referrals: { some: {} } }, { organization: { subscription: { referralDiscountCents: { gt: 0 } } } }] },
    select: { id: true },
  });
  let updated = 0;
  let failed = 0;
  for (const referrer of referrers) {
    try {
      const outcome = await syncReferralDiscount(referrer.id);
      if (outcome.status === "UPDATED") updated += 1;
    } catch (error) {
      failed += 1;
      console.error("[parrainage] rattrapage impossible", referrer.id, error instanceof Error ? error.message : error);
    }
  }
  return { checked: referrers.length, updated, failed };
}
