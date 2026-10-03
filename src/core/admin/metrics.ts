/**
 * Les chiffres du cockpit dirigeant, calculés à partir de faits lus en base.
 *
 * Module pur : aucune horloge (« maintenant » est toujours passé par
 * l'appelant), aucun accès base. Les bornes de jour, de semaine et de mois se
 * calculent dans le fuseau de la société (Europe/Paris), changement d'heure
 * compris : une semaine qui commencerait le dimanche à 23 h fausserait les
 * tranches.
 *
 * Aucun chiffre n'est extrapolé : une série sans donnée reste à zéro, un taux
 * sans dénominateur vaut `null` (affiché « — »), jamais 0 % ni 100 %.
 */
import { TIME_ZONE } from "@/config/constants";
import { addDays, calendarDay, daysBetween, zonedDayStart, type DayKey } from "@/core/challenges/dates";
import { contractualPrice } from "@/core/billing/contract-price";
import { hasUnpaidFailure } from "@/core/admin/automations";
import { stockFreshness } from "@/core/stock/connectors";

// ---------------------------------------------------------------- Seuils communs

/** Un essai « se termine bientôt » dans les 7 jours. */
export const TRIAL_ENDING_SOON_DAYS = 7;
/** Une officine est « inactive » quand aucun compte ne s'est connecté depuis 14 jours. */
export const INACTIVE_AFTER_DAYS = 14;
/** Un prospect est « sans réponse » sans contact depuis 14 jours. */
export const NO_REPLY_AFTER_DAYS = 14;
/** Un lien de signature « expire bientôt » dans les 7 jours. */
export const CONTRACT_EXPIRY_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export function daysAfter(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

// ---------------------------------------------------------------- Jours, périodes, tranches

export type DateRange = { start: Date; end: Date };

/** Aujourd'hui, de minuit (inclus) à minuit (exclu), heure de Paris. */
export function todayRange(now: Date, timeZone: string = TIME_ZONE): DateRange {
  const today = calendarDay(now, timeZone);
  return { start: zonedDayStart(today, timeZone), end: zonedDayStart(addDays(today, 1), timeZone) };
}

/** « Aujourd'hui ou dans les N jours » : d'aujourd'hui minuit au soir du Nᵉ jour (minuit suivant, exclu). */
export function upcomingDaysRange(now: Date, days: number, timeZone: string = TIME_ZONE): DateRange {
  const today = calendarDay(now, timeZone);
  return { start: zonedDayStart(today, timeZone), end: zonedDayStart(addDays(today, days + 1), timeZone) };
}

/** Une période du sélecteur (« 30 jours », « 3 mois », « 12 mois ») : sa clé et son nombre de jours. */
export type CockpitPeriod = { value: string; days: number };

export type Granularity = "week" | "month";

/** Par semaine jusqu'à un trimestre, par mois au-delà : assez de barres pour lire une tendance, pas trop pour les lire. */
export function granularityOf(period: CockpitPeriod): Granularity {
  return period.days > 120 ? "month" : "week";
}

/**
 * La période d'un indicateur : les N derniers jours calendaires, aujourd'hui
 * compris, de minuit du premier jour jusqu'à maintenant.
 */
export function periodRange(period: CockpitPeriod, now: Date, timeZone: string = TIME_ZONE): DateRange {
  const first = addDays(calendarDay(now, timeZone), -(Math.max(1, period.days) - 1));
  return { start: zonedDayStart(first, timeZone), end: now };
}

/** Une tranche d'un graphique : `start` inclus, `end` exclu (sauf la dernière, qui s'arrête à maintenant inclus). */
export type Bucket = { key: DayKey; label: string; start: Date; end: Date };

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function dayParts(day: DayKey): { year: number; month: number; date: number } {
  const [year, month, date] = day.split("-").map(Number);
  return { year, month, date };
}

/** Le lundi qui suit ce jour (le lundi suivant si c'est déjà un lundi). */
function nextMonday(day: DayKey): DayKey {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(day, (8 - weekday) % 7 || 7);
}

function firstOfNextMonth(day: DayKey): DayKey {
  const { year, month } = dayParts(day);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

function bucketLabel(day: DayKey, granularity: Granularity): string {
  const { year, month, date } = dayParts(day);
  if (granularity === "month") return `${MONTHS[month - 1]} ${String(year).slice(2)}`;
  return `${String(date).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

/**
 * Les tranches d'un graphique, qui recouvrent exactement la période de
 * l'indicateur : la somme des barres égale le chiffre de la tuile. Semaines du
 * lundi au dimanche, mois calendaires ; la première et la dernière tranche
 * peuvent être partielles.
 */
export function buckets(period: CockpitPeriod, now: Date, timeZone: string = TIME_ZONE): Bucket[] {
  const granularity = granularityOf(period);
  const today = calendarDay(now, timeZone);
  let cursor = addDays(today, -(Math.max(1, period.days) - 1));
  const list: Bucket[] = [];
  while (daysBetween(cursor, today) >= 0) {
    const next = granularity === "week" ? nextMonday(cursor) : firstOfNextMonth(cursor);
    const last = daysBetween(next, today) < 0;
    list.push({ key: cursor, label: bucketLabel(cursor, granularity), start: zonedDayStart(cursor, timeZone), end: last ? now : zonedDayStart(next, timeZone) });
    cursor = next;
  }
  return list;
}

/** La tranche qui contient cet instant, ou -1 s'il est hors des tranches. */
export function bucketIndexOf(date: Date, list: Bucket[]): number {
  const time = date.getTime();
  for (let i = 0; i < list.length; i++) {
    const bucket = list[i];
    const last = i === list.length - 1;
    if (time >= bucket.start.getTime() && (last ? time <= bucket.end.getTime() : time < bucket.end.getTime())) return i;
  }
  return -1;
}

export function isWithin(date: Date | null | undefined, range: DateRange): boolean {
  if (!date) return false;
  const time = date.getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
}

/** Un point de graphique : même forme que celle des graphiques du kit. */
export type SeriesPoint = { label: string; value: number };

/** Combien d'évènements par tranche. Les dates absentes ou hors période sont ignorées. */
export function countSeries(dates: (Date | null | undefined)[], list: Bucket[]): SeriesPoint[] {
  const counts = list.map(() => 0);
  for (const date of dates) {
    if (!date) continue;
    const index = bucketIndexOf(date, list);
    if (index >= 0) counts[index] += 1;
  }
  return list.map((bucket, i) => ({ label: bucket.label, value: counts[i] }));
}

// ---------------------------------------------------------------- MRR reconstitué

export type MrrSubscriptionFact = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  canceledAt: Date | null;
  endedAt: Date | null;
  contractPriceCents: number | null;
  planMonthlyPriceCents: number;
};

export type PaymentFact = { subscriptionId: string; status: string; paidAt: Date | null };

export type PriceChangeFact = { subscriptionId: string; previousCents: number | null; effectiveAt: Date };

const TERMINAL_STATUSES = new Set(["CANCELED", "INCOMPLETE_EXPIRED"]);

/**
 * L'instant où un abonnement cesse de compter dans le MRR : sa résiliation
 * (demandée ou effective), la première des deux dates. Comme le MRR affiché,
 * qui exclut les résiliations programmées, une demande de fin sort le client
 * du revenu récurrent dès qu'elle est posée. Une fiche résiliée sans aucune
 * date (antérieure à la synchronisation) prend sa dernière mise à jour, seule
 * borne connue.
 */
export function subscriptionEndAt(sub: Pick<MrrSubscriptionFact, "status" | "updatedAt" | "canceledAt" | "endedAt">): Date | null {
  const dates = [sub.canceledAt, sub.endedAt].filter((d): d is Date => d instanceof Date);
  if (dates.length > 0) return new Date(Math.min(...dates.map((d) => d.getTime())));
  return TERMINAL_STATUSES.has(sub.status) ? sub.updatedAt : null;
}

/** Le premier paiement encaissé de chaque abonnement. */
export function firstPaidAtBySubscription(payments: PaymentFact[]): Map<string, Date> {
  const first = new Map<string, Date>();
  for (const payment of payments) {
    if (payment.status !== "PAID" || !payment.paidAt) continue;
    const known = first.get(payment.subscriptionId);
    if (!known || payment.paidAt.getTime() < known.getTime()) first.set(payment.subscriptionId, payment.paidAt);
  }
  return first;
}

/**
 * Le tarif contractuel en vigueur à l'instant `at` : le tarif actuel, sauf
 * modification tracée après cet instant, dont on reprend l'ancien montant.
 * `changes` ne contient que les modifications de cet abonnement.
 */
export function priceAt(sub: Pick<MrrSubscriptionFact, "contractPriceCents" | "planMonthlyPriceCents">, changes: PriceChangeFact[], at: Date): number {
  let firstLater: PriceChangeFact | null = null;
  for (const change of changes) {
    if (change.effectiveAt.getTime() <= at.getTime()) continue;
    if (!firstLater || change.effectiveAt.getTime() < firstLater.effectiveAt.getTime()) firstLater = change;
  }
  if (firstLater) return firstLater.previousCents ?? sub.planMonthlyPriceCents;
  return contractualPrice({ contractPriceCents: sub.contractPriceCents }, { monthlyPriceCents: sub.planMonthlyPriceCents }).cents;
}

/** Un abonnement compte dans le MRR à l'instant `at` : créé, pas encore terminé, et déjà payé une fois. */
export function countsInMrrAt(sub: MrrSubscriptionFact, firstPaidAt: Date | undefined, at: Date): boolean {
  const time = at.getTime();
  if (sub.createdAt.getTime() > time) return false;
  if (!firstPaidAt || firstPaidAt.getTime() > time) return false;
  const end = subscriptionEndAt(sub);
  return !end || end.getTime() > time;
}

function groupChanges(changes: PriceChangeFact[]): Map<string, PriceChangeFact[]> {
  const bySubscription = new Map<string, PriceChangeFact[]>();
  for (const change of changes) {
    const list = bySubscription.get(change.subscriptionId) ?? [];
    list.push(change);
    bySubscription.set(change.subscriptionId, list);
  }
  return bySubscription;
}

/** Le MRR à un instant donné, reconstitué à partir des abonnements et de leurs dates. */
export function mrrAt(subscriptions: MrrSubscriptionFact[], payments: PaymentFact[], at: Date, changes: PriceChangeFact[] = []): number {
  const firstPaid = firstPaidAtBySubscription(payments);
  const bySubscription = groupChanges(changes);
  return subscriptions.reduce((sum, sub) => (countsInMrrAt(sub, firstPaid.get(sub.id), at) ? sum + priceAt(sub, bySubscription.get(sub.id) ?? [], at) : sum), 0);
}

/**
 * L'évolution du MRR : à chaque fin de tranche, la somme des tarifs
 * contractuels (en vigueur à cette date) des abonnements créés, non terminés
 * et ayant déjà un paiement encaissé.
 */
export function mrrSeries(subscriptions: MrrSubscriptionFact[], payments: PaymentFact[], list: Bucket[], changes: PriceChangeFact[] = []): SeriesPoint[] {
  const firstPaid = firstPaidAtBySubscription(payments);
  const bySubscription = groupChanges(changes);
  return list.map((bucket) => ({
    label: bucket.label,
    value: subscriptions.reduce((sum, sub) => (countsInMrrAt(sub, firstPaid.get(sub.id), bucket.end) ? sum + priceAt(sub, bySubscription.get(sub.id) ?? [], bucket.end) : sum), 0),
  }));
}

// ---------------------------------------------------------------- Conversion, résiliations, retards

export type TrialConversion = { ended: number; converted: number; rate: number | null };

/**
 * La conversion essai → abonnement : parmi les essais terminés dans la
 * période (fin d'essai passée), la part devenue payante (active ou en retard
 * de paiement, mais abonnée). Aucun essai terminé : pas de taux.
 */
export function conversionRate(subscriptions: { trialEndsAt: Date | null; status: string }[], range: DateRange, now: Date): TrialConversion {
  const until = Math.min(range.end.getTime(), now.getTime());
  const ended = subscriptions.filter((sub) => sub.trialEndsAt && sub.trialEndsAt.getTime() >= range.start.getTime() && sub.trialEndsAt.getTime() <= until);
  const converted = ended.filter((sub) => sub.status === "ACTIVE" || sub.status === "PAST_DUE").length;
  return { ended: ended.length, converted, rate: ended.length > 0 ? converted / ended.length : null };
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)} %`;
}

/** Un départ de client vu par une source : la fin Stripe d'un abonnement ou une demande de résiliation confirmée. */
export type CancellationFact = { key: string; at: Date | null };

/**
 * La date de départ de chaque client : quand deux sources parlent du même
 * départ (demande confirmée, puis fin chez Stripe), seule la première date
 * compte. Le cockpit et la liste des abonnements lisent tous deux cette date.
 */
export function firstCancellationByKey(facts: CancellationFact[]): Map<string, Date> {
  const first = new Map<string, Date>();
  for (const fact of facts) {
    if (!fact.at) continue;
    const known = first.get(fact.key);
    if (!known || fact.at.getTime() < known.getTime()) first.set(fact.key, fact.at);
  }
  return first;
}

/** Les résiliations de la période, une par client, à sa première date (voir `firstCancellationByKey`). */
export function cancellationDates(facts: CancellationFact[], range: DateRange): Date[] {
  return [...firstCancellationByKey(facts).values()].filter((date) => isWithin(date, range)).sort((a, b) => a.getTime() - b.getTime());
}

/** En retard de paiement : statut Stripe en retard ou impayé, ou échec qu'aucun paiement n'a suivi. */
export function isPaymentLate(sub: { status: string; lastPaymentAt: Date | null; lastPaymentFailedAt: Date | null }): boolean {
  if (sub.status === "PAST_DUE" || sub.status === "UNPAID") return true;
  return hasUnpaidFailure(sub);
}

/**
 * Un connecteur de stock demande une intervention : en erreur, déconnecté, ou
 * relié mais silencieux (stock périmé ou agent muet). Un connecteur en attente
 * d'appairage n'est pas une panne.
 */
export function connectorNeedsAttention(connection: { status: string; lastSyncAt: Date | null; lastSeenAt: Date | null; intervalSeconds: number }, now: Date): boolean {
  if (connection.status === "PENDING") return false;
  if (connection.status === "ERROR" || connection.status === "DISCONNECTED") return true;
  return stockFreshness({ lastSyncAt: connection.lastSyncAt, lastSeenAt: connection.lastSeenAt, intervalSeconds: connection.intervalSeconds, now }).state !== "FRESH";
}

/**
 * Un incident technique compte dans les erreurs à traiter, sauf s'il concerne
 * une officine de démonstration. Un incident sans officine compte toujours.
 * Même règle au cockpit et sur l'état technique.
 */
export function countsAsIncident(incident: { pharmacyId: string | null }, demoPharmacyIds: ReadonlySet<string>): boolean {
  return !incident.pharmacyId || !demoPharmacyIds.has(incident.pharmacyId);
}

/**
 * Les erreurs de l'état technique (`/admin/technique?filtre=erreurs`) :
 * connecteurs à vérifier, postes en erreur d'export, incidents ouverts, sans
 * les officines de démonstration. Le total est celui de la carte « Alertes
 * techniques » du cockpit.
 */
export function technicalErrors<C extends { needsAttention: boolean }, P extends { inError: boolean }, I extends { pharmacyId: string | null }>(
  data: { connectors: C[]; counterPosts: P[]; incidents: I[] },
  demoPharmacyIds: ReadonlySet<string>,
): { connectors: C[]; posts: P[]; incidents: I[]; total: number } {
  const connectors = data.connectors.filter((connector) => connector.needsAttention);
  const posts = data.counterPosts.filter((post) => post.inError);
  const incidents = data.incidents.filter((incident) => countsAsIncident(incident, demoPharmacyIds));
  return { connectors, posts, incidents, total: connectors.length + posts.length + incidents.length };
}

// ---------------------------------------------------------------- « À traiter »

export type AttentionTone = "danger" | "warning" | "info" | "brand";

const TONE_ORDER: Record<AttentionTone, number> = { danger: 0, warning: 1, brand: 2, info: 3 };

/** Rouge d'abord, puis orange : l'ordre de déclaration est gardé à couleur égale. */
export function orderAttention<T extends { tone: AttentionTone }>(cards: T[]): T[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => TONE_ORDER[a.card.tone] - TONE_ORDER[b.card.tone] || a.index - b.index)
    .map(({ card }) => card);
}

/** Le total des cartes « À traiter » : les cartes à zéro n'ajoutent rien. */
export function attentionTotal(cards: { count: number }[]): number {
  return cards.reduce((sum, card) => sum + Math.max(0, card.count), 0);
}

export function attentionHeadline(total: number): string {
  if (total <= 0) return "Rien ne requiert votre attention";
  return total === 1 ? "1 action nécessite votre attention" : `${total} actions nécessitent votre attention`;
}

// ---------------------------------------------------------------- « Aujourd'hui »

export type TodayKind = "demo" | "relance" | "contrat" | "essai" | "facture";

export type TodayItem = {
  id: string;
  kind: TodayKind;
  at: Date;
  /** `time` : l'heure compte (démo, relance) ; `day` : seul le jour compte (fin d'essai, facture, échéance). */
  precision: "time" | "day";
  title: string;
  detail?: string;
  /** Une précision d'état (« Réalisée »), affichée en badge. */
  status?: string;
  href: string;
};

const KIND_ORDER: Record<TodayKind, number> = { demo: 0, relance: 1, contrat: 2, essai: 3, facture: 4 };

/** Par ordre chronologique ; à heure égale, les démonstrations d'abord. */
export function sortTodayItems(items: TodayItem[]): TodayItem[] {
  return [...items].sort((a, b) => a.at.getTime() - b.at.getTime() || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
}

/** « 14:30 » à Paris. */
export function formatTime(date: Date, timeZone: string = TIME_ZONE): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}

/** « Samedi 3 octobre 2026 », à Paris. */
export function formatLongDate(date: Date, timeZone: string = TIME_ZONE): string {
  const text = new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « Aujourd'hui », « Demain », sinon « lun. 5 oct. », à Paris. */
export function formatDayShort(date: Date, now: Date, timeZone: string = TIME_ZONE): string {
  const delta = daysBetween(calendarDay(now, timeZone), calendarDay(date, timeZone));
  if (delta === 0) return "Aujourd'hui";
  if (delta === 1) return "Demain";
  return new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(date);
}
