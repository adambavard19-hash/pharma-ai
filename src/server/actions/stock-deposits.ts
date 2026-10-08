"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { continueAfterStockDeposit, previewStockDeposit, receiveStockDeposit } from "@/server/services/stock-deposits";
import { DEPOSIT_CONFIRMATION, DEPOSIT_MAX_BYTES } from "@/core/stock-deposit/rules";
import type { DepositView, StockPreview } from "@/core/stock-deposit/types";
import { fail, ok, type ActionResult } from "./types";

/**
 * « Envoyer mon fichier » : le titulaire dépose le stock de son logiciel
 * depuis PharmaBoost. Réservé au titulaire (`PRODUCT_IMPORT`) ; l'officine est
 * celle de la session, jamais celle d'un champ du formulaire.
 */

const lines = (count: number | null) => `${(count ?? 0).toLocaleString("fr-FR")} ligne${(count ?? 0) > 1 ? "s" : ""}`;

/**
 * « Vérifier » : lit le fichier et dit ce qu'il contient (produits, nouveaux, illisibles, produits qui passeraient à 0,
 * fichier appliqué ou retenu) SANS rien écrire dans le stock. Même permission que l'envoi ; l'officine est celle de la
 * session. La personne confirme ensuite avec `sendStockAction`, qui refait les mêmes contrôles.
 */
export async function previewStockAction(formData: FormData): Promise<ActionResult<StockPreview>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choisissez le fichier de votre stock.");
  if (file.size > DEPOSIT_MAX_BYTES) return fail("Le fichier dépasse 8 Mo.");
  let result: Awaited<ReturnType<typeof previewStockDeposit>>;
  try {
    result = await previewStockDeposit({ scope: session.scope, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  } catch (error) {
    console.error("[stock-preview] vérification du titulaire en échec", error);
    return fail("Le fichier n'a pas pu être vérifié. Rien n'a été modifié : réessayez dans un instant.");
  }
  return result.ok ? ok(result.preview) : fail(result.error);
}

export async function sendStockAction(formData: FormData): Promise<ActionResult<DepositView>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  // Un fichier remplace le stock (ce qui n'y figure pas passe à 0) : l'écran le fait confirmer, et le serveur l'exige.
  if (formData.get("confirmation") !== DEPOSIT_CONFIRMATION) return fail("Confirmez d'abord que ce fichier remplace votre stock.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choisissez le fichier de votre stock.");
  if (file.size > DEPOSIT_MAX_BYTES) return fail("Le fichier dépasse 8 Mo.");

  let result: Awaited<ReturnType<typeof receiveStockDeposit>>;
  try {
    result = await receiveStockDeposit({
      scope: session.scope,
      pharmacyIsDemo: session.pharmacy.isDemo,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      source: "WEB",
    });
  } catch (error) {
    console.error("[stock-deposit] envoi du titulaire en échec", error);
    return fail("Le fichier n'a pas pu être traité. Rien n'a été modifié : réessayez dans un instant.");
  }
  if (!result.ok) return fail(result.error);

  const { deposit } = result;
  revalidatePath("/stock");
  revalidatePath("/stock/mise-a-jour");
  revalidatePath("/");
  if (result.duplicate) return ok(deposit, "Ce fichier vient d'être reçu : il n'y a rien à refaire.");

  if (deposit.status === "FAILED") return fail(deposit.message ?? "Le fichier n'a pas pu être lu : votre stock n'a pas changé.");
  if (deposit.status === "HELD") return ok(deposit, "Fichier reçu. L'équipe PharmaBoost le vérifie : votre stock n'a pas changé.");

  // Les produits nouveaux sont compris et illustrés après la réponse : le titulaire n'attend pas.
  if (deposit.status === "APPLIED" && (deposit.created ?? 0) > 0) {
    const scope = session.scope;
    after(() => continueAfterStockDeposit(scope));
  }
  return ok(deposit, deposit.status === "APPLIED" ? `Stock mis à jour : ${lines(deposit.lines)}.` : "Fichier reçu.");
}
