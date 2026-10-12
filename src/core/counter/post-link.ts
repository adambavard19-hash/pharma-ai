/**
 * Le lien entre le navigateur du PC du comptoir et SON poste (demande du fondateur, 13 oct. 2026 : « il se connecte
 * directement à son espace et c'est tout ; 1 robot pour 1 espace »). Plus aucun comptoir à choisir : le comptoir revient
 * tout seul à la personne connectée sur CE PC.
 *
 *  1. Le poste (authentifié par sa clé, /api/agent/espace) demande un lien : un jeton aléatoire de 256 bits, à usage
 *     unique, valable 10 minutes, dont seule l'empreinte est gardée (CounterPost.linkTokenHash). Un nouveau lien remplace
 *     le précédent.
 *  2. Il l'ouvre UNE fois dans le navigateur par défaut du PC (au démarrage s'il ne l'a jamais fait, ou par l'icône près de
 *     l'horloge → « Ouvrir mon espace PharmaBoost »). La page /comptoir/lier brûle le jeton, pose un cookie httpOnly,
 *     SameSite=Lax, Secure en ligne, de longue durée, SIGNÉ (HMAC du secret de l'application) qui désigne le poste et sa
 *     pharmacie, puis mène à « Nouvelle vente » (la connexion d'abord si besoin : elle y ramène).
 *  3. Dans l'espace pharmacie, ce cookie — s'il désigne un poste NON retiré de la pharmacie de la SESSION — attribue ce
 *     poste à la personne connectée, sans clic ; la précédente le perd. Ses comptoirs tenus d'une attribution de secours
 *     sont libérés, pas celui d'un autre PC lié où sa session est ouverte (`releasedOnTake`) : un PC, un comptoir, sans
 *     bascule. Se déconnecter sur ce PC le libère. Rien n'est écrit quand rien ne change. Un cookie falsifié, d'une autre
 *     pharmacie ou d'un poste retiré ne fait rien.
 *  4. Sur ce navigateur, « Nouvelle vente » est l'écran de CE comptoir seulement (core/counter/comptoirs.ts).
 *
 * Le cookie n'ouvre RIEN à lui seul : sans session de la même pharmacie, il est ignoré. Module pur.
 */

/** Durée de vie d'un lien : le temps d'ouvrir le navigateur, pas plus. */
export const POST_LINK_TTL_MS = 10 * 60_000;
/** Le chemin que le poste ouvre, suivi de `?jeton=…`. */
export const POST_LINK_PATH = "/comptoir/lier";
export const POST_LINK_COOKIE = "pharma_poste";
/** 400 jours : le plafond que les navigateurs acceptent pour un cookie (au-delà, ils le raccourcissent d'eux-mêmes). */
export const POST_LINK_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

/** Un jeton de lien tel que le serveur les émet (base64url de 32 octets) : rien d'autre n'est cherché en base. */
export function isPostLinkToken(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(raw);
}

export type PostLink = { postId: string; pharmacyId: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COOKIE_VERSION = "v1";

/** Ce que la signature couvre : la version, le poste, la pharmacie. */
export function postLinkPayload(link: PostLink): string | null {
  if (!ID.test(link.postId) || !ID.test(link.pharmacyId)) return null;
  return `${COOKIE_VERSION}.${link.postId}.${link.pharmacyId}`;
}

/** « v1.<poste>.<pharmacie>.<signature> » → ses parties ; null si la forme n'y est pas (la signature se vérifie à part). */
export function parsePostLinkCookie(value: string | null | undefined): (PostLink & { payload: string; signature: string }) | null {
  if (!value || value.length > 300) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== COOKIE_VERSION) return null;
  const [, postId, pharmacyId, signature] = parts;
  if (!ID.test(postId) || !ID.test(pharmacyId) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  return { postId, pharmacyId, payload: `${COOKIE_VERSION}.${postId}.${pharmacyId}`, signature };
}

/**
 * Faut-il attribuer le poste lié à la personne connectée ? Seulement si le lien est de la pharmacie de la session, que
 * le poste (lu dans cette pharmacie) existe, est relié et non retiré, que la personne prend des ventes, et qu'il n'est
 * pas déjà à elle. Sinon rien n'est écrit.
 */
export function shouldTakeLinkedPost(input: { sessionPharmacyId: string; userId: string; canTakeSales: boolean; link: PostLink | null; post: { pharmacyId: string; revokedAt: Date | null; pairedAt: Date | null; assignedUserId: string | null } | null }): boolean {
  const { link, post } = input;
  if (!input.canTakeSales || !link || !post || !input.userId) return false;
  if (link.pharmacyId !== input.sessionPharmacyId || post.pharmacyId !== input.sessionPharmacyId) return false;
  if (post.revokedAt || !post.pairedAt) return false;
  return post.assignedUserId !== input.userId;
}

/** Les traces du journal qui changent la personne d'un comptoir (le comptoir est l'entité de la trace). */
export const COMPTOIR_ASSIGNMENT_ACTIONS = ["counter_post.taken", "counter_post.assigned", "counter_post.claimed", "counter_post.released"] as const;

/**
 * Prendre le comptoir de CE PC : parmi les autres comptoirs de la personne, lesquels libérer ? Ceux qu'elle tient d'une
 * attribution de secours (« Mes comptoirs »), de l'ancienne « Je travaille ici » ou sans trace : elle n'y est plus. Jamais
 * ceux dont la DERNIÈRE trace (lue dans le journal de sa pharmacie) dit qu'elle les a pris elle-même depuis le navigateur
 * lié d'un autre PC : sa session y est ouverte (le titulaire qui a installé chaque poste depuis son espace, un compte partagé
 * par l'équipe). Les libérer ferait passer le comptoir d'un PC à l'autre à chaque page affichée : l'écran d'un PC
 * montrerait les ventes de l'autre, ses bips partiraient sans collaborateur. Ce comptoir-là se libère quand une autre
 * personne ouvre son espace sur ce PC, quand elle s'y déconnecte, ou par le titulaire.
 */
export function releasedOnTake(candidates: string[], lastTraces: ReadonlyMap<string, { action: string; userId: string | null } | null>, userId: string): string[] {
  return candidates.filter((postId) => {
    const trace = lastTraces.get(postId);
    return !(trace && trace.action === "counter_post.taken" && trace.userId === userId);
  });
}
