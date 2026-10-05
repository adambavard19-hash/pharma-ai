/**
 * Les campagnes de la console : un message, des destinataires professionnels
 * (officines ou partenaires), éventuellement une offre chiffrée (bonus ou
 * parrainage), envoyé maintenant ou à un jour choisi.
 *
 * Ce module est pur : les règles de validation, les textes par défaut, le
 * rendu du message et les dates. La lecture des destinataires, l'envoi et les
 * écritures sont côté serveur (`src/server/services/admin/campaigns.ts`).
 *
 * Trois garde-fous vivent ici :
 *   1. l'offre est honnête : le montant écrit dans le message vient de la même
 *      valeur que celle appliquée (`{{montant_offre}}`), et un montant tapé à
 *      la main dans le texte qui ne lui serait pas égal est refusé ;
 *   2. un message ne part jamais avec une variable inconnue ni avec une
 *      accolade `{{` non remplacée ;
 *   3. une campagne ne s'adresse qu'à un côté (officines ou partenaires) : ses
 *      variables, son bouton et sa notification dans l'application en dépendent.
 */
import { renderEmail, type EmailBlock, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";
import { fillVariables, variablesIn } from "@/core/admin/email-templates";
import type { StatusLabel } from "@/core/admin/statuses";
import { REFERRAL_DISCOUNT_CENTS } from "@/core/billing/referral";
import { formatEuros } from "@/core/billing/subscription";
import { addDays, calendarDay, daysBetween, isCalendarDay, zonedDayStart, type DayKey } from "@/core/challenges/dates";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { TIME_ZONE } from "@/config/constants";

export type CampaignKindKey = "BONUS_OFFER" | "REFERRAL_OFFER" | "PARTNER_INVITATION" | "ANNOUNCEMENT";
export type CampaignSide = "PHARMACY" | "PARTNER";
export type AudienceKey =
  | "pharmacies.all_active"
  | "pharmacies.trialing"
  | "pharmacies.subscribed"
  | "pharmacies.without_referrals"
  | "pharmacies.selected"
  | "partners.contacts"
  | "partners.without_brand"
  | "partners.applications_open"
  | "partners.selected";
export type ButtonTargetKey = "espace" | "parrainage" | "candidature";

/** Au-delà, une campagne est refusée : on la découpe en segments. */
export const CAMPAIGN_MAX_RECIPIENTS = 2000;
/** Le mot à retaper pour confirmer un envoi (ou une programmation). */
export const CAMPAIGN_CONFIRMATION_WORD = "ENVOYER";
/** La programmation commence demain et ne va pas au-delà de 90 jours. */
export const SCHEDULE_MAX_DAYS = 90;

/** Le mot de confirmation, retapé : sans égard à la casse ni aux espaces autour. */
export function isCampaignConfirmation(typed: string): boolean {
  return typed.trim().toUpperCase() === CAMPAIGN_CONFIRMATION_WORD;
}

const PLACEHOLDER_BODY = "Écrivez ici votre message.";

export const CAMPAIGN_KINDS: Record<
  CampaignKindKey,
  {
    label: string;
    description: string;
    side: CampaignSide[];
    needsAmount: boolean;
    amountLabel?: string;
    amountBoundsCents?: { min: number; max: number };
    defaultButton: ButtonTargetKey | null;
    defaults: { subject: string; title: string; body: string; buttonLabel: string | null; audience: AudienceKey };
  }
> = {
  BONUS_OFFER: {
    label: "Offre bonus",
    description: "Un message d'offre avec un montant et des conditions écrits. Le bonus est appliqué à la main par l'équipe : aucun crédit automatique n'existe.",
    side: ["PHARMACY"],
    needsAmount: true,
    amountLabel: "Montant du bonus",
    amountBoundsCents: { min: 100, max: 200_000 },
    defaultButton: "espace",
    defaults: {
      subject: "Un bonus pour {{officine}}",
      title: "Un bonus de {{montant_offre}} pour {{officine}}",
      body: "Bonjour {{prenom}},\n\nPour remercier les officines qui travaillent avec PharmaBoost, nous accordons à {{officine}} un bonus de {{montant_offre}}, valable jusqu'au {{date_fin_offre}}.\n\nConditions : {{conditions_offre}}\n\nCe bonus est appliqué à la main par notre équipe : il n'est pas déduit automatiquement de votre abonnement. Pour qu'il soit pris en compte, répondez simplement à cet e-mail ou écrivez-nous à {{contact}}.",
      buttonLabel: "Ouvrir mon espace",
      audience: "pharmacies.all_active",
    },
  },
  REFERRAL_OFFER: {
    label: "Offre de parrainage",
    description: "Le montant par filleul et par mois est réellement appliqué aux officines qui s'inscrivent pendant l'offre. Les filleuls déjà inscrits gardent leur montant.",
    side: ["PHARMACY"],
    needsAmount: true,
    amountLabel: "Montant par filleul et par mois",
    amountBoundsCents: { min: 100, max: 50_000 },
    defaultButton: "parrainage",
    defaults: {
      subject: "Parrainage : {{montant_offre}} par filleul et par mois",
      title: "Parrainez une officine, {{montant_offre}} par mois",
      body: "Bonjour {{prenom}},\n\nChaque officine que {{officine}} parraine et qui s'abonne à PharmaBoost pendant cette offre réduit votre abonnement de {{montant_offre}} par mois, tant qu'elle reste abonnée.\n\nVotre code de parrainage : {{code_parrainage}}\nVotre lien à partager : {{lien_parrainage}}\n\nCe montant s'applique aux officines qui s'inscrivent pendant l'offre. Les officines déjà parrainées gardent le montant prévu à leur inscription, et votre abonnement ne descend jamais en dessous de zéro.",
      buttonLabel: "Voir mon code de parrainage",
      audience: "pharmacies.all_active",
    },
  },
  PARTNER_INVITATION: {
    label: "Invitation des partenaires",
    description: "Invite un laboratoire ou une société de santé à présenter sa gamme sur PharmaBoost, par le formulaire de candidature.",
    side: ["PARTNER"],
    needsAmount: false,
    defaultButton: "candidature",
    defaults: {
      subject: "Présentez votre gamme aux officines PharmaBoost",
      title: "Référencez votre gamme sur PharmaBoost",
      body: "Bonjour {{prenom}},\n\nPharmaBoost réunit des officines et des laboratoires partenaires. {{nom_partenaire}} peut y présenter sa gamme : il suffit de remplir le formulaire de candidature en ligne. Notre équipe étudie chaque dossier et revient vers vous ; rien n'est activé automatiquement.\n\nUn principe ne change pas : un partenaire n'achète jamais une recommandation. PharmaBoost ne vend aucune recommandation, et la présentation d'une gamme n'a aucun effet sur les conseils faits aux patients.\n\nPour toute question, écrivez-nous à {{contact}}.",
      buttonLabel: "Déposer ma candidature",
      audience: "partners.without_brand",
    },
  },
  ANNOUNCEMENT: {
    label: "Annonce",
    description: "Une information de l'équipe PharmaBoost, sans offre chiffrée, aux officines ou aux partenaires.",
    side: ["PHARMACY", "PARTNER"],
    needsAmount: false,
    defaultButton: null,
    defaults: {
      subject: "Une information de l'équipe PharmaBoost",
      title: "Une information de l'équipe PharmaBoost",
      body: `Bonjour {{prenom}},\n\n${PLACEHOLDER_BODY}`,
      buttonLabel: null,
      audience: "pharmacies.all_active",
    },
  },
};

export const CAMPAIGN_KIND_KEYS = Object.keys(CAMPAIGN_KINDS) as CampaignKindKey[];

export const CAMPAIGN_AUDIENCES: Record<AudienceKey, { label: string; description: string; side: CampaignSide; needsSelection: boolean }> = {
  "pharmacies.all_active": { label: "Toutes les officines actives", description: "Les officines actives, hors démonstration. Le titulaire actif reçoit le message ; à défaut, l'e-mail de l'officine.", side: "PHARMACY", needsSelection: false },
  "pharmacies.trialing": { label: "Officines en essai", description: "Les officines dont l'abonnement est en période d'essai.", side: "PHARMACY", needsSelection: false },
  "pharmacies.subscribed": { label: "Officines abonnées", description: "Les officines dont l'abonnement est actif (essai et impayés exclus).", side: "PHARMACY", needsSelection: false },
  "pharmacies.without_referrals": { label: "Officines sans filleul", description: "Les officines actives qui n'ont encore parrainé personne.", side: "PHARMACY", needsSelection: false },
  "pharmacies.selected": { label: "Officines choisies", description: "Les officines que vous sélectionnez une à une.", side: "PHARMACY", needsSelection: true },
  "partners.contacts": { label: "Contacts des partenaires", description: "Tous les contacts avec une adresse e-mail des partenaires non archivés ni suspendus.", side: "PARTNER", needsSelection: false },
  "partners.without_brand": { label: "Partenaires sans marque", description: "Les contacts des partenaires qui n'ont encore référencé aucune marque.", side: "PARTNER", needsSelection: false },
  "partners.applications_open": { label: "Candidatures en cours", description: "Les candidats dont le dossier est nouveau, en étude, contacté ou en négociation. Jamais un dossier refusé.", side: "PARTNER", needsSelection: false },
  "partners.selected": { label: "Partenaires choisis", description: "Les partenaires que vous sélectionnez un à un : tous leurs contacts avec une adresse e-mail.", side: "PARTNER", needsSelection: true },
};

export const AUDIENCE_KEYS = Object.keys(CAMPAIGN_AUDIENCES) as AudienceKey[];

export type CampaignVariable = { key: string; label: string; sample: string };

/** Les variables d'une offre : leur valeur vient du brouillon, pas du destinataire. */
const OFFER_VARIABLE_KEYS = ["montant_offre", "date_fin_offre", "conditions_offre"];

export const CAMPAIGN_VARIABLES: Record<CampaignSide, CampaignVariable[]> = {
  PHARMACY: [
    { key: "prenom", label: "Prénom du titulaire", sample: "Camille" },
    { key: "titulaire", label: "Nom complet du titulaire", sample: "Camille Martin" },
    { key: "officine", label: "Nom de l'officine", sample: "Pharmacie de la Passerelle" },
    { key: "contact", label: "Adresse de contact PharmaBoost", sample: PUBLIC_CONTACT_EMAIL },
    { key: "lien_espace", label: "Lien vers l'espace PharmaBoost", sample: "https://pharmaboost.app/parametres?onglet=abonnement" },
    { key: "montant_offre", label: "Montant de l'offre", sample: formatEuros(2000) },
    { key: "date_fin_offre", label: "Date de fin de l'offre", sample: "31 octobre 2026" },
    { key: "conditions_offre", label: "Conditions de l'offre", sample: "Offre réservée aux officines abonnées." },
    { key: "code_parrainage", label: "Code de parrainage de l'officine", sample: "PB-AB23CD" },
    { key: "lien_parrainage", label: "Lien de parrainage de l'officine", sample: "https://pharmaboost.app/decouvrir/abonnement?parrain=PB-AB23CD" },
  ],
  PARTNER: [
    { key: "prenom", label: "Prénom du contact", sample: "Claire" },
    { key: "nom_partenaire", label: "Nom du laboratoire ou de la société", sample: "Laboratoire Exemple" },
    { key: "contact", label: "Adresse de contact PharmaBoost", sample: PUBLIC_CONTACT_EMAIL },
    { key: "lien_candidature", label: "Lien du formulaire de candidature", sample: "https://pharmaboost.app/decouvrir/partenaires" },
  ],
};

/** Les variables qu'un type de campagne peut citer pour un côté : sans offre chiffrée, pas de variable d'offre. */
export function campaignVariablesFor(kind: CampaignKindKey, side: CampaignSide): CampaignVariable[] {
  return CAMPAIGN_VARIABLES[side].filter((v) => CAMPAIGN_KINDS[kind].needsAmount || !OFFER_VARIABLE_KEYS.includes(v.key));
}

export const CAMPAIGN_BUTTON_TARGETS: Record<ButtonTargetKey, { label: string; side: CampaignSide }> = {
  espace: { label: "L'espace PharmaBoost de l'officine", side: "PHARMACY" },
  parrainage: { label: "Le code de parrainage, dans l'espace de l'officine", side: "PHARMACY" },
  candidature: { label: "Le formulaire de candidature des partenaires", side: "PARTNER" },
};

export const CAMPAIGN_STATUS_LABELS: Record<string, StatusLabel> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  SCHEDULED: { label: "Programmée", tone: "brand" },
  SENDING: { label: "Envoi en cours", tone: "info" },
  SENT: { label: "Envoyée", tone: "success" },
  CANCELED: { label: "Annulée", tone: "danger" },
};

export const CAMPAIGN_RECIPIENT_STATUS_LABELS: Record<string, StatusLabel> = {
  PENDING: { label: "En attente", tone: "neutral" },
  SENDING: { label: "En cours", tone: "info" },
  SENT: { label: "Envoyé", tone: "success" },
  SIMULATED: { label: "Simulé, non parti", tone: "warning" },
  FAILED: { label: "Échec", tone: "danger" },
  SKIPPED: { label: "Ignoré", tone: "neutral" },
};

// ---------------------------------------------------------------- Brouillon

export type CampaignDraftInput = {
  kind: CampaignKindKey;
  /** Nom interne, visible dans la console seulement. */
  name: string;
  subject: string;
  title: string;
  body: string;
  buttonLabel: string | null;
  buttonTarget: ButtonTargetKey | null;
  audience: AudienceKey;
  audienceParams: { pharmacyIds?: string[]; partnerIds?: string[] };
  alsoInApp: boolean;
  offerAmountCents: number | null;
  /** Le dernier instant de l'offre : 23 h 59 (heure de Paris) du jour choisi. */
  offerEndsAt: Date | null;
  offerConditions: string | null;
};

export type CampaignDraftResult = { ok: true; value: CampaignDraftInput; warnings: string[] } | { ok: false; error: string };

const longDate = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const longDateWithWeekday = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" });

const isDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

/** Le texte d'une saisie : une chaîne rognée, jamais autre chose. */
function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const hasKey = <T extends object>(table: T, key: unknown): key is keyof T => typeof key === "string" && Object.hasOwn(table, key);

/** Une date de fin saisie (jour « AAAA-MM-JJ », date ou instant) : le dernier instant de ce jour à Paris. `"invalid"` si illisible. */
function endOfOfferDay(value: unknown): Date | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  let day: DayKey;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    day = value.trim();
    if (!isCalendarDay(day)) return "invalid";
  } else {
    const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
    if (!isDate(date)) return "invalid";
    day = calendarDay(date, TIME_ZONE);
  }
  return new Date(zonedDayStart(addDays(day, 1), TIME_ZONE).getTime() - 1);
}

/** Les montants en euros écrits à la main dans un texte (« 20 € », « 12,50 euros »), en centimes. */
function eurosWrittenIn(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(/(\d{1,3}(?:[\s  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:€|euros?\b)/gi)) {
    const whole = Number(match[1].replace(/[\s  ]/g, ""));
    const cents = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
    amounts.push(whole * 100 + cents);
  }
  return amounts;
}

/** Les identifiants choisis à la main : des chaînes courtes, sans doublon. */
function idsOf(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const ids = value.map((v) => (typeof v === "string" ? v.trim() : ""));
  if (ids.some((id) => !id || id.length > 60)) return null;
  return [...new Set(ids)];
}

/**
 * Contrôle d'un brouillon. Rend la valeur normalisée (textes rognés, date de
 * fin au dernier instant du jour, champs d'offre vidés pour un type sans
 * offre) et des avertissements non bloquants, ou la première erreur. `now`
 * sert à refuser une date de fin passée.
 */
export function validateCampaignDraft(raw: unknown, now: Date = new Date()): CampaignDraftResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Demande invalide." };
  const r = raw as Record<string, unknown>;

  if (!hasKey(CAMPAIGN_KINDS, r.kind)) return { ok: false, error: "Type de campagne inconnu." };
  const kind: CampaignKindKey = r.kind;
  const definition = CAMPAIGN_KINDS[kind];
  if (!hasKey(CAMPAIGN_AUDIENCES, r.audience)) return { ok: false, error: "Public inconnu." };
  const audience: AudienceKey = r.audience;
  const side = CAMPAIGN_AUDIENCES[audience].side;
  if (!definition.side.includes(side)) return { ok: false, error: `Ce type de campagne (${definition.label}) ne s'adresse pas ${side === "PHARMACY" ? "aux officines" : "aux partenaires"}.` };

  const name = textOf(r.name);
  if (name.length < 3 || name.length > 120) return { ok: false, error: "Le nom de la campagne doit compter entre 3 et 120 caractères." };
  const subject = textOf(r.subject);
  if (subject.length < 3 || subject.length > 160) return { ok: false, error: "L'objet doit compter entre 3 et 160 caractères." };
  const title = textOf(r.title);
  if (title.length < 3 || title.length > 120) return { ok: false, error: "Le titre doit compter entre 3 et 120 caractères." };
  // Un saut de ligne dans l'objet ouvrirait la porte à l'injection d'en-têtes.
  if (/[\r\n]/.test(subject) || /[\r\n]/.test(title)) return { ok: false, error: "L'objet et le titre tiennent sur une seule ligne." };
  const body = (typeof r.body === "string" ? r.body : "").replace(/\r\n/g, "\n").trim();
  if (body.length < 10 || body.length > 5000) return { ok: false, error: "Le texte doit compter entre 10 et 5 000 caractères." };
  if (body.includes(PLACEHOLDER_BODY)) return { ok: false, error: "Le texte d'exemple n'a pas été remplacé : écrivez votre message." };

  // Les identifiants ne sont lus que pour un public « choisi » : rien d'autre ne traverse.
  const audienceParams: CampaignDraftInput["audienceParams"] = {};
  if (CAMPAIGN_AUDIENCES[audience].needsSelection) {
    const field = side === "PHARMACY" ? "pharmacyIds" : "partnerIds";
    const params = r.audienceParams && typeof r.audienceParams === "object" ? (r.audienceParams as Record<string, unknown>) : {};
    const ids = idsOf(params[field]);
    if (ids === null) return { ok: false, error: "Sélection de destinataires invalide." };
    if (ids.length === 0) return { ok: false, error: side === "PHARMACY" ? "Choisissez au moins une officine." : "Choisissez au moins un partenaire." };
    if (ids.length > CAMPAIGN_MAX_RECIPIENTS) return { ok: false, error: `Au plus ${CAMPAIGN_MAX_RECIPIENTS.toLocaleString("fr-FR")} destinataires par campagne.` };
    audienceParams[field] = ids;
  }

  const buttonLabel = textOf(r.buttonLabel) || null;
  const buttonTarget = r.buttonTarget === null || r.buttonTarget === undefined || r.buttonTarget === "" ? null : r.buttonTarget;
  if (buttonTarget !== null && !hasKey(CAMPAIGN_BUTTON_TARGETS, buttonTarget)) return { ok: false, error: "Destination du bouton inconnue." };
  if (buttonLabel && !buttonTarget) return { ok: false, error: "Choisissez où mène le bouton, ou retirez son texte." };
  if (buttonTarget && !buttonLabel) return { ok: false, error: "Écrivez le texte du bouton, ou retirez sa destination." };
  if (buttonLabel && buttonLabel.length > 60) return { ok: false, error: "Le texte du bouton compte au plus 60 caractères." };
  if (buttonTarget && CAMPAIGN_BUTTON_TARGETS[buttonTarget as ButtonTargetKey].side !== side) return { ok: false, error: "Ce bouton ne mène nulle part pour ce public : choisissez une destination qui lui correspond." };

  const alsoInApp = r.alsoInApp === true;
  if (alsoInApp && side !== "PHARMACY") return { ok: false, error: "Une notification dans l'application n'existe que pour les officines." };

  let offerAmountCents: number | null = null;
  let offerEndsAt: Date | null = null;
  let offerConditions: string | null = null;
  if (definition.needsAmount) {
    const bounds = definition.amountBoundsCents!;
    const amount = r.offerAmountCents;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < bounds.min || amount > bounds.max) {
      return { ok: false, error: `Le montant doit être compris entre ${formatEuros(bounds.min)} et ${formatEuros(bounds.max)}.` };
    }
    offerAmountCents = amount;
    const ends = endOfOfferDay(r.offerEndsAt);
    if (ends === "invalid") return { ok: false, error: "La date de fin de l'offre est illisible." };
    if (ends && ends.getTime() <= now.getTime()) return { ok: false, error: "La date de fin de l'offre doit être dans le futur." };
    offerEndsAt = ends;
    // Les conditions se lisent sur une ligne : elles se glissent dans une phrase.
    offerConditions = textOf(r.offerConditions).replace(/\s+/g, " ") || null;
    if (offerConditions && offerConditions.length > 500) return { ok: false, error: "Les conditions comptent au plus 500 caractères." };
  }

  const text = `${subject}\n${title}\n${body}`;
  const used = variablesIn(text);
  const allowed = campaignVariablesFor(kind, side).map((v) => v.key);
  const unknown = used.filter((key) => !allowed.includes(key));
  if (unknown.length) return { ok: false, error: `Variable inconnue pour ce public : ${unknown.map((k) => `{{${k}}}`).join(", ")}. Disponibles : ${allowed.map((k) => `{{${k}}}`).join(", ")}.` };
  // Une accolade double restée seule (« {{prenom », « {{Prenom}} ») partirait telle quelle chez le destinataire.
  if (/\{\{|\}\}/.test(text.replace(/\{\{\s*[a-z_]+\s*\}\}/g, ""))) return { ok: false, error: "Une accolade double est mal formée : écrivez les variables sous la forme {{nom}}, en minuscules." };
  if (used.includes("date_fin_offre") && !offerEndsAt) return { ok: false, error: "Le texte cite {{date_fin_offre}} : choisissez une date de fin, ou retirez la variable." };
  if (used.includes("conditions_offre") && !offerConditions) return { ok: false, error: "Le texte cite {{conditions_offre}} : écrivez les conditions, ou retirez la variable." };

  // Le montant du message est celui de l'offre : un autre montant tapé à la main serait une promesse que rien n'applique.
  if (offerAmountCents !== null) {
    const accepted = new Set([offerAmountCents, ...(kind === "REFERRAL_OFFER" ? [REFERRAL_DISCOUNT_CENTS] : [])]);
    const stray = eurosWrittenIn(text).find((cents) => !accepted.has(cents));
    if (stray !== undefined) return { ok: false, error: `Le texte cite un montant (${formatEuros(stray)}) qui n'est pas celui de l'offre (${formatEuros(offerAmountCents)}). Écrivez {{montant_offre}} : le message annonce alors toujours le montant appliqué.` };
  }

  const warnings: string[] = [];
  if (offerAmountCents !== null) {
    if (!used.includes("montant_offre") && !eurosWrittenIn(text).includes(offerAmountCents)) warnings.push("Le message ne mentionne pas le montant de l'offre : écrivez {{montant_offre}}.");
    if (offerEndsAt && !used.includes("date_fin_offre")) warnings.push("Une date de fin est choisie mais le message ne la dit pas : écrivez {{date_fin_offre}}.");
    if (offerConditions && !used.includes("conditions_offre")) warnings.push("Des conditions sont écrites mais le message ne les dit pas : écrivez {{conditions_offre}}.");
  }
  if (kind === "REFERRAL_OFFER" && offerAmountCents !== null) {
    if (offerAmountCents < REFERRAL_DISCOUNT_CENTS) warnings.push(`Ce montant est inférieur au montant standard (${formatEuros(REFERRAL_DISCOUNT_CENTS)}) : pendant l'offre, chaque nouveau filleul rapportera moins que d'habitude.`);
    if (offerAmountCents === REFERRAL_DISCOUNT_CENTS && !offerEndsAt) warnings.push("Ce montant est le montant standard, sans date de fin : aucune offre ne sera créée, le message ne fait que rappeler le parrainage.");
  }

  return {
    ok: true,
    value: { kind, name, subject, title, body, buttonLabel, buttonTarget: buttonTarget as ButtonTargetKey | null, audience, audienceParams, alsoInApp, offerAmountCents, offerEndsAt, offerConditions },
    warnings,
  };
}

// ---------------------------------------------------------------- Valeurs et rendu

/** Une valeur de variable : sur une ligne, sans accolades doubles (jamais une variable « fabriquée » par une valeur). */
function cleanValue(value: string): string {
  return value.replace(/[{}]{2,}/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Les valeurs d'une campagne : celles de l'offre (le montant appliqué, la date
 * de fin, les conditions) et celles du destinataire. Celles de l'offre
 * l'emportent. Une valeur absente n'est pas inventée : la variable reste vide.
 */
export function campaignValues(offer: Pick<CampaignDraftInput, "offerAmountCents" | "offerEndsAt" | "offerConditions">, recipient: Record<string, string | null | undefined> = {}): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(recipient)) if (value !== null && value !== undefined) values[key] = cleanValue(value);
  if (offer.offerAmountCents !== null) values.montant_offre = formatEuros(offer.offerAmountCents);
  if (offer.offerEndsAt) values.date_fin_offre = longDate.format(offer.offerEndsAt);
  if (offer.offerConditions) values.conditions_offre = cleanValue(offer.offerConditions);
  return values;
}

/** Les valeurs d'exemple d'un côté, pour l'aperçu : l'offre du brouillon, elle, est réelle. */
export function sampleCampaignValues(side: CampaignSide, offer: Pick<CampaignDraftInput, "offerAmountCents" | "offerEndsAt" | "offerConditions">): Record<string, string> {
  return campaignValues(offer, Object.fromEntries(CAMPAIGN_VARIABLES[side].map((v) => [v.key, v.sample])));
}

/** Le corps d'un message en paragraphes (séparés par une ligne vide), variables remplacées ; un paragraphe devenu vide disparaît. */
export function campaignParagraphs(body: string, values: Record<string, string>): string[] {
  return fillVariables(body, values)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export type CampaignRenderOptions = {
  /** L'identité de l'expéditeur (société) dans le pied de page légal. */
  context: EmailContext;
  buttonUrl: string | null;
  /** L'adresse « Ne plus recevoir ces offres », dite en pied de page. */
  unsubscribeUrl: string | null;
  eyebrow?: string;
  /** Pourquoi ce message, en pied de page. */
  reason?: string;
};

/**
 * Le message d'une campagne dans le gabarit PharmaBoost : corps en
 * paragraphes (séparés par une ligne vide), bouton s'il a un libellé et une
 * adresse, pied de page avec le lien de désinscription. Une variable sans
 * valeur devient vide, jamais « {{x}} » chez le destinataire.
 */
export function renderCampaignEmail(c: Pick<CampaignDraftInput, "subject" | "title" | "body" | "buttonLabel">, values: Record<string, string>, options: CampaignRenderOptions): RenderedEmail {
  const paragraphs = campaignParagraphs(c.body, values);
  const blocks: EmailBlock[] = paragraphs.map((p) => ({ kind: "paragraph", text: p }));
  if (c.buttonLabel && options.buttonUrl) blocks.push({ kind: "button", url: options.buttonUrl, label: c.buttonLabel });
  return renderEmail(options.context, {
    subject: fillVariables(c.subject, values).trim(),
    preheader: paragraphs[1] ?? paragraphs[0] ?? "",
    eyebrow: options.eyebrow ?? "PharmaBoost",
    title: fillVariables(c.title, values).trim(),
    blocks,
    reason: options.reason ?? "Vous recevez ce message de la part de l'équipe PharmaBoost.",
    unsubscribeUrl: options.unsubscribeUrl,
  });
}

// ---------------------------------------------------------------- Programmation

/** La programmation se fait au jour calendaire (Paris) : demain au plus tôt, 90 jours au plus tard. */
export function validateScheduleDate(date: Date, now: Date): string | null {
  if (!isDate(date)) return "Date illisible.";
  const days = daysBetween(calendarDay(now, TIME_ZONE), calendarDay(date, TIME_ZONE));
  if (days < 1) return "Choisissez une date à partir de demain : pour envoyer aujourd'hui, utilisez l'envoi immédiat.";
  if (days > SCHEDULE_MAX_DAYS) return `La programmation va jusqu'à ${SCHEDULE_MAX_DAYS} jours à l'avance.`;
  return null;
}

/** « Envoi demain, mardi 6 octobre 2026, au passage quotidien du matin (heure de Paris). » */
export function describeSchedule(date: Date, now: Date): string {
  const days = daysBetween(calendarDay(now, TIME_ZONE), calendarDay(date, TIME_ZONE));
  if (days < 0) return `Date dépassée (${longDate.format(date)}).`;
  const when = days === 0 ? "aujourd'hui" : days === 1 ? "demain" : `dans ${days} jours`;
  return `Envoi ${when}, ${longDateWithWeekday.format(date)}, au passage quotidien du matin (heure de Paris).`;
}
