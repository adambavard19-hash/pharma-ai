"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { emailSealedDocument, generateSealedDocument } from "@/server/services/sealed-documents";
import type { DocumentContent } from "@/core/documents/types";
import { fail, ok, type ActionResult } from "./types";

/**
 * Le plan scellé : généré pour le poste, remis au patient par QR code,
 * impression ou e-mail. Le plan en clair ne va qu'à l'écran du pharmacien ;
 * la clé n'est que dans l'adresse.
 */
export async function generateSealedDocumentAction(payload: { prescriptionId: string; pharmacistNote?: string | null }): Promise<ActionResult<{ documentId: string; url: string; expiresAt: string; content: DocumentContent }>> {
  const session = await requirePermission(PERMISSIONS.DOCUMENT_GENERATE);
  try {
    const result = await generateSealedDocument({ session, prescriptionId: payload.prescriptionId, pharmacistNote: payload.pharmacistNote ?? null });
    revalidatePath(`/vente/${payload.prescriptionId}/fin`);
    return ok({ documentId: result.documentId, url: result.url, expiresAt: result.expiresAt.toISOString(), content: result.content }, "Plan prêt à remettre.");
  } catch (error) {
    console.error("[plan scellé] génération impossible", error);
    return fail(error instanceof Error ? error.message : "Le plan n'a pas pu être préparé.");
  }
}

const emailSchema = z.object({ documentId: z.string().min(1), url: z.string().url().max(600), to: z.string().trim().email("Adresse e-mail invalide.") });

/** L'adresse donnée au comptoir sert à cet envoi, et n'est pas conservée. */
export async function emailSealedDocumentAction(payload: z.input<typeof emailSchema> & { content: DocumentContent }): Promise<ActionResult<{ status: string; detail: string }>> {
  const session = await requirePermission(PERMISSIONS.DOCUMENT_SEND);
  const parsed = emailSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Requête invalide.");
  if (!parsed.data.url.includes("#")) return fail("Le lien ne contient pas la clé du plan.");
  try {
    const outcome = await emailSealedDocument({ scope: session.scope, documentId: parsed.data.documentId, url: parsed.data.url, to: parsed.data.to, content: payload.content });
    if (outcome.status === "FAILED") return fail(`L'e-mail n'est pas parti : ${outcome.detail}`);
    return ok(outcome, outcome.status === "SENT" ? "Plan envoyé par e-mail." : `Envoi simulé : ${outcome.detail}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "L'e-mail n'a pas pu être envoyé.");
  }
}
