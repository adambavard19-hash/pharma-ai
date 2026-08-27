import { CURRENCY, LOCALE } from "@/config/constants";

/**
 * Formatage français. Les montants sont manipulés en CENTIMES dans tout le
 * produit : aucun calcul monétaire n'est effectué en nombre flottant.
 */

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat(LOCALE);

const percentFormatter = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

/** Format compact pour les grands nombres : `12,4 k €`. */
export function formatCentsCompact(cents: number): string {
  if (Math.abs(cents) < 100_000) return currencyFormatter.format(cents / 100);
  return compactCurrencyFormatter.format(cents / 100);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** `value` exprimé en fraction (0.42) → `42 %`. */
export function formatPercent(value: number): string {
  return percentFormatter.format(value);
}

/** `value` exprimé en points (42) → `42 %`. */
export function formatPercentPoints(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace(".", ",").replace(/,0$/, "")} %`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateLong(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Écart lisible : « il y a 3 minutes », « hier ». */
export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";

  const diffMs = Date.now() - d.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (Math.abs(diffMinutes) < 1) return "à l'instant";
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) return rtf.format(-diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(-diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return rtf.format(-diffDays, "day");
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return rtf.format(-diffMonths, "month");
  return rtf.format(-Math.round(diffMonths / 12), "year");
}

export function formatAge(birthDate: Date | string | null | undefined): string {
  if (!birthDate) return "—";
  const d = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  if (Number.isNaN(d.getTime())) return "—";
  const years = computeAge(d);
  return years === null ? "—" : `${years} ans`;
}

export function computeAge(birthDate: Date | string | null | undefined): number | null {
  if (!birthDate) return null;
  const d = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDelta = now.getMonth() - d.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function formatFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName.toUpperCase()}`.trim();
}

/** Marge en centimes et taux, à partir des prix d'achat et de vente. */
export function computeMargin(
  purchasePriceCents: number,
  salePriceCents: number,
): { marginCents: number; marginRate: number | null } {
  const marginCents = salePriceCents - purchasePriceCents;
  const marginRate = salePriceCents > 0 ? marginCents / salePriceCents : null;
  return { marginCents, marginRate };
}

/** Convertit une saisie utilisateur « 12,90 » en centimes. */
export function parseAmountToCents(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Convertit des centimes en chaîne éditable « 12,90 ». */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count > 1 ? (plural ?? `${singular}s`) : singular;
}
