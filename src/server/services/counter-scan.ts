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
  | { ok: true; prescriptionId: string; reference: string; lineCount: number; drugName: string; created: boolean }
  | { ok: false; error: string; code: "UNKNOWN_CODE" | "NOT_IN_CATALOG" };

export async function recordCounterScan(agent: AgentContext, input: { code: string; post: string; scannedAt: Date | null }): Promise<CounterScanResult> {
  const scanned = readScannedCode(input.code);
  if (scanned.kind !== "CIP13" && scanned.kind !== "CIP7") return { ok: false, code: "UNKNOWN_CODE", error: "Ce code n'est pas un code de boîte de médicament." };
  const presentation = await prisma.drugPresentation.findUnique({
    where: { cip13: scanned.cip13 },
    select: { id: true, cip13: true, label: true, specialty: { select: { id: true, name: true, pharmaceuticalForm: true } } },
  });
  if (!presentation) return { ok: false, code: "NOT_IN_CATALOG", error: `Boîte ${scanned.cip13} inconnue du catalogue national.` };

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
    select: { id: true, reference: true, lines: { select: { id: true, drugSpecialtyId: true, quantity: true, position: true } } },
  });

  let prescriptionId: string;
  let reference: string;
  let created = false;
  if (open) {
    prescriptionId = open.id;
    reference = open.reference;
    const same = open.lines.find((line) => line.drugSpecialtyId === presentation.specialty.id);
    if (same) {
      await prisma.prescriptionLine.update({ where: { id: same.id }, data: { quantity: (same.quantity ?? 1) + 1 } });
    } else {
      await prisma.prescriptionLine.create({
        data: {
          prescriptionId: open.id,
          position: open.lines.length + 1,
          drugName: presentation.specialty.name,
          form: presentation.specialty.pharmaceuticalForm,
          quantity: 1,
          drugSpecialtyId: presentation.specialty.id,
          identifiedBy: "SCAN",
          identificationScore: 1,
          status: "CONFIRMED",
          fieldConfidence: { drugName: 1 },
        },
      });
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
        lines: {
          create: {
            position: 1,
            drugName: presentation.specialty.name,
            form: presentation.specialty.pharmaceuticalForm,
            quantity: 1,
            drugSpecialtyId: presentation.specialty.id,
            identifiedBy: "SCAN",
            identificationScore: 1,
            status: "CONFIRMED",
            fieldConfidence: { drugName: 1 },
          },
        },
      },
      select: { id: true },
    });
    prescriptionId = prescription.id;
    created = true;
  }

  // Une boîte sort : le stock de l'officine baisse d'une unité, jamais sous zéro.
  await prisma.pharmacyDrugStock.updateMany({ where: { pharmacyId: agent.scope.pharmacyId, presentationId: presentation.id, quantity: { gt: 0 } }, data: { quantity: { decrement: 1 } } });
  if (agent.postId) {
    await prisma.counterPost.update({ where: { id: agent.postId }, data: { lastScanAt: now, lastSeenAt: now, scanCount: { increment: 1 } } });
  }
  const lineCount = await prisma.prescriptionLine.count({ where: { prescriptionId } });
  await recordAudit({ action: "prescription.counter_scan", entityType: "Prescription", entityId: prescriptionId, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { cip13: presentation.cip13, post, scannedAt: input.scannedAt?.toISOString() ?? null } });
  return { ok: true, prescriptionId, reference, lineCount, drugName: presentation.specialty.name, created };
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
