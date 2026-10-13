"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { continueAfterStockDeposit, previewStockDeposit, receiveStockDeposit } from "@/server/services/stock-deposits";
import { combineStockFiles } from "@/server/services/stock-files";
import { MERGE_MAX_FILES } from "@/core/stock-import/merge-files";
import { DEPOSIT_CONFIRMATION, DEPOSIT_MAX_BYTES } from "@/core/stock-deposit/rules";
import type { DepositView, StockPreview } from "@/core/stock-deposit/types";
import { fail, ok, type ActionResult } from "./types";

/**
 * « Envoyer mon fichier » : le titulaire dépose le stock de son logiciel
 * depuis PharmaBoost. Réservé au titulaire (`PRODUCT_IMPORT`) ; l'officine est
 * celle de la session, jamais celle d'un champ du formulaire.
 */

/**
 * Les fichiers du formulaire (champ « file », répété jusqu'à 3 fois) lus puis réunis en un envoi, et le mode choisi
 * (« mode=prix » : « Ce fichier complète seulement mes prix »). Un seul fichier : l'envoi d'avant, inchangé.
 */
async function readUpload(formData: FormData): Promise<{ ok: true; fileName: string; bytes: Uint8Array; pricesOnly: boolean; merge: StockPreview["merge"] } | { ok: false; error: string }> {
  const files = formData.getAll("file").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { ok: false, error: "Choisissez le fichier de votre stock." };
  if (files.length > MERGE_MAX_FILES) return { ok: false, error: `${MERGE_MAX_FILES} fichiers au plus en un envoi.` };
  if (files.some((file) => file.size > DEPOSIT_MAX_BYTES)) return { ok: false, error: "Un fichier dépasse 8 Mo." };
  const combined = await combineStockFiles(await Promise.all(files.map(async (file) => ({ fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }))));
  if (!combined.ok) return combined;
  const merge = combined.merge ? { files: combined.merge.files.map(({ fileName, priceKind, priceLabel }) => ({ fileName, priceKind, priceLabel })), quantityConflicts: combined.merge.quantityConflicts } : null;
  return { ok: true, fileName: combined.fileName, bytes: combined.bytes, pricesOnly: formData.get("mode") === "prix", merge };
}

const lines = (count: number | null) => `${(count ?? 0).toLocaleString("fr-FR")} ligne${(count ?? 0) > 1 ? "s" : ""}`;

/**
 * « Vérifier » : lit le fichier et dit ce qu'il contient (produits, nouveaux, illisibles, produits qui passeraient à 0,
 * fichier appliqué ou retenu) SANS rien écrire dans le stock. Même permission que l'envoi ; l'officine est celle de la
 * session. La personne confirme ensuite avec `sendStockAction`, qui refait les mêmes contrôles.
 */
export async function previewStockAction(formData: FormData): Promise<ActionResult<StockPreview>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  let result: Awaited<ReturnType<typeof previewStockDeposit>>;
  try {
    const upload = await readUpload(formData);
    if (!upload.ok) return fail(upload.error);
    result = await previewStockDeposit({ scope: session.scope, fileName: upload.fileName, bytes: upload.bytes, pricesOnly: upload.pricesOnly, merge: upload.merge });
  } catch (error) {
    console.error("[stock-preview] vérification du titulaire en échec", error);
    return fail("Le fichier n'a pas pu être vérifié. Rien n'a été modifié : réessayez dans un instant.");
  }
  return result.ok ? ok(result.preview) : fail(result.error);
}

export async function sendStockAction(formData: FormData): Promise<ActionResult<DepositView>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  // Un stock complet met à 0 ce qui n'y figure pas : l'écran le fait confirmer, et le serveur l'exige.
  if (formData.get("confirmation") !== DEPOSIT_CONFIRMATION) return fail("Confirmez d'abord la mise à jour de votre stock.");

  let result: Awaited<ReturnType<typeof receiveStockDeposit>>;
  try {
    const upload = await readUpload(formData);
    if (!upload.ok) return fail(upload.error);
    result = await receiveStockDeposit({
      scope: session.scope,
      pharmacyIsDemo: session.pharmacy.isDemo,
      fileName: upload.fileName,
      bytes: upload.bytes,
      source: "WEB",
      pricesOnly: upload.pricesOnly,
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
