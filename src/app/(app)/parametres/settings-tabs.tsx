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
  canSeePrograms = false,
}: {
  canSeeTeam: boolean;
  canSeeRules: boolean;
  canSeeAudit: boolean;
  auditCount?: number;
  /** Gammes privilégiées et challenges (titulaire) : l'onglet Laboratoires y mène. */
  canSeePrograms?: boolean;
}) {
  return (
    <LinkTabs
      basePath="/parametres"
      items={[
        { key: "officine", label: "Officine" },
        ...(canSeeTeam ? [{ key: "equipe", label: "Équipe", href: "/parametres/equipe" }] : []),
        ...(canSeeRules || canSeePrograms
          ? [{ key: "laboratoires", label: "Laboratoires & gammes", href: canSeeRules ? "/parametres/laboratoires" : "/parametres/laboratoires/gammes" }]
          : []),
        ...(canSeeRules
          ? [
              { key: "regles", label: "Règles de conseil", href: "/parametres/regles" },
              { key: "regles-conseil", label: "Registre du moteur", href: "/parametres/regles-conseil" },
            ]
          : []),
        { key: "moteur", label: "Moteur PharmaBoost" },
        { key: "conformite", label: "Conformité" },
        { key: "abonnement", label: "Mon abonnement" },
        ...(canSeeAudit
          ? [{ key: "audit", label: "Journal d'audit", count: auditCount }]
          : []),
      ]}
    />
  );
}
