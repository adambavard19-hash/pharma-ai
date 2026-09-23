import "server-only";
import { prisma } from "@/server/db/client";
import { readScannedCode } from "@/core/stock";
import { nextReference } from "@/server/services/references";
import { recordIsDemo } from "@/server/db/demo-scope";
import { recordAudit } from "@/server/audit/log";
import type { AgentContext } from "@/server/services/stock-sync";

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
  | { kind: "UNKNOWN"; name: string; code: string };

async function resolveScannedItem(pharmacyId: string, raw: string): Promise<ScannedItem | null> {
  const scanned = readScannedCode(raw);
  if (scanned.kind === "CIP13" || scanned.kind === "CIP7") {
    const presentation = await prisma.drugPresentation.findUnique({ where: { cip13: scanned.cip13 }, select: { id: true, cip13: true, specialty: { select: { id: true, name: true, pharmaceuticalForm: true } } } });
    if (presentation) return { kind: "DRUG", name: presentation.specialty.name, form: presentation.specialty.pharmaceuticalForm, specialtyId: presentation.specialty.id, presentationId: presentation.id, cip13: presentation.cip13 };
    return { kind: "UNKNOWN", name: `Boîte ${scanned.cip13} (hors catalogue)`, code: scanned.cip13 };
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const product = await prisma.product.findFirst({ where: { pharmacyId, ean: digits, deletedAt: null }, select: { id: true, name: true, ean: true } });
  if (product) return { kind: "PRODUCT", name: product.name, productId: product.id, ean: digits };
  return { kind: "UNKNOWN", name: `Code-barres ${digits} (produit inconnu du stock)`, code: digits };
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
  };

  const now = new Date();
  const post = input.post.trim().slice(0, 60) || "poste";
  const open = await prisma.prescription.findFirst({
    where: {
      pharmacyId: agent.scope.pharmacyId,
      source: "COUNTER_SCAN",
      counterPost: post,
      status: { in: ["DRAFT", "NEEDS_VERIFICATION"] },
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
    await prisma.prescription.update({ where: { id: open.id }, data: { status: "NEEDS_VERIFICATION" } });
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
