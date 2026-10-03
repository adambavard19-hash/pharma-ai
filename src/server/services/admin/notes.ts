import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";

/**
 * Les notes internes de l'équipe PharmaBoost, sur une officine ou un dossier
 * commercial. Elles ne sortent jamais de la console : ni l'officine ni les
 * commerciaux ne les voient. Chaque ajout et chaque épinglage est tracé.
 */

export const NOTE_MIN_LENGTH = 2;
export const NOTE_MAX_LENGTH = 2000;

export type AdminNoteRow = {
  id: string;
  pharmacyId: string | null;
  prospectId: string | null;
  body: string;
  pinned: boolean;
  authorAdminId: string;
  authorLabel: string;
  createdAt: Date;
};

const NOTE_SELECT = { id: true, pharmacyId: true, prospectId: true, body: true, pinned: true, authorAdminId: true, authorLabel: true, createdAt: true } as const;

type Failure = { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Le texte d'une note, nettoyé : pas d'espaces en bordure, au plus une ligne vide d'affilée. */
export function normalizeNoteBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function validateNoteBody(body: string): { ok: true; body: string } | Failure {
  const value = normalizeNoteBody(body);
  if (value.length < NOTE_MIN_LENGTH) return { ok: false, error: "La note est vide.", fieldErrors: { body: "Écrivez au moins deux caractères." } };
  if (value.length > NOTE_MAX_LENGTH) return { ok: false, error: "La note est trop longue.", fieldErrors: { body: `${NOTE_MAX_LENGTH} caractères au plus.` } };
  return { ok: true, body: value };
}

/**
 * Ajoute une note sur une officine OU un dossier. La cible est relue en base :
 * un identifiant venu de l'écran n'est jamais cru sur parole.
 */
export async function addAdminNote(input: { pharmacyId?: string | null; prospectId?: string | null; body: string; adminId: string; label: string }): Promise<{ ok: true; note: AdminNoteRow } | Failure> {
  const checked = validateNoteBody(input.body);
  if (!checked.ok) return checked;
  const pharmacyId = input.pharmacyId || null;
  const prospectId = input.prospectId || null;
  if ((pharmacyId ? 1 : 0) + (prospectId ? 1 : 0) !== 1) return { ok: false, error: "Une note se rattache à une officine ou à un dossier." };

  let auditPharmacyId: string | null = null;
  if (pharmacyId) {
    const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true } });
    if (!pharmacy) return { ok: false, error: "Officine introuvable." };
    auditPharmacyId = pharmacy.id;
  } else if (prospectId) {
    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: { id: true, pharmacyId: true } });
    if (!prospect) return { ok: false, error: "Dossier introuvable." };
    auditPharmacyId = prospect.pharmacyId;
  }

  const note = await prisma.adminNote.create({
    data: { pharmacyId, prospectId, body: checked.body, authorAdminId: input.adminId, authorLabel: input.label.slice(0, 120) },
    select: NOTE_SELECT,
  });
  // Le journal garde le fait et la longueur, pas le texte : la note elle-même fait foi.
  await recordAudit({
    action: "platform.note_added",
    entityType: "AdminNote",
    entityId: note.id,
    pharmacyId: auditPharmacyId,
    platformAdminId: input.adminId,
    metadata: { target: pharmacyId ? "Pharmacy" : "Prospect", targetId: pharmacyId ?? prospectId, length: checked.body.length },
  });
  return { ok: true, note };
}

/** Épingle ou désépingle une note : elle remonte en tête de la fiche. */
export async function setNotePinned(noteId: string, pinned: boolean, adminId: string): Promise<{ ok: true; note: AdminNoteRow; changed: boolean } | Failure> {
  const current = await prisma.adminNote.findUnique({ where: { id: noteId }, select: NOTE_SELECT });
  if (!current) return { ok: false, error: "Note introuvable." };
  if (current.pinned === pinned) return { ok: true, note: current, changed: false };
  const note = await prisma.adminNote.update({ where: { id: noteId }, data: { pinned }, select: NOTE_SELECT });
  let auditPharmacyId = current.pharmacyId;
  if (!auditPharmacyId && current.prospectId) {
    const prospect = await prisma.prospect.findUnique({ where: { id: current.prospectId }, select: { pharmacyId: true } });
    auditPharmacyId = prospect?.pharmacyId ?? null;
  }
  await recordAudit({
    action: "platform.note_pinned",
    entityType: "AdminNote",
    entityId: note.id,
    pharmacyId: auditPharmacyId,
    platformAdminId: adminId,
    metadata: { pinned, before: { pinned: current.pinned }, after: { pinned } },
  });
  return { ok: true, note, changed: true };
}

/**
 * Les notes d'une officine et de son dossier commercial, épinglées d'abord,
 * puis de la plus récente à la plus ancienne.
 */
export async function listNotes(target: { pharmacyId?: string | null; prospectId?: string | null }, options: { limit?: number; pinnedOnly?: boolean } = {}): Promise<AdminNoteRow[]> {
  const or = [...(target.pharmacyId ? [{ pharmacyId: target.pharmacyId }] : []), ...(target.prospectId ? [{ prospectId: target.prospectId }] : [])];
  if (or.length === 0) return [];
  return prisma.adminNote.findMany({
    where: { OR: or, ...(options.pinnedOnly ? { pinned: true } : {}) },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: options.limit ?? 100,
    select: NOTE_SELECT,
  });
}
