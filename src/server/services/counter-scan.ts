import "server-only";
import { prisma } from "@/server/db/client";
import { readScannedCode } from "@/core/stock";
import { createWithReference } from "@/server/services/references";
import { recordIsDemo } from "@/server/db/demo-scope";
import { recordAudit } from "@/server/audit/log";
import type { AgentContext } from "@/server/services/stock-sync";
import { findOpenFactsName } from "@/server/services/product-images";

/**
 * Un bip de douchette au comptoir, capté par l'agent du poste de caisse.
 *
 * Le code-barres devient une ligne de délivrance : la boîte est identifiée
 * par son CIP dans le catalogue national, sans lecture ni devinette. Les bips
 * d'un même poste, à moins d'une minute l'un de l'autre, forment UNE
 * délivrance — celle du patient qui est au comptoir, donc une seule
 * ordonnance : c'est sur elle, en entier, que le conseil se construit. Le
 * stock de l'officine baisse d'une boîte ; l'export du LGO remettra le compte
 * exact.
 */

/**
 * Deux bips d'un même poste séparés de plus d'une minute sont deux patients.
 *
 * La fenêtre glisse et se mesure sur l'horloge du POSTE : l'écart entre ce bip
 * et le bip précédent du même poste (`CounterPost.lastScanAt`, lu avant sa
 * mise à jour). Elle ne se mesure PAS depuis `Prescription.updatedAt`, que
 * l'analyse fait avancer : un patient dont l'analyse a duré trente secondes
 * aurait sinon prolongé la fenêtre du suivant. Un patient qui passe dix
 * boîtes, une toutes les quarante secondes, reste une seule vente ; un bip
 * soixante et une secondes après le dernier ouvre la vente d'un autre patient,
 * analyse ou pas entre les deux.
 */
export const SAME_SALE_WINDOW_MS = 60 * 1000;

/** Un horodatage de bip plus ancien que cela n'est pas crédible (horloge du poste fausse) : on retient l'instant de réception. */
const MAX_SCAN_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * L'instant du bip : celui que le poste a daté (`scannedAt`) s'il est crédible,
 * pour que des bips rejoués après une coupure Internet gardent l'écart réel
 * qui les sépare. Un horodatage invalide, dans le futur ou vieux de plus de
 * six heures retombe sur « maintenant » (l'instant où le serveur le reçoit).
 */
export function scanInstant(scannedAt: Date | null, now: Date): Date {
  if (!scannedAt || Number.isNaN(scannedAt.getTime())) return now;
  const age = now.getTime() - scannedAt.getTime();
  return age >= 0 && age <= MAX_SCAN_AGE_MS ? scannedAt : now;
}

export type CounterScanResult =
  | { ok: true; prescriptionId: string; reference: string; lineCount: number; drugName: string; created: boolean; kind: "DRUG" | "PRODUCT" | "UNKNOWN" }
  | { ok: false; error: string; code: "UNKNOWN_CODE" };

/**
 * Ce qu'un bip désigne : une boîte de médicament (CIP, catalogue national),
 * un produit de l'officine (EAN de parapharmacie, stock de l'officine), ou
 * un code que personne ne connaît — qui reste visible au comptoir, non
 * confirmé, pour que le pharmacien voie que le bip est arrivé.
 */
type ScannedItem =
  | { kind: "DRUG"; name: string; form: string | null; specialtyId: string; presentationId: string; cip13: string }
  | { kind: "PRODUCT"; name: string; productId: string; ean: string }
  | { kind: "UNKNOWN"; name: string; code: string; hint: string | null };

async function resolveScannedItem(pharmacyId: string, raw: string, demo = false): Promise<ScannedItem | null> {
  const scanned = readScannedCode(raw);
  if (scanned.kind === "CIP13" || scanned.kind === "CIP7") {
    const presentation = await prisma.drugPresentation.findUnique({ where: { cip13: scanned.cip13 }, select: { id: true, cip13: true, specialty: { select: { id: true, name: true, pharmaceuticalForm: true } } } });
    if (presentation) return { kind: "DRUG", name: presentation.specialty.name, form: presentation.specialty.pharmaceuticalForm, specialtyId: presentation.specialty.id, presentationId: presentation.id, cip13: presentation.cip13 };
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Un code déjà appris au comptoir, puis le code de l'export du LGO.
  const learned = await prisma.productBarcode.findUnique({ where: { pharmacyId_code: { pharmacyId, code: digits } }, select: { product: { select: { id: true, name: true, deletedAt: true } } } });
  if (learned && !learned.product.deletedAt) return { kind: "PRODUCT", name: learned.product.name, productId: learned.product.id, ean: digits };
  const product = await prisma.product.findFirst({ where: { pharmacyId, ean: digits, deletedAt: null }, select: { id: true, name: true } });
  if (product) return { kind: "PRODUCT", name: product.name, productId: product.id, ean: digits };
  // Inconnu : le nom donné par les bases ouvertes permet de retrouver la
  // référence dans le stock par ses mots, et de retenir le code si le
  // rapprochement est sans ambiguïté.
  // L'officine de démonstration n'interroge aucune base ouverte : un code inconnu reste inconnu.
  const facts = demo ? null : await findOpenFactsName(digits);
  const hint = facts ? `${facts.name}${facts.brand ? ` — ${facts.brand}` : ""}` : null;
  if (facts) {
    const match = await matchStockProductByName(pharmacyId, `${facts.brand ?? ""} ${facts.name}`);
    if (match) {
      await prisma.productBarcode.upsert({ where: { pharmacyId_code: { pharmacyId, code: digits } }, create: { pharmacyId, productId: match.id, code: digits, source: "AUTO" }, update: {} });
      return { kind: "PRODUCT", name: match.name, productId: match.id, ean: digits };
    }
  }
  return { kind: "UNKNOWN", name: hint ? `${hint} (code ${digits}, à rattacher au stock)` : `Code-barres ${digits} (produit inconnu du stock)`, code: digits, hint };
}

function nameTokens(text: string): string[] {
  return [...new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter((token) => token.length >= 3))];
}

/**
 * Retrouve un produit du stock d'après un nom venu d'ailleurs (« Ergyphilus
 * gst — Nutergia »). Les mots du nom sont cherchés dans les libellés du
 * stock ; on ne retient un produit que s'il est seul à réunir au moins deux
 * mots, ou seul à en réunir un quand ce mot est rare dans le stock. Au
 * moindre doute, rien : un mauvais rapprochement vaudrait moins qu'aucun.
 */
export async function matchStockProductByName(pharmacyId: string, name: string): Promise<{ id: string; name: string } | null> {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return null;
  const candidates = await prisma.product.findMany({
    where: { pharmacyId, deletedAt: null, OR: tokens.map((token) => ({ name: { contains: token, mode: "insensitive" as const } })) },
    select: { id: true, name: true },
    take: 200,
  });
  if (candidates.length === 0) return null;
  const scored = candidates
    .map((product) => {
      const productTokens = nameTokens(product.name);
      const hits = tokens.filter((token) => productTokens.some((candidate) => candidate === token || (token.length >= 5 && candidate.startsWith(token.slice(0, 5)))));
      return { product, hits: hits.length };
    })
    .sort((a, b) => b.hits - a.hits);
  const [best, second] = scored;
  if (!best || best.hits === 0) return null;
  const unique = !second || second.hits < best.hits;
  if (best.hits >= 2 && unique) return best.product;
  if (best.hits === 1 && unique && candidates.length === 1) return best.product;
  return null;
}

export async function recordCounterScan(agent: AgentContext, input: { code: string; post: string; scannedAt: Date | null }): Promise<CounterScanResult> {
  const item = await resolveScannedItem(agent.scope.pharmacyId, input.code, agent.pharmacyIsDemo);
  if (!item) return { ok: false, code: "UNKNOWN_CODE", error: "Ce code ne ressemble pas à un code-barres de produit." };
  // Ce qui distingue deux bips d'un même article : le CIP, l'EAN ou le code brut.
  const itemKey = item.kind === "DRUG" ? item.specialtyId : item.kind === "PRODUCT" ? item.productId : item.code;
  const lineData = {
    drugName: item.name,
    form: item.kind === "DRUG" ? item.form : null,
    quantity: 1,
    drugSpecialtyId: item.kind === "DRUG" ? item.specialtyId : null,
    identifiedBy: item.kind === "DRUG" ? ("SCAN" as const) : null,
    identificationScore: item.kind === "DRUG" ? 1 : null,
    // Un médicament identifié par son CIP est confirmé ; un produit de
    // parapharmacie aussi ; un code inconnu reste à confirmer par le pharmacien.
    status: item.kind === "UNKNOWN" ? ("EXTRACTED" as const) : ("CONFIRMED" as const),
    fieldConfidence: { drugName: item.kind === "UNKNOWN" ? 0 : 1 },
    // Le code lu reste sur la ligne : il dit d'où elle vient, et permet de la reconnaître à l'écran.
    rawText: item.kind === "UNKNOWN" ? item.code : item.kind === "PRODUCT" ? item.ean : null,
    instructions: item.kind === "UNKNOWN" && item.hint ? `Douchette : ${item.hint}` : null,
  };

  const now = new Date();
  const at = scanInstant(input.scannedAt, now);
  const post = input.post.trim().slice(0, 60) || "poste";

  // Le bip précédent de CE poste, lu avant que celui-ci ne le remplace : c'est
  // lui, et non la dernière écriture de la vente, qui dit si le patient est le même.
  let previousScanAt: Date | null = null;
  if (agent.postId) {
    const known = await prisma.counterPost.findUnique({ where: { id: agent.postId }, select: { lastScanAt: true } });
    previousScanAt = known?.lastScanAt ?? null;
  }
  const withinWindow = previousScanAt !== null && Math.abs(at.getTime() - previousScanAt.getTime()) <= SAME_SALE_WINDOW_MS;

  // Où chercher la vente de ce patient, et depuis quand elle doit avoir été écrite.
  // - Poste connu : au-delà d'une minute depuis son dernier bip (ou sans bip
  //   antérieur), c'est un autre patient : aucune vente n'est cherchée. Sinon,
  //   la vente qui a reçu le bip précédent a été écrite depuis ce bip. Ce n'est
  //   pas une fenêtre, c'est un garde-fou : une vente restée ouverte depuis
  //   longtemps (une vente bipée n'est presque jamais encaissée dans PharmaBoost)
  //   ne reprend pas un patient parce que la vente suivante vient d'être encaissée.
  // - Poste inconnu (clé d'un serveur) : repli sur la dernière écriture de la vente.
  const writtenSince = agent.postId ? (withinWindow ? previousScanAt : null) : new Date(now.getTime() - SAME_SALE_WINDOW_MS);
  const open = writtenSince
    ? await prisma.prescription.findFirst({
        where: {
          pharmacyId: agent.scope.pharmacyId,
          source: "COUNTER_SCAN",
          counterPost: post,
          // Une vente déjà analysée mais pas encore encaissée reste celle du
          // patient au comptoir : un bip de plus la complète et la ré-analyse.
          status: { in: ["DRAFT", "NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] },
          updatedAt: { gte: writtenSince },
          sales: { none: {} },
          // « Vente terminée » dans la fenêtre du poste : le bip suivant est un autre patient.
          NOT: { counterFollowUp: { closedAt: { not: null } } },
        },
        // La vente que ce poste a ouverte en dernier, jamais une plus ancienne
        // encore ouverte : l'ordre est celui de la création, pas de l'écriture
        // (une analyse tardive d'une vente ancienne la ferait remonter).
        orderBy: { createdAt: "desc" },
        select: { id: true, reference: true, lines: { select: { id: true, drugSpecialtyId: true, rawText: true, drugName: true, quantity: true, position: true } } },
      })
    : null;

  let prescriptionId: string;
  let reference: string;
  let created = false;
  if (open) {
    prescriptionId = open.id;
    reference = open.reference;
    const same = open.lines.find((line) => (item.kind === "DRUG" ? line.drugSpecialtyId === itemKey : item.kind === "PRODUCT" ? line.rawText === item.ean || line.drugName === item.name : line.rawText === item.code));
    if (same) {
      await prisma.prescriptionLine.update({ where: { id: same.id }, data: { quantity: (same.quantity ?? 1) + 1 } });
    } else {
      await prisma.prescriptionLine.create({ data: { prescriptionId: open.id, position: open.lines.length + 1, ...lineData } });
    }
    // Retour à « à confirmer » : l'écran relance l'analyse avec la nouvelle boîte.
    await prisma.prescription.update({ where: { id: open.id }, data: { status: "NEEDS_VERIFICATION", verifiedAt: null } });
  } else {
    // Deux postes qui bipent en même temps : la référence se recalcule en cas de collision, aucun bip n'est perdu.
    const prescription = await createWithReference("prescription", agent.scope.pharmacyId, (candidate) =>
      prisma.prescription.create({
        data: {
          pharmacyId: agent.scope.pharmacyId,
          reference: candidate,
          status: "NEEDS_VERIFICATION",
          source: "COUNTER_SCAN",
          counterPost: post,
          createdByUserId: agent.scope.userId,
          isDemo: recordIsDemo(agent.pharmacyIsDemo),
          lines: { create: { position: 1, ...lineData } },
        },
        select: { id: true, reference: true },
      }),
    );
    reference = prescription.reference;
    prescriptionId = prescription.id;
    created = true;
  }

  // Une boîte sort : le stock de l'officine baisse d'une unité, jamais sous zéro.
  if (item.kind === "DRUG") {
    await prisma.pharmacyDrugStock.updateMany({ where: { pharmacyId: agent.scope.pharmacyId, presentationId: item.presentationId, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
  } else if (item.kind === "PRODUCT") {
    await prisma.stockItem.updateMany({ where: { pharmacyId: agent.scope.pharmacyId, productId: item.productId, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
  }
  if (agent.postId) {
    // Le poste retient l'instant du bip, jamais en arrière de ce qu'il a déjà (un bip rejoué en retard ne fait pas reculer son dernier bip).
    const lastScanAt = previousScanAt && previousScanAt.getTime() > at.getTime() ? previousScanAt : at;
    await prisma.counterPost.update({ where: { id: agent.postId }, data: { lastScanAt, lastSeenAt: now, scanCount: { increment: 1 } } });
  }
  const lineCount = await prisma.prescriptionLine.count({ where: { prescriptionId } });
  await recordAudit({ action: "prescription.counter_scan", entityType: "Prescription", entityId: prescriptionId, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { code: input.code, kind: item.kind, post, scannedAt: input.scannedAt && !Number.isNaN(input.scannedAt.getTime()) ? input.scannedAt.toISOString() : null } });
  return { ok: true, prescriptionId, reference, lineCount, drugName: item.name, created, kind: item.kind };
}

/** La délivrance en cours sur un poste (pour l'écran du comptoir), s'il y en a une. */
export async function listLiveCounterSales(pharmacyId: string) {
  return prisma.prescription.findMany({
    where: { pharmacyId, source: "COUNTER_SCAN", status: { in: ["NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] }, sales: { none: {} }, NOT: { counterFollowUp: { closedAt: { not: null } } }, updatedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
    orderBy: { updatedAt: "desc" },
    take: 6,
    select: { id: true, reference: true, status: true, counterPost: true, updatedAt: true, createdAt: true, lines: { orderBy: { position: "asc" }, select: { drugName: true, quantity: true } }, _count: { select: { recommendations: true } } },
  });
}

/**
 * Le pharmacien rattache un code inconnu à un produit de son stock : la ligne
 * devient ce produit, le code est retenu pour l'officine, le stock baisse
 * d'une unité comme pour tout bip.
 */
export async function attachBarcodeToProduct(scope: { pharmacyId: string; userId: string }, lineId: string, productId: string): Promise<{ ok: true; productName: string; code: string } | { ok: false; error: string }> {
  const line = await prisma.prescriptionLine.findFirst({ where: { id: lineId, prescription: { pharmacyId: scope.pharmacyId } }, select: { id: true, rawText: true, drugSpecialtyId: true, prescriptionId: true } });
  if (!line) return { ok: false, error: "Ligne introuvable." };
  const code = (line.rawText ?? "").replace(/\D/g, "");
  if (code.length < 7 || line.drugSpecialtyId) return { ok: false, error: "Cette ligne n'est pas un code-barres inconnu." };
  const product = await prisma.product.findFirst({ where: { id: productId, pharmacyId: scope.pharmacyId, deletedAt: null }, select: { id: true, name: true } });
  if (!product) return { ok: false, error: "Produit introuvable dans votre stock." };
  await prisma.$transaction([
    prisma.productBarcode.upsert({ where: { pharmacyId_code: { pharmacyId: scope.pharmacyId, code } }, create: { pharmacyId: scope.pharmacyId, productId: product.id, code, source: "LEARNED" }, update: { productId: product.id } }),
    prisma.prescriptionLine.update({ where: { id: line.id }, data: { drugName: product.name, status: "CONFIRMED", fieldConfidence: { drugName: 1 }, instructions: null, correctedByUserId: scope.userId, correctedAt: new Date() } }),
    prisma.stockItem.updateMany({ where: { pharmacyId: scope.pharmacyId, productId: product.id, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } }),
  ]);
  await recordAudit({ action: "prescription.barcode_learned", entityType: "Product", entityId: product.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { code, lineId: line.id } });
  return { ok: true, productName: product.name, code };
}

/**
 * « Nouveau patient » : les ventes de la douchette encore ouvertes (sans
 * encaissement) sont closes. L'écran redevient vierge et le bip suivant
 * ouvre une nouvelle vente, même moins d'une minute après le dernier.
 */
export async function closeLiveCounterSales(scope: { pharmacyId: string; userId: string }, prescriptionId?: string): Promise<number> {
  const result = await prisma.prescription.updateMany({
    where: {
      pharmacyId: scope.pharmacyId,
      source: "COUNTER_SCAN",
      ...(prescriptionId ? { id: prescriptionId } : {}),
      status: { in: ["DRAFT", "NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] },
      sales: { none: {} },
    },
    data: { status: "CANCELLED" },
  });
  if (result.count > 0) await recordAudit({ action: "prescription.counter_reset", entityType: "Prescription", entityId: prescriptionId ?? null, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { closed: result.count } });
  return result.count;
}

