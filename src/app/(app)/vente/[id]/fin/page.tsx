import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { DOCUMENT_ADVICE_STATUSES, buildDocumentUrl } from "@/server/services/documents";
import { getMessagingProvider } from "@/server/ai/registry";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { DocumentWorkspace } from "./document-workspace";
import { FollowUpPanel } from "./follow-up-panel";
import {
  SUGGESTIBLE_TEMPLATES,
  findTemplate,
  proposedDueDate,
  suggestFollowUp,
} from "@/core/followup";
import type { DocumentContent } from "@/core/documents/types";

export const metadata: Metadata = { title: "Fin de vente" };

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.DOCUMENT_GENERATE);

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          followUpOptOutAt: true,
          consents: {
            where: { type: { in: ["ADVICE_SHARING", "FOLLOW_UP_MESSAGE"] } },
            select: { type: true, granted: true, revokedAt: true },
          },
        },
      },
      recommendations: {
        where: { status: { in: ["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED"] } },
        include: { product: { include: { stockItem: true } } },
        orderBy: { totalScore: "desc" },
      },
      lines: { where: { status: "CONFIRMED" }, select: { durationDays: true } },
      documents: { orderBy: { createdAt: "desc" }, include: { deliveries: true } },
      sales: { select: { id: true, reference: true, attributedCents: true } },
    },
  });

  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) notFound();

  // Aucune fiche patient sans validation professionnelle.
  //
  // Le garde-fou est devenu nécessaire avec la pré-confirmation : une
  // ordonnance intégralement lue a désormais des lignes CONFIRMED avant que
  // quiconque ait validé. Sans ce contrôle, l'adresse `/fin` tapée à la main
  // produirait un compte rendu remis au patient à partir de lignes que
  // personne n'a signées. Le parcours normal valide juste avant d'arriver ici,
  // ce détour ne se voit donc jamais.
  if (!prescription.verifiedAt) redirect(`/vente/${prescription.id}`);

  const latestDocument = prescription.documents[0];

  /**
   * La fiche est-elle encore à jour ?
   *
   * Elle est préparée au moment de la validation, quand les conseils retenus
   * sont arrêtés. Un pharmacien peut ensuite retourner à l'écran de vente et en
   * ajouter un : la fiche déjà publiée ne le contiendrait pas, et rien ne le
   * dirait. C'est le seul risque que cette automatisation introduit, et il se
   * referme ici — deux signaux, parce qu'un seul laisserait passer un cas.
   */
  const retainedAdvice = prescription.recommendations.filter(
    (recommendation) =>
      recommendation.product &&
      (DOCUMENT_ADVICE_STATUSES as readonly string[]).includes(recommendation.status),
  );
  const documentAdvice = latestDocument
    ? ((latestDocument.contentJson as unknown as DocumentContent).advice ?? [])
    : [];
  // La comparaison porte sur le CONTENU, pas sur un horodatage : la fiche est
  // un instantané assumé — un prix qui bouge ne la périme pas — mais un conseil
  // retenu après coup, si. Un simple changement de statut (retenu → acheté) ne
  // doit donc pas déclencher une fausse alerte.
  const documentProducts = new Set(documentAdvice.map((item) => item.productName));
  const documentOutdated = Boolean(
    latestDocument &&
      (retainedAdvice.length !== documentAdvice.length ||
        retainedAdvice.some(
          (recommendation) => !documentProducts.has(recommendation.product?.name ?? ""),
        )),
  );
  const messaging = getMessagingProvider();
  const consentOf = (type: string) => {
    const consent = prescription.patient?.consents.find((c) => c.type === type);
    return Boolean(consent?.granted && !consent.revokedAt);
  };
  const hasAdviceConsent = consentOf("ADVICE_SHARING");

  // La fin de cure se calcule sur la durée réelle du traitement : proposer J+7
  // sur une cure de trois mois n'aurait aucun sens.
  const treatmentDurationDays = prescription.lines.reduce(
    (max, line) => Math.max(max, line.durationDays ?? 0),
    0,
  );
  const now = new Date();
  const followUpOptions = SUGGESTIBLE_TEMPLATES.map((template) => ({
    templateKey: template.key,
    label: template.label,
    purpose: template.purpose,
    dueAt: proposedDueDate(template, now, treatmentDurationDays).toISOString(),
  }));

  const scheduledReminders = prescription.patient
    ? await prisma.reminder.findMany({
        where: {
          patientId: prescription.patient.id,
          prescriptionId: prescription.id,
          status: { in: ["SCHEDULED", "SNOOZED", "SENT"] },
        },
        orderBy: { dueAt: "asc" },
        select: { templateKey: true, dueAt: true },
      })
    : [];

  // Le rappel proposé d'office. Il se déduit du traitement — durée réelle,
  // caractère chronique — et jamais d'un profil d'appétence.
  const scheduledKeys = scheduledReminders.map((reminder) => reminder.templateKey);
  const outcome = suggestFollowUp({
    treatmentDurationDays: treatmentDurationDays || null,
    hasConsent: consentOf("FOLLOW_UP_MESSAGE"),
    optedOut: Boolean(prescription.patient?.followUpOptOutAt),
    hasContact: Boolean(prescription.patient?.email),
    alreadyScheduled: scheduledKeys,
    now,
  });

  const suggestion = outcome.suggested
    ? {
        suggested: true as const,
        templateKey: outcome.suggestion.template.key,
        label: outcome.suggestion.template.label,
        dueAt: outcome.suggestion.dueAt.toISOString(),
        reason: outcome.suggestion.reason,
      }
    : { suggested: false as const, reason: outcome.reason };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href={`/vente/${prescription.id}`}>Retour à la vente</Link>
      </Button>

      <PageHeader
        title="Fin de vente"
        description={
          latestDocument
            ? `${prescription.reference} — la fiche est prête. Il reste à la remettre au patient.`
            : `${prescription.reference} — ce que le patient emporte : le rappel de son traitement et les seuls conseils que vous avez validés.`
        }
      />

      {documentOutdated && (
        <Alert tone="warning" title="Les conseils ont changé depuis cette fiche">
          La fiche publiée contient {documentAdvice.length} conseil
          {documentAdvice.length > 1 ? "s" : ""} ; {retainedAdvice.length}{" "}
          {retainedAdvice.length > 1 ? "sont retenus" : "est retenu"} aujourd&apos;hui. Générez la
          version {latestDocument.version + 1} avant de la remettre — celle-ci ne changera pas
          toute seule.
        </Alert>
      )}

      {prescription.recommendations.length === 0 && !latestDocument && (
        <Alert tone="warning" title="Aucun conseil validé">
          La fiche peut être générée avec le seul rappel du traitement. Pour y faire figurer des
          conseils, validez-les d&apos;abord sur l&apos;écran de vente.
        </Alert>
      )}

      <DocumentWorkspace
        prescriptionId={prescription.id}
        canSend={session.permissions.has(PERMISSIONS.DOCUMENT_SEND)}
        canRecordSale={session.permissions.has(PERMISSIONS.SALE_CREATE)}
        outdated={documentOutdated}
        canUpdateConsent={session.permissions.has(PERMISSIONS.PATIENT_UPDATE)}
        patient={
          prescription.patient
            ? {
                id: prescription.patient.id,
                name: `${prescription.patient.firstName} ${prescription.patient.lastName.toUpperCase()}`,
                email: prescription.patient.email,
                hasAdviceConsent,
              }
            : null
        }
        acceptedRecommendations={prescription.recommendations.map((recommendation) => ({
          id: recommendation.id,
          status: recommendation.status,
          productId: recommendation.productId,
          productName: recommendation.product?.name ?? "Produit supprimé",
          imageUrl: recommendation.product?.imageUrl ?? null,
          unitPriceCents:
            recommendation.unitPriceCents || (recommendation.product?.salePriceCents ?? 0),
          quantity: recommendation.quantity,
          stockQuantity: recommendation.product?.stockItem?.quantity ?? 0,
        }))}
        existingDocument={
          latestDocument
            ? {
                id: latestDocument.id,
                version: latestDocument.version,
                createdAt: latestDocument.createdAt.toISOString(),
                url: buildDocumentUrl(latestDocument.accessToken),
                viewCount: latestDocument.viewCount,
                content: latestDocument.contentJson as unknown as DocumentContent,
                deliveries: latestDocument.deliveries.map((delivery) => ({
                  id: delivery.id,
                  channel: delivery.channel,
                  status: delivery.status,
                  detail: delivery.detail,
                  createdAt: delivery.createdAt.toISOString(),
                })),
              }
            : null
        }
        messaging={{
          configured: messaging.info.capability === "LIVE",
          label: messaging.info.label,
          description: messaging.info.description,
        }}
        existingSales={prescription.sales.map((sale) => ({
          id: sale.id,
          reference: sale.reference,
          attributedCents: sale.attributedCents,
        }))}
        aside={
          <FollowUpPanel
            patientId={prescription.patient?.id ?? null}
            prescriptionId={prescription.id}
            saleId={prescription.sales[0]?.id ?? null}
            options={followUpOptions}
            suggestion={suggestion}
            hasConsent={consentOf("FOLLOW_UP_MESSAGE")}
            optedOut={Boolean(prescription.patient?.followUpOptOutAt)}
            scheduled={scheduledReminders.map((reminder) => ({
              templateLabel: findTemplate(reminder.templateKey)?.label ?? reminder.templateKey,
              dueAt: reminder.dueAt.toISOString(),
            }))}
            canSchedule={session.permissions.has(PERMISSIONS.FOLLOWUP_SCHEDULE)}
            canUpdateConsent={session.permissions.has(PERMISSIONS.PATIENT_UPDATE)}
          />
        }
      />
    </div>
  );
}
