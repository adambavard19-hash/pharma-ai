/**
 * La logique de l'assistant de campagne, sans React ni base : les étapes, ce
 * qui bloque chacune, la conversion euros / centimes, les dates de
 * programmation. L'écran (`wizard.tsx`) ne fait que la montrer.
 *
 * Ce module GUIDE, il ne tranche pas : le domaine (`validateCampaignDraft`) et
 * le serveur restent seuls juges d'un brouillon. Les contrôles d'étape
 * ci-dessous évitent surtout de laisser avancer quelqu'un qui n'a pas encore
 * répondu à la question posée.
 */
import {
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_BUTTON_TARGETS,
  CAMPAIGN_KINDS,
  CAMPAIGN_MAX_RECIPIENTS,
  AUDIENCE_KEYS,
  SCHEDULE_MAX_DAYS,
  describeSchedule,
  validateCampaignDraft,
  validateScheduleDate,
  type AudienceKey,
  type ButtonTargetKey,
  type CampaignDraftResult,
  type CampaignKindKey,
  type CampaignSide,
} from "@/core/admin/campaigns";
import { formatEuros } from "@/core/billing/subscription";
import { addDays, calendarDay, isCalendarDay, zonedDayStart, type DayKey } from "@/core/challenges/dates";
import { TIME_ZONE } from "@/config/constants";
import type { CampaignDraftPayload } from "@/server/actions/admin-campaigns";

// ---------------------------------------------------------------- Étapes

export const WIZARD_STEPS = ["type", "audience", "message", "offer", "send"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_LABELS: Record<WizardStep, string> = {
  type: "Type",
  audience: "Destinataires",
  message: "Message",
  offer: "Offre",
  send: "Envoi",
};

/** Les étapes d'un type de campagne : l'offre n'existe que pour un type qui porte un montant. */
export function stepsFor(kind: CampaignKindKey | null): WizardStep[] {
  const withOffer = kind !== null && CAMPAIGN_KINDS[kind].needsAmount;
  return WIZARD_STEPS.filter((step) => step !== "offer" || withOffer);
}

// ---------------------------------------------------------------- État de l'assistant

export type WizardState = {
  kind: CampaignKindKey | null;
  /** Nom interne, visible dans la console seulement. */
  name: string;
  audience: AudienceKey | null;
  pharmacyIds: string[];
  partnerIds: string[];
  subject: string;
  title: string;
  body: string;
  buttonLabel: string;
  buttonTarget: ButtonTargetKey | "";
  alsoInApp: boolean;
  /** Le montant tel que saisi, en euros (« 20 », « 12,50 »). */
  amount: string;
  /** Le dernier jour de l'offre, « AAAA-MM-JJ », ou vide : sans fin. */
  endsOn: string;
  conditions: string;
};

export function initialState(): WizardState {
  return { kind: null, name: "", audience: null, pharmacyIds: [], partnerIds: [], subject: "", title: "", body: "", buttonLabel: "", buttonTarget: "", alsoInApp: false, amount: "", endsOn: "", conditions: "" };
}

const isKind = (value: unknown): value is CampaignKindKey => typeof value === "string" && Object.hasOwn(CAMPAIGN_KINDS, value);
const isAudience = (value: unknown): value is AudienceKey => typeof value === "string" && (AUDIENCE_KEYS as string[]).includes(value);
const isButtonTarget = (value: unknown): value is ButtonTargetKey => typeof value === "string" && Object.hasOwn(CAMPAIGN_BUTTON_TARGETS, value);

/** Un type ou un public lu en base : connu, ou `null` (une valeur inattendue n'est jamais devinée). */
export const kindOf = (value: unknown): CampaignKindKey | null => (isKind(value) ? value : null);
export const audienceOf = (value: unknown): AudienceKey | null => (isAudience(value) ? value : null);

const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** Les identifiants choisis à la main, tels que la base les garde (un JSON libre) : seulement des listes de chaînes. */
export function parseAudienceParams(raw: unknown): { pharmacyIds: string[]; partnerIds: string[] } {
  const params = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { pharmacyIds: idsOf(params.pharmacyIds), partnerIds: idsOf(params.partnerIds) };
}

/** Une campagne enregistrée, remise dans l'assistant. */
export function stateFromCampaign(campaign: {
  kind: string;
  name: string;
  subject: string;
  title: string;
  body: string;
  buttonLabel: string | null;
  buttonTarget: string | null;
  audience: string;
  audienceParams: unknown;
  alsoInApp: boolean;
  offerAmountCents: number | null;
  offerEndsAt: Date | null;
  offerConditions: string | null;
}): WizardState {
  const { pharmacyIds, partnerIds } = parseAudienceParams(campaign.audienceParams);
  return {
    kind: isKind(campaign.kind) ? campaign.kind : null,
    name: campaign.name,
    audience: isAudience(campaign.audience) ? campaign.audience : null,
    pharmacyIds,
    partnerIds,
    subject: campaign.subject,
    title: campaign.title,
    body: campaign.body,
    buttonLabel: campaign.buttonLabel ?? "",
    buttonTarget: isButtonTarget(campaign.buttonTarget) ? campaign.buttonTarget : "",
    alsoInApp: campaign.alsoInApp,
    amount: campaign.offerAmountCents === null ? "" : formatAmountInput(campaign.offerAmountCents),
    // La fin de l'offre est le dernier instant du jour choisi, à Paris : on retrouve ce jour.
    endsOn: campaign.offerEndsAt ? calendarDay(campaign.offerEndsAt, TIME_ZONE) : "",
    conditions: campaign.offerConditions ?? "",
  };
}

// ---------------------------------------------------------------- Type, public, bouton

/** Les publics qu'un type de campagne peut viser : ceux dont le côté (officines, partenaires) lui convient. */
export function audiencesFor(kind: CampaignKindKey | null): AudienceKey[] {
  if (!kind) return [];
  return AUDIENCE_KEYS.filter((key) => CAMPAIGN_KINDS[kind].side.includes(CAMPAIGN_AUDIENCES[key].side));
}

/** Le côté des destinataires : celui du public choisi, à défaut le premier côté du type. */
export function sideOf(state: Pick<WizardState, "kind" | "audience">): CampaignSide | null {
  if (state.audience) return CAMPAIGN_AUDIENCES[state.audience].side;
  return state.kind ? CAMPAIGN_KINDS[state.kind].side[0] : null;
}

/** Les destinations de bouton qui mènent quelque part pour ce côté. */
export function buttonTargetsFor(side: CampaignSide | null): { key: ButtonTargetKey; label: string }[] {
  if (!side) return [];
  return (Object.keys(CAMPAIGN_BUTTON_TARGETS) as ButtonTargetKey[]).filter((key) => CAMPAIGN_BUTTON_TARGETS[key].side === side).map((key) => ({ key, label: CAMPAIGN_BUTTON_TARGETS[key].label }));
}

const monthYear = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, month: "long", year: "numeric" });

/** Un nom de départ, que l'on peut changer : « Offre bonus, octobre 2026 ». */
export function suggestName(kind: CampaignKindKey, now: Date): string {
  return `${CAMPAIGN_KINDS[kind].label}, ${monthYear.format(now)}`;
}

/** Le texte est-il celui d'origine du type (jamais touché) ? Alors changer de type peut le remplacer sans rien perdre. */
function hasDefaultText(state: WizardState): boolean {
  if (!state.kind) return !state.subject && !state.title && !state.body;
  const { defaults } = CAMPAIGN_KINDS[state.kind];
  return state.subject === defaults.subject && state.title === defaults.title && state.body === defaults.body && state.buttonLabel === (defaults.buttonLabel ?? "");
}

/**
 * Choisit un type. Le texte d'origine du type est repris ; un texte déjà
 * retouché est gardé (changer de type ne fait perdre aucune rédaction). Le
 * public et le bouton sont ramenés à ce que le nouveau type permet.
 */
export function selectKind(state: WizardState, kind: CampaignKindKey, now: Date): WizardState {
  if (state.kind === kind) return state;
  const definition = CAMPAIGN_KINDS[kind];
  const keepText = !hasDefaultText(state);
  const nameWasSuggested = state.name === "" || (state.kind !== null && state.name === suggestName(state.kind, now));
  let next: WizardState = {
    ...state,
    kind,
    name: nameWasSuggested ? suggestName(kind, now) : state.name,
    ...(keepText ? {} : { subject: definition.defaults.subject, title: definition.defaults.title, body: definition.defaults.body, buttonLabel: definition.defaults.buttonLabel ?? "", buttonTarget: definition.defaultButton ?? "" }),
  };
  // Le public ne reste que s'il convient au nouveau type ; sinon, celui que le type propose.
  const audience = next.audience && audiencesFor(kind).includes(next.audience) ? next.audience : definition.defaults.audience;
  next = selectAudience(next, audience);
  // Sans offre, ni montant, ni fin, ni conditions : rien de caché ne repart avec la campagne.
  if (!definition.needsAmount) next = { ...next, amount: "", endsOn: "", conditions: "" };
  // Un bouton resté sans destination n'a plus de sens : on reprend celui du type.
  if (keepText && next.buttonLabel && !next.buttonTarget) next = { ...next, buttonTarget: definition.defaultButton ?? "" };
  return next;
}

/** Choisit un public : ce qui ne convient pas à son côté (destination du bouton, notification dans l'application) est retiré. */
export function selectAudience(state: WizardState, audience: AudienceKey): WizardState {
  const side = CAMPAIGN_AUDIENCES[audience].side;
  const targetFits = state.buttonTarget === "" || CAMPAIGN_BUTTON_TARGETS[state.buttonTarget].side === side;
  return {
    ...state,
    audience,
    // Un bouton sans destination valable pour ce côté disparaît avec son texte : jamais un bouton qui mène nulle part.
    ...(targetFits ? {} : { buttonTarget: "" as const, buttonLabel: "" }),
    alsoInApp: side === "PHARMACY" ? state.alsoInApp : false,
  };
}

// ---------------------------------------------------------------- Montant

/** Le montant saisi en euros, en centimes : « 20 », « 12,50 », « 1 000 € ». Jamais de calcul flottant. */
export function parseEuros(input: string): { ok: true; cents: number } | { ok: false; error: string } {
  const cleaned = input.replace(/[\s  ]/g, "").replace(/(€|euros?)$/i, "");
  if (cleaned === "") return { ok: false, error: "Saisissez un montant en euros." };
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return { ok: false, error: "Montant illisible : écrivez par exemple 20 ou 12,50." };
  return { ok: true, cents: Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) };
}

/** Des centimes en euros pour un champ de saisie : « 20 », « 12,50 ». */
export function formatAmountInput(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, "0")}`;
}

/** Ce qui ne va pas dans le montant saisi pour ce type, ou `null`. Les bornes sont celles du type. */
export function amountProblem(kind: CampaignKindKey, input: string): string | null {
  const bounds = CAMPAIGN_KINDS[kind].amountBoundsCents;
  const parsed = parseEuros(input);
  if (!parsed.ok) return parsed.error;
  if (bounds && (parsed.cents < bounds.min || parsed.cents > bounds.max)) return `Le montant doit être compris entre ${formatEuros(bounds.min)} et ${formatEuros(bounds.max)}.`;
  return null;
}

// ---------------------------------------------------------------- Dates

/** Aujourd'hui, jour calendaire de Paris. */
export function todayKey(now: Date): DayKey {
  return calendarDay(now, TIME_ZONE);
}

/** Les jours que la programmation accepte : de demain à 90 jours. */
export function scheduleBounds(now: Date): { min: DayKey; max: DayKey } {
  const today = todayKey(now);
  return { min: addDays(today, 1), max: addDays(today, SCHEDULE_MAX_DAYS) };
}

/** Le jour de programmation choisi : l'erreur à dire, ou `null` s'il convient. */
export function scheduleDayProblem(day: string, now: Date): string | null {
  if (!isCalendarDay(day)) return "Choisissez un jour.";
  return validateScheduleDate(zonedDayStart(day, TIME_ZONE), now);
}

/** « Envoi demain, mardi 6 octobre 2026, au passage quotidien du matin (heure de Paris). » ; `null` pour un jour illisible. */
export function scheduleSentence(day: string, now: Date): string | null {
  return isCalendarDay(day) ? describeSchedule(zonedDayStart(day, TIME_ZONE), now) : null;
}

// ---------------------------------------------------------------- Brouillon

/** L'état de l'assistant, tel que l'action d'enregistrement le reçoit : montant en centimes, fin en « AAAA-MM-JJ ». */
export function toPayload(state: WizardState): CampaignDraftPayload {
  const withOffer = state.kind !== null && CAMPAIGN_KINDS[state.kind].needsAmount;
  const amount = withOffer ? parseEuros(state.amount) : null;
  const selection = state.audience && CAMPAIGN_AUDIENCES[state.audience].needsSelection ? (CAMPAIGN_AUDIENCES[state.audience].side === "PHARMACY" ? { pharmacyIds: state.pharmacyIds } : { partnerIds: state.partnerIds }) : {};
  return {
    kind: state.kind ?? "",
    name: state.name,
    subject: state.subject,
    title: state.title,
    body: state.body,
    buttonLabel: state.buttonLabel.trim() || null,
    buttonTarget: state.buttonTarget || null,
    audience: state.audience ?? "",
    audienceParams: selection,
    alsoInApp: state.alsoInApp,
    // Un montant illisible n'est pas deviné : le domaine répond « Le montant doit être compris entre… ».
    offerAmountCents: amount?.ok ? amount.cents : null,
    offerEndsAt: withOffer && state.endsOn ? state.endsOn : null,
    offerConditions: withOffer ? state.conditions.trim() || null : null,
  };
}

/** Le brouillon passé par les règles du domaine, les mêmes que celles du serveur. */
export function checkDraft(state: WizardState, now: Date): CampaignDraftResult {
  return validateCampaignDraft(toPayload(state), now);
}

/** L'empreinte d'un brouillon : sert à savoir si ce qui est à l'écran est ce qui est enregistré. */
export function fingerprint(state: WizardState): string {
  return JSON.stringify(toPayload(state));
}

// ---------------------------------------------------------------- Ce qui bloque une étape

/** Les noms et textes : bornes du domaine, reprises ici pour dire tout de suite ce qui manque. */
const NAME_BOUNDS = { min: 3, max: 120 } as const;
const SUBJECT_MIN = 3;
const TITLE_MIN = 3;
const BODY_MIN = 10;

/** Ce qui empêche de quitter l'étape (liste vide : on peut continuer). L'étape « envoi » reprend la réponse du domaine. */
export function stepProblems(state: WizardState, step: WizardStep, now: Date): string[] {
  const problems: string[] = [];
  switch (step) {
    case "type": {
      if (!state.kind) problems.push("Choisissez un type de campagne.");
      const name = state.name.trim();
      if (name.length < NAME_BOUNDS.min || name.length > NAME_BOUNDS.max) problems.push(`Donnez un nom à la campagne (${NAME_BOUNDS.min} à ${NAME_BOUNDS.max} caractères) : il reste interne.`);
      break;
    }
    case "audience": {
      if (!state.audience) {
        problems.push("Choisissez à qui s'adresse la campagne.");
        break;
      }
      const audience = CAMPAIGN_AUDIENCES[state.audience];
      if (audience.needsSelection && (audience.side === "PHARMACY" ? state.pharmacyIds : state.partnerIds).length === 0) {
        problems.push(audience.side === "PHARMACY" ? "Choisissez au moins une officine." : "Choisissez au moins un partenaire.");
      }
      break;
    }
    case "message": {
      if (state.subject.trim().length < SUBJECT_MIN) problems.push("Écrivez l'objet du message.");
      if (state.title.trim().length < TITLE_MIN) problems.push("Écrivez le titre du message.");
      if (state.body.trim().length < BODY_MIN) problems.push("Écrivez le texte du message.");
      if (state.buttonLabel.trim() && !state.buttonTarget) problems.push("Choisissez où mène le bouton, ou retirez son texte.");
      if (state.buttonTarget && !state.buttonLabel.trim()) problems.push("Écrivez le texte du bouton, ou retirez sa destination.");
      break;
    }
    case "offer": {
      if (state.kind) {
        const problem = amountProblem(state.kind, state.amount);
        if (problem) problems.push(problem);
      }
      if (state.endsOn) {
        if (!isCalendarDay(state.endsOn)) problems.push("La date de fin est illisible.");
        else if (state.endsOn < todayKey(now)) problems.push("La date de fin ne peut pas être passée : l'offre court jusqu'à la fin de ce jour.");
      }
      break;
    }
    case "send": {
      const checked = checkDraft(state, now);
      if (!checked.ok) problems.push(checked.error);
      break;
    }
  }
  return problems;
}

/** Peut-on ouvrir cette étape ? Revenir en arrière est toujours permis ; avancer suppose que les étapes d'avant sont en règle. */
export function canOpenStep(state: WizardState, target: WizardStep, now: Date): boolean {
  const steps = stepsFor(state.kind);
  const targetIndex = steps.indexOf(target);
  if (targetIndex < 0) return false;
  return steps.slice(0, targetIndex).every((step) => stepProblems(state, step, now).length === 0);
}

export function nextStep(state: WizardState, current: WizardStep): WizardStep | null {
  const steps = stepsFor(state.kind);
  return steps[steps.indexOf(current) + 1] ?? null;
}

export function previousStep(state: WizardState, current: WizardStep): WizardStep | null {
  const steps = stepsFor(state.kind);
  const index = steps.indexOf(current);
  return index > 0 ? steps[index - 1] : null;
}

// ---------------------------------------------------------------- Aperçu

/**
 * Pourquoi l'aperçu ne peut pas encore s'afficher, ou `null`. Pour un type à
 * offre, le message cite le montant, qui se règle à l'étape suivante : on le
 * dit au lieu de montrer un message avec un montant inventé.
 */
export function previewBlockedReason(state: WizardState, step: WizardStep, now: Date): string | null {
  if (!state.kind || !state.audience) return "Choisissez le type et les destinataires pour voir le message.";
  if (step === "message" && CAMPAIGN_KINDS[state.kind].needsAmount && amountProblem(state.kind, state.amount)) {
    return "L'aperçu s'affichera quand l'offre sera renseignée (étape suivante) : le message cite son montant, qui n'est pas inventé ici.";
  }
  const checked = checkDraft(state, now);
  return checked.ok ? null : checked.error;
}

// ---------------------------------------------------------------- Destinataires

export type AudienceVerdict = "empty" | "too_many" | "ok";

/** Le nombre de destinataires calculé par le serveur : on envoie à 1 jusqu'à 2 000 personnes, ni plus ni moins. */
export function audienceVerdict(count: number): AudienceVerdict {
  if (count <= 0) return "empty";
  return count > CAMPAIGN_MAX_RECIPIENTS ? "too_many" : "ok";
}

/** Ce qui a été écarté du public, en une phrase (« 2 désinscrits, 1 doublon ») ; chaîne vide si rien. */
export function describeExcluded(excluded: { optedOut: number; noEmail: number; duplicates: number }): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  if (excluded.optedOut) parts.push(plural(excluded.optedOut, "désinscrit des offres", "désinscrits des offres"));
  if (excluded.noEmail) parts.push(plural(excluded.noEmail, "sans adresse e-mail", "sans adresse e-mail"));
  if (excluded.duplicates) parts.push(plural(excluded.duplicates, "doublon d'adresse", "doublons d'adresse"));
  return parts.join(", ");
}

/** Les options d'une sélection manuelle : filtrées par nom (sans égard à la casse ni aux accents), bornées. */
export function filterOptions<T extends { name: string; city?: string | null }>(options: T[], query: string, limit: number): { shown: T[]; total: number } {
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr");
  const needle = fold(query.trim());
  const matching = needle ? options.filter((option) => fold(`${option.name} ${option.city ?? ""}`).includes(needle)) : options;
  return { shown: matching.slice(0, limit), total: matching.length };
}

// ---------------------------------------------------------------- Variables

/** Insère un texte à la position du curseur (ou à la place de la sélection) ; rend le nouveau texte et la position du curseur. */
export function insertAtCursor(value: string, selectionStart: number, selectionEnd: number, snippet: string): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  return { value: `${value.slice(0, start)}${snippet}${value.slice(end)}`, caret: start + snippet.length };
}
