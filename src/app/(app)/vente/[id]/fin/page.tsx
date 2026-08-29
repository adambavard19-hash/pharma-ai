import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { buildDocumentUrl } from "@/server/services/documents";
import { getMessagingProvider } from "@/server/ai/registry";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { DocumentWorkspace } from "./document-workspace";
import { FollowUpPanel } from "./follow-up-panel";
import { FOLLOW_UP_TEMPLATES, findTemplate, proposedDueDate } from "@/core/followup";
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

  const latestDocument = prescription.documents[0];
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
  const followUpOptions = FOLLOW_UP_TEMPLATES.filter(
    (template) => template.key !== "custom" && template.key !== "seasonal",
  ).map((template) => ({
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

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href={`/vente/${prescription.id}`}>Retour à la vente</Link>
      </Button>

      <PageHeader
        title="Fin de vente"
        description={`${prescription.reference} — ce que le patient emporte : le rappel de son traitement et les seuls conseils que vous avez validés.`}
      />

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
        messagingConfigured={messaging.info.capability === "LIVE"}
        existingSales={prescription.sales.map((sale) => ({
          id: sale.id,
          reference: sale.reference,
          attributedCents: sale.attributedCents,
        }))}
      />

      <FollowUpPanel
        patientId={prescription.patient?.id ?? null}
        prescriptionId={prescription.id}
        saleId={prescription.sales[0]?.id ?? null}
        options={followUpOptions}
        hasConsent={consentOf("FOLLOW_UP_MESSAGE")}
        optedOut={Boolean(prescription.patient?.followUpOptOutAt)}
        scheduled={scheduledReminders.map((reminder) => ({
          templateLabel: findTemplate(reminder.templateKey)?.label ?? reminder.templateKey,
          dueAt: reminder.dueAt.toISOString(),
        }))}
        canSchedule={session.permissions.has(PERMISSIONS.FOLLOWUP_SCHEDULE)}
        canUpdateConsent={session.permissions.has(PERMISSIONS.PATIENT_UPDATE)}
      />
    </div>
  );
}
