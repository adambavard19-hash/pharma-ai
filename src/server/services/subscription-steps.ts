import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";

/**
 * « Mon abonnement », pas à pas, dans l'espace du titulaire (fondateur, 5 nov. 2026) : après la démo, le titulaire reçoit le
 * lien de bienvenue, entre dans son espace, y signe son contrat, puis paie ; le logiciel arrive alors par e-mail.
 * Trois étapes, lues dans la base : le contrat (à préparer, à signer, signé), le paiement (à faire, fait), le logiciel
 * (en attente, débloqué). Seulement pour une officine dont le logiciel attend le paiement (`softwareGate`).
 */
export type SubscriptionSteps = {
  contract: { state: "NONE" | "TO_SIGN" | "SIGNED" | "CLOSED"; signingUrl: string | null };
  paid: boolean;
  softwareUnlocked: boolean;
};

const TO_SIGN = new Set(["DRAFT", "SENT", "OPENED", "SIGNED_COMPANY"]);

export async function loadSubscriptionSteps(scope: Pick<TenantScope, "pharmacyId" | "organizationId">): Promise<SubscriptionSteps | null> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: scope.pharmacyId }, select: { softwareGate: true, softwareUnlockedAt: true } });
  if (!pharmacy?.softwareGate) return null;
  const [prospect, paid] = await Promise.all([
    prisma.prospect.findUnique({ where: { pharmacyId: scope.pharmacyId }, select: { contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true, pharmacySigningUrl: true } } } }),
    prisma.billingPayment.findFirst({ where: { organizationId: scope.organizationId, status: "PAID", amountCents: { gt: 0 } }, select: { id: true } }),
  ]);
  const last = prospect?.contracts[0] ?? null;
  const state: SubscriptionSteps["contract"]["state"] = !last ? "NONE" : last.status === "FINALIZED" || last.status === "SIGNED_PHARMACY" ? "SIGNED" : TO_SIGN.has(last.status) ? "TO_SIGN" : "CLOSED";
  return { contract: { state, signingUrl: state === "TO_SIGN" ? last?.pharmacySigningUrl ?? null : null }, paid: Boolean(paid), softwareUnlocked: pharmacy.softwareUnlockedAt !== null };
}
