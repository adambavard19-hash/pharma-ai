import "server-only";
import { prisma } from "@/server/db/client";
import type { NotificationSeverity, Prisma, ProspectEventType } from "@/generated/prisma";
import { automationRule } from "@/core/admin/automations";
import { emailTemplate } from "@/core/admin/email-templates";
import { DISPATCH_KIND_LABELS, DISPATCH_TRIGGER_LABELS, dispatchStatusLabel, type StatusLabel } from "@/core/admin/statuses";

/**
 * L'historique des communications de la console : e-mails (tous, y compris
 * transactionnels), notifications de l'équipe, relances du moteur qui n'ont
 * pas abouti, actions commerciales. Quatre sources ramenées à une même ligne,
 * du plus récent au plus ancien.
 *
 * Chaque fait n'apparaît qu'une fois : les événements commerciaux de type
 * e-mail ne sont pas repris (l'e-mail est déjà dans `EmailDispatch`), ni les
 * relances parties par e-mail, ni les alertes internes du moteur (la
 * notification de l'équipe les porte déjà, avec son titre et son lien).
 * Aucune donnée de santé : uniquement des échanges commerciaux et de service.
 */

// ---------------------------------------------------------------- Types et libellés

export const COMMUNICATION_TYPES = {
  email: "E-mails",
  notification: "Notifications de l'équipe",
  relance: "Relances non abouties",
  commercial: "Actions commerciales",
} as const;

export type CommunicationType = keyof typeof COMMUNICATION_TYPES;

export function isCommunicationType(value: string | null | undefined): value is CommunicationType {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(COMMUNICATION_TYPES, value as string);
}

export type CommunicationEntry = {
  /** Unique toutes sources confondues : « source:id ». */
  id: string;
  type: CommunicationType;
  at: Date;
  title: string;
  detail: string | null;
  recipient: string | null;
  /** E-mails : Automatique, Manuel, Test, Système. */
  trigger: string | null;
  /** La règle d'automatisation à l'origine, en clair. */
  ruleLabel: string | null;
  status: StatusLabel & { code: string };
  pharmacyId: string | null;
  pharmacyName: string | null;
  prospectId: string | null;
  /** Où ouvrir l'élément concerné. */
  href: string | null;
  actor: string | null;
};

/**
 * Les filtres de statut, et ce qu'ils retiennent dans chaque source. Une
 * source absente d'un filtre n'a rien à montrer pour ce filtre.
 */
export const COMMUNICATION_STATUS_FILTERS = {
  envoye: { label: "Envoyés", codes: { email: ["SENT", "DELIVERED", "DELAYED"] } },
  echec: { label: "En échec", codes: { email: ["FAILED", "BOUNCED", "COMPLAINED"], relance: ["FAILED"] } },
  simule: { label: "Non transmis", codes: { email: ["SIMULATED"] } },
  "non-lue": { label: "Non lues", codes: { notification: ["UNREAD"] } },
  lue: { label: "Lues", codes: { notification: ["READ"] } },
  ignoree: { label: "Ignorées", codes: { relance: ["SKIPPED"] } },
} as const satisfies Record<string, { label: string; codes: Partial<Record<CommunicationType, readonly string[]>> }>;

export type CommunicationStatusFilter = keyof typeof COMMUNICATION_STATUS_FILTERS;

export function isStatusFilter(value: string | null | undefined): value is CommunicationStatusFilter {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(COMMUNICATION_STATUS_FILTERS, value as string);
}

/** Les codes retenus par un filtre de statut pour une source ; `null` sans filtre ; tableau vide si la source n'a rien pour ce filtre. */
export function statusCodesFor(statut: CommunicationStatusFilter | null, type: CommunicationType): readonly string[] | null {
  if (!statut) return null;
  const codes = COMMUNICATION_STATUS_FILTERS[statut].codes as Partial<Record<CommunicationType, readonly string[]>>;
  return codes[type] ?? [];
}

/** Les filtres de statut qui ont un sens pour un type (tous, sans type). */
export function statusFiltersFor(type: CommunicationType | null): CommunicationStatusFilter[] {
  return (Object.keys(COMMUNICATION_STATUS_FILTERS) as CommunicationStatusFilter[]).filter((key) => !type || (statusCodesFor(key, type)?.length ?? 0) > 0);
}

/**
 * `?declencheur=automatique` : ce que la plateforme a fait d'elle-même — les
 * e-mails automatiques (relances, cadence des contrats), les relances du
 * moteur, et les alertes que le moteur a levées pour l'équipe. Les actions
 * commerciales en sont exclues.
 */
export const COMMUNICATION_TRIGGERS = {
  automatique: { label: "Automatiques", emailTrigger: "AUTOMATIC" },
} as const;

export type CommunicationTrigger = keyof typeof COMMUNICATION_TRIGGERS;

/** Les notifications levées par le moteur des relances portent ce préfixe de type. */
export const ENGINE_NOTIFICATION_TYPE_PREFIX = "AUTOMATION_";

/** `?nature=relance-contrat` : une famille d'e-mails, par leur type d'envoi. Les autres sources en sont exclues. */
export const COMMUNICATION_NATURES = {
  "relance-contrat": { label: "Relances de contrat", kinds: ["CONTRACT_REMINDER"] },
  campagne: { label: "Campagnes", kinds: ["CAMPAIGN"] },
} as const satisfies Record<string, { label: string; kinds: readonly string[] }>;

export type CommunicationNature = keyof typeof COMMUNICATION_NATURES;

const isKeyOf = <T extends object>(table: T, value: string | null | undefined): value is Extract<keyof T, string> => Boolean(value) && Object.prototype.hasOwnProperty.call(table, value as string);

/** Les actions commerciales reprises dans l'historique : pas les e-mails, déjà tracés à part. */
export const COMMERCIAL_EVENT_TYPES = ["NOTE", "STATUS_CHANGED", "TASK_CREATED", "TASK_DONE", "ASSIGNED", "CONTRACT_SIGNED", "CONTRACT_REFUSED"] as const satisfies readonly ProspectEventType[];

const COMMERCIAL_EVENT_LABELS: Record<(typeof COMMERCIAL_EVENT_TYPES)[number], StatusLabel> = {
  NOTE: { label: "Note", tone: "neutral" },
  STATUS_CHANGED: { label: "Changement d'étape", tone: "info" },
  TASK_CREATED: { label: "Relance planifiée", tone: "brand" },
  TASK_DONE: { label: "Relance faite", tone: "success" },
  ASSIGNED: { label: "Attribution", tone: "neutral" },
  CONTRACT_SIGNED: { label: "Contrat signé", tone: "success" },
  CONTRACT_REFUSED: { label: "Contrat refusé", tone: "danger" },
};

export const AUTOMATION_DISPATCH_STATUS: Record<string, StatusLabel> = {
  SENT: { label: "Envoyé", tone: "info" },
  FAILED: { label: "Échec", tone: "danger" },
  SIMULATED: { label: "Non transmis (messagerie non configurée)", tone: "warning" },
  INTERNAL: { label: "Alerte interne", tone: "brand" },
  SKIPPED: { label: "Ignorée", tone: "warning" },
  SENDING: { label: "En cours d'envoi", tone: "neutral" },
};

export function automationStatusLabel(status: string): StatusLabel {
  return AUTOMATION_DISPATCH_STATUS[status] ?? { label: status, tone: "neutral" };
}

export const NOTIFICATION_SEVERITY: Record<string, StatusLabel & { param: string }> = {
  INFO: { label: "Information", tone: "neutral", param: "info" },
  SUCCESS: { label: "Fait", tone: "success", param: "succes" },
  WARNING: { label: "À voir", tone: "warning", param: "a-voir" },
  CRITICAL: { label: "Urgent", tone: "danger", param: "urgent" },
};

/** `?severite=a-voir` → WARNING. Une valeur inconnue est ignorée. */
export function severityFromParam(value: string | null | undefined): NotificationSeverity | null {
  const found = Object.entries(NOTIFICATION_SEVERITY).find(([, s]) => s.param === value);
  return found ? (found[0] as NotificationSeverity) : null;
}

// ---------------------------------------------------------------- Filtres de l'adresse

const PERIOD_DAYS = { "30j": 30, "3m": 91, "12m": 365 } as const;
export type CommunicationPeriod = keyof typeof PERIOD_DAYS;

export type CommunicationFilters = {
  type: CommunicationType | null;
  statut: CommunicationStatusFilter | null;
  declencheur: CommunicationTrigger | null;
  nature: CommunicationNature | null;
  periode: CommunicationPeriod;
  days: number;
  officine: string | null;
  q: string | null;
  page: number;
};

export const COMMUNICATIONS_PER_PAGE = 50;
/** Au-delà, l'historique se consulte par officine ou par période : la fusion reste rapide. */
export const MAX_COMMUNICATION_PAGES = 20;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/** Lit les filtres de l'adresse ; toute valeur inconnue retombe sur la valeur par défaut. */
export function parseCommunicationFilters(params: Record<string, string | string[] | undefined>): CommunicationFilters {
  const type = first(params.type);
  const statut = first(params.statut);
  const declencheur = first(params.declencheur);
  const nature = first(params.nature);
  const periode = first(params.periode);
  const officine = first(params.officine)?.trim() ?? "";
  const q = first(params.q)?.trim() ?? "";
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  const period: CommunicationPeriod = periode && periode in PERIOD_DAYS ? (periode as CommunicationPeriod) : "30j";
  return {
    type: isCommunicationType(type) ? type : null,
    statut: isStatusFilter(statut) ? statut : null,
    declencheur: isKeyOf(COMMUNICATION_TRIGGERS, declencheur) ? declencheur : null,
    nature: isKeyOf(COMMUNICATION_NATURES, nature) ? nature : null,
    periode: period,
    days: PERIOD_DAYS[period],
    officine: /^[a-z0-9]{6,40}$/i.test(officine) ? officine : null,
    q: q ? q.slice(0, 120) : null,
    page: Number.isFinite(page) ? Math.min(MAX_COMMUNICATION_PAGES, Math.max(1, page)) : 1,
  };
}

// ---------------------------------------------------------------- Fonctions pures : mise en forme, fusion, filtre

export type EmailRow = { id: string; kind: string; recipient: string; status: string; detail: string | null; subject: string | null; templateKey: string | null; trigger: string | null; ruleKey: string | null; pharmacyId: string | null; prospectId: string | null; createdAt: Date };
export type NotificationRow = { id: string; type: string; severity: string; title: string; body: string; linkUrl: string | null; readAt: Date | null; createdAt: Date };
export type AutomationRow = { id: string; ruleKey: string; status: string; recipient: string | null; detail: string | null; pharmacyId: string | null; targetType: string; targetId: string; createdAt: Date };
export type ProspectEventRow = { id: string; type: string; summary: string; actorLabel: string | null; prospectId: string; createdAt: Date; prospect: { name: string; pharmacyId: string | null } };

const pharmacyHref = (pharmacyId: string) => `/admin/pharmacies/${pharmacyId}?onglet=communication`;

/**
 * La campagne d'un e-mail de campagne : son modèle de trace est « campaign:<id> ».
 * L'essai (« campaign:test ») n'appartient à aucune campagne : pas de lien.
 */
export function campaignIdOf(templateKey: string | null): string | null {
  const match = /^campaign:([A-Za-z0-9]{6,40})$/.exec(templateKey ?? "");
  return match ? match[1] : null;
}

/** Le libellé d'une règle : celles du centre des relances, plus la cadence des contrats. */
export function ruleLabelOf(ruleKey: string): string {
  if (ruleKey === "contract.reminders") return "Relances de contrat";
  return automationRule(ruleKey)?.label ?? ruleKey;
}

export function emailEntry(row: EmailRow, pharmacyNames: Map<string, string>): CommunicationEntry {
  const template = row.templateKey ? emailTemplate(row.templateKey) : null;
  const kindLabel = row.kind === "TEMPLATE" ? (template?.label ?? "Modèle") : (DISPATCH_KIND_LABELS[row.kind] ?? row.kind);
  const status = dispatchStatusLabel(row.status);
  const campaignId = row.kind === "CAMPAIGN" ? campaignIdOf(row.templateKey) : null;
  return {
    id: `email:${row.id}`,
    type: "email",
    at: row.createdAt,
    title: row.subject?.trim() || kindLabel,
    detail: row.subject?.trim() ? kindLabel : null,
    recipient: row.recipient,
    trigger: DISPATCH_TRIGGER_LABELS[row.trigger ?? "SYSTEM"] ?? row.trigger,
    ruleLabel: row.ruleKey ? ruleLabelOf(row.ruleKey) : null,
    status: { ...status, code: row.status },
    pharmacyId: row.pharmacyId,
    pharmacyName: row.pharmacyId ? (pharmacyNames.get(row.pharmacyId) ?? null) : null,
    prospectId: row.prospectId,
    // Un e-mail de campagne mène à sa campagne ; l'officine reste atteignable par sa colonne.
    href: campaignId ? `/admin/campagnes/${campaignId}` : row.pharmacyId ? pharmacyHref(row.pharmacyId) : row.prospectId ? `/admin/dossiers/${row.prospectId}` : null,
    actor: null,
  };
}

export function notificationEntry(row: NotificationRow): CommunicationEntry {
  const severity = NOTIFICATION_SEVERITY[row.severity] ?? NOTIFICATION_SEVERITY.INFO;
  return {
    id: `notification:${row.id}`,
    type: "notification",
    at: row.createdAt,
    title: row.title,
    detail: row.body || null,
    recipient: "Équipe PharmaBoost",
    trigger: null,
    ruleLabel: null,
    status: row.readAt ? { label: "Lue", tone: "neutral", code: "READ" } : { label: severity.label, tone: severity.tone, code: "UNREAD" },
    pharmacyId: null,
    pharmacyName: null,
    prospectId: null,
    href: row.linkUrl || "/admin/notifications",
    actor: null,
  };
}

export function automationEntry(row: AutomationRow, pharmacyNames: Map<string, string>): CommunicationEntry {
  const rule = automationRule(row.ruleKey);
  const status = automationStatusLabel(row.status);
  return {
    id: `relance:${row.id}`,
    type: "relance",
    at: row.createdAt,
    title: rule ? `Relance automatique — ${rule.label}` : `Relance automatique — ${row.ruleKey}`,
    detail: row.detail,
    recipient: row.recipient,
    trigger: "Automatique",
    ruleLabel: rule?.label ?? row.ruleKey,
    status: { ...status, code: row.status },
    pharmacyId: row.pharmacyId,
    pharmacyName: row.pharmacyId ? (pharmacyNames.get(row.pharmacyId) ?? null) : null,
    prospectId: row.targetType === "Prospect" ? row.targetId : null,
    // La cible d'une relance aux partenaires est la fiche du partenaire.
    href: row.pharmacyId ? pharmacyHref(row.pharmacyId) : row.targetType === "Prospect" ? `/admin/dossiers/${row.targetId}` : row.targetType === "Partner" ? `/admin/partenaires/liste/${row.targetId}` : "/admin/relances",
    actor: null,
  };
}

export function prospectEventEntry(row: ProspectEventRow, pharmacyNames: Map<string, string>): CommunicationEntry {
  const label = COMMERCIAL_EVENT_LABELS[row.type as (typeof COMMERCIAL_EVENT_TYPES)[number]] ?? { label: row.type, tone: "neutral" as const };
  const pharmacyId = row.prospect.pharmacyId;
  return {
    id: `commercial:${row.id}`,
    type: "commercial",
    at: row.createdAt,
    title: row.summary,
    detail: row.prospect.name,
    recipient: null,
    trigger: null,
    ruleLabel: null,
    status: { ...label, code: row.type },
    pharmacyId,
    pharmacyName: pharmacyId ? (pharmacyNames.get(pharmacyId) ?? row.prospect.name) : null,
    prospectId: row.prospectId,
    href: `/admin/dossiers/${row.prospectId}`,
    actor: row.actorLabel,
  };
}

/** Fusionne les sources, dédoublonne par identifiant, trie du plus récent au plus ancien. */
export function mergeCommunications(groups: CommunicationEntry[][], limit = Number.POSITIVE_INFINITY): CommunicationEntry[] {
  const byId = new Map<string, CommunicationEntry>();
  for (const group of groups) for (const entry of group) if (!byId.has(entry.id) && !Number.isNaN(entry.at.getTime())) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id)).slice(0, limit);
}

/**
 * Le même filtre qu'en base, appliqué en mémoire : type, statut, officine,
 * recherche (destinataire, objet, détail). Sert de garde-fou après la
 * fusion, et se teste sans base.
 */
export function filterCommunications(entries: CommunicationEntry[], filters: Pick<CommunicationFilters, "type" | "statut" | "q"> & { officine?: string | null; prospectId?: string | null; since?: Date | null }): CommunicationEntry[] {
  const q = filters.q?.toLocaleLowerCase("fr") ?? null;
  return entries.filter((entry) => {
    if (filters.type && entry.type !== filters.type) return false;
    if (filters.statut) {
      const codes = statusCodesFor(filters.statut, entry.type) ?? [];
      if (!codes.includes(entry.status.code)) return false;
    }
    if (filters.since && entry.at.getTime() < filters.since.getTime()) return false;
    if (filters.officine) {
      const linked = entry.pharmacyId === filters.officine || (filters.prospectId && entry.prospectId === filters.prospectId) || (entry.href?.includes(filters.officine) ?? false);
      if (!linked) return false;
    }
    if (q) {
      const haystack = [entry.title, entry.detail, entry.recipient, entry.pharmacyName].filter(Boolean).join(" ").toLocaleLowerCase("fr");
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Une page de l'historique fusionné. */
export function paginateCommunications(entries: CommunicationEntry[], page: number, perPage = COMMUNICATIONS_PER_PAGE): { rows: CommunicationEntry[]; hasMore: boolean; page: number } {
  const safePage = Math.max(1, Math.floor(page));
  const start = (safePage - 1) * perPage;
  return { rows: entries.slice(start, start + perPage), hasMore: entries.length > start + perPage, page: safePage };
}

// ---------------------------------------------------------------- Lecture en base

type Scope = {
  since: Date;
  officine: { pharmacyId: string; prospectId: string | null } | null;
  q: string | null;
  statut: CommunicationStatusFilter | null;
  declencheur: CommunicationTrigger | null;
  nature: CommunicationNature | null;
};

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

function emailWhere(scope: Scope): Prisma.EmailDispatchWhereInput | null {
  const codes = statusCodesFor(scope.statut, "email");
  if (codes && codes.length === 0) return null;
  const and: Prisma.EmailDispatchWhereInput[] = [{ createdAt: { gte: scope.since } }];
  if (codes) and.push({ status: { in: [...codes] } });
  if (scope.declencheur) and.push({ trigger: COMMUNICATION_TRIGGERS[scope.declencheur].emailTrigger });
  if (scope.nature) and.push({ kind: { in: [...COMMUNICATION_NATURES[scope.nature].kinds] } });
  if (scope.officine) and.push({ OR: [{ pharmacyId: scope.officine.pharmacyId }, ...(scope.officine.prospectId ? [{ prospectId: scope.officine.prospectId }] : [])] });
  if (scope.q) and.push({ OR: [{ recipient: contains(scope.q) }, { subject: contains(scope.q) }] });
  return { AND: and };
}

function notificationWhere(scope: Scope): Prisma.ExtranetNotificationWhereInput | null {
  const codes = statusCodesFor(scope.statut, "notification");
  if ((codes && codes.length === 0) || scope.nature) return null;
  const and: Prisma.ExtranetNotificationWhereInput[] = [{ audience: "ADMIN" }, { createdAt: { gte: scope.since } }];
  if (scope.declencheur) and.push({ type: { startsWith: ENGINE_NOTIFICATION_TYPE_PREFIX } });
  if (codes?.includes("UNREAD") && !codes.includes("READ")) and.push({ readAt: null });
  if (codes?.includes("READ") && !codes.includes("UNREAD")) and.push({ readAt: { not: null } });
  // Une notification ne porte pas l'officine : son lien la désigne (fiche ou dossier).
  if (scope.officine) and.push({ OR: [{ linkUrl: { contains: scope.officine.pharmacyId } }, ...(scope.officine.prospectId ? [{ linkUrl: { contains: scope.officine.prospectId } }] : [])] });
  if (scope.q) and.push({ OR: [{ title: contains(scope.q) }, { body: contains(scope.q) }] });
  return { AND: and };
}

function automationWhere(scope: Scope): Prisma.AutomationDispatchWhereInput | null {
  const codes = statusCodesFor(scope.statut, "relance");
  if ((codes && codes.length === 0) || scope.nature) return null;
  // Les relances parties par e-mail sont déjà dans les e-mails, les alertes internes dans les notifications :
  // ici, l'ignoré, et ce que le moteur n'a pas pu mener au bout. Toutes sont automatiques.
  const and: Prisma.AutomationDispatchWhereInput[] = [
    { createdAt: { gte: scope.since } },
    { OR: [{ status: "SKIPPED" }, { status: { in: ["FAILED", "SENDING"] }, emailDispatchId: null }] },
  ];
  if (codes) and.push({ status: { in: [...codes] } });
  if (scope.officine) and.push({ OR: [{ pharmacyId: scope.officine.pharmacyId }, ...(scope.officine.prospectId ? [{ targetType: "Prospect", targetId: scope.officine.prospectId }] : [])] });
  if (scope.q) and.push({ OR: [{ recipient: contains(scope.q) }, { detail: contains(scope.q) }] });
  return { AND: and };
}

function prospectEventWhere(scope: Scope): Prisma.ProspectEventWhereInput | null {
  // Les actions commerciales n'ont pas de statut d'envoi et sont faites à la main : un filtre de statut, de déclencheur ou de nature les écarte.
  if (scope.statut || scope.declencheur || scope.nature) return null;
  const and: Prisma.ProspectEventWhereInput[] = [{ createdAt: { gte: scope.since } }, { type: { in: [...COMMERCIAL_EVENT_TYPES] } }];
  if (scope.officine) {
    if (!scope.officine.prospectId) return null;
    and.push({ prospectId: scope.officine.prospectId });
  }
  if (scope.q) and.push({ OR: [{ summary: contains(scope.q) }, { prospect: { name: contains(scope.q) } }] });
  return { AND: and };
}

export type CommunicationsPage = {
  rows: CommunicationEntry[];
  hasMore: boolean;
  page: number;
  /** Le nombre d'éléments par type, pour les mêmes filtres (hors type). */
  counts: Record<CommunicationType, number>;
  officine: { id: string; name: string } | null;
  /** L'officine demandée n'existe pas : le filtre est ignoré. */
  officineUnknown: boolean;
};

/** Les filtres de l'adresse, traduits en périmètre de lecture ; l'officine demandée est revérifiée en base. */
async function resolveScope(filters: CommunicationFilters, now: Date): Promise<{ scope: Scope; officine: CommunicationsPage["officine"]; officineUnknown: boolean }> {
  let officine: CommunicationsPage["officine"] = null;
  let scopeOfficine: Scope["officine"] = null;
  let officineUnknown = false;
  if (filters.officine) {
    // L'identifiant vient de l'adresse : il est revérifié en base.
    const pharmacy = await prisma.pharmacy.findUnique({ where: { id: filters.officine }, select: { id: true, name: true, prospect: { select: { id: true } } } });
    if (pharmacy) {
      officine = { id: pharmacy.id, name: pharmacy.name };
      scopeOfficine = { pharmacyId: pharmacy.id, prospectId: pharmacy.prospect?.id ?? null };
    } else officineUnknown = true;
  }
  const scope: Scope = { since: new Date(now.getTime() - filters.days * 24 * 60 * 60 * 1000), officine: scopeOfficine, q: filters.q, statut: filters.statut, declencheur: filters.declencheur, nature: filters.nature };
  return { scope, officine, officineUnknown };
}

type SourceWheres = { email: Prisma.EmailDispatchWhereInput | null; notification: Prisma.ExtranetNotificationWhereInput | null; relance: Prisma.AutomationDispatchWhereInput | null; commercial: Prisma.ProspectEventWhereInput | null };

function wheresFor(scope: Scope): SourceWheres {
  return { email: emailWhere(scope), notification: notificationWhere(scope), relance: automationWhere(scope), commercial: prospectEventWhere(scope) };
}

/** Le nombre d'éléments par type pour ces conditions : une source sans condition (exclue par les filtres) compte zéro. */
async function countSources(where: SourceWheres): Promise<Record<CommunicationType, number>> {
  const [email, notification, relance, commercial] = await Promise.all([
    where.email ? prisma.emailDispatch.count({ where: where.email }) : Promise.resolve(0),
    where.notification ? prisma.extranetNotification.count({ where: where.notification }) : Promise.resolve(0),
    where.relance ? prisma.automationDispatch.count({ where: where.relance }) : Promise.resolve(0),
    where.commercial ? prisma.prospectEvent.count({ where: where.commercial }) : Promise.resolve(0),
  ]);
  return { email, notification, relance, commercial };
}

/**
 * Les compteurs de l'historique pour ces filtres, sans lire les lignes : les
 * mêmes conditions que la page. Un lien vers l'historique avec ces filtres
 * affiche donc exactement ce chiffre (le type choisi, ou le total sans type).
 */
export async function countCommunications(filters: CommunicationFilters, now: Date = new Date()): Promise<Record<CommunicationType, number>> {
  const { scope } = await resolveScope(filters, now);
  return countSources(wheresFor(scope));
}

/** Le chiffre que l'historique annonce pour ces filtres : le type choisi, ou le total sans type. */
export function shownCount(counts: Record<CommunicationType, number>, type: CommunicationType | null): number {
  return type ? counts[type] : Object.values(counts).reduce((sum, n) => sum + n, 0);
}

/**
 * Une page de l'historique : chaque source rend ses `page × parPage` lignes
 * les plus récentes selon les filtres, la fusion garde les bonnes.
 */
export async function loadCommunications(filters: CommunicationFilters, now: Date = new Date()): Promise<CommunicationsPage> {
  const { scope, officine, officineUnknown } = await resolveScope(filters, now);
  const take = filters.page * COMMUNICATIONS_PER_PAGE + 1;
  const wants = (type: CommunicationType) => !filters.type || filters.type === type;

  const where = wheresFor(scope);

  const [emails, notifications, automations, events, counts] = await Promise.all([
    wants("email") && where.email
      ? prisma.emailDispatch.findMany({ where: where.email, orderBy: { createdAt: "desc" }, take, select: { id: true, kind: true, recipient: true, status: true, detail: true, subject: true, templateKey: true, trigger: true, ruleKey: true, pharmacyId: true, prospectId: true, createdAt: true } })
      : Promise.resolve([] as EmailRow[]),
    wants("notification") && where.notification
      ? prisma.extranetNotification.findMany({ where: where.notification, orderBy: { createdAt: "desc" }, take, select: { id: true, type: true, severity: true, title: true, body: true, linkUrl: true, readAt: true, createdAt: true } })
      : Promise.resolve([] as NotificationRow[]),
    wants("relance") && where.relance
      ? prisma.automationDispatch.findMany({ where: where.relance, orderBy: { createdAt: "desc" }, take, select: { id: true, ruleKey: true, status: true, recipient: true, detail: true, pharmacyId: true, targetType: true, targetId: true, createdAt: true } })
      : Promise.resolve([] as AutomationRow[]),
    wants("commercial") && where.commercial
      ? prisma.prospectEvent.findMany({ where: where.commercial, orderBy: { createdAt: "desc" }, take, select: { id: true, type: true, summary: true, actorLabel: true, prospectId: true, createdAt: true, prospect: { select: { name: true, pharmacyId: true } } } })
      : Promise.resolve([] as ProspectEventRow[]),
    countSources(where),
  ]);

  const pharmacyIds = new Set<string>();
  for (const row of [...emails, ...automations]) if (row.pharmacyId) pharmacyIds.add(row.pharmacyId);
  for (const row of events) if (row.prospect.pharmacyId) pharmacyIds.add(row.prospect.pharmacyId);
  const pharmacies = pharmacyIds.size ? await prisma.pharmacy.findMany({ where: { id: { in: [...pharmacyIds] } }, select: { id: true, name: true } }) : [];
  const names = new Map(pharmacies.map((p) => [p.id, p.name]));

  const merged = mergeCommunications([
    emails.map((row) => emailEntry(row, names)),
    notifications.map(notificationEntry),
    automations.map((row) => automationEntry(row, names)),
    events.map((row) => prospectEventEntry(row, names)),
  ]);
  const { rows, hasMore, page } = paginateCommunications(merged, filters.page);
  return { rows, hasMore: hasMore && page < MAX_COMMUNICATION_PAGES, page, counts, officine, officineUnknown };
}

/** Les officines proposées dans le sélecteur de l'historique (hors démonstration). */
export async function pharmacyOptions(): Promise<{ id: string; name: string; city: string | null }[]> {
  return prisma.pharmacy.findMany({ where: { isDemo: false }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true }, take: 500 });
}

// ---------------------------------------------------------------- Notifications de l'équipe

export type AdminNotificationFilters = { severity: NotificationSeverity | null; unreadOnly: boolean };

/** Les notifications de l'équipe, filtrées par sévérité et état de lecture, avec les compteurs des filtres. */
export async function loadAdminNotifications(filters: AdminNotificationFilters, limit = 200) {
  const where: Prisma.ExtranetNotificationWhereInput = { audience: "ADMIN", ...(filters.severity ? { severity: filters.severity } : {}), ...(filters.unreadOnly ? { readAt: null } : {}) };
  const [rows, bySeverity, unread, total] = await Promise.all([
    prisma.extranetNotification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, type: true, severity: true, title: true, body: true, linkUrl: true, readAt: true, createdAt: true } }),
    prisma.extranetNotification.groupBy({ by: ["severity"], where: { audience: "ADMIN", ...(filters.unreadOnly ? { readAt: null } : {}) }, _count: { _all: true } }),
    prisma.extranetNotification.count({ where: { audience: "ADMIN", readAt: null } }),
    prisma.extranetNotification.count({ where: { audience: "ADMIN" } }),
  ]);
  const severityCounts = Object.fromEntries(bySeverity.map((r) => [r.severity, r._count._all])) as Partial<Record<NotificationSeverity, number>>;
  return { rows, severityCounts, unread, total, truncated: rows.length === limit };
}

// ---------------------------------------------------------------- Auteurs

/** « Prénom Nom » des administrateurs, pour « modifié par ». Un identifiant inconnu est simplement absent. */
export async function adminNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const admins = await prisma.platformAdmin.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(admins.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
}
