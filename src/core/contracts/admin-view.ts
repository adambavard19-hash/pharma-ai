import type { StatusLabel } from "@/core/admin/statuses";
import { dispatchStatusLabel } from "@/core/admin/statuses";
import { mergeTimeline, type TimelineEntry, type TimelineKind } from "@/core/admin/timeline";

/**
 * Le centre des contrats de la console : dans quel filtre tombe un contrat,
 * quel libellé il porte, ce qui doit être relancé. Pur : ne dépend que du
 * contrat et de l'heure, pour que le cockpit et la liste comptent pareil.
 */

export const CONTRACT_FILTER_KEYS = ["en-attente", "brouillon", "a-signer", "consultes", "a-contresigner", "relance", "signes", "expires"] as const;
export type ContractFilterKey = (typeof CONTRACT_FILTER_KEYS)[number];

export const CONTRACT_FILTER_LABELS: Record<ContractFilterKey, string> = {
  "en-attente": "En attente",
  brouillon: "Brouillons à envoyer",
  "a-signer": "À signer",
  consultes: "Consultés",
  "a-contresigner": "À contresigner",
  relance: "Relance nécessaire",
  signes: "Signés",
  expires: "Expirés ou refusés",
};

/** Un contrat qui expire dans ce délai (ou déjà expiré sans être clos) doit être relancé. */
export const FOLLOW_UP_EXPIRY_DAYS = 7;
const DAY = 86_400_000;

const AWAITING_PHARMACY = new Set(["SENT", "OPENED"]);

/** « En attente » réunit trois filtres : brouillons, à signer, à contresigner (la tuile du cockpit). */
const PENDING_PARTS: readonly ContractFilterKey[] = ["brouillon", "a-signer", "a-contresigner"];

/** Le filtre demandé par l'adresse ; `?vue=a-envoyer` vaut `?statut=brouillon`. */
export function resolveContractFilter(params: { statut?: string | null; vue?: string | null }): ContractFilterKey | null {
  if (params.vue === "a-envoyer") return "brouillon";
  const statut = params.statut ?? null;
  return statut && (CONTRACT_FILTER_KEYS as readonly string[]).includes(statut) ? (statut as ContractFilterKey) : null;
}

export type ClassifiableContract = {
  status: string;
  escalatedAt: Date | null;
  expiresAt: Date | null;
  /** Une version plus récente existe pour le même dossier. */
  superseded?: boolean;
};

/** En attente de signature de l'officine, et signalé par les relances ou proche de l'expiration. */
export function needsFollowUp(contract: ClassifiableContract, now: Date): boolean {
  if (!AWAITING_PHARMACY.has(contract.status)) return false;
  if (contract.escalatedAt) return true;
  return Boolean(contract.expiresAt && contract.expiresAt.getTime() <= now.getTime() + FOLLOW_UP_EXPIRY_DAYS * DAY);
}

/** Les filtres de statut où ce contrat apparaît (un contrat peut figurer dans plusieurs) ; « En attente » se lit avec `isPendingContract`. */
export function contractFilters(contract: ClassifiableContract, now: Date): ContractFilterKey[] {
  const out: ContractFilterKey[] = [];
  switch (contract.status) {
    case "DRAFT":
      out.push("brouillon");
      break;
    case "SENT":
      out.push("a-signer");
      break;
    case "OPENED":
      out.push("a-signer", "consultes");
      break;
    case "SIGNED_PHARMACY":
    case "SIGNED_COMPANY":
      out.push("a-contresigner");
      break;
    case "FINALIZED":
      out.push("signes");
      break;
    case "EXPIRED":
    case "REFUSED":
      out.push("expires");
      break;
  }
  if (needsFollowUp(contract, now)) out.push("relance");
  return out;
}

/** En attente : brouillon, à signer ou à contresigner — ni signé des deux côtés, ni clos. */
export function isPendingContract(contract: ClassifiableContract, now: Date): boolean {
  const filters = contractFilters(contract, now);
  return PENDING_PARTS.some((key) => filters.includes(key));
}

export function inContractFilter(contract: ClassifiableContract, filter: ContractFilterKey | null, now: Date): boolean {
  if (!filter) return true;
  if (filter === "en-attente") return isPendingContract(contract, now);
  return contractFilters(contract, now).includes(filter);
}

/** Les compteurs des pastilles, et le total. */
export function countContractFilters(contracts: ClassifiableContract[], now: Date): Record<ContractFilterKey | "tous", number> {
  const counts = Object.fromEntries([...CONTRACT_FILTER_KEYS, "tous"].map((k) => [k, 0])) as Record<ContractFilterKey | "tous", number>;
  for (const contract of contracts) {
    counts.tous += 1;
    for (const key of contractFilters(contract, now)) counts[key] += 1;
    if (isPendingContract(contract, now)) counts["en-attente"] += 1;
  }
  return counts;
}

export type ContractDisplayStatus = StatusLabel & { code: "DRAFT" | "SUPERSEDED" | "SENT" | "OPENED" | "COUNTERSIGN" | "FOLLOW_UP" | "FINALIZED" | "EXPIRED" | "REFUSED" | "UNKNOWN" };

/** Le libellé affiché : le geste attendu passe avant l'état technique. */
export function contractDisplayStatus(contract: ClassifiableContract, now: Date): ContractDisplayStatus {
  if (needsFollowUp(contract, now)) {
    const expired = Boolean(contract.expiresAt && contract.expiresAt.getTime() <= now.getTime());
    return { code: "FOLLOW_UP", label: "Relance nécessaire", tone: expired ? "danger" : "warning" };
  }
  switch (contract.status) {
    case "DRAFT":
      return contract.superseded ? { code: "SUPERSEDED", label: "Brouillon remplacé", tone: "neutral" } : { code: "DRAFT", label: "Brouillon · à envoyer", tone: "neutral" };
    case "SENT":
      return { code: "SENT", label: "Envoyé", tone: "info" };
    case "OPENED":
      return { code: "OPENED", label: "Consulté", tone: "brand" };
    case "SIGNED_PHARMACY":
    case "SIGNED_COMPANY":
      return { code: "COUNTERSIGN", label: "À contresigner", tone: "warning" };
    case "FINALIZED":
      return { code: "FINALIZED", label: "Signé", tone: "success" };
    case "EXPIRED":
      return { code: "EXPIRED", label: "Expiré", tone: "danger" };
    case "REFUSED":
      return { code: "REFUSED", label: "Refusé", tone: "danger" };
    default:
      return { code: "UNKNOWN", label: contract.status, tone: "neutral" };
  }
}

/** L'échéance du lien de signature, lisible : « dans 5 j », « aujourd'hui », « dépassée ». */
export function expiryHint(contract: { status: string; expiresAt: Date | null }, now: Date): { label: string; tone: "neutral" | "warning" | "danger" } | null {
  if (!contract.expiresAt || !AWAITING_PHARMACY.has(contract.status)) return null;
  const ms = contract.expiresAt.getTime() - now.getTime();
  if (ms <= 0) return { label: "dépassée", tone: "danger" };
  const days = Math.floor(ms / DAY);
  if (days === 0) return { label: "aujourd'hui", tone: "danger" };
  return { label: `dans ${days} j`, tone: days <= FOLLOW_UP_EXPIRY_DAYS ? "warning" : "neutral" };
}

/** Marque, pour chaque contrat, s'il est la dernière version de son dossier. */
export function markLatestVersions<T extends { prospectId: string; version: number }>(contracts: T[]): (T & { latest: boolean; versionCount: number })[] {
  const max = new Map<string, number>();
  const count = new Map<string, number>();
  for (const c of contracts) {
    max.set(c.prospectId, Math.max(max.get(c.prospectId) ?? 0, c.version));
    count.set(c.prospectId, (count.get(c.prospectId) ?? 0) + 1);
  }
  return contracts.map((c) => ({ ...c, latest: max.get(c.prospectId) === c.version, versionCount: count.get(c.prospectId) ?? 1 }));
}

const fold = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Recherche : officine, raison sociale, signataire (nom ou e-mail), référence. */
export function matchesContractSearch(row: { reference: string; pharmacyName: string; legalName?: string | null; signerName: string; signerEmail: string }, query: string | null | undefined): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fold([row.reference, row.pharmacyName, row.legalName, row.signerName, row.signerEmail].filter(Boolean).join(" "));
  return terms.every((term) => haystack.includes(term));
}

// ---------------------------------------------------------------------------
// Historique d'un contrat
// ---------------------------------------------------------------------------

export type ContractEventRow = { id: string; type: string; summary: string; actorType: string; actorLabel: string | null; metadata: unknown; createdAt: Date };
export type ContractDispatchRow = { id: string; kind: string; recipient: string; status: string; subject: string | null; detail: string | null; trigger: string | null; createdAt: Date };

/** Les événements du dossier qui portent sur ce contrat (métadonnée `contractId`). */
export function eventsOfContract<T extends { metadata: unknown }>(events: T[], contractId: string): T[] {
  return events.filter((e) => {
    const meta = e.metadata;
    return Boolean(meta && typeof meta === "object" && !Array.isArray(meta) && (meta as Record<string, unknown>).contractId === contractId);
  });
}

const EVENT_TONE: Record<string, TimelineEntry["tone"]> = {
  CONTRACT_GENERATED: "neutral",
  CONTRACT_SENT: "info",
  CONTRACT_OPENED: "brand",
  CONTRACT_SIGNED: "success",
  SIGNED_PDF_ARCHIVED: "success",
  SUBSCRIPTION_PENDING: "success",
  CONTRACT_REMINDER: "warning",
  CONTRACT_REFUSED: "danger",
  CONTRACT_EXPIRED: "danger",
  SIGNATURE_ERROR: "danger",
};

const EVENT_KIND: Record<string, TimelineKind> = {
  EMAIL_SENT: "email",
  SUBSCRIPTION_PENDING: "abonnement",
  COMMISSION_CREATED: "commercial",
  COMMISSION_UPDATED: "commercial",
  COMMISSION_PAID: "commercial",
};

const ACTOR_LABEL: Record<string, string> = { SYSTEM: "PharmaBoost", SIGNER: "Signataire" };

/** La frise d'un contrat : ses événements de dossier et les e-mails qui le concernent. */
export function contractTimeline(events: ContractEventRow[], dispatches: ContractDispatchRow[]): TimelineEntry[] {
  const fromEvents: TimelineEntry[] = events.map((e) => ({
    id: `event:${e.id}`,
    at: e.createdAt,
    kind: EVENT_KIND[e.type] ?? "contrat",
    title: e.summary,
    actor: e.actorLabel ?? ACTOR_LABEL[e.actorType] ?? null,
    tone: e.summary.includes("NON ") ? "danger" : (EVENT_TONE[e.type] ?? "neutral"),
  }));
  const fromDispatches: TimelineEntry[] = dispatches.map((d) => {
    const status = dispatchStatusLabel(d.status);
    return {
      id: `email:${d.id}`,
      at: d.createdAt,
      kind: "email",
      title: d.subject ? `E-mail « ${d.subject} » — ${status.label.toLowerCase()}` : `E-mail — ${status.label.toLowerCase()}`,
      detail: [`À ${d.recipient}`, d.status === "FAILED" || d.status === "BOUNCED" ? d.detail : null].filter(Boolean).join(" · "),
      tone: status.tone,
    };
  });
  return mergeTimeline([fromEvents, fromDispatches]);
}
