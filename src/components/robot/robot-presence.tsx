"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * 1 robot pour 1 espace (core/robot/single-robot.ts) : sur le navigateur lié au poste du comptoir, quand le logiciel
 * PharmaBoost installé y dessine déjà le robot, l'espace pharmacie n'en dessine aucun — ni dans l'île de l'en-tête, ni au
 * menu, sur « Nouvelle vente », dans la barre de vente, au coin ou dans les listes vides. Seul le dessin s'efface : l'île
 * reste (sans robot) avec les alertes, leurs gestes et la discussion, et le menu garde le compte des alertes. Décidé côté
 * serveur par le layout. Hors du logiciel (pas de fournisseur) : le robot est là.
 */
const RobotPresenceContext = createContext<boolean>(true);

export function RobotPresenceProvider({ inBrowser, children }: { inBrowser: boolean; children: ReactNode }) {
  return <RobotPresenceContext.Provider value={inBrowser}>{children}</RobotPresenceContext.Provider>;
}

/** Faux : le robot vit dans le logiciel installé sur ce PC, la page n'en dessine pas. */
export function useRobotInBrowser(): boolean {
  return useContext(RobotPresenceContext);
}
