import type { ReactNode } from "react";
import { PartnerTabs } from "./partner-tabs";

/**
 * PharmaBoost Partenaires, côté console : les candidatures des laboratoires,
 * les fiches partenaires, leurs marques et catalogues, la diffusion aux
 * officines, les commandes et leads attribués. Aucune donnée patient ici.
 */
export default function PartnersAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PartnerTabs />
      {children}
    </div>
  );
}
