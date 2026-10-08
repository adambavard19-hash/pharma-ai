import type { ReactNode } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PartnerTabs } from "./partner-tabs";

/**
 * PharmaBoost Partenaires, côté console : les candidatures des laboratoires,
 * les fiches partenaires, leurs marques et catalogues, la diffusion aux
 * officines, les commandes et leads attribués. Aucune donnée patient ici.
 *
 * L'en-tête de l'espace porte le titre principal ; le titre propre à chaque
 * rubrique, écrit par sa page, est ramené à la taille d'un titre de section
 * pour que la hiérarchie se lise d'un coup d'œil.
 */
export default function PartnersAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Partenaires"
        description="Candidatures des laboratoires, fiches partenaires, marques et catalogues, diffusion aux officines, commandes et leads attribués."
      />
      <PartnerTabs />
      <div className="space-y-6 [&_h1]:text-[20px] [&_h1]:leading-7">{children}</div>
    </div>
  );
}
