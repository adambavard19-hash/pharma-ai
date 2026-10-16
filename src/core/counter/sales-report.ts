/**
 * La preuve de ce que PharmaBoost apporte au comptoir, calculée à partir des seules VENTES TERMINÉES (« Vente terminée » au
 * poste) : combien de ventes, combien ont reçu au moins un conseil vendu (l'objectif : 10 % au minimum), combien de conseils
 * vendus, et le chiffre d'affaires qu'ils ont ajouté — par jour, par semaine, par mois. Tout est déclaratif (« Vendu » au
 * comptoir) et daté de la fin de la vente. Module pur : aucune base, l'heure de Paris passée en paramètre.
 */

/** Une vente terminée, telle que la base la garde. */
export type ClosedSale = {
  id: string;
  /** La référence de la vente (« V-0007 », lue « Vente 007 »). */
  reference?: string;
  closedAt: Date;
  /** Qui l'a faite : le collaborateur du comptoir, à défaut le nom du comptoir. */
  who: string;
  boxes: string[];
  proposed: number;
  sold: number;
  notSold: number;
  unanswered: number;
  /** Les conseils vendus : nom et prix de vente TTC (centimes). */
  soldItems: { name: string; priceCents: number; marginCents: number | null }[];
  emailSent: boolean;
};

export type SalesReportPeriod = "day" | "week" | "month";
export const SALES_REPORT_PERIODS: { key: SalesReportPeriod; label: string; param: string }[] = [
  { key: "day", label: "Aujourd'hui", param: "jour" },
  { key: "week", label: "7 derniers jours", param: "semaine" },
  { key: "month", label: "30 derniers jours", param: "mois" },
];
/** Le minimum promis : au moins 10 % des ventes terminées repartent avec un conseil vendu. */
export const ATTACH_TARGET = 0.1;

export type ReportBucket = { key: string; label: string; sales: number; withAdvice: number; sold: number; revenueCents: number };

export type SalesReport = {
  period: SalesReportPeriod | "range";
  /** « Aujourd'hui », « Cette semaine », « Le 16 octobre 2026 », « Octobre 2026 »… */
  label: string;
  /** La période telle qu'elle passe dans l'adresse (« jour », « 2026-10-16 », « 2026-10 »). */
  param: string;
  /** Les cases du détail : par heure (un jour), sinon par jour. */
  byHour: boolean;
  from: Date;
  to: Date;
  sales: number;
  /** Ventes terminées avec au moins un conseil vendu. */
  withAdvice: number;
  /** withAdvice / sales ; null sans vente. */
  attachRate: number | null;
  meetsTarget: boolean | null;
  proposed: number;
  sold: number;
  notSold: number;
  unanswered: number;
  /** « Vendu » parmi les conseils tranchés. */
  conversionRate: number | null;
  revenueCents: number;
  marginCents: number;
  /** Chiffre d'affaires ajouté par vente terminée. */
  revenuePerSaleCents: number | null;
  buckets: ReportBucket[];
  byPerson: { who: string; sales: number; withAdvice: number; sold: number; revenueCents: number }[];
  topProducts: { name: string; sold: number; revenueCents: number }[];
  emailsSent: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** La date à Paris (« AAAA-MM-JJ ») et l'heure d'un instant. */
function parisParts(date: Date, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("fr-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Minuit (heure de Paris) du jour d'un instant. */
export function parisMidnight(date: Date, timeZone: string): Date {
  const { day } = parisParts(date, timeZone);
  // Le décalage de Paris ce jour-là, pour que « minuit » soit bien minuit à l'officine (heure d'été comprise).
  const guess = new Date(`${day}T00:00:00Z`);
  const offsetHours = parisParts(guess, timeZone).hour;
  const offset = offsetHours > 12 ? offsetHours - 24 : offsetHours;
  return new Date(guess.getTime() - offset * 60 * 60 * 1000);
}

/** La fenêtre d'une période qui se termine maintenant : aujourd'hui depuis minuit, 7 jours ou 30 jours (aujourd'hui compris). */
export function reportWindow(period: SalesReportPeriod, now: Date, timeZone: string): { from: Date; to: Date } {
  const today = parisMidnight(now, timeZone);
  const days = period === "day" ? 0 : period === "week" ? 6 : 29;
  return { from: parisMidnight(new Date(today.getTime() - days * DAY_MS + 12 * 60 * 60 * 1000), timeZone), to: now };
}

const dayLabel = (day: string) => {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
};

export function buildSalesReport(input: { period?: SalesReportPeriod; range?: ReportRange; sales: ClosedSale[]; now: Date; timeZone: string }): SalesReport {
  const period = input.period ?? "week";
  const range = input.range ?? resolveReportRange(SALES_REPORT_PERIODS.find((entry) => entry.key === period)?.param ?? "semaine", input.now, input.timeZone);
  const { from, to } = range;
  const byHour = range.byHour;
  const inWindow = input.sales.filter((sale) => sale.closedAt >= from && sale.closedAt <= to);

  // Les cases du graphique : les heures d'ouverture pour « aujourd'hui », sinon un jour par case.
  const buckets = new Map<string, ReportBucket>();
  if (byHour) {
    for (let hour = 7; hour <= 21; hour += 1) buckets.set(String(hour), { key: String(hour), label: `${hour} h`, sales: 0, withAdvice: 0, sold: 0, revenueCents: 0 });
  } else {
    for (let at = from.getTime() + 12 * 60 * 60 * 1000; at <= to.getTime() + 12 * 60 * 60 * 1000; at += DAY_MS) {
      const { day } = parisParts(new Date(at), input.timeZone);
      if (!buckets.has(day)) buckets.set(day, { key: day, label: dayLabel(day), sales: 0, withAdvice: 0, sold: 0, revenueCents: 0 });
    }
  }

  const people = new Map<string, SalesReport["byPerson"][number]>();
  const products = new Map<string, SalesReport["topProducts"][number]>();
  let withAdvice = 0;
  let proposed = 0;
  let sold = 0;
  let notSold = 0;
  let unanswered = 0;
  let revenueCents = 0;
  let marginCents = 0;
  let emailsSent = 0;

  for (const sale of inWindow) {
    const revenue = sale.soldItems.reduce((sum, item) => sum + Math.max(0, item.priceCents), 0);
    const hasAdvice = sale.sold > 0;
    proposed += sale.proposed;
    sold += sale.sold;
    notSold += sale.notSold;
    unanswered += sale.unanswered;
    revenueCents += revenue;
    marginCents += sale.soldItems.reduce((sum, item) => sum + Math.max(0, item.marginCents ?? 0), 0);
    if (hasAdvice) withAdvice += 1;
    if (sale.emailSent) emailsSent += 1;

    const parts = parisParts(sale.closedAt, input.timeZone);
    let key = byHour ? String(Math.min(21, Math.max(7, parts.hour))) : parts.day;
    if (!buckets.has(key)) key = [...buckets.keys()].at(-1) ?? key;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.sales += 1;
      bucket.sold += sale.sold;
      bucket.revenueCents += revenue;
      if (hasAdvice) bucket.withAdvice += 1;
    }

    const person = people.get(sale.who) ?? { who: sale.who, sales: 0, withAdvice: 0, sold: 0, revenueCents: 0 };
    person.sales += 1;
    person.sold += sale.sold;
    person.revenueCents += revenue;
    if (hasAdvice) person.withAdvice += 1;
    people.set(sale.who, person);

    for (const item of sale.soldItems) {
      const product = products.get(item.name) ?? { name: item.name, sold: 0, revenueCents: 0 };
      product.sold += 1;
      product.revenueCents += Math.max(0, item.priceCents);
      products.set(item.name, product);
    }
  }

  const sales = inWindow.length;
  const attachRate = sales > 0 ? withAdvice / sales : null;
  const decided = sold + notSold;
  return {
    period: input.range ? "range" : period,
    label: range.label,
    param: range.param,
    byHour,
    from,
    to,
    sales,
    withAdvice,
    attachRate,
    meetsTarget: attachRate === null ? null : attachRate >= ATTACH_TARGET,
    proposed,
    sold,
    notSold,
    unanswered,
    conversionRate: decided > 0 ? sold / decided : null,
    revenueCents,
    marginCents,
    revenuePerSaleCents: sales > 0 ? Math.round(revenueCents / sales) : null,
    buckets: [...buckets.values()],
    byPerson: [...people.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.sales - a.sales),
    topProducts: [...products.values()].sort((a, b) => b.sold - a.sold || b.revenueCents - a.revenueCents).slice(0, 8),
    emailsSent,
  };
}

/** Le rapport tel qu'il traverse vers le navigateur : les dates en texte. */
export type SalesReportView = Omit<SalesReport, "from" | "to"> & { from: string; to: string };

export const toSalesReportView = (report: SalesReport): SalesReportView => ({ ...report, from: report.from.toISOString(), to: report.to.toISOString() });

/** « 12,5 % » ; « — » sans mesure. */
export function percent(rate: number | null): string {
  return rate === null ? "—" : `${(Math.round(rate * 1000) / 10).toLocaleString("fr-FR")} %`;
}

/** « 1 234,50 € ». */
export function euros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

// ---------------------------------------------------------------------------------------------------------------------
// Les périodes du rapport (console de PharmaBoost, 16 oct. 2026) : aujourd'hui, hier, cette semaine, ce mois-ci, 7 et
// 30 derniers jours, un jour précis (« 2026-10-16 »), un mois précis (« 2026-10 »). Toujours à l'heure de Paris, jamais
// au-delà de maintenant.
// ---------------------------------------------------------------------------------------------------------------------

export type ReportRange = { param: string; label: string; from: Date; to: Date; byHour: boolean };

export const RANGE_CHIPS: { param: string; label: string }[] = [
  { param: "jour", label: "Aujourd'hui" },
  { param: "hier", label: "Hier" },
  { param: "semaine-en-cours", label: "Cette semaine" },
  { param: "semaine-derniere", label: "Semaine dernière" },
  { param: "mois-en-cours", label: "Ce mois-ci" },
  { param: "semaine", label: "7 derniers jours" },
  { param: "mois", label: "30 derniers jours" },
];

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Minuit (Paris) d'une date du calendrier « AAAA-MM-JJ ». */
function midnightOf(day: string, timeZone: string): Date {
  return parisMidnight(new Date(`${day}T12:00:00Z`), timeZone);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** La période d'une adresse ; une valeur inconnue ou douteuse retombe sur les 7 derniers jours. */
export function resolveReportRange(raw: string | string[] | undefined | null, now: Date, timeZone: string): ReportRange {
  const param = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const today = parisParts(now, timeZone).day;
  const chip = (key: string) => RANGE_CHIPS.find((entry) => entry.param === key)?.label ?? key;
  const clamp = (to: Date) => (to.getTime() > now.getTime() ? now : to);
  switch (param) {
    case "jour":
      return { param, label: chip(param), from: midnightOf(today, timeZone), to: now, byHour: true };
    case "hier": {
      const day = addDays(today, -1);
      return { param, label: chip(param), from: midnightOf(day, timeZone), to: new Date(midnightOf(today, timeZone).getTime() - 1), byHour: true };
    }
    case "semaine-en-cours": {
      // Lundi de cette semaine (à Paris).
      const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
      const monday = addDays(today, -((weekday + 6) % 7));
      return { param, label: chip(param), from: midnightOf(monday, timeZone), to: now, byHour: false };
    }
    case "semaine-derniere": {
      // Du lundi au dimanche de la semaine civile précédente (à Paris) — celle du bilan hebdomadaire des titulaires.
      const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
      const monday = addDays(today, -((weekday + 6) % 7) - 7);
      return { param, label: chip(param), from: midnightOf(monday, timeZone), to: new Date(midnightOf(addDays(monday, 7), timeZone).getTime() - 1), byHour: false };
    }
    case "mois-en-cours":
      return { param, label: chip(param), from: midnightOf(`${today.slice(0, 7)}-01`, timeZone), to: now, byHour: false };
    case "mois":
      return { param, label: chip(param), ...reportWindow("month", now, timeZone), byHour: false };
    case "semaine":
      return { param, label: chip(param), ...reportWindow("week", now, timeZone), byHour: false };
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(param);
  if (day && param <= today && !Number.isNaN(Date.parse(`${param}T12:00:00Z`)) && new Date(`${param}T12:00:00Z`).toISOString().slice(0, 10) === param) {
    const label = `Le ${Number(day[3])} ${MONTHS[Number(day[2]) - 1]} ${day[1]}`;
    return { param, label, from: midnightOf(param, timeZone), to: clamp(new Date(midnightOf(addDays(param, 1), timeZone).getTime() - 1)), byHour: true };
  }
  const month = /^(\d{4})-(\d{2})$/.exec(param);
  if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12 && param <= today.slice(0, 7)) {
    const next = Number(month[2]) === 12 ? `${Number(month[1]) + 1}-01-01` : `${month[1]}-${String(Number(month[2]) + 1).padStart(2, "0")}-01`;
    const label = `${MONTHS[Number(month[2]) - 1].replace(/^./, (c) => c.toUpperCase())} ${month[1]}`;
    return { param, label, from: midnightOf(`${param}-01`, timeZone), to: clamp(new Date(midnightOf(next, timeZone).getTime() - 1)), byHour: false };
  }
  return resolveReportRange("semaine", now, timeZone);
}

export function periodFromParam(value: string | string[] | undefined): SalesReportPeriod {
  const text = Array.isArray(value) ? value[0] : value;
  return SALES_REPORT_PERIODS.find((period) => period.param === text)?.key ?? "week";
}
