/**
 * Les primes accordées par le titulaire à un collaborateur — règles pures.
 *
 * PharmaBoost ne verse rien : il CONSIGNE une décision du titulaire. Une prime naît « proposée », le titulaire la
 * valide, puis la marque versée ; il peut l'annuler tant qu'elle n'est pas versée. Le collaborateur ne voit QUE les
 * primes validées ou versées : jamais une proposition, jamais une prime annulée, jamais un montant estimé.
 */

export const BONUS_STATUSES = ["PROPOSED", "VALIDATED", "PAID", "CANCELLED"] as const;
export type BonusStatusCode = (typeof BONUS_STATUSES)[number];

export const BONUS_STATUS_LABELS: Record<BonusStatusCode, string> = {
  PROPOSED: "Proposée",
  VALIDATED: "Validée",
  PAID: "Versée",
  CANCELLED: "Annulée",
};

/** Ce qu'un collaborateur a le droit de voir de ses primes. */
export const COLLABORATOR_VISIBLE_BONUS_STATUSES: readonly BonusStatusCode[] = ["VALIDATED", "PAID"];

export function visibleToCollaborator(status: string): boolean {
  return (COLLABORATOR_VISIBLE_BONUS_STATUSES as readonly string[]).includes(status);
}

export type BonusDecision = "VALIDATE" | "PAY" | "CANCEL";

const NEXT: Record<BonusStatusCode, Partial<Record<BonusDecision, BonusStatusCode>>> = {
  PROPOSED: { VALIDATE: "VALIDATED", CANCEL: "CANCELLED" },
  VALIDATED: { PAY: "PAID", CANCEL: "CANCELLED" },
  PAID: {},
  CANCELLED: {},
};

/** Le statut suivant, ou null si le geste n'a pas de sens (verser une prime non validée, rouvrir une prime versée…). */
export function nextBonusStatus(current: string, decision: BonusDecision): BonusStatusCode | null {
  return NEXT[current as BonusStatusCode]?.[decision] ?? null;
}

export function isBonusDecision(value: unknown): value is BonusDecision {
  return value === "VALIDATE" || value === "PAY" || value === "CANCEL";
}

/** 5 000 € : garde-fou contre une saisie en centimes prise pour des euros. */
export const MAX_BONUS_CENTS = 500_000;

/** « 25 », « 25,50 », « 25.5 € » → centimes. Null si illisible, nul ou hors bornes. */
export function parseEuros(raw: string): number | null {
  const cleaned = raw.replace(/[\s €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents >= 1 && cents <= MAX_BONUS_CENTS ? cents : null;
}

export function validateBonusLabel(raw: string): string | null {
  const label = raw.trim().replace(/\s+/g, " ");
  return label.length >= 3 && label.length <= 80 ? label : null;
}

/** Le total des primes visibles d'un collaborateur, séparé en validées (à venir) et versées. */
export function bonusTotals(rows: { status: string; amountCents: number }[]): { validatedCents: number; paidCents: number } {
  let validatedCents = 0;
  let paidCents = 0;
  for (const row of rows) {
    if (row.status === "VALIDATED") validatedCents += row.amountCents;
    else if (row.status === "PAID") paidCents += row.amountCents;
  }
  return { validatedCents, paidCents };
}

/** Seul le titulaire de l'officine (rôle OWNER) fixe des objectifs aux autres et décide des primes. */
export function canManageTeam(role: string | null | undefined): boolean {
  return role === "OWNER";
}
