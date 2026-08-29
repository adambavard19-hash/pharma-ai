"use client";

import { LinkTabs } from "@/components/ui/tabs";

/**
 * Les onglets de Paramètres.
 *
 * Ils mêlent des vues d'une même page et deux sections assez lourdes pour
 * vivre sur leur propre route — équipe et règles de conseil. Le pharmacien, lui,
 * ne voit qu'une seule barre : c'est bien le même écran d'administration.
 */
export function SettingsTabs({
  canSeeTeam,
  canSeeRules,
  canSeeAudit,
  auditCount,
}: {
  canSeeTeam: boolean;
  canSeeRules: boolean;
  canSeeAudit: boolean;
  auditCount?: number;
}) {
  return (
    <LinkTabs
      basePath="/parametres"
      items={[
        { key: "officine", label: "Officine" },
        ...(canSeeTeam ? [{ key: "equipe", label: "Équipe", href: "/parametres/equipe" }] : []),
        ...(canSeeRules
          ? [{ key: "regles", label: "Règles de conseil", href: "/parametres/regles" }]
          : []),
        { key: "moteur", label: "Moteur Pharma.ai" },
        { key: "conformite", label: "Conformité" },
        { key: "abonnement", label: "Abonnement" },
        ...(canSeeAudit
          ? [{ key: "audit", label: "Journal d'audit", count: auditCount }]
          : []),
      ]}
    />
  );
}
