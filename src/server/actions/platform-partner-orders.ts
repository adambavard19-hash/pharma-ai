"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { ORDER_STATUS_LABELS } from "@/core/partners/status";
import { updateOrderStatus } from "@/server/services/partners/orders-admin";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Suivi des commandes partenaires par l'équipe PharmaBoost : transmise,
 * confirmée, en échec ou annulée, avec la référence que le partenaire a
 * donnée. Aucune transmission n'est simulée : ce geste CONSTATE ce que le
 * partenaire a fait. Ni patient ni ordonnance dans ces tables.
 */

const orderStatusSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(["TRANSMITTED", "CONFIRMED", "FAILED", "CANCELLED"], { message: "Choisissez un statut." }),
  partnerReference: z
    .string()
    .trim()
    .max(200, "200 caractères au plus.")
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  statusDetail: z
    .string()
    .trim()
    .max(2000, "2000 caractères au plus.")
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
});

export async function updatePartnerOrderStatusAction(payload: z.input<typeof orderStatusSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = orderStatusSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la mise à jour.", zodFieldErrors(parsed.error.issues));

  const result = await updateOrderStatus(parsed.data.id, {
    status: parsed.data.status,
    partnerReference: parsed.data.partnerReference,
    statusDetail: parsed.data.statusDetail,
  });
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  await recordAudit({
    action: "partner.order_status_changed",
    entityType: "PartnerOrder",
    entityId: parsed.data.id,
    pharmacyId: result.data.pharmacyId,
    platformAdminId: session.admin.id,
    metadata: {
      from: result.data.from,
      to: result.data.to,
      partnerId: result.data.partnerId,
      attributionCode: result.data.attributionCode,
      partnerReference: parsed.data.partnerReference !== null,
    },
  });
  revalidatePath("/admin/partenaires/commandes");
  revalidatePath("/admin/partenaires/statistiques");
  return ok(null, `Commande ${result.data.attributionCode} : ${ORDER_STATUS_LABELS[result.data.to].toLowerCase()}.`);
}
