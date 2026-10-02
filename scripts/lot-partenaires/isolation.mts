/**
 * PharmaBoost Partenaires : diffusion, masquage, contact, commande et
 * attribution entre deux officines — sur la base LOCALE seulement.
 *
 * Une marque est diffusée à l'officine A seulement (audience « sélection »).
 * Chaque service côté officine est appelé avec le périmètre de B : il ne doit
 * rien voir, rien contacter, rien commander, rien masquer chez A. Puis les
 * statuts (suspendu, test, pilote) et l'absence de toute colonne patient sont
 * contrôlés. Tout ce que ce passage crée est effacé à la fin.
 *
 *   npm run lot:isolation-partenaires
 */
import { prisma } from "@/server/db/client";
import { brandsForPharmacy, counterBrandsFor } from "@/server/services/partners/visibility";
import { partnerBrandPage, partnerCatalog, setBrandPreference } from "@/server/services/partners/pharmacy-partners";
import { partnerActivity, placeOrder, requestContact } from "@/server/services/partners/orders";
import { ATTRIBUTION_CODE_PATTERN } from "@/core/partners/attribution";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refus : ce contrôle ne tourne que sur la base locale.");
  process.exit(2);
}

const run = `isop${Date.now().toString(36)}`;
const startedAt = new Date();
let failures = 0;
const check = (label: string, cond: unknown, detail?: unknown) => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
};
const orgIds: string[] = [];
const partnerIds: string[] = [];

async function pharmacy(tag: string) {
  const org = await prisma.organization.create({ data: { name: `Test isolation partenaires ${tag} ${run}`, slug: `${run}-${tag}-org` } });
  orgIds.push(org.id);
  const ph = await prisma.pharmacy.create({ data: { organizationId: org.id, name: `Officine ${tag} ${run}`, slug: `${run}-${tag}`, isDemo: true } });
  return { pharmacyId: ph.id, organizationId: org.id, userId: `${run}-user-${tag}` };
}

const ctx = { source: "CATALOG" as const, universe: "COMPLEMENTS_ALIMENTAIRES" };

async function main() {
  const A = await pharmacy("A");
  const B = await pharmacy("B");

  const partner = await prisma.partner.create({ data: { name: `Partenaire ${run}`, slug: `${run}-partenaire`, status: "ACTIVE" } });
  partnerIds.push(partner.id);
  await prisma.partnerIntegration.create({ data: { partnerId: partner.id, mode: "MANUAL", isActive: true } });
  const brand = await prisma.partnerBrand.create({
    data: { partnerId: partner.id, name: `Marque ${run}`, slug: `${run}-marque`, brandKey: `marque ${run}`, universes: ["COMPLEMENTS_ALIMENTAIRES"], status: "ACTIVE", audience: "SELECTED_PHARMACIES", audiences: { create: { pharmacyId: A.pharmacyId } } },
  });
  const range = await prisma.partnerRange.create({ data: { brandId: brand.id, name: "Gamme", universe: "COMPLEMENTS_ALIMENTAIRES", status: "ACTIVE" } });
  const item = await prisma.partnerProduct.create({ data: { brandId: brand.id, rangeId: range.id, name: "Produit", proPriceCents: 450 } });
  // Une autre marque du même partenaire, jamais diffusée : ses produits ne se commandent pas.
  const hiddenBrand = await prisma.partnerBrand.create({ data: { partnerId: partner.id, name: `Brouillon ${run}`, slug: `${run}-brouillon`, brandKey: `brouillon ${run}`, status: "DRAFT" } });
  const draftItem = await prisma.partnerProduct.create({ data: { brandId: hiddenBrand.id, name: "Produit brouillon", proPriceCents: 100 } });

  const seenBy = async (scope: typeof A) => (await brandsForPharmacy(scope)).find((b) => b.id === brand.id)?.visibility;

  console.log("Diffusion (audience : officine A seulement)");
  check("A voit la marque au catalogue et au comptoir", (await seenBy(A))?.counter === true);
  check("B ne la voit pas", (await seenBy(B))?.catalog !== true);
  check("B n'en ouvre pas la page", (await partnerBrandPage(B, brand.slug)) === null);
  check("A en ouvre la page", (await partnerBrandPage(A, brand.slug))?.brand.id === brand.id);
  check("aucune carte comptoir pour B", (await counterBrandsFor(B)).length === 0);
  check("la marque brouillon n'est visible de personne", !(await brandsForPharmacy(A)).some((b) => b.id === hiddenBrand.id && b.visibility.catalog));

  console.log("Masquage et refus");
  check("B ne peut pas masquer une marque qui ne lui est pas diffusée", !(await setBrandPreference(B, brand.id, "HIDDEN", null)).ok);
  check("A la masque", (await setBrandPreference(A, brand.id, "HIDDEN", null)).ok);
  check("masquée : plus de carte au comptoir de A", (await counterBrandsFor(A)).length === 0);
  check("masquée : toujours consultable au catalogue de A", (await partnerCatalog(A)).hidden.some((b) => b.id === brand.id));
  check("le choix de A n'existe pas chez B", (await prisma.pharmacyPartnerPreference.count({ where: { pharmacyId: B.pharmacyId } })) === 0);
  check("A la refuse : page fermée", (await setBrandPreference(A, brand.id, "REFUSED", "test")).ok && (await partnerBrandPage(A, brand.slug)) === null);
  check("A revient sur son choix", (await setBrandPreference(A, brand.id, null, null)).ok && (await seenBy(A))?.counter === true);

  console.log("Contact et commande");
  check("B ne peut pas contacter le partenaire de la marque", !(await requestContact(B, { brandId: brand.id, message: null, contactName: "B", contactEmail: null, contactPhone: null, ...ctx })).ok);
  const lead = await requestContact(A, { brandId: brand.id, message: "test isolation", contactName: "A", contactEmail: null, contactPhone: null, ...ctx });
  check("A le contacte", lead.ok, lead);
  check("B ne peut pas commander", !(await placeOrder(B, { brandId: brand.id, lines: [{ productId: item.id, quantity: 2 }], note: null, ...ctx })).ok);
  check("A ne peut pas commander un produit d'une marque non diffusée", !(await placeOrder(A, { brandId: brand.id, lines: [{ productId: draftItem.id, quantity: 1 }], note: null, ...ctx })).ok);
  const order = await placeOrder(A, { brandId: brand.id, lines: [{ productId: item.id, quantity: 2 }], note: "Note de test", ...ctx });
  check("A commande (mode manuel : enregistrée pour l'équipe)", order.ok && order.data.status === "SUBMITTED" && order.data.totalCents === 900, order);
  check("l'historique de B est vide", (await partnerActivity(B, partner.id)).length === 0);
  check("l'historique de A porte sa demande et sa commande", (await partnerActivity(A, partner.id)).length === 2);
  const stored = order.ok ? await prisma.partnerOrder.findUnique({ where: { id: order.data.orderId }, include: { attribution: true, lines: true } }) : null;
  check("commande : officine, montant, mode, note, lignes conservés", stored?.pharmacyId === A.pharmacyId && stored.totalCents === 900 && stored.integrationMode === "MANUAL" && stored.note === "Note de test" && stored.lines[0]?.quantity === 2);
  check("identifiant d'attribution unique au format PB-XXXX-XXXX", Boolean(stored && ATTRIBUTION_CODE_PATTERN.test(stored.attribution.code)) && (lead.ok && order.ok && lead.data.code !== order.data.code));

  console.log("Statuts");
  await prisma.partner.update({ where: { id: partner.id }, data: { status: "SUSPENDED" } });
  check("partenaire suspendu : plus visible de A", (await seenBy(A))?.catalog !== true);
  await prisma.partner.update({ where: { id: partner.id }, data: { status: "ACTIVE" } });
  await prisma.partnerBrand.update({ where: { id: brand.id }, data: { status: "TEST" } });
  check("marque en test : invisible hors groupe pilote", (await seenBy(A))?.catalog !== true);
  await prisma.pharmacy.update({ where: { id: A.pharmacyId }, data: { partnerPilot: true } });
  check("marque en test : visible du groupe pilote", (await seenBy(A))?.catalog === true);
  check("et toujours pas de B", (await seenBy(B))?.catalog !== true);

  console.log("Aucune donnée patient");
  const columns = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `select table_name, column_name from information_schema.columns where table_schema = current_schema() and (table_name like 'partner%' or table_name = 'pharmacy_partner_preferences')`,
  );
  const tables = new Set(columns.map((c) => c.table_name));
  check("17 tables partenaires", tables.size === 17, [...tables]);
  const suspicious = columns.filter((c) => /patient|prescription|ordonnance|recommendation|opportunit/i.test(c.column_name));
  check("aucune colonne patient, ordonnance ou conseil", suspicious.length === 0, suspicious);
}

try {
  await main();
} finally {
  // Seulement ce que ce passage a créé : les organisations emportent officines,
  // audiences, préférences, attributions, leads et commandes ; le partenaire, ses marques.
  for (const id of partnerIds) await prisma.partner.delete({ where: { id } }).catch(() => undefined);
  for (const id of orgIds) await prisma.organization.delete({ where: { id } });
  await prisma.extranetNotification.deleteMany({ where: { audience: "ADMIN", type: { in: ["PARTNER_LEAD", "PARTNER_ORDER"] }, createdAt: { gte: startedAt }, body: { contains: run } } });
  await prisma.auditLog.deleteMany({ where: { userId: { startsWith: run } } });
  await prisma.$disconnect();
}
console.log(failures === 0 ? "\nIsolation partenaires : tous les contrôles passent." : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
