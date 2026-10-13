import { LinkTabs } from "@/components/ui/tabs";

/**
 * Les deux onglets de « Performances » : le classement de l'équipe (et les challenges), puis ce que les conseils PharmaBoost
 * ont rapporté. Deux pages, une seule entrée de menu, un seul titre — les onglets de l'application, avec leur indicateur.
 */
export function PerformanceTabs({ active }: { active: "equipe" | "rapporte" }) {
  return (
    <LinkTabs
      activeKey={active}
      items={[
        { key: "equipe", label: "Classement de l'équipe", href: "/pilotage" },
        { key: "rapporte", label: "Ce que PharmaBoost rapporte", href: "/resultats" },
      ]}
    />
  );
}
