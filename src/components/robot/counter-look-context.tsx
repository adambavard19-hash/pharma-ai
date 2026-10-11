"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CounterRobotLook } from "@/core/robot/counter-look";

/**
 * Le robot du comptoir de la personne connectée, pour tout le logiciel : « Nouvelle vente », l'écran de vente et le
 * compagnon du coin prennent la même couleur et le même accessoire. Hors du logiciel (site, mobile) : rien, le robot de la marque.
 */
const CounterLookContext = createContext<CounterRobotLook | null>(null);

export function CounterLookProvider({ value, children }: { value: CounterRobotLook | null; children: ReactNode }) {
  return <CounterLookContext.Provider value={value}>{children}</CounterLookContext.Provider>;
}

export function useCounterLook(): CounterRobotLook | null {
  return useContext(CounterLookContext);
}
