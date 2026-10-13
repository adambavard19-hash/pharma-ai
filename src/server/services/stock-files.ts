import "server-only";
import { MERGE_MAX_FILES, mergeImportFiles, mergedFileName, mergedToCsv, type MergedFile } from "@/core/stock-import/merge-files";
import { DEPOSIT_ACCEPTED, DEPOSIT_ACCEPTED_LABEL, cleanDepositFileName, depositMaxBytes, depositMaxLabel } from "@/core/stock-deposit/rules";

/**
 * L'envoi du titulaire peut compter plusieurs fichiers (une édition « PAMP Net » et une « PV TTC », par exemple) : ils
 * sont lus chacun avec les lecteurs habituels, puis RÉUNIS en un seul tableau (voir `mergeImportFiles`). Ce tableau,
 * en CSV, devient le fichier de l'envoi : gardé 90 jours, contrôlé, appliqué ou retenu comme un fichier unique.
 *
 * Un fichier illisible bloque tout l'envoi, avec son nom : rien n'est réuni à moitié, rien n'est appliqué.
 */

export type StockUpload = { fileName: string; bytes: Uint8Array };

export type CombinedUpload =
  | { ok: true; fileName: string; bytes: Uint8Array; merge: { files: MergedFile[]; quantityConflicts: number } | null }
  | { ok: false; error: string };

export async function combineStockFiles(files: StockUpload[]): Promise<CombinedUpload> {
  if (files.length === 0) return { ok: false, error: "Choisissez le fichier de votre stock." };
  if (files.length > MERGE_MAX_FILES) return { ok: false, error: `${MERGE_MAX_FILES} fichiers au plus en un envoi.` };
  for (const file of files) {
    const name = cleanDepositFileName(file.fileName);
    if (!DEPOSIT_ACCEPTED.test(name)) return { ok: false, error: `« ${name} » : format non accepté. Envoyez un fichier ${DEPOSIT_ACCEPTED_LABEL}.` };
    if (file.bytes.byteLength === 0) return { ok: false, error: `« ${name} » est vide.` };
    if (file.bytes.byteLength > depositMaxBytes("WEB")) return { ok: false, error: `« ${name} » dépasse ${depositMaxLabel("WEB")}.` };
  }
  // Un seul fichier : l'envoi d'avant, octet pour octet.
  if (files.length === 1) return { ok: true, fileName: files[0].fileName, bytes: files[0].bytes, merge: null };

  const names = files.map((file) => cleanDepositFileName(file.fileName));
  // Chargé à la demande : l'envoi d'un seul fichier (le cas courant) n'a pas besoin du lecteur, ni de la base qu'il importe.
  const { parseImportFileAsync } = await import("./stock-import");
  const parsed = [];
  for (const [index, file] of files.entries()) {
    try {
      parsed.push({ fileName: names[index], ...(await parseImportFileAsync(names[index], file.bytes)) });
    } catch (error) {
      const reason = error instanceof Error && error.message.length <= 300 && !/prisma/i.test(error.message) ? error.message : "il n'a pas pu être lu.";
      return { ok: false, error: `Le fichier « ${names[index]} » n'a pas pu être lu : ${reason} Rien n'a été modifié.` };
    }
    if (parsed[index].records.length === 0) return { ok: false, error: `Le fichier « ${names[index]} » ne contient aucune ligne exploitable. Rien n'a été modifié.` };
  }
  const merged = mergeImportFiles(parsed);
  if (!merged.ok) return merged;
  // Une partie d'un fichier non lue : la mention suit dans le fichier réuni, pour que l'envoi soit retenu comme un fichier incomplet.
  if (merged.incomplete) return { ok: false, error: `Une partie d'un fichier n'a pas pu être lue (${merged.incompleteReason}). Réexportez-le depuis votre logiciel : rien n'a été modifié.` };
  return { ok: true, fileName: mergedFileName(names), bytes: new TextEncoder().encode(mergedToCsv(merged)), merge: { files: merged.files, quantityConflicts: merged.quantityConflicts } };
}
