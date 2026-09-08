"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/security/password";
import { createSalesSession, destroySalesSession, requireSalesSession } from "@/server/auth/sales-session";
import { getRequestMeta } from "@/server/auth/session";
import { recordAudit } from "@/server/audit/log";
import { peekSalesPasswordToken, sendSalesInvitation, setSalesPasswordByToken } from "@/server/services/sales/reps";
import { addProspectNote, addProspectTask, completeTask, createProspect, getProspectFor, setProspectStatus, updateProspect } from "@/server/services/sales/prospects";
import { generateContract, sendContract } from "@/server/services/sales/contracts";
import { createPharmacyFromProspect } from "@/server/services/sales/client-pharmacies";
import { markSalesNotificationsRead } from "@/server/services/sales/notifications";
import { PROSPECT_STATUSES } from "@/core/sales/pipeline";
import type { SalesActor } from "@/server/services/sales/events";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les gestes du commercial. Chaque action revérifie côté serveur que le
 * dossier appartient au commercial connecté : l'interface n'est jamais la
 * seule barrière.
 */

async function actorAndProspect(prospectId: string): Promise<{ actor: SalesActor & { type: "SALES" }; prospect: NonNullable<Awaited<ReturnType<typeof getProspectFor>>> } | { error: string }> {
  const session = await requireSalesSession();
  const prospect = await getProspectFor(prospectId, { kind: "SALES", salesRepId: session.rep.id });
  if (!prospect) return { error: "Dossier introuvable." };
  return { actor: { type: "SALES", id: session.rep.id, label: session.rep.fullName }, prospect };
}

// ---- Connexion ---------------------------------------------------------------

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export async function salesLoginAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fail("Identifiants incorrects.");
  const rep = await prisma.salesRep.findUnique({ where: { email: parsed.data.email } });
  const valid = await verifyPassword(parsed.data.password, rep?.passwordHash ?? undefined);
  if (!rep || !valid || !rep.isActive) return fail("Identifiants incorrects.");
  const meta = await getRequestMeta();
  await createSalesSession({ salesRepId: rep.id, ipAddress: meta.ipAddress });
  await recordAudit({ action: "auth.login", entityType: "SalesRep", entityId: rep.id, salesRepId: rep.id, metadata: { scope: "sales" } });
  redirect("/extranet");
}

export async function salesLogoutAction(): Promise<void> {
  await destroySalesSession();
  redirect("/extranet/connexion");
}

export async function requestSalesPasswordLinkAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse({ email: formData.get("email") });
  if (!parsed.success) return fail("Adresse e-mail invalide.");
  const rep = await prisma.salesRep.findUnique({ where: { email: parsed.data.email }, select: { id: true, isActive: true } });
  if (rep?.isActive) await sendSalesInvitation(rep.id, null).catch(() => undefined);
  return ok(null, "Si un compte existe pour cette adresse, un lien vient de lui être envoyé.");
}

export async function setSalesPasswordAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = z.object({ token: z.string().min(16), password: z.string().min(1), confirm: z.string().min(1) }).safeParse({ token: formData.get("token"), password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return fail("Formulaire incomplet.");
  if (parsed.data.password !== parsed.data.confirm) return fail("Les deux mots de passe ne sont pas identiques.");
  const result = await setSalesPasswordByToken(parsed.data.token, parsed.data.password);
  if (!result.ok) return fail(result.error);
  const meta = await getRequestMeta();
  await createSalesSession({ salesRepId: result.salesRepId, ipAddress: meta.ipAddress });
  redirect("/extranet");
}

export async function peekSalesTokenAction(token: string) {
  return peekSalesPasswordToken(token);
}

// ---- Dossiers ---------------------------------------------------------------

const prospectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable().or(z.literal("")),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  postalCode: z.string().trim().max(10).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  finessNumber: z.string().trim().max(20).optional().nullable(),
  siret: z.string().trim().max(20).optional().nullable(),
  outletCount: z.coerce.number().int().min(1).max(500).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  monthlyPriceCents: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  nextActionAt: z.string().optional().nullable(),
  nextActionLabel: z.string().trim().max(120).optional().nullable(),
});

export async function createProspectAction(payload: z.input<typeof prospectSchema>): Promise<ActionResult<{ prospectId: string }>> {
  const session = await requireSalesSession();
  const parsed = prospectSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;
  const { id } = await createProspect(
    { ...input, email: input.email || null, nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null },
    session.rep.id,
    { type: "SALES", id: session.rep.id, label: session.rep.fullName },
  );
  revalidatePath("/extranet");
  return ok({ prospectId: id }, "Dossier créé.");
}

export async function updateProspectAction(payload: Partial<z.input<typeof prospectSchema>> & { prospectId: string }): Promise<ActionResult<null>> {
  const found = await actorAndProspect(payload.prospectId);
  if ("error" in found) return fail(found.error);
  const parsed = prospectSchema.partial().safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const { nextActionAt: _ignoredDate, nextActionLabel: _ignoredLabel, ...input } = parsed.data;
  void _ignoredDate;
  void _ignoredLabel;
  await updateProspect(payload.prospectId, { ...input, email: input.email || null }, found.actor);
  revalidatePath(`/extranet/dossiers/${payload.prospectId}`);
  return ok(null, "Dossier mis à jour.");
}

export async function setProspectStatusAction(payload: { prospectId: string; status: string; reason?: string | null }): Promise<ActionResult<null>> {
  const found = await actorAndProspect(payload.prospectId);
  if ("error" in found) return fail(found.error);
  const status = PROSPECT_STATUSES.find((s) => s === payload.status);
  if (!status) return fail("Statut inconnu.");
  const result = await setProspectStatus(payload.prospectId, status, found.actor, payload.reason ?? null);
  if (!result.ok) return fail(result.error);
  revalidatePath("/extranet");
  revalidatePath(`/extranet/dossiers/${payload.prospectId}`);
  return ok(null, "Statut mis à jour.");
}

export async function addNoteAction(payload: { prospectId: string; note: string }): Promise<ActionResult<null>> {
  const found = await actorAndProspect(payload.prospectId);
  if ("error" in found) return fail(found.error);
  const note = payload.note.trim();
  if (note.length < 2 || note.length > 2000) return fail("La note doit faire entre 2 et 2000 caractères.");
  await addProspectNote(payload.prospectId, note, found.actor);
  revalidatePath(`/extranet/dossiers/${payload.prospectId}`);
  return ok(null, "Note ajoutée.");
}

export async function addTaskAction(payload: { prospectId: string; label: string; dueAt: string }): Promise<ActionResult<null>> {
  const found = await actorAndProspect(payload.prospectId);
  if ("error" in found) return fail(found.error);
  const dueAt = new Date(payload.dueAt);
  if (Number.isNaN(dueAt.getTime())) return fail("Date invalide.");
  await addProspectTask(payload.prospectId, found.actor.id, payload.label || "Relancer", dueAt, found.actor);
  revalidatePath(`/extranet/dossiers/${payload.prospectId}`);
  revalidatePath("/extranet/taches");
  return ok(null, "Relance programmée.");
}

export async function completeTaskAction(taskId: string): Promise<ActionResult<null>> {
  const session = await requireSalesSession();
  try {
    await completeTask(taskId, { type: "SALES", id: session.rep.id, label: session.rep.fullName });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Action impossible.");
  }
  revalidatePath("/extranet");
  revalidatePath("/extranet/taches");
  return ok(null, "Relance terminée.");
}

// ---- Contrat et officine -----------------------------------------------------

const contractSchema = z.object({ prospectId: z.string().min(1), monthlyPriceCents: z.coerce.number().int().min(100).max(10_000_000), durationMonths: z.coerce.number().int().min(1).max(60), startDate: z.string().min(8) });

export async function generateContractAction(payload: z.input<typeof contractSchema>): Promise<ActionResult<{ contractId: string }>> {
  const parsed = contractSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les conditions du contrat.", zodFieldErrors(parsed.error.issues));
  const found = await actorAndProspect(parsed.data.prospectId);
  if ("error" in found) return fail(found.error);
  const result = await generateContract(parsed.data.prospectId, { monthlyPriceCents: parsed.data.monthlyPriceCents, durationMonths: parsed.data.durationMonths, startDate: new Date(parsed.data.startDate) }, found.actor);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/extranet/dossiers/${parsed.data.prospectId}`);
  return ok({ contractId: result.contractId }, "Contrat généré. Relisez-le, puis envoyez-le.");
}

export async function sendContractAction(payload: { prospectId: string; contractId: string }): Promise<ActionResult<{ signature: string }>> {
  const found = await actorAndProspect(payload.prospectId);
  if ("error" in found) return fail(found.error);
  if (!found.prospect.contracts.some((c) => c.id === payload.contractId)) return fail("Contrat introuvable.");
  const result = await sendContract(payload.contractId, found.actor);
  if (!result.ok) return fail(result.error);
  revalidatePath("/extranet");
  revalidatePath(`/extranet/dossiers/${payload.prospectId}`);
  return ok({ signature: result.signature }, `Contrat envoyé au titulaire.${result.signature ? ` ${result.signature}` : ""}`);
}

export async function createPharmacyFromProspectAction(prospectId: string): Promise<ActionResult<{ pharmacyId: string }>> {
  const found = await actorAndProspect(prospectId);
  if ("error" in found) return fail(found.error);
  const result = await createPharmacyFromProspect(prospectId, found.actor);
  if (!result.ok) return fail(result.error);
  revalidatePath("/extranet");
  revalidatePath(`/extranet/dossiers/${prospectId}`);
  return ok({ pharmacyId: result.pharmacyId }, result.welcome.status === "SENT" ? "Espace pharmacie créé, e-mail d'accueil envoyé au titulaire." : `Espace pharmacie créé, mais l'e-mail d'accueil n'est pas parti : ${result.welcome.detail}`);
}

export async function markSalesNotificationsReadAction(): Promise<void> {
  const session = await requireSalesSession();
  await markSalesNotificationsRead(session.rep.id);
  revalidatePath("/extranet/notifications");
}
