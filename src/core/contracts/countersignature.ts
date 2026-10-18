import type { SignatureStatus } from "@/core/signature/ports";

/**
 * La double signature des contrats (18 oct. 2026) : le contrat de la pharmacie
 * est signé d'abord par le titulaire, puis contresigné par PharmaBoost (le
 * fondateur) ; le contrat d'affiliation est signé par l'affilié, puis
 * contresigné par PharmaBoost. Un contrat n'est « signé » (FINALIZED) que
 * quand les DEUX signatures sont acquises.
 *
 * Pur : ne dépend que de l'état du contrat et de l'événement reçu, pour que
 * les webhooks, la relecture chez le prestataire et la console appliquent la
 * même règle. Rejouer un événement ne change rien (idempotent).
 */

/** Le premier signataire : le titulaire de l'officine, ou l'affilié. */
export type FirstParty = "PHARMACY" | "AFFILIATE";

export type SignatureProgressState = {
  status: string;
  /** Signature du premier signataire (titulaire ou affilié). */
  firstPartySignedAt: Date | null;
  companySignedAt: Date | null;
};

export type SignatureProgressEvent = {
  status: SignatureStatus;
  /** Qui a signé, quand le prestataire le précise. */
  role?: "PHARMACY" | "AFFILIATE" | "COMPANY";
  occurredAt: Date;
};

export type SignatureTransition = SignatureProgressState & { status: SignatureStatus | "DRAFT" };

const CLOSED = new Set(["FINALIZED", "REFUSED", "EXPIRED"]);
const BEFORE_SIGNATURE: Record<string, number> = { DRAFT: 0, SENT: 1, OPENED: 2 };

/**
 * L'état suivant du contrat, ou `null` si l'événement ne le fait pas avancer
 * (doublon, événement en retard, contrat clos).
 *
 * - Une signature est notée une seule fois, à sa première date.
 * - La signature d'une partie alors que l'autre a déjà signé donne « signé par les deux ».
 * - « FINALIZED » annoncé par le prestataire (toutes les signatures recueillies) pose les deux dates manquantes.
 * - Refus et expiration closent le contrat tant qu'il n'est pas signé des deux côtés ; le premier fait de clôture l'emporte.
 */
export function nextSignatureState(current: SignatureProgressState, event: SignatureProgressEvent): SignatureTransition | null {
  if (CLOSED.has(current.status)) return null;
  const at = event.occurredAt;

  switch (event.status) {
    case "REFUSED":
    case "EXPIRED":
      return { ...current, status: event.status };
    case "SENT":
    case "OPENED": {
      const rank = BEFORE_SIGNATURE[current.status];
      if (rank === undefined || BEFORE_SIGNATURE[event.status] <= rank) return null;
      return { ...current, status: event.status };
    }
    case "SIGNED_PHARMACY":
    case "SIGNED_COMPANY": {
      const companySigned = event.status === "SIGNED_COMPANY" || event.role === "COMPANY";
      const firstPartySignedAt = companySigned ? current.firstPartySignedAt : (current.firstPartySignedAt ?? at);
      const companySignedAt = companySigned ? (current.companySignedAt ?? at) : current.companySignedAt;
      if (firstPartySignedAt === current.firstPartySignedAt && companySignedAt === current.companySignedAt) return null;
      const status: SignatureStatus = firstPartySignedAt && companySignedAt ? "FINALIZED" : firstPartySignedAt ? "SIGNED_PHARMACY" : "SIGNED_COMPANY";
      return { status, firstPartySignedAt, companySignedAt };
    }
    case "FINALIZED":
      return { status: "FINALIZED", firstPartySignedAt: current.firstPartySignedAt ?? at, companySignedAt: current.companySignedAt ?? at };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Ce que la console affiche
// ---------------------------------------------------------------------------

export type SignerState = "SIGNED" | "WAITING" | "NOT_YET" | "CLOSED";

export type SignerLine = {
  role: FirstParty | "COMPANY";
  label: string;
  name: string;
  email: string;
  state: SignerState;
  signedAt: Date | null;
};

const FIRST_PARTY_LABEL: Record<FirstParty, string> = { PHARMACY: "Titulaire", AFFILIATE: "Affilié" };

/**
 * Les deux signataires d'un contrat, dans l'ordre de signature, avec leur
 * état : signé (et quand), à qui c'est le tour, pas encore son tour, ou clos.
 */
export function signerLines(
  contract: { status: string; firstPartySignedAt: Date | null; companySignedAt: Date | null },
  firstParty: { role: FirstParty; name: string; email: string },
  company: { name: string; email: string },
): [SignerLine, SignerLine] {
  const closed = contract.status === "REFUSED" || contract.status === "EXPIRED";
  const draft = contract.status === "DRAFT";
  const first: SignerLine = {
    role: firstParty.role,
    label: FIRST_PARTY_LABEL[firstParty.role],
    name: firstParty.name,
    email: firstParty.email,
    signedAt: contract.firstPartySignedAt,
    state: contract.firstPartySignedAt ? "SIGNED" : closed ? "CLOSED" : draft ? "NOT_YET" : "WAITING",
  };
  const second: SignerLine = {
    role: "COMPANY",
    label: "PharmaBoost",
    name: company.name,
    email: company.email,
    signedAt: contract.companySignedAt,
    state: contract.companySignedAt ? "SIGNED" : closed ? "CLOSED" : contract.firstPartySignedAt ? "WAITING" : "NOT_YET",
  };
  return [first, second];
}

/** À contresigner par PharmaBoost : le premier signataire a signé, PharmaBoost pas encore. */
export function awaitsCountersignature(contract: { status: string }): boolean {
  return contract.status === "SIGNED_PHARMACY";
}

/** L'état lisible d'un contrat en double signature. */
export function doubleSignatureLabel(status: string, firstParty: FirstParty): string {
  const who = firstParty === "PHARMACY" ? "du titulaire" : "de l'affilié";
  switch (status) {
    case "DRAFT":
      return "Brouillon";
    case "SENT":
    case "OPENED":
      return `En attente ${who}`;
    case "SIGNED_PHARMACY":
      return "En attente de PharmaBoost";
    case "SIGNED_COMPANY":
      return `En attente ${who}`;
    case "FINALIZED":
      return "Signé par les deux";
    case "REFUSED":
      return "Refusé";
    case "EXPIRED":
      return "Expiré";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Le signataire PharmaBoost
// ---------------------------------------------------------------------------

/** La clé du réglage de la console : `{ email, name? }`. */
export const COUNTERSIGNER_SETTING_KEY = "contracts.countersigner";
/** Par défaut, la boîte de contact de PharmaBoost ; le fondateur la change dans Console → Contrats. */
export const DEFAULT_COUNTERSIGNER_EMAIL = "contact@pharmaboost.app";

export type Countersigner = { name: string; email: string; source: "CONSOLE" | "ENV" | "DEFAULT" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidSignerEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL.test(value.trim());
}

/**
 * Qui contresigne pour PharmaBoost : le réglage de la console, sinon la
 * variable d'environnement PHARMABOOST_COUNTERSIGNER_EMAIL, sinon
 * contact@pharmaboost.app. Le nom imprimé est celui du réglage, sinon le
 * représentant de la fiche Société.
 */
export function resolveCountersigner(stored: unknown, envEmail: string | null | undefined, representativeName: string | null | undefined): Countersigner {
  const row = stored && typeof stored === "object" ? (stored as { email?: unknown; name?: unknown }) : {};
  const storedName = typeof row.name === "string" && row.name.trim() ? row.name.trim() : null;
  const name = storedName ?? (representativeName?.trim() || "PharmaBoost");
  if (isValidSignerEmail(row.email)) return { name, email: row.email.trim().toLowerCase(), source: "CONSOLE" };
  if (isValidSignerEmail(envEmail)) return { name, email: envEmail.trim().toLowerCase(), source: "ENV" };
  return { name, email: DEFAULT_COUNTERSIGNER_EMAIL, source: "DEFAULT" };
}
