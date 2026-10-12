"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CounterRobotLook } from "@/core/robot/counter-look";

/**
 * Le robot de la personne connectée (1 robot pour 1 espace, core/robot/counter-look.ts), pour tout le logiciel : « Nouvelle
 * vente », l'écran de vente, le menu et le compagnon du coin prennent sa couleur et son accessoire — les mêmes que l'île du
 * comptoir où elle est connectée. Hors du logiciel (site, mobile) : rien, le robot de la marque.
 */
const CounterLookContext = createContext<CounterRobotLook | null>(null);

export function CounterLookProvider({ value, children }: { value: CounterRobotLook | null; children: ReactNode }) {
  return <CounterLookContext.Provider value={value}>{children}</CounterLookContext.Provider>;
}

export function useCounterLook(): CounterRobotLook | null {
  return useContext(CounterLookContext);
}
