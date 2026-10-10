"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { analyseDocument, decideProposal, deleteDocument, depositDocument, resolveProposalProduct } from "@/server/services/knowledge";
import { fail, ok, type ActionResult } from "./types";

/**
 * La base de connaissances de la console : dépôt de documents, relecture par le modèle, décision de la pharmacienne.
 * Seule une session d'administrateur plateforme y accède. Rien n'est mis en ligne sans l'acceptation d'une proposition.
 */

export type DepositResult = { proposals: number; discarded: number; analysis: "ANALYSED" | "FAILED"; analysisError: string | null; truncated: boolean };

export async function depositKnowledgeAction(formData: FormData): Promise<ActionResult<DepositResult>> {
  const session = await requirePlatformSession();
  const admin = { id: session.admin.id, fullName: session.admin.fullName };
  const title = String(formData.get("title") ?? "");
  const note = String(formData.get("note") ?? "");
  const text = String(formData.get("text") ?? "");
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && text.trim().length === 0) return fail("Déposez un fichier ou écrivez un texte.");
  if (hasFile && text.trim().length > 0) return fail("Choisissez : soit un fichier, soit un texte écrit ici.");
  const result = hasFile
    ? await depositDocument(admin, { kind: "FILE", title: title || (file as File).name.replace(/\.[^.]+$/, ""), note: note || null, fileName: (file as File).name, mimeType: (file as File).type || null, bytes: new Uint8Array(await (file as File).arrayBuffer()) })
    : await depositDocument(admin, { kind: "TEXT", title, note: note || null, text });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/connaissances");
  const message =
    result.analysis === "FAILED"
      ? "Document enregistré, mais le modèle n'a pas pu le lire pour l'instant. Vous pourrez relancer la lecture."
      : result.proposals > 0
        ? `Document lu : ${result.proposals} proposition${result.proposals > 1 ? "s" : ""} à relire.`
        : "Document lu : rien n'en a été tiré qui soit écrit noir sur blanc.";
  return ok({ proposals: result.proposals, discarded: result.discarded, analysis: result.analysis, analysisError: result.analysisError, truncated: result.truncated }, message);
}

const idSchema = z.object({ id: z.string().min(1).max(64) });

export async function reanalyseKnowledgeAction(payload: z.input<typeof idSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Document invalide.");
  const result = await analyseDocument({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/connaissances");
  return ok(null, `Document relu : ${result.proposals} proposition${result.proposals > 1 ? "s" : ""} à relire.`);
}

export async function decideKnowledgeProposalAction(payload: { id: string; decision: "ACCEPT" | "REJECT" }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.extend({ decision: z.enum(["ACCEPT", "REJECT"]) }).safeParse(payload);
  if (!parsed.success) return fail("Décision invalide.");
  const result = await decideProposal({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id, parsed.data.decision);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/connaissances");
  revalidatePath("/admin/conseils");
  return ok(null, result.accepted ? `« ${result.title} » est en ligne dans toutes les pharmacies, « à relire » jusqu'à votre validation dans Conseils & associations.` : `« ${result.title} » est refusé.`);
}

export async function resolveKnowledgeProductAction(payload: { id: string; which: "trigger" | "advice"; ean: string; name: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.extend({ which: z.enum(["trigger", "advice"]), ean: z.string().min(7).max(20), name: z.string().min(1).max(200) }).safeParse(payload);
  if (!parsed.success) return fail("Produit invalide.");
  const result = await resolveProposalProduct({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id, parsed.data.which, { ean: parsed.data.ean, name: parsed.data.name });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/connaissances");
  return ok(null, "Produit choisi.");
}

export async function deleteKnowledgeDocumentAction(payload: z.input<typeof idSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Document invalide.");
  const result = await deleteDocument({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/connaissances");
  return ok(null, `« ${result.title} » est supprimé. Ce qui en a déjà été accepté reste dans Conseils & associations.`);
}
