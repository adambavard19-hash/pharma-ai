"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { normalizePlanCode } from "@/core/billing/subscription";
import { ensurePlanStripePrice, refreshSubscriptionFromStripe, sendSubscriptionInvite, setAccessSuspended, setCancelAtPeriodEnd } from "@/server/billing/subscriptions";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { ensureDossierForPharmacy, refreshDossierFromPharmacy } from "@/server/services/sales/pharmacy-dossier";
import { generateContract, sendContract } from "@/server/services/sales/contracts";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Abonnements & contrats, pilotés depuis la console. Chaque geste part d'une
 * session administrateur et est tracé. Aucun identifiant Stripe n'est accepté
 * du client : la console désigne une officine ou une offre, jamais un objet
 * Stripe.
 */

const planSchema = z.object({
  planId: z.string().optional().nullable(),
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).default(""),
  monthlyPriceCents: z.coerce.number().int().min(100, "Le prix doit être d'au moins 1 €").max(10_000_000),
  trialDays: z.coerce.number().int().min(0).max(365),
  isDefault: z.boolean().optional(),
});

function revalidateBilling(pharmacyId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/abonnements");
  revalidatePath("/admin/abonnements/offres");
  if (pharmacyId) {
    revalidatePath(`/admin/abonnements/${pharmacyId}`);
    revalidatePath(`/admin/pharmacies/${pharmacyId}`);
  }
}

/** Crée ou modifie une offre, puis crée son prix Stripe si Stripe est configuré. */
export async function savePlanAction(payload: z.input<typeof planSchema>): Promise<ActionResult<{ planId: string; stripe: string }>> {
  const session = await requirePlatformSession();
  const parsed = planSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez l'offre.", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;
  const code = normalizePlanCode(input.code);
  if (!code) return fail("Le code de l'offre est invalide.", { code: "Lettres et chiffres seulement." });
  const clash = await prisma.plan.findUnique({ where: { code }, select: { id: true } });
  if (clash && clash.id !== input.planId) return fail("Ce code d'offre existe déjà.", { code: "Déjà utilisé." });

  const data = { code, name: input.name, description: input.description, monthlyPriceCents: input.monthlyPriceCents, trialDays: input.trialDays, isActive: true };
  const plan = input.planId
    ? await prisma.plan.update({ where: { id: input.planId }, data })
    : await prisma.plan.create({ data });
  if (input.isDefault) {
    await prisma.$transaction([prisma.plan.updateMany({ data: { isDefault: false } }), prisma.plan.update({ where: { id: plan.id }, data: { isDefault: true } })]);
  }
  await recordAudit({ action: "billing.plan_saved", entityType: "Plan", entityId: plan.id, platformAdminId: session.admin.id, metadata: { code, monthlyPriceCents: input.monthlyPriceCents, trialDays: input.trialDays } });

  let stripe = "Stripe non configuré : le prix Stripe sera créé dès que la clé sera renseignée.";
  if (stripeConfigState().configured) {
    const price = await ensurePlanStripePrice(plan.id);
    stripe = price.ok ? (price.created ? "Prix Stripe créé." : "Prix Stripe inchangé.") : `Prix Stripe non créé : ${price.error}`;
  }
  revalidateBilling();
  return ok({ planId: plan.id, stripe }, `Offre « ${plan.name } » enregistrée. ${stripe}`);
}

export async function setPlanActiveAction(payload: { planId: string; isActive: boolean }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const plan = await prisma.plan.update({ where: { id: payload.planId }, data: { isActive: payload.isActive, ...(payload.isActive ? {} : { isDefault: false }) } });
  await recordAudit({ action: "billing.plan_saved", entityType: "Plan", entityId: plan.id, platformAdminId: session.admin.id, metadata: { isActive: payload.isActive } });
  revalidateBilling();
  return ok(null, payload.isActive ? "Offre réactivée." : "Offre archivée : plus proposée aux nouveaux contrats.");
}

const contractSchema = z.object({
  pharmacyId: z.string().min(1),
  planId: z.string().min(1),
  durationMonths: z.coerce.number().int().min(1).max(60),
  startDate: z.string().min(8),
});

/** Prépare le contrat d'une officine : dossier (créé si besoin), offre, essai, PDF. */
export async function prepareContractForPharmacyAction(payload: z.input<typeof contractSchema>): Promise<ActionResult<{ contractId: string; prospectId: string }>> {
  const session = await requirePlatformSession();
  const parsed = contractSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les conditions du contrat.", zodFieldErrors(parsed.error.issues));
  const actor = { type: "ADMIN" as const, id: session.admin.id, label: session.admin.fullName };
  // Le contrat reprend l'adresse de l'officine et le titulaire : sans eux, on
  // le dit tout de suite, avec l'endroit où les compléter.
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: parsed.data.pharmacyId }, select: { addressLine1: true, city: true, email: true, memberships: { where: { role: "OWNER", isActive: true }, take: 1, select: { user: { select: { email: true } } } } } });
  if (!pharmacy) return fail("Officine introuvable.");
  const missing = [!pharmacy.addressLine1 ? "adresse" : null, !pharmacy.city ? "ville" : null, !pharmacy.memberships[0] && !pharmacy.email ? "titulaire ou e-mail" : null].filter(Boolean);
  if (missing.length > 0) return fail(`Complétez d'abord la fiche de l'officine (Officines clientes → Modifier) : ${missing.join(", ")}.`);
  const [dossier, plan] = await Promise.all([ensureDossierForPharmacy(parsed.data.pharmacyId, actor), prisma.plan.findUnique({ where: { id: parsed.data.planId } })]);
  if (!dossier.ok) return fail(dossier.error);
  if (!plan || !plan.isActive) return fail("Offre introuvable ou archivée.");
  await refreshDossierFromPharmacy(dossier.prospectId);
  const result = await generateContract(dossier.prospectId, { monthlyPriceCents: plan.monthlyPriceCents, durationMonths: parsed.data.durationMonths, startDate: new Date(parsed.data.startDate), planId: plan.id, planName: plan.name, trialDays: plan.trialDays }, actor);
  if (!result.ok) return fail(result.error);
  await recordAudit({ action: "billing.contract_prepared", entityType: "Contract", entityId: result.contractId, platformAdminId: session.admin.id, metadata: { pharmacyId: parsed.data.pharmacyId, planId: plan.id } });
  revalidateBilling(parsed.data.pharmacyId);
  return ok({ contractId: result.contractId, prospectId: dossier.prospectId }, "Contrat préparé. Relisez-le, puis envoyez-le pour signature.");
}

export async function sendContractForPharmacyAction(payload: { pharmacyId: string; contractId: string }): Promise<ActionResult<{ signature: string }>> {
  const session = await requirePlatformSession();
  const contract = await prisma.contract.findUnique({ where: { id: payload.contractId }, select: { pharmacyId: true, prospect: { select: { pharmacyId: true } } } });
  if (!contract || (contract.pharmacyId ?? contract.prospect.pharmacyId) !== payload.pharmacyId) return fail("Contrat introuvable pour cette officine.");
  const result = await sendContract(payload.contractId, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidateBilling(payload.pharmacyId);
  return ok({ signature: result.signature }, `Contrat envoyé au titulaire.${result.signature ? ` ${result.signature}` : ""}`);
}

export async function sendSubscriptionInviteAction(payload: { pharmacyId: string; planId?: string | null; contractId?: string | null }): Promise<ActionResult<{ sentTo: string }>> {
  const session = await requirePlatformSession();
  let planId = payload.planId ?? null;
  let contractId = payload.contractId ?? null;
  if (!planId) {
    const latest = await prisma.contract.findFirst({ where: { OR: [{ pharmacyId: payload.pharmacyId }, { prospect: { pharmacyId: payload.pharmacyId } }] }, orderBy: { version: "desc" }, select: { id: true, planId: true, status: true } });
    if (latest?.planId) {
      planId = latest.planId;
      contractId = contractId ?? latest.id;
    } else {
      const fallback = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true } });
      planId = fallback?.id ?? null;
    }
  }
  if (!planId) return fail("Aucune offre disponible : créez d'abord une offre dans Abonnements & Contrats → Offres.");
  const result = await sendSubscriptionInvite({ pharmacyId: payload.pharmacyId, planId, contractId, adminId: session.admin.id });
  if (!result.ok) return fail(result.error);
  revalidateBilling(payload.pharmacyId);
  return ok({ sentTo: result.sentTo }, `Lien d'abonnement envoyé à ${result.sentTo}.`);
}

export async function suspendAccessAction(payload: { pharmacyId: string; suspended: boolean; reason?: string | null }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const result = await setAccessSuspended(payload.pharmacyId, payload.suspended, payload.reason ?? null, session.admin.id);
  if (!result.ok) return fail(result.error);
  revalidateBilling(payload.pharmacyId);
  revalidatePath("/admin/pharmacies");
  return ok(null, payload.suspended ? "Accès suspendu : les sessions de l'officine sont fermées." : "Accès rétabli.");
}

export async function cancelAtPeriodEndAction(payload: { pharmacyId: string; cancel: boolean }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: payload.pharmacyId }, select: { organizationId: true } });
  if (!pharmacy) return fail("Officine introuvable.");
  const result = await setCancelAtPeriodEnd(pharmacy.organizationId, payload.cancel, session.admin.id);
  if (!result.ok) return fail(result.error);
  revalidateBilling(payload.pharmacyId);
  return ok(null, payload.cancel ? "Résiliation programmée à la fin de la période en cours." : "Résiliation annulée : l'abonnement continue.");
}

export async function refreshSubscriptionAction(payload: { pharmacyId: string }): Promise<ActionResult<{ status: string }>> {
  await requirePlatformSession();
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: payload.pharmacyId }, select: { organizationId: true } });
  if (!pharmacy) return fail("Officine introuvable.");
  const result = await refreshSubscriptionFromStripe(pharmacy.organizationId);
  if (!result.ok) return fail(result.error);
  revalidateBilling(payload.pharmacyId);
  return ok({ status: result.status }, "État relu chez Stripe.");
}
