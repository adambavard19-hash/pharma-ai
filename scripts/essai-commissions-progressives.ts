/**
 * Essai sur la VRAIE base de la grille progressive des commerciaux : rangs par
 * date d'activation, total historique qui ne baisse pas quand un dossier est
 * perdu, prévision avant activation, commissions payées ou facturées jamais
 * touchées, bonus créé UNE fois même sous recalculs simultanés, bonus acquis
 * seulement au premier paiement (une facture à 0 € ne compte pas), activation
 * créditée une fois pour toutes (une réaffectation ne change aucun montant),
 * paliers d'avant la grille, règle d'origine gardée à la signature, commission
 * provisoire non facturable, changement de règle, « Acquis ce mois ».
 * Tout ce qui est créé porte « ZZ Grille » et est supprimé à la fin (ou gardé
 * avec --garder, pour un essai à l'écran).
 *
 *   npm run essai:commissions
 */
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { setProspectStatus, reassignProspect } from "@/server/services/sales/prospects";
import { syncProgressiveCommissions, activatedPharmaciesOf, salesRepsOfOrganization } from "@/server/services/sales/progressive-commissions";
import { listCommissionsFor, updateCommission, upsertCommissionForContract, commissionOverviewFor } from "@/server/services/sales/commissions";
import { listInvoiceableCommissions } from "@/server/services/sales/director-money";
import { updateSalesRep } from "@/server/services/sales/reps";
import { rateForRank } from "@/core/sales/progressive-commission";

const keep = process.argv.includes("--garder");
const TAG = "ZZ Grille";
const EMAIL_DOMAIN = "zz-grille.test";
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const started = new Date();
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 9, 0, 0));

async function clean(): Promise<number> {
  const reps = await prisma.salesRep.findMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } }, select: { id: true } });
  const repIds = reps.map((rep) => rep.id);
  const prospects = await prisma.prospect.findMany({ where: { OR: [{ name: { startsWith: TAG } }, { salesRepId: { in: repIds } }, { activationSalesRepId: { in: repIds } }] }, select: { id: true, pharmacyId: true } });
  const prospectIds = prospects.map((prospect) => prospect.id);
  const commissions = await prisma.commission.findMany({ where: { OR: [{ salesRepId: { in: repIds } }, { prospectId: { in: prospectIds } }] }, select: { id: true } });
  await prisma.commission.deleteMany({ where: { id: { in: commissions.map((row) => row.id) } } });
  await prisma.salesInvoice.deleteMany({ where: { salesRepId: { in: repIds } } });
  const pharmacies = await prisma.pharmacy.findMany({ where: { name: { startsWith: TAG } }, select: { id: true, organizationId: true } });
  await prisma.prospect.deleteMany({ where: { id: { in: prospectIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...prospectIds, ...commissions.map((row) => row.id), ...repIds] } } });
  await prisma.extranetNotification.deleteMany({ where: { salesRepId: { in: repIds } } });
  await prisma.extranetNotification.deleteMany({ where: { audience: "ADMIN", OR: [{ title: { contains: TAG } }, { body: { contains: TAG } }] } });
  await prisma.salesRepSession.deleteMany({ where: { salesRepId: { in: repIds } } });
  await prisma.salesRep.deleteMany({ where: { id: { in: repIds } } });
  for (const pharmacy of pharmacies) {
    await prisma.subscription.deleteMany({ where: { organizationId: pharmacy.organizationId } });
    await prisma.pharmacy.delete({ where: { id: pharmacy.id } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: pharmacy.organizationId } }).catch(() => undefined);
  }
  return reps.length + prospects.length;
}

/** Un commercial d'essai ; à la grille depuis `since` (par défaut : avant toutes les activations d'essai). */
async function rep(label: string, type: "PROGRESSIVE" | "PERCENT", since: Date | null = day(-1)) {
  return prisma.salesRep.create({ data: { email: `${label.toLowerCase()}@${EMAIL_DOMAIN}`, firstName: "Essai", lastName: `${TAG} ${label}`, commissionType: type, commissionValue: type === "PERCENT" ? 1000 : 0, progressiveSince: type === "PROGRESSIVE" ? since : null } });
}

/** Un dossier avec son officine (pour les paiements) et sa commission, de grille par défaut, prévisionnelle ou acquise. */
async function dossier(salesRepId: string, index: number, status: "FORECAST" | "EARNED" = "EARNED", type: "PROGRESSIVE" | "FIXED" | "PERCENT" = "PROGRESSIVE", amountCents = 1) {
  const stamp = `${Date.now()}-${index}-${randomBytes(3).toString("hex")}`;
  const org = await prisma.organization.create({ data: { name: `${TAG} P${index}`, slug: `zz-grille-${stamp}` } });
  const pharmacy = await prisma.pharmacy.create({ data: { organizationId: org.id, name: `${TAG} P${index}`, slug: `zz-grille-${stamp}`, city: "Zzville", postalCode: "99000", isDemo: false, isActive: true } });
  const prospect = await prisma.prospect.create({ data: { name: `${TAG} P${index}`, salesRepId, status: "PHARMACY_CREATED", pharmacyId: pharmacy.id } });
  const commission = await prisma.commission.create({ data: { prospectId: prospect.id, salesRepId, type, amountCents, status, earnedAt: status === "EARNED" ? new Date() : null } });
  return { prospectId: prospect.id, organizationId: org.id, commissionId: commission.id, index };
}

/** Une activation datée, comme l'écrivent les chemins d'activation (statut, première activation créditée, événement). */
async function activate(prospectId: string, at: Date) {
  const current = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId }, select: { salesRepId: true } });
  await prisma.prospect.update({ where: { id: prospectId }, data: { status: "ACTIVATED", activatedAt: at, activationSalesRepId: current.salesRepId } });
  await prisma.prospectEvent.create({ data: { prospectId, type: "STATUS_CHANGED", summary: "Essai : officine activée.", actorType: "SYSTEM", actorLabel: "Essai", metadata: { to: "ACTIVATED" }, createdAt: at } });
}

async function contractFor(prospectId: string) {
  return prisma.contract.create({ data: { prospectId, version: 1, templateKey: "essai", fileKey: "essai", accessTokenHash: `zz-grille-${randomBytes(8).toString("hex")}`, monthlyPriceCents: 12_600, durationMonths: 12, pharmacySignerName: "Essai", pharmacySignerEmail: `p@${EMAIL_DOMAIN}`, companySignerName: "Essai", companySignerEmail: `c@${EMAIL_DOMAIN}` } });
}

async function pay(organizationId: string, planId: string, cents: number) {
  const subscription = (await prisma.subscription.findUnique({ where: { organizationId } })) ?? (await prisma.subscription.create({ data: { organizationId, planId, status: "ACTIVE" } }));
  await prisma.billingPayment.create({ data: { subscriptionId: subscription.id, organizationId, stripeInvoiceId: `zz_grille_${Date.now()}_${randomBytes(3).toString("hex")}`, status: "PAID", amountCents: cents, paidAt: new Date() } });
}

const amountOf = async (commissionId: string) => (await prisma.commission.findUniqueOrThrow({ where: { id: commissionId }, select: { amountCents: true } })).amountCents;
const rowOf = (commissionId: string) => prisma.commission.findUniqueOrThrow({ where: { id: commissionId } });
const bonusRows = (salesRepId: string) => prisma.commission.findMany({ where: { salesRepId, type: "BONUS" }, orderBy: { bonusTier: "asc" } });
const notifications = (salesRepId: string, type: string) => prisma.extranetNotification.count({ where: { salesRepId, type } });
const amountsOf = async (salesRepId: string) => Object.fromEntries((await prisma.commission.findMany({ where: { salesRepId }, select: { id: true, amountCents: true } })).map((row) => [row.id, row.amountCents]));

async function main() {
  console.log("restes d'un essai précédent nettoyés :", await clean());
  const admin = await prisma.platformAdmin.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!admin) throw new Error("Aucun administrateur plateforme en base.");
  const adminActor = { type: "ADMIN" as const, id: admin.id, label: "Essai grille" };
  const plan = await prisma.plan.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!plan) throw new Error("Aucune offre en base.");

  const A = await rep("A", "PROGRESSIVE");
  const B = await rep("B", "PROGRESSIVE");
  const C = await rep("C", "PERCENT");

  // 12 dossiers pour A : 10 vont être activés, 2 restent avant activation (prévision).
  const P: Awaited<ReturnType<typeof dossier>>[] = [];
  for (let i = 1; i <= 12; i += 1) P.push(await dossier(A.id, i, i <= 10 ? "EARNED" : "FORECAST"));

  // 1. Neuf activations : 200 € chacune, aucun bonus.
  for (let i = 0; i < 9; i += 1) await activate(P[i].prospectId, day(i + 1));
  let report = await syncProgressiveCommissions(A.id);
  check(report.activated === 9, "9 pharmacies activées comptées", JSON.stringify(report));
  check((await Promise.all(P.slice(0, 9).map((p) => amountOf(p.commissionId)))).every((cents) => cents === 20_000), "rangs 1 à 9 : 200 € chacune");
  check((await bonusRows(A.id)).length === 0, "aucun bonus avant la 10e");
  const forecasts = await Promise.all([P[9], P[10], P[11]].map((p) => amountOf(p.commissionId)));
  check(forecasts.every((cents) => cents === 25_000), "pas encore activées : prévision = commission de la prochaine (10e → 250 €)", forecasts.join(", "));

  // 1 bis. Une commission de grille ACQUISE (contrat signé) d'une pharmacie pas encore activée : montant provisoire, pas facturable.
  let invoiceable = new Set((await listInvoiceableCommissions()).map((row) => row.id));
  check(!invoiceable.has(P[9].commissionId) && invoiceable.has(P[0].commissionId), "facturable : la 1re (activée) oui ; la 10e, signée mais pas activée (montant provisoire), non");

  // 2. Une commission payée et une facturée, à des montants que la grille voudrait changer : jamais touchées.
  await prisma.commission.update({ where: { id: P[4].commissionId }, data: { status: "PAID", amountCents: 12_345, paidAt: new Date() } });
  const invoice = await prisma.salesInvoice.create({ data: { salesRepId: A.id, number: "ZZ-1", amountCents: 11_111, issuedAt: new Date(), createdByType: "ADMIN", createdByLabel: "Essai" } });
  await prisma.commission.update({ where: { id: P[5].commissionId }, data: { amountCents: 11_111, invoiceId: invoice.id } });

  // 3. La 10e est activée, puis HUIT recalculs partent en même temps : un seul crée le bonus, une seule notification.
  await activate(P[9].prospectId, day(10));
  const parallel = await Promise.all(Array.from({ length: 8 }, () => syncProgressiveCommissions(A.id)));
  let bonuses = await bonusRows(A.id);
  check(bonuses.length === 1, "8 recalculs simultanés : un seul bonus Bronze en base", `${bonuses.length} ligne(s)`);
  check(parallel.reduce((total, r) => total + r.bonusesCreated.length, 0) === 1, "un seul des 8 recalculs l'a créé", parallel.map((r) => r.bonusesCreated.length).join(","));
  check(parallel.reduce((total, r) => total + r.amountUpdates, 0) === 0, "aucun montant réécrit en double", parallel.map((r) => r.amountUpdates).join(","));
  check(bonuses[0]?.bonusTier === 10 && bonuses[0].amountCents === 20_000 && bonuses[0].status === "FORECAST" && bonuses[0].prospectId === P[9].prospectId, "bonus Bronze : +200 €, prévisionnel, rattaché à la 10e", JSON.stringify(bonuses.map((b) => [b.bonusTier, b.status, b.amountCents])));
  check((await notifications(A.id, "BONUS_UNLOCKED")) === 1, "le commercial est prévenu une seule fois : « Bonus Bronze débloqué »");
  check((await amountOf(P[9].commissionId)) === 25_000, "la 10e vaut 250 €");
  check((await amountOf(P[10].commissionId)) === 25_000 && (await amountOf(P[11].commissionId)) === 25_000, "prévision des dossiers pas encore activés = la 11e (250 €)");
  check((await amountOf(P[4].commissionId)) === 12_345, "commission PAYÉE inchangée");
  check((await amountOf(P[5].commissionId)) === 11_111, "commission FACTURÉE inchangée");
  invoiceable = new Set((await listInvoiceableCommissions()).map((row) => row.id));
  check(invoiceable.has(P[9].commissionId), "activée, la 10e devient facturable, à son montant définitif");

  // 5. Base de données : un second bonus du même palier est impossible.
  const duplicate = await prisma.commission.create({ data: { prospectId: P[0].prospectId, salesRepId: A.id, type: "BONUS", bonusTier: 10, amountCents: 20_000 } }).then(() => "créé", (error: { code?: string }) => error.code ?? "erreur");
  check(duplicate === "P2002", "l'index unique refuse un second bonus Bronze", duplicate);

  // 6. Rang par date d'activation : la 10e est antidatée avant toutes les autres (correction de données).
  await prisma.prospect.update({ where: { id: P[9].prospectId }, data: { activatedAt: day(0) } });
  report = await syncProgressiveCommissions(A.id);
  const ranked = await activatedPharmaciesOf(A.id);
  check(ranked[0].prospectId === P[9].prospectId, "l'activation la plus ancienne prend le rang 1");
  check((await amountOf(P[9].commissionId)) === 20_000 && (await amountOf(P[8].commissionId)) === 25_000, "les montants suivent le nouveau rang (rang 1 → 200 €, la 9e devenue 10e → 250 €)");
  bonuses = await bonusRows(A.id);
  check(bonuses[0].prospectId === P[8].prospectId && report.bonusesRelinked === 1, "le bonus prévisionnel suit la pharmacie qui atteint AUJOURD'HUI le palier");
  // Égalité de date : départage stable par identifiant.
  await prisma.prospect.updateMany({ where: { id: { in: [P[0].prospectId, P[1].prospectId] } }, data: { activatedAt: day(1) } });
  const tied = (await activatedPharmaciesOf(A.id)).filter((a) => a.prospectId === P[0].prospectId || a.prospectId === P[1].prospectId);
  check(tied[0].prospectId === [P[0].prospectId, P[1].prospectId].sort()[0], "deux activations à la même seconde : départagées par l'identifiant");

  // 7. Un dossier perdu après activation ne fait pas baisser le total historique.
  await setProspectStatus(P[2].prospectId, "LOST", adminActor, "Essai");
  check((await activatedPharmaciesOf(A.id)).length === 10, "dossier perdu après activation : toujours 10 activées");
  report = await syncProgressiveCommissions(A.id);
  check(report.amountUpdates === 0 && report.bonusesCreated.length === 0, "rien ne change au recalcul", JSON.stringify(report));

  // 8. Premier paiement : 0 € ne compte pas ; 126 € oui, et le bonus devient acquis, une fois.
  const threshold = P[8];
  await pay(threshold.organizationId, plan.id, 0);
  await syncProgressiveCommissions(A.id);
  check((await bonusRows(A.id))[0].status === "FORECAST", "facture d'essai à 0 € : le bonus attend toujours");
  await pay(threshold.organizationId, plan.id, 12_600);
  check((await salesRepsOfOrganization(threshold.organizationId)).includes(A.id), "le paiement retrouve le commercial du dossier");
  report = await syncProgressiveCommissions(A.id);
  bonuses = await bonusRows(A.id);
  check(bonuses[0].status === "EARNED" && bonuses[0].dueAt !== null && bonuses[0].earnedAt !== null && report.bonusesEarned.includes("Bronze"), "premier paiement reçu : bonus Bronze acquis, échéance et date d'acquisition posées");
  await syncProgressiveCommissions(A.id);
  check((await notifications(A.id, "BONUS_EARNED")) === 1, "« Bonus Bronze acquis » notifié une seule fois");
  // Une fois acquis, le bonus ne recule jamais : même si la pharmacie du palier change de rang.
  await prisma.prospect.update({ where: { id: P[8].prospectId }, data: { activatedAt: day(2) } });
  await syncProgressiveCommissions(A.id);
  bonuses = await bonusRows(A.id);
  check(bonuses[0].status === "EARNED" && bonuses[0].prospectId === P[8].prospectId, "bonus acquis : ni rétrogradé ni déplacé");

  // 9. Jusqu'à 25 : bonus Argent ; total cohérent avec la grille.
  for (let i = 13; i <= 26; i += 1) {
    const extra = await dossier(A.id, i);
    await activate(extra.prospectId, day(20 + i));
    P.push(extra);
  }
  report = await syncProgressiveCommissions(A.id);
  check(report.activated === 24 && (await bonusRows(A.id)).length === 1, "24 activées : toujours un seul bonus");
  // La 25e par le VRAI chemin d'activation de la console : statut + première activation d'un bloc, puis recalcul déclenché tout seul.
  const set = await setProspectStatus(P[10].prospectId, "ACTIVATED", adminActor);
  check(set.ok, "activation de la 25e par la console");
  const stamped = await prisma.prospect.findUniqueOrThrow({ where: { id: P[10].prospectId }, select: { activatedAt: true, activationSalesRepId: true } });
  check(stamped.activatedAt !== null && stamped.activationSalesRepId === A.id, "la console pose la première activation, créditée au commercial du dossier");
  bonuses = await bonusRows(A.id);
  check((await activatedPharmaciesOf(A.id)).length === 25 && bonuses.length === 2 && bonuses[1].bonusTier === 25 && bonuses[1].amountCents === 35_000 && bonuses[1].prospectId === P[10].prospectId, "25 activées : bonus Argent (+350 €) créé par le recalcul automatique", JSON.stringify(bonuses.map((b) => [b.bonusTier, b.status])));
  check((await amountOf(P[10].commissionId)) === 30_000, "la 25e vaut 300 €");
  const ranks = await activatedPharmaciesOf(A.id);
  const expected = await Promise.all(ranks.map(async (a) => ({ rank: a.rank, cents: await prisma.commission.findFirst({ where: { prospectId: a.prospectId, type: "PROGRESSIVE" }, select: { id: true, amountCents: true, status: true, invoiceId: true } }) })));
  check(expected.every(({ rank, cents }) => !cents || cents.status === "PAID" || cents.invoiceId || cents.amountCents === rateForRank(rank)), "chaque commission modifiable vaut exactement la commission de son rang");
  // Une seconde activation (connexion du titulaire après la console) ne change pas la première.
  await setProspectStatus(P[10].prospectId, "ACTIVATED", adminActor);
  const restamped = await prisma.prospect.findUniqueOrThrow({ where: { id: P[10].prospectId }, select: { activatedAt: true } });
  check(restamped.activatedAt?.getTime() === stamped.activatedAt?.getTime(), "réactivé : la date de première activation ne bouge pas");

  // 10. Réaffectation d'un dossier ACTIVÉ (commission acquise) : rien ne bouge, ni chez A, ni chez B.
  const beforeA = await amountsOf(A.id);
  await reassignProspect(P[20].prospectId, B.id, admin.id, "Essai grille");
  check((await activatedPharmaciesOf(A.id)).length === 25 && (await activatedPharmaciesOf(B.id)).length === 0, "réaffectation d'un dossier activé : A garde ses 25 activations, B n'en reçoit aucune");
  const afterA = await amountsOf(A.id);
  check(JSON.stringify(afterA) === JSON.stringify(beforeA), "aucun montant de A ne change (ni la pharmacie partie, ni les rangs suivants)");
  check((await rowOf(P[20].commissionId)).salesRepId === A.id && (await bonusRows(A.id)).length === 2 && (await bonusRows(B.id)).length === 0, "la commission et les bonus restent au commercial crédité");

  // 10 bis. Réaffectation d'un dossier PAS ENCORE activé : sa prévision suit et se recalcule chez B ; activé chez B, il compte pour B.
  const moving = await dossier(A.id, 60, "FORECAST");
  await syncProgressiveCommissions(A.id);
  check((await amountOf(moving.commissionId)) === 30_000, "chez A (25 activées), la prévision vaut 300 €");
  await reassignProspect(moving.prospectId, B.id, admin.id, "Essai grille");
  const moved = await rowOf(moving.commissionId);
  check(moved.salesRepId === B.id && moved.amountCents === 20_000, "chez B (0 activée), la prévision suit le dossier et vaut 200 €", `${moved.salesRepId === B.id} ${moved.amountCents}`);
  await setProspectStatus(moving.prospectId, "ACTIVATED", adminActor);
  check((await activatedPharmaciesOf(B.id)).length === 1 && (await activatedPharmaciesOf(A.id)).length === 25, "activé chez B : 1 pour B, toujours 25 pour A");

  // 10 ter. Signé chez A (commission acquise, reste à A), réaffecté puis activé chez B : la commission de A garde son montant.
  const signed = await dossier(A.id, 61, "EARNED");
  await syncProgressiveCommissions(A.id);
  const signedAmount = await amountOf(signed.commissionId);
  await reassignProspect(signed.prospectId, B.id, admin.id, "Essai grille");
  await setProspectStatus(signed.prospectId, "ACTIVATED", adminActor);
  await syncProgressiveCommissions(A.id);
  check((await rowOf(signed.commissionId)).salesRepId === A.id && (await amountOf(signed.commissionId)) === signedAmount, "commission de A pour une activation créditée à B : figée à son montant", `${signedAmount}`);

  // 11. Contrat d'un commercial à la grille : prévision = commission de la prochaine activation.
  const next = await dossier(A.id, 99, "FORECAST");
  await prisma.commission.delete({ where: { id: next.commissionId } });
  const contract = await contractFor(next.prospectId);
  await upsertCommissionForContract({ prospectId: next.prospectId, contractId: contract.id, status: "FORECAST", actor: { type: "SYSTEM", label: "Essai" } });
  const forecast = await prisma.commission.findFirst({ where: { prospectId: next.prospectId, type: { not: "BONUS" } } });
  check(forecast?.type === "PROGRESSIVE" && forecast.amountCents === rateForRank(26), "contrat envoyé : commission PROGRESSIVE prévisionnelle à 300 € (26e)", `${forecast?.type} ${forecast?.amountCents}`);

  // 12. Montant fixé à la main : la grille ne le recalcule plus, ni le recalcul, ni la signature du contrat.
  await updateCommission(forecast!.id, { amountCents: 27_000 }, { type: "ADMIN", id: admin.id, label: "Essai grille" });
  await syncProgressiveCommissions(A.id);
  await upsertCommissionForContract({ prospectId: next.prospectId, contractId: contract.id, status: "EARNED", actor: { type: "SYSTEM", label: "Essai" } });
  const pinned = await rowOf(forecast!.id);
  check(pinned.type === "FIXED" && pinned.amountCents === 27_000 && pinned.status === "EARNED" && pinned.earnedAt !== null, "montant saisi à la main : gardé à la signature du contrat (acquis, 270 €)", `${pinned.type} ${pinned.amountCents} ${pinned.status}`);

  // 12 bis. Montant fixe d'avant la grille, contrat envoyé avant le passage : la signature garde 300 €.
  const legacy = await dossier(A.id, 98, "FORECAST", "FIXED", 30_000);
  const legacyContract = await contractFor(legacy.prospectId);
  await upsertCommissionForContract({ prospectId: legacy.prospectId, contractId: legacyContract.id, status: "EARNED", actor: { type: "SYSTEM", label: "Essai" } });
  const legacyRow = await rowOf(legacy.commissionId);
  check(legacyRow.type === "FIXED" && legacyRow.amountCents === 30_000 && legacyRow.status === "EARNED", "prévision au montant fixe d'avant la grille : 300 € gardés à la signature", `${legacyRow.type} ${legacyRow.amountCents}`);

  // 12 ter. Une commission déjà facturée n'est jamais touchée par un contrat.
  const billed = await dossier(A.id, 97, "EARNED");
  await syncProgressiveCommissions(A.id);
  await prisma.commission.update({ where: { id: billed.commissionId }, data: { invoiceId: invoice.id } });
  const billedBefore = await rowOf(billed.commissionId);
  await upsertCommissionForContract({ prospectId: billed.prospectId, contractId: (await contractFor(billed.prospectId)).id, status: "EARNED", actor: { type: "SYSTEM", label: "Essai" } });
  const billedAfter = await rowOf(billed.commissionId);
  check(billedAfter.amountCents === billedBefore.amountCents && billedAfter.type === billedBefore.type && billedAfter.updatedAt.getTime() === billedBefore.updatedAt.getTime(), "facturée : la signature du contrat n'y touche pas");

  // 13. Commercial hors grille : rien n'est fait.
  const other = await dossier(C.id, 50, "EARNED", "PERCENT");
  await activate(other.prospectId, day(1));
  report = await syncProgressiveCommissions(C.id);
  check(!report.gridActive && (await bonusRows(C.id)).length === 0 && (await amountOf(other.commissionId)) === 1, "commercial au pourcentage : la grille ne touche à rien");

  // 14. Paliers atteints AVANT le passage à la grille : pas de bonus d'office ; un palier atteint depuis, oui.
  const D = await rep("D", "PROGRESSIVE", day(30));
  for (let i = 0; i < 10; i += 1) {
    const old = await dossier(D.id, 200 + i, "EARNED", "FIXED", 30_000);
    await activate(old.prospectId, day(i + 1));
  }
  report = await syncProgressiveCommissions(D.id);
  check(report.bonusesCreated.length === 0 && report.preGridBonuses.join() === "Bronze" && (await bonusRows(D.id)).length === 0, "Bronze atteint avant la grille : pas de bonus créé d'office", JSON.stringify(report));
  const overview = await commissionOverviewFor(D.id);
  check(overview.beforeGridTiers.join() === "10", "la page le dit : palier 10 « atteint avant la grille »");
  report = await syncProgressiveCommissions(D.id, { includePreGridBonuses: true });
  check(report.bonusesCreated.join() === "Bronze", "rattrapage explicite (--bonus-retroactifs) : le bonus est créé");
  const E = await rep("E", "PROGRESSIVE", day(5));
  for (let i = 0; i < 10; i += 1) {
    const recent = await dossier(E.id, 300 + i, "EARNED");
    await activate(recent.prospectId, day(i + 1));
  }
  report = await syncProgressiveCommissions(E.id);
  check(report.bonusesCreated.join() === "Bronze", "10e activation APRÈS le passage à la grille : bonus créé, même si les premières sont d'avant");

  // 15. Changement de règle : passage à la grille daté ; sortie de la grille : le bonus en attente devient acquis au paiement.
  await updateSalesRep(C.id, { commissionType: "PROGRESSIVE" }, admin.id);
  const switched = await prisma.salesRep.findUniqueOrThrow({ where: { id: C.id }, select: { progressiveSince: true } });
  check(switched.progressiveSince !== null && switched.progressiveSince.getTime() > started.getTime(), "passage à la grille par la console : date de passage posée");
  const eBonus = (await bonusRows(E.id))[0];
  await updateSalesRep(E.id, { commissionType: "PERCENT", commissionValue: 1000 }, admin.id);
  const eThreshold = await prisma.prospect.findUniqueOrThrow({ where: { id: eBonus.prospectId }, select: { pharmacy: { select: { organizationId: true } } } });
  await pay(eThreshold.pharmacy!.organizationId, plan.id, 12_600);
  report = await syncProgressiveCommissions(E.id);
  check(!report.gridActive && report.bonusesEarned.join() === "Bronze" && report.bonusesCreated.length === 0, "sorti de la grille : son bonus en attente devient acquis au premier paiement, rien d'autre", JSON.stringify(report));

  // 16. « Acquis ce mois » : une commission créée le mois dernier et acquise aujourd'hui compte ce mois-ci.
  const lastMonth = new Date(Date.now() - 40 * 24 * 3600 * 1000);
  const late = await dossier(B.id, 400, "FORECAST");
  await prisma.commission.update({ where: { id: late.commissionId }, data: { createdAt: lastMonth } });
  const thisMonthBefore = (await listCommissionsFor(B.id)).thisMonthCents;
  await updateCommission(late.commissionId, { status: "EARNED" }, { type: "ADMIN", id: admin.id, label: "Essai grille" });
  const thisMonthAfter = (await listCommissionsFor(B.id)).thisMonthCents;
  const lateAmount = await amountOf(late.commissionId);
  check(thisMonthAfter - thisMonthBefore === lateAmount, "acquise aujourd'hui, créée il y a 40 jours : comptée dans « Acquis ce mois »", `${thisMonthBefore} → ${thisMonthAfter}`);

  // 17. Idempotence.
  await syncProgressiveCommissions(A.id);
  report = await syncProgressiveCommissions(A.id);
  check(report.amountUpdates === 0 && report.bonusesCreated.length === 0 && report.bonusesEarned.length === 0 && report.bonusesRelinked === 0, "deux recalculs de suite : le second n'écrit rien");

  console.log(`\nDurée : ${Math.round((Date.now() - started.getTime()) / 100) / 10} s`);
  if (keep) console.log("Données gardées (--garder) : relancez sans l'option pour les supprimer.");
  else console.log("nettoyage :", await clean());
  console.log(failures === 0 ? "\nTOUT EST BON" : `\n${failures} ÉCHEC(S)`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch(async (error) => {
    console.error(error);
    if (!keep) await clean().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
