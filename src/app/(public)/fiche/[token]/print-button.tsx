"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Imprimer / enregistrer en PDF. Avec `autoPrint`, la boîte d'impression
 * s'ouvre à l'arrivée : c'est le lien « Télécharger / imprimer » de l'e-mail.
 */
export function PrintButton({ autoPrint = false }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [autoPrint]);

  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()} leadingIcon={<Printer className="size-4" />}>
      Télécharger / imprimer
    </Button>
  );
}
