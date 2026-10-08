import type { Metadata } from "next";
import { Link2 } from "lucide-react";
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
        description="Un produit conseil en appelle un autre. Quand le premier est dans la vente — même une vente spontanée, sans ordonnance — PharmaBoost propose le second."
        actions={<Link2 className="size-6 text-brand-600 dark:text-brand-400" aria-hidden />}
      />
      <AssociationsManager
        associations={associations.map((association) => ({
          id: association.id,
          trigger: association.triggerProduct,
          advice: association.adviceProduct,
          sentence: association.sentence,
          isActive: association.isActive,
          createdBy: association.createdBy,
          createdAt: association.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
