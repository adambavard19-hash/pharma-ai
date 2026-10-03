import { CANCELLATION_CHANNELS, CANCELLATION_REASONS, CANCELLATION_STATUS_LABELS, DISPATCH_STATUS, PAYMENT_STATUS_LABELS, type StatusTone } from "./statuses";
import { CONTRACT_STATUS_LABELS, PROSPECT_STATUS_LABELS } from "@/core/sales/pipeline";
import { formatEuros, SUBSCRIPTION_STATUS_LABELS } from "@/core/billing/subscription";

/**
 * Le journal d'audit de la console, vu du domaine : quelles actions il montre,
 * comment il les nomme, et comment il rend lisible l'avant / l'après.
 *
 * Règle structurelle : le journal est une LISTE BLANCHE de familles business.
 * Une famille absente de la liste n'apparaît jamais, quelle qu'elle soit ; les
 * familles cliniques (patient, ordonnance, recommandation, document, rappel…)
 * sont en plus refusées nommément, pour qu'un ajout maladroit à la liste
 * blanche ne suffise pas à les faire entrer.
 *
 * Module pur : aucune base, aucune session. Le service serveur lit la base et
 * passe ses lignes ici.
 */

// ---------------------------------------------------------------- Familles

export type JournalFamily = {
  /** Valeur du paramètre d'adresse `?famille=`. */
  key: string;
  /** Préfixe du code d'action (`billing` pour `billing.plan_saved`). */
  prefix: string;
  label: string;
  tone: StatusTone;
  /** Ne montrer que les lignes portées par un administrateur de la console. */
  requiresAdmin?: boolean;
};

export const JOURNAL_FAMILIES: JournalFamily[] = [
  { key: "plateforme", prefix: "platform", label: "Plateforme", tone: "neutral" },
  { key: "facturation", prefix: "billing", label: "Facturation", tone: "info" },
  { key: "commercial", prefix: "sales", label: "Commercial", tone: "brand" },
  { key: "partenaires", prefix: "partner", label: "Partenaires", tone: "warning" },
  { key: "formations", prefix: "training", label: "Formations", tone: "success" },
  { key: "challenges", prefix: "challenge", label: "Challenges", tone: "success" },
  // Les connexions des officines et des commerciaux ne regardent pas la
  // console : seules celles des administrateurs y figurent.
  { key: "connexions", prefix: "auth", label: "Connexions console", tone: "neutral", requiresAdmin: true },
];

/** Familles refusées nommément : données cliniques ou activité au comptoir. */
export const REFUSED_FAMILIES = ["patient", "patient_data", "prescription", "recommendation", "document", "reminder", "counter", "vigilance", "opportunity", "rule", "sale"] as const;

/**
 * Actions d'une famille autorisée, écartées malgré tout : le suivi individuel
 * d'une formation dit QUI apprend quoi dans une officine, or la console ne
 * voit que des agrégats de formation, jamais des personnes.
 */
export const EXCLUDED_ACTIONS = ["training.progress_updated"] as const;

export function actionFamily(action: string): string {
  const dot = action.indexOf(".");
  return dot === -1 ? action : action.slice(0, dot);
}

/** La famille désignée par l'adresse : par sa clé française ou par son préfixe. */
export function journalFamily(value: string | null | undefined): JournalFamily | null {
  if (!value) return null;
  return JOURNAL_FAMILIES.find((f) => f.key === value || f.prefix === value) ?? null;
}

/**
 * Une ligne du journal peut-elle être montrée dans la console ? Liste blanche
 * de familles, refus nommé des familles cliniques, et les connexions
 * seulement quand un administrateur en est l'auteur.
 */
export function isBusinessAction(action: string, context: { platformAdminId?: string | null } = {}): boolean {
  if (!action || typeof action !== "string") return false;
  const family = actionFamily(action);
  if ((REFUSED_FAMILIES as readonly string[]).includes(family)) return false;
  if ((EXCLUDED_ACTIONS as readonly string[]).includes(action)) return false;
  const allowed = JOURNAL_FAMILIES.find((f) => f.prefix === family);
  if (!allowed) return false;
  if (action === `${family}.` || action.length <= family.length + 1) return false;
  if (allowed.requiresAdmin && !context.platformAdminId) return false;
  return true;
}

// ---------------------------------------------------------------- Filtre de requête

/** Le filtre de base du journal, sous une forme que Prisma accepte telle quelle. */
export type JournalWhere = {
  AND: Record<string, unknown>[];
};

/**
 * Traduit les filtres de l'adresse en condition de requête. La liste blanche
 * est appliquée dans la requête elle-même : une ligne clinique n'est jamais
 * lue, pas seulement masquée à l'affichage.
 */
export function journalWhere(input: { family: JournalFamily | null; adminId?: string | null; since?: Date | null; q?: string | null }): JournalWhere {
  const families = input.family ? [input.family] : JOURNAL_FAMILIES;
  const and: Record<string, unknown>[] = [
    { OR: families.map((f) => (f.requiresAdmin ? { action: { startsWith: `${f.prefix}.` }, platformAdminId: { not: null } } : { action: { startsWith: `${f.prefix}.` } })) },
    { action: { notIn: [...EXCLUDED_ACTIONS] } },
  ];
  if (input.since) and.push({ createdAt: { gte: input.since } });
  if (input.adminId) and.push({ platformAdminId: input.adminId });
  const q = input.q?.trim();
  if (q) {
    const byLabel = actionsMatching(q);
    and.push({
      OR: [
        { entityId: q },
        { pharmacyId: q },
        { action: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        ...(byLabel.length > 0 ? [{ action: { in: byLabel } }] : []),
      ],
    });
  }
  return { AND: and };
}

// ---------------------------------------------------------------- Libellés des actions

export const ACTION_LABELS: Record<string, string> = {
  // Connexions
  "auth.login": "Connexion",
  "auth.login_failed": "Échec de connexion",
  "auth.logout": "Déconnexion",
  "auth.password_link_sent": "Lien de mot de passe envoyé",
  "auth.password_set": "Mot de passe défini",
  "auth.password_changed": "Mot de passe modifié",
  "auth.pharmacy_switched": "Changement d'officine",
  // Facturation
  "billing.invite_sent": "Invitation à s'abonner envoyée",
  "billing.cancel_scheduled": "Fin d'abonnement programmée",
  "billing.cancel_revoked": "Fin d'abonnement annulée",
  "billing.access_suspended": "Accès suspendu",
  "billing.access_restored": "Accès rétabli",
  "billing.plan_saved": "Offre enregistrée",
  "billing.portal_opened": "Portail de facturation ouvert",
  "billing.contract_prepared": "Contrat préparé",
  "billing.contract_price_changed": "Tarif contractuel modifié",
  "billing.subscription_refreshed": "Abonnement resynchronisé avec Stripe",
  "billing.cancellation_created": "Demande de résiliation enregistrée",
  "billing.cancellation_status_changed": "Résiliation : statut modifié",
  "billing.cancellation_note_added": "Résiliation : note ajoutée",
  "billing.cancellation_stripe_scheduled": "Résiliation programmée dans Stripe",
  // Plateforme
  "platform.pharmacy_created": "Officine créée",
  "platform.pharmacy_updated": "Officine modifiée",
  "platform.pharmacy_status_changed": "Statut de l'officine modifié",
  "platform.owner_created": "Compte titulaire créé",
  "platform.member_access_resent": "Accès renvoyé à un membre",
  "platform.member_access_changed": "Accès d'un membre modifié",
  "platform.member_deleted": "Membre supprimé",
  "platform.invitation_sent": "Invitation envoyée",
  "platform.invitation_link_issued": "Lien d'invitation émis",
  "platform.invitation_email_changed": "Adresse d'invitation modifiée",
  "platform.invitation_revoked": "Invitation révoquée",
  "platform.pharmacy_email_changed": "E-mail de l'officine modifié",
  "platform.owner_email_changed": "E-mail du titulaire modifié",
  "platform.owner_welcome_resent": "Accueil du titulaire renvoyé",
  "platform.post_count_changed": "Nombre de postes modifié",
  "platform.admin_created": "Administrateur ajouté",
  "platform.admin_link_resent": "Lien administrateur renvoyé",
  "platform.admin_activated": "Administrateur réactivé",
  "platform.admin_deactivated": "Administrateur désactivé",
  "platform.admin_deleted": "Administrateur supprimé",
  "platform.setting_updated": "Paramètre modifié",
  "platform.note_added": "Note interne ajoutée",
  "platform.note_pinned": "Note interne épinglée",
  "platform.email_sent": "E-mail envoyé",
  "platform.email_test_sent": "E-mail de test envoyé",
  "platform.email_template_saved": "Modèle d'e-mail modifié",
  "platform.email_template_reset": "Modèle d'e-mail rétabli",
  "platform.automation_updated": "Relance automatique réglée",
  "platform.automation_run": "Relances automatiques exécutées",
  "platform.incident_resolved": "Incident résolu",
  // Commercial
  "sales.rep_created": "Commercial créé",
  "sales.rep_updated": "Commercial modifié",
  "sales.rep_invited": "Commercial invité",
  "sales.prospect_created": "Dossier créé",
  "sales.prospect_updated": "Dossier modifié",
  "sales.prospect_status_changed": "Étape du dossier modifiée",
  "sales.prospect_reassigned": "Dossier réattribué",
  "sales.prospect_blocked": "Dossier bloqué ou débloqué",
  "sales.contract_generated": "Contrat généré",
  "sales.contract_sent": "Contrat envoyé",
  "sales.contract_signature_recorded": "Signature enregistrée",
  "sales.contract_event": "Événement de contrat",
  "sales.pharmacy_created": "Officine créée depuis un dossier",
  "sales.commission_updated": "Commission modifiée",
  "sales.company_profile_updated": "Société exploitante modifiée",
  "sales.signature_webhook": "Notification de signature reçue",
  "sales.contract_reminder": "Relance de contrat automatique",
  "sales.subscription_requested": "Demande de souscription",
  "sales.contract_reminded": "Contrat relancé",
  "sales.demo_scheduled": "Démonstration programmée",
  "sales.demo_done": "Démonstration réalisée",
  "sales.demo_canceled": "Démonstration annulée",
  "sales.followup_set": "Relance commerciale programmée",
  // Partenaires
  "partner.application_received": "Candidature partenaire reçue",
  "partner.application_status_changed": "Candidature : statut modifié",
  "partner.application_note_added": "Candidature : note ajoutée",
  "partner.saved": "Partenaire enregistré",
  "partner.status_changed": "Statut du partenaire modifié",
  "partner.contact_saved": "Contact partenaire enregistré",
  "partner.contact_deleted": "Contact partenaire supprimé",
  "partner.contract_saved": "Contrat partenaire enregistré",
  "partner.integration_saved": "Intégration partenaire enregistrée",
  "partner.brand_saved": "Marque enregistrée",
  "partner.brand_status_changed": "Statut de la marque modifié",
  "partner.brand_audience_updated": "Diffusion de la marque modifiée",
  "partner.pilot_updated": "Pilote mis à jour",
  "partner.range_saved": "Gamme enregistrée",
  "partner.product_saved": "Produit partenaire enregistré",
  "partner.product_deleted": "Produit partenaire supprimé",
  "partner.document_saved": "Document partenaire enregistré",
  "partner.offer_saved": "Offre partenaire enregistrée",
  "partner.preference_updated": "Préférence partenaire modifiée",
  "partner.lead_created": "Lead créé",
  "partner.order_created": "Commande créée",
  "partner.order_status_changed": "Statut de commande modifié",
  "partner.orders_exported": "Commandes exportées",
  // Formations et challenges
  "training.saved": "Formation enregistrée",
  "training.archived": "Formation archivée",
  "challenge.saved": "Challenge enregistré",
  "challenge.deleted": "Challenge supprimé",
  "challenge.entry_added": "Saisie de challenge ajoutée",
  "challenge.entry_deleted": "Saisie de challenge retirée",
};

/** L'action en clair ; une action inconnue garde son code, jamais un libellé inventé. */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Les codes d'action dont le libellé contient la recherche (« tarif » → billing.contract_price_changed…). */
export function actionsMatching(q: string): string[] {
  const needle = normalize(q);
  if (needle.length < 3) return [];
  return Object.entries(ACTION_LABELS)
    .filter(([code, label]) => isBusinessAction(code, { platformAdminId: "x" }) && normalize(label).includes(needle))
    .map(([code]) => code);
}

/** La couleur d'une action : les gestes qui retirent ou bloquent en rouge, ceux qui rétablissent en vert. */
export function actionTone(action: string): StatusTone {
  if (/(deleted|suspended|revoked|login_failed|cancel_scheduled|cancellation_created|cancellation_stripe_scheduled|admin_deactivated|blocked)$/.test(action)) return "danger";
  if (/(restored|activated|signature_recorded|demo_done|incident_resolved|cancel_revoked)$/.test(action)) return "success";
  if (/(price_changed|status_changed|reassigned|setting_updated|template_saved|template_reset|automation_updated)$/.test(action)) return "warning";
  return "neutral";
}

// ---------------------------------------------------------------- Entités

export const ENTITY_LABELS: Record<string, string> = {
  Pharmacy: "Officine",
  Prospect: "Dossier",
  Subscription: "Abonnement",
  SubscriptionInvite: "Invitation à s'abonner",
  Contract: "Contrat",
  Plan: "Offre",
  SalesRep: "Commercial",
  Commission: "Commission",
  PlatformAdmin: "Administrateur",
  PlatformSetting: "Paramètre",
  CompanyProfile: "Société exploitante",
  EmailTemplate: "Modèle d'e-mail",
  AutomationRule: "Relance automatique",
  CancellationRequest: "Demande de résiliation",
  AdminNote: "Note interne",
  PlatformIncident: "Incident",
  User: "Compte utilisateur",
  Partner: "Partenaire",
  PartnerApplication: "Candidature partenaire",
  PartnerBrand: "Marque",
  PartnerRange: "Gamme",
  PartnerProduct: "Produit partenaire",
  PartnerOffer: "Offre partenaire",
  PartnerOrder: "Commande",
  PartnerLead: "Lead",
  PartnerContact: "Contact partenaire",
  PartnerContract: "Contrat partenaire",
  PartnerDocument: "Document partenaire",
  PartnerIntegration: "Intégration partenaire",
  TrainingContent: "Formation",
  LabChallenge: "Challenge",
  LabChallengeEntry: "Saisie de challenge",
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

/**
 * Où ouvrir l'entité dans la console. Une officine, un dossier, un abonnement
 * (par sa fiche officine) et les pages de réglage ; `null` quand aucune page
 * ne la montre, plutôt qu'un lien qui mène à une erreur.
 */
export function entityHref(row: { entityType: string; entityId: string | null; pharmacyId?: string | null }): string | null {
  const id = row.entityId ? encodeURIComponent(row.entityId) : null;
  const pharmacy = row.pharmacyId ? encodeURIComponent(row.pharmacyId) : null;
  switch (row.entityType) {
    case "Pharmacy":
      return id ? `/admin/pharmacies/${id}` : null;
    case "Prospect":
      return id ? `/admin/dossiers/${id}` : null;
    case "Subscription":
    case "SubscriptionInvite":
    case "CancellationRequest":
      return pharmacy ? `/admin/pharmacies/${pharmacy}?onglet=abonnement` : row.entityType === "CancellationRequest" ? "/admin/resiliations" : null;
    case "Contract":
      return pharmacy ? `/admin/pharmacies/${pharmacy}?onglet=contrats` : null;
    case "User":
      return pharmacy ? `/admin/pharmacies/${pharmacy}?onglet=utilisateurs` : null;
    case "AdminNote":
      return pharmacy ? `/admin/pharmacies/${pharmacy}?onglet=notes` : null;
    case "SalesRep":
      return id ? `/admin/commerciaux/${id}` : null;
    case "Plan":
      return "/admin/abonnements/offres";
    case "PlatformAdmin":
      return "/admin/equipe";
    case "CompanyProfile":
      return "/admin/societe";
    case "PlatformSetting":
      // La cadence des relances de contrat se règle dans le centre des relances.
      return row.entityId === "contract.reminders" ? "/admin/relances#contrat" : "/admin/parametres";
    case "EmailTemplate":
      return "/admin/emails/modeles";
    case "AutomationRule":
      return "/admin/relances";
    case "PlatformIncident":
      return "/admin/technique";
    case "Partner":
      return id ? `/admin/partenaires/liste/${id}` : null;
    case "PartnerApplication":
      return id ? `/admin/partenaires/candidatures/${id}` : null;
    case "PartnerBrand":
      return id ? `/admin/partenaires/marques/${id}` : null;
    case "PartnerOrder":
    case "PartnerLead":
      return "/admin/partenaires/commandes";
    case "TrainingContent":
      return "/admin/formations";
    case "LabChallenge":
    case "LabChallengeEntry":
      return "/admin/challenges";
    default:
      return null;
  }
}

// ---------------------------------------------------------------- Avant / après

export type DiffEntry = { field: string; label: string; from: string; to: string };
export type ContextEntry = { field: string; label: string; value: string };

export const FIELD_LABELS: Record<string, string> = {
  status: "Statut",
  statut: "Statut",
  isActive: "Actif",
  enabled: "Activée",
  blocked: "Bloqué",
  monthlyPriceCents: "Tarif mensuel",
  annualPriceCents: "Tarif annuel",
  foundingPriceCents: "Tarif fondateur",
  contractPriceCents: "Tarif contractuel",
  priceCents: "Tarif",
  previousCents: "Ancien tarif",
  nextCents: "Nouveau tarif",
  amountCents: "Montant",
  commissionValue: "Commission",
  trialDays: "Jours d'essai",
  discountPercent: "Remise (%)",
  offsetDays: "Délai (jours)",
  firstAfterDays: "Premier rappel (jours)",
  secondAfterDays: "Second rappel (jours)",
  escalateAfterDays: "Signalement à l'équipe (jours)",
  reason: "Motif",
  reasonDetail: "Précision",
  channel: "Canal",
  email: "E-mail",
  firstName: "Prénom",
  lastName: "Nom de famille",
  recipient: "Destinataire",
  subject: "Objet",
  title: "Titre",
  body: "Texte",
  name: "Nom",
  code: "Code",
  planId: "Offre",
  salesRepId: "Commercial",
  templateKey: "Modèle",
  ruleKey: "Règle",
  postCount: "Postes",
  fields: "Champs modifiés",
  invitation: "Invitation",
  units: "Unités",
  occurredOn: "Date",
  provider: "Prestataire",
  scope: "Espace",
  via: "Par",
  plannedEndAt: "Fin prévue",
  effectiveAt: "Date d'effet",
  demoAt: "Démonstration",
  dueAt: "Échéance",
  nextActionAt: "Prochaine relance",
  nextActionLabel: "Relance prévue",
  appliedToStripe: "Appliqué dans Stripe",
  pinned: "Épinglée",
  wasCustomized: "Texte déjà personnalisé",
  pharmacyId: "Officine",
  contractId: "Contrat",
  count: "Nombre",
  sent: "Envoyés",
  failed: "Échecs",
  skipped: "Ignorés",
  value: "Valeur",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

const MAX_TEXT = 160;
// Clés jamais affichées, même dans une famille autorisée : un jeton ou un
// secret n'a rien à faire à l'écran, même tronqué.
const HIDDEN_KEY = /(token|secret|password|passwd|hash|apikey|api_key|^ip(address)?$|^useragent$)/i;
// Clés déjà montrées ailleurs dans la ligne (auteur, officine liée) ou par l'avant / après.
const RESERVED_KEYS = new Set(["changes", "before", "after", "from", "to", "salesRepId", "pharmacyId"]);

const GENERIC_CODES: Record<string, string> = {
  SENT: "Envoyé",
  SIMULATED: "Simulé (non transmis)",
  FAILED: "Échec",
  SKIPPED: "Ignoré",
  INTERNAL: "Interne",
  NONE: "Aucun",
};

function codeMapsFor(action: string): Record<string, string>[] {
  const labels = (record: Record<string, { label: string }>) => Object.fromEntries(Object.entries(record).map(([k, v]) => [k, v.label]));
  if (action.includes("cancellation")) return [labels(CANCELLATION_STATUS_LABELS), CANCELLATION_REASONS, CANCELLATION_CHANNELS];
  if (action.startsWith("sales.prospect") || action.startsWith("sales.demo") || action.startsWith("sales.followup")) return [PROSPECT_STATUS_LABELS];
  if (action.includes("contract")) return [CONTRACT_STATUS_LABELS];
  if (action.startsWith("billing.")) return [labels(SUBSCRIPTION_STATUS_LABELS), labels(PAYMENT_STATUS_LABELS)];
  if (action.includes("email")) return [labels(DISPATCH_STATUS)];
  return [];
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Une valeur de métadonnée, en clair : euros, oui / non, dates, statuts nommés. */
export function formatJournalValue(field: string, value: unknown, action = "", timeZone = "Europe/Paris"): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") {
    if (/cents$/i.test(field) || field === "commissionValue") return Number.isFinite(value) ? formatEuros(Math.round(value)) : String(value);
    return new Intl.NumberFormat("fr-FR").format(value);
  }
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return "lien (masqué)";
    if (DATE_ONLY.test(value)) {
      const [y, m, d] = value.split("-");
      return `${d}/${m}/${y}`;
    }
    if (DATE_TIME.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("fr-FR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
    }
    if (/^[A-Z][A-Z_]+$/.test(value)) {
      for (const map of codeMapsFor(action)) if (map[value]) return map[value];
      if (GENERIC_CODES[value]) return GENERIC_CODES[value];
    }
    return truncate(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return truncate(value.map((item) => (typeof item === "string" ? fieldLabel(item) : formatJournalValue(field, item, action, timeZone))).join(", "));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([k]) => !HIDDEN_KEY.test(k));
    if (entries.length === 0) return "—";
    return truncate(entries.map(([k, v]) => `${fieldLabel(k)} : ${typeof v === "object" && v !== null ? "…" : formatJournalValue(k, v, action, timeZone)}`).join(" · "));
  }
  return truncate(String(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Le champ concerné par un `from` / `to` de premier niveau, deviné depuis l'action. */
function topLevelField(action: string): string {
  if (/status/.test(action)) return "status";
  if (/reassigned/.test(action)) return "salesRepId";
  if (/price/.test(action)) return "priceCents";
  return "value";
}

/**
 * L'avant / l'après d'une ligne, quel que soit le format consigné :
 * `changes: { champ: { from, to } }`, `before` / `after` (objets ou valeurs),
 * ou `from` / `to` au premier niveau. Rien de modifié : liste vide.
 *
 * Quand `changes` est consigné, il fait foi : `before` / `after` ne sont alors
 * que des instantanés de contexte (le changement de tarif y garde la source du
 * tarif, absente de l'après), et les comparer afficherait des valeurs
 * « effacées » qui ne l'ont pas été. Un champ n'est jamais rendu deux fois.
 */
export function diffEntries(metadata: unknown, action = "", timeZone = "Europe/Paris"): DiffEntry[] {
  if (!isPlainObject(metadata)) return [];
  const out: DiffEntry[] = [];
  const seen = new Set<string>();
  const push = (field: string, from: unknown, to: unknown) => {
    if (seen.has(field) || HIDDEN_KEY.test(field) || same(from, to)) return;
    seen.add(field);
    out.push({ field, label: fieldLabel(field), from: formatJournalValue(field, from, action, timeZone), to: formatJournalValue(field, to, action, timeZone) });
  };

  let hasChanges = false;
  if (isPlainObject(metadata.changes)) {
    for (const [field, change] of Object.entries(metadata.changes)) {
      if (isPlainObject(change) && ("from" in change || "to" in change)) {
        hasChanges = true;
        push(field, change.from, change.to);
      }
    }
  }

  if (!hasChanges && ("before" in metadata || "after" in metadata)) {
    const { before, after } = metadata;
    if (isPlainObject(before) || isPlainObject(after)) {
      const b = isPlainObject(before) ? before : {};
      const a = isPlainObject(after) ? after : {};
      for (const field of new Set([...Object.keys(b), ...Object.keys(a)])) push(field, b[field], a[field]);
    } else {
      push("value", before, after);
    }
  }

  if ("from" in metadata || "to" in metadata) push(topLevelField(action), metadata.from, metadata.to);

  return out;
}

/**
 * Le contexte d'une ligne : ses autres métadonnées simples (statut d'envoi,
 * destinataire, motif…), en clair et tronquées. Les clés sensibles et les
 * structures imbriquées sont écartées.
 */
export function contextEntries(metadata: unknown, action = "", limit = 6, timeZone = "Europe/Paris"): ContextEntry[] {
  if (!isPlainObject(metadata)) return [];
  const out: ContextEntry[] = [];
  for (const [field, value] of Object.entries(metadata)) {
    if (out.length >= limit) break;
    if (RESERVED_KEYS.has(field) || HIDDEN_KEY.test(field)) continue;
    if (value === null || value === undefined || value === "") continue;
    if (isPlainObject(value)) continue;
    if (Array.isArray(value) && value.some((item) => typeof item === "object" && item !== null)) continue;
    out.push({ field, label: fieldLabel(field), value: formatJournalValue(field, value, action, timeZone) });
  }
  return out;
}

// ---------------------------------------------------------------- Regroupement

/** Regroupe des lignes déjà triées par jour (fuseau de Paris), dans l'ordre reçu. */
export function groupByDay<T extends { at: Date }>(rows: T[], timeZone = "Europe/Paris"): { day: string; label: string; rows: T[] }[] {
  const keyOf = new Intl.DateTimeFormat("fr-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const labelOf = new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const out: { day: string; label: string; rows: T[] }[] = [];
  for (const row of rows) {
    const day = keyOf.format(row.at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else out.push({ day, label: labelOf.format(row.at), rows: [row] });
  }
  return out;
}

/** Numéro de page lu dans l'adresse : entier ≥ 1, sinon 1. */
export function parsePage(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}
