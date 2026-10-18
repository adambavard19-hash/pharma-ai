"use client";

import { useEffect, useRef, useState } from "react";

/** Le filet dégradé en tête des cartes de simulateur (le même que sur le site). */
export const HAIRLINE = "bg-gradient-to-r from-brand-500 via-[#0796b4] to-transparent";

const DURATION_MS = 400;

/** Pendant le décompte, des euros ronds (les centimes défileraient illisibles) ; à l'arrivée, le montant exact. */
export function settle(shown: number, target: number): number {
  return shown === target ? target : Math.round(shown / 100) * 100;
}

/**
 * Un montant qui compte jusqu'à sa nouvelle valeur (≈ 400 ms, ralenti à l'arrivée) au lieu de sauter. Avec « réduire les
 * animations », la valeur arrive d'un coup. Les mises à jour partent toutes d'une image d'animation, jamais du rendu.
 */
export function useCountTo(target: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (reduced) {
        shownRef.current = target;
        setShown(target);
        return;
      }
      start ??= now;
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = t === 1 ? target : from + (target - from) * eased;
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

