"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { prisma } from "@/server/db/client";
import { refuseInDemo } from "./demo-guard";
import { fail, ok, type ActionResult } from "./types";

/**
 * « Mon abonnement » dans l'espace du titulaire (fondateur, 5 nov. 2026) : préparer et signer son contrat, puis payer.
 * Réservé au titulaire (SETTINGS_MANAGE), pour SA pharmacie ; le serveur relit tout, rien n'est cru du navigateur.
 */

const actor = (name: string) => ({ type: "SYSTEM" as const, label: `${name} (depuis son espace)` });

async function prospectOf(pharmacyId: string) {
  return prisma.prospect.findUnique({ where: { pharmacyId }, select: { id: true, contracts: { orderBy: { version: "desc" }, take: 1, select: { id: true, status: true, planId: true, setupFeeCents: true, pharmacySigningUrl: true } } } });
}

/** Préparer mon contrat (aux conditions du dossier) et rendre le lien pour le signer tout de suite. */
export async function prepareMyContractAction(): Promise<ActionResult<{ signingUrl: string | null }>> {
  const session = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const demo = refuseInDemo(session);
  if (demo) return demo;
  const prospect = await prospectOf(session.scope.pharmacyId);
  if (!prospect) return fail("Votre dossier d'abonnement est introuvable : écrivez-nous à contact@pharmaboost.app.");
  const { startContracting } = await import("@/server/services/sales/contracts");
  const result = await startContracting(prospect.id, actor(session.user.fullName));
  if (!result.ok) return fail(result.error);
  const contract = await prisma.contract.findUnique({ where: { id: result.contractId }, select: { pharmacySigningUrl: true } });
  revalidatePath("/parametres");
  return ok({ signingUrl: contract?.pharmacySigningUrl ?? null }, "Votre contrat est prêt : il vous a aussi été envoyé par e-mail.");
}

/** Payer mon abonnement : la page de paiement sécurisée, aux conditions du contrat signé. */
export async function payMySubscriptionAction(): Promise<ActionResult<{ url: string }>> {
  const session = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const demo = refuseInDemo(session);
  if (demo) return demo;
  const prospect = await prospectOf(session.scope.pharmacyId);
  const contract = prospect?.contracts[0];
  if (!contract || contract.status !== "FINALIZED") return fail("Signez d'abord votre contrat : le paiement s'ouvre juste après.");
  const planId = contract.planId ?? (await prisma.plan.findFirst({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], select: { id: true } }))?.id;
  if (!planId) return fail("L'offre n'est pas disponible pour le moment : écrivez-nous à contact@pharmaboost.app.");
  const { sendSubscriptionInvite, startCheckoutForInvite } = await import("@/server/billing/subscriptions");
  const invite = await sendSubscriptionInvite({ pharmacyId: session.scope.pharmacyId, planId, contractId: contract.id, adminId: null, setupFeeCents: contract.setupFeeCents ?? null, deliver: false });
  if (!invite.ok) return fail(invite.error);
  const checkout = await startCheckoutForInvite(invite.token);
  if (!checkout.ok) return fail(checkout.error);
  return ok({ url: checkout.url });
}
