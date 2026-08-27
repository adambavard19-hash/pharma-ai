"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { generatePatientDocument } from "@/server/services/documents";
import { getMessagingProvider } from "@/server/ai/registry";
import { maskEmail } from "@/server/security/tokens";
import { recordAudit } from "@/server/audit/log";
import { buildDocumentUrl } from "@/server/services/documents";
import { fail, ok, type ActionResult } from "./types";

const generateSchema = z.object({
  prescriptionId: z.string().min(1),
  pharmacistNote: z.string().trim().max(600).optional(),
});

export async function generateDocumentAction(
  payload: z.input<typeof generateSchema>,
): Promise<ActionResult<{ documentId: string; url: string }>> {
  const session = await requirePermission(PERMISSIONS.DOCUMENT_GENERATE);
  const parsed = generateSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");

  try {
    const result = await generatePatientDocument({
      session,
      prescriptionId: parsed.data.prescriptionId,
      pharmacistNote: parsed.data.pharmacistNote ?? null,
    });

    revalidatePath(`/ordonnances/${parsed.data.prescriptionId}`);
    return ok(
      { documentId: result.documentId, url: result.url },
      "Fiche patient générée.",
    );
  } catch (error) {
    console.error("[documents] génération impossible", error);
    return fail(
      error instanceof Error ? error.message : "La fiche n'a pas pu être générée.",
    );
  }
}

const sendSchema = z.object({
  documentId: z.string().min(1),
  channel: z.enum(["EMAIL", "SMS", "PRINT", "QR_CODE", "LINK"]),
  target: z.string().trim().max(160).optional(),
});

/**
 * Transmission de la fiche.
 *
 * IMPORTANT : tant qu'aucun fournisseur d'envoi n'est configuré, l'action
 * enregistre le statut `SIMULATED` et le message de retour indique clairement
 * qu'AUCUN message n'a été transmis. L'application ne prétend jamais avoir
 * envoyé un e-mail ou un SMS.
 */
export async function deliverDocumentAction(
  payload: z.input<typeof sendSchema>,
): Promise<ActionResult<{ status: string; detail: string }>> {
  const session = await requirePermission(PERMISSIONS.DOCUMENT_SEND);
  const parsed = sendSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");

  const { documentId, channel, target } = parsed.data;

  const document = await prisma.patientDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      pharmacyId: true,
      accessToken: true,
      patient: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!document || document.pharmacyId !== session.scope.pharmacyId) {
    return fail("Document introuvable dans cette officine.");
  }

  if (channel === "PRINT") {
    await prisma.$transaction([
      prisma.patientDocument.update({
        where: { id: documentId },
        data: { printedAt: new Date() },
      }),
      prisma.documentDelivery.create({
        data: {
          documentId,
          channel: "PRINT",
          status: "SENT",
          provider: "navigateur",
          detail: "Impression déclenchée depuis le poste.",
          userId: session.scope.userId,
        },
      }),
    ]);
    return ok({ status: "SENT", detail: "Impression enregistrée." });
  }

  if (channel === "QR_CODE" || channel === "LINK") {
    await prisma.documentDelivery.create({
      data: {
        documentId,
        channel,
        status: "SENT",
        provider: "application",
        detail:
          channel === "QR_CODE"
            ? "QR code affiché au patient au comptoir."
            : "Lien sécurisé copié.",
        userId: session.scope.userId,
      },
    });
    return ok({
      status: "SENT",
      detail: buildDocumentUrl(document.accessToken),
    });
  }

  const messaging = getMessagingProvider();
  const recipient = target || document.patient?.email || "";
  if (!recipient) {
    return fail("Aucun destinataire renseigné pour ce patient.");
  }

  const outcome = await messaging.sendDocumentLink({
    to: recipient,
    patientName: document.patient
      ? `${document.patient.firstName} ${document.patient.lastName}`
      : "Patient",
    pharmacyName: session.pharmacy.name,
    url: buildDocumentUrl(document.accessToken),
  });

  await prisma.documentDelivery.create({
    data: {
      documentId,
      channel,
      status: outcome.status,
      provider: outcome.provider,
      detail: outcome.detail,
      targetMasked: recipient.includes("@") ? maskEmail(recipient) : recipient.slice(0, 4) + "***",
      userId: session.scope.userId,
    },
  });

  await recordAudit({
    action: "document.delivered",
    entityType: "PatientDocument",
    entityId: documentId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { channel, status: outcome.status },
  });

  if (outcome.status === "SIMULATED") {
    return ok(
      { status: outcome.status, detail: outcome.detail },
      "Envoi NON effectué : aucun service de messagerie n'est configuré.",
    );
  }

  return ok({ status: outcome.status, detail: outcome.detail }, "Message transmis.");
}
