/**
 * Qui agit sur un commercial ou sur une candidature : un administrateur de la
 * console, ou le directeur commercial.
 *
 * Les fonctions historiques recevaient l'identifiant d'un administrateur (une
 * chaîne) : cette forme reste valable. Le directeur passe un acteur complet,
 * toujours tiré de SA session, jamais d'un formulaire.
 *
 * Module pur : ni base, ni serveur. Il vit à part pour rester utilisable (et
 * simulable) sans tirer les services qui l'emploient.
 */
export type RepActor = { type: "ADMIN" | "DIRECTOR"; id: string; label: string };

/** Un identifiant d'administrateur (appelants historiques), un acteur complet, ou personne (envoi automatique). */
export type RepActorInput = string | RepActor | null;

/** Les champs d'identité d'une ligne d'audit (`recordAudit`) pour cet acteur. */
export function auditIdentity(actor: RepActorInput): { platformAdminId?: string | null; salesDirectorId?: string } {
  if (actor === null) return { platformAdminId: null };
  if (typeof actor === "string") return { platformAdminId: actor };
  return actor.type === "DIRECTOR" ? { salesDirectorId: actor.id } : { platformAdminId: actor.id };
}

/**
 * L'historique d'une candidature ne garde qu'une colonne d'auteur
 * (`platformAdminId`, sans clé étrangère). Un geste du directeur y est écrit
 * `director:<id>` : l'identifiant d'un administrateur reste tel quel, et les
 * deux ne se confondent jamais (un identifiant de base ne contient pas « : »).
 */
export const DIRECTOR_EVENT_PREFIX = "director:";

export function applicationEventActorId(actor: RepActorInput): string | null {
  if (actor === null) return null;
  if (typeof actor === "string") return actor;
  return actor.type === "DIRECTOR" ? `${DIRECTOR_EVENT_PREFIX}${actor.id}` : actor.id;
}

/** Sépare les auteurs d'un historique : administrateurs d'un côté, directeurs de l'autre. */
export function splitEventActors(values: (string | null)[]): { adminIds: string[]; directorIds: string[] } {
  const adminIds = new Set<string>();
  const directorIds = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (value.startsWith(DIRECTOR_EVENT_PREFIX)) directorIds.add(value.slice(DIRECTOR_EVENT_PREFIX.length));
    else adminIds.add(value);
  }
  return { adminIds: [...adminIds], directorIds: [...directorIds] };
}
