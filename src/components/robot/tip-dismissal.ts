"use client";

import { useSyncExternalStore } from "react";
import { TIME_ZONE } from "@/config/constants";

/**
 * Ce que la personne a écarté aujourd'hui (« Plus tard ») dans la bulle du robot, gardé dans ce navigateur seulement :
 * une commodité, pas une donnée. Partagé par le robot de « Nouvelle vente » et le petit compagnon des autres pages,
 * pour qu'une phrase écartée d'un côté ne revienne pas de l'autre.
 */

const DISMISS_EVENT = "pharmaboost:robot-ecarte";

function parisDay(now = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
const dismissKey = () => `pharmaboost:robot-ecarte:${parisDay()}`;

function readDismissed(): string {
  try {
    return window.localStorage.getItem(dismissKey()) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribeDismissed(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}

function safeParse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function dismissRobotTip(key: string): void {
  try {
    const current = new Set<string>(safeParse(readDismissed()));
    current.add(key);
    window.localStorage.setItem(dismissKey(), JSON.stringify([...current]));
  } catch {
    // Stockage indisponible : la phrase reviendra au prochain chargement, rien de grave.
  }
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

/** Les clés écartées aujourd'hui (vide au rendu serveur). */
export function useDismissedTips(): string[] {
  const raw = useSyncExternalStore(subscribeDismissed, readDismissed, () => "[]");
  return safeParse(raw);
}
