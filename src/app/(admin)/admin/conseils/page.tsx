import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listCentralAssociations, listCentralRules } from "@/server/services/central-advice";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdviceControl, type AssociationCard, type RuleCard } from "./advice-control";
import { HowItWorks } from "./how-it-works";

export const metadata: Metadata = { title: "Conseils & associations" };

/**
 * Le centre de contrôle des conseils : règles, conseils et associations de PharmaBoost, au même endroit.
 *
 * Tout ce qui se décide ici vaut pour TOUTES les pharmacies — celles qui existent et celles à venir —, dès la vente suivante.
 * C'est l'écran de la pharmacienne qui relit : elle valide, supprime ou ajoute. Les titulaires, eux, ne voient rien de tout
 * cela : leur espace ne garde que les associations qu'ils écrivent pour eux.
 */
export default async function AdminAdvicePage() {
  await requirePlatformSession();
  const [rules, associations] = await Promise.all([listCentralRules(PRODUCT_CATEGORY_LABELS), listCentralAssociations()]);

  const ruleCards: RuleCard[] = rules.map((rule) => ({ ...rule, decidedAt: rule.decidedAt ? rule.decidedAt.toISOString() : null }));
  const associationCards: AssociationCard[] = associations.map((association) => ({
    ...association,
    decidedAt: association.decidedAt ? association.decidedAt.toISOString() : null,
    createdAt: association.createdAt.toISOString(),
  }));

  return (
    <>
      <AdminPageHeader
        space={{ label: "Conseils", href: "/admin/conseils" }}
        title="Conseils & associations"
        description="Tout ce que PharmaBoost conseille au comptoir, au même endroit. Ce que vous décidez ici vaut pour toutes les pharmacies, celles qui existent et celles à venir."
      />
      <AdviceControl
        rules={ruleCards}
        associations={associationCards}
        categories={PRODUCT_CATEGORIES.map((code) => ({ code, label: PRODUCT_CATEGORY_LABELS[code] }))}
        tags={[...ADVICE_VOCABULARY]}
      />
      <details className="group rounded-xl border border-border-subtle bg-surface-card p-4">
        <summary className="cursor-pointer text-[14px] font-semibold text-text-primary">Comment le moteur décide</summary>
        <div className="mt-4">
          <HowItWorks />
        </div>
      </details>
    </>
  );
}
