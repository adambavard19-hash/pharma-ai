import { fail, type ActionResult } from "./types";

/**
 * La barrière de l'officine de démonstration commerciale.
 *
 * Quelques gestes ont un effet HORS de l'officine — passer une commande à un
 * partenaire, écrire à l'équipe PharmaBoost, ouvrir le portail de paiement,
 * chercher des photos sur Internet, changer un mot de passe. En démonstration,
 * ils sont refusés avant tout effet, avec une phrase que le présentateur peut
 * lire à voix haute. Le reste de l'application (analyse, conseils, stock de
 * démonstration) se joue normalement.
 */
export const DEMO_REFUSAL = "Mode démo : ce geste est désactivé, rien n'est envoyé ni commandé en dehors de la démonstration.";

/** `null` quand le geste est permis ; sinon le refus à renvoyer tel quel. */
export function refuseInDemo(session: { scope: { isDemo?: boolean } }, message: string = DEMO_REFUSAL): ActionResult<never> | null {
  return session.scope.isDemo ? fail(message) : null;
}
