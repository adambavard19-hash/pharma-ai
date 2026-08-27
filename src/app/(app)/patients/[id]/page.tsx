import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  Lock,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getHealthProfile } from "@/server/services/patients";
import { recordAudit } from "@/server/audit/log";
import { DataItem, Grid } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/ui/stat-card";
import { formatAge, formatCents, formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { initials } from "@/lib/utils";
import { PRESCRIPTION_STATUS } from "@/config/statuses";
import { HealthProfileForm } from "./health-profile-form";
import { ConsentPanel } from "./consent-panel";

export const metadata: Metadata = { title: "Fiche patient" };

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.PATIENT_VIEW);

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      consents: true,
      prescriptions: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          lines: { select: { drugName: true }, orderBy: { position: "asc" } },
          _count: { select: { recommendations: true } },
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          version: true,
          createdAt: true,
          viewCount: true,
          accessToken: true,
          prescription: { select: { reference: true } },
        },
      },
      sales: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { lines: { select: { label: true, quantity: true, totalCents: true } } },
      },
      interactions: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  });

  if (!patient || patient.pharmacyId !== session.scope.pharmacyId || patient.deletedAt) {
    notFound();
  }

  const canSeeHealth = session.permissions.has(PERMISSIONS.PATIENT_HEALTH_VIEW);
  const canEditHealth = session.permissions.has(PERMISSIONS.PATIENT_HEALTH_UPDATE);
  const healthProfile = canSeeHealth ? await getHealthProfile(patient.id) : null;

  if (canSeeHealth) {
    // L'accès aux données de santé est systématiquement tracé.
    await recordAudit({
      action: "patient.health_viewed",
      entityType: "Patient",
      entityId: patient.id,
      pharmacyId: session.scope.pharmacyId,
      userId: session.scope.userId,
    });
  }

  const purchasedTotal = patient.sales.reduce((sum, sale) => sum + sale.attributedCents, 0);
  const consentMap = new Map(patient.consents.map((c) => [c.type, c]));
  const adviceConsent = consentMap.get("ADVICE_SHARING");
  const hasAdviceConsent = Boolean(adviceConsent?.granted && !adviceConsent.revokedAt);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/patients">Retour aux patients</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar
            size="xl"
            initials={initials(patient.firstName, patient.lastName)}
            name={`${patient.firstName} ${patient.lastName}`}
          />
          <div className="space-y-1">
            <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em] text-text-primary">
              {patient.firstName} {patient.lastName.toUpperCase()}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-secondary">
              <span className="font-mono text-[12px]">{patient.reference}</span>
              <span aria-hidden="true">·</span>
              <span>{formatAge(patient.birthDate)}</span>
              {patient.city && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{patient.city}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE) && (
            <Button asChild leadingIcon={<ClipboardList className="size-[18px]" />}>
              <Link href={`/ordonnances/nouvelle?patient=${patient.id}`}>
                Nouvelle ordonnance
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Grid cols={4}>
        <StatCard
          label="Ordonnances"
          value={patient.prescriptions.length}
          sublabel="dans l'historique"
          icon={<ClipboardList className="size-4" />}
        />
        <StatCard
          label="Fiches conseil remises"
          value={patient.documents.length}
          sublabel={`${patient.documents.reduce((s, d) => s + d.viewCount, 0)} consultation(s)`}
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Conseils achetés"
          value={formatCents(purchasedTotal)}
          sublabel="produits complémentaires"
          emphasis="accent"
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="Partage de la fiche"
          value={hasAdviceConsent ? "Accepté" : "Non accordé"}
          sublabel={
            hasAdviceConsent
              ? "La fiche conseil peut être transmise"
              : "La fiche ne peut pas être envoyée"
          }
          icon={<ShieldCheck className="size-4" />}
        />
      </Grid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Historique des ordonnances"
              description="Traitements analysés et conseils générés."
            />
            <CardContent className="pt-0">
              {patient.prescriptions.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="size-5" />}
                  title="Aucune ordonnance"
                  description="Les ordonnances importées pour ce patient apparaîtront ici."
                />
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {patient.prescriptions.map((prescription) => {
                    const status = PRESCRIPTION_STATUS[prescription.status];
                    return (
                      <li key={prescription.id}>
                        <Link
                          href={`/ordonnances/${prescription.id}`}
                          className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg px-2 py-3 transition-colors hover:bg-surface-sunken"
                        >
                          <span className="font-mono text-[12px] text-text-tertiary">
                            {prescription.reference}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-primary">
                            {prescription.lines.map((l) => l.drugName).filter(Boolean).join(" · ") ||
                              "Aucune ligne"}
                          </span>
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <span className="w-24 shrink-0 text-right text-[12.5px] text-text-tertiary">
                            {formatDate(prescription.createdAt)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {canSeeHealth ? (
            <Card>
              <CardHeader
                title="Profil de santé"
                description="Données de santé — accès tracé, champs libres chiffrés."
                action={
                  <Badge tone="brand" icon={<Lock className="size-3" />}>
                    Chiffré
                  </Badge>
                }
              />
              <CardContent>
                <HealthProfileForm
                  patientId={patient.id}
                  profile={healthProfile!}
                  readOnly={!canEditHealth}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-5">
                <Alert tone="neutral" title="Données de santé non accessibles">
                  Votre rôle ne donne pas accès au profil de santé de ce patient. Cette
                  restriction relève du principe du moindre privilège.
                </Alert>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader title="Ventes complémentaires" description="Produits de conseil achetés." />
            <CardContent className="pt-0">
              {patient.sales.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="size-5" />}
                  title="Aucune vente enregistrée"
                  description="Les ventes complémentaires liées à ce patient apparaîtront ici."
                />
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {patient.sales.map((sale) => (
                    <li key={sale.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                      <span className="font-mono text-[12px] text-text-tertiary">
                        {sale.reference}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-primary">
                        {sale.lines.map((line) => line.label).join(", ")}
                      </span>
                      {sale.attributedCents > 0 && (
                        <Badge tone="accent">
                          {formatCents(sale.attributedCents)} via Pharma.ai
                        </Badge>
                      )}
                      <span className="w-20 shrink-0 text-right text-[13px] font-medium tabular">
                        {formatCents(sale.totalCents)}
                      </span>
                      <span className="w-24 shrink-0 text-right text-[12px] text-text-tertiary">
                        {formatDate(sale.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Coordonnées" />
            <CardContent>
              <dl className="space-y-3.5">
                <DataItem label="E-mail">{patient.email ?? "—"}</DataItem>
                <DataItem label="Téléphone">{patient.phone ?? "—"}</DataItem>
                <DataItem label="Adresse">
                  {[patient.addressLine1, patient.postalCode, patient.city]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </DataItem>
                <DataItem label="Date de naissance">{formatDate(patient.birthDate)}</DataItem>
                <DataItem label="Créé le">{formatDate(patient.createdAt)}</DataItem>
              </dl>
              {patient.commercialNotes && (
                <div className="mt-4 border-t border-border-subtle pt-3.5">
                  <p className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">
                    Notes commerciales
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-text-secondary">
                    {patient.commercialNotes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <ConsentPanel
            patientId={patient.id}
            consents={patient.consents.map((c) => ({
              type: c.type,
              granted: c.granted && !c.revokedAt,
              updatedAt: c.grantedAt ?? c.revokedAt ?? c.createdAt,
            }))}
            canEdit={session.permissions.has(PERMISSIONS.PATIENT_UPDATE)}
          />

          <Card>
            <CardHeader title="Fiches conseil" description="Documents générés pour ce patient." />
            <CardContent className="pt-0">
              {patient.documents.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-text-tertiary">
                  Aucune fiche générée.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {patient.documents.map((document) => (
                    <li key={document.id} className="flex items-center gap-3 py-2.5">
                      <FileText className="size-4 shrink-0 text-text-tertiary" />
                      <span className="min-w-0 flex-1">
                        <Link
                          href={`/fiche/${document.accessToken}`}
                          target="_blank"
                          className="block truncate text-[13px] text-text-primary hover:underline"
                        >
                          {document.prescription.reference} — v{document.version}
                        </Link>
                        <span className="block text-[11.5px] text-text-tertiary">
                          {formatDate(document.createdAt)} ·{" "}
                          {document.viewCount === 0
                            ? "jamais consultée"
                            : `${document.viewCount} consultation(s)`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Journal des interactions" />
            <CardContent className="pt-0">
              {patient.interactions.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-text-tertiary">
                  Aucune interaction enregistrée.
                </p>
              ) : (
                <ol className="space-y-3">
                  {patient.interactions.map((interaction) => (
                    <li key={interaction.id} className="flex gap-3">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[13px] leading-5 text-text-primary">
                          {interaction.summary}
                        </p>
                        <p className="text-[11.5px] text-text-tertiary">
                          {formatDateTime(interaction.createdAt)} ·{" "}
                          {formatRelative(interaction.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
