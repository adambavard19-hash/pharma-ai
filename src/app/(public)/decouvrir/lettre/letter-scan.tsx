"use client";

import { useEffect } from "react";
import { countLetterScanAction } from "@/server/actions/site-nudge";

/** Compte une fois l'ouverture de la page depuis le QR code de la lettre (une fois par onglet). */
export function LetterScan() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem("pb-lettre-comptee")) return;
      window.sessionStorage.setItem("pb-lettre-comptee", "1");
    } catch {
      // mémoire du navigateur indisponible : on compte quand même
    }
    void countLetterScanAction();
  }, []);
  return null;
}
