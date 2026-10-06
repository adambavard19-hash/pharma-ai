import "server-only";
import { prisma } from "@/server/db/client";
import { closeLiveCounterSales, recordCounterScan } from "@/server/services/counter-scan";
import type { AgentContext } from "@/server/services/stock-sync";
import { DEMO_DRUG_BY_KEY, DEMO_SHELF } from "@/core/demo/catalog";
import { DEMO_POST } from "@/core/demo/identity";
import { findDemoScenario, type DemoScanItem, type DemoScenario } from "@/core/demo/scenarios";
import { resolveDemoDrugsByKey } from "./resolve";

/**
 * « Simuler une délivrance » : les boîtes d'un scénario arrivent comme si la
 * douchette du LGO les avait captées.
 *
 * Ce n'est pas une imitation : chaque bip passe par le MÊME service que l'agent
 * du poste de caisse (`recordCounterScan`) — identification par le CIP,
 * regroupement des bips d'une même minute en une seule ordonnance, baisse du
 * stock. Le présentateur déroule ensuite le parcours normal. Le seul écart avec
 * la réalité est la source du bip : il vient d'ici, pas d'un lecteur.
 */

export type SimulatedScan =
  | { ok: true; prescriptionId: string; drugName: string; step: number; total: number; done: boolean }
  | { ok: false; error: string };

const EAN_BY_SLUG = new Map(DEMO_SHELF.map((item) => [item.slug, item.ean]));

/** Les codes à « bipper », dans l'ordre, quantités comprises. */
export async function codesForScenario(scenario: DemoScenario): Promise<{ ok: true; codes: string[] } | { ok: false; error: string }> {
  const drugKeys = scenario.items.flatMap((item) => ("drug" in item ? [item.drug] : []));
  const drugs = await resolveDemoDrugsByKey(drugKeys);
  const codes: string[] = [];
  for (const item of scenario.items) {
    const repeat = item.quantity ?? 1;
    const code = codeOf(item, drugs);
    if (!code) return { ok: false, error: "Le catalogue national n'est pas chargé sur ce serveur : la boîte de démonstration est introuvable." };
    for (let i = 0; i < repeat; i += 1) codes.push(code);
  }
  return { ok: true, codes };
}

function codeOf(item: DemoScanItem, drugs: Map<string, { cip13: string }>): string | null {
  if ("drug" in item) {
    if (!DEMO_DRUG_BY_KEY.has(item.drug)) return null;
    return drugs.get(item.drug)?.cip13 ?? null;
  }
  return EAN_BY_SLUG.get(item.product) ?? null;
}

/**
 * Un bip du scénario. À l'étape 0, le comptoir est d'abord vidé — comme le
 * bouton « Nouveau patient » — pour que la délivrance précédente ne reprenne pas ces boîtes.
 */
export async function simulateScan(params: { scope: { pharmacyId: string; organizationId: string; userId: string; isDemo?: boolean }; scenarioId: string; step: number }): Promise<SimulatedScan> {
  const scenario = findDemoScenario(params.scenarioId);
  if (!scenario || scenario.items.length === 0) return { ok: false, error: "Scénario inconnu." };
  const resolved = await codesForScenario(scenario);
  if (!resolved.ok) return resolved;
  const { codes } = resolved;
  if (!Number.isInteger(params.step) || params.step < 0 || params.step >= codes.length) return { ok: false, error: "Étape inconnue." };

  const post = await prisma.counterPost.findFirst({ where: { pharmacyId: params.scope.pharmacyId, hostname: DEMO_POST.hostname, revokedAt: null }, select: { id: true } });
  if (!post) return { ok: false, error: "Le poste de caisse de démonstration est absent : réinitialisez la démo." };

  if (params.step === 0) {
    await closeLiveCounterSales(params.scope);
    // Le dernier bip du poste est effacé : la première boîte ouvre toujours une nouvelle délivrance.
    await prisma.counterPost.update({ where: { id: post.id }, data: { lastScanAt: null } });
  }

  const agent: AgentContext = { connectionId: null, postId: post.id, scope: params.scope, pharmacyIsDemo: true, intervalSeconds: 300, exportPath: null, scansPath: null };
  const result = await recordCounterScan(agent, { code: codes[params.step], post: DEMO_POST.hostname, scannedAt: new Date() });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, prescriptionId: result.prescriptionId, drugName: result.drugName, step: params.step, total: codes.length, done: params.step === codes.length - 1 };
}
