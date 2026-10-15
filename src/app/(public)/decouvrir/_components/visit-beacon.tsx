"use client";

import { useEffect } from "react";

/** Une fois par ouverture du site (pas à chaque page) : le serveur compte un visiteur par adresse IP. */
export function VisitBeacon() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("pb-visite")) return;
      sessionStorage.setItem("pb-visite", "1");
    } catch {
      // Stockage bloqué (navigation privée) : on signale quand même, le serveur ne compte de toute façon qu'une fois l'adresse.
    }
    fetch("/api/public/visite", { method: "POST", keepalive: true }).catch(() => {});
  }, []);
  return null;
}
