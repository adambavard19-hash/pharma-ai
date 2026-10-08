"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Rafraîchit la page à intervalle régulier, tant qu'elle est visible : une réponse arrive sans qu'il faille recharger.
 * Ce qui est en train d'être tapé n'est pas touché (seuls les composants serveur se rechargent).
 */
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
