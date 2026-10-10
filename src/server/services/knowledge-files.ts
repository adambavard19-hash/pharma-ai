import "server-only";
import { MAX_DOCUMENT_CHARS } from "@/core/knowledge/extraction";
import { extractPdfLayoutText } from "@/server/services/pdf-text";

/**
 * Le texte d'un fichier déposé dans la console. Seul le texte est gardé : le fichier d'origine n'est jamais conservé.
 * Formats lus : PDF (avec du texte), Excel, CSV, texte. Un PDF scanné (image) n'a pas de texte à lire.
 */

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ["pdf", "xlsx", "xls", "csv", "tsv", "txt", "md"] as const;

export type FileText = { ok: true; text: string; truncated: boolean } | { ok: false; error: string };

const extensionOf = (name: string): string => (name.split(".").pop() ?? "").toLowerCase();

export async function textFromFile(fileName: string, bytes: Uint8Array): Promise<FileText> {
  if (bytes.byteLength === 0) return { ok: false, error: "Le fichier est vide." };
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: "Le fichier dépasse 8 Mo : découpez-le en plusieurs documents." };
  const extension = extensionOf(fileName);
  let text = "";
  try {
    if (extension === "pdf") {
      text = (await extractPdfLayoutText(bytes, { maxPages: 120 })).text;
    } else if (extension === "xlsx" || extension === "xls") {
      const XLSX = await import("xlsx");
      const book = XLSX.read(bytes, { type: "array" });
      text = book.SheetNames.map((name) => `## ${name}\n${XLSX.utils.sheet_to_csv(book.Sheets[name], { blankrows: false })}`).join("\n\n");
    } else if (["csv", "tsv", "txt", "md"].includes(extension)) {
      text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    } else if (extension === "doc" || extension === "docx") {
      return { ok: false, error: "Les fichiers Word ne sont pas lus : enregistrez-le en PDF (Fichier → Enregistrer sous) et déposez le PDF." };
    } else {
      return { ok: false, error: `Format non pris en charge (« .${extension || "?"} »). Déposez un PDF, un fichier Excel, un CSV ou un texte.` };
    }
  } catch (error) {
    console.error("[connaissances] lecture du fichier", error);
    return { ok: false, error: "Ce fichier n'a pas pu être lu : il est peut-être abîmé ou protégé." };
  }
  text = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (text.length < 30) return { ok: false, error: "Ce document ne contient pas de texte lisible (un PDF scanné est une image : déposez-le plutôt en texte ou refaites-le en PDF avec texte)." };
  const truncated = text.length > MAX_DOCUMENT_CHARS;
  return { ok: true, text: truncated ? text.slice(0, MAX_DOCUMENT_CHARS) : text, truncated };
}
