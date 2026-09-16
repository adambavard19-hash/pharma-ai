"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { fail, ok, type ActionResult } from "./types";

const schema = z.object({
  lineId: z.string().min(1),
  code: z.string().regex(/^[A-Z_]{3,40}$/),
  checked: z.boolean(),
});

/**
 * Le pharmacien coche un point réglementaire sur une ligne d'ordonnance :
 * « ordonnance d'exception présente », « ordonnance sécurisée vérifiée »…
 *
 * Coché, le point garde qui l'a vérifié et quand. Décoché, il disparaît. Le
 * journal d'audit garde les deux gestes : en cas de contrôle, on doit pouvoir
 * dire ce qui a été vérifié au comptoir, par qui.
 */
export async function setRegulationCheckAction(payload: z.input<typeof schema>): Promise<ActionResult<{ checked: boolean }>> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VERIFY);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("Point réglementaire invalide.");
  const { lineId, code, checked } = parsed.data;

  const line = await prisma.prescriptionLine.findUnique({
    where: { id: lineId },
    select: { id: true, prescriptionId: true, prescription: { select: { pharmacyId: true } } },
  });
  if (!line || line.prescription.pharmacyId !== session.scope.pharmacyId) return fail("Ligne introuvable dans cette officine.");

  if (checked) {
    await prisma.prescriptionRegulationCheck.upsert({
      where: { lineId_code: { lineId, code } },
      create: { lineId, prescriptionId: line.prescriptionId, code, checkedByUserId: session.scope.userId },
      update: { checkedByUserId: session.scope.userId, checkedAt: new Date() },
    });
  } else {
    await prisma.prescriptionRegulationCheck.deleteMany({ where: { lineId, code } });
  }
  await recordAudit({
    action: checked ? "prescription.regulation_checked" : "prescription.regulation_unchecked",
    entityType: "PrescriptionLine",
    entityId: lineId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { code },
  });
  revalidatePath(`/vente/${line.prescriptionId}`);
  return ok({ checked });
}
