import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { OCR_REVIEW_THRESHOLD } from "@/config/constants";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { VerificationForm } from "./verification-form";

export const metadata: Metadata = { title: "Vérification de l'ordonnance" };

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);

  const prescription = await prisma.prescription.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: "asc" } },
      patient: { select: { id: true, firstName: true, lastName: true, reference: true } },
    },
  });

  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) notFound();

  const patients = await prisma.patient.findMany({
    where: { pharmacyId: session.scope.pharmacyId, deletedAt: null },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, reference: true },
    take: 300,
  });

  const unreadableCount = prescription.lines.reduce(
    (sum, line) => sum + line.unreadableFields.length,
    0,
  );
  const lowConfidenceCount = prescription.lines.filter((line) => {
    const confidence = (line.fieldConfidence ?? {}) as Record<string, number>;
    return (confidence.drugName ?? 0) < OCR_REVIEW_THRESHOLD;
  }).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href={`/ordonnances/${prescription.id}`}>Retour à l&apos;ordonnance</Link>
      </Button>

      <PageHeader
        title="Vérification de l'ordonnance"
        description={`${prescription.reference} — confirmez chaque ligne avant l'analyse. Une ligne non confirmée est exclue.`}
      />

      <Alert tone="warning" title="Rien n'a été deviné">
        L&apos;extraction ne complète jamais un champ illisible. Un champ vide reste vide et
        doit être saisi par un professionnel.
        {unreadableCount > 0 && (
          <>
            {" "}
            <strong>
              {unreadableCount} champ{unreadableCount > 1 ? "s ont" : " a"} été marqué
              {unreadableCount > 1 ? "s" : ""} illisible{unreadableCount > 1 ? "s" : ""}
            </strong>{" "}
            sur cette ordonnance.
          </>
        )}
        {lowConfidenceCount > 0 && (
          <>
            {" "}
            {lowConfidenceCount} nom{lowConfidenceCount > 1 ? "s" : ""} de médicament{" "}
            {lowConfidenceCount > 1 ? "ont" : "a"} été lu
            {lowConfidenceCount > 1 ? "s" : ""} avec une confiance faible.
          </>
        )}
      </Alert>

      {prescription.ocrProvider === "mock-ocr" && (
        <Alert
          tone="danger"
          title="Ces données proviennent d'une extraction simulée"
          icon={<ShieldAlert className="size-[18px]" />}
        >
          Aucune image n&apos;a été analysée. Le contenu affiché est un scénario fictif de
          démonstration : il ne correspond à aucune ordonnance réelle et ne doit en aucun cas
          être traité comme tel.
        </Alert>
      )}

      <VerificationForm
        prescription={{
          id: prescription.id,
          reference: prescription.reference,
          prescriberName: prescription.prescriberName,
          prescribedAt: prescription.prescribedAt?.toISOString().slice(0, 10) ?? null,
          patientId: prescription.patientId,
          ocrConfidence: prescription.ocrConfidence,
        }}
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
        }))}
        patients={patients}
      />
    </div>
  );
}
