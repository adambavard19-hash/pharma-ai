"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { generatePatientDocument } from "@/server/services/documents";
import { buildDocumentEmail } from "@/core/documents/email";
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

    revalidatePath(`/vente/${parsed.data.prescriptionId}/fin`);
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
 * Trois règles tiennent cette action.
 *
 * 1. Aucun envoi sans consentement. Le patient doit avoir accepté que ses
 *    conseils lui soient transmis ; le contrôle est fait ICI, côté serveur, et
 *    non par le simple masquage d'un bouton.
 * 2. Le texte du message vient du domaine, jamais du prestataire.
 * 3. L'écran ne dit « transmis » que si le prestataire l'a confirmé. Un échec
 *    est enregistré comme tel, avec son motif réel ; l'absence de fournisseur
 *    reste un envoi SIMULÉ, annoncé comme tel.
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
      prescriptionId: true,
      accessToken: true,
      tokenExpiresAt: true,
      revokedAt: true,
      isDemo: true,
      patient: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          consents: {
            where: { type: "ADVICE_SHARING" },
            select: { granted: true, revokedAt: true },
          },
        },
      },
    },
  });
  if (!document || document.pharmacyId !== session.scope.pharmacyId) {
    return fail("Document introuvable dans cette officine.");
  }
  if (document.revokedAt) {
    return fail("Cette fiche a été révoquée : son lien ne mène plus à rien.");
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

  // Le SMS n'a aucun fournisseur : le dire franchement vaut mieux que
  // d'envoyer un e-mail à un numéro de téléphone.
  if (channel === "SMS") {
    await prisma.documentDelivery.create({
      data: {
        documentId,
        channel: "SMS",
        status: "SIMULATED",
        provider: "none",
        detail:
          "Aucun fournisseur SMS n'est branché dans Pharma.ai. Aucun message n'a été transmis.",
        userId: session.scope.userId,
      },
    });
    return fail(
      "L'envoi par SMS n'est pas disponible : aucun fournisseur SMS n'est branché. Utilisez l'e-mail, le QR code ou l'impression.",
    );
  }

  // À partir d'ici : canal e-mail.
  const consent = document.patient?.consents[0];
  if (!consent?.granted || consent.revokedAt) {
    return fail(
      "Le patient n'a pas accepté que ses conseils lui soient transmis. Recueillez son consentement avant tout envoi — la fiche reste imprimable ou consultable par QR code.",
    );
  }

  const recipient = target || document.patient?.email || "";
  if (!recipient) {
    return fail("Aucun destinataire renseigné pour ce patient.");
  }

  // Le téléphone n'est pas dans la session : c'est la seule information de
  // l'officine que le message ajoute, et elle vaut d'être exacte.
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: session.scope.pharmacyId },
    select: { phone: true },
  });

  const message = buildDocumentEmail({
    patientFirstName: document.patient?.firstName ?? "",
    pharmacyName: session.pharmacy.name,
    pharmacyPhone: pharmacy?.phone ?? null,
    url: buildDocumentUrl(document.accessToken),
    expiresAt: document.tokenExpiresAt,
    isDemo: document.isDemo,
  });

  const messaging = getMessagingProvider();
  const outcome = await messaging.sendEmail({
    to: recipient,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  await prisma.documentDelivery.create({
    data: {
      documentId,
      channel,
      status: outcome.status,
      provider: outcome.provider,
      detail: outcome.detail,
      targetMasked: maskEmail(recipient),
      userId: session.scope.userId,
    },
  });

  await recordAudit({
    action: "document.delivered",
    entityType: "PatientDocument",
    entityId: documentId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { channel, status: outcome.status, provider: outcome.provider },
  });

  revalidatePath(`/vente/${document.prescriptionId}/fin`);

  if (outcome.status === "SIMULATED") {
    return ok(
      { status: outcome.status, detail: outcome.detail },
      "Envoi NON effectué : aucun service de messagerie n'est configuré.",
    );
  }

  if (outcome.status === "FAILED") {
    return fail(`Envoi ÉCHOUÉ, aucun message n'est parti. ${outcome.detail}`);
  }

  return ok({ status: outcome.status, detail: outcome.detail }, "Message transmis.");
}
