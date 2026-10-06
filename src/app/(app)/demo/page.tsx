import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { isCommercialDemoPharmacy, DEMO_MODE_HINT } from "@/core/demo/identity";
import { DEMO_SCENARIOS } from "@/core/demo/scenarios";
import { DEMO_DRUG_BY_KEY, DEMO_SHELF } from "@/core/demo/catalog";
import { PageHeader } from "@/components/ui/page";
import { DemoPanel, type ScenarioCard } from "./demo-panel";

export const metadata: Metadata = { title: "Simuler une délivrance" };

const SHELF_NAME = new Map(DEMO_SHELF.map((item) => [item.slug, item.name]));

/** « AUGMENTIN 500 mg/62,5 mg, comprimé pelliculé » devient « Augmentin 500 mg/62,5 mg ». */
function boxLabel(item: (typeof DEMO_SCENARIOS)[number]["items"][number]): string {
  if ("product" in item) return SHELF_NAME.get(item.product) ?? item.product;
  const search = DEMO_DRUG_BY_KEY.get(item.drug)?.search ?? item.drug;
  // On coupe à la virgule suivie d'une espace (la forme), pas à la virgule décimale de « 62,5 mg ».
  const head = search.split(/,\s/)[0].trim();
  return head.charAt(0) + head.slice(1).toLowerCase();
}

/**
 * La page du présentateur : les scénarios de délivrance, et la remise à zéro.
 * Elle n'existe que dans l'officine de démonstration : ailleurs, elle n'existe pas.
 */
export default async function DemoPage() {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  if (!isCommercialDemoPharmacy(session.pharmacy)) notFound();

  const scenarios: ScenarioCard[] = DEMO_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    situation: scenario.situation,
    group: scenario.group,
    boxes: scenario.items.map(boxLabel),
    isRequest: Boolean(scenario.request),
    show: scenario.show,
    tip: scenario.tip,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Simuler une délivrance" description="Choisissez une situation : les boîtes arrivent comme si elles étaient passées à la douchette, puis vous déroulez le parcours normal de PharmaBoost." />
      <DemoPanel scenarios={scenarios} canReset={session.permissions.has(PERMISSIONS.SETTINGS_MANAGE)} hint={DEMO_MODE_HINT} />
    </div>
  );
}
