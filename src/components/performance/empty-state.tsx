import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";

/**
 * Quand PharmaBoost n'a rien mesuré sur la période : on le dit, sans exemple
 * chiffré ni courbe à zéro qui ferait croire à une mesure. La barre de période
 * reste visible au-dessus : on peut essayer une période plus longue.
 */
export function PerformanceEmptyState({ audience }: { audience: "owner" | "platform" }) {
  return (
    <Card data-state="empty">
      <EmptyState
        icon={<BarChart3 className="size-6" aria-hidden="true" />}
        title="PharmaBoost n'a encore rien mesuré sur cette période."
        description={
          audience === "owner"
            ? "Les chiffres apparaissent dès que PharmaBoost propose un conseil à votre équipe ou qu'une vente issue d'un conseil est enregistrée. Essayez une période plus longue si vous venez de commencer."
            : "Aucun conseil PharmaBoost proposé et aucune vente confirmée pour cette officine sur la période. Essayez une période plus longue : elle n'a peut-être pas encore commencé."
        }
      />
    </Card>
  );
}
