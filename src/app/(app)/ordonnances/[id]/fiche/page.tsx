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
import type { DocumentContent } from "@/core/documents/types";

export const metadata: Metadata = { title: "Fiche patient" };

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
          consents: {
            where: { type: "ADVICE_SHARING" },
            select: { granted: true, revokedAt: true },
          },
        },
      },
      recommendations: {
        where: { status: { in: ["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED"] } },
        include: { product: { include: { stockItem: true } } },
        orderBy: { totalScore: "desc" },
      },
      documents: { orderBy: { createdAt: "desc" }, include: { deliveries: true } },
      sales: { select: { id: true, reference: true, attributedCents: true } },
    },
  });

  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) notFound();

  const latestDocument = prescription.documents[0];
  const messaging = getMessagingProvider();
  const consent = prescription.patient?.consents[0];
  const hasAdviceConsent = Boolean(consent?.granted && !consent.revokedAt);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href={`/ordonnances/${prescription.id}/copilote`}>Retour au copilote</Link>
      </Button>

      <PageHeader
        title="Fiche patient"
        description={`${prescription.reference} — le document remis au patient reprend uniquement les conseils que vous avez validés.`}
      />

      {prescription.recommendations.length === 0 && !latestDocument && (
        <Alert tone="warning" title="Aucun conseil validé">
          La fiche peut être générée avec le seul rappel du traitement. Pour y faire figurer des
          conseils, validez-les d&apos;abord dans le copilote.
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
    </div>
  );
}
