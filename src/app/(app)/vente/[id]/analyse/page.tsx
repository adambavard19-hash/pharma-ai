import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { PipelineTrace } from "../pipeline-trace";
import { ReanalyseButton } from "../reanalyse-button";
import type { PipelineStageTrace } from "@/core/ai/types";

export const metadata: Metadata = { title: "Journal de l'analyse" };

/**
 * Comment l'analyse s'est déroulée — hors du parcours du comptoir.
 *
 * Le moteur, sa version, la confiance du modèle, l'ordre des étapes : tout
 * cela intéresse le titulaire qui vérifie, ou un auditeur des mois plus tard.
 * Pas le pharmacien debout devant un patient. Cette page existe pour que ces
 * informations restent consultables sans encombrer l'écran de délivrance.
 */
export default async function AnalysisJournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VIEW);

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      pharmacyId: true,
      analysisRuns: {
        orderBy: { startedAt: "desc" },
        take: 5,
        include: { safetyFindings: { orderBy: { severity: "desc" } } },
      },
    },
  });
  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) notFound();

  const runs = prescription.analysisRuns;
  const latest = runs[0] ?? null;
  const understandingRaw = (latest?.understanding ?? null) as { context?: { summary?: string; confidence?: number } } | null;
  const understanding =
    understandingRaw?.context?.summary && typeof understandingRaw.context.confidence === "number"
      ? { summary: understandingRaw.context.summary, confidence: understandingRaw.context.confidence }
      : null;
  const providers = ((latest?.providers ?? {}) as Record<string, unknown>);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href={`/vente/${prescription.id}`}>Retour à la délivrance</Link>
      </Button>
      <PageHeader
        title="Comment l'analyse s'est déroulée"
        description={`${prescription.reference} — trace complète, pour vérification ou audit. Rien ici n'est nécessaire au comptoir.`}
      />

      {!latest ? (
        <Card>
          <CardContent className="py-6 text-[13.5px] text-text-secondary">Aucune analyse n&apos;a encore été lancée pour cette ordonnance.</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Dernière analyse" description={`Lancée le ${formatDateTime(latest.startedAt)}`} action={<Badge tone={latest.status === "COMPLETED" ? "success" : "warning"}>{latest.status}</Badge>} />
            <CardContent className="space-y-3 text-[13.5px] text-text-secondary">
              <p>
                <span className="font-medium text-text-primary">Moteur</span> v{latest.engineVersion}
                {latest.durationMs ? ` · ${latest.durationMs} ms` : ""}
              </p>
              {understanding && (
                <p className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span>
                    <span className="font-medium text-text-primary">Contexte compris par le modèle : </span>
                    {understanding.summary}
                    <span className="text-text-tertiary"> — hypothèse, confiance {Math.round(understanding.confidence * 100)} %. Ce n&apos;est pas un diagnostic.</span>
                  </span>
                </p>
              )}
              {Object.keys(providers).length > 0 && (
                <p>
                  <span className="font-medium text-text-primary">Fournisseurs</span>{" "}
                  {Object.entries(providers).map(([key, value]) => `${key} : ${String(value)}`).join(" · ")}
                </p>
              )}
              {latest.safetyFindings.length > 0 && (
                <div>
                  <p className="font-medium text-text-primary">Signaux relevés ({latest.safetyFindings.length})</p>
                  <ul className="mt-1.5 space-y-1">
                    {latest.safetyFindings.map((finding) => (
                      <li key={finding.id} className="flex flex-wrap items-baseline gap-x-2">
                        <Badge tone={finding.severity === "BLOCKING" ? "danger" : finding.severity === "WARNING" ? "warning" : "neutral"}>{finding.severity}</Badge>
                        <span className="font-mono text-[11.5px] text-text-tertiary">{finding.code}</span>
                        <span className="w-full text-[13px] leading-5">{finding.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <PipelineTrace trace={(latest.traceJson as unknown as PipelineStageTrace[]) ?? []} engineVersion={latest.engineVersion} durationMs={latest.durationMs} />

          {session.permissions.has(PERMISSIONS.PRESCRIPTION_VERIFY) && <ReanalyseButton prescriptionId={prescription.id} />}

          {runs.length > 1 && (
            <Card>
              <CardHeader title="Analyses précédentes" />
              <CardContent className="pt-0">
                <ul className="divide-y divide-border-subtle text-[13px] text-text-secondary">
                  {runs.slice(1).map((run) => (
                    <li key={run.id} className="flex flex-wrap items-center gap-x-3 py-2">
                      <span>{formatDateTime(run.startedAt)}</span>
                      <span className="text-text-tertiary">v{run.engineVersion}</span>
                      <Badge tone="neutral">{run.status}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
