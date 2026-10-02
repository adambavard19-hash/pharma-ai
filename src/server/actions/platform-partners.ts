"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, PUBLICATION_STATUSES, PUBLICATION_STATUS_LABELS } from "@/core/partners/status";
import { addApplicationNote, createPartnerFromApplication, moveApplication } from "@/server/services/partners/applications";
import {
  createPartner,
  deletePartnerContact,
  normalizeContact,
  normalizeContract,
  normalizeIntegration,
  normalizePartnerIdentity,
  savePartnerContact,
  savePartnerContract,
  savePartnerIntegration,
  setPartnerStatus,
  updatePartnerIdentity,
} from "@/server/services/partners/partners";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * PharmaBoost Partenaires, gestes de la console : faire avancer une
 * candidature, l'annoter, créer la fiche partenaire, puis tenir cette fiche
 * (identité, statut de publication, contacts, contrats internes,
 * intégrations). Chaque geste part d'une session administrateur, revérifie
 * les identifiants reçus et est tracé. Aucune donnée patient ; aucun secret ;
 * aucune facturation : un contrat est une note interne chiffrée.
 */

function revalidatePartners() {
  // Toutes les pages de la rubrique : listes, fiches, candidatures, intégrations.
  revalidatePath("/admin/partenaires", "layout");
}

const id = z.string().min(1).max(64);

// ---------------------------------------------------------------------------
// Candidatures
// ---------------------------------------------------------------------------

const moveSchema = z.object({ id, to: z.enum(APPLICATION_STATUSES) });

export async function moveApplicationAction(payload: z.input<typeof moveSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = moveSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await moveApplication(parsed.data.id, parsed.data.to, session.admin.id);
  if (!result.ok) {
    const messages = {
      NOT_FOUND: "Candidature introuvable.",
      FORBIDDEN_TRANSITION: "Ce changement de statut n'est pas permis depuis le statut actuel.",
      NEEDS_PARTNER: "Créez d'abord la fiche partenaire : une candidature ne devient « Partenaire actif » qu'adossée à une fiche.",
      CONFLICT: "La candidature a changé entre-temps. Rechargez la page.",
    } as const;
    return fail(messages[result.reason]);
  }

  await recordAudit({
    action: "partner.application_status_changed",
    entityType: "PartnerApplication",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { from: result.from, to: result.to },
  });
  revalidatePartners();
  return ok(null, `Candidature passée en « ${APPLICATION_STATUS_LABELS[result.to]} ».`);
}

const noteSchema = z.object({ id, note: z.string().trim().min(1, "Écrivez la note.").max(4000, "4 000 caractères au plus.") });

export async function addApplicationNoteAction(payload: z.input<typeof noteSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = noteSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la note.", zodFieldErrors(parsed.error.issues));

  const result = await addApplicationNote(parsed.data.id, parsed.data.note, session.admin.id);
  if (!result.ok) return fail("Candidature introuvable.");

  await recordAudit({
    action: "partner.application_note_added",
    entityType: "PartnerApplication",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { eventId: result.eventId, length: parsed.data.note.length },
  });
  revalidatePartners();
  return ok(null, "Note ajoutée à l'historique.");
}

const fromApplicationSchema = z.object({ id });

export async function createPartnerFromApplicationAction(payload: z.input<typeof fromApplicationSchema>): Promise<ActionResult<{ partnerId: string }>> {
  const session = await requirePlatformSession();
  const parsed = fromApplicationSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await createPartnerFromApplication(parsed.data.id, session.admin.id);
  if (!result.ok) {
    const messages = {
      NOT_FOUND: "Candidature introuvable.",
      NOT_ACCEPTED: "La fiche partenaire se crée une fois la candidature acceptée.",
      ALREADY_LINKED: "Cette candidature a déjà sa fiche partenaire.",
      CONFLICT: "La candidature a changé entre-temps. Rechargez la page.",
    } as const;
    return fail(messages[result.reason]);
  }

  await recordAudit({
    action: "partner.saved",
    entityType: "Partner",
    entityId: result.partnerId,
    platformAdminId: session.admin.id,
    metadata: { created: true, fromApplicationId: parsed.data.id, status: "DRAFT" },
  });
  revalidatePartners();
  return ok({ partnerId: result.partnerId }, `Fiche « ${result.name} » créée en brouillon : elle n'est visible d'aucune officine.`);
}

// ---------------------------------------------------------------------------
// Partenaires : identité et statut
// ---------------------------------------------------------------------------

const identitySchema = z.object({
  name: z.string().max(200),
  legalName: z.string().max(200).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  logoUrl: z.string().max(1000).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  universes: z.array(z.string().max(80)).max(40).optional(),
  startsAt: z.string().max(20).optional().nullable(),
  endsAt: z.string().max(20).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
});

export type PartnerIdentityPayload = z.input<typeof identitySchema>;

export async function createPartnerAction(payload: PartnerIdentityPayload): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = identitySchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la fiche.", zodFieldErrors(parsed.error.issues));
  const identity = normalizePartnerIdentity(parsed.data);
  if (!identity.ok) return fail("Vérifiez la fiche.", identity.fieldErrors);

  const created = await createPartner(identity.data, session.admin.id);
  await recordAudit({
    action: "partner.saved",
    entityType: "Partner",
    entityId: created.id,
    platformAdminId: session.admin.id,
    metadata: { created: true, manual: true, status: "DRAFT", universes: identity.data.universes.length },
  });
  revalidatePartners();
  return ok({ id: created.id }, `« ${identity.data.name} » créé en brouillon.`);
}

const updateIdentitySchema = identitySchema.extend({ id });

export async function savePartnerIdentityAction(payload: z.input<typeof updateIdentitySchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = updateIdentitySchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la fiche.", zodFieldErrors(parsed.error.issues));
  const identity = normalizePartnerIdentity(parsed.data);
  if (!identity.ok) return fail("Vérifiez la fiche.", identity.fieldErrors);

  const result = await updatePartnerIdentity(parsed.data.id, identity.data);
  if (!result.ok) return fail("Partenaire introuvable.");

  await recordAudit({
    action: "partner.saved",
    entityType: "Partner",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { created: false, universes: identity.data.universes.length, hasLogo: Boolean(identity.data.logoUrl), hasNotes: Boolean(identity.data.notes) },
  });
  revalidatePartners();
  return ok(null, "Fiche enregistrée.");
}

const statusSchema = z.object({ id, to: z.enum(PUBLICATION_STATUSES) });

export async function setPartnerStatusAction(payload: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await setPartnerStatus(parsed.data.id, parsed.data.to);
  if (!result.ok) {
    const messages = {
      NOT_FOUND: "Partenaire introuvable.",
      FORBIDDEN_TRANSITION: "Ce changement de statut n'est pas permis depuis le statut actuel.",
      CONFLICT: "Le statut a changé entre-temps. Rechargez la page.",
    } as const;
    return fail(messages[result.reason]);
  }

  await recordAudit({
    action: "partner.status_changed",
    entityType: "Partner",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { from: result.from, to: result.to },
  });
  revalidatePartners();
  return ok(null, `« ${result.name} » est maintenant « ${PUBLICATION_STATUS_LABELS[result.to]} ».`);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  partnerId: id,
  id: id.optional().nullable(),
  firstName: z.string().max(120),
  lastName: z.string().max(120),
  role: z.string().max(160).optional().nullable(),
  email: z.string().max(254).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  isPrimary: z.boolean(),
  receivesOrders: z.boolean(),
});

export async function savePartnerContactAction(payload: z.input<typeof contactSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le contact.", zodFieldErrors(parsed.error.issues));
  const contact = normalizeContact(parsed.data);
  if (!contact.ok) return fail("Vérifiez le contact.", contact.fieldErrors);

  const result = await savePartnerContact(parsed.data.partnerId, parsed.data.id ?? null, contact.data);
  if (!result.ok) return fail("Partenaire ou contact introuvable.");

  await recordAudit({
    action: "partner.contact_saved",
    entityType: "PartnerContact",
    entityId: result.id,
    platformAdminId: session.admin.id,
    metadata: { partnerId: parsed.data.partnerId, created: result.created, isPrimary: contact.data.isPrimary, receivesOrders: contact.data.receivesOrders },
  });
  revalidatePartners();
  return ok({ id: result.id }, result.created ? "Contact ajouté." : "Contact enregistré.");
}

const deleteContactSchema = z.object({ partnerId: id, id });

export async function deletePartnerContactAction(payload: z.input<typeof deleteContactSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = deleteContactSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await deletePartnerContact(parsed.data.partnerId, parsed.data.id);
  if (!result.ok) return fail("Contact introuvable.");

  await recordAudit({
    action: "partner.contact_deleted",
    entityType: "PartnerContact",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { partnerId: parsed.data.partnerId, wasPrimary: result.wasPrimary },
  });
  revalidatePartners();
  return ok(null, "Contact supprimé.");
}

// ---------------------------------------------------------------------------
// Contrats internes
// ---------------------------------------------------------------------------

const contractSchema = z.object({
  partnerId: id,
  id: id.optional().nullable(),
  type: z.string().max(20),
  startsAt: z.string().max(20).optional().nullable(),
  endsAt: z.string().max(20).optional().nullable(),
  fixedAmount: z.string().max(30).optional().nullable(),
  commissionPercent: z.string().max(12).optional().nullable(),
  commissionPerUnit: z.string().max(30).optional().nullable(),
  minimum: z.string().max(30).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
});

export async function savePartnerContractAction(payload: z.input<typeof contractSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = contractSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le contrat.", zodFieldErrors(parsed.error.issues));
  const contract = normalizeContract(parsed.data);
  if (!contract.ok) return fail("Vérifiez le contrat.", contract.fieldErrors);

  const result = await savePartnerContract(parsed.data.partnerId, parsed.data.id ?? null, contract.data, session.admin.id);
  if (!result.ok) return fail("Partenaire ou contrat introuvable.");

  await recordAudit({
    action: "partner.contract_saved",
    entityType: "PartnerContract",
    entityId: result.id,
    platformAdminId: session.admin.id,
    metadata: { partnerId: parsed.data.partnerId, created: result.created, type: contract.data.type },
  });
  revalidatePartners();
  return ok({ id: result.id }, result.created ? "Contrat ajouté (interne, aucune facturation)." : "Contrat enregistré.");
}

// ---------------------------------------------------------------------------
// Intégrations
// ---------------------------------------------------------------------------

const integrationSchema = z.object({
  partnerId: id,
  id: id.optional().nullable(),
  mode: z.string().max(20),
  isActive: z.boolean(),
  b2bUrlTemplate: z.string().max(2000).optional().nullable(),
  orderEmail: z.string().max(254).optional().nullable(),
  formUrl: z.string().max(2000).optional().nullable(),
  capabilities: z.array(z.string().max(40)).max(20).optional(),
  notes: z.string().max(8000).optional().nullable(),
});

export async function savePartnerIntegrationAction(payload: z.input<typeof integrationSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = integrationSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez l'intégration.", zodFieldErrors(parsed.error.issues));
  const integration = normalizeIntegration(parsed.data);
  if (!integration.ok) return fail("Vérifiez l'intégration.", integration.fieldErrors);

  const result = await savePartnerIntegration(parsed.data.partnerId, parsed.data.id ?? null, integration.data);
  if (!result.ok) return fail("Partenaire ou intégration introuvable.");

  await recordAudit({
    action: "partner.integration_saved",
    entityType: "PartnerIntegration",
    entityId: result.id,
    platformAdminId: session.admin.id,
    metadata: { partnerId: parsed.data.partnerId, created: result.created, mode: integration.data.mode, isActive: integration.data.isActive, capabilities: integration.data.capabilities },
  });
  revalidatePartners();
  return ok({ id: result.id }, result.created ? "Intégration ajoutée." : "Intégration enregistrée.");
}
