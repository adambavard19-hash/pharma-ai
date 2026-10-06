"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { continueAfterStockDeposit, decideHeldDeposit, ownerScopeForPharmacy, receiveStockDeposit, retryDeposit } from "@/server/services/stock-deposits";
import { DEPOSIT_MAX_BYTES } from "@/core/stock-deposit/rules";
import { DEPOSIT_DECISIONS, type DepositDecision, type DepositView } from "@/core/stock-deposit/types";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les gestes de l'équipe sur les stocks reçus : trancher un fichier en
 * attente, relancer un fichier en échec, déposer le fichier d'une officine à
 * sa place. La session de la console d'abord ; l'administrateur est celui de
 * la session, jamais celui de la demande.
 */

const decideSchema = z.object({ id: z.string().min(1), decision: z.enum(DEPOSIT_DECISIONS) });
const retrySchema = z.object({ id: z.string().min(1) });

const lines = (count: number | null) => `${(count ?? 0).toLocaleString("fr-FR")} ligne${(count ?? 0) > 1 ? "s" : ""}`;

/** Les produits nouveaux d'un stock appliqué par l'équipe sont compris après la réponse, au nom du titulaire. */
async function continueFor(deposit: DepositView): Promise<void> {
  if (deposit.status !== "APPLIED" || (deposit.created ?? 0) === 0) return;
  const owner = await ownerScopeForPharmacy(deposit.pharmacyId);
  if (owner) after(() => continueAfterStockDeposit(owner.scope));
}

export async function decideDepositAction(payload: { id: string; decision: DepositDecision }): Promise<ActionResult<DepositView>> {
  const session = await requirePlatformSession();
  const parsed = decideSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await decideHeldDeposit(parsed.data.id, session.admin.id, parsed.data.decision);
  revalidatePath("/admin/depots-stock");
  if (!result.ok) return fail(result.error);

  const { deposit } = result;
  if (deposit.status === "FAILED") return fail(deposit.message ?? "Le fichier n'a pas pu être appliqué : le stock n'a pas changé.");
  if (deposit.status === "REJECTED") return ok(deposit, "Fichier écarté : le stock de l'officine n'a pas changé.");
  await continueFor(deposit);
  return ok(deposit, `Stock appliqué : ${lines(deposit.lines)}${deposit.zeroed ? `, ${deposit.zeroed.toLocaleString("fr-FR")} remis à zéro` : ""}.`);
}

export async function retryDepositAction(payload: { id: string }): Promise<ActionResult<DepositView>> {
  const session = await requirePlatformSession();
  const parsed = retrySchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await retryDeposit(parsed.data.id, session.admin.id);
  revalidatePath("/admin/depots-stock");
  if (!result.ok) return fail(result.error);

  const { deposit } = result;
  if (deposit.status === "FAILED") return fail(deposit.message ?? "Le fichier n'a toujours pas pu être lu.");
  if (deposit.status === "HELD") return ok(deposit, "Fichier relu. Il n'a pas été appliqué automatiquement : à vous de trancher.");
  await continueFor(deposit);
  return ok(deposit, `Fichier relu. Stock mis à jour : ${lines(deposit.lines)}.`);
}

/** Le titulaire a envoyé son fichier par mail ou WhatsApp : l'équipe le dépose à sa place, au nom du titulaire de l'officine. */
export async function depositForPharmacyAction(formData: FormData): Promise<ActionResult<DepositView>> {
  const session = await requirePlatformSession();
  const pharmacyId = formData.get("pharmacyId");
  const file = formData.get("file");
  if (typeof pharmacyId !== "string" || pharmacyId.trim() === "") return fail("Choisissez l'officine.");
  if (!(file instanceof File) || file.size === 0) return fail("Choisissez le fichier de stock.");
  if (file.size > DEPOSIT_MAX_BYTES) return fail("Le fichier dépasse 8 Mo.");

  const owner = await ownerScopeForPharmacy(pharmacyId.trim());
  if (!owner) return fail("Cette officine n'a pas de titulaire actif : impossible de déposer son stock.");

  let result: Awaited<ReturnType<typeof receiveStockDeposit>>;
  try {
    result = await receiveStockDeposit({
      scope: owner.scope,
      pharmacyIsDemo: owner.pharmacyIsDemo,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      source: "CONSOLE",
      adminId: session.admin.id,
    });
  } catch (error) {
    console.error("[stock-deposit] dépôt par l'équipe en échec", error);
    return fail("Le fichier n'a pas pu être traité. Rien n'a été modifié : réessayez dans un instant.");
  }
  revalidatePath("/admin/depots-stock");
  revalidatePath(`/admin/pharmacies/${owner.scope.pharmacyId}`);
  if (!result.ok) return fail(result.error);

  const { deposit } = result;
  if (result.duplicate) return ok(deposit, "Ce fichier vient d'être reçu : il n'y a rien à refaire.");
  if (deposit.status === "FAILED") return fail(deposit.message ?? "Le fichier n'a pas pu être lu : le stock de l'officine n'a pas changé.");
  if (deposit.status === "HELD") return ok(deposit, `Fichier reçu pour ${owner.pharmacyName}, mais il n'a pas été appliqué automatiquement : il attend votre décision.`);
  await continueFor(deposit);
  return ok(deposit, `Stock de ${owner.pharmacyName} mis à jour : ${lines(deposit.lines)}.`);
}
