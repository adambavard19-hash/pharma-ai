/**
 * Passe chaque scénario de démonstration dans le VRAI moteur et dit ce qu'il en sort.
 *
 *   npm run demo:verifier
 *
 * Pour chaque scénario : les boîtes sont « bippées » (comme au comptoir), l'analyse tourne, et le
 * script compare les besoins repérés (et les produits en stock proposés) à ce que le scénario promet.
 * Il n'écrit que dans l'officine de démonstration, qu'il remet à l'état initial à la fin.
 */
import { prisma } from "@/server/db/client";
import { analysePrescription } from "@/server/services/analysis";
import { simulateScan } from "@/server/services/demo/simulate";
import { installDemoPharmacy } from "@/server/services/demo/provision";
import { DEMO_PHARMACY_SLUG } from "@/core/demo/identity";
import { DEMO_SCENARIOS } from "@/core/demo/scenarios";

async function main() {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { slug: DEMO_PHARMACY_SLUG }, select: { id: true, organizationId: true, isDemo: true } });
  if (!pharmacy?.isDemo) throw new Error("L'officine de démonstration n'est pas installée : lancez d'abord npm run demo:commercial.");
  const owner = await prisma.membership.findFirst({ where: { pharmacyId: pharmacy.id, role: "OWNER", isActive: true }, select: { userId: true } });
  if (!owner) throw new Error("Aucun titulaire dans l'officine de démonstration.");
  const scope = { pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, userId: owner.userId, isDemo: true };

  let failures = 0;
  for (const scenario of DEMO_SCENARIOS.filter((item) => item.items.length > 0)) {
    let prescriptionId = "";
    for (let step = 0; step < scenario.items.reduce((total, item) => total + (item.quantity ?? 1), 0); step += 1) {
      const scan = await simulateScan({ scope, scenarioId: scenario.id, step });
      if (!scan.ok) throw new Error(`${scenario.id} : ${scan.error}`);
      prescriptionId = scan.prescriptionId;
    }
    const { result } = await analysePrescription({ scope, prescriptionId });
    const found = new Set(result.opportunities.map((opportunity) => opportunity.key.replace(/#.*$/, "").replace(/\.[a-z]+$/, "")));
    const keys = [...new Set(result.opportunities.map((opportunity) => opportunity.key))];
    const missing = scenario.expects.filter((key) => !keys.some((candidate) => candidate === key || candidate.startsWith(key)) && !found.has(key));
    const proposed = new Set(result.recommendations.map((recommendation) => recommendation.opportunityKey.replace(/#.*$/, "")));
    // Ce que le moteur propose, rule par règle : on vérifie à l'œil que le produit est le bon.
    const names = new Map((await prisma.product.findMany({ where: { id: { in: result.recommendations.map((recommendation) => recommendation.productId).filter((id) => !id.startsWith("presentation:")) } }, select: { id: true, name: true } })).map((row) => [row.id, row.name]));
    const presentations = new Map((await prisma.drugPresentation.findMany({ where: { id: { in: result.recommendations.map((recommendation) => recommendation.productId).filter((id) => id.startsWith("presentation:")).map((id) => id.slice("presentation:".length)) } }, select: { id: true, specialty: { select: { name: true } } } })).map((row) => [`presentation:${row.id}`, row.specialty.name]));
    const detail = result.recommendations.map((recommendation) => `${recommendation.opportunityKey} → ${names.get(recommendation.productId) ?? presentations.get(recommendation.productId) ?? recommendation.productId}`);
    const mark = missing.length === 0 ? "✓" : "✗";
    if (missing.length > 0) failures += 1;
    console.log(`${mark} ${scenario.id.padEnd(22)} issue ${result.outcome.padEnd(16)} besoins ${String(keys.length).padStart(2)} · conseils ${String(result.recommendations.length).padStart(2)}${missing.length ? `  MANQUE: ${missing.join(", ")}` : ""}`);
    if (process.argv.includes("--detail")) for (const line of detail) console.log(`      · ${line}`);
    if (missing.length > 0) console.log(`    repérés : ${keys.join(", ") || "(aucun)"} · avec produit : ${[...proposed].join(", ") || "(aucun)"}`);
  }

  // Les scénarios ont consommé du stock et créé des ventes en cours : on remet tout à zéro.
  await installDemoPharmacy({});
  console.log(failures === 0 ? "\nTous les scénarios répondent." : `\n${failures} scénario(s) incomplet(s).`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
