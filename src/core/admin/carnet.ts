import { z } from "zod";

/**
 * Le carnet du fondateur (29 oct. 2026 : « un endroit où noter tout ce qu'on doit faire, ce qui a été réalisé ou pas, les
 * rendez-vous à une heure, les clients à aller voir, les réunions… pour ne rien oublier »). Une seule liste pour l'équipe
 * PharmaBoost, gardée dans un réglage de la plateforme (PlatformSetting « admin.carnet ») : pas de table de plus.
 *
 * Module PUR : les types, la lecture sûre de ce qui est enregistré, et les vues (aujourd'hui, en retard, cette semaine).
 */

export const CARNET_SETTING_KEY = "admin.carnet";

export const CARNET_KINDS = [
  { key: "TACHE", label: "Tâche", tone: "#0E8A7B" },
  { key: "RDV", label: "Rendez-vous", tone: "#6B55D6" },
  { key: "CLIENT", label: "Client à voir", tone: "#D97706" },
  { key: "REUNION", label: "Réunion", tone: "#2563EB" },
  { key: "A_CORRIGER", label: "À corriger", tone: "#DC2626" },
  { key: "IDEE", label: "Idée", tone: "#A16207" },
] as const;
export type CarnetKind = (typeof CARNET_KINDS)[number]["key"];

export const CARNET_STATUSES = [
  { key: "A_FAIRE", label: "À faire" },
  { key: "EN_COURS", label: "En cours" },
  { key: "FAIT", label: "Fait" },
] as const;
export type CarnetStatus = (typeof CARNET_STATUSES)[number]["key"];

export const CARNET_PRIORITIES = [
  { key: "HAUTE", label: "Urgent" },
  { key: "NORMALE", label: "Normal" },
  { key: "BASSE", label: "Plus tard" },
] as const;
export type CarnetPriority = (typeof CARNET_PRIORITIES)[number]["key"];

export const CARNET_CATEGORIES = ["Logiciel", "Comptoir", "Commercial", "Pharmacies", "Partenaires", "Site", "Administratif", "Autre"] as const;

export const CARNET_LIMITS = { items: 1500, title: 160, notes: 4000, checklist: 30, checkText: 160, place: 120 } as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const checkSchema = z.object({ id: z.string().min(1).max(40), text: z.string().trim().min(1).max(CARNET_LIMITS.checkText), done: z.boolean() });

export const carnetItemSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1).max(CARNET_LIMITS.title),
  kind: z.enum(CARNET_KINDS.map((item) => item.key) as [CarnetKind, ...CarnetKind[]]),
  status: z.enum(CARNET_STATUSES.map((item) => item.key) as [CarnetStatus, ...CarnetStatus[]]),
  priority: z.enum(CARNET_PRIORITIES.map((item) => item.key) as [CarnetPriority, ...CarnetPriority[]]),
  category: z.string().trim().max(40).default("Autre"),
  /** Le jour prévu (AAAA-MM-JJ) ; vide : sans date. */
  due: z.string().regex(DATE).nullable().default(null),
  /** L'heure (HH:MM), pour un rendez-vous ou une réunion. */
  time: z.string().regex(TIME).nullable().default(null),
  /** Le lieu, la pharmacie ou la personne (« Pharmacie des Halles », « Visio avec NHCO »). */
  place: z.string().trim().max(CARNET_LIMITS.place).default(""),
  notes: z.string().max(CARNET_LIMITS.notes).default(""),
  checklist: z.array(checkSchema).max(CARNET_LIMITS.checklist).default([]),
  createdAt: z.string().max(40),
  doneAt: z.string().max(40).nullable().default(null),
  createdBy: z.string().max(80).default(""),
});
export type CarnetItem = z.infer<typeof carnetItemSchema>;

/** Ce qui se saisit (ou se modifie) : tout sauf l'identifiant et les dates de suivi. */
export const carnetDraftSchema = carnetItemSchema.pick({ title: true, kind: true, status: true, priority: true, category: true, due: true, time: true, place: true, notes: true, checklist: true }).partial({ status: true, priority: true, category: true, due: true, time: true, place: true, notes: true, checklist: true });
export type CarnetDraft = z.input<typeof carnetDraftSchema>;

/** Lit le carnet enregistré : une note illisible est écartée, jamais tout le carnet. */
export function readCarnet(value: unknown): CarnetItem[] {
  const list = value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : [];
  return list.flatMap((raw) => {
    const parsed = carnetItemSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}

/** « 2026-10-29 » pour une date, dans le fuseau de Paris (le carnet se lit en heure française). */
export function dayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return parts;
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type CarnetGroups = { late: CarnetItem[]; today: CarnetItem[]; week: CarnetItem[]; later: CarnetItem[]; undated: CarnetItem[] };

/** L'ordre d'une journée : d'abord ce qui a une heure, dans l'ordre des heures, puis l'urgent. */
export function compareItems(a: CarnetItem, b: CarnetItem): number {
  const rank = (item: CarnetItem) => ["HAUTE", "NORMALE", "BASSE"].indexOf(item.priority);
  return (a.due ?? "9999").localeCompare(b.due ?? "9999") || (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt);
}

/** Ce qui reste à faire, rangé : en retard, aujourd'hui, les 7 jours qui viennent, plus tard, sans date. */
export function groupOpen(items: readonly CarnetItem[], today: string): CarnetGroups {
  const open = items.filter((item) => item.status !== "FAIT").sort(compareItems);
  const weekEnd = addDays(today, 7);
  return {
    late: open.filter((item) => item.due !== null && item.due < today),
    today: open.filter((item) => item.due === today),
    week: open.filter((item) => item.due !== null && item.due > today && item.due <= weekEnd),
    later: open.filter((item) => item.due !== null && item.due > weekEnd),
    undated: open.filter((item) => item.due === null),
  };
}

/** Les chiffres du haut : à faire, en retard, aujourd'hui, faits ces 7 derniers jours. */
export function carnetStats(items: readonly CarnetItem[], today: string): { open: number; late: number; today: number; doneWeek: number } {
  const groups = groupOpen(items, today);
  const since = addDays(today, -7);
  return {
    open: items.filter((item) => item.status !== "FAIT").length,
    late: groups.late.length,
    today: groups.today.length,
    doneWeek: items.filter((item) => item.status === "FAIT" && item.doneAt !== null && item.doneAt.slice(0, 10) >= since).length,
  };
}

export const kindOf = (key: string) => CARNET_KINDS.find((item) => item.key === key) ?? CARNET_KINDS[0];
