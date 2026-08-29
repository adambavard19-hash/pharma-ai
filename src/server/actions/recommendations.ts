"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit, type AuditAction } from "@/server/audit/log";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";
import type { RecommendationEventType, RecommendationStatus } from "@/generated/prisma";

/**
 * Décisions du pharmacien sur les recommandations.
 *
 * Chaque décision est doublement enregistrée : sur la recommandation (état
 * courant) et dans `RecommendationEvent` (historique complet). C'est
 * l'historique qui permet, des mois plus tard, de comprendre exactement ce qui
 * a été proposé, modifié, retiré et par qui.
 */

async function assertOwnedRecommendation(recommendationId: string, pharmacyId: string) {
  const recommendation = await prisma.recommendation.findUnique({
    where: { id: recommendationId },
    select: {
      id: true,
      pharmacyId: true,
      prescriptionId: true,
      productId: true,
      status: true,
      counterScript: true,
      product: { select: { name: true } },
    },
  });
  if (!recommendation || recommendation.pharmacyId !== pharmacyId) return null;
  return recommendation;
}

/**
 * Reporte le nom de la nouvelle référence dans la phrase de comptoir.
 *
 * On ne régénère pas la phrase depuis la règle : le pharmacien a pu la
 * reformuler pour son patient, et sa formulation prime. Si l'ancien nom n'y
 * figure plus — parce qu'il l'a réécrite — la phrase est laissée telle quelle
 * plutôt que réécrite à sa place.
 */
function swapProductName(script: string, previous: string | null, next: string): string {
  if (!previous || !script.includes(previous)) return script;
  return script.replaceAll(previous, next);
}

async function transition(params: {
  recommendationId: string;
  pharmacyId: string;
  userId: string;
  status: RecommendationStatus;
  eventType: RecommendationEventType;
  auditAction: AuditAction;
  data?: Record<string, unknown>;
  note?: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.recommendation.update({
      where: { id: params.recommendationId },
      data: {
        status: params.status,
        decidedByUserId: params.userId,
        decidedAt: new Date(),
        pharmacistNote: params.note ?? undefined,
        ...(params.data ?? {}),
      },
    });
    await tx.recommendationEvent.create({
      data: {
        recommendationId: params.recommendationId,
        type: params.eventType,
        userId: params.userId,
        metadata: (params.data ?? {}) as never,
      },
    });
  });

  await recordAudit({
    action: params.auditAction,
    entityType: "Recommendation",
    entityId: params.recommendationId,
    pharmacyId: params.pharmacyId,
    userId: params.userId,
    metadata: params.data,
  });
}

export async function acceptRecommendationAction(
  recommendationId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_DECIDE);
  const recommendation = await assertOwnedRecommendation(
    recommendationId,
    session.scope.pharmacyId,
  );
  if (!recommendation) return fail("Recommandation introuvable dans cette officine.");

  await transition({
    recommendationId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    status: "ACCEPTED",
    eventType: "ACCEPTED",
    auditAction: "recommendation.accepted",
  });

  revalidatePath(`/vente/${recommendation.prescriptionId}`);
  return ok(null, "Conseil accepté.");
}

/**
 * « PROPOSÉ » — le pharmacien a présenté le conseil au patient.
 *
 * C'est la mesure honnête de la conversion : sans cette trace, un conseil que
 * personne n'a formulé au comptoir compterait comme un refus du patient. On
 * distingue donc ce qui n'a pas été dit de ce qui a été dit et refusé.
 */
export async function presentRecommendationAction(
  recommendationId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_DECIDE);
  const recommendation = await assertOwnedRecommendation(
    recommendationId,
    session.scope.pharmacyId,
  );
  if (!recommendation) return fail("Recommandation introuvable dans cette officine.");

  await transition({
    recommendationId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    status: "PRESENTED",
    eventType: "PRESENTED_TO_PATIENT",
    auditAction: "recommendation.presented",
    data: { presentedAt: new Date().toISOString() },
  });

  revalidatePath(`/vente/${recommendation.prescriptionId}`);
  return ok(null, "Conseil marqué comme proposé au patient.");
}

/**
 * « REFUSÉ » — le patient n'a pas retenu le conseil.
 *
 * À distinguer de `removeRecommendationAction`, qui traduit le jugement du
 * pharmacien (« cette proposition n'était pas pertinente »). Confondre les deux
 * fausserait à la fois le taux de conversion et le retour donné au moteur.
 */
export async function declineRecommendationAction(
  recommendationId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_DECIDE);
  const recommendation = await assertOwnedRecommendation(
    recommendationId,
    session.scope.pharmacyId,
  );
  if (!recommendation) return fail("Recommandation introuvable dans cette officine.");

  await transition({
    recommendationId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    status: "DECLINED",
    eventType: "DECLINED_BY_PATIENT",
    auditAction: "recommendation.declined",
  });

  revalidatePath(`/vente/${recommendation.prescriptionId}`);
  return ok(null, "Conseil marqué comme refusé par le patient.");
}

const modifySchema = z.object({
  recommendationId: z.string().min(1),
  patientReason: z.string().trim().min(5, "La formulation patient est trop courte").max(400),
  /**
   * La phrase dite au comptoir. Elle vient par défaut du catalogue de règles ;
   * le pharmacien peut la reformuler pour son patient, et c'est alors sa
   * formulation qui est conservée — signée, horodatée.
   */
  counterScript: z.string().trim().max(600).optional(),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  note: z.string().trim().max(500).optional(),
});

export async function modifyRecommendationAction(
  payload: z.input<typeof modifySchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_DECIDE);
  const parsed = modifySchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const recommendation = await assertOwnedRecommendation(
    parsed.data.recommendationId,
    session.scope.pharmacyId,
  );
  if (!recommendation) return fail("Recommandation introuvable dans cette officine.");

  await transition({
    recommendationId: parsed.data.recommendationId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    status: "MODIFIED",
    eventType: "MODIFIED",
    auditAction: "recommendation.modified",
    note: parsed.data.note ?? null,
    data: {
      patientReason: parsed.data.patientReason,
      ...(parsed.data.counterScript ? { counterScript: parsed.data.counterScript } : {}),
      quantity: parsed.data.quantity,
    },
  });

  revalidatePath(`/vente/${recommendation.prescriptionId}`);
  return ok(null, "Conseil modifié.");
}

const replaceSchema = z.object({
  recommendationId: z.string().min(1),
  newProductId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

export async function replaceRecommendationAction(
  payload: z.input<typeof replaceSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_DECIDE);
  const parsed = replaceSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const recommendation = await assertOwnedRecommendation(
    parsed.data.recommendationId,
    session.scope.pharmacyId,
  );
  if (!recommendation) return fail("Recommandation introuvable dans cette officine.");

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.newProductId },
    select: {
      id: true,
      pharmacyId: true,
      name: true,
      salePriceCents: true,
      commercialClaims: true,
      precautions: true,
    },
  });
  if (!product || product.pharmacyId !== session.scope.pharmacyId) {
    return fail("Produit introuvable dans cette officine.");
  }

  await transition({
    recommendationId: parsed.data.recommendationId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    status: "REPLACED",
    eventType: "REPLACED",
    auditAction: "recommendation.replaced",
    note: parsed.data.note ?? null,
    data: {
      replacedProductId: recommendation.productId,
      productId: product.id,
      unitPriceCents: product.salePriceCents,
      patientReason:
        product.commercialClaims[0] ??
        "Conseil proposé par votre pharmacien dans le cadre de votre traitement.",
      counterScript: recommendation.counterScript
        ? swapProductName(
            recommendation.counterScript,
            recommendation.product?.name ?? null,
            product.name,
          )
        : undefined,
      precautions: product.precautions,
    },
  });

  revalidatePath(`/vente/${recommendation.prescriptionId}`);
  return ok(null, `Conseil remplacé par ${product.name}.`);
}

const removeSchema = z.object({
  recommendationId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export async function removeRecommendationAction(
  payload: z.input<typeof removeSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_DECIDE);
  const parsed = removeSchema.safeParse(payload);
  if (!parsed.success) return fail("Motif invalide.");

  const recommendation = await assertOwnedRecommendation(
    parsed.data.recommendationId,
    session.scope.pharmacyId,
  );
  if (!recommendation) return fail("Recommandation introuvable dans cette officine.");

  await transition({
    recommendationId: parsed.data.recommendationId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    status: "REMOVED",
    eventType: "REMOVED",
    auditAction: "recommendation.removed",
    note: parsed.data.reason ?? null,
    data: { reason: parsed.data.reason ?? null },
  });

  revalidatePath(`/vente/${recommendation.prescriptionId}`);
  return ok(null, "Conseil retiré.");
}

const addManualSchema = z.object({
  prescriptionId: z.string().min(1),
  productId: z.string().min(1),
  patientReason: z.string().trim().min(5).max(400),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
});

/** Ajout d'un conseil par le pharmacien, hors proposition du moteur. */
export async function addManualRecommendationAction(
  payload: z.input<typeof addManualSchema>,
): Promise<ActionResult<{ recommendationId: string }>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_DECIDE);
  const parsed = addManualSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const [prescription, product] = await Promise.all([
    prisma.prescription.findUnique({
      where: { id: parsed.data.prescriptionId },
      select: { id: true, pharmacyId: true, isDemo: true },
    }),
    prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: {
        id: true,
        pharmacyId: true,
        name: true,
        salePriceCents: true,
        precautions: true,
      },
    }),
  ]);

  if (!prescription || prescription.pharmacyId !== session.scope.pharmacyId) {
    return fail("Ordonnance introuvable dans cette officine.");
  }
  if (!product || product.pharmacyId !== session.scope.pharmacyId) {
    return fail("Produit introuvable dans cette officine.");
  }

  const recommendation = await prisma.$transaction(async (tx) => {
    const created = await tx.recommendation.create({
      data: {
        pharmacyId: session.scope.pharmacyId,
        prescriptionId: prescription.id,
        productId: product.id,
        origin: "MANUAL",
        status: "ACCEPTED",
        totalScore: 1,
        scoreBreakdown: { manual: true } as never,
        justification: `Conseil ajouté manuellement par ${session.user.fullName}.`,
        patientReason: parsed.data.patientReason,
        counterScript: parsed.data.patientReason,
        precautions: product.precautions,
        quantity: parsed.data.quantity,
        unitPriceCents: product.salePriceCents,
        decidedByUserId: session.scope.userId,
        decidedAt: new Date(),
        isDemo: prescription.isDemo,
      },
    });

    await tx.recommendationEvent.create({
      data: {
        recommendationId: created.id,
        type: "MANUALLY_ADDED",
        userId: session.scope.userId,
        metadata: { productId: product.id } as never,
      },
    });

    return created;
  });

  await recordAudit({
    action: "recommendation.added_manually",
    entityType: "Recommendation",
    entityId: recommendation.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { productId: product.id, prescriptionId: prescription.id },
  });

  revalidatePath(`/vente/${prescription.id}`);
  return ok({ recommendationId: recommendation.id }, `${product.name} ajouté.`);
}

const ruleSchema = z.object({
  type: z.enum(["PREFER_PRODUCT", "EXCLUDE_PRODUCT", "PREFER_CATEGORY", "EXCLUDE_CATEGORY"]),
  productId: z.string().optional().nullable(),
  category: z
    .enum([
      "PROBIOTIQUES",
      "VITAMINES",
      "MINERAUX",
      "MAGNESIUM",
      "HYGIENE",
      "DERMATOLOGIE",
      "DERMOCOSMETIQUE",
      "SOINS",
      "NUTRITION",
      "DISPOSITIFS_MEDICAUX",
      "PHYTOTHERAPIE",
      "SAISONNIER",
      "AUTRE",
    ])
    .optional()
    .nullable(),
  note: z.string().trim().max(300).optional(),
});

/**
 * Crée une préférence d'officine.
 *
 * Ces règles n'agissent que sur la dimension « préférence du pharmacien » du
 * score, appliquée APRÈS la sécurité et la pertinence : une règle commerciale
 * ne peut donc jamais faire remonter une référence écartée pour raison de
 * sécurité. Voir docs/ARCHITECTURE.md.
 */
export async function createPharmacyRuleAction(
  payload: z.input<typeof ruleSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const parsed = ruleSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez la règle saisie.", zodFieldErrors(parsed.error.issues));
  }

  const { type, productId, category, note } = parsed.data;
  const targetsProduct = type === "PREFER_PRODUCT" || type === "EXCLUDE_PRODUCT";

  if (targetsProduct && !productId) return fail("Sélectionnez une référence.");
  if (!targetsProduct && !category) return fail("Sélectionnez une catégorie.");

  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { pharmacyId: true },
    });
    if (!product || product.pharmacyId !== session.scope.pharmacyId) {
      return fail("Produit introuvable dans cette officine.");
    }
  }

  await prisma.pharmacyRule.create({
    data: {
      pharmacyId: session.scope.pharmacyId,
      type,
      productId: targetsProduct ? productId : null,
      category: targetsProduct ? null : category,
      note: note ?? null,
      createdByUserId: session.scope.userId,
    },
  });

  await recordAudit({
    action: "rule.created",
    entityType: "PharmacyRule",
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { type, productId, category },
  });

  revalidatePath("/conseils");
  return ok(null, "Règle enregistrée. Elle s'appliquera aux prochaines analyses.");
}

export async function deletePharmacyRuleAction(ruleId: string): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);

  const rule = await prisma.pharmacyRule.findUnique({
    where: { id: ruleId },
    select: { pharmacyId: true },
  });
  if (!rule || rule.pharmacyId !== session.scope.pharmacyId) {
    return fail("Règle introuvable dans cette officine.");
  }

  await prisma.pharmacyRule.delete({ where: { id: ruleId } });

  await recordAudit({
    action: "rule.deleted",
    entityType: "PharmacyRule",
    entityId: ruleId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
  });

  revalidatePath("/conseils");
  return ok(null, "Règle supprimée.");
}
