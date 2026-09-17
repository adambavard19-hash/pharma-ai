"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { createPortalSession } from "@/server/billing/subscriptions";
import { fail, type ActionResult } from "./types";

/**
 * « Gérer mon abonnement » : le titulaire est envoyé sur le portail client
 * Stripe de SON organisation — celle de sa session, jamais un identifiant
 * venu du navigateur. Une officine ne peut donc pas atteindre le portail,
 * les factures ni le client Stripe d'une autre.
 */
export async function openBillingPortalAction(): Promise<ActionResult<never>> {
  const session = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const result = await createPortalSession(session.scope.organizationId, "/parametres?onglet=abonnement");
  if (!result.ok) return fail(result.error);
  await recordAudit({ action: "billing.portal_opened", entityType: "Subscription", entityId: session.scope.organizationId, pharmacyId: session.scope.pharmacyId, userId: session.scope.userId });
  redirect(result.url);
}
