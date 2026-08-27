import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  FileImage,
  FileText,
  Receipt,
} from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PRESCRIPTION_STATUS, RECOMMENDATION_STATUS, SAFETY_SEVERITY } from "@/config/statuses";
import { PageHeader, DataItem } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import { ReanalyseButton } from "./reanalyse-button";

export const metadata: Metadata = { title: "Ordonnance" };

export default async function PrescriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VIEW);

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, reference: true } },
      lines: { orderBy: { position: "asc" }, include: { explanation: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      verifiedBy: { select: { firstName: true, lastName: true } },
      recommendations: {
        orderBy: { totalScore: "desc" },
        include: { product: { select: { id: true, name: true, brand: true } } },
      },
      documents: { orderBy: { createdAt: "desc" } },
      sales: { include: { lines: true } },
      analysisRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: { safetyFindings: true },
      },
    },
  });

  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) notFound();

  const status = PRESCRIPTION_STATUS[prescription.status];
  const run = prescription.analysisRuns[0];
  const latestDocument = prescription.documents[0];
  const attributedTotal = prescription.sales.reduce((sum, sale) => sum + sale.attributedCents, 0);

  const steps = [
    {
      key: "verification",
      label: "Vérification",
      done: Boolean(prescription.verifiedAt),
      href: `/ordonnances/${prescription.id}/verification`,
      permission: PERMISSIONS.PRESCRIPTION_VERIFY,
    },
    {
      key: "copilote",
      label: "Validation des conseils",
      done: prescription.recommendations.some((r) => r.status !== "PROPOSED"),
      href: `/ordonnances/${prescription.id}/copilote`,
      permission: PERMISSIONS.RECOMMENDATION_VIEW,
    },
    {
      key: "fiche",
      label: "Fiche patient",
      done: prescription.documents.length > 0,
      href: `/ordonnances/${prescription.id}/fiche`,
      permission: PERMISSIONS.DOCUMENT_GENERATE,
    },
    {
      key: "vente",
      label: "Vente",
      done: prescription.sales.length > 0,
      href: `/ordonnances/${prescription.id}/fiche#vente`,
      permission: PERMISSIONS.SALE_CREATE,
    },
  ].filter((step) => session.permissions.has(step.permission));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/ordonnances">Retour aux ordonnances</Link>
      </Button>

      <PageHeader
        title={prescription.reference}
        description={
          prescription.patient
            ? `${prescription.patient.firstName} ${prescription.patient.lastName.toUpperCase()} — ${prescription.patient.reference}`
            : "Aucun patient rattaché"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {session.permissions.has(PERMISSIONS.PRESCRIPTION_VERIFY) && run && (
              <ReanalyseButton prescriptionId={prescription.id} />
            )}
            {prescription.status === "NEEDS_VERIFICATION" &&
              session.permissions.has(PERMISSIONS.PRESCRIPTION_VERIFY) && (
                <Button asChild leadingIcon={<ArrowRight className="size-[18px]" />}>
                  <Link href={`/ordonnances/${prescription.id}/verification`}>Vérifier</Link>
                </Button>
              )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {prescription.isDemo && <Badge tone="accent">Démonstration</Badge>}
        {prescription.ocrProvider === "mock-ocr" && (
          <Badge tone="warning">Extraction simulée</Badge>
        )}
      </div>

      <nav aria-label="Étapes du parcours">
        <ol className="flex flex-wrap gap-2">
          {steps.map((step, index) => (
            <li key={step.key} className="flex items-center gap-2">
              <Link
                href={step.href}
                className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  step.done
                    ? "border-success-500/40 bg-success-50 text-success-700 dark:bg-success-700/15 dark:text-success-500"
                    : "border-border-default bg-surface-card text-text-secondary hover:border-brand-400 hover:text-text-primary"
                }`}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-[10.5px] font-semibold ${
                    step.done
                      ? "bg-success-600 text-white"
                      : "bg-surface-sunken text-text-tertiary"
                  }`}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                {step.label}
              </Link>
              {index < steps.length - 1 && (
                <ArrowRight className="size-3.5 text-text-tertiary" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Traitement"
              description={`${prescription.lines.filter((l) => l.status === "CONFIRMED").length} ligne(s) confirmée(s) sur ${prescription.lines.length}`}
            />
            <CardContent className="pt-0">
              <ul className="divide-y divide-border-subtle">
                {prescription.lines.map((line) => (
                  <li key={line.id} className="space-y-1.5 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-[14px] font-medium text-text-primary">
                        {line.drugName ?? "Ligne illisible"}
                        {line.dosage && (
                          <span className="font-normal text-text-secondary"> {line.dosage}</span>
                        )}
                        {line.form && (
                          <span className="font-normal text-text-tertiary"> · {line.form}</span>
                        )}
                      </p>
                      <Badge
                        tone={
                          line.status === "CONFIRMED"
                            ? "success"
                            : line.status === "REJECTED"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {LINE_STATUS_LABELS[line.status]}
                      </Badge>
                    </div>

                    {line.posology && (
                      <p className="text-[13px] text-text-secondary">{line.posology}</p>
                    )}
                    <p className="flex flex-wrap gap-x-4 text-[12px] text-text-tertiary">
                      {line.durationDays && <span>Durée : {line.durationDays} jours</span>}
                      {line.quantity && <span>Quantité : {line.quantity}</span>}
                      {line.instructions && <span>{line.instructions}</span>}
                    </p>

                    {line.unreadableFields.length > 0 && (
                      <p className="text-[12px] text-warning-700 dark:text-warning-500">
                        Champ(s) illisible(s) à l&apos;extraction :{" "}
                        {line.unreadableFields.join(", ")}
                      </p>
                    )}

                    {line.explanation && line.explanation.source !== "UNAVAILABLE" && (
                      <div className="mt-1 rounded-lg bg-surface-sunken/60 px-3 py-2">
                        <p className="text-[12.5px] leading-5 text-text-secondary">
                          {line.explanation.purpose}
                        </p>
                        {line.explanation.sourceRefs.length > 0 && (
                          <p className="mt-1 text-[11px] text-text-tertiary">
                            Source : {line.explanation.sourceRefs.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {prescription.recommendations.length > 0 && (
            <Card>
              <CardHeader
                title="Conseils"
                description="Propositions du moteur et décisions du pharmacien."
                action={
                  session.permissions.has(PERMISSIONS.RECOMMENDATION_VIEW) ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/ordonnances/${prescription.id}/copilote`}>
                        Ouvrir le copilote
                      </Link>
                    </Button>
                  ) : null
                }
              />
              <CardContent className="pt-0">
                <ul className="divide-y divide-border-subtle">
                  {prescription.recommendations.map((recommendation) => {
                    const recStatus = RECOMMENDATION_STATUS[recommendation.status];
                    return (
                      <li
                        key={recommendation.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-text-primary">
                            {recommendation.product?.name ?? "Produit supprimé"}
                          </span>
                          {recommendation.pharmacistNote && (
                            <span className="block truncate text-[12px] text-text-tertiary">
                              « {recommendation.pharmacistNote} »
                            </span>
                          )}
                        </span>
                        {recommendation.origin === "MANUAL" && (
                          <Badge tone="brand">Ajouté</Badge>
                        )}
                        <Badge tone={recStatus.tone}>{recStatus.label}</Badge>
                        <span className="w-20 shrink-0 text-right text-[13px] tabular text-text-secondary">
                          {formatCents(recommendation.unitPriceCents)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {run && run.safetyFindings.length > 0 && (
            <Card>
              <CardHeader
                title="Contrôles de sécurité"
                description={`${run.safetyFindings.length} signal(aux) enregistré(s) lors de l'analyse.`}
              />
              <CardContent className="pt-0">
                <ul className="divide-y divide-border-subtle">
                  {run.safetyFindings.map((finding) => {
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
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Informations" />
            <CardContent>
              <dl className="space-y-3.5">
                <DataItem label="Prescripteur">{prescription.prescriberName ?? "—"}</DataItem>
                <DataItem label="Date de prescription">
                  {formatDate(prescription.prescribedAt)}
                </DataItem>
                <DataItem label="Importée le">
                  {formatDateTime(prescription.createdAt)}
                </DataItem>
                <DataItem label="Importée par">
                  {prescription.createdBy
                    ? `${prescription.createdBy.firstName} ${prescription.createdBy.lastName}`
                    : "—"}
                </DataItem>
                <DataItem label="Vérifiée par">
                  {prescription.verifiedBy
                    ? `${prescription.verifiedBy.firstName} ${prescription.verifiedBy.lastName}`
                    : "Pas encore vérifiée"}
                </DataItem>
                <DataItem label="Confiance d'extraction">
                  {prescription.ocrConfidence
                    ? `${Math.round(prescription.ocrConfidence * 100)} %`
                    : "—"}
                </DataItem>
              </dl>
            </CardContent>
          </Card>

          {prescription.fileKey && (
            <Card>
              <CardHeader title="Document source" />
              <CardContent>
                <a
                  href={`/api/files/${prescription.fileKey.split("/").map(encodeURIComponent).join("/")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-border-subtle p-3 transition-colors hover:border-brand-400"
                >
                  <FileImage className="size-5 shrink-0 text-text-tertiary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text-primary">
                      {prescription.fileName ?? "Ordonnance importée"}
                    </span>
                    <span className="block text-[11.5px] text-text-tertiary">
                      Ouvrir dans un nouvel onglet
                    </span>
                  </span>
                </a>
              </CardContent>
            </Card>
          )}

          {latestDocument && (
            <Card>
              <CardHeader title="Fiche patient" />
              <CardContent className="space-y-3">
                <dl className="space-y-3">
                  <DataItem label="Version">v{latestDocument.version}</DataItem>
                  <DataItem label="Générée le">
                    {formatDateTime(latestDocument.createdAt)}
                  </DataItem>
                  <DataItem label="Consultations">
                    {latestDocument.viewCount === 0
                      ? "Jamais consultée"
                      : `${latestDocument.viewCount} fois`}
                  </DataItem>
                </dl>
                <Button asChild variant="outline" className="w-full" leadingIcon={<FileText className="size-4" />}>
                  <Link href={`/fiche/${latestDocument.accessToken}`} target="_blank">
                    Ouvrir la fiche
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {prescription.sales.length > 0 && (
            <Card className="border-accent-200 dark:border-accent-800/60">
              <CardHeader title="Vente enregistrée" />
              <CardContent className="space-y-2">
                <p className="text-2xl font-semibold tabular text-accent-800 dark:text-accent-200">
                  {formatCents(attributedTotal)}
                </p>
                <p className="text-[12.5px] text-text-secondary">
                  attribués à Pharma.ai sur{" "}
                  {formatCents(
                    prescription.sales.reduce((sum, sale) => sum + sale.totalCents, 0),
                  )}{" "}
                  de vente totale.
                </p>
                <Button asChild variant="ghost" size="sm" leadingIcon={<Receipt className="size-4" />}>
                  <Link href="/ventes">Voir les ventes</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

const LINE_STATUS_LABELS: Record<string, string> = {
  EXTRACTED: "Extraite",
  NEEDS_REVIEW: "À vérifier",
  CONFIRMED: "Confirmée",
  REJECTED: "Écartée",
};
