import "server-only";
import { prisma } from "@/server/db/client";
import { DEMO_DISCLAIMER, DOCUMENT_DISCLAIMERS, type DocumentContent } from "@/core/documents/types";
import { generateToken } from "@/server/security/tokens";
import { DOCUMENT_TOKEN_TTL_MS } from "@/config/constants";
import { recordAudit } from "@/server/audit/log";
import { recordInteraction } from "./patients";
import { getEnv } from "@/config/env";
import type { TenantScope } from "@/server/db/tenant";

/**
 * Ce que le service a besoin de connaître de l'utilisateur : uniquement de quoi
 * signer le document. Dépendre du type `SessionContext` complet coupleraient ce
 * service au cycle de requête Next.js sans nécessité.
 */
export type DocumentAuthor = {
  scope: TenantScope;
  user: { fullName: string };
  roleLabel: string;
};

/**
 * Les conseils qui figurent sur la fiche remise au patient.
 *
 * Cette liste ne retient que ce que le pharmacien a décidé : une proposition
 * simplement suggérée par le moteur, retirée ou refusée par le patient
 * n'atteint jamais la fiche.
 *
 * Deux statuts s'y sont ajoutés, et chacun réparait une perte réelle.
 *
 * `PURCHASED` — la vente marque comme achetés les conseils que le patient
 * emporte. Sans lui, une fiche générée APRÈS l'encaissement ne mentionnait plus
 * le produit que le patient tient dans la main. Depuis que la validation
 * prépare la fiche, c'est le cas de toutes.
 *
 * `PRESENTED` — la génération elle-même fait passer les conseils retenus à ce
 * statut. Sans lui, régénérer une version 2 — pour ajouter un mot du
 * pharmacien, par exemple — produisait une fiche VIDE de tout conseil : ceux de
 * la version 1 n'étaient plus sélectionnés. Un document remis au patient ne
 * doit pas perdre son contenu parce qu'on y ajoute une phrase.
 */
export const DOCUMENT_ADVICE_STATUSES = [
  "ACCEPTED",
  "MODIFIED",
  "REPLACED",
  "PRESENTED",
  "PURCHASED",
] as const;

/**
 * Génération de la fiche patient.
 *
 * Seules les recommandations décidées par le pharmacien y figurent
 * (`DOCUMENT_ADVICE_STATUSES`). Une proposition supprimée ou simplement
 * suggérée par le moteur n'atteint jamais le patient.
 */

export async function generatePatientDocument(params: {
  session: DocumentAuthor;
  prescriptionId: string;
  pharmacistNote?: string | null;
}): Promise<{ documentId: string; accessToken: string; url: string }> {
  const { session } = params;
  const scope = session.scope;

  const prescription = await prisma.prescription.findUnique({
    where: { id: params.prescriptionId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, reference: true } },
      lines: {
        orderBy: { position: "asc" },
        include: { explanation: true },
      },
      recommendations: {
        where: { status: { in: [...DOCUMENT_ADVICE_STATUSES] } },
        include: {
          product: { include: { stockItem: true } },
        },
        orderBy: { totalScore: "desc" },
      },
    },
  });

  if (!prescription || prescription.pharmacyId !== scope.pharmacyId) {
    throw new Error("Ordonnance introuvable dans cette officine.");
  }

  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({
    where: { id: scope.pharmacyId },
  });

  const content: DocumentContent = {
    version: 1,
    generatedAt: new Date().toISOString(),
    pharmacy: {
      name: pharmacy.name,
      logoUrl: pharmacy.logoUrl,
      brandColor: pharmacy.brandColor,
      addressLine1: pharmacy.addressLine1,
      postalCode: pharmacy.postalCode,
      city: pharmacy.city,
      phone: pharmacy.phone,
      email: pharmacy.email,
    },
    pharmacist: { fullName: session.user.fullName, roleLabel: session.roleLabel },
    patient: prescription.patient
      ? {
          firstName: prescription.patient.firstName,
          lastName: prescription.patient.lastName,
          reference: prescription.patient.reference,
        }
      : null,
    prescription: {
      reference: prescription.reference,
      prescriberName: prescription.prescriberName,
      prescribedAt: prescription.prescribedAt?.toISOString() ?? null,
    },
    treatment: prescription.lines
      .filter((line) => line.status === "CONFIRMED" && line.drugName)
      .map((line) => {
        const explanation = line.explanation;
        const unavailable = !explanation || explanation.source === "UNAVAILABLE";
        return {
          drugName: line.drugName as string,
          dosage: line.dosage,
          form: line.form,
          posology: line.posology,
          durationDays: line.durationDays,
          instructions: line.instructions,
          purpose: unavailable ? null : explanation.purpose,
          tips: unavailable ? [] : explanation.tips,
          precautions: unavailable ? [] : explanation.precautions,
          sourceLabel: unavailable
            ? "Information non disponible dans le référentiel connecté"
            : explanation.sourceRefs.join(", ") || "Référentiel de l'officine",
          explanationUnavailable: unavailable,
        };
      }),
    advice: prescription.recommendations
      .filter((recommendation) => recommendation.product)
      .map((recommendation) => {
        const product = recommendation.product!;
        const quantity = product.stockItem?.quantity ?? 0;
        const threshold = product.stockItem?.alertThreshold ?? 0;
        return {
          productName: product.name,
          brand: product.brand,
          imageUrl: product.imageUrl,
          benefit: product.commercialClaims[0] ?? null,
          personalReason:
            recommendation.patientReason ??
            "Conseil proposé par votre pharmacien dans le cadre de votre traitement.",
          usage: product.description,
          precautions: recommendation.precautions,
          priceCents: recommendation.unitPriceCents || product.salePriceCents,
          availability:
            quantity <= 0 ? "ON_ORDER" : quantity <= threshold ? "LOW_STOCK" : "IN_STOCK",
          addedManually: recommendation.origin === "MANUAL",
        };
      }),
    pharmacistNote: params.pharmacistNote ?? null,
    disclaimers: prescription.isDemo
      ? [DEMO_DISCLAIMER, ...DOCUMENT_DISCLAIMERS]
      : DOCUMENT_DISCLAIMERS,
    isDemo: prescription.isDemo,
  };

  const accessToken = generateToken(32);
  const previousVersion = await prisma.patientDocument.count({
    where: { prescriptionId: prescription.id },
  });

  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.patientDocument.create({
      data: {
        pharmacyId: scope.pharmacyId,
        patientId: prescription.patientId,
        prescriptionId: prescription.id,
        version: previousVersion + 1,
        contentJson: content as never,
        accessToken,
        tokenExpiresAt: new Date(Date.now() + DOCUMENT_TOKEN_TTL_MS),
        createdByUserId: scope.userId,
        isDemo: prescription.isDemo,
      },
    });

    // Les conseils validés sont désormais présentés au patient.
    //
    // Un conseil ACHETÉ garde son statut : « présenté » est en deçà d'« acheté »,
    // et l'écraser effacerait la vente du taux de conversion. La trace, elle,
    // est écrite pour tous — figurer sur la fiche remise est un fait, qu'il y
    // ait eu achat ou non.
    const onDocumentIds = prescription.recommendations.map((r) => r.id);
    const toPresentIds = prescription.recommendations
      .filter((r) => r.status !== "PURCHASED")
      .map((r) => r.id);

    if (toPresentIds.length > 0) {
      await tx.recommendation.updateMany({
        where: { id: { in: toPresentIds } },
        data: { status: "PRESENTED", presentedAt: new Date() },
      });
    }

    for (const id of onDocumentIds) {
      await tx.recommendationEvent.create({
        data: {
          recommendationId: id,
          type: "PRESENTED_TO_PATIENT",
          userId: scope.userId,
          metadata: { documentId: created.id } as never,
        },
      });
    }

    await tx.prescription.update({
      where: { id: prescription.id },
      data: { status: "VALIDATED", validatedAt: new Date() },
    });

    return created;
  });

  if (prescription.patientId) {
    await recordInteraction({
      patientId: prescription.patientId,
      scope,
      type: "DOCUMENT_GENERATED",
      summary: `Fiche conseil générée (version ${document.version}) pour l'ordonnance ${prescription.reference}.`,
      metadata: { documentId: document.id },
    });
  }

  await recordAudit({
    action: "document.generated",
    entityType: "PatientDocument",
    entityId: document.id,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: {
      prescriptionId: prescription.id,
      version: document.version,
      adviceCount: content.advice.length,
      treatmentCount: content.treatment.length,
    },
  });

  return {
    documentId: document.id,
    accessToken,
    url: buildDocumentUrl(accessToken),
  };
}

export function buildDocumentUrl(accessToken: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}/fiche/${accessToken}`;
}

export async function getDocumentByToken(token: string) {
  const document = await prisma.patientDocument.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      contentJson: true,
      tokenExpiresAt: true,
      revokedAt: true,
      version: true,
      createdAt: true,
      patientId: true,
      pharmacyId: true,
    },
  });

  if (!document) return null;
  if (document.revokedAt) return null;
  if (document.tokenExpiresAt < new Date()) return null;

  return document;
}

export async function recordDocumentView(documentId: string): Promise<void> {
  await prisma.patientDocument.update({
    where: { id: documentId },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
}

export async function listDocuments(scope: TenantScope, limit = 30) {
  return prisma.patientDocument.findMany({
    where: { pharmacyId: scope.pharmacyId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: { select: { firstName: true, lastName: true } },
      prescription: { select: { reference: true } },
      deliveries: true,
    },
  });
}
