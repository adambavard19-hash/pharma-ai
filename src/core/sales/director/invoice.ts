import type { CommissionStatusCode } from "@/core/sales/pipeline";
import { formatCents } from "@/lib/format";

/**
 * Les factures des commerciaux, côté direction commerciale : la machine
 * d'états, les règles de saisie et le rapprochement avec les commissions.
 *
 * Module pur : ni base, ni horloge implicite (l'instant présent est toujours
 * passé en paramètre), utilisable côté serveur comme dans le navigateur.
 * Les valeurs reprennent l'énumération Prisma `SalesInvoiceStatus`.
 *
 *   Reçue  ──valider──▶  Validée  ──payer──▶  Payée
 *     │                     │
 *     └──────refuser────────┴──▶  Refusée     (motif obligatoire)
 *
 * Payée et Refusée sont définitives : on ne « dé-paie » pas une facture.
 */

export const INVOICE_STATUSES = ["RECEIVED", "APPROVED", "PAID", "REJECTED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  RECEIVED: "Reçue",
  APPROVED: "Validée",
  PAID: "Payée",
  REJECTED: "Refusée",
};

export const INVOICE_STATUS_TONES: Record<InvoiceStatus, "info" | "brand" | "success" | "danger"> = {
  RECEIVED: "info",
  APPROVED: "brand",
  PAID: "success",
  REJECTED: "danger",
};

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === "string" && (INVOICE_STATUSES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------- Gestes

export type InvoiceGesture = "APPROVE" | "PAY" | "REJECT";

export const INVOICE_GESTURES: readonly InvoiceGesture[] = ["APPROVE", "PAY", "REJECT"];

export function isInvoiceGesture(value: unknown): value is InvoiceGesture {
  return typeof value === "string" && (INVOICE_GESTURES as readonly string[]).includes(value);
}

/** Les gestes permis depuis chaque statut, et le statut où ils mènent. */
const TRANSITIONS: Record<InvoiceStatus, Partial<Record<InvoiceGesture, InvoiceStatus>>> = {
  RECEIVED: { APPROVE: "APPROVED", REJECT: "REJECTED" },
  APPROVED: { PAY: "PAID", REJECT: "REJECTED" },
  PAID: {},
  REJECTED: {},
};

/** Les gestes qu'on peut faire sur une facture, dans l'ordre où l'écran les propose. */
export function invoiceGesturesFor(status: InvoiceStatus): InvoiceGesture[] {
  return INVOICE_GESTURES.filter((gesture) => TRANSITIONS[status][gesture] !== undefined);
}

export type InvoiceMove = { ok: true; to: InvoiceStatus } | { ok: false; error: string };

const REFUSED_FROM: Record<InvoiceGesture, Partial<Record<InvoiceStatus, string>>> = {
  APPROVE: { APPROVED: "Cette facture est déjà validée.", PAID: "Cette facture est déjà payée.", REJECTED: "Cette facture a été refusée : elle ne peut plus être validée." },
  PAY: { RECEIVED: "Validez d'abord la facture : on ne paie qu'une facture validée.", PAID: "Cette facture est déjà payée.", REJECTED: "Cette facture a été refusée : elle ne peut pas être payée." },
  REJECT: { PAID: "Une facture payée ne peut plus être refusée.", REJECTED: "Cette facture est déjà refusée." },
};

/** Applique un geste à un statut : le statut d'arrivée, ou la raison, en clair, du refus. */
export function applyInvoiceGesture(from: InvoiceStatus, gesture: InvoiceGesture): InvoiceMove {
  const to = TRANSITIONS[from][gesture];
  if (to) return { ok: true, to };
  return { ok: false, error: REFUSED_FROM[gesture][from] ?? "Ce geste n'est pas possible sur cette facture." };
}

/** On ne supprime qu'une facture qui n'a encore rien déclenché : ni validée, ni payée. */
export function canDeleteInvoice(status: InvoiceStatus): boolean {
  return status === "RECEIVED" || status === "REJECTED";
}

export const INVOICE_DELETE_REFUSAL = "Une facture validée ou payée ne se supprime pas : elle fait partie de la comptabilité. Refusez-la si elle est fausse.";

// ------------------------------------------------- Effet sur les commissions

/**
 * Ce que le geste fait à une commission rattachée à la facture.
 *
 *  - valider : prévisionnelle ou acquise → à payer ;
 *  - payer : prévisionnelle, acquise ou à payer → payée ;
 *  - refuser : une commission que la validation avait mise « à payer » redevient
 *    acquise (la facture ne la réclame plus) ; les autres ne changent pas.
 *
 * Une commission déjà payée ou annulée ne bouge jamais : on ne rétrograde pas
 * un paiement. `invoiceFrom` est le statut de la facture avant le geste.
 */
export function commissionStatusAfterInvoiceGesture(gesture: InvoiceGesture, invoiceFrom: InvoiceStatus, current: CommissionStatusCode): CommissionStatusCode {
  switch (gesture) {
    case "APPROVE":
      return current === "FORECAST" || current === "EARNED" ? "PAYABLE" : current;
    case "PAY":
      return current === "FORECAST" || current === "EARNED" || current === "PAYABLE" ? "PAID" : current;
    case "REJECT":
      return invoiceFrom === "APPROVED" && current === "PAYABLE" ? "EARNED" : current;
  }
}

/** Une commission qu'une facture peut réclamer : acquise ou à payer, et pas déjà sur une autre facture. */
export function isInvoiceable(commission: { status: string; invoiceId: string | null }): boolean {
  return commission.invoiceId === null && (commission.status === "EARNED" || commission.status === "PAYABLE");
}

// ------------------------------------------------------------ Rapprochement

/** Un montant écrit comme partout ailleurs dans l'application : séparateur de milliers, virgule, « € ». */
const euros = (cents: number) => formatCents(Math.abs(cents));

export type InvoiceGap = {
  kind: "NO_COMMISSION" | "MATCH" | "HIGHER" | "LOWER";
  /** Montant de la facture moins total des commissions rattachées (centimes). */
  differenceCents: number;
  /** Une phrase claire : l'écart n'est jamais bloquant, il est seulement dit. */
  message: string;
};

/** Compare le montant de la facture au total des commissions rattachées. */
export function compareInvoiceToCommissions(invoiceCents: number, commissionsCents: number, commissionCount: number): InvoiceGap {
  if (commissionCount === 0) {
    return { kind: "NO_COMMISSION", differenceCents: invoiceCents, message: "Aucune commission n'est rattachée à cette facture : son montant n'est pas vérifié." };
  }
  const differenceCents = invoiceCents - commissionsCents;
  if (differenceCents === 0) {
    return { kind: "MATCH", differenceCents, message: `Le montant de la facture (${euros(invoiceCents)}) correspond aux commissions rattachées.` };
  }
  if (differenceCents > 0) {
    return { kind: "HIGHER", differenceCents, message: `La facture (${euros(invoiceCents)}) dépasse de ${euros(differenceCents)} le total des commissions rattachées (${euros(commissionsCents)}). Vérifiez avant de la valider.` };
  }
  return { kind: "LOWER", differenceCents, message: `La facture (${euros(invoiceCents)}) est inférieure de ${euros(differenceCents)} au total des commissions rattachées (${euros(commissionsCents)}).` };
}

// ------------------------------------------------------------------ Saisie

export const INVOICE_MAX_CENTS = 10_000_000; // 100 000 €
export const INVOICE_NUMBER_MAX = 40;
export const INVOICE_PERIOD_MAX = 60;
export const INVOICE_NOTE_MAX = 500;
export const INVOICE_REASON_MIN = 5;
export const INVOICE_REASON_MAX = 500;
/** Une facture ne remonte pas avant cette date : au-delà, c'est une faute de frappe. */
export const INVOICE_EARLIEST = new Date("2020-01-01T00:00:00Z");

/** Le montant tapé par une personne (« 1 250,50 », « 1250.5 », « 300 € »), en centimes ; `null` s'il est illisible. */
export function parseEurosToCents(text: string): number | null {
  const cleaned = text.replace(/[\s  €]/g, "");
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Le numéro de facture : espaces nettoyés, 1 à 40 caractères ; `null` s'il est vide ou trop long. */
export function normalizeInvoiceNumber(raw: string): string | null {
  const value = raw.replace(/\s+/g, " ").trim();
  return value.length >= 1 && value.length <= INVOICE_NUMBER_MAX ? value : null;
}

export type InvoiceDraftInput = {
  number: string;
  /** Le montant tel que tapé, en euros. */
  amount: string;
  /** La date de la facture, `AAAA-MM-JJ`. */
  issuedOn: string;
  periodLabel?: string | null;
  note?: string | null;
};

export type InvoiceDraft = { number: string; amountCents: number; issuedAt: Date; periodLabel: string | null; note: string | null };
export type InvoiceDraftResult = { ok: true; value: InvoiceDraft } | { ok: false; errors: Record<string, string> };

/**
 * Valide la saisie d'une facture reçue : le premier message d'erreur de chaque
 * champ, en français. La date est rangée à midi (UTC) : elle tombe le même jour
 * à Paris, hiver comme été.
 */
export function validateInvoiceDraft(input: InvoiceDraftInput, now: Date): InvoiceDraftResult {
  const errors: Record<string, string> = {};

  const number = normalizeInvoiceNumber(input.number ?? "");
  if (!number) errors.number = (input.number ?? "").trim() ? `Le numéro est trop long (${INVOICE_NUMBER_MAX} caractères au plus).` : "Indiquez le numéro de la facture.";

  const amountCents = parseEurosToCents(input.amount ?? "");
  if (amountCents === null) errors.amount = "Indiquez le montant en euros, par exemple 1 250,50.";
  else if (amountCents <= 0) errors.amount = "Le montant doit être supérieur à zéro.";
  else if (amountCents > INVOICE_MAX_CENTS) errors.amount = "Ce montant dépasse 100 000 € : vérifiez-le.";

  let issuedAt: Date | null = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedOn ?? "")) {
    errors.issuedOn = "Indiquez la date de la facture.";
  } else {
    const candidate = new Date(`${input.issuedOn}T12:00:00Z`);
    if (Number.isNaN(candidate.getTime()) || candidate.toISOString().slice(0, 10) !== input.issuedOn) errors.issuedOn = "Cette date n'existe pas.";
    else if (candidate.getTime() > now.getTime() + 36 * 60 * 60 * 1000) errors.issuedOn = "La date de la facture ne peut pas être dans le futur.";
    else if (candidate.getTime() < INVOICE_EARLIEST.getTime()) errors.issuedOn = "Cette date est trop ancienne : vérifiez-la.";
    else issuedAt = candidate;
  }

  const periodLabel = (input.periodLabel ?? "").replace(/\s+/g, " ").trim();
  if (periodLabel.length > INVOICE_PERIOD_MAX) errors.periodLabel = `${INVOICE_PERIOD_MAX} caractères au plus.`;
  const note = (input.note ?? "").trim();
  if (note.length > INVOICE_NOTE_MAX) errors.note = `${INVOICE_NOTE_MAX} caractères au plus.`;

  if (Object.keys(errors).length > 0 || !number || amountCents === null || !issuedAt) return { ok: false, errors };
  return { ok: true, value: { number, amountCents, issuedAt, periodLabel: periodLabel || null, note: note || null } };
}

/** Le motif d'un refus : au moins 5 caractères, 500 au plus. */
export function validateReason(raw: string | null | undefined): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = (raw ?? "").replace(/\s+/g, " ").trim();
  if (reason.length < INVOICE_REASON_MIN) return { ok: false, error: `Indiquez le motif (au moins ${INVOICE_REASON_MIN} caractères).` };
  if (reason.length > INVOICE_REASON_MAX) return { ok: false, error: `Le motif est trop long (${INVOICE_REASON_MAX} caractères au plus).` };
  return { ok: true, reason };
}

// ------------------------------------------------------------------ Fichier

export const INVOICE_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const INVOICE_FILE_MAX_LABEL = "5 Mo";
export const INVOICE_FILE_SIGNATURE = "%PDF-";
export const INVOICE_FILE_MIME = "application/pdf";

/** Où le fichier est rangé : sous l'identifiant de la facture, jamais sous celui d'une officine. */
export function invoiceStorageKey(invoiceId: string): string {
  return `sales-invoices/${invoiceId}/facture.pdf`;
}

/** La clé n'est valable que pour CETTE facture : une clé altérée ne lit jamais le fichier d'une autre. */
export function isInvoiceKeyOf(invoiceId: string, key: string | null | undefined): key is string {
  return !!key && !key.includes("..") && key.startsWith(`sales-invoices/${invoiceId}/`);
}

/** Un nom de fichier lisible et sans danger : ni chemin, ni caractère de contrôle, toujours en « .pdf ». */
export function sanitizeInvoiceFileName(raw: string): string {
  const base = raw.normalize("NFC").split(/[\\/]/).pop() ?? "";
  const withoutExtension = base.replace(/\.pdf$/i, "");
  const cleaned = withoutExtension
    .replace(/[^\p{L}\p{N} ._()'’-]+/gu, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^[ ._-]+|[ ._-]+$/g, "")
    .slice(0, 100)
    .trim();
  return `${cleaned || "facture"}.pdf`;
}

export type InvoiceFileInspection = { ok: true; fileName: string; sizeBytes: number } | { ok: false; error: string };

/**
 * Le contrôle du serveur : la taille réelle et la signature du fichier (« %PDF- »
 * en tête), pas le type que le navigateur annonce. Un fichier renommé en .pdf
 * ne passe pas.
 */
export function inspectInvoiceFile(bytes: Uint8Array, fileName: string): InvoiceFileInspection {
  if (bytes.byteLength === 0) return { ok: false, error: "Ce fichier est vide." };
  if (bytes.byteLength > INVOICE_FILE_MAX_BYTES) return { ok: false, error: `Ce fichier dépasse ${INVOICE_FILE_MAX_LABEL}. Choisissez un PDF plus léger.` };
  const head = String.fromCharCode(...bytes.subarray(0, INVOICE_FILE_SIGNATURE.length));
  if (head !== INVOICE_FILE_SIGNATURE) return { ok: false, error: "Ce fichier n'est pas un PDF lisible. Joignez la facture au format PDF." };
  return { ok: true, fileName: sanitizeInvoiceFileName(fileName), sizeBytes: bytes.byteLength };
}

/** Contrôle rapide côté navigateur : le serveur, lui, relit tout (`inspectInvoiceFile`). */
export function invoiceFileProblem(file: { name: string; size: number; type?: string }): string | null {
  if (file.size <= 0) return "Ce fichier est vide.";
  if (file.size > INVOICE_FILE_MAX_BYTES) return `Ce fichier dépasse ${INVOICE_FILE_MAX_LABEL}. Choisissez un PDF plus léger.`;
  if (file.type !== INVOICE_FILE_MIME && !/\.pdf$/i.test(file.name)) return "La facture doit être un fichier PDF.";
  return null;
}
