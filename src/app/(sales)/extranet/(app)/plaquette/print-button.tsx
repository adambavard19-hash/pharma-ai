"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * « Télécharger en PDF » : la fenêtre d'impression du navigateur, qui enregistre la plaquette en PDF A4. La feuille de style
 * d'impression cache l'extranet (en-tête, menus, cette barre) : seules les six feuilles partent, avec les coordonnées du commercial.
 */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} leadingIcon={<Download className="size-[18px]" />}>
      Télécharger en PDF
    </Button>
  );
}
