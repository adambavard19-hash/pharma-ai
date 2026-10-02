"use client";

import { LinkTabs } from "@/components/ui/tabs";

/** Les rubriques de PharmaBoost Partenaires dans la console. */
export function PartnerTabs() {
  return (
    <LinkTabs
      basePath="/admin/partenaires"
      items={[
        { key: "candidatures", label: "Candidatures", href: "/admin/partenaires/candidatures" },
        { key: "liste", label: "Partenaires", href: "/admin/partenaires/liste" },
        { key: "marques", label: "Marques", href: "/admin/partenaires/marques" },
        { key: "catalogues", label: "Catalogues", href: "/admin/partenaires/catalogues" },
        { key: "integrations", label: "Intégrations", href: "/admin/partenaires/integrations" },
        { key: "offres", label: "Offres", href: "/admin/partenaires/offres" },
        { key: "commandes", label: "Commandes & leads", href: "/admin/partenaires/commandes" },
        { key: "statistiques", label: "Statistiques", href: "/admin/partenaires/statistiques" },
      ]}
    />
  );
}
