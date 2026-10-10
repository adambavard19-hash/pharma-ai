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
export const INVITABLE_ROLES = ["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
export const isInvitableRole = (value: unknown): value is InvitableRole => typeof value === "string" && (INVITABLE_ROLES as readonly string[]).includes(value);

/** Les postes qu'un collaborateur peut déclarer en demandant à rejoindre : jamais titulaire, jamais « consultation » d'office. */
export const DECLARABLE_ROLES = ["PHARMACIST", "TECHNICIAN", "STUDENT"] as const;
export type DeclarableRole = (typeof DECLARABLE_ROLES)[number];
export const isDeclarableRole = (value: unknown): value is DeclarableRole => typeof value === "string" && (DECLARABLE_ROLES as readonly string[]).includes(value);

const EMAIL = /^[^\s@,;<>()[\]]+@[^\s@,;<>()[\]]+\.[^\s@,;<>()[\]]{2,}$/;
export const isEmail = (value: string): boolean => value.length <= 160 && EMAIL.test(value);
export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

/** Des adresses collées en vrac (virgules, points-virgules, retours à la ligne, « Nom <adresse> ») : celles qui sont valides, sans doublon, et celles qui ne le sont pas. */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\n\r,;\t ]+/)) {
    const token = raw.replace(/^[<"'(]+|[>"')]+$/g, "").trim();
    if (!token) continue;
    const email = normalizeEmail(token);
    if (seen.has(email)) continue;
    seen.add(email);
    (isEmail(email) ? valid : invalid).push(email);
  }
  return { valid, invalid };
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
  return { OWNER: "titulaire", PHARMACIST: "pharmacien", TECHNICIAN: "préparateur", STUDENT: "étudiant", VIEWER: "en consultation" }[role];
}

/** Une personne, d'un coup d'œil : où elle en est avec son accès. */
export type MemberAccess = "ACTIVE" | "SUSPENDED" | "NEVER_CONNECTED";
export function memberAccess(member: { isActive: boolean; lastLoginAt: Date | null }): MemberAccess {
  if (!member.isActive) return "SUSPENDED";
  return member.lastLoginAt ? "ACTIVE" : "NEVER_CONNECTED";
}

/**
 * Identifier le collaborateur au comptoir sans réinstaller : « Je travaille ici ». Une personne ne peut être qu'à UN comptoir à la fois :
 * en prendre un libère ses autres comptoirs, pour que ses conseils et ses ventes ne soient jamais attribués à quelqu'un qui est parti.
 * Rend les comptoirs à libérer et dit qui occupait celui qu'on prend.
 */
export function planClaim(posts: { id: string; assignedUserId: string | null }[], postId: string, userId: string): { ok: false; error: string } | { ok: true; release: string[]; previousUserId: string | null; alreadyMine: boolean } {
  const target = posts.find((post) => post.id === postId);
  if (!target) return { ok: false, error: "Comptoir introuvable." };
  const release = posts.filter((post) => post.assignedUserId === userId && post.id !== postId).map((post) => post.id);
  return { ok: true, release, previousUserId: target.assignedUserId && target.assignedUserId !== userId ? target.assignedUserId : null, alreadyMine: target.assignedUserId === userId && release.length === 0 };
}
