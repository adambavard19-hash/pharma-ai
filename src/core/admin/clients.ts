import { stockFreshness } from "@/core/stock/connectors";
import { formatEuros, formatFrenchDate, trialEndingSoon } from "@/core/billing/subscription";
import { CANCELLATION_STATUS_LABELS, DISPATCH_KIND_LABELS, DISPATCH_TRIGGER_LABELS, dispatchStatusLabel, paymentStatusLabel, type CancellationStatusCode, type StatusLabel, type StatusTone } from "./statuses";
import { hasUnpaidFailure } from "./automations";
import { TIMELINE_KIND_LABELS, type TimelineEntry, type TimelineKind } from "./timeline";

/**
 * L'espace « Clients » de la console, en règles pures : filtres de la liste
 * des officines, activité et inactivité, état des connecteurs et des postes,
 * statut des comptes, et mise en forme de la frise d'une officine à partir
 * des lignes brutes de la base. Aucune donnée de santé n'entre ici : des
 * dates, des statuts, des montants.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Seuils communs à toute la console (cockpit compris). */
export const INACTIVE_AFTER_DAYS = 14;
export const TRIAL_ENDING_DAYS = 7;
/** Un poste de comptoir est « en ligne » s'il s'est signalé il y a moins de 3 minutes. */
export const POST_ONLINE_SECONDS = 180;
export const USERS_PAGE_SIZE = 50;

// ---------------------------------------------------------------- Lecture de l'adresse

type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** La première valeur d'un paramètre d'adresse, nettoyée ; vide devient null. */
export function searchParam(params: SearchParamsRecord, key: string): string | null {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parsePage(value: string | null): number {
  const n = value ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}

/** Minuscules, sans accents ni espaces superflus : « Élodie » se trouve en tapant « elodie ». */
export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function truncate(text: string | null | undefined, max: number): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…` : value;
}

// ---------------------------------------------------------------- Activité de l'équipe

/** La connexion la plus récente parmi les comptes de l'officine. */
export function teamLastLogin(users: { lastLoginAt: Date | null }[]): Date | null {
  let latest: Date | null = null;
  for (const user of users) if (user.lastLoginAt && (!latest || user.lastLoginAt > latest)) latest = user.lastLoginAt;
  return latest;
}

/** Les comptes connectés au moins une fois dans les `days` derniers jours. */
export function countActiveSince(users: { lastLoginAt: Date | null }[], days: number, now: Date): number {
  const since = now.getTime() - days * DAY_MS;
  return users.filter((user) => user.lastLoginAt && user.lastLoginAt.getTime() >= since).length;
}

/**
 * Inactive : officine active, hors démonstration, dont aucun compte ne s'est
 * connecté depuis 14 jours (ou ne s'est jamais connecté). Même définition que
 * le cockpit et le filtre /admin/activite?filtre=inactives.
 */
export function isInactivePharmacy(input: { isActive: boolean; isDemo: boolean; teamLastLoginAt: Date | null }, now: Date, days = INACTIVE_AFTER_DAYS): boolean {
  if (!input.isActive || input.isDemo) return false;
  if (!input.teamLastLoginAt) return true;
  return now.getTime() - input.teamLastLoginAt.getTime() > days * DAY_MS;
}

export function daysSince(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

/** Ce que dit la dernière connexion de l'équipe, en une pastille. */
export function activityLabel(teamLastLoginAt: Date | null, now: Date): StatusLabel {
  const days = daysSince(teamLastLoginAt, now);
  if (days === null) return { label: "Aucune connexion", tone: "warning" };
  if (days < 7) return { label: "Active", tone: "success" };
  if (days <= INACTIVE_AFTER_DAYS) return { label: "Peu active", tone: "info" };
  return { label: `Inactive depuis ${days} j`, tone: "warning" };
}

/** Coût IA enregistré en micro-centimes, ramené en centimes (même conversion que l'ancienne vue plateforme). */
export function aiCostCents(microCents: number): number {
  return Math.round(microCents / 10_000);
}

// ---------------------------------------------------------------- Liste des officines

export const PHARMACY_STATUS_FILTERS = ["actives", "suspendues", "essai", "abonnees", "sans-abonnement", "demo"] as const;
export type PharmacyStatusFilter = (typeof PHARMACY_STATUS_FILTERS)[number];

export const PHARMACY_STATUS_FILTER_LABELS: Record<PharmacyStatusFilter, string> = {
  actives: "Actives",
  suspendues: "Suspendues",
  essai: "En essai",
  abonnees: "Abonnées",
  "sans-abonnement": "Sans abonnement",
  demo: "Démonstration",
};

export function parsePharmacyStatusFilter(value: string | null): PharmacyStatusFilter | null {
  return (PHARMACY_STATUS_FILTERS as readonly string[]).includes(value ?? "") ? (value as PharmacyStatusFilter) : null;
}

export const PHARMACY_SORTS = ["recent", "nom", "activite"] as const;
export type PharmacySort = (typeof PHARMACY_SORTS)[number];

export const PHARMACY_SORT_LABELS: Record<PharmacySort, string> = { recent: "Plus récentes", nom: "Nom", activite: "Dernière activité" };

export function parsePharmacySort(value: string | null): PharmacySort {
  return (PHARMACY_SORTS as readonly string[]).includes(value ?? "") ? (value as PharmacySort) : "recent";
}

export type PharmacyListFacts = {
  name: string;
  city: string | null;
  siret: string | null;
  email: string | null;
  isActive: boolean;
  isDemo: boolean;
  createdAt: Date;
  /** Les e-mails des comptes de l'officine (titulaire compris). */
  memberEmails: string[];
  subscription: { status: string; suspendedAt: Date | null } | null;
  teamLastLoginAt: Date | null;
};

const ENDED_SUBSCRIPTION = new Set(["CANCELED", "INCOMPLETE_EXPIRED"]);

export function matchesPharmacyStatus(row: PharmacyListFacts, filter: PharmacyStatusFilter | null): boolean {
  const status = row.subscription?.status ?? null;
  switch (filter) {
    case null:
      return true;
    case "actives":
      return row.isActive && !row.isDemo;
    case "suspendues":
      return !row.isActive || status === "SUSPENDED" || Boolean(row.subscription?.suspendedAt);
    case "essai":
      return status === "TRIALING";
    case "abonnees":
      return status === "ACTIVE" || status === "PAST_DUE";
    case "sans-abonnement":
      // Aucun abonnement, ou un abonnement terminé : plus rien n'est facturé.
      return status === null || ENDED_SUBSCRIPTION.has(status);
    case "demo":
      return row.isDemo;
  }
}

/** Recherche sur le nom, la ville, le SIRET (chiffres seuls) et les e-mails. */
export function matchesPharmacySearch(row: PharmacyListFacts, query: string | null): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && (row.siret ?? "").replace(/\D/g, "").includes(digits)) return true;
  const haystack = [row.name, row.city, row.email, ...row.memberEmails].map(normalizeSearch);
  return haystack.some((value) => value.includes(q));
}

export function countPharmacyFilters(rows: PharmacyListFacts[]): Record<PharmacyStatusFilter, number> {
  const counts = Object.fromEntries(PHARMACY_STATUS_FILTERS.map((f) => [f, 0])) as Record<PharmacyStatusFilter, number>;
  for (const row of rows) for (const filter of PHARMACY_STATUS_FILTERS) if (matchesPharmacyStatus(row, filter)) counts[filter] += 1;
  return counts;
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

export function sortPharmacies<T extends PharmacyListFacts>(rows: T[], sort: PharmacySort): T[] {
  const copy = [...rows];
  if (sort === "nom") return copy.sort((a, b) => collator.compare(a.name, b.name));
  if (sort === "activite") {
    // Les plus récemment actives d'abord ; celles qui ne se sont jamais connectées à la fin.
    return copy.sort((a, b) => (b.teamLastLoginAt?.getTime() ?? -1) - (a.teamLastLoginAt?.getTime() ?? -1) || collator.compare(a.name, b.name));
  }
  return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function pharmacyStatusLabel(input: { isActive: boolean; isDemo: boolean }): StatusLabel {
  if (!input.isActive) return { label: "Suspendue", tone: "danger" };
  if (input.isDemo) return { label: "Démonstration", tone: "neutral" };
  return { label: "Active", tone: "success" };
}

// ---------------------------------------------------------------- Connecteur et postes

export type ConnectorFacts = { status: string; lastSyncAt: Date | null; lastSeenAt: Date | null; intervalSeconds: number };
export type ConnectorState = "NONE" | "PENDING" | "FRESH" | "STALE" | "OFFLINE" | "ERROR" | "REVOKED";

/**
 * L'état d'une liaison LGO, lisible : appairage en attente, en erreur (dernier
 * envoi refusé), déconnectée par l'officine, hors ligne (aucun signe de vie
 * depuis une heure), en retard (synchro trop ancienne) ou à jour.
 */
export function connectorState(connection: ConnectorFacts | null, now: Date): { state: ConnectorState } & StatusLabel {
  if (!connection) return { state: "NONE", label: "Aucun connecteur", tone: "neutral" };
  if (connection.status === "PENDING") return { state: "PENDING", label: "Appairage en attente", tone: "info" };
  if (connection.status === "DISCONNECTED") return { state: "REVOKED", label: "Déconnecté", tone: "danger" };
  if (connection.status === "ERROR") return { state: "ERROR", label: "En erreur", tone: "danger" };
  const freshness = stockFreshness({ lastSyncAt: connection.lastSyncAt, lastSeenAt: connection.lastSeenAt, intervalSeconds: connection.intervalSeconds, now });
  if (freshness.state === "DISCONNECTED") return { state: "OFFLINE", label: "Hors ligne", tone: "danger" };
  if (freshness.state === "STALE") return { state: "STALE", label: "Synchro en retard", tone: "warning" };
  return { state: "FRESH", label: "À jour", tone: "success" };
}

/** Le filtre « erreurs » : en erreur, déconnecté (ou hors ligne), ou en retard. */
export function connectorNeedsAttention(state: ConnectorState): boolean {
  return state === "ERROR" || state === "REVOKED" || state === "OFFLINE" || state === "STALE";
}

export type CounterPostFacts = { lastSeenAt: Date | null; lastExportError: string | null; revokedAt: Date | null; pairedAt: Date | null };

export function isPostOnline(lastSeenAt: Date | null, now: Date): boolean {
  return Boolean(lastSeenAt && now.getTime() - lastSeenAt.getTime() < POST_ONLINE_SECONDS * 1000);
}

/** Un poste éteint la nuit n'est pas une panne : « hors ligne » reste neutre ; l'erreur d'export, elle, se signale. */
export function counterPostState(post: CounterPostFacts, now: Date): { state: "REVOKED" | "PENDING" | "EXPORT_ERROR" | "ONLINE" | "OFFLINE"; online: boolean } & StatusLabel {
  const online = isPostOnline(post.lastSeenAt, now);
  if (post.revokedAt) return { state: "REVOKED", online: false, label: "Révoqué", tone: "neutral" };
  if (!post.pairedAt) return { state: "PENDING", online, label: "Appairage en attente", tone: "info" };
  if (post.lastExportError) return { state: "EXPORT_ERROR", online, label: "Erreur d'export", tone: "danger" };
  if (online) return { state: "ONLINE", online, label: "En ligne", tone: "success" };
  return { state: "OFFLINE", online, label: "Hors ligne", tone: "neutral" };
}

export function counterPostInError(post: CounterPostFacts): boolean {
  return !post.revokedAt && Boolean(post.lastExportError);
}

// ---------------------------------------------------------------- Comptes d'officine

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Titulaire",
  PHARMACIST: "Pharmacien",
  TECHNICIAN: "Préparateur",
  STUDENT: "Étudiant",
  VIEWER: "Consultation",
};

export const USER_ROLES = ["OWNER", "PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const;

export function parseUserRole(value: string | null): (typeof USER_ROLES)[number] | null {
  const upper = (value ?? "").toUpperCase();
  return (USER_ROLES as readonly string[]).includes(upper) ? (upper as (typeof USER_ROLES)[number]) : null;
}

export const USER_STATUS_FILTERS = ["actifs", "suspendus", "jamais-connectes"] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];
export const USER_STATUS_FILTER_LABELS: Record<UserStatusFilter, string> = { actifs: "Actifs", suspendus: "Suspendus", "jamais-connectes": "Jamais connectés" };

export function parseUserStatusFilter(value: string | null): UserStatusFilter | null {
  return (USER_STATUS_FILTERS as readonly string[]).includes(value ?? "") ? (value as UserStatusFilter) : null;
}

export type UserAccessState = "ACTIVE" | "INVITED" | "SUSPENDED" | "DISABLED";

/**
 * L'accès d'un compte : désactivé, suspendu (compte suspendu, ou plus aucun
 * rattachement actif à une officine), invité, ou actif.
 */
export function userAccessState(user: { status: string; memberships: { isActive: boolean }[] }): { state: UserAccessState } & StatusLabel {
  if (user.status === "DISABLED") return { state: "DISABLED", label: "Désactivé", tone: "neutral" };
  if (user.status === "SUSPENDED" || (user.memberships.length > 0 && user.memberships.every((m) => !m.isActive))) return { state: "SUSPENDED", label: "Suspendu", tone: "danger" };
  if (user.status === "INVITED") return { state: "INVITED", label: "Invité", tone: "info" };
  return { state: "ACTIVE", label: "Actif", tone: "success" };
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

// ---------------------------------------------------------------- Invitations

export function invitationState(invitation: { expiresAt: Date; completedAt: Date | null; revokedAt: Date | null; sentAt: Date | null; lastSendStatus: string | null }, now: Date): { state: "COMPLETED" | "REVOKED" | "FAILED" | "TO_SEND" | "EXPIRED" | "PENDING" } & StatusLabel {
  if (invitation.completedAt) return { state: "COMPLETED", label: "Complétée", tone: "success" };
  if (invitation.revokedAt) return { state: "REVOKED", label: "Révoquée", tone: "neutral" };
  if (invitation.lastSendStatus && invitation.lastSendStatus !== "SENT") return { state: "FAILED", label: "Envoi en échec", tone: "danger" };
  if (!invitation.sentAt) return { state: "TO_SEND", label: "À envoyer", tone: "warning" };
  if (invitation.expiresAt.getTime() < now.getTime()) return { state: "EXPIRED", label: "Lien expiré", tone: "warning" };
  return { state: "PENDING", label: "En attente", tone: "info" };
}

// ---------------------------------------------------------------- Relance contextuelle

export type RelaunchContext =
  | { kind: "contract"; contractId: string; signerEmail: string; reminderCount: number }
  | { kind: "payment" }
  | { kind: "trial" }
  | null;

/**
 * Le bouton « Relancer » de la fiche : un contrat en attente de signature,
 * sinon un impayé, sinon un essai qui se termine dans les 7 jours ; rien à
 * relancer, pas de bouton.
 */
export function relaunchContext(input: {
  contract: { id: string; status: string; pharmacySignerEmail: string; reminderCount: number } | null;
  subscription: { status: string; lastPaymentAt: Date | null; lastPaymentFailedAt: Date | null; trialEndsAt: Date | null } | null;
  now: Date;
}): RelaunchContext {
  const { contract, subscription, now } = input;
  if (contract && (contract.status === "SENT" || contract.status === "OPENED")) return { kind: "contract", contractId: contract.id, signerEmail: contract.pharmacySignerEmail, reminderCount: contract.reminderCount };
  if (subscription && (subscription.status === "PAST_DUE" || subscription.status === "UNPAID" || hasUnpaidFailure(subscription))) return { kind: "payment" };
  if (subscription && subscription.status === "TRIALING" && trialEndingSoon(subscription.trialEndsAt, now, TRIAL_ENDING_DAYS)) return { kind: "trial" };
  return null;
}

// ---------------------------------------------------------------- Frise de l'officine

export const TIMELINE_FILTER_KINDS = Object.keys(TIMELINE_KIND_LABELS) as TimelineKind[];

export function parseTimelineKind(value: string | null): TimelineKind | null {
  return (TIMELINE_FILTER_KINDS as string[]).includes(value ?? "") ? (value as TimelineKind) : null;
}

/** Événements du dossier commercial. */
export function prospectEventEntry(event: { id: string; type: string; summary: string; actorLabel: string | null; createdAt: Date }): TimelineEntry {
  const type = event.type;
  const kind: TimelineKind =
    type.startsWith("CONTRACT_") || type === "SIGNED_PDF_ARCHIVED" || type === "SIGNATURE_ERROR" ? "contrat"
    : type === "EMAIL_SENT" ? "email"
    : type.startsWith("SUBSCRIPTION_") ? "abonnement"
    : type === "CREATED" || type === "PHARMACY_CREATED" || type === "DUPLICATE_SUSPECTED" ? "dossier"
    : "commercial";
  const tone: StatusTone =
    type === "CONTRACT_SIGNED" ? "success"
    : type === "CONTRACT_REFUSED" || type === "SIGNATURE_ERROR" ? "danger"
    : type === "CONTRACT_EXPIRED" || type === "BLOCKED" || type === "DUPLICATE_SUSPECTED" ? "warning"
    : type === "PHARMACY_CREATED" || type === "CREATED" ? "brand"
    : "neutral";
  return { id: `prospect-event:${event.id}`, at: event.createdAt, kind, title: event.summary, actor: event.actorLabel, tone };
}

type AuditTimelineRule = { kind: TimelineKind; title: string; tone?: StatusTone };

/** Les actions du journal reprises dans la frise, et leur libellé. */
export const AUDIT_TIMELINE_RULES: Record<string, AuditTimelineRule> = {
  "platform.pharmacy_created": { kind: "dossier", title: "Officine créée", tone: "brand" },
  "platform.pharmacy_updated": { kind: "dossier", title: "Fiche de l'officine modifiée" },
  "platform.pharmacy_status_changed": { kind: "acces", title: "Statut de l'officine modifié" },
  "platform.pharmacy_email_changed": { kind: "dossier", title: "E-mail de contact modifié" },
  "platform.post_count_changed": { kind: "dossier", title: "Nombre de postes modifié" },
  "platform.owner_created": { kind: "acces", title: "Titulaire ajouté" },
  "platform.owner_email_changed": { kind: "acces", title: "Identifiant du titulaire modifié" },
  "platform.owner_welcome_resent": { kind: "acces", title: "Accès renvoyé au titulaire" },
  "platform.member_access_resent": { kind: "acces", title: "Lien d'accès renvoyé à un compte" },
  "platform.member_access_changed": { kind: "acces", title: "Accès d'un compte modifié" },
  "platform.member_deleted": { kind: "acces", title: "Compte supprimé", tone: "warning" },
  "platform.member_removed": { kind: "acces", title: "Compte retiré de l'officine", tone: "warning" },
  "platform.user_deleted": { kind: "acces", title: "Compte supprimé", tone: "warning" },
  "platform.pharmacy_deleted": { kind: "dossier", title: "Officine supprimée", tone: "danger" },
  "platform.support_replied": { kind: "dossier", title: "Réponse du support envoyée" },
  "platform.support_status_changed": { kind: "dossier", title: "Discussion du support fermée ou rouverte" },
  "platform.note_pinned": { kind: "note", title: "Épinglage d'une note modifié" },
  "platform.incident_resolved": { kind: "technique", title: "Incident marqué résolu", tone: "success" },
  "pharmacy.install_guide_sent": { kind: "technique", title: "Guide d'installation envoyé" },
  "auth.password_link_sent": { kind: "acces", title: "Lien de mot de passe envoyé" },
  "billing.invite_sent": { kind: "abonnement", title: "Lien d'abonnement envoyé", tone: "brand" },
  "billing.contract_prepared": { kind: "contrat", title: "Contrat préparé" },
  "billing.subscription_refreshed": { kind: "abonnement", title: "Abonnement relu chez Stripe" },
  "billing.portal_opened": { kind: "abonnement", title: "Portail de facturation ouvert par l'officine" },
  "billing.cancel_scheduled": { kind: "resiliation", title: "Résiliation programmée en fin de période", tone: "warning" },
  "billing.cancel_revoked": { kind: "resiliation", title: "Résiliation programmée annulée", tone: "success" },
  "billing.access_suspended": { kind: "acces", title: "Accès suspendu", tone: "danger" },
  "billing.access_restored": { kind: "acces", title: "Accès rétabli", tone: "success" },
  "platform.invitation_sent": { kind: "acces", title: "Invitation envoyée au titulaire", tone: "brand" },
  "platform.invitation_link_issued": { kind: "acces", title: "Lien d'invitation copié depuis la console" },
  "platform.invitation_email_changed": { kind: "acces", title: "Adresse de l'invitation modifiée" },
  "platform.invitation_revoked": { kind: "acces", title: "Invitation révoquée", tone: "warning" },
};

/**
 * Actions déjà racontées par une autre source de la frise (notes, e-mails,
 * historique de tarif, de résiliation) ou sans rapport avec une officine : on
 * ne les répète pas. Les actions commerciales (`sales.*`) sont toutes doublées
 * d'un événement du dossier, qui fait foi dans la frise.
 */
export const AUDIT_TIMELINE_SKIPPED = new Set([
  "platform.note_added",
  "platform.email_sent",
  "platform.email_test_sent",
  "platform.email_template_saved",
  "platform.email_template_reset",
  "platform.automation_updated",
  "platform.automation_run",
  "platform.setting_updated",
  "billing.plan_saved",
  "billing.contract_price_changed",
  "billing.cancellation_created",
  "billing.cancellation_status_changed",
  "billing.cancellation_note_added",
  "billing.cancellation_stripe_scheduled",
]);

const FIELD_LABELS: Record<string, string> = { name: "nom", siret: "SIRET", finessNumber: "FINESS", email: "e-mail", phone: "téléphone", city: "ville", postCount: "postes", status: "statut", isActive: "active" };

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "…";
}

/** Une ligne lisible depuis les métadonnées du journal : changements, motif, issue d'un envoi. */
export function describeAuditMetadata(action: string, metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  const parts: string[] = [];
  if (action === "platform.pharmacy_status_changed" && typeof m.isActive === "boolean") parts.push(m.isActive ? "Officine réactivée" : "Officine suspendue");
  if (action === "platform.member_access_changed" && typeof m.isActive === "boolean") parts.push(m.isActive ? "Accès réactivé" : "Accès suspendu");
  if (action === "platform.note_pinned" && typeof m.pinned === "boolean") parts.push(m.pinned ? "Note épinglée" : "Note désépinglée");
  const changes = m.changes;
  if (changes && typeof changes === "object" && !Array.isArray(changes)) {
    const lines = Object.entries(changes as Record<string, { from?: unknown; to?: unknown } | null>)
      .filter(([, change]) => change && typeof change === "object")
      .map(([key, change]) => `${FIELD_LABELS[key] ?? key} : ${show(change?.from)} → ${show(change?.to)}`);
    if (lines.length > 0) parts.push(lines.join(" ; "));
  }
  if ("from" in m || "to" in m) parts.push(`${show(m.from)} → ${show(m.to)}`);
  if (typeof m.reason === "string" && m.reason.trim()) parts.push(`Motif : ${truncate(m.reason, 200)}`);
  if (typeof m.status === "string" && m.status) parts.push(`Issue : ${dispatchStatusLabel(m.status).label}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Une ligne du journal d'audit ; null si l'action n'a pas sa place dans la frise. */
export function auditEntry(row: { id: string; action: string; metadata: unknown; createdAt: Date }, actor: string | null): TimelineEntry | null {
  if (AUDIT_TIMELINE_SKIPPED.has(row.action) || row.action.startsWith("sales.")) return null;
  const rule = AUDIT_TIMELINE_RULES[row.action];
  if (!rule && !/^(platform|billing)\./.test(row.action)) return null;
  const kind: TimelineKind = rule?.kind ?? (row.action.startsWith("billing.") ? "abonnement" : "dossier");
  return { id: `audit:${row.id}`, at: row.createdAt, kind, title: rule?.title ?? `Action enregistrée : ${row.action}`, detail: describeAuditMetadata(row.action, row.metadata), actor, tone: rule?.tone };
}

export function billingEventEntry(event: { id: string; type: string; summary: string; receivedAt: Date; error: string | null }): TimelineEntry | null {
  // Les factures sont déjà dans la frise par leur paiement ; leur notification ne revient que si son traitement a échoué.
  if (event.type.startsWith("invoice.") && !event.error) return null;
  return {
    id: `billing-event:${event.id}`,
    at: event.receivedAt,
    kind: event.type.startsWith("invoice.") ? "paiement" : "abonnement",
    title: `Stripe : ${event.summary}`,
    detail: event.error ? `Traitement en erreur : ${truncate(event.error, 200)}` : null,
    tone: event.error ? "danger" : "neutral",
  };
}

const PAYMENT_TITLES: Record<string, string> = { PAID: "Paiement reçu", FAILED: "Paiement échoué", OPEN: "Facture en attente de paiement", VOID: "Facture annulée", UNCOLLECTIBLE: "Facture irrécouvrable", DRAFT: "Facture en préparation" };

export function paymentEntry(payment: { id: string; status: string; amountCents: number; createdAt: Date; paidAt: Date | null; failedAt: Date | null; periodStart: Date | null; periodEnd: Date | null; attemptCount: number }): TimelineEntry {
  const period = payment.periodStart && payment.periodEnd ? `Période du ${formatFrenchDate(payment.periodStart)} au ${formatFrenchDate(payment.periodEnd)}` : null;
  const attempts = payment.status === "FAILED" && payment.attemptCount > 1 ? `${payment.attemptCount} tentatives` : null;
  return {
    id: `payment:${payment.id}`,
    at: payment.paidAt ?? payment.failedAt ?? payment.createdAt,
    kind: "paiement",
    title: `${PAYMENT_TITLES[payment.status] ?? paymentStatusLabel(payment.status).label} — ${formatEuros(payment.amountCents)}`,
    detail: [period, attempts].filter(Boolean).join(" · ") || null,
    tone: paymentStatusLabel(payment.status).tone,
  };
}

export type ContractTimelineFacts = {
  id: string;
  version: number;
  status: string;
  monthlyPriceCents: number;
  pharmacySignerEmail: string;
  createdAt: Date;
  sentAt: Date | null;
  openedAt: Date | null;
  pharmacySignedAt: Date | null;
  companySignedAt: Date | null;
  finalizedAt: Date | null;
  refusedAt: Date | null;
  refusalReason: string | null;
  expiresAt: Date | null;
};

/** Les étapes datées d'un contrat, chacune une entrée. */
export function contractEntries(contract: ContractTimelineFacts, now: Date): TimelineEntry[] {
  const v = `Contrat v${contract.version}`;
  const base = `contract:${contract.id}`;
  const out: TimelineEntry[] = [{ id: `${base}:created`, at: contract.createdAt, kind: "contrat", title: `${v} généré`, detail: `${formatEuros(contract.monthlyPriceCents)} HT par mois` }];
  if (contract.sentAt) out.push({ id: `${base}:sent`, at: contract.sentAt, kind: "contrat", title: `${v} envoyé pour signature`, detail: `À ${contract.pharmacySignerEmail}`, tone: "brand" });
  if (contract.openedAt) out.push({ id: `${base}:opened`, at: contract.openedAt, kind: "contrat", title: `${v} consulté par le signataire`, tone: "info" });
  if (contract.pharmacySignedAt) out.push({ id: `${base}:pharmacy-signed`, at: contract.pharmacySignedAt, kind: "contrat", title: `${v} signé par l'officine`, tone: "success" });
  if (contract.companySignedAt) out.push({ id: `${base}:company-signed`, at: contract.companySignedAt, kind: "contrat", title: `${v} contresigné par PharmaBoost`, tone: "success" });
  if (contract.finalizedAt) out.push({ id: `${base}:finalized`, at: contract.finalizedAt, kind: "contrat", title: `${v} finalisé`, tone: "success" });
  if (contract.refusedAt) out.push({ id: `${base}:refused`, at: contract.refusedAt, kind: "contrat", title: `${v} refusé`, detail: contract.refusalReason ? truncate(contract.refusalReason, 200) : null, tone: "danger" });
  if (contract.status === "EXPIRED" && contract.expiresAt && contract.expiresAt <= now) out.push({ id: `${base}:expired`, at: contract.expiresAt, kind: "contrat", title: `${v} expiré sans signature`, tone: "warning" });
  return out;
}

export function emailEntry(dispatch: { id: string; kind: string; subject: string | null; recipient: string; status: string; trigger: string | null; createdAt: Date }): TimelineEntry {
  const status = dispatchStatusLabel(dispatch.status);
  const trigger = dispatch.trigger ? DISPATCH_TRIGGER_LABELS[dispatch.trigger] : null;
  return {
    id: `email:${dispatch.id}`,
    at: dispatch.createdAt,
    kind: "email",
    title: dispatch.subject ?? DISPATCH_KIND_LABELS[dispatch.kind] ?? dispatch.kind,
    detail: [`À ${dispatch.recipient}`, status.label, trigger].filter(Boolean).join(" · "),
    tone: status.tone === "info" ? "neutral" : status.tone,
  };
}

export function noteEntry(note: { id: string; body: string; pinned: boolean; authorLabel: string; createdAt: Date }): TimelineEntry {
  return { id: `note:${note.id}`, at: note.createdAt, kind: "note", title: note.pinned ? "Note interne (épinglée)" : "Note interne", detail: truncate(note.body, 240), actor: note.authorLabel, tone: note.pinned ? "brand" : "neutral" };
}

export function cancellationEventEntry(event: { id: string; type: string; summary: string; fromStatus: string | null; toStatus: string | null; actorLabel: string | null; createdAt: Date }): TimelineEntry {
  const label = (code: string | null) => (code ? (CANCELLATION_STATUS_LABELS[code as CancellationStatusCode]?.label ?? code) : null);
  const move = event.fromStatus || event.toStatus ? [label(event.fromStatus), label(event.toStatus)].filter(Boolean).join(" → ") : null;
  const tone: StatusTone = event.toStatus ? (CANCELLATION_STATUS_LABELS[event.toStatus as CancellationStatusCode]?.tone ?? "neutral") : event.type === "CREATED" ? "warning" : "neutral";
  return { id: `cancellation-event:${event.id}`, at: event.createdAt, kind: "resiliation", title: event.summary, detail: move, actor: event.actorLabel, tone };
}

/**
 * Un changement de tarif contractuel, daté du jour où il a été ENREGISTRÉ : la
 * frise raconte des faits passés. Sa date d'effet (l'échéance Stripe, souvent
 * future) est dite dans le détail, jamais utilisée pour le classer — sinon il
 * resterait épinglé en tête de la frise jusqu'à cette date.
 */
export function priceChangeEntry(change: { id: string; previousCents: number | null; nextCents: number; reason: string; appliedToStripe: boolean; effectiveAt: Date; createdAt: Date }, actor: string | null): TimelineEntry {
  const effect = change.appliedToStripe ? `appliqué chez Stripe, effet à l'échéance du ${formatFrenchDate(change.effectiveAt)}` : `fiche seule, Stripe inchangé, effet le ${formatFrenchDate(change.effectiveAt)}`;
  return {
    id: `price-change:${change.id}`,
    at: change.createdAt,
    kind: "tarif",
    title: `Tarif contractuel : ${change.previousCents !== null ? formatEuros(change.previousCents) : "—"} → ${formatEuros(change.nextCents)} HT par mois`,
    detail: `Motif : ${truncate(change.reason, 200)} · ${effect}`,
    actor,
    tone: "info",
  };
}

/** Les jalons passés de l'abonnement ; une échéance future n'est pas un fait, elle n'entre pas dans la frise. */
export function subscriptionEntries(subscription: { id: string; createdAt: Date; trialStartsAt: Date | null; trialEndsAt: Date | null; canceledAt: Date | null; endedAt: Date | null }, planName: string, now: Date): TimelineEntry[] {
  const base = `subscription:${subscription.id}`;
  const out: TimelineEntry[] = [{ id: `${base}:created`, at: subscription.createdAt, kind: "abonnement", title: `Abonnement créé — ${planName}`, tone: "brand" }];
  if (subscription.trialStartsAt && subscription.trialStartsAt <= now) out.push({ id: `${base}:trial-start`, at: subscription.trialStartsAt, kind: "abonnement", title: "Début de l'essai gratuit", tone: "info" });
  if (subscription.trialEndsAt && subscription.trialEndsAt <= now) out.push({ id: `${base}:trial-end`, at: subscription.trialEndsAt, kind: "abonnement", title: "Fin de l'essai gratuit" });
  if (subscription.canceledAt && subscription.canceledAt <= now) out.push({ id: `${base}:canceled`, at: subscription.canceledAt, kind: "abonnement", title: "Abonnement résilié", tone: "danger" });
  if (subscription.endedAt && subscription.endedAt <= now) out.push({ id: `${base}:ended`, at: subscription.endedAt, kind: "abonnement", title: "Abonnement terminé" });
  return out;
}
