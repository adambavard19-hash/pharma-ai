/**
 * Entrer dans une officine : l'invitation du titulaire, la demande du collaborateur, les règles qui les encadrent.
 *
 * Deux portes, une seule règle : on n'entre dans une officine que par un lien PERSONNEL que son titulaire a envoyé, ou par une demande
 * que son titulaire a APPROUVÉE. Connaître le nom d'une pharmacie ne donne jamais accès à rien. Module pur : ni base, ni session.
 */

import type { TeamRole } from "./rules";

/** Un lien d'invitation reste valable une semaine. */
export const INVITATION_TTL_DAYS = 7;
export const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Autant d'adresses à la fois, pas plus : une équipe, pas un publipostage. */
export const MAX_INVITES_AT_ONCE = 20;
/** Les demandes en attente qu'une officine accepte de garder : au-delà, on n'en reçoit plus (anti-abus). */
export const MAX_PENDING_JOIN_REQUESTS = 25;

/** Les postes qu'on peut donner par invitation : devenir titulaire passe par « Modifier » (règles de l'équipe). */
export const INVITABLE_ROLES = ["PHARMACIST", "TECHNICIAN", "STUDENT", "SUBSTITUTE"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
export const isInvitableRole = (value: unknown): value is InvitableRole => typeof value === "string" && (INVITABLE_ROLES as readonly string[]).includes(value);

/** Les postes qu'un collaborateur peut déclarer en demandant à rejoindre : jamais titulaire, jamais « consultation » d'office. */
export const DECLARABLE_ROLES = ["PHARMACIST", "TECHNICIAN", "STUDENT", "SUBSTITUTE"] as const;
export type DeclarableRole = (typeof DECLARABLE_ROLES)[number];
export const isDeclarableRole = (value: unknown): value is DeclarableRole => typeof value === "string" && (DECLARABLE_ROLES as readonly string[]).includes(value);

const EMAIL = /^[^\s@,;<>()[\]]+@[^\s@,;<>()[\]]+\.[^\s@,;<>()[\]]{2,}$/;
export const isEmail = (value: string): boolean => value.length <= 160 && EMAIL.test(value);
export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

/** Un prénom ou un nom : 80 caractères au plus, comme partout ailleurs dans PharmaBoost. */
export const PERSON_NAME_MAX = 80;

/** Un prénom ou un nom tel qu'on l'enregistre : sans caractère de contrôle ni invisible, espaces resserrés, bords nets. */
export function cleanPersonName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Une personne invitée : son prénom et son nom — ce sont eux qui la saluent dans l'e-mail, nomment son espace et ses résultats. */
export type Invitee = { firstName: string; lastName: string; email: string };

/**
 * Les lignes du formulaire « Inviter des collaborateurs » : une personne par ligne, prénom, nom et adresse obligatoires. Les lignes
 * entièrement vides sont ignorées ; la première erreur est rendue avec le numéro de la ligne, pour que le titulaire la retrouve.
 */
export function validateInvitees(rows: unknown): { ok: true; invitees: Invitee[] } | { ok: false; error: string } {
  if (!Array.isArray(rows)) return { ok: false, error: "Ajoutez au moins une personne à inviter." };
  const filled = rows
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : {}))
    .map((row) => ({ firstName: cleanPersonName(row.firstName), lastName: cleanPersonName(row.lastName), email: normalizeEmail(typeof row.email === "string" ? row.email : "") }))
    .filter((row) => row.firstName || row.lastName || row.email);
  if (filled.length === 0) return { ok: false, error: "Ajoutez au moins une personne à inviter." };
  if (filled.length > MAX_INVITES_AT_ONCE) return { ok: false, error: `${MAX_INVITES_AT_ONCE} invitations à la fois au plus.` };
  const seen = new Set<string>();
  for (const [index, row] of filled.entries()) {
    const where = filled.length > 1 ? ` (personne n° ${index + 1})` : "";
    if (!row.firstName) return { ok: false, error: `Indiquez le prénom${where}.` };
    if (!row.lastName) return { ok: false, error: `Indiquez le nom${where}.` };
    if (row.firstName.length > PERSON_NAME_MAX || row.lastName.length > PERSON_NAME_MAX) return { ok: false, error: `Prénom et nom : ${PERSON_NAME_MAX} caractères au plus${where}.` };
    if (!isEmail(row.email)) return { ok: false, error: `L'adresse e-mail n'est pas valide${where}.` };
    if (seen.has(row.email)) return { ok: false, error: `L'adresse ${row.email} figure deux fois.` };
    seen.add(row.email);
  }
  return { ok: true, invitees: filled };
}

/** « Léa Martin », ou l'adresse e-mail pour une invitation envoyée avant qu'on demande le nom. */
export function inviteeLabel(invitation: { firstName: string | null; lastName: string | null; email: string }): string {
  return [invitation.firstName, invitation.lastName].filter(Boolean).join(" ").trim() || invitation.email;
}

export type InvitationState = "PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED";

export function invitationState(invitation: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now: Date): InvitationState {
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.revokedAt) return "REVOKED";
  return invitation.expiresAt.getTime() <= now.getTime() ? "EXPIRED" : "PENDING";
}

/** Une recherche de pharmacie : au moins trois caractères utiles, sinon rien — on ne laisse pas parcourir la liste des officines. */
export function searchTerm(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f%_\\]+/g, " ").replace(/\s+/g, " ").trim() : "";
  return value.length >= 3 && value.length <= 80 ? value : null;
}

/** « Pharmacie du Port · 06000 Nice » : ce qu'on montre d'une officine à quelqu'un qui n'en fait pas (encore) partie. Rien de plus. */
export function publicPharmacyLabel(pharmacy: { name: string; postalCode: string | null; city: string | null }): string {
  const place = [pharmacy.postalCode, pharmacy.city].filter(Boolean).join(" ");
  return place ? `${pharmacy.name} · ${place}` : pharmacy.name;
}

/** Le poste en toutes lettres, pour les messages. */
export function roleSentence(role: TeamRole): string {
  return { OWNER: "pharmacien titulaire", PHARMACIST: "pharmacien adjoint", TECHNICIAN: "préparateur / préparatrice en pharmacie", STUDENT: "étudiant", SUBSTITUTE: "remplaçant", VIEWER: "en consultation" }[role];
}

/** Une personne, d'un coup d'œil : où elle en est avec son accès. */
export type MemberAccess = "ACTIVE" | "SUSPENDED" | "NEVER_CONNECTED";
export function memberAccess(member: { isActive: boolean; lastLoginAt: Date | null }): MemberAccess {
  if (!member.isActive) return "SUSPENDED";
  return member.lastLoginAt ? "ACTIVE" : "NEVER_CONNECTED";
}

/**
 * Le comptoir revient à la personne connectée sur son PC (core/counter/post-link.ts), ou au choix du titulaire en secours. En
 * prendre un libère ses autres comptoirs, pour que ses conseils et ses ventes ne soient jamais attribués à quelqu'un qui est
 * parti — sauf, pour une prise depuis un PC lié, ceux d'un autre PC lié où sa session est ouverte (core/counter/post-link.ts,
 * `releasedOnTake`). Rend les comptoirs candidats à la libération et dit qui occupait celui qu'on prend.
 */
export function planClaim(posts: { id: string; assignedUserId: string | null }[], postId: string, userId: string): { ok: false; error: string } | { ok: true; release: string[]; previousUserId: string | null; alreadyMine: boolean } {
  const target = posts.find((post) => post.id === postId);
  if (!target) return { ok: false, error: "Comptoir introuvable." };
  const release = posts.filter((post) => post.assignedUserId === userId && post.id !== postId).map((post) => post.id);
  return { ok: true, release, previousUserId: target.assignedUserId && target.assignedUserId !== userId ? target.assignedUserId : null, alreadyMine: target.assignedUserId === userId && release.length === 0 };
}
