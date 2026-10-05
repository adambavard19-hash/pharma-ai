"use server";

import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { rateLimited } from "@/server/http/rate-limit";
import { recordAudit } from "@/server/audit/log";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { fail, ok, type ActionResult } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const suggestionSchema = z.object({
  name: z.string().trim().min(2, "Indiquez le nom du laboratoire ou de la marque.").max(120, "120 caractères au plus."),
  need: z.string().trim().max(160).optional().or(z.literal("")),
  note: z.string().trim().max(600, "600 caractères au plus.").optional().or(z.literal("")),
});

/**
 * Le titulaire signale un laboratoire ou une marque qu'il voudrait voir
 * référencés par PharmaBoost. Réservé au titulaire (permission des partenaires,
 * décision d'achat) : l'équipe au comptoir ne fait pas ce geste. Rien n'est promis :
 * l'équipe PharmaBoost reçoit la suggestion et étudie un partenariat.
 */
export async function suggestLabAction(payload: z.input<typeof suggestionSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PARTNERS_MANAGE);
  const parsed = suggestionSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.");
  if (rateLimited(`lab-suggestion:${session.scope.pharmacyId}`, 10, DAY_MS)) return fail("Vous avez déjà envoyé plusieurs suggestions aujourd'hui. Notre équipe les étudie.");

  const { name, need, note } = parsed.data;
  await notifyAdmins({
    type: "LAB_SUGGESTION",
    title: `Laboratoire suggéré — ${session.pharmacy.name}`,
    body: [`« ${name} »`, need ? `pour le besoin : ${need}` : null, note ? `Note : ${note}` : null].filter(Boolean).join(" · "),
    linkUrl: `/admin/pharmacies/${session.scope.pharmacyId}`,
    severity: "INFO",
  });
  await recordAudit({ action: "assortment.lab_suggested", entityType: "Pharmacy", entityId: session.scope.pharmacyId, pharmacyId: session.scope.pharmacyId, userId: session.scope.userId, metadata: { name, need: need || null } });
  return ok(null, "Merci : votre suggestion est transmise à l'équipe PharmaBoost.");
}
