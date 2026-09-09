"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { fail, ok, type ActionResult } from "./types";

/**
 * La réponse du patient à une question de comptoir.
 *
 * Certains conseils ne se justifient pas par l'ordonnance seule : « le patient
 * a-t-il aussi le nez bouché ? ». La question est posée, la réponse est
 * enregistrée — nominativement, horodatée — et c'est elle qui ouvre ou ferme
 * la proposition. Un « non » n'est pas un refus du produit : le patient n'a
 * pas ce besoin, et les statistiques du titulaire ne doivent pas le compter
 * comme une proposition déclinée.
 */

const answerSchema = z.object({
  opportunityId: z.string().min(1),
  /** `true` oui, `false` non, `"UNKNOWN"` le patient ne sait pas : la proposition reste, à l'appréciation du pharmacien. */
  answer: z.union([z.boolean(), z.literal("UNKNOWN")]),
});

export async function answerOpportunityAction(
  payload: z.input<typeof answerSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_DECIDE);
  const parsed = answerSchema.safeParse(payload);
  if (!parsed.success) return fail("Réponse invalide.");

  const opportunity = await prisma.adviceOpportunity.findUnique({
    where: { id: parsed.data.opportunityId },
    select: {
      id: true,
      question: true,
      analysisRun: { select: { pharmacyId: true, prescriptionId: true } },
      recommendations: { select: { id: true, status: true, pharmacistNote: true } },
    },
  });
  if (!opportunity || opportunity.analysisRun.pharmacyId !== session.scope.pharmacyId) {
    return fail("Proposition introuvable dans cette officine.");
  }
  if (!opportunity.question) {
    return fail("Cette proposition ne pose aucune question au patient.");
  }

  const NOT_NEEDED = "Le patient n'a pas ce besoin.";
  const now = new Date();
  const answer = parsed.data.answer;

  await prisma.$transaction(async (tx) => {
    await tx.adviceOpportunity.update({
      where: { id: opportunity.id },
      data: {
        // « Ne sait pas » : la question a été posée (answeredAt), sans réponse
        // tranchée (answer null). La carte montre alors le produit, sans
        // l'imposer.
        answer: answer === "UNKNOWN" ? null : answer,
        answeredAt: now,
        answeredByUserId: session.scope.userId,
      },
    });

    for (const recommendation of opportunity.recommendations) {
      if (answer === "UNKNOWN") {
        await tx.recommendationEvent.create({
          data: {
            recommendationId: recommendation.id,
            type: "VIEWED",
            userId: session.scope.userId,
            metadata: { reason: "NEED_UNKNOWN", opportunityId: opportunity.id } as never,
          },
        });
        continue;
      }
      if (!answer && recommendation.status === "PROPOSED") {
        // Le besoin n'existe pas : la proposition est retirée, avec son motif.
        await tx.recommendation.update({
          where: { id: recommendation.id },
          data: {
            status: "REMOVED",
            decidedByUserId: session.scope.userId,
            decidedAt: now,
            pharmacistNote: NOT_NEEDED,
          },
        });
        await tx.recommendationEvent.create({
          data: {
            recommendationId: recommendation.id,
            type: "REMOVED",
            userId: session.scope.userId,
            metadata: { reason: "NEED_NOT_CONFIRMED", opportunityId: opportunity.id } as never,
          },
        });
      }

      // Le patient revient sur sa réponse : ce qui avait été retiré pour ce
      // seul motif revient tel quel. Un retrait décidé par le pharmacien pour
      // une autre raison, lui, ne bouge pas.
      if (
        answer === true &&
        recommendation.status === "REMOVED" &&
        recommendation.pharmacistNote === NOT_NEEDED
      ) {
        await tx.recommendation.update({
          where: { id: recommendation.id },
          data: {
            status: "PROPOSED",
            decidedByUserId: session.scope.userId,
            decidedAt: now,
            pharmacistNote: null,
          },
        });
        await tx.recommendationEvent.create({
          data: {
            recommendationId: recommendation.id,
            type: "REOPENED",
            userId: session.scope.userId,
            metadata: { reason: "NEED_CONFIRMED", opportunityId: opportunity.id } as never,
          },
        });
      }
    }
  });

  await recordAudit({
    action: "opportunity.answered",
    entityType: "AdviceOpportunity",
    entityId: opportunity.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { answer },
  });

  revalidatePath(`/vente/${opportunity.analysisRun.prescriptionId}`);
  return ok(null, answer === "UNKNOWN" ? "Réponse inconnue : proposition laissée à votre appréciation." : answer ? "Besoin confirmé." : "Pas de besoin : proposition retirée.");
}
