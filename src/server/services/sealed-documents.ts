import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { maskEmail } from "@/server/security/tokens";
import { newsOptInUrlFor } from "@/server/services/patient-news";
import type { DocumentAuthor } from "@/server/services/documents";
import { composeDocumentContent } from "@/server/services/documents";
import { SEALED_DOCUMENT_TTL_MS, buildSealedUrl, sealContent } from "@/core/documents/seal";
import { buildDocumentEmail } from "@/core/documents/email";
import { summarizeDayPlan } from "@/core/documents/compose";
import type { DocumentContent } from "@/core/documents/types";

/**
 * Le plan de prise remis sans conserver de donnée de santé rattachée à une
 * personne (mode `PATIENT_DATA_MODE=none`).
 *
 * Le contenu est composé comme pour une fiche, sans identité, puis chiffré
 * avec une clé tirée au hasard. Le serveur garde le chiffré et jette la clé ;
 * elle n'existe que dans le lien remis au patient, après le dièse. Le plan en
 * clair ne revient qu'au poste du pharmacien, le temps de l'afficher.
 */
export async function generateSealedDocument(params: { session: DocumentAuthor; prescriptionId: string; pharmacistNote?: string | null }): Promise<{ documentId: string; url: string; expiresAt: Date; content: DocumentContent }> {
  const { session } = params;
  const scope = session.scope;
  const { content, prescription } = await composeDocumentContent({ session, prescriptionId: params.prescriptionId, pharmacistNote: params.pharmacistNote ?? null, withIdentity: false });
  const { key, payload } = sealContent(content);
  const expiresAt = new Date(Date.now() + SEALED_DOCUMENT_TTL_MS);
  const version = (await prisma.sealedDocument.count({ where: { prescriptionId: prescription.id } })) + 1;

  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.sealedDocument.create({
      data: { pharmacyId: scope.pharmacyId, prescriptionId: prescription.id, version, ciphertext: new Uint8Array(payload.ciphertext), iv: new Uint8Array(payload.iv), tag: new Uint8Array(payload.tag), expiresAt, createdByUserId: scope.userId, isDemo: prescription.isDemo },
      select: { id: true },
    });
    // Les conseils validés sont présentés au patient ; un conseil déjà acheté
    // garde son statut comptable.
    const presentedIds = prescription.recommendations.filter((r) => r.status !== "PURCHASED").map((r) => r.id);
    if (presentedIds.length > 0) {
      await tx.recommendation.updateMany({ where: { id: { in: presentedIds } }, data: { status: "PRESENTED", presentedAt: new Date() } });
      for (const id of presentedIds) {
        await tx.recommendationEvent.create({ data: { recommendationId: id, type: "PRESENTED_TO_PATIENT", userId: scope.userId, metadata: { sealedDocumentId: created.id } as never } });
      }
    }
    await tx.prescription.update({ where: { id: prescription.id }, data: { status: "VALIDATED", validatedAt: new Date() } });
    return created;
  });

  await recordAudit({ action: "document.generated", entityType: "SealedDocument", entityId: document.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { prescriptionId: prescription.id, version, sealed: true, adviceCount: content.advice.length, treatmentCount: content.treatment.length } });
  return { documentId: document.id, url: buildSealedUrl(resolvePublicBaseUrl().url, document.id, key), expiresAt, content };
}

/** Le chiffré, pour le navigateur du patient. Rien d'autre n'en sort. */
export async function readSealedDocument(id: string): Promise<{ ciphertext: Buffer; iv: Buffer; tag: Buffer; expiresAt: Date } | null> {
  const document = await prisma.sealedDocument.findUnique({ where: { id }, select: { ciphertext: true, iv: true, tag: true, expiresAt: true, revokedAt: true } });
  if (!document || document.revokedAt || document.expiresAt < new Date()) return null;
  await prisma.sealedDocument.update({ where: { id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => undefined);
  return { ciphertext: Buffer.from(document.ciphertext), iv: Buffer.from(document.iv), tag: Buffer.from(document.tag), expiresAt: document.expiresAt };
}

/**
 * L'envoi par e-mail : l'adresse est donnée au comptoir, utilisée une fois,
 * jamais conservée — seule une forme masquée (j***@exemple.fr) reste dans la
 * trace. Le message ne contient aucune donnée de santé : un lien, et le
 * nombre de prises par moment. Le lien facultatif d'abonnement aux nouveautés
 * porte l'adresse chiffrée : c'est le patient qui, en le confirmant, décidera
 * seul de la faire conserver.
 */
export async function emailSealedDocument(params: { scope: { pharmacyId: string; userId: string; isDemo?: boolean }; documentId: string; url: string; to: string; content: DocumentContent }): Promise<{ status: string; detail: string }> {
  const document = await prisma.sealedDocument.findUnique({ where: { id: params.documentId }, select: { pharmacyId: true, expiresAt: true, isDemo: true } });
  if (!document || document.pharmacyId !== params.scope.pharmacyId) throw new Error("Plan introuvable dans cette officine.");
  // Un lien d'abonnement qui ne peut pas être préparé ne doit jamais retarder ni empêcher la remise du plan.
  let newsOptInUrl: string | null = null;
  try {
    newsOptInUrl = await newsOptInUrlFor(params.scope.pharmacyId, params.to);
  } catch {
    console.error("[nouveautés] lien d'abonnement non préparé : le plan part sans le bloc");
  }
  const message = buildDocumentEmail({
    patientFirstName: "",
    pharmacyName: params.content.pharmacy.name,
    pharmacyPhone: params.content.pharmacy.phone,
    brandColor: params.content.pharmacy.brandColor,
    passageAt: new Date(params.content.passageAt ?? params.content.generatedAt),
    dayPlan: summarizeDayPlan(params.content.treatment),
    url: params.url,
    printUrl: null,
    expiresAt: document.expiresAt,
    isDemo: document.isDemo,
    newsOptIn: newsOptInUrl ? { url: newsOptInUrl } : null,
  });
  const outcome = await getMessagingProvider({ demo: params.scope.isDemo }).sendEmail({ to: params.to, fromName: params.content.pharmacy.name, subject: message.subject, text: message.text, html: message.html });
  await recordAudit({ action: "document.delivered", entityType: "SealedDocument", entityId: params.documentId, pharmacyId: params.scope.pharmacyId, userId: params.scope.userId, metadata: { channel: "EMAIL", status: outcome.status, target: maskEmail(params.to), provider: outcome.provider } });
  return { status: outcome.status, detail: outcome.detail };
}

/** Les plans scellés échus ou révoqués disparaissent : il n'y a rien à garder. */
export async function purgeExpiredSealedDocuments(): Promise<number> {
  const result = await prisma.sealedDocument.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] } });
  return result.count;
}
