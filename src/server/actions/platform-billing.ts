"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { normalizePlanCode } from "@/core/billing/subscription";
import { SIGNED_CONTRACT_STATUS, ensurePlanStripePrice, refreshSubscriptionFromStripe, sendSubscriptionInvite, setAccessSuspended, setCancelAtPeriodEnd } from "@/server/billing/subscriptions";
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

const id = z.string().trim().min(1).max(60);

/** Une liste saisie « une ligne par élément » : lignes vides et doublons écartés. */
const lines = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((value) => {
    const raw = Array.isArray(value) ? value : (value ?? "").split("\n");
    return [...new Set(raw.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 30).map((line) => line.slice(0, 160));
  });

const optionalCents = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number("Montant invalide.").int("Montant invalide.").min(100, "Au moins 1 €.").max(100_000_000, "Montant trop élevé.").nullable());
/** Une mise en service : 0 est une valeur (« offerte »), vide est « non renseignée ». */
const optionalFee = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number("Montant invalide.").int("Montant invalide.").min(0, "Montant invalide.").max(10_000_000, "Montant trop élevé.").nullable());
const optionalInt = (min: number, max: number) => z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number("Nombre invalide.").int("Nombre entier attendu.").min(min, `Entre ${min} et ${max}.`).max(max, `Entre ${min} et ${max}.`).nullable());

const planSchema = z.object({
  planId: z.string().optional().nullable(),
  code: z.string().trim().min(2, "Deux caractères au moins.").max(40, "40 caractères au plus."),
  name: z.string().trim().min(2, "Deux caractères au moins.").max(80, "80 caractères au plus."),
  description: z.string().trim().max(400, "400 caractères au plus.").default(""),
  monthlyPriceCents: z.coerce.number("Prix invalide.").int("Prix invalide.").min(100, "Le prix doit être d'au moins 1 €.").max(10_000_000, "Prix trop élevé."),
  trialDays: z.coerce.number("Nombre de jours invalide.").int("Nombre entier attendu.").min(0, "Entre 0 et 365 jours.").max(365, "Entre 0 et 365 jours."),
  annualPriceCents: optionalCents.optional(),
  setupFeeCents: optionalFee.optional(),
  annualSetupFeeCents: optionalFee.optional(),
  foundingPriceCents: optionalCents.optional(),
  discountPercent: optionalInt(1, 90).optional(),
  discountLabel: z.string().trim().max(80, "80 caractères au plus.").optional().nullable(),
  features: lines,
  options: lines,
  maxUsers: optionalInt(1, 500).optional(),
  sortOrder: z.coerce.number("Nombre invalide.").int("Nombre entier attendu.").min(0, "Entre 0 et 999.").max(999, "Entre 0 et 999.").default(0),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

function revalidateBilling(pharmacyId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/abonnements");
  revalidatePath("/admin/abonnements/offres");
  revalidatePath("/admin/impayes");
  revalidatePath("/admin/resiliations");
  if (pharmacyId) {
    revalidatePath(`/admin/abonnements/${pharmacyId}`);
    revalidatePath(`/admin/pharmacies/${pharmacyId}`);
  }
}

const PLAN_AUDITED_FIELDS = ["code", "name", "description", "monthlyPriceCents", "trialDays", "annualPriceCents", "setupFeeCents", "annualSetupFeeCents", "foundingPriceCents", "discountPercent", "discountLabel", "features", "options", "maxUsers", "sortOrder", "isActive", "isDefault"] as const;

/** Les champs réellement modifiés, en {from, to} : le journal dit ce qui a changé, pas tout le formulaire. */
function planChanges(before: Record<string, unknown> | null, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of PLAN_AUDITED_FIELDS) {
    const from = before ? (before[field] ?? null) : null;
    const to = after[field] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to };
  }
  return changes;
}

/**
 * Crée ou modifie une offre du catalogue, puis crée son prix Stripe si Stripe
 * est configuré. Le catalogue ne s'applique qu'aux nouveaux abonnements : un
 * changement de prix ne touche aucun tarif contractuel existant.
 */
export async function savePlanAction(payload: z.input<typeof planSchema>): Promise<ActionResult<{ planId: string; stripe: string }>> {
  const session = await requirePlatformSession();
  const parsed = planSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez l'offre.", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;
  const code = normalizePlanCode(input.code);
  if (!code) return fail("Le code de l'offre est invalide.", { code: "Lettres et chiffres seulement." });
  const clash = await prisma.plan.findUnique({ where: { code }, select: { id: true } });
  if (clash && clash.id !== input.planId) return fail("Ce code d'offre existe déjà.", { code: "Déjà utilisé." });
  if (input.discountPercent && !input.discountLabel?.trim()) return fail("Donnez un libellé à la remise.", { discountLabel: "Ex. « Remise de lancement »." });
  if (input.foundingPriceCents && input.foundingPriceCents >= input.monthlyPriceCents) return fail("Le tarif fondateur doit être inférieur au prix mensuel.", { foundingPriceCents: "Inférieur au prix mensuel." });

  const before = input.planId ? await prisma.plan.findUnique({ where: { id: input.planId } }) : null;
  if (input.planId && !before) return fail("Offre introuvable.");
  const isActive = input.isActive ?? before?.isActive ?? true;
  // Une offre archivée n'est jamais l'offre par défaut ; sans indication, on garde le réglage actuel.
  const isDefault = (input.isDefault ?? before?.isDefault ?? false) && isActive;

  const data = {
    code,
    name: input.name,
    description: input.description,
    monthlyPriceCents: input.monthlyPriceCents,
    trialDays: input.trialDays,
    // Plus d'offre annuelle : le formulaire n'envoie plus ces deux montants, la valeur déjà enregistrée est conservée.
    annualPriceCents: input.annualPriceCents === undefined ? (before?.annualPriceCents ?? null) : input.annualPriceCents,
    setupFeeCents: input.setupFeeCents ?? null,
    annualSetupFeeCents: input.annualSetupFeeCents === undefined ? (before?.annualSetupFeeCents ?? null) : input.annualSetupFeeCents,
    foundingPriceCents: input.foundingPriceCents ?? null,
    discountPercent: input.discountPercent ?? null,
    discountLabel: input.discountPercent ? (input.discountLabel?.trim() || null) : null,
    features: input.features,
    options: input.options,
    maxUsers: input.maxUsers ?? null,
    sortOrder: input.sortOrder,
    isActive,
  };
  const plan = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.plan.updateMany({ where: { isDefault: true, ...(input.planId ? { id: { not: input.planId } } : {}) }, data: { isDefault: false } });
    return input.planId ? tx.plan.update({ where: { id: input.planId }, data: { ...data, isDefault } }) : tx.plan.create({ data: { ...data, isDefault } });
  });

  const changes = planChanges(before as Record<string, unknown> | null, plan as unknown as Record<string, unknown>);
  await recordAudit({
    action: "billing.plan_saved",
    entityType: "Plan",
    entityId: plan.id,
    platformAdminId: session.admin.id,
    metadata: { created: !before, code, changes, note: changes.monthlyPriceCents ? "Prix catalogue modifié : les abonnements existants gardent leur tarif contractuel." : undefined },
  });

  let stripe = "Stripe non configuré : le prix Stripe sera créé dès que la clé sera renseignée.";
  if (stripeConfigState().configured && plan.isActive) {
    const price = await ensurePlanStripePrice(plan.id);
    stripe = price.ok ? (price.created ? "Prix Stripe créé pour les nouveaux abonnements." : "Prix Stripe inchangé.") : `Prix Stripe non créé : ${price.error}`;
  } else if (!plan.isActive) {
    stripe = "Offre archivée : aucun prix Stripe créé.";
  }
  revalidateBilling();
  return ok({ planId: plan.id, stripe }, `Offre « ${plan.name} » enregistrée. ${stripe}`);
}

const planActiveSchema = z.object({ planId: id, isActive: z.boolean() });

export async function setPlanActiveAction(payload: z.input<typeof planActiveSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = planActiveSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const before = await prisma.plan.findUnique({ where: { id: parsed.data.planId }, select: { id: true, isActive: true, isDefault: true } });
  if (!before) return fail("Offre introuvable.");
  const plan = await prisma.plan.update({ where: { id: before.id }, data: { isActive: parsed.data.isActive, ...(parsed.data.isActive ? {} : { isDefault: false }) } });
  await recordAudit({
    action: "billing.plan_saved",
    entityType: "Plan",
    entityId: plan.id,
    platformAdminId: session.admin.id,
    metadata: { changes: { isActive: { from: before.isActive, to: plan.isActive }, ...(before.isDefault !== plan.isDefault ? { isDefault: { from: before.isDefault, to: plan.isDefault } } : {}) } },
  });
  revalidateBilling();
  return ok(null, parsed.data.isActive ? "Offre réactivée." : "Offre archivée : plus proposée aux nouveaux contrats. Les abonnements en cours ne changent pas.");
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

const sendContractSchema = z.object({ pharmacyId: id, contractId: id });

export async function sendContractForPharmacyAction(payload: z.input<typeof sendContractSchema>): Promise<ActionResult<{ signature: string }>> {
  const session = await requirePlatformSession();
  const parsed = sendContractSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const contract = await prisma.contract.findUnique({ where: { id: parsed.data.contractId }, select: { pharmacyId: true, prospect: { select: { pharmacyId: true } } } });
  if (!contract || (contract.pharmacyId ?? contract.prospect.pharmacyId) !== parsed.data.pharmacyId) return fail("Contrat introuvable pour cette officine.");
  const result = await sendContract(parsed.data.contractId, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidateBilling(parsed.data.pharmacyId);
  return ok({ signature: result.signature }, `Contrat envoyé au titulaire.${result.signature ? ` ${result.signature}` : ""}`);
}

const inviteSchema = z.object({ pharmacyId: id, planId: id.optional().nullable(), contractId: id.optional().nullable() });

export async function sendSubscriptionInviteAction(payload: z.input<typeof inviteSchema>): Promise<ActionResult<{ sentTo: string }>> {
  const session = await requirePlatformSession();
  const parsed = inviteSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  let planId = parsed.data.planId ?? null;
  let contractId = parsed.data.contractId ?? null;
  if (!planId) {
    // Le dernier contrat ne fonde le lien (offre, tarif, essai, identifiant) que s'il est signé.
    // Sinon : son offre si elle est encore active, au tarif catalogue ; à défaut l'offre par défaut.
    const latest = await prisma.contract.findFirst({ where: { OR: [{ pharmacyId: parsed.data.pharmacyId }, { prospect: { pharmacyId: parsed.data.pharmacyId } }] }, orderBy: { version: "desc" }, select: { id: true, planId: true, status: true, plan: { select: { isActive: true } } } });
    if (latest?.planId && latest.status === SIGNED_CONTRACT_STATUS) {
      planId = latest.planId;
      contractId = contractId ?? latest.id;
    } else if (latest?.planId && latest.plan?.isActive) {
      planId = latest.planId;
    } else {
      const fallback = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
      planId = fallback?.id ?? null;
    }
  }
  if (!planId) return fail("Aucune offre disponible : créez d'abord une offre dans Facturation → Offres & tarifs.");
  const result = await sendSubscriptionInvite({ pharmacyId: parsed.data.pharmacyId, planId, contractId, adminId: session.admin.id });
  if (!result.ok) return fail(result.error);
  revalidateBilling(parsed.data.pharmacyId);
  return ok({ sentTo: result.sentTo }, `Lien d'abonnement envoyé à ${result.sentTo}.`);
}

const suspendSchema = z
  .object({ pharmacyId: id, suspended: z.boolean(), reason: z.string().trim().max(500).optional().nullable() })
  .refine((v) => !v.suspended || (v.reason ?? "").length >= 5, { message: "Indiquez le motif de la suspension (5 caractères au moins).", path: ["reason"] });

export async function suspendAccessAction(payload: z.input<typeof suspendSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = suspendSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Demande invalide.", zodFieldErrors(parsed.error.issues));
  const result = await setAccessSuspended(parsed.data.pharmacyId, parsed.data.suspended, parsed.data.reason ?? null, session.admin.id);
  if (!result.ok) return fail(result.error);
  revalidateBilling(parsed.data.pharmacyId);
  revalidatePath("/admin/pharmacies");
  revalidatePath("/admin/acces");
  return ok(null, parsed.data.suspended ? "Accès suspendu : les sessions de l'officine sont fermées. L'abonnement Stripe n'est pas modifié." : "Accès rétabli.");
}

const cancelSchema = z.object({ pharmacyId: id, cancel: z.boolean() });

export async function cancelAtPeriodEndAction(payload: z.input<typeof cancelSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = cancelSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: parsed.data.pharmacyId }, select: { organizationId: true } });
  if (!pharmacy) return fail("Officine introuvable.");
  const result = await setCancelAtPeriodEnd(pharmacy.organizationId, parsed.data.cancel, session.admin.id);
  if (!result.ok) return fail(result.error);
  revalidateBilling(parsed.data.pharmacyId);
  return ok(null, parsed.data.cancel ? "Résiliation programmée à la fin de la période en cours." : "Résiliation annulée : l'abonnement continue.");
}

export async function refreshSubscriptionAction(payload: { pharmacyId: string }): Promise<ActionResult<{ status: string }>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ pharmacyId: id }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: parsed.data.pharmacyId }, select: { organizationId: true } });
  if (!pharmacy) return fail("Officine introuvable.");
  const before = await prisma.subscription.findUnique({ where: { organizationId: pharmacy.organizationId }, select: { id: true, status: true } });
  const result = await refreshSubscriptionFromStripe(pharmacy.organizationId);
  if (!result.ok) return fail(result.error);
  await recordAudit({ action: "billing.subscription_refreshed", entityType: "Subscription", entityId: before?.id ?? null, pharmacyId: parsed.data.pharmacyId, platformAdminId: session.admin.id, metadata: { changes: before?.status !== result.status ? { status: { from: before?.status ?? null, to: result.status } } : {} } });
  revalidateBilling(parsed.data.pharmacyId);
  return ok({ status: result.status }, "État relu chez Stripe.");
}
