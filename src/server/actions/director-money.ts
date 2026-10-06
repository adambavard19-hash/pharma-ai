"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDirectorSession, type DirectorSession } from "@/server/auth/director-session";
import { INVOICE_FILE_MAX_BYTES, INVOICE_FILE_MAX_LABEL, INVOICE_GESTURES, inspectInvoiceFile, validateInvoiceDraft } from "@/core/sales/director/invoice";
import { COMMISSION_NOTE_MAX, createInvoice, deleteInvoice, moveCommission, moveInvoice, setCommissionNote, type DirectorRef } from "@/server/services/sales/director-money";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les gestes du directeur commercial sur l'argent : valider, payer ou annuler
 * une commission, enregistrer une facture reçue, la valider, la payer, la
 * refuser ou la supprimer.
 *
 * Chaque action commence par la session du directeur ; son identité vient de
 * là, jamais de la demande. Les services revérifient tout identifiant en base,
 * appliquent la machine d'états et tracent chaque geste.
 */

const directorOf = (session: DirectorSession): DirectorRef => ({ id: session.director.id, label: session.director.fullName });

/** Les pages qui montrent des commissions ou des factures, dont l'extranet du commercial concerné. */
function revalidateMoney(invoiceId?: string) {
  for (const path of ["/directeur", "/directeur/commissions", "/directeur/factures", "/extranet/commissions"]) revalidatePath(path);
  revalidatePath("/directeur/commerciaux/[id]", "page");
  if (invoiceId) revalidatePath(`/directeur/factures/${invoiceId}`);
}

const id = z.string().trim().min(1, "Demande invalide.").max(64, "Demande invalide.");
const reason = z.string().max(2000).optional().nullable();

const commissionGestureSchema = z.object({ commissionId: id, gesture: z.enum(["VALIDATE", "PAY", "CANCEL"], "Geste inconnu."), reason });

/** Valider, marquer payée ou annuler (motif obligatoire) une commission. */
export async function commissionGestureAction(payload: z.input<typeof commissionGestureSchema>): Promise<ActionResult<{ status: string }>> {
  const session = await requireDirectorSession();
  const parsed = commissionGestureSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Demande invalide.");

  const result = await moveCommission(parsed.data, directorOf(session));
  if (!result.ok) return fail(result.error);
  revalidateMoney();
  return ok({ status: result.status }, result.message);
}

const commissionNoteSchema = z.object({ commissionId: id, note: z.string().max(COMMISSION_NOTE_MAX * 4) });

/** Modifie la note d'une commission. */
export async function commissionNoteAction(payload: z.input<typeof commissionNoteSchema>): Promise<ActionResult<null>> {
  const session = await requireDirectorSession();
  const parsed = commissionNoteSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.", zodFieldErrors(parsed.error.issues));

  const result = await setCommissionNote(parsed.data.commissionId, parsed.data.note, directorOf(session));
  if (!result.ok) return fail(result.error, { note: result.error });
  revalidateMoney();
  return ok(null, "Note enregistrée.");
}

const SALES_REP_REQUIRED = "Choisissez le commercial.";

/**
 * « Enregistrer une facture reçue » : les champs arrivent en formulaire, le PDF
 * facultatif en fichier (`file`) ; le serveur relit tout, y compris la
 * signature du PDF. Le commercial est choisi dans le formulaire (c'est la
 * facture d'UN commercial), mais le service le relit en base et n'accepte que
 * les commissions de CE commercial.
 */
export async function createInvoiceAction(formData: FormData): Promise<ActionResult<{ id: string; file: "none" | "saved" }>> {
  const session = await requireDirectorSession();
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  const salesRepId = text("salesRepId").trim();
  if (!salesRepId || salesRepId.length > 64) return fail(SALES_REP_REQUIRED, { salesRepId: SALES_REP_REQUIRED });

  const draft = validateInvoiceDraft({ number: text("number"), amount: text("amount"), issuedOn: text("issuedOn"), periodLabel: text("periodLabel"), note: text("note") }, new Date());
  if (!draft.ok) return fail("Vérifiez les informations de la facture.", draft.errors);

  const commissionIds = formData
    .getAll("commissionIds")
    .filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 64)
    .slice(0, 200);

  // Le fichier, s'il y en a un : la taille, puis la signature. Une erreur ramène à la question du fichier.
  let file: { bytes: Uint8Array; fileName: string } | null = null;
  const upload = formData.get("file");
  if (upload && typeof upload !== "string" && upload.size > 0) {
    if (upload.size > INVOICE_FILE_MAX_BYTES) return fail("Le fichier n'a pas pu être pris en compte.", { file: `Ce fichier dépasse ${INVOICE_FILE_MAX_LABEL}. Choisissez un PDF plus léger.` });
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const inspected = inspectInvoiceFile(bytes, upload.name);
    if (!inspected.ok) return fail("Le fichier n'a pas pu être pris en compte.", { file: inspected.error });
    file = { bytes, fileName: inspected.fileName };
  }

  const result = await createInvoice({ salesRepId, commissionIds, draft: draft.value }, file, directorOf(session));
  // Un numéro déjà pris se corrige dans son champ : l'erreur y est attachée.
  if (!result.ok) return result.field ? fail(result.error, { [result.field]: result.error }) : fail(result.error);
  revalidateMoney(result.id);
  return ok({ id: result.id, file: result.file }, `Facture ${result.number} enregistrée.${result.file === "saved" ? " Le PDF est joint." : ""}`);
}

const invoiceGestureSchema = z.object({ invoiceId: id, gesture: z.enum(INVOICE_GESTURES, "Geste inconnu."), reason });

/** Valider, payer ou refuser (motif obligatoire) une facture. */
export async function invoiceGestureAction(payload: z.input<typeof invoiceGestureSchema>): Promise<ActionResult<{ status: string }>> {
  const session = await requireDirectorSession();
  const parsed = invoiceGestureSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Demande invalide.");

  const result = await moveInvoice(parsed.data, directorOf(session));
  if (!result.ok) return fail(result.error);
  revalidateMoney(parsed.data.invoiceId);
  return ok({ status: result.status }, result.message);
}

const deleteInvoiceSchema = z.object({ invoiceId: id });

/** Supprime une facture reçue ou refusée. */
export async function deleteInvoiceAction(payload: z.input<typeof deleteInvoiceSchema>): Promise<ActionResult<null>> {
  const session = await requireDirectorSession();
  const parsed = deleteInvoiceSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await deleteInvoice(parsed.data.invoiceId, directorOf(session));
  if (!result.ok) return fail(result.error);
  revalidateMoney();
  return ok(null, `Facture ${result.number} supprimée.`);
}
