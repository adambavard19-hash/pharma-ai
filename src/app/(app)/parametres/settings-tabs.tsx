"use client";

import { LinkTabs } from "@/components/ui/tabs";

/**
 * Les onglets de Paramètres.
 *
 * Ils mêlent des vues d'une même page et deux sections assez lourdes pour
 * vivre sur leur propre route — équipe et préférences de conseil. Le pharmacien, lui,
 * ne voit qu'une seule barre : c'est bien le même écran d'administration.
 */
export function SettingsTabs({
  canSeeTeam,
  canSeeRules,
  canSeeAudit,
  auditCount,
  canSeePrograms = false,
  canSeePosts = false,
}: {
  canSeeTeam: boolean;
  canSeeRules: boolean;
  canSeeAudit: boolean;
  auditCount?: number;
  /** Gammes privilégiées et challenges (titulaire) : l'onglet Laboratoires y mène. */
  canSeePrograms?: boolean;
  /** Les ordinateurs du comptoir (installer, nommer, retirer) : le titulaire. */
  canSeePosts?: boolean;
}) {
  return (
    <LinkTabs
      basePath="/parametres"
      items={[
        { key: "officine", label: "Officine" },
        ...(canSeePosts ? [{ key: "postes", label: "Postes du comptoir", href: "/parametres/postes" }] : []),
        ...(canSeeTeam ? [{ key: "equipe", label: "Équipe", href: "/parametres/equipe" }] : []),
        ...(canSeeRules ? [{ key: "regles", label: "Mes préférences", href: "/parametres/regles" }] : []),
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
