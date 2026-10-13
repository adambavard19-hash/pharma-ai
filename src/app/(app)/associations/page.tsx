import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listAssociations } from "@/server/services/product-associations";
import { PageHeader } from "@/components/ui/page";
import { AssociationsManager } from "./associations-manager";

export const metadata: Metadata = { title: "Mes associations" };

/**
 * « Mes associations » : un produit conseil en appelle un autre.
 *
 * Premier axe du conseil — un MÉDICAMENT déclenche un produit conseil (antibiotique → spray nasal) : ce sont les règles du
 * moteur, rien à régler ici. Second axe, cet écran — un PRODUIT en appelle un autre (spray nasal → Olioseptil Bronche),
 * y compris sur une vente spontanée, sans ordonnance. Le pharmacien écrit l'association ; PharmaBoost l'applique avec les
 * mêmes garde-fous que tout conseil (stock, sécurité, patient).
 */
export default async function AssociationsPage() {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const associations = await listAssociations(session.scope);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes associations"
        description="Quand un produit ou un médicament est dans la vente — même une vente spontanée, sans ordonnance — PharmaBoost propose les produits de votre stock que vous avez choisis. Un médicament peut en appeler plusieurs."
      />
      <AssociationsManager
        associations={associations.map((association) => ({
          id: association.id,
          trigger: association.trigger,
          advice: association.advice,
          sentence: association.sentence,
          isActive: association.isActive,
          createdBy: association.createdBy,
          createdAt: association.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
