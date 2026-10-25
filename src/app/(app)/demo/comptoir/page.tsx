import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { isCommercialDemoPharmacy } from "@/core/demo/identity";
import { DEMO_SCENARIOS } from "@/core/demo/scenarios";
import { boxLabel } from "../box-label";
import { CounterDemo, type CounterScenario } from "./counter-demo";

export const metadata: Metadata = { title: "Démo au comptoir" };

/**
 * La démonstration « comme au comptoir », pour un rendez-vous en partage d'écran : un faux logiciel de gestion plein écran,
 * les boîtes à biper d'un clic, et la VRAIE île du poste de caisse (/poste/ile) qui réagit — conseils, questions, Vendu,
 * e-mail du patient, Vente terminée — puis le bilan tel que le patient le reçoit. Officine de démonstration seulement.
 */
export default async function CounterDemoPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  if (!isCommercialDemoPharmacy(session.pharmacy)) notFound();
  const { scenario } = await searchParams;

  // Les ventes avec des boîtes seulement : une demande sans ordonnance se montre depuis la bannière au repos.
  const scenarios: CounterScenario[] = DEMO_SCENARIOS.filter((item) => item.items.length > 0).map((item) => ({ id: item.id, title: item.title, situation: item.situation, boxes: item.items.flatMap((box) => Array.from({ length: box.quantity ?? 1 }, () => boxLabel(box))) }));
  const initial = scenarios.find((item) => item.id === scenario)?.id ?? scenarios.find((item) => item.id === "allergie")?.id ?? scenarios[0].id;

  return <CounterDemo scenarios={scenarios} initial={initial} pharmacyName={session.pharmacy.name} firstName={session.user.firstName} />;
}
