import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadOverstockScreen } from "@/server/services/overstock";
import { OVERSTOCK_DRUG_CLASSES } from "@/core/overstock/campaign";
import { parisDayKey } from "@/core/sales/board";
import { PageHeader } from "@/components/ui/page";
import { OverstockManager } from "./overstock-manager";

export const metadata: Metadata = { title: "Surstock" };

/**
 * « Surstock » (fondateur, 25 oct. 2026) : les produits conseil achetés en trop, qui doivent sortir avant l'échéance de la
 * facture. Le pharmacien lance une campagne — le produit, les situations où le proposer, l'objectif de stock — et PharmaBoost
 * le met en premier au comptoir, à la place d'un conseil de la même famille, jusqu'à l'objectif ou la date de fin.
 *
 * Toute l'équipe voit les campagnes en cours (ce sont les produits à pousser) ; seuls le titulaire et le pharmacien les
 * lancent ou les arrêtent.
 */
export default async function OverstockPage() {
  const session = await requirePermission(PERMISSIONS.STOCK_VIEW);
  const canEdit = session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const screen = await loadOverstockScreen(session.scope);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Surstock"
        description="Un produit acheté en trop reste en rayon et pèse sur la trésorerie. Mettez-le en campagne : PharmaBoost le propose en premier au comptoir, dans les situations que vous choisissez, jusqu'à ce que le stock redescende."
      />
      <OverstockManager
        canEdit={canEdit}
        today={parisDayKey(new Date())}
        classes={OVERSTOCK_DRUG_CLASSES.map((item) => ({ ...item }))}
        families={screen.families}
        suggestions={screen.suggestions}
        campaigns={screen.campaigns.map((campaign) => ({ ...campaign, createdAt: campaign.createdAt.toISOString() }))}
      />
    </div>
  );
}
