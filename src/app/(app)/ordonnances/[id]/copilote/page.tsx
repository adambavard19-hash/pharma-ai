import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, Info, ShieldAlert, Sparkles } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { SAFETY_SEVERITY } from "@/config/statuses";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { CopilotBoard } from "./copilot-board";
import { PipelineTrace } from "./pipeline-trace";
import type { PipelineStageTrace, ScoreContribution } from "@/core/ai/types";

export const metadata: Metadata = { title: "Copilote du pharmacien" };

export default async function CopilotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_VIEW);

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, reference: true, birthDate: true },
      },
      lines: {
        orderBy: { position: "asc" },
        where: { status: "CONFIRMED" },
        include: { explanation: true },
      },
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
          opportunities: true,
        },
      },
    },
  });

  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) notFound();

  const run = prescription.analysisRuns[0];
  const canDecide = session.permissions.has(PERMISSIONS.RECOMMENDATION_DECIDE);

  const blockingFindings =
    run?.safetyFindings.filter((f) => f.severity === "BLOCKING") ?? [];
  const otherFindings =
    run?.safetyFindings.filter((f) => f.severity !== "BLOCKING") ?? [];
  const blockedOpportunities = run?.opportunities.filter((o) => o.isBlocked) ?? [];

  const active = prescription.recommendations.filter(
    (r) => r.status !== "REMOVED" && r.status !== "DECLINED",
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href={`/ordonnances/${prescription.id}`}>Retour à l&apos;ordonnance</Link>
      </Button>

      <PageHeader
        title="Conseils proposés"
        description={`${prescription.reference}${prescription.patient ? ` — ${prescription.patient.firstName} ${prescription.patient.lastName.toUpperCase()}` : ""}. Vous décidez de chaque conseil avant qu'il n'atteigne le patient.`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/ordonnances/${prescription.id}/fiche`}>
              Générer la fiche patient
            </Link>
          </Button>
        }
      />

      {!run && (
        <Alert tone="warning" title="Aucune analyse disponible">
          Cette ordonnance n&apos;a pas encore été analysée. Vérifiez d&apos;abord les lignes
          extraites.
          <div className="mt-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/ordonnances/${prescription.id}/verification`}>
                Vérifier l&apos;ordonnance
              </Link>
            </Button>
          </div>
        </Alert>
      )}

      {blockingFindings.length > 0 && (
        <Alert
          tone="danger"
          title={`${blockingFindings.length} point${blockingFindings.length > 1 ? "s" : ""} bloquant${blockingFindings.length > 1 ? "s" : ""}`}
          icon={<ShieldAlert className="size-[18px]" />}
        >
          <ul className="mt-1 space-y-1">
            {blockingFindings.map((finding) => (
              <li key={finding.id}>• {finding.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <CopilotBoard
            prescriptionId={prescription.id}
            canDecide={canDecide}
            recommendations={prescription.recommendations.map((recommendation) => {
              const breakdown = (recommendation.scoreBreakdown ?? {}) as Record<
                string,
                unknown
              > & { explanation?: ScoreContribution[] };

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
                explanation: Array.isArray(breakdown.explanation)
                  ? breakdown.explanation
                  : [],
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
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Le traitement"
              description="Lignes confirmées et informations disponibles."
            />
            <CardContent className="pt-0">
              {prescription.lines.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-text-tertiary">
                  Aucune ligne confirmée.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {prescription.lines.map((line) => (
                    <li key={line.id} className="space-y-1.5 py-3">
                      <p className="text-[13.5px] font-medium text-text-primary">
                        {line.drugName}
                        {line.dosage && (
                          <span className="font-normal text-text-secondary"> {line.dosage}</span>
                        )}
                      </p>
                      {line.posology && (
                        <p className="text-[12.5px] text-text-secondary">{line.posology}</p>
                      )}
                      {line.explanation?.source === "UNAVAILABLE" ? (
                        <p className="flex items-start gap-1.5 text-[12px] text-warning-700 dark:text-warning-500">
                          <Info className="mt-0.5 size-3 shrink-0" />
                          Aucune information disponible dans le référentiel connecté : aucune
                          explication n&apos;est produite pour ce médicament.
                        </p>
                      ) : line.explanation?.purpose ? (
                        <p className="text-[12.5px] leading-5 text-text-tertiary">
                          {line.explanation.purpose}
                        </p>
                      ) : null}
                      {line.explanation && line.explanation.source === "DEMO" && (
                        <Badge tone="accent">Donnée de démonstration</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {otherFindings.length > 0 && (
            <Card>
              <CardHeader
                title="Points de vigilance"
                description="Remontés par le moteur de sécurité."
              />
              <CardContent className="pt-0">
                <ul className="divide-y divide-border-subtle">
                  {otherFindings.map((finding) => {
                    const severity = SAFETY_SEVERITY[finding.severity];
                    return (
                      <li key={finding.id} className="flex items-start gap-2.5 py-2.5">
                        <Badge tone={severity.tone} className="mt-0.5 shrink-0">
                          {severity.label}
                        </Badge>
                        <p className="min-w-0 text-[12.5px] leading-5 text-text-secondary">
                          {finding.message}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {blockedOpportunities.length > 0 && (
            <Card>
              <CardHeader
                title="Conseils écartés"
                description="Le moteur a identifié ces pistes puis les a bloquées."
              />
              <CardContent className="pt-0">
                <ul className="divide-y divide-border-subtle">
                  {blockedOpportunities.map((opportunity) => (
                    <li key={opportunity.id} className="space-y-1 py-2.5">
                      <p className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                        <Ban className="size-3.5 shrink-0 text-danger-600 dark:text-danger-500" />
                        {opportunity.title}
                      </p>
                      <p className="text-[12px] leading-5 text-text-secondary">
                        {opportunity.blockReason}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {run && (
            <PipelineTrace
              trace={(run.traceJson ?? []) as PipelineStageTrace[]}
              engineVersion={run.engineVersion}
              durationMs={run.durationMs}
              providers={(run.providers ?? {}) as Record<string, unknown>}
            />
          )}
        </div>
      </div>

      {active.length === 0 && run && (
        <Card>
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="Aucun conseil retenu"
            description="Le moteur n'a identifié aucune opportunité pertinente et disponible, ou tous les conseils ont été retirés. Vous pouvez ajouter un conseil manuellement."
          />
        </Card>
      )}
    </div>
  );
}
