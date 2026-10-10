/**
 * Les comptoirs d'une pharmacie, et à qui ils appartiennent.
 *
 * Un comptoir est un poste de caisse (un ordinateur avec sa douchette). Chaque comptoir est un espace à part : ses bips, ses ventes,
 * ses conseils ne regardent que lui — et la personne à qui il est attribué. Deux collaborateurs de la même pharmacie ne se voient pas
 * travailler ; le titulaire, qui a lui aussi son comptoir, n'est pas dérangé par les autres.
 *
 * Qui voit quoi, sans réglage :
 *  - un comptoir attribué à quelqu'un est le sien ;
 *  - une pharmacie qui n'a qu'UN comptoir n'a rien à attribuer : il est à tout le monde ;
 *  - une pharmacie à plusieurs comptoirs dont aucun n'est attribué à la personne : elle ne voit aucune vente en direct, et on lui dit
 *    pourquoi (le titulaire attribue les comptoirs dans « Mes comptoirs »).
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

export function resolveMyComptoirs(posts: ComptoirPost[], userId: string): MyComptoirs {
  const mine = posts.filter((post) => post.assignedUserId === userId);
  if (mine.length > 0) return { postIds: mine.map((post) => post.id), mode: "MINE" };
  if (posts.length === 1) return { postIds: [posts[0].id], mode: "ONLY_ONE" };
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

/** Pourquoi une personne ne voit aucune vente en direct, dit simplement. */
export function noComptoirMessage(mode: MyComptoirs["mode"], canAssign: boolean): string | null {
  if (mode !== "NONE") return null;
  return canAssign
    ? "Aucun comptoir ne vous est attribué. Attribuez-vous un comptoir dans « Mes comptoirs » : vous ne verrez que ses délivrances."
    : "Aucun comptoir ne vous est attribué. Demandez au titulaire de vous en attribuer un : vous verrez alors les délivrances de votre comptoir.";
}
