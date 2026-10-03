import type { StatusTone } from "./statuses";

/**
 * La frise d'une officine : tous les faits datés venus de sources différentes
 * (dossier commercial, contrats, Stripe, e-mails, notes, résiliation, accès),
 * ramenés à une même forme, du plus récent au plus ancien.
 */
export type TimelineKind = "dossier" | "contrat" | "abonnement" | "paiement" | "email" | "note" | "resiliation" | "acces" | "technique" | "tarif" | "commercial";

export const TIMELINE_KIND_LABELS: Record<TimelineKind, string> = {
  dossier: "Dossier",
  contrat: "Contrat",
  abonnement: "Abonnement",
  paiement: "Paiement",
  email: "E-mail",
  note: "Note",
  resiliation: "Résiliation",
  acces: "Accès",
  technique: "Technique",
  tarif: "Tarif",
  commercial: "Commercial",
};

export type TimelineEntry = {
  /** Unique toutes sources confondues : « source:id ». */
  id: string;
  at: Date;
  kind: TimelineKind;
  title: string;
  detail?: string | null;
  actor?: string | null;
  tone?: StatusTone;
  href?: string | null;
};

/** Fusionne, dédoublonne (même identifiant) et trie du plus récent au plus ancien. */
export function mergeTimeline(groups: TimelineEntry[][], limit = 200): TimelineEntry[] {
  const byId = new Map<string, TimelineEntry>();
  for (const group of groups) for (const entry of group) if (!byId.has(entry.id) && !Number.isNaN(entry.at.getTime())) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id)).slice(0, limit);
}

/** Regroupe par jour (fuseau de Paris), dans l'ordre reçu. */
export function groupTimelineByDay(entries: TimelineEntry[], timeZone = "Europe/Paris"): { day: string; label: string; entries: TimelineEntry[] }[] {
  const keyOf = new Intl.DateTimeFormat("fr-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const labelOf = new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const out: { day: string; label: string; entries: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const day = keyOf.format(entry.at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else out.push({ day, label: labelOf.format(entry.at), entries: [entry] });
  }
  return out;
}

/** Ne garde que certains types, pour le filtre de la frise. */
export function filterTimeline(entries: TimelineEntry[], kinds: TimelineKind[] | null): TimelineEntry[] {
  if (!kinds || kinds.length === 0) return entries;
  const allowed = new Set(kinds);
  return entries.filter((e) => allowed.has(e.kind));
}
