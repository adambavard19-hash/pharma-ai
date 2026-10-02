"use client";

import { useEffect } from "react";
import { recordPartnerViewAction } from "@/server/actions/partners";

/** Ce qui a déjà été compté dans cet onglet, au cas où le stockage de session est indisponible. */
const counted = new Set<string>();

/**
 * Compte une consultation de la page d'une marque (attribution VIEW), quand on
 * y arrive depuis une carte du comptoir ou depuis le catalogue. Une seule fois
 * par onglet : recharger la page ne compte pas une seconde consultation.
 * Rien d'autre que la marque, la provenance et l'univers n'est transmis.
 */
export function ViewTracker({ brandId, source, universe }: { brandId: string; source: "COUNTER_CARD" | "CATALOG"; universe: string | null }) {
  useEffect(() => {
    const key = `pharmaboost:partenaire-vue:${brandId}:${source}:${universe ?? ""}`;
    if (counted.has(key)) return;
    counted.add(key);
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Stockage de session indisponible (navigation privée stricte) : la garde en mémoire suffit pour cet affichage.
    }
    void recordPartnerViewAction({ brandId, source, universe });
  }, [brandId, source, universe]);
  return null;
}
