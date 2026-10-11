import { createHash } from "node:crypto";
import { isPlacement, type SponsoredPlacement } from "./campaign";

/**
 * Les compteurs des campagnes sponsorisées : agrégés par jour et par emplacement, SANS personne.
 *
 * Ce que l'écran envoie : un type d'événement, une campagne, un emplacement. Ce qui est écrit : +1 sur la ligne du
 * jour (campagne × emplacement × jour). Aucun identifiant de personne ni de session n'est stocké. Pour qu'un même
 * écran rechargé ne gonfle pas les chiffres, un événement n'est compté qu'une fois par session, par jour, par
 * campagne et emplacement : la clé de ce dédoublonnage est une empreinte (SHA-256) gardée en mémoire seulement,
 * jamais écrite en base.
 */

export const SPONSORED_EVENT_KINDS = ["impression", "click", "view", "training_started", "training_completed", "info_request"] as const;
export type SponsoredEventKind = (typeof SPONSORED_EVENT_KINDS)[number];

export const EVENT_COLUMN: Record<SponsoredEventKind, "impressions" | "clicks" | "views" | "trainingsStarted" | "trainingsCompleted" | "infoRequests"> = {
  impression: "impressions",
  click: "clicks",
  view: "views",
  training_started: "trainingsStarted",
  training_completed: "trainingsCompleted",
  info_request: "infoRequests",
};

export type SponsoredEvent = { kind: SponsoredEventKind; campaignId: string; placement: SponsoredPlacement };

/** Au plus ce nombre d'événements par envoi : au-delà, l'envoi est tronqué (un écran n'en produit jamais autant). */
export const MAX_EVENTS_PER_BATCH = 40;

/** Garde ce qui est bien formé, sans doublon dans le lot, et au plus MAX_EVENTS_PER_BATCH. */
export function sanitizeEvents(raw: unknown): SponsoredEvent[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SponsoredEvent[] = [];
  for (const item of raw.slice(0, MAX_EVENTS_PER_BATCH * 2)) {
    if (!item || typeof item !== "object") continue;
    const { kind, campaignId, placement } = item as Record<string, unknown>;
    if (typeof kind !== "string" || !(SPONSORED_EVENT_KINDS as readonly string[]).includes(kind)) continue;
    if (typeof campaignId !== "string" || !/^[a-z0-9]{8,40}$/i.test(campaignId)) continue;
    if (!isPlacement(placement)) continue;
    const key = `${kind}|${campaignId}|${placement}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: kind as SponsoredEventKind, campaignId, placement });
    if (out.length >= MAX_EVENTS_PER_BATCH) break;
  }
  return out;
}

/** Le jour comptable (UTC, minuit) d'un instant : la colonne `day` est une date. */
export function statDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** L'empreinte de dédoublonnage : on ne peut pas remonter à la session depuis elle, et elle change chaque jour. */
export function dedupeKey(sessionSecret: string, event: SponsoredEvent, day: Date): string {
  return createHash("sha256").update(`${sessionSecret}|${day.toISOString().slice(0, 10)}|${event.kind}|${event.campaignId}|${event.placement}`).digest("hex");
}

/**
 * Mémoire du dédoublonnage, par instance. Bornée : au-delà de `max` empreintes, les plus anciennes partent (une
 * perte de mémoire ne fait que compter un doublon de plus, jamais une personne).
 */
export class DedupeMemory {
  private readonly seen = new Map<string, number>();
  constructor(private readonly max = 50_000, private readonly ttlMs = 26 * 60 * 60 * 1000) {}

  /** Vrai la première fois qu'une empreinte est vue (l'événement est à compter). */
  firstTime(key: string, now = Date.now()): boolean {
    const at = this.seen.get(key);
    if (at !== undefined && now - at < this.ttlMs) return false;
    this.seen.set(key, now);
    if (this.seen.size > this.max) {
      const overflow = this.seen.size - this.max;
      let removed = 0;
      for (const oldKey of this.seen.keys()) {
        this.seen.delete(oldKey);
        if (++removed >= overflow) break;
      }
    }
    return true;
  }
}

export type StatRow = {
  campaignId: string;
  placement: SponsoredPlacement;
  day: Date;
  impressions: number;
  clicks: number;
  views: number;
  trainingsStarted: number;
  trainingsCompleted: number;
  infoRequests: number;
};

export type StatTotals = Omit<StatRow, "campaignId" | "placement" | "day"> & {
  /** Taux de clic (clics / impressions), null sans impression. */
  ctr: number | null;
};

const ZERO = { impressions: 0, clicks: 0, views: 0, trainingsStarted: 0, trainingsCompleted: 0, infoRequests: 0 };

export function totalsOf(rows: Pick<StatRow, keyof typeof ZERO>[]): StatTotals {
  const sum = { ...ZERO };
  for (const row of rows) for (const key of Object.keys(ZERO) as (keyof typeof ZERO)[]) sum[key] += row[key];
  return { ...sum, ctr: sum.impressions > 0 ? sum.clicks / sum.impressions : null };
}

/** Regroupe des lignes par une clé (emplacement, campagne, jour…) et totalise chaque groupe. */
export function groupTotals<K extends string>(rows: StatRow[], keyOf: (row: StatRow) => K): { key: K; totals: StatTotals }[] {
  const groups = new Map<K, StatRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, totals: totalsOf(list) }));
}

export const STAT_PERIODS = [
  { key: "7j", label: "7 jours", days: 7 },
  { key: "30j", label: "30 jours", days: 30 },
  { key: "90j", label: "90 jours", days: 90 },
  { key: "tout", label: "Depuis le début", days: null },
] as const;
export type StatPeriodKey = (typeof STAT_PERIODS)[number]["key"];

export function isStatPeriod(value: unknown): value is StatPeriodKey {
  return typeof value === "string" && STAT_PERIODS.some((period) => period.key === value);
}

/** Le premier jour inclus d'une période (null : depuis le début). */
export function periodStart(period: StatPeriodKey, now: Date): Date | null {
  const days = STAT_PERIODS.find((entry) => entry.key === period)?.days ?? null;
  if (days === null) return null;
  const start = statDay(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

export function formatCtr(ctr: number | null): string {
  if (ctr === null) return "—";
  return `${(ctr * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: ctr > 0 && ctr < 0.1 ? 1 : 0 })} %`;
}
