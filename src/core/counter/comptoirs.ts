/**
 * Les comptoirs d'une pharmacie, et à qui ils appartiennent.
 *
 * Un comptoir est un poste de caisse (un ordinateur avec sa douchette). Chaque comptoir est un espace à part : ses bips, ses ventes,
 * ses conseils ne regardent que lui — et la personne connectée à PharmaBoost sur ce PC. Personne ne choisit de comptoir : il revient
 * tout seul à la personne qui ouvre son espace dans le navigateur lié au poste (core/counter/post-link.ts). Deux collaborateurs de la
 * même pharmacie ne se voient pas travailler ; le titulaire, qui a lui aussi son comptoir, n'est pas dérangé par les autres.
 *
 * Qui voit quoi, sans réglage :
 *  - un comptoir où la personne est connectée est le sien ;
 *  - une pharmacie qui n'a qu'UN comptoir n'a rien à attribuer : il est à tout le monde ;
 *  - une pharmacie à plusieurs comptoirs, aucun pour la personne : elle ne voit aucune vente en direct, et on lui dit comment
 *    faire (ouvrir son espace depuis le PC de son comptoir).
 *
 * Module pur.
 */

export type ComptoirPost = { id: string; label: string | null; hostname: string; assignedUserId: string | null };

/** Le nom que le titulaire a donné au comptoir ; à défaut, le nom de la machine. */
export function comptoirName(post: Pick<ComptoirPost, "label" | "hostname">): string {
  return post.label?.trim() || post.hostname.trim() || "Comptoir";
}

export type MyComptoirs = {
  /** Les comptoirs dont cette personne voit les ventes. */
  postIds: string[];
  mode: "MINE" | "ONLY_ONE" | "NONE";
};

/**
 * Sur le navigateur lié à un poste (`thisPcPostId`, core/counter/post-link.ts), l'écran est celui de CE comptoir et de lui
 * seul — même si la personne est connectée sur un autre PC lié (le titulaire qui a installé chaque poste depuis son espace,
 * un compte partagé) : chaque PC montre ses ventes, jamais celles de l'autre. Un poste absent de la liste (autre pharmacie,
 * retiré) ne compte pas.
 */
export function resolveMyComptoirs(posts: ComptoirPost[], userId: string, thisPcPostId: string | null = null): MyComptoirs {
  if (thisPcPostId && posts.some((post) => post.id === thisPcPostId)) return { postIds: [thisPcPostId], mode: "MINE" };
  const mine = posts.filter((post) => post.assignedUserId === userId);
  if (mine.length > 0) return { postIds: mine.map((post) => post.id), mode: "MINE" };
  // Un seul comptoir dans la pharmacie : il est à tout le monde seulement s'il n'est à personne. Celui d'un collègue
  // (« Poste 01 · Donna ») reste le sien : on ne le montre pas, ni son nom (fondateur, 15 oct. 2026).
  if (posts.length === 1 && !posts[0].assignedUserId) return { postIds: [posts[0].id], mode: "ONLY_ONE" };
  return { postIds: [], mode: "NONE" };
}

/** « Comptoir 2 · Léa Martin » : le nom du comptoir, puis son collaborateur, ou « non attribué ». */
export function comptoirTitle(post: Pick<ComptoirPost, "label" | "hostname">, assigneeName: string | null): string {
  return `${comptoirName(post)} · ${assigneeName ?? "non attribué"}`;
}

export const COMPTOIR_NAME_MAX = 40;

export function parseComptoirName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "";
  if (value.length < 2) return { ok: false, error: "Donnez un nom au comptoir (2 caractères au moins)." };
  if (value.length > COMPTOIR_NAME_MAX) return { ok: false, error: `Le nom est trop long (${COMPTOIR_NAME_MAX} caractères au plus).` };
  return { ok: true, value };
}

/** Pourquoi une personne ne voit aucune vente en direct, et comment faire, dit simplement. */
export function noComptoirMessage(mode: MyComptoirs["mode"], canAssign: boolean): string | null {
  if (mode !== "NONE") return null;
  const how = "Sur l'ordinateur de votre comptoir, cliquez sur l'icône PharmaBoost près de l'horloge, puis « Ouvrir mon espace PharmaBoost » : ce comptoir devient le vôtre, ses délivrances arrivent ici.";
  return canAssign ? `${how} Vous voyez aussi qui est où dans Paramètres → « Postes du comptoir ».` : how;
}
