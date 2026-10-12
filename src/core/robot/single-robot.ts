/**
 * 1 robot pour 1 espace (demande du fondateur, 12-13 oct. 2026) : sur le PC du comptoir, le robot est celui du logiciel
 * PharmaBoost installé (l'île de l'agent, page /poste/ile, ou sa bannière). Si l'espace PharmaBoost est ouvert dans le
 * navigateur de CE PC, il n'en dessine pas un deuxième : ni dans l'île de l'en-tête, ni au menu, au coin, sur « Nouvelle
 * vente » ou dans la barre de vente ; et l'île de l'écran de vente, que le logiciel joue déjà, n'est pas rejouée. Seul le
 * DESSIN s'efface : l'île de l'en-tête reste, sans robot, avec ce qu'il signale (paiement, demandes d'accès, primes…) et
 * ses gestes, la discussion et le dépôt du stock ; le compte des alertes reste au menu.
 *
 * Comment on reconnaît « ce PC », EXACTEMENT : le navigateur porte le cookie signé que pose le lien ouvert par le poste
 * lui-même (core/counter/post-link.ts). Le PC du bureau du titulaire, un Mac, un téléphone n'ont jamais ce cookie : ils
 * gardent leur robot, même derrière la même box. Le robot de l'espace s'efface donc seulement si :
 *  - le cookie désigne un poste de la pharmacie de la SESSION (un cookie d'une autre pharmacie ne vaut rien ici) ;
 *  - ce poste existe, est relié, n'est pas retiré ;
 *  - il DESSINE le robot en ce moment : son dernier signe de vie disant « île » ou « bannière » a moins de 3 minutes
 *    (l'ancienne fenêtre, la notification Windows seule, un agent arrêté ne dessinent rien : l'espace garde le sien).
 *
 * Module pur : les règles se testent sans base ni navigateur.
 */

/** Un poste vu depuis moins longtemps que ça est « allumé » : il donne signe de vie chaque minute (agent/src/index.ts). */
export const POST_PRESENCE_MS = 3 * 60_000;

/** Les fenêtres du poste qui dessinent le robot (agent/src/notice-center.ts) : l'île (WebView2) et la bannière (GDI+). */
const ROBOT_WINDOWS: ReadonlySet<string> = new Set(["ile", "banniere"]);

/**
 * Le poste dessine-t-il le robot, d'après la fenêtre qu'il dit afficher à son signe de vie (agent 0.10.2 et suivants) ?
 * L'île ou la bannière : oui. L'ancienne fenêtre (réglée, ou retombée en secours), la notification Windows seule, rien
 * (hors Windows) : non. Un agent plus ancien ne dit rien : non — deux robots comme avant, plutôt qu'un PC sans robot.
 */
export function postDrawsRobot(fenetre: unknown): boolean {
  return typeof fenetre === "string" && ROBOT_WINDOWS.has(fenetre);
}

/** Ce que l'espace sait du poste auquel ce navigateur est lié (lu dans SA pharmacie). */
export type LinkedPost = { pharmacyId: string; revokedAt: Date | null; pairedAt: Date | null; robotShownAt: Date | null };

/**
 * Le robot vit-il déjà sur ce PC (le logiciel PharmaBoost installé) ? Oui seulement si ce navigateur est lié (cookie
 * signé, déjà vérifié) à un poste NON retiré de la pharmacie de la session, qui dessine le robot depuis moins de
 * 3 minutes. Dans le doute (pas de lien, autre pharmacie, poste retiré, éteint ou sans robot), non : l'espace garde le sien.
 */
export function robotLivesOnLinkedPost(input: { sessionPharmacyId: string; link: { postId: string; pharmacyId: string } | null; post: LinkedPost | null; now: Date }): boolean {
  const { link, post } = input;
  if (!link || !post || !input.sessionPharmacyId) return false;
  if (link.pharmacyId !== input.sessionPharmacyId || post.pharmacyId !== input.sessionPharmacyId) return false;
  if (post.revokedAt || !post.pairedAt || !post.robotShownAt) return false;
  return post.robotShownAt.getTime() >= input.now.getTime() - POST_PRESENCE_MS;
}
