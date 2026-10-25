import type { Metadata } from "next";
import Link from "next/link";
import { MonitorPlay } from "lucide-react";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { isCommercialDemoPharmacy, DEMO_MODE_HINT } from "@/core/demo/identity";
import { DEMO_SCENARIOS } from "@/core/demo/scenarios";
import { boxLabel } from "./box-label";
import { PageHeader } from "@/components/ui/page";
import { DemoPanel, type ScenarioCard } from "./demo-panel";

export const metadata: Metadata = { title: "Simuler une délivrance" };

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
      {/* Le mode à montrer en rendez-vous : l'écran du comptoir, la bannière par-dessus le logiciel, puis le bilan du patient. */}
      <Link href="/demo/comptoir" className="group flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-300 bg-brand-50 px-5 py-4 transition-colors hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/30">
        <div className="min-w-0 space-y-1">
          <p className="text-[16px] font-semibold text-text-primary">Démo au comptoir, comme devant le logiciel de la pharmacie</p>
          <p className="text-[13px] text-text-secondary">Plein écran : vous cliquez sur les boîtes pour les biper, la bannière PharmaBoost s&apos;ouvre avec les conseils, vous bipez le produit vendu, vous terminez avec l&apos;e-mail du patient… et le bilan arrive dans sa boîte mail.</p>
        </div>
        <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-[14px] font-semibold text-white group-hover:bg-brand-700"><MonitorPlay className="size-4" aria-hidden="true" /> Lancer la démo comptoir</span>
      </Link>
      <DemoPanel scenarios={scenarios} canReset={session.permissions.has(PERMISSIONS.SETTINGS_MANAGE)} hint={DEMO_MODE_HINT} />
    </div>
  );
}
