import type { Prisma } from "@/generated/prisma";
import type { TimelineEntry, TimelineKind } from "@/core/admin/timeline";
import { parisDayInputToDate, parisDayKey } from "@/core/sales/board";
import { PROSPECT_STATUSES, type ProspectStatusCode } from "@/core/sales/pipeline";

/**
 * L'équipe commerciale vue par le directeur : les règles pures (recherche,
 * état de l'invitation, saisie de la commission, ce qui empêche une
 * suppression, fil d'activité). Ni base, ni horloge implicite : « maintenant »
 * est toujours passé par l'appelant.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** La fenêtre de « ce qu'il a fait ». */
/** Le plus de dossiers qu'une attribution confie d'un coup (le serveur ignore le reste ; l'écran ne dépasse pas non plus). */
export const REASSIGN_MAX = 100;

export const ACTIVITY_DAYS = 30;

/** Le nombre de gestes que la fiche affiche ; au-delà, elle le dit. */
export const ACTIVITY_LIMIT = 60;

export function activitySince(now: Date, days = ACTIVITY_DAYS): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** Minuit, heure de Paris, le 1er du mois en cours : le début de « ce mois-ci ». */
export function parisMonthStart(now: Date): Date {
  const key = parisDayKey(now);
  return parisDayInputToDate(`${key.slice(0, 8)}01`, "00:00") ?? new Date(now.getFullYear(), now.getMonth(), 1);
}

// ---- Invitation -----------------------------------------------------------------

export type InvitationKind = "NEVER" | "SENT" | "CONNECTED";

/**
 * Où en est l'accès d'un commercial : jamais invité, invité sans s'être
 * encore connecté, ou déjà connecté (l'invitation a servi, quoi qu'il en soit
 * de sa date).
 */
export function invitationKind(rep: { invitedAt: Date | null; lastLoginAt: Date | null }): InvitationKind {
  if (rep.lastLoginAt) return "CONNECTED";
  return rep.invitedAt ? "SENT" : "NEVER";
}

// ---- Recherche et filtre --------------------------------------------------------

export const TEAM_STATUS_FILTERS = ["actifs", "inactifs"] as const;
export type TeamStatusFilter = (typeof TEAM_STATUS_FILTERS)[number];

/** Le filtre de l'adresse (`?statut=`) ; une valeur inconnue ne filtre rien. */
export function parseTeamStatus(value: string | null | undefined): TeamStatusFilter | null {
  return TEAM_STATUS_FILTERS.find((status) => status === value) ?? null;
}

/** Chaque mot saisi doit se retrouver dans le prénom, le nom, l'e-mail ou la zone. */
export function teamSearchWhere(q: string | null | undefined): Prisma.SalesRepWhereInput {
  const tokens = (q ?? "").trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 5);
  if (tokens.length === 0) return {};
  return {
    AND: tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: "insensitive" } },
        { lastName: { contains: token, mode: "insensitive" } },
        { email: { contains: token, mode: "insensitive" } },
        { zone: { contains: token, mode: "insensitive" } },
      ],
    })),
  };
}

// ---- Commission : saisie et aide ------------------------------------------------

export const COMMISSION_TYPES = ["FIXED", "PERCENT", "RECURRING"] as const;
export type CommissionTypeKey = (typeof COMMISSION_TYPES)[number];

/** Les plafonds stockés : centimes (FIXED, RECURRING) ou centièmes de pour cent (PERCENT). */
export const COMMISSION_MAX: Record<CommissionTypeKey, number> = { FIXED: 10_000_000, RECURRING: 10_000_000, PERCENT: 10_000 };

export const COMMISSION_OPTIONS: Record<CommissionTypeKey, { label: string; unit: string; help: string }> = {
  FIXED: { label: "Montant fixe par officine", unit: "€", help: "Une somme fixe, versée pour chaque officine qui s'abonne. Exemple : 250 €." },
  PERCENT: { label: "Pourcentage de la première année", unit: "%", help: "Une part de ce que paie l'officine la première année. Exemple : 10 %." },
  RECURRING: { label: "Montant mensuel pendant 12 mois", unit: "€ par mois", help: "Une somme versée chaque mois, pendant les 12 premiers mois. Exemple : 25 € par mois." },
};

/**
 * La saisie « 250 », « 250,50 » ou « 12,5 » lue en valeur stockée : centimes
 * pour un montant, centièmes de pour cent pour un pourcentage. `null` si la
 * saisie est illisible, négative ou au-dessus du plafond.
 */
export function parseCommissionInput(type: CommissionTypeKey, text: string): number | null {
  const clean = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const stored = Math.round(Number(clean) * 100);
  return Number.isFinite(stored) && stored >= 0 && stored <= COMMISSION_MAX[type] ? stored : null;
}

/** L'inverse : la valeur stockée, écrite comme on la saisit (« 250 », « 12,5 »). */
export function commissionInputFromStored(stored: number): string {
  return String(stored / 100).replace(".", ",");
}

// ---- Suppression ----------------------------------------------------------------

export type RepFootprint = { prospects: number; commissions: number; invoices: number; tasks: number };

export const HISTORY_REFUSAL = "Ce commercial a un historique : désactivez-le ou réaffectez ses dossiers.";

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Ce que le commercial a laissé derrière lui, en clair : « 3 dossiers, 2 commissions ». Vide s'il n'a rien. */
export function footprintParts(footprint: RepFootprint): string[] {
  return [
    footprint.prospects > 0 ? plural(footprint.prospects, "dossier", "dossiers") : null,
    footprint.commissions > 0 ? plural(footprint.commissions, "commission", "commissions") : null,
    footprint.invoices > 0 ? plural(footprint.invoices, "facture", "factures") : null,
    footprint.tasks > 0 ? plural(footprint.tasks, "tâche", "tâches") : null,
  ].filter((part): part is string => part !== null);
}

/** Le refus de suppression, avec le détail ; `null` quand le commercial n'a aucun historique et peut être supprimé. */
export function deletionRefusal(footprint: RepFootprint): string | null {
  const parts = footprintParts(footprint);
  return parts.length === 0 ? null : `${HISTORY_REFUSAL} À son nom : ${parts.join(", ")}.`;
}

// ---- Portefeuille ---------------------------------------------------------------

/** Les dossiers rangés par étape, dans l'ordre du pipeline ; les étapes vides sont omises. */
export function groupByStage<T extends { status: string }>(items: T[]): { status: ProspectStatusCode; items: T[] }[] {
  return PROSPECT_STATUSES.map((status) => ({ status, items: items.filter((item) => item.status === status) })).filter((group) => group.items.length > 0);
}

// ---- Fil d'activité -------------------------------------------------------------

/**
 * Les événements de dossier que le directeur voit : l'avancée des dossiers,
 * les notes, les relances, les commissions. Jamais ce qui touche aux contrats
 * (envoi, ouverture, signature, relances, PDF) ni aux e-mails : le directeur
 * suit l'équipe, il ne lit pas les pièces.
 */
export const ACTIVITY_EVENT_TYPES = [
  "CREATED",
  "STATUS_CHANGED",
  "NOTE",
  "PHARMACY_CREATED",
  "COMMISSION_CREATED",
  "COMMISSION_UPDATED",
  "COMMISSION_PAID",
  "TASK_CREATED",
  "TASK_DONE",
  "ASSIGNED",
  "BLOCKED",
  "UNBLOCKED",
  "SUBSCRIPTION_REQUESTED",
] as const;

function activityKind(type: string): TimelineKind {
  if (type === "NOTE") return "note";
  if (type.startsWith("COMMISSION") || type.startsWith("TASK") || type === "ASSIGNED") return "commercial";
  if (type.startsWith("SUBSCRIPTION")) return "abonnement";
  return "dossier";
}

export type ActivityEventRow = { id: string; type: string; summary: string; actorType: string; actorLabel: string | null; createdAt: Date; prospect: { name: string } };

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Un événement de dossier, prêt pour la frise : l'officine en détail, l'auteur dessous. */
export function activityEntry(event: ActivityEventRow): TimelineEntry {
  const isNote = event.type === "NOTE";
  // Le texte d'une note n'est montré que s'il a été écrit par le commercial lui-même ; une note de la console ou du
  // système (qui peut citer un échange avec l'officine) se résume à son existence.
  const ownNote = isNote && event.actorType === "SALES";
  return {
    id: `event:${event.id}`,
    at: event.createdAt,
    kind: activityKind(event.type),
    title: isNote ? (ownNote ? "Note ajoutée" : "Note ajoutée par l'équipe") : event.summary,
    detail: ownNote ? `${event.prospect.name} : ${clip(event.summary, 240)}` : event.prospect.name,
    actor: event.actorLabel,
  };
}
