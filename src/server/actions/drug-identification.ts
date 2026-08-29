"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { searchSpecialties } from "@/server/services/drug-identification";
import type { SpecialtyCandidate } from "@/core/reference";
import { fail, ok, type ActionResult } from "./types";

/**
 * Le rattachement d'une ligne d'ordonnance au catalogue national, décidé par un
 * professionnel.
 *
 * Ces actions ne touchent qu'à la ligne d'ordonnance : le catalogue national
 * est en lecture seule depuis une officine. Choisir une spécialité, c'est dire
 * « c'est ce médicament-là », pas modifier ce que la source en publie.
 */

const attachSchema = z.object({
  lineId: z.string().min(1),
  specialtyId: z.string().min(1),
});

export async function attachSpecialtyAction(
  _previous: ActionResult<{ lineId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ lineId: string }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);

  const parsed = attachSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail("Ligne ou spécialité manquante.");

  const line = await prisma.prescriptionLine.findUnique({
    where: { id: parsed.data.lineId },
    select: { id: true, prescription: { select: { id: true, pharmacyId: true } } },
  });

  // Re-vérification après lecture : `findUnique` ignore le tenant.
  if (!line || line.prescription.pharmacyId !== session.scope.pharmacyId) {
    return fail("Ligne introuvable.");
  }

  const specialty = await prisma.drugSpecialty.findUnique({
    where: { id: parsed.data.specialtyId },
    select: { id: true, cisCode: true, name: true },
  });
  if (!specialty) return fail("Cette spécialité n'existe pas dans le catalogue national.");

  await prisma.prescriptionLine.update({
    where: { id: line.id },
    data: {
      drugSpecialtyId: specialty.id,
      identifiedBy: "PHARMACIST",
      // Aucun score : ce n'est pas un rapprochement, c'est une décision.
      identificationScore: null,
    },
  });

  await recordAudit({
    action: "prescription.line_identified",
    entityType: "prescription_line",
    entityId: line.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.user.id,
    metadata: { cisCode: specialty.cisCode },
  });

  revalidatePath(`/vente/${line.prescription.id}`);
  return ok({ lineId: line.id }, `Ligne rattachée à « ${specialty.name} ».`);
}

const detachSchema = z.object({ lineId: z.string().min(1) });

export async function detachSpecialtyAction(
  _previous: ActionResult<{ lineId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ lineId: string }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);

  const parsed = detachSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail("Ligne manquante.");

  const line = await prisma.prescriptionLine.findUnique({
    where: { id: parsed.data.lineId },
    select: { id: true, prescription: { select: { id: true, pharmacyId: true } } },
  });
  if (!line || line.prescription.pharmacyId !== session.scope.pharmacyId) {
    return fail("Ligne introuvable.");
  }

  await prisma.prescriptionLine.update({
    where: { id: line.id },
    data: { drugSpecialtyId: null, identifiedBy: null, identificationScore: null },
  });

  revalidatePath(`/vente/${line.prescription.id}`);
  return ok({ lineId: line.id }, "Rattachement retiré.");
}

const searchSchema = z.object({ query: z.string().trim().min(3).max(120) });

/** Recherche libre dans le catalogue national, quand aucun candidat ne convient. */
export async function searchSpecialtiesAction(
  _previous: ActionResult<SpecialtyCandidate[]> | null,
  formData: FormData,
): Promise<ActionResult<SpecialtyCandidate[]>> {
  await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);

  const parsed = searchSchema.safeParse({ query: formData.get("query") });
  if (!parsed.success) return fail("Saisissez au moins trois caractères.");

  const results = await searchSpecialties(parsed.data.query);
  return ok(
    results,
    results.length === 0 ? "Aucune spécialité ne correspond." : undefined,
  );
}
