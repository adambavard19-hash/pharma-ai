"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { createSalesRep, sendSalesInvitation, updateSalesRep } from "@/server/services/sales/reps";
import { reassignProspect, setProspectBlocked, setProspectStatus, addProspectNote, createProspect, updateProspect } from "@/server/services/sales/prospects";
import { applySignatureStatus, refreshContractSignatureStatus, runContractReminders, sendContract, startContracting, upsertCompanyProfile } from "@/server/services/sales/contracts";
import { saveReminderPolicy } from "@/server/services/platform-settings";
import { markAdminNotificationsRead } from "@/server/services/sales/notifications";
import { shouldApplySignatureStatus } from "@/core/signature";
import { CONTRACT_STATUS_LABELS } from "@/core/sales/pipeline";
import { updateCommission } from "@/server/services/sales/commissions";
import { createPharmacyFromProspect } from "@/server/services/sales/client-pharmacies";
import { PROSPECT_STATUSES } from "@/core/sales/pipeline";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/** Les contrôles de l'administrateur sur l'extranet. Tous tracés. */

const repSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).optional().nullable(),
  zone: z.string().trim().max(120).optional().nullable(),
  commissionType: z.enum(["FIXED", "PERCENT", "RECURRING"]),
  commissionValue: z.coerce.number().int().min(0).max(100_000_000),
  isActive: z.boolean().optional(),
});

export async function createSalesRepAction(payload: z.input<typeof repSchema> & { invite?: boolean }): Promise<ActionResult<{ salesRepId: string; invitation: string | null }>> {
  const session = await requirePlatformSession();
  const parsed = repSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const existing = await prisma.salesRep.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) return fail("Un commercial existe déjà avec cette adresse e-mail.");
  const { id } = await createSalesRep(parsed.data, session.admin.id);
  let invitation: string | null = null;
  if (payload.invite !== false) {
    const outcome = await sendSalesInvitation(id, session.admin.id);
    invitation = outcome.status === "SENT" ? "Invitation envoyée." : `Invitation NON envoyée : ${outcome.detail}`;
  }
  revalidatePath("/admin/commerciaux");
  return ok({ salesRepId: id, invitation }, `${parsed.data.firstName} ${parsed.data.lastName} créé(e). ${invitation ?? ""}`.trim());
}

export async function updateSalesRepAction(payload: Partial<z.input<typeof repSchema>> & { salesRepId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = repSchema.partial().safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  await updateSalesRep(payload.salesRepId, parsed.data, session.admin.id);
  revalidatePath("/admin/commerciaux");
  revalidatePath(`/admin/commerciaux/${payload.salesRepId}`);
  return ok(null, "Commercial mis à jour.");
}

export async function inviteSalesRepAction(salesRepId: string): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const outcome = await sendSalesInvitation(salesRepId, session.admin.id);
  revalidatePath(`/admin/commerciaux/${salesRepId}`);
  return outcome.status === "SENT" ? ok(null, "Invitation envoyée.") : fail(`Invitation non envoyée : ${outcome.detail}`);
}

export async function reassignProspectAction(payload: { prospectId: string; salesRepId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  await reassignProspect(payload.prospectId, payload.salesRepId, session.admin.id, session.admin.fullName);
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  revalidatePath("/admin/pipeline");
  return ok(null, "Dossier réassigné.");
}

export async function setProspectBlockedAction(payload: { prospectId: string; blocked: boolean; reason?: string | null }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  await setProspectBlocked(payload.prospectId, payload.blocked, payload.reason ?? null, session.admin.id, session.admin.fullName);
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  return ok(null, payload.blocked ? "Dossier suspendu." : "Dossier réactivé.");
}

export async function adminSetProspectStatusAction(payload: { prospectId: string; status: string; reason?: string | null }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const status = PROSPECT_STATUSES.find((s) => s === payload.status);
  if (!status) return fail("Statut inconnu.");
  const result = await setProspectStatus(payload.prospectId, status, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName }, payload.reason ?? null);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  return ok(null, "Statut mis à jour.");
}

export async function adminAddNoteAction(payload: { prospectId: string; note: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const note = payload.note.trim();
  if (note.length < 2) return fail("Note trop courte.");
  await addProspectNote(payload.prospectId, note, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  return ok(null, "Note ajoutée.");
}

/**
 * Signature reçue hors ligne (papier, courriel) : enregistrée par l'admin,
 * avec un motif, et tracée. Ce n'est pas une signature électronique et le
 * journal ne la présente jamais comme telle.
 */
export async function recordOfflineSignatureAction(payload: { prospectId: string; contractId: string; status: "SIGNED_PHARMACY" | "FINALIZED" | "REFUSED" | "EXPIRED"; reason: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const reason = payload.reason.trim();
  if (reason.length < 5) return fail("Indiquez comment la signature a été reçue (au moins 5 caractères).");
  const contract = await prisma.contract.findUnique({ where: { id: payload.contractId }, select: { prospectId: true, status: true, providerEnvelopeId: true } });
  if (!contract || contract.prospectId !== payload.prospectId) return fail("Contrat introuvable.");
  if (contract.status === "DRAFT") return fail("Ce contrat n'a pas encore été envoyé.");
  if (contract.status === "FINALIZED") return fail("Ce contrat est déjà finalisé.");
  if (!shouldApplySignatureStatus(contract.status, payload.status)) return fail("Ce statut ferait reculer le contrat.");
  // Une demande de signature électronique en cours reste la référence : on ne l'écrase pas par « hors ligne ».
  if (!contract.providerEnvelopeId) await prisma.contract.update({ where: { id: payload.contractId }, data: { signatureProvider: "offline" } });
  await applySignatureStatus(payload.contractId, payload.status, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName }, `signature hors ligne — ${reason}`);
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  return ok(null, "Statut du contrat enregistré.");
}

export async function refreshSignatureStatusAction(payload: { prospectId: string; contractId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const contract = await prisma.contract.findUnique({ where: { id: payload.contractId }, select: { prospectId: true } });
  if (!contract || contract.prospectId !== payload.prospectId) return fail("Contrat introuvable.");
  const result = await refreshContractSignatureStatus(payload.contractId, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  return ok(null, result.changed ? `Statut mis à jour : ${CONTRACT_STATUS_LABELS[result.status]}.` : `Statut inchangé chez le prestataire : ${CONTRACT_STATUS_LABELS[result.status]}.`);
}

export async function adminResendContractAction(payload: { prospectId: string; contractId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const owned = await prisma.contract.findUnique({ where: { id: payload.contractId }, select: { prospectId: true } });
  if (!owned || owned.prospectId !== payload.prospectId) return fail("Contrat introuvable.");
  const result = await sendContract(payload.contractId, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  return ok(null, "Contrat renvoyé au titulaire.");
}

export async function adminCreatePharmacyAction(prospectId: string): Promise<ActionResult<{ pharmacyId: string }>> {
  const session = await requirePlatformSession();
  const result = await createPharmacyFromProspect(prospectId, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/dossiers/${prospectId}`);
  return ok({ pharmacyId: result.pharmacyId }, result.welcome.status === "SENT" ? "Espace pharmacie créé, e-mail d'accueil envoyé." : `Espace créé ; e-mail d'accueil non envoyé : ${result.welcome.detail}`);
}

const commissionSchema = z.object({
  commissionId: z.string().min(1),
  prospectId: z.string().min(1),
  amountCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  status: z.enum(["FORECAST", "EARNED", "PAYABLE", "PAID", "CANCELLED"]).optional(),
  dueAt: z.string().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export async function updateCommissionAction(payload: z.input<typeof commissionSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = commissionSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const { commissionId, prospectId, dueAt, ...rest } = parsed.data;
  await updateCommission(commissionId, { ...rest, ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}) }, session.admin.id, session.admin.fullName);
  revalidatePath(`/admin/dossiers/${prospectId}`);
  revalidatePath("/admin/commerciaux");
  return ok(null, "Commission mise à jour.");
}

const companySchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  legalForm: z.string().trim().max(60).optional().nullable(),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  postalCode: z.string().trim().max(10).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  siren: z.string().trim().max(20).optional().nullable(),
  representativeName: z.string().trim().min(2).max(120),
  representativeTitle: z.string().trim().max(80).optional().nullable(),
  representativeEmail: z.string().trim().toLowerCase().email(),
});

export async function saveCompanyProfileAction(payload: z.input<typeof companySchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = companySchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  await upsertCompanyProfile(parsed.data, session.admin.id);
  revalidatePath("/admin/societe");
  return ok(null, "Société enregistrée.");
}

// ---- Parcours contractuel (console) -------------------------------------------

const adminProspectSchema = z.object({
  name: z.string().trim().min(2, "Le nom de la pharmacie est requis.").max(120),
  legalName: z.string().trim().max(160).optional().nullable(),
  siret: z.string().trim().max(30).optional().nullable(),
  finessNumber: z.string().trim().max(20).optional().nullable(),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  postalCode: z.string().trim().max(10).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  ownerName: z.string().trim().max(120).optional().nullable(),
  ownerTitle: z.string().trim().max(80).optional().nullable(),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").optional().nullable().or(z.literal("")),
  outletCount: z.coerce.number().int().min(1).max(500).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  salesRepId: z.string().optional().nullable(),
});

/** Un dossier créé depuis la console : prospect, démonstration ou dossier en préparation. Aucun contrat ne part. */
export async function adminCreateProspectAction(payload: z.input<typeof adminProspectSchema>): Promise<ActionResult<{ prospectId: string }>> {
  const session = await requirePlatformSession();
  const parsed = adminProspectSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const { salesRepId, ...input } = parsed.data;
  const rep = salesRepId ? await prisma.salesRep.findFirst({ where: { id: salesRepId, isActive: true }, select: { id: true } }) : null;
  const { id } = await createProspect({ ...input, email: input.email || null }, rep?.id ?? null, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName }, "SUPER_ADMIN");
  revalidatePath("/admin/pipeline");
  return ok({ prospectId: id }, "Dossier créé. Aucun contrat n'a été envoyé.");
}

export async function adminUpdateProspectAction(payload: Partial<z.input<typeof adminProspectSchema>> & { prospectId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = adminProspectSchema.partial().safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const { salesRepId: _ignored, ...input } = parsed.data;
  void _ignored;
  const result = await updateProspect(payload.prospectId, { ...input, ...(input.email !== undefined ? { email: input.email || null } : {}) }, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/dossiers/${payload.prospectId}`);
  return ok(null, "Dossier mis à jour.");
}

const adminStartSchema = z.object({
  prospectId: z.string().min(1),
  planId: z.string().optional().nullable(),
  monthlyPriceCents: z.coerce.number().int().min(100).max(10_000_000).optional().nullable(),
  durationMonths: z.coerce.number().int().min(1).max(60).optional().nullable(),
  startDate: z.string().min(8).optional().nullable(),
});

/** « Envoyer le contrat » depuis la console : le même moteur que le site et l'extranet. */
export async function adminStartContractingAction(payload: z.input<typeof adminStartSchema>): Promise<ActionResult<{ outcome: string }>> {
  const session = await requirePlatformSession();
  const parsed = adminStartSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les conditions du contrat.", zodFieldErrors(parsed.error.issues));
  const result = await startContracting(parsed.data.prospectId, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName }, {
    planId: parsed.data.planId || null,
    monthlyPriceCents: parsed.data.monthlyPriceCents ?? null,
    durationMonths: parsed.data.durationMonths ?? null,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
  });
  revalidatePath(`/admin/dossiers/${parsed.data.prospectId}`);
  revalidatePath("/admin/pipeline");
  if (!result.ok) return fail(result.error, Object.fromEntries((result.missing ?? []).map((m) => [m.field, m.reason === "invalid" ? `${m.label} invalide` : `${m.label} requis`])));
  return ok({ outcome: result.outcome }, result.message);
}

/** La cadence des relances, modifiable sans toucher au code. */
export async function saveReminderPolicyAction(payload: { enabled: boolean; firstAfterDays: number; secondAfterDays: number; escalateAfterDays: number }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const policy = await saveReminderPolicy(payload, session.admin.id);
  revalidatePath("/admin/societe");
  return ok(null, policy.enabled ? `Relances enregistrées : J+${policy.firstAfterDays}${policy.secondAfterDays ? `, puis +${policy.secondAfterDays} j` : ""}${policy.escalateAfterDays ? `, signalement +${policy.escalateAfterDays} j` : ""}.` : "Relances automatiques désactivées.");
}

/** Lance le passage des relances immédiatement (sans attendre la tâche planifiée). */
export async function runRemindersNowAction(): Promise<ActionResult<null>> {
  await requirePlatformSession();
  const report = await runContractReminders();
  return ok(null, `${report.checked} contrat(s) en attente vérifié(s) : ${report.reminded} relance(s), ${report.escalated} signalement(s), ${report.expired} expiré(s)${report.errors.length ? `, ${report.errors.length} erreur(s)` : ""}.`);
}

export async function markAdminNotificationsReadAction(): Promise<ActionResult<null>> {
  await requirePlatformSession();
  await markAdminNotificationsRead();
  revalidatePath("/admin/notifications");
  return ok(null, "Notifications marquées comme lues.");
}
