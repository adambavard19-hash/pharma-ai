import { ViewSwitch } from "@/components/admin/view-switch";

export type CommunicationView = "campagnes" | "historique" | "modeles" | "relances";

/**
 * Les quatre façons de regarder la communication de PharmaBoost — ce qu'on envoie (campagnes), ce qui est parti (historique), les
 * textes (modèles) et ce qui part tout seul (relances automatiques) — réunies en un seul espace, au même endroit sur chaque page.
 * Les échanges d'UNE officine, eux, sont aussi dans sa fiche (onglet « Communication »).
 */
export function CommunicationViews({ active }: { active: CommunicationView }) {
  return (
    <ViewSwitch
      label="Vues de la communication"
      active={active}
      items={[
        { key: "campagnes", label: "Campagnes", href: "/admin/campagnes" },
        { key: "historique", label: "Historique", href: "/admin/communications" },
        { key: "modeles", label: "Modèles d'e-mails", href: "/admin/emails/modeles" },
        { key: "relances", label: "Relances automatiques", href: "/admin/relances" },
      ]}
    />
  );
}
