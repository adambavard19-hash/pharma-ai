"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { remindContractNow } from "@/server/services/sales/contracts";
import { fail, ok, type ActionResult } from "./types";

/**
 * Contrats, depuis la console. Relancer un contrat non signé : même moteur
 * que la relance automatique, tracé dans le dossier, l'historique des
 * communications et le journal d'audit.
 */
export async function remindContractNowAction(payload: { contractId: string }): Promise<ActionResult<{ status: string }>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ contractId: z.string().min(1).max(60) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await remindContractNow(parsed.data.contractId, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  const contract = await prisma.contract.findUnique({ where: { id: parsed.data.contractId }, select: { prospectId: true, pharmacyId: true } });
  revalidatePath("/admin/contrats");
  if (contract) revalidatePath(`/admin/dossiers/${contract.prospectId}`);
  if (contract?.pharmacyId) revalidatePath(`/admin/pharmacies/${contract.pharmacyId}`);
  if (result.email.status === "FAILED") return fail(`La relance n'est pas partie : ${result.email.detail}`);
  return ok({ status: result.email.status }, result.email.status === "SENT" ? "Relance envoyée." : "Relance enregistrée, mais non transmise : la messagerie n'est pas configurée.");
}
