import "server-only";
import { prisma } from "@/server/db/client";
import { readScannedCode } from "@/core/stock";
import { nextReference } from "@/server/services/references";
import { recordIsDemo } from "@/server/db/demo-scope";
import { recordAudit } from "@/server/audit/log";
import type { AgentContext } from "@/server/services/stock-sync";
import { findOpenFactsName } from "@/server/services/product-images";

/**
 * Un bip de douchette au comptoir, capté par l'agent du poste de caisse.
 *
 * Le code-barres devient une ligne de délivrance : la boîte est identifiée
 * par son CIP dans le catalogue national, sans lecture ni devinette. Les bips
 * d'un même poste, rapprochés dans le temps, forment UNE délivrance — celle
 * du patient qui est au comptoir. Le stock de l'officine baisse d'une boîte ;
 * l'export du LGO remettra le compte exact.
 */

/** Deux bips séparés de plus de trois minutes sont deux patients. */
const SAME_SALE_WINDOW_MS = 3 * 60 * 1000;

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

async function resolveScannedItem(pharmacyId: string, raw: string): Promise<ScannedItem | null> {
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
  // Inconnu : le nom donné par les bases ouvertes aide à retrouver la référence dans le stock.
  const facts = await findOpenFactsName(digits);
  const hint = facts ? `${facts.name}${facts.brand ? ` — ${facts.brand}` : ""}` : null;
  return { kind: "UNKNOWN", name: hint ? `${hint} (code ${digits}, à rattacher au stock)` : `Code-barres ${digits} (produit inconnu du stock)`, code: digits, hint };
}

export async function recordCounterScan(agent: AgentContext, input: { code: string; post: string; scannedAt: Date | null }): Promise<CounterScanResult> {
  const item = await resolveScannedItem(agent.scope.pharmacyId, input.code);
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
    rawText: item.kind === "UNKNOWN" ? item.code : null,
    instructions: item.kind === "UNKNOWN" && item.hint ? `Douchette : ${item.hint}` : null,
  };

  const now = new Date();
  const post = input.post.trim().slice(0, 60) || "poste";
  const open = await prisma.prescription.findFirst({
    where: {
      pharmacyId: agent.scope.pharmacyId,
      source: "COUNTER_SCAN",
      counterPost: post,
      // Une vente déjà analysée mais pas encore encaissée reste celle du
      // patient au comptoir : un bip de plus la complète et la ré-analyse.
      status: { in: ["DRAFT", "NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] },
      updatedAt: { gte: new Date(now.getTime() - SAME_SALE_WINDOW_MS) },
      sales: { none: {} },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, reference: true, lines: { select: { id: true, drugSpecialtyId: true, rawText: true, drugName: true, quantity: true, position: true } } },
  });

  let prescriptionId: string;
  let reference: string;
  let created = false;
  if (open) {
    prescriptionId = open.id;
    reference = open.reference;
    const same = open.lines.find((line) => (item.kind === "DRUG" ? line.drugSpecialtyId === itemKey : item.kind === "PRODUCT" ? line.drugName === item.name : line.rawText === item.code));
    if (same) {
      await prisma.prescriptionLine.update({ where: { id: same.id }, data: { quantity: (same.quantity ?? 1) + 1 } });
    } else {
      await prisma.prescriptionLine.create({ data: { prescriptionId: open.id, position: open.lines.length + 1, ...lineData } });
    }
    // Retour à « à confirmer » : l'écran relance l'analyse avec la nouvelle boîte.
    await prisma.prescription.update({ where: { id: open.id }, data: { status: "NEEDS_VERIFICATION", verifiedAt: null } });
  } else {
    reference = await nextReference("prescription", agent.scope.pharmacyId);
    const prescription = await prisma.prescription.create({
      data: {
        pharmacyId: agent.scope.pharmacyId,
        reference,
        status: "NEEDS_VERIFICATION",
        source: "COUNTER_SCAN",
        counterPost: post,
        createdByUserId: agent.scope.userId,
        isDemo: recordIsDemo(agent.pharmacyIsDemo),
        lines: { create: { position: 1, ...lineData } },
      },
      select: { id: true },
    });
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
    await prisma.counterPost.update({ where: { id: agent.postId }, data: { lastScanAt: now, lastSeenAt: now, scanCount: { increment: 1 } } });
  }
  const lineCount = await prisma.prescriptionLine.count({ where: { prescriptionId } });
  await recordAudit({ action: "prescription.counter_scan", entityType: "Prescription", entityId: prescriptionId, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { code: input.code, kind: item.kind, post, scannedAt: input.scannedAt?.toISOString() ?? null } });
  return { ok: true, prescriptionId, reference, lineCount, drugName: item.name, created, kind: item.kind };
}

/** La délivrance en cours sur un poste (pour l'écran du comptoir), s'il y en a une. */
export async function listLiveCounterSales(pharmacyId: string) {
  return prisma.prescription.findMany({
    where: { pharmacyId, source: "COUNTER_SCAN", status: { in: ["NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED"] }, sales: { none: {} }, updatedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
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

