"use client";

import { LinkTabs } from "@/components/ui/tabs";

/**
 * Les trois vues de « Laboratoires & gammes » : les gammes privilégiées par
 * univers, les challenges des laboratoires, et la mise en avant / l'écart des
 * marques (règles du moteur). Une seule entrée dans Paramètres, trois écrans.
 */
export function LabTabs({ canManagePrograms, canManageBrands }: { canManagePrograms: boolean; canManageBrands: boolean }) {
  return (
    <LinkTabs
      basePath="/parametres/laboratoires"
      items={[
        ...(canManagePrograms
          ? [
              { key: "gammes", label: "Gammes privilégiées", href: "/parametres/laboratoires/gammes" },
              { key: "challenges", label: "Challenges", href: "/parametres/laboratoires/challenges" },
            ]
          : []),
        ...(canManageBrands ? [{ key: "marques", label: "Mettre en avant · écarter" }] : []),
      ]}
    />
  );
}
