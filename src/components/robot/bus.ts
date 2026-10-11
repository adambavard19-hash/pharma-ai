"use client";

import { useEffect, useState } from "react";
import type { RobotMood } from "@/core/robot/mascot";

/**
 * Le fil du robot : n'importe quel écran peut lui faire signe sans le connaître — un quiz réussi dans l'Académie, un
 * badge gagné, un challenge franchi. `emitRobotMood("celebrate")` suffit ; chaque robot qui écoute ce canal (prop
 * `listen`) prend l'humeur un instant, puis revient à la sienne.
 *
 * Un simple événement du navigateur : rien n'est gardé, rien ne part au serveur, et un écran sans robot ne perd rien.
 */

export const ROBOT_EVENT = "pharmaboost:robot";
export const DEFAULT_CHANNEL = "app";

export type RobotSignal = { mood: RobotMood; channel: string; holdMs: number; at: number };

/** Combien de temps l'humeur d'un signal reste affichée, par défaut. */
export function defaultHold(mood: RobotMood): number {
  if (mood === "celebrate") return 3200;
  if (mood === "happy") return 2600;
  return 4000;
}

/** Fait signe au robot. Sans effet côté serveur (pas de fenêtre). */
export function emitRobotMood(mood: RobotMood, options: { channel?: string; holdMs?: number } = {}): void {
  if (typeof window === "undefined") return;
  const detail: RobotSignal = { mood, channel: options.channel ?? DEFAULT_CHANNEL, holdMs: options.holdMs ?? defaultHold(mood), at: Date.now() };
  window.dispatchEvent(new CustomEvent<RobotSignal>(ROBOT_EVENT, { detail }));
}

/**
 * Le dernier signal reçu sur un canal, tant qu'il dure (null sinon). `channel` à null : on n'écoute pas.
 * Un nouveau signal remplace le précédent et relance son minuteur.
 */
export function useRobotSignal(channel: string | null): RobotSignal | null {
  const [signal, setSignal] = useState<RobotSignal | null>(null);

  useEffect(() => {
    if (!channel) return;
    const onSignal = (event: Event) => {
      const detail = (event as CustomEvent<RobotSignal>).detail;
      if (detail && detail.channel === channel) setSignal(detail);
    };
    window.addEventListener(ROBOT_EVENT, onSignal);
    return () => window.removeEventListener(ROBOT_EVENT, onSignal);
  }, [channel]);

  useEffect(() => {
    if (!signal) return;
    const id = setTimeout(() => setSignal(null), signal.holdMs);
    return () => clearTimeout(id);
  }, [signal]);

  return signal;
}

/** Pour un écran qui veut faire réagir le robot : `const robot = useRobot(); robot.celebrate();`. */
export function useRobot(channel: string = DEFAULT_CHANNEL) {
  return {
    emit: (mood: RobotMood, holdMs?: number) => emitRobotMood(mood, { channel, holdMs }),
    happy: () => emitRobotMood("happy", { channel }),
    celebrate: () => emitRobotMood("celebrate", { channel }),
    concerned: () => emitRobotMood("concerned", { channel }),
  };
}
