import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { SaleWorkspace } from "./sale-workspace";
import type { PipelineStageTrace, ScoreContribution } from "@/core/ai/types";

export const metadata: Metadata = { title: "Vente" };

/**
 * L'écran unique du comptoir.
 *
 * Il remplace quatre pages successives — détail, vérification, copilote, fiche —
 * par une seule adresse dont on ne sort qu'à la fin. Toutes les données du
 * parcours sont chargées ici en une fois : au comptoir, un aller-retour serveur
 * de plus est une seconde de perdue.
 */
export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VIEW);

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, reference: true } },
      lines: { orderBy: { position: "asc" }, include: { explanation: true } },
      recommendations: {
        orderBy: [{ totalScore: "desc" }],
        include: {
          product: { include: { stockItem: true } },
          opportunity: true,
          decidedBy: { select: { firstName: true, lastName: true } },
        },
      },
      analysisRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          safetyFindings: { orderBy: { severity: "desc" } },
          opportunities: { where: { isBlocked: true } },
        },
      },
      sales: { select: { id: true } },
    },
  });

  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) notFound();

  const patients = await prisma.patient.findMany({
    where: { pharmacyId: session.scope.pharmacyId, deletedAt: null },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, reference: true },
    take: 300,
  });

  const run = prescription.analysisRuns[0] ?? null;

  return (
    <SaleWorkspace
      prescription={{
        id: prescription.id,
        reference: prescription.reference,
        status: prescription.status,
        verifiedAt: prescription.verifiedAt?.toISOString() ?? null,
        patientId: prescription.patientId,
        patientName: prescription.patient
          ? `${prescription.patient.firstName} ${prescription.patient.lastName.toUpperCase()}`
          : null,
        prescriberName: prescription.prescriberName,
        prescribedAt: prescription.prescribedAt?.toISOString().slice(0, 10) ?? null,
      }}
      patients={patients}
      lines={prescription.lines.map((line) => ({
        id: line.id,
        position: line.position,
        rawText: line.rawText,
        drugName: line.drugName ?? "",
        dosage: line.dosage ?? "",
        form: line.form ?? "",
        posology: line.posology ?? "",
        durationDays: line.durationDays,
        quantity: line.quantity,
        instructions: line.instructions ?? "",
        confidence: (line.fieldConfidence ?? {}) as Record<string, number>,
        unreadableFields: line.unreadableFields,
        confirmed: line.status === "CONFIRMED",
        purpose: line.explanation?.purpose ?? null,
        explanationSource: line.explanation?.source ?? null,
      }))}
      findings={
        run?.safetyFindings.map((finding) => ({
          id: finding.id,
          severity: finding.severity,
          code: finding.code,
          message: finding.message,
          subjectType: finding.subjectType,
          acknowledged: Boolean(finding.acknowledgedAt),
        })) ?? []
      }
      blockedOpportunities={
        run?.opportunities.map((opportunity) => ({
          id: opportunity.id,
          title: opportunity.title,
          blockReason: opportunity.blockReason,
        })) ?? []
      }
      recommendations={prescription.recommendations.map((recommendation) => {
        const breakdown = (recommendation.scoreBreakdown ?? {}) as Record<string, unknown> & {
          explanation?: ScoreContribution[];
        };

        return {
          id: recommendation.id,
          status: recommendation.status,
          origin: recommendation.origin,
          totalScore: recommendation.totalScore,
          justification: recommendation.justification,
          patientReason: recommendation.patientReason,
          precautions: recommendation.precautions,
          quantity: recommendation.quantity,
          unitPriceCents: recommendation.unitPriceCents,
          pharmacistNote: recommendation.pharmacistNote,
          decidedBy: recommendation.decidedBy
            ? `${recommendation.decidedBy.firstName} ${recommendation.decidedBy.lastName}`
            : null,
          explanation: Array.isArray(breakdown.explanation) ? breakdown.explanation : [],
          opportunity: recommendation.opportunity
            ? {
                title: recommendation.opportunity.title,
                rationale: recommendation.opportunity.rationale,
                clinicalContext: recommendation.opportunity.clinicalContext,
                priority: recommendation.opportunity.priority,
                safetyNotes: recommendation.opportunity.safetyNotes,
              }
            : null,
          product: recommendation.product
            ? {
                id: recommendation.product.id,
                name: recommendation.product.name,
                brand: recommendation.product.brand,
                imageUrl: recommendation.product.imageUrl,
                salePriceCents: recommendation.product.salePriceCents,
                quantity: recommendation.product.stockItem?.quantity ?? 0,
                alertThreshold: recommendation.product.stockItem?.alertThreshold ?? 0,
                claims: recommendation.product.commercialClaims,
              }
            : null,
        };
      })}
      analysisRunId={run?.id ?? null}
      trace={
        run
          ? {
              stages: (run.traceJson ?? []) as PipelineStageTrace[],
              engineVersion: run.engineVersion,
              durationMs: run.durationMs,
              providers: (run.providers ?? {}) as Record<string, unknown>,
            }
          : null
      }
      permissions={{
        verify: session.permissions.has(PERMISSIONS.PRESCRIPTION_VERIFY),
        decide: session.permissions.has(PERMISSIONS.RECOMMENDATION_DECIDE),
        sell: session.permissions.has(PERMISSIONS.SALE_CREATE),
      }}
      simulatedExtraction={prescription.ocrProvider === "mock-ocr"}
      hasSale={prescription.sales.length > 0}
    />
  );
}
