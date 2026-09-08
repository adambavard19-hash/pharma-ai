import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, FileText, Lock } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getHealthProfile } from "@/server/services/patients";
import { buildDocumentUrl } from "@/server/services/documents";
import { recordAudit } from "@/server/audit/log";
import { activityScope } from "@/server/db/demo-scope";
import { findAnswer, findTemplate } from "@/core/followup";
import { formatSchedule, readSchedule, unitFor } from "@/core/posology";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { formatAge, formatDate, formatDateLong, formatDateTime } from "@/lib/format";
import { initials } from "@/lib/utils";
import { PRESCRIPTION_STATUS } from "@/config/statuses";
import { HealthProfileForm } from "./health-profile-form";
import { ConsentPanel } from "./consent-panel";

export const metadata: Metadata = { title: "Fiche patient" };

/**
 * La fiche patient, lue en deux secondes.
 *
 * Qui, quand, où — puis ce qu'il prend, ses ordonnances, les conseils qu'il a
 * reçus, ses suivis, l'historique. Rien de technique : pas de score, pas de
 * moteur, pas de chiffre d'affaires. Un patient n'est visible que dans son
 * officine ; les données de santé restent derrière un droit distinct et tracé.
 */
export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.PATIENT_VIEW);

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      consents: true,
      prescriptions: {
        where: { deletedAt: null, ...activityScope() },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          lines: {
            where: { status: "CONFIRMED" },
            orderBy: { position: "asc" },
            select: { drugName: true, dosage: true, form: true, posology: true, schedule: true, durationDays: true },
          },
          documents: { orderBy: { createdAt: "desc" }, take: 1, select: { accessToken: true, version: true, createdAt: true, revokedAt: true } },
          recommendations: {
            where: { status: { in: ["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED"] } },
            orderBy: { createdAt: "asc" },
            select: { id: true, status: true, patientReason: true, product: { select: { name: true } } },
          },
        },
      },
      reminders: { where: activityScope(), orderBy: { dueAt: "desc" }, take: 10 },
      interactions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  // Isolation stricte : un patient d'une autre officine n'existe pas ici.
  if (!patient || patient.pharmacyId !== session.scope.pharmacyId || patient.deletedAt) notFound();

  const canSeeHealth = session.permissions.has(PERMISSIONS.PATIENT_HEALTH_VIEW);
  const canEditHealth = session.permissions.has(PERMISSIONS.PATIENT_HEALTH_UPDATE);
  const healthProfile = canSeeHealth ? await getHealthProfile(patient.id) : null;
  if (canSeeHealth) {
    await recordAudit({
      action: "patient.health_viewed",
      entityType: "Patient",
      entityId: patient.id,
      pharmacyId: session.scope.pharmacyId,
      userId: session.scope.userId,
    });
  }

  const lastVisit = patient.prescriptions[0]?.createdAt ?? null;
  const current = patient.prescriptions.find((p) => p.lines.length > 0) ?? null;
  const currentPlan = current?.documents[0] && !current.documents[0].revokedAt ? current.documents[0] : null;
  const adviceReceived = patient.prescriptions.flatMap((p) =>
    p.recommendations.filter((r) => r.product).map((r) => ({ ...r, at: p.createdAt })),
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/patients">Retour aux patients</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar size="xl" initials={initials(patient.firstName, patient.lastName)} name={`${patient.firstName} ${patient.lastName}`} />
          <div className="space-y-1">
            <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em] text-text-primary">
              {patient.firstName} {patient.lastName.toUpperCase()}
            </h1>
            <p className="text-[14px] leading-5 text-text-secondary">
              {lastVisit ? `Dernier passage : ${formatDateLong(lastVisit)}` : "Aucun passage enregistré"}
              <span aria-hidden="true"> · </span>
              {session.pharmacy.name}
            </p>
            <p className="text-[12.5px] text-text-tertiary">
              {[formatAge(patient.birthDate), patient.city].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE) && (
          <Button asChild leadingIcon={<ClipboardList className="size-[18px]" />}>
            <Link href={`/vente/nouvelle?patient=${patient.id}`}>Nouvelle ordonnance</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ---- Traitement actuel ------------------------------------- */}
          <Card>
            <CardHeader
              title="Traitement actuel"
              description={current ? `Ordonnance du ${formatDate(current.prescribedAt ?? current.createdAt)}${current.prescriberName ? ` · ${current.prescriberName}` : ""}` : undefined}
              action={
                currentPlan ? (
                  <Button asChild size="sm" variant="outline" leadingIcon={<FileText className="size-4" />}>
                    <a href={buildDocumentUrl(currentPlan.accessToken)} target="_blank" rel="noreferrer">
                      Plan remis (v{currentPlan.version})
                    </a>
                  </Button>
                ) : undefined
              }
            />
            <CardContent className="pt-0">
              {!current ? (
                <p className="py-3 text-[13.5px] text-text-secondary">Aucun traitement validé pour ce patient.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {current.lines.map((line) => {
                    const schedule = readSchedule(line.schedule);
                    return (
                      <li key={`${line.drugName}-${line.dosage}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                        <span className="text-[14.5px] font-medium text-text-primary">
                          {line.drugName}
                          {line.dosage && <span className="font-normal text-text-secondary"> {line.dosage}</span>}
                        </span>
                        <span className="text-[13px] text-text-secondary">
                          {schedule ? formatSchedule(schedule, unitFor(line.form)) : line.posology ?? "Posologie à confirmer"}
                          {line.durationDays ? ` · ${line.durationDays} j` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ---- Dernières ordonnances --------------------------------- */}
          <Card>
            <CardHeader title="Dernières ordonnances" />
            <CardContent className="pt-0">
              {patient.prescriptions.length === 0 ? (
                <p className="py-3 text-[13.5px] text-text-secondary">Aucune ordonnance.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {patient.prescriptions.map((prescription) => {
                    const status = PRESCRIPTION_STATUS[prescription.status] ?? { label: prescription.status, tone: "neutral" as const };
                    return (
                      <li key={prescription.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                        <Link href={`/vente/${prescription.id}`} className="text-[14px] font-medium text-text-primary hover:underline">
                          {formatDate(prescription.prescribedAt ?? prescription.createdAt)}
                        </Link>
                        <span className="text-[13px] text-text-secondary">
                          {prescription.prescriberName ?? "Prescripteur non renseigné"} · {prescription.lines.length} médicament{prescription.lines.length > 1 ? "s" : ""}
                        </span>
                        <Badge tone={status.tone} className="ml-auto">{status.label}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ---- Conseils reçus ---------------------------------------- */}
          <Card>
            <CardHeader title="Conseils reçus" description="Uniquement ce qui a été proposé ou remis au patient." />
            <CardContent className="pt-0">
              {adviceReceived.length === 0 ? (
                <p className="py-3 text-[13.5px] text-text-secondary">Aucun conseil remis pour le moment.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {adviceReceived.map((advice) => (
                    <li key={advice.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                      <span className="text-[14px] font-medium text-text-primary">{advice.product!.name}</span>
                      <span className="text-[13px] text-text-secondary">{formatDate(advice.at)}</span>
                      <Badge tone={advice.status === "PURCHASED" ? "success" : "neutral"} className="ml-auto">
                        {advice.status === "PURCHASED" ? "Acheté" : "Remis sur le plan"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ---- Suivis ------------------------------------------------ */}
          <Card>
            <CardHeader title="Suivis" />
            <CardContent className="pt-0">
              {patient.reminders.length === 0 ? (
                <p className="py-3 text-[13.5px] text-text-secondary">Aucun suivi programmé.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {patient.reminders.map((reminder) => {
                    const answer = findAnswer(reminder.answer);
                    return (
                      <li key={reminder.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                        <span className="text-[14px] font-medium text-text-primary">{findTemplate(reminder.templateKey)?.label ?? reminder.templateKey}</span>
                        <span className="text-[13px] text-text-secondary">
                          {reminder.status === "SENT" || reminder.status === "DONE"
                            ? reminder.sentAt ? `envoyé le ${formatDate(reminder.sentAt)}` : "clos"
                            : reminder.status === "CANCELLED" ? "annulé" : `prévu le ${formatDate(reminder.dueAt)}`}
                        </span>
                        {answer && (
                          <Badge tone={answer.code === "NEED_ADVICE" ? "warning" : answer.code === "BETTER" ? "success" : "neutral"} className="ml-auto">
                            {answer.emoji} {answer.pharmacistLabel}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ---- Historique -------------------------------------------- */}
          <Card>
            <CardHeader title="Historique" />
            <CardContent className="pt-0">
              {patient.interactions.length === 0 ? (
                <p className="py-3 text-[13.5px] text-text-secondary">Aucun événement.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {patient.interactions.map((interaction) => (
                    <li key={interaction.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2">
                      <span className="w-[150px] shrink-0 text-[12.5px] tabular text-text-tertiary">{formatDateTime(interaction.createdAt)}</span>
                      <span className="text-[13.5px] text-text-secondary">{interaction.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Coordonnées" />
            <CardContent className="space-y-2 pt-0 text-[13.5px]">
              <p><span className="text-text-tertiary">E-mail : </span>{patient.email ?? "—"}</p>
              <p><span className="text-text-tertiary">Téléphone : </span>{patient.phone ?? "—"}</p>
              <p><span className="text-text-tertiary">Naissance : </span>{patient.birthDate ? formatDate(patient.birthDate) : "—"}</p>
            </CardContent>
          </Card>

          <ConsentPanel
            patientId={patient.id}
            consents={patient.consents.map((c) => ({ type: c.type, granted: c.granted && !c.revokedAt, updatedAt: c.grantedAt ?? c.revokedAt ?? c.createdAt }))}
            canEdit={session.permissions.has(PERMISSIONS.PATIENT_UPDATE)}
          />

          {canSeeHealth ? (
            <Card>
              <CardHeader
                title="Profil de santé"
                description="Accès tracé, champs libres chiffrés."
                action={<Badge tone="brand" icon={<Lock className="size-3" />}>Chiffré</Badge>}
              />
              <CardContent>
                <HealthProfileForm patientId={patient.id} profile={healthProfile!} readOnly={!canEditHealth} />
              </CardContent>
            </Card>
          ) : (
            <Alert tone="neutral" title="Données de santé non accessibles">
              Votre rôle ne donne pas accès au profil de santé de ce patient.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
