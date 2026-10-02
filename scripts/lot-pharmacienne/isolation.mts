/**
 * Isolation entre officines des briques gammes privilégiées, challenges, dates
 * courtes, vigilances produit et formation — sur la base LOCALE seulement.
 *
 * Deux officines de test (A et B) sont créées, A reçoit une donnée de chaque
 * brique, puis chaque service est appelé avec le périmètre de B : il ne doit
 * rien lire, rien modifier, rien supprimer de A. Tout est effacé à la fin.
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/lot-pharmacienne/isolation.mts
 */
import { prisma } from "@/server/db/client";
import { deletePreferredRange, listPreferredRanges, savePreferredRange, setPreferredRangeActive } from "@/server/services/preferred-ranges";
import { addChallengeEntry, deleteChallenge, getChallengeDetail, listChallenges, saveChallenge, setChallengeStatus } from "@/server/services/challenges";
import { deleteLot, listLots, nearestShortDatesFor, resolveLot, saveLot } from "@/server/services/stock-lots";
import { deleteProductVigilance, listProductVigilances, saveProductVigilance } from "@/server/services/product-vigilances";
import { getTraining, listTrainings, savePharmacyTraining, setPharmacyTrainingActive, setProgress, trainingsForProducts } from "@/server/services/training";
import { enrichCatalog, loadCatalogSnapshot, loadPreferredRanges } from "@/server/services/catalog";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refus : ce contrôle ne tourne que sur la base locale.");
  process.exit(2);
}

const run = `iso${Date.now().toString(36)}`;
let failures = 0;
const check = (label: string, cond: unknown, detail?: unknown) => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
};
const orgIds: string[] = [];

async function pharmacy(tag: string) {
  const org = await prisma.organization.create({ data: { name: `Test isolation ${tag} ${run}`, slug: `${run}-${tag}-org` } });
  orgIds.push(org.id);
  const ph = await prisma.pharmacy.create({ data: { organizationId: org.id, name: `Officine ${tag} ${run}`, slug: `${run}-${tag}` } });
  const product = await prisma.product.create({
    data: { pharmacyId: ph.id, organizationId: org.id, name: `ISOMARQUE Flore ${tag}`, brand: "Isomarque", category: "PROBIOTIQUES", reference: `${run}-${tag}`, ean: null },
  });
  return { scope: { pharmacyId: ph.id, organizationId: org.id, userId: `${run}-user-${tag}` }, productId: product.id };
}

async function main() {
  const A = await pharmacy("A");
  const B = await pharmacy("B");
  const today = new Date();
  const inDays = (n: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + n));

  console.log("Gammes privilégiées");
  const rangeA = await savePreferredRange(A.scope, { universe: "COMPLEMENTS_ALIMENTAIRES", laboratory: "Isomarque", isActive: true, priority: 1, productIds: [] });
  check("A crée sa gamme", rangeA.ok);
  const rangeId = rangeA.ok ? rangeA.data.id : "";
  check("B ne la voit pas", (await listPreferredRanges(B.scope)).length === 0);
  check("le moteur de B ne la charge pas", (await loadPreferredRanges(B.scope)).length === 0);
  check("B ne peut pas la désactiver", !(await setPreferredRangeActive(B.scope, rangeId, false)).ok);
  check("B ne peut pas la supprimer", !(await deletePreferredRange(B.scope, rangeId)).ok);
  check("B ne peut pas y joindre un produit de A", !(await savePreferredRange(B.scope, { universe: "COMPLEMENTS_ALIMENTAIRES", laboratory: "Isomarque", isActive: true, priority: 1, productIds: [A.productId] })).ok);
  check("la gamme de A est intacte", (await prisma.preferredRange.findUnique({ where: { id: rangeId } }))?.isActive === true);

  console.log("Challenges");
  const challenge = await saveChallenge(A.scope, {
    title: "Challenge test", laboratory: "Isomarque", brand: "Isomarque", universe: null, productIds: [],
    startsOn: inDays(-5).toISOString().slice(0, 10), endsOn: inDays(25).toISOString().slice(0, 10),
    targetUnits: 10, rewardMode: "PER_UNIT", bonusPerUnitCents: 100, tiers: [], countMode: "ALL_SALES", notes: null,
  });
  check("A crée son challenge", challenge.ok, challenge);
  const challengeId = challenge.ok ? challenge.data.id : "";
  check("B ne le voit pas dans la liste", (await listChallenges(B.scope)).rows.length === 0);
  check("B n'en ouvre pas le détail", (await getChallengeDetail(B.scope, challengeId)) === null);
  check("B ne peut pas y saisir d'unités", !(await addChallengeEntry(B.scope, challengeId, { units: 5, occurredOn: today.toISOString().slice(0, 10), note: null })).ok);
  check("B ne peut pas le terminer", (await setChallengeStatus(B.scope, challengeId, "ENDED")) === null);
  check("B ne peut pas le supprimer", (await deleteChallenge(B.scope, challengeId)) === null);
  check("le challenge de A est intact", (await prisma.labChallenge.findUnique({ where: { id: challengeId } }))?.status === "ACTIVE");

  console.log("Dates courtes");
  const lot = await saveLot(A.scope, { productId: A.productId, expiresOn: inDays(40), precision: "DAY", lotNumber: "L1", quantity: 3 });
  check("A saisit un lot", lot.ok, lot);
  const lotId = lot.ok ? lot.data.id : "";
  check("B ne le voit pas", (await listLots(B.scope, {})).lots.length === 0);
  check("B ne voit aucune date courte de A", (await nearestShortDatesFor(B.scope.pharmacyId, today)).size === 0);
  check("A voit sa date courte", (await nearestShortDatesFor(A.scope.pharmacyId, today)).has(`p:${A.productId}`));
  check("B ne peut pas sortir le lot", !(await resolveLot(B.scope, lotId, "DESTROYED")).ok);
  check("B ne peut pas le supprimer", !(await deleteLot(B.scope, lotId)).ok);
  check("B ne peut pas saisir un lot sur un produit de A", !(await saveLot(B.scope, { productId: A.productId, expiresOn: inDays(40), precision: "DAY" })).ok);

  console.log("Vigilances produit");
  const vig = await saveProductVigilance(A.scope, { productId: A.productId, population: "PREGNANCY", level: "CONTRAINDICATION", note: null });
  check("A déclare une vigilance", vig.ok);
  check("B ne la lit pas", (await listProductVigilances(B.scope, A.productId)).length === 0);
  check("B ne peut pas en déclarer sur un produit de A", !(await saveProductVigilance(B.scope, { productId: A.productId, population: "ASTHMA", level: "INFO", note: null })).ok);
  check("B ne peut pas la supprimer", vig.ok && !(await deleteProductVigilance(B.scope, vig.id)).ok);

  console.log("Catalogue du moteur");
  const catalogB = await enrichCatalog(B.scope, await loadCatalogSnapshot(B.scope));
  check("le catalogue de B ne contient aucun produit de A", !catalogB.some((p) => p.id === A.productId));
  const catalogA = await enrichCatalog(A.scope, await loadCatalogSnapshot(A.scope));
  const productA = catalogA.find((p) => p.id === A.productId);
  check("le catalogue de A porte sa date courte et sa vigilance", Boolean(productA?.shortDate) && (productA?.vigilances?.length ?? 0) === 1, productA?.shortDate);

  console.log("Formation");
  const content = await savePharmacyTraining(A.scope, null, {
    title: "Formation test", summary: null, kind: "EXTERNAL_LINK", url: "https://example.org/formation", body: null,
    laboratory: "Isomarque", brandKey: "isomarque", rangeName: null, universe: null, productCodes: [], productIds: [A.productId], durationMinutes: 5, sourceLabel: "Lien officiel",
  });
  check("A publie un contenu pour son équipe", content.ok, content);
  const contentId = content.ok ? content.id : "";
  check("B ne le voit pas dans son catalogue", !(await listTrainings(B.scope)).items.some((item) => item.id === contentId));
  check("B ne l'ouvre pas", (await getTraining(B.scope, contentId)) === null);
  check("B ne peut pas y enregistrer de progression", !(await setProgress(B.scope, contentId, { status: "DONE" })).ok);
  check("B ne peut pas le désactiver", !(await setPharmacyTrainingActive(B.scope, contentId, false)).ok);
  check("aucune formation de A proposée sur un produit de B", ((await trainingsForProducts(B.scope, [B.productId, A.productId])).size) === 0);
  check("A voit « Se former sur ce produit » sur son produit", ((await trainingsForProducts(A.scope, [A.productId])).get(A.productId)?.length ?? 0) === 1);
}

try {
  await main();
} finally {
  // Seulement ce que ce passage a créé : la suppression des organisations
  // emporte officines, produits, gammes, challenges, lots, vigilances, contenus.
  const contents = await prisma.trainingContent.findMany({ where: { pharmacy: { organizationId: { in: orgIds } } }, select: { id: true } });
  await prisma.trainingProgress.deleteMany({ where: { contentId: { in: contents.map((c) => c.id) } } });
  for (const id of orgIds) await prisma.organization.delete({ where: { id } });
  await prisma.auditLog.deleteMany({ where: { userId: { startsWith: run } } });
  await prisma.$disconnect();
}
console.log(failures === 0 ? "\nIsolation : tous les contrôles passent." : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
