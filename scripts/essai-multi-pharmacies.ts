/**
 * Essai SaaS : plusieurs pharmacies INDÉPENDANTES, plusieurs postes, des gestes SIMULTANÉS, des stocks différents, une pharmacie neuve
 * sans historique — sur la vraie application et la vraie base. Crée trois pharmacies « ZZ Multi », joue le scénario, vérifie
 * l'isolation (aucune lecture ni écriture d'une pharmacie sur une autre), la concurrence (bips simultanés, « Vente terminée » en
 * triple, un seul bilan) et l'association centrale retrouvée dans le stock de chacune, puis supprime tout.
 *
 * Prérequis : l'application tourne sur http://localhost:3000 (npm run live).
 *   npm run essai:multi
 */
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { hashPassword } from "@/server/security/password";
import { drugKey } from "@/core/ai/engines/associations";
import { assignComptoir, myComptoirs } from "@/server/services/comptoirs";
import { listLiveCounterSales, closeLiveCounterSales } from "@/server/services/counter-scan";
import { loadCounterDashboard } from "@/server/services/counter-dashboard";
import { loadTeamRanking } from "@/server/services/team-ranking";
import { resolvePeriod } from "@/core/analytics/periods";

const BASE = "http://localhost:3000";
const CIP = "3400930234259"; // AMOXICILLINE KRKA 1 g
const ASSOC_EAN = "9990000000101";
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`); if (!ok) failures += 1; };
const key = () => { const t = generateToken(); return typeof t === "string" ? t : (t as { token: string }).token; };

type Ph = { id: string; orgId: string; ownerId: string; name: string };
async function pharmacy(label: string, withStock: boolean): Promise<Ph> {
  const name = `ZZ Multi ${label}`;
  const org = await prisma.organization.create({ data: { name, slug: `zz-multi-${label.toLowerCase()}-${Date.now()}` } });
  const ph = await prisma.pharmacy.create({ data: { organizationId: org.id, name, slug: `zz-multi-${label.toLowerCase()}-${Date.now()}`, isDemo: false, isActive: true, ...(withStock ? { stockSyncedAt: new Date() } : {}) } });
  const owner = await prisma.user.create({ data: { organizationId: org.id, email: `zz-multi-${label.toLowerCase()}-${Date.now()}@pharma.test`, firstName: "ZZ", lastName: label, passwordHash: await hashPassword("x".repeat(24)), status: "ACTIVE" } });
  await prisma.membership.create({ data: { userId: owner.id, pharmacyId: ph.id, role: "OWNER", isActive: true } });
  return { id: ph.id, orgId: org.id, ownerId: owner.id, name };
}
async function product(ph: Ph, name: string, ref: string, tags: string[], price: number, qty: number, ean: string | null = null) {
  const p = await prisma.product.create({ data: { pharmacyId: ph.id, organizationId: ph.orgId, name, reference: ref, ean, category: "PROBIOTIQUES", matchingTags: tags, salePriceCents: price, classifiedAt: new Date(), classificationSource: "HEURISTIC" } });
  await prisma.stockItem.create({ data: { pharmacyId: ph.id, productId: p.id, quantity: qty, alertThreshold: 2 } });
  return p;
}
async function poste(ph: Ph, label: string) {
  const k = key();
  await prisma.counterPost.create({ data: { pharmacyId: ph.id, hostname: `ZZ-${label}`, label, keyHash: hashToken(k), pairedAt: new Date() } });
  return { key: k, label, ph };
}
const api = (p: { key: string }, path: string, init: RequestInit = {}) => fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" } });

async function clean() {
  const old = await prisma.pharmacy.findMany({ where: { name: { startsWith: "ZZ Multi" } }, select: { id: true, organizationId: true } });
  await prisma.centralAssociation.deleteMany({ where: { adviceEan: ASSOC_EAN } });
  for (const ph of old) {
    await prisma.emailDispatch.deleteMany({ where: { pharmacyId: ph.id } });
    await prisma.counterPost.deleteMany({ where: { pharmacyId: ph.id } });
    await prisma.pharmacy.delete({ where: { id: ph.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { organizationId: ph.organizationId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: ph.organizationId } }).catch(() => undefined);
  }
  return old.length;
}

async function main() {
  console.log("restes d'un essai précédent nettoyés :", await clean());
  const A = await pharmacy("A", true), B = await pharmacy("B", true), C = await pharmacy("C", false);
  const tags = ["probiotique", "flore intestinale", "tolérance digestive"];
  await product(A, "ZZ FLORE A 10 milliards", "ZZ-A1", tags, 1490, 10);
  await product(A, "ZZ ASSOCIE VENDU CHEZ A", "ZZ-A2", ["sérum", "nez"], 590, 4, ASSOC_EAN);
  await product(B, "ZZ LACTO B probiotique", "ZZ-B1", tags, 1990, 5);
  await product(B, "ZZ ASSOCIE VENDU CHEZ B", "ZZ-B2", ["sérum", "nez"], 750, 7, ASSOC_EAN);
  // C : pharmacie neuve, sans aucun stock ni historique.
  await prisma.centralAssociation.create({ data: { triggerKind: "MEDICINE", triggerKey: drugKey("AMOXICILLINE KRKA 1 g, comprimé"), triggerLabel: "AMOXICILLINE KRKA 1 g", adviceEan: ASSOC_EAN, adviceLabel: "Produit associé central", sentence: "ZZ essai association centrale" } });

  // Deux collaborateurs dans la pharmacie A, chacun à son comptoir.
  const member = async (ph: Ph, first: string) => {
    const user = await prisma.user.create({ data: { organizationId: ph.orgId, email: `zz-multi-${first.toLowerCase()}-${Date.now()}@pharma.test`, firstName: first, lastName: "ZZ", passwordHash: await hashPassword("x".repeat(24)), status: "ACTIVE" } });
    await prisma.membership.create({ data: { userId: user.id, pharmacyId: ph.id, role: "PHARMACIST", isActive: true } });
    return user.id;
  };
  const lea = await member(A, "Léa"), marc = await member(A, "Marc");
  const a1 = await poste(A, "A-caisse1"), a2 = await poste(A, "A-caisse2"), b1 = await poste(B, "B-caisse1"), c1 = await poste(C, "C-caisse1");
  const postes = [a1, a2, b1, c1];
  const ownerScopeA = { pharmacyId: A.id, organizationId: A.orgId, userId: A.ownerId } as never;
  const postId = async (p: { ph: Ph; label: string }) => (await prisma.counterPost.findFirstOrThrow({ where: { pharmacyId: p.ph.id, label: p.label } })).id;
  const [a1Id, a2Id, b1Id] = [await postId(a1), await postId(a2), await postId(b1)];
  check((await assignComptoir(ownerScopeA, a1Id, lea)).ok && (await assignComptoir(ownerScopeA, a2Id, marc)).ok, "le titulaire attribue le comptoir 1 à Léa et le comptoir 2 à Marc");
  check(!(await assignComptoir(ownerScopeA, b1Id, lea)).ok, "le titulaire de A ne peut pas attribuer le comptoir d'une autre pharmacie");
  check(!(await assignComptoir(ownerScopeA, a1Id, B.ownerId)).ok, "ni donner un comptoir à quelqu'un d'une autre pharmacie");

  console.log("\n— 4 postes de 3 pharmacies scannent EN MÊME TEMPS —");
  const scans = await Promise.all(postes.map(async (p) => (await (await api(p, "/api/agent/scans", { method: "POST", body: JSON.stringify({ code: CIP, post: p.label }) })).json()) as { ok: boolean; prescriptionId: string }));
  check(scans.every((s) => s.ok), "les 4 bips sont acceptés", scans.map((s) => s.ok).join(","));
  check(new Set(scans.map((s) => s.prescriptionId)).size === 4, "4 ventes distinctes (2 postes de A ne se mélangent pas)");

  const notices = await Promise.all(postes.map(async (p, i) => {
    for (let n = 0; n < 40; n++) {
      const body = await (await api(p, `/api/agent/conseil?prescription=${scans[i].prescriptionId}`)).json();
      if (body.state === "READY") return body;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }));
  check(notices.every(Boolean), "les 4 ventes sont analysées en parallèle");
  const names = (n: { items: { name: string }[] } | null) => (n?.items ?? []).map((i) => i.name);
  console.log("   A1:", names(notices[0]), "\n   A2:", names(notices[1]), "\n   B1:", names(notices[2]), "\n   C1:", names(notices[3]), notices[3]?.advice);
  check(names(notices[0]).every((n) => /ZZ .*A|Produit associé central/.test(n) || !n.startsWith("ZZ ")) && !names(notices[0]).some((n) => n.includes(" B")), "A ne voit que son propre stock");
  check(!names(notices[2]).some((n) => n.includes("CHEZ A") || n.includes("FLORE A")), "B ne voit rien du stock de A");
  check(names(notices[0]).some((n) => n.includes("CHEZ A")) && names(notices[2]).some((n) => n.includes("CHEZ B")), "l'association CENTRALE est retrouvée dans le stock de chaque pharmacie (son produit, son prix)");
  check(!names(notices[3]).some((n) => n.startsWith("ZZ")), "la pharmacie neuve sans stock ne reçoit aucun conseil de produit (et aucune erreur)", `state=${notices[3]?.state}`);
  check(JSON.stringify(names(notices[0])) === JSON.stringify(names(notices[1])), "deux postes de la même pharmacie : mêmes règles, ventes séparées");

  console.log("\n— isolation entre pharmacies —");
  const foreign = await api(b1, `/api/agent/conseil?prescription=${scans[0].prescriptionId}`);
  check(foreign.status === 404, "le poste de B ne peut pas lire la vente de A", `HTTP ${foreign.status}`);
  const rec = notices[0].items[0];
  const foreignDecision = await api(b1, "/api/agent/conseil/decision", { method: "POST", body: JSON.stringify({ prescription: scans[0].prescriptionId, recommendation: rec.id, outcome: "SOLD" }) });
  check(foreignDecision.status === 422, "le poste de B ne peut pas déclarer « Vendu » sur un conseil de A", `HTTP ${foreignDecision.status}`);
  const foreignFinish = await api(b1, "/api/agent/conseil/terminer", { method: "POST", body: JSON.stringify({ prescription: scans[0].prescriptionId }) });
  check(foreignFinish.status === 422, "le poste de B ne peut pas terminer la vente de A", `HTTP ${foreignFinish.status}`);

  console.log("\n— gestes simultanés dans la même pharmacie —");
  const [d1, d2] = await Promise.all([
    api(a1, "/api/agent/conseil/decision", { method: "POST", body: JSON.stringify({ prescription: scans[0].prescriptionId, recommendation: notices[0].items[0].id, outcome: "SOLD" }) }),
    api(a2, "/api/agent/conseil/decision", { method: "POST", body: JSON.stringify({ prescription: scans[1].prescriptionId, recommendation: notices[1].items[0].id, outcome: "NOT_SOLD" }) }),
  ]);
  check(d1.status === 200 && d2.status === 200, "deux collaborateurs répondent en même temps, chacun sur sa vente");
  const after = await Promise.all([a1, a2].map(async (p, i) => (await (await api(p, `/api/agent/conseil?prescription=${scans[i].prescriptionId}`)).json()) as { items: { outcome: string }[] }));
  check(after[0].items[0].outcome === "SOLD" && after[1].items[0].outcome === "NOT_SOLD", "chaque vente garde SA réponse");
  const declared = await prisma.recommendation.findMany({ where: { pharmacyId: A.id, outcomeSource: "COUNTER_DECLARED" }, select: { status: true, decidedByUserId: true } });
  check(declared.some((r) => r.status === "PURCHASED" && r.decidedByUserId === lea) && declared.some((r) => r.status === "DECLINED" && r.decidedByUserId === marc), "chaque déclaration est attribuée au collaborateur de SON comptoir");

  const mail = await api(a1, "/api/agent/conseil/email", { method: "POST", body: JSON.stringify({ prescription: scans[0].prescriptionId, email: "zz-patient@exemple.test", consent: true }) });
  check(mail.status === 200, "e-mail du patient enregistré avec accord");
  const finishes = await Promise.all([1, 2, 3].map(() => api(a1, "/api/agent/conseil/terminer", { method: "POST", body: JSON.stringify({ prescription: scans[0].prescriptionId }) }).then((r) => r.json() as Promise<{ ok: boolean; alreadyClosed: boolean; report: string }>)));
  check(finishes.filter((f) => f.ok && !f.alreadyClosed).length === 1, "3 « Vente terminée » simultanés : UN seul traitement", JSON.stringify(finishes.map((f) => f.alreadyClosed)));
  const dispatches = await prisma.emailDispatch.count({ where: { kind: "PATIENT_REPORT", pharmacyId: A.id } });
  check(dispatches === 1, "UN seul bilan écrit au patient", `${dispatches} envoi(s)`);
  const a2state = await (await api(a2, `/api/agent/conseil?prescription=${scans[1].prescriptionId}`)).json();
  check(a2state.state === "READY" && a2state.followUp.closed === false, "la vente de l'autre poste de A reste ouverte");
  const nextScan = await (await api(a1, "/api/agent/scans", { method: "POST", body: JSON.stringify({ code: CIP, post: a1.label }) })).json();
  check(nextScan.created === true && nextScan.prescriptionId !== scans[0].prescriptionId, "le patient suivant sur le même poste ouvre une NOUVELLE vente");

  console.log("\n— chaque comptoir est un espace à part (même pharmacie, collaborateurs différents) —");
  const scopeOf = (ph: Ph, userId: string) => ({ pharmacyId: ph.id, organizationId: ph.orgId, userId }) as never;
  const leaMine = await myComptoirs({ pharmacyId: A.id, userId: lea }), marcMine = await myComptoirs({ pharmacyId: A.id, userId: marc }), ownerMine = await myComptoirs({ pharmacyId: A.id, userId: A.ownerId });
  check(leaMine.postIds.join() === a1Id && marcMine.postIds.join() === a2Id, "Léa voit son comptoir, Marc le sien");
  check(ownerMine.mode === "NONE", "le titulaire, qui n'a pas de comptoir attribué, n'est pas dérangé par ceux des autres", ownerMine.mode);
  const leaLive = await listLiveCounterSales(A.id, leaMine.postIds), marcLive = await listLiveCounterSales(A.id, marcMine.postIds), ownerLive = await listLiveCounterSales(A.id, ownerMine.postIds);
  check(leaLive.length === 1 && leaLive[0].id === nextScan.prescriptionId, "l'écran de Léa ne montre que SA délivrance en cours (le patient suivant)");
  check(marcLive.length === 1 && marcLive[0].id === scans[1].prescriptionId, "l'écran de Marc ne montre que la sienne");
  check(ownerLive.length === 0, "le titulaire ne voit aucune délivrance en direct des autres");
  const bLive = await listLiveCounterSales(B.id, (await myComptoirs({ pharmacyId: B.id, userId: B.ownerId })).postIds);
  check(bLive.length === 1 && bLive[0].id === scans[2].prescriptionId, "dans la pharmacie B (un seul comptoir), le titulaire voit sa délivrance, sans rien régler");
  const leaBoard = await loadCounterDashboard(scopeOf(A, lea), new Date()), marcBoard = await loadCounterDashboard(scopeOf(A, marc), new Date()), ownerBoard = await loadCounterDashboard(scopeOf(A, A.ownerId), new Date());
  check(leaBoard.stats.detected === 2 && marcBoard.stats.detected === 1, "chacun ne compte que ses délivrances du jour", `Léa ${leaBoard.stats.detected}, Marc ${marcBoard.stats.detected}`);
  check(leaBoard.activity.length === 2 && leaBoard.activity.every((item) => item.id === nextScan.prescriptionId || item.id === scans[0].prescriptionId) && leaBoard.activity[0].lines.length >= 1, "l'activité de Léa : SES ordonnances seulement, avec leurs médicaments en dessous");
  check((leaBoard.activity[0].comptoir ?? "").includes("A-caisse1") && (leaBoard.activity[0].comptoir ?? "").includes("Léa"), "l'ordonnance dit de quel comptoir elle vient et à qui il est", leaBoard.activity[0].comptoir ?? "");
  check(ownerBoard.status.state === "UNASSIGNED" && ownerBoard.activity.length === 0, "le titulaire sans comptoir : « comptoir à choisir », aucune activité des autres");
  const closed = await closeLiveCounterSales({ pharmacyId: A.id, userId: lea }, undefined, leaMine.postIds);
  check(closed === 1 && (await listLiveCounterSales(A.id, marcMine.postIds)).length === 1, "« Nouveau patient » de Léa ne ferme que sa vente, jamais celle de Marc");

  console.log("\n— classement de l'équipe —");
  const board = await loadTeamRanking({ pharmacyId: A.id, isDemo: false }, resolvePeriod("today"));
  const rowOf = (id: string) => board.rows.find((row) => row.userId === id);
  check((rowOf(lea)?.proposed ?? 0) > 0 && (rowOf(marc)?.proposed ?? 0) > 0, "les conseils sont proposés à Léa et à Marc selon leur comptoir", `Léa ${rowOf(lea)?.proposed}, Marc ${rowOf(marc)?.proposed}`);
  check(rowOf(lea)?.validated === 1 && rowOf(marc)?.validated === 0, "le « Vendu » déclaré au comptoir 1 est validé pour Léa, pas pour Marc", `Léa ${rowOf(lea)?.validated}, Marc ${rowOf(marc)?.validated}`);
  const boardB = await loadTeamRanking({ pharmacyId: B.id, isDemo: false }, resolvePeriod("today"));
  check(boardB.rows.every((row) => row.userId === B.ownerId || row.userId === null), "le classement de B ne contient personne de A");

  console.log("\n— résultats par pharmacie —");
  const rows = await prisma.counterSaleFollowUp.groupBy({ by: ["pharmacyId"], where: { pharmacyId: { in: [A.id, B.id, C.id] } }, _count: true });
  check(rows.length === 1 && rows[0].pharmacyId === A.id, "seule A a des ventes terminées ; B et C n'ont rien (aucune fuite)");
  const soldA = await prisma.recommendation.count({ where: { pharmacyId: A.id, outcomeSource: "COUNTER_DECLARED", status: "PURCHASED" } });
  const soldOthers = await prisma.recommendation.count({ where: { pharmacyId: { in: [B.id, C.id] }, outcomeSource: "COUNTER_DECLARED" } });
  check(soldA === 1 && soldOthers === 0, "les déclarations « Vendu » ne comptent que chez A", `A=${soldA}, B+C=${soldOthers}`);

  // Nettoyage : tout ce qui est « ZZ Multi ».
  await prisma.centralAssociation.deleteMany({ where: { adviceEan: ASSOC_EAN } });
  await prisma.emailDispatch.deleteMany({ where: { pharmacyId: { in: [A.id, B.id, C.id] } } });
  for (const ph of [A, B, C]) {
    await prisma.counterPost.deleteMany({ where: { pharmacyId: ph.id } });
    await prisma.pharmacy.delete({ where: { id: ph.id } }).catch((e) => console.log("pharmacie non supprimée:", String(e.message).slice(0, 80)));
    await prisma.user.deleteMany({ where: { organizationId: ph.orgId } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: ph.orgId } }).catch((e) => console.log("organisation non supprimée:", String(e.message).slice(0, 80)));
  }
  const left = await prisma.pharmacy.count({ where: { name: { startsWith: "ZZ Multi" } } });
  console.log(`\nnettoyage : ${left} pharmacie(s) d'essai restante(s) ; ${failures === 0 ? "TOUT PASSE" : failures + " ÉCHEC(S)"}`);
}
main().catch((e) => { console.error("ERREUR", e instanceof Error ? e.message.slice(0, 400) : e); failures += 1; }).finally(() => prisma.$disconnect());
