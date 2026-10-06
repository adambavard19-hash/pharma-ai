import type { CommissionStatusCode } from "@/core/sales/pipeline";
import { TIME_ZONE } from "@/config/constants";

/**
 * Les commissions vues par la direction commerciale : les gestes permis, les
 * totaux et le filtre par mois.
 *
 * Module pur : ni base, ni horloge implicite. Les statuts reprennent
 * l'énumération Prisma `CommissionStatus`.
 *
 *   Prévisionnelle   (le contrat n'est pas finalisé : elle ne se valide ni ne se paie ;
 *                     elle devient « acquise » toute seule à la signature)
 *   Acquise ──valider──▶ À payer ──payer──▶ Payée      (« acquise » se paie aussi directement)
 *   (prévisionnelle, acquise, à payer) ──annuler──▶ Annulée   (motif obligatoire)
 */

export const COMMISSION_STATUSES = ["FORECAST", "EARNED", "PAYABLE", "PAID", "CANCELLED"] as const;

export function isCommissionStatus(value: unknown): value is CommissionStatusCode {
  return typeof value === "string" && (COMMISSION_STATUSES as readonly string[]).includes(value);
}

export type CommissionGesture = "VALIDATE" | "PAY" | "CANCEL";

export function isCommissionGesture(value: unknown): value is CommissionGesture {
  return value === "VALIDATE" || value === "PAY" || value === "CANCEL";
}

/** Les statuts de départ permis pour chaque geste, et le statut d'arrivée. */
const GESTURES: Record<CommissionGesture, { from: readonly CommissionStatusCode[]; to: CommissionStatusCode }> = {
  VALIDATE: { from: ["EARNED"], to: "PAYABLE" },
  PAY: { from: ["EARNED", "PAYABLE"], to: "PAID" },
  CANCEL: { from: ["FORECAST", "EARNED", "PAYABLE"], to: "CANCELLED" },
};

export const COMMISSION_GESTURE_LABELS: Record<CommissionGesture, string> = {
  VALIDATE: "Valider",
  PAY: "Marquer payée",
  CANCEL: "Annuler",
};

export function commissionGestureTarget(gesture: CommissionGesture): CommissionStatusCode {
  return GESTURES[gesture].to;
}

/** Les gestes qu'on peut faire sur une commission, dans l'ordre où l'écran les propose. */
export function commissionGesturesFor(status: CommissionStatusCode): CommissionGesture[] {
  return (["VALIDATE", "PAY", "CANCEL"] as const).filter((gesture) => GESTURES[gesture].from.includes(status));
}

const REFUSED: Record<CommissionGesture, Partial<Record<CommissionStatusCode, string>>> = {
  VALIDATE: { FORECAST: "Cette commission n'est que prévisionnelle : elle devient acquise à la signature du contrat, et seulement alors elle peut être validée.", PAYABLE: "Cette commission est déjà à payer.", PAID: "Cette commission est déjà payée.", CANCELLED: "Cette commission est annulée." },
  PAY: { FORECAST: "Cette commission n'est que prévisionnelle : le contrat n'est pas finalisé.", PAID: "Cette commission est déjà payée.", CANCELLED: "Cette commission est annulée." },
  CANCEL: { PAID: "Une commission payée ne s'annule pas.", CANCELLED: "Cette commission est déjà annulée." },
};

export type CommissionMove = { ok: true; to: CommissionStatusCode } | { ok: false; error: string };

export function applyCommissionGesture(from: CommissionStatusCode, gesture: CommissionGesture): CommissionMove {
  const rule = GESTURES[gesture];
  if (rule.from.includes(from)) return { ok: true, to: rule.to };
  return { ok: false, error: REFUSED[gesture][from] ?? "Ce geste n'est pas possible sur cette commission." };
}

// ------------------------------------------------------------------ Totaux

export type StatusTotal = { count: number; cents: number };
export type StatusTotals = Record<CommissionStatusCode, StatusTotal>;

export type RepTotal = {
  salesRepId: string;
  count: number;
  /** Acquises : à valider. */
  earnedCents: number;
  /** À payer. */
  payableCents: number;
  paidCents: number;
  /** Tout sauf l'annulé : ce que cette personne a généré. */
  totalCents: number;
};

export type CommissionSummary = { byStatus: StatusTotals; byRep: RepTotal[] };

/**
 * Les totaux par statut et par commercial, à partir de groupes déjà comptés
 * (un groupe par couple commercial / statut). Les commissions annulées figurent
 * dans leur propre statut mais ne comptent dans aucun total de commercial.
 */
export function summarizeCommissions(groups: { salesRepId: string; status: string; count: number; cents: number }[]): CommissionSummary {
  const byStatus = Object.fromEntries(COMMISSION_STATUSES.map((status) => [status, { count: 0, cents: 0 }])) as StatusTotals;
  const reps = new Map<string, RepTotal>();

  for (const group of groups) {
    if (!isCommissionStatus(group.status)) continue;
    byStatus[group.status].count += group.count;
    byStatus[group.status].cents += group.cents;
    if (group.status === "CANCELLED") continue;
    const rep = reps.get(group.salesRepId) ?? { salesRepId: group.salesRepId, count: 0, earnedCents: 0, payableCents: 0, paidCents: 0, totalCents: 0 };
    rep.count += group.count;
    rep.totalCents += group.cents;
    if (group.status === "EARNED") rep.earnedCents += group.cents;
    if (group.status === "PAYABLE") rep.payableCents += group.cents;
    if (group.status === "PAID") rep.paidCents += group.cents;
    reps.set(group.salesRepId, rep);
  }

  return { byStatus, byRep: [...reps.values()].sort((a, b) => b.totalCents - a.totalCents || a.salesRepId.localeCompare(b.salesRepId)) };
}

// -------------------------------------------------------------------- Mois

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `?mois=2026-10` : un mois valide, ou `null`. */
export function parseMonthParam(value: string | null | undefined): string | null {
  const match = value ? MONTH_PATTERN.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 2020 && year <= 2100 ? `${match[1]}-${match[2]}` : null;
}

/** Minuit, heure de Paris, au premier jour du mois (`month` de 1 à 12), en instant UTC. */
function parisMonthStart(year: number, month: number): Date {
  const wallClock = Date.UTC(year, month - 1, 1);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(wallClock));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  // Le changement d'heure n'a jamais lieu un 1er du mois : un seul calcul de décalage suffit.
  const offset = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - wallClock;
  return new Date(wallClock - offset);
}

/** Les bornes d'un mois civil, heure de Paris : début inclus, fin exclue. */
export function monthBounds(month: string): { start: Date; end: Date } | null {
  const valid = parseMonthParam(month);
  if (!valid) return null;
  const [year, number] = valid.split("-").map(Number);
  const nextYear = number === 12 ? year + 1 : year;
  const nextMonth = number === 12 ? 1 : number + 1;
  return { start: parisMonthStart(year, number), end: parisMonthStart(nextYear, nextMonth) };
}

const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « octobre 2026 » */
export function monthLabel(month: string): string {
  const valid = parseMonthParam(month);
  if (!valid) return month;
  const [year, number] = valid.split("-").map(Number);
  return `${MONTH_NAMES[number - 1]} ${year}`;
}

/** Les `count` derniers mois, du plus récent au plus ancien, jusqu'au mois de `now` inclus (heure de Paris). */
export function recentMonths(now: Date, count = 12): string[] {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric" }).formatToParts(now);
  let year = Number(parts.find((part) => part.type === "year")?.value);
  let month = Number(parts.find((part) => part.type === "month")?.value);
  const months: string[] = [];
  for (let index = 0; index < count; index += 1) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return months;
}
