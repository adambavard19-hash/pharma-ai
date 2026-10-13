import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listCentralAssociations, listCentralRules, loadEditHistory, modifiedAssociations, type EditHistoryEntry } from "@/server/services/central-advice";
import { listRobotProposals } from "@/server/services/robot-proposals";
import { listTriggerFamilies } from "@/server/services/trigger-families";
import { associationFacets, listPreviewPharmacies, questionTreeSummaries, robotFacets, robotOriginKeys, ruleFacets } from "@/server/services/advice-hub";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import { describeVigilances } from "@/core/ai/vigilance-catalog";
import { SKIN_DOCUMENT_NAMES } from "@/core/ai/engines/conseil-peau-couverture";
import { filterFromParam } from "@/core/admin/advice-hub";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdviceHub, type HubItem } from "./advice-hub";
import type { HistoryLine } from "./edit-forms";
import { HowItWorks } from "./how-it-works";

export const metadata: Metadata = { title: "Conseils" };

const lines = (entries: EditHistoryEntry[] | undefined): HistoryLine[] => (entries ?? []).map((entry) => ({ ...entry, at: entry.at.toISOString() }));

/**
 * « Conseils » : l'endroit unique où l'équipe PharmaBoost voit tout ce qui est proposé au comptoir quand un médicament ou un
 * produit est scanné — règles, conseils déclenchés par un produit, suggestions du robot, et ce qu'il ne faut pas associer.
 *
 * Tout ce qui se décide ici vaut pour TOUTES les pharmacies, celles qui existent et celles à venir, dès la vente suivante.
 * Les titulaires, eux, ne voient rien de tout cela : leur espace ne garde que les associations qu'ils écrivent pour eux.
 */
export default async function AdminAdvicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const query = await searchParams;
  const [rules, associations, robot, history, associationEdits, robotKeys, pharmacies, families] = await Promise.all([
    listCentralRules(PRODUCT_CATEGORY_LABELS),
    listCentralAssociations(),
    listRobotProposals(),
    loadEditHistory(),
    modifiedAssociations(),
    robotOriginKeys(),
    listPreviewPharmacies(),
    listTriggerFamilies(),
  ]);

  const items: HubItem[] = [
    ...robot.pending.map((proposal) => ({ type: "robot" as const, facets: robotFacets(proposal), proposal: { ...proposal, decidedAt: proposal.decidedAt ? proposal.decidedAt.toISOString() : null, createdAt: proposal.createdAt.toISOString() } })),
    ...rules.map((rule) => ({
      type: "rule" as const,
      facets: ruleFacets(rule, robotKeys),
      rule: {
        ...rule,
        decidedAt: rule.decidedAt ? rule.decidedAt.toISOString() : null,
        modified: rule.modified ? { ...rule.modified, at: rule.modified.at ? rule.modified.at.toISOString() : null } : null,
        history: lines(history.get(rule.id)),
        fromRobot: robotKeys.has(rule.ruleKey),
      },
    })),
    ...associations.map((association) => {
      const edit = associationEdits.get(association.id);
      return {
        type: "association" as const,
        facets: associationFacets(association, robotKeys),
        association: {
          ...association,
          decidedAt: association.decidedAt ? association.decidedAt.toISOString() : null,
          createdAt: association.createdAt.toISOString(),
          modified: edit ? { by: edit.by, at: edit.at.toISOString() } : null,
          history: lines(history.get(`association:${association.id}`)),
          fromRobot: robotKeys.has(`association:${association.id}`),
        },
      };
    }),
    ...robot.recent
      .filter((proposal) => proposal.status === "REFUSED")
      .map((proposal) => ({ type: "robot" as const, facets: robotFacets(proposal), proposal: { ...proposal, decidedAt: proposal.decidedAt ? proposal.decidedAt.toISOString() : null, createdAt: proposal.createdAt.toISOString() } })),
  ];

  return (
    <>
      <AdminPageHeader space={{ label: "Gestion", href: "/admin/conseils" }} title="Conseils" description="Tout ce que PharmaBoost propose au comptoir — et ce qu'il déconseille — au même endroit. Ce que vous décidez ici vaut pour toutes les pharmacies." />
      <AdviceHub
        items={items}
        vigilances={describeVigilances(SKIN_DOCUMENT_NAMES)}
        categories={PRODUCT_CATEGORIES.map((code) => ({ code, label: PRODUCT_CATEGORY_LABELS[code] }))}
        tags={[...ADVICE_VOCABULARY]}
        trees={questionTreeSummaries()}
        pharmacies={pharmacies}
        families={families}
        initialFilter={filterFromParam(query.filtre)}
        initialQuery={typeof query.q === "string" ? query.q.slice(0, 120) : ""}
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
