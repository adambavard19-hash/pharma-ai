import "server-only";
import { isDemoMode } from "@/config/env";

/**
 * La frontière entre le jeu de démonstration et l'activité réelle.
 *
 * Le jeu fictif reste en base — il sert aux tests et à la démonstration —
 * mais il ne doit jamais se mêler au parcours réel : ni dans les listes, ni
 * dans le pilotage du titulaire. Hors environnement démo, toute requête sur
 * l'activité (patients, ordonnances, conseils, ventes, plans, rappels)
 * exclut donc ce qui est marqué démo. Le catalogue et le stock, eux, sont
 * l'outil de travail de l'officine : ils ne sont pas filtrés.
 */
export function activityScope(): { isDemo?: false } {
  return isDemoMode() ? {} : { isDemo: false };
}

/**
 * Ce qu'un nouvel enregistrement doit porter.
 *
 * Démo seulement dans l'environnement démo, ou dans une officine qui est
 * elle-même une officine de démonstration. Une vraie ordonnance dans une
 * vraie officine n'est jamais marquée démo — quel que soit le réglage global.
 */
export function recordIsDemo(pharmacyIsDemo: boolean): boolean {
  return isDemoMode() || pharmacyIsDemo;
}
