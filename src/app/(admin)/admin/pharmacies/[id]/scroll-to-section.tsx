"use client";

import { useEffect } from "react";

/** Descend à une section de la page à l'ouverture (une ancienne adresse `?onglet=paiements` mène à « Paiements », dans « Facturation »). */
export function ScrollToSection({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [id]);
  return null;
}
