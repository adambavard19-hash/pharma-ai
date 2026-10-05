/**
 * Les scénarios de relance de la console : essai, paiement, résiliation,
 * suivi commercial, parrainage, partenaires. La cadence des relances de
 * contrat, elle, existe déjà (`PlatformSetting["contract.reminders"]`,
 * `runContractReminders`) : la console la présente avec les autres, sans la
 * dupliquer.
 *
 * Trois garde-fous structurels :
 *   1. une règle est DÉSACTIVÉE tant qu'un administrateur ne l'a pas activée :
 *      déployer ce code n'envoie rien ;
 *   2. une règle ne rattrape que ce qui est échu depuis moins de
 *      `CATCH_UP_DAYS` jours calendaires : activer une règle aujourd'hui
 *      n'écrit pas à tous les essais des derniers mois ;
 *   3. chaque déclenchement porte une clé unique (règle, cible, occurrence) :
 *      deux passages, même simultanés, n'envoient jamais deux fois.
 *
 * Les délais se comptent en JOURS calendaires, au fuseau de la société
 * (Europe/Paris) : « J+1 » part le lendemain de l'événement, « Le jour même »
 * le jour même, quelle que soit l'heure de l'événement et celle du passage
 * quotidien.
 *
 * Ce module est pur : il reçoit les candidats lus en base et rend la liste
 * de ce qui est dû. L'envoi et l'écriture des clés sont faits côté serveur.
 */
import { TIME_ZONE } from "@/config/constants";
import { addDays as addDayKey, calendarDay, daysBetween, zonedDayStart, type DayKey } from "@/core/challenges/dates";

export const CATCH_UP_DAYS = 2;

export type AutomationScenario = "TRIAL" | "PAYMENT" | "CANCELLATION" | "COMMERCIAL" | "REFERRAL" | "PARTNER";
export type AutomationChannel = "EMAIL" | "INTERNAL";

export type AutomationRuleDefinition = {
  key: string;
  scenario: AutomationScenario;
  label: string;
  /** Ce qui déclenche la règle, en clair. */
  trigger: string;
  /** Délai par défaut, en jours, par rapport à l'événement : négatif = avant l'échéance. */
  defaultOffsetDays: number;
  /** Bornes du délai réglable. */
  minOffsetDays: number;
  maxOffsetDays: number;
  channel: AutomationChannel;
  /** Le modèle d'e-mail envoyé (canal EMAIL). */
  templateKey?: string;
  /** À qui part l'e-mail : le titulaire d'une officine (par défaut) ou le contact d'un partenaire. */
  audience?: "Titulaire" | "Partenaire";
  /** Ce que la règle fait EN PLUS de l'e-mail, en clair : redit à l'activation. */
  alsoDoes?: string;
  /** Avertissement affiché : un autre envoi existe déjà pour le même moment. */
  overlap?: string;
};

export const AUTOMATION_SCENARIOS: Record<AutomationScenario, { label: string; description: string }> = {
  TRIAL: { label: "Essai gratuit", description: "De la bienvenue à la fin de l'essai, pour les officines en essai." },
  PAYMENT: { label: "Paiement", description: "Après un paiement échoué resté impayé : relances au titulaire, puis alerte à l'équipe." },
  CANCELLATION: { label: "Résiliation", description: "Accusé de réception d'une demande, puis confirmation." },
  COMMERCIAL: { label: "Suivi commercial", description: "Alerte interne quand une relance prévue sur un dossier est dépassée." },
  REFERRAL: { label: "Parrainage", description: "Quand une officine parrainée s'inscrit : un e-mail et une notification dans l'application pour le titulaire qui l'a parrainée." },
  PARTNER: { label: "Partenaires", description: "Une invitation à déposer sa gamme, pour les fiches partenaires encore sans aucune marque référencée." },
};

export const AUTOMATION_RULES: AutomationRuleDefinition[] = [
  { key: "trial.welcome", scenario: "TRIAL", label: "Bienvenue", trigger: "Jours après le début de l'essai", defaultOffsetDays: 1, minOffsetDays: 0, maxOffsetDays: 7, channel: "EMAIL", templateKey: "trial.welcome" },
  { key: "trial.onboarding", scenario: "TRIAL", label: "Accompagnement", trigger: "Jours après le début de l'essai", defaultOffsetDays: 7, minOffsetDays: 2, maxOffsetDays: 21, channel: "EMAIL", templateKey: "trial.onboarding" },
  {
    key: "trial.ending_soon",
    scenario: "TRIAL",
    label: "Rappel de fin d'essai",
    trigger: "Jours avant la fin de l'essai",
    defaultOffsetDays: -5,
    minOffsetDays: -14,
    maxOffsetDays: -1,
    channel: "EMAIL",
    templateKey: "trial.ending_soon",
    overlap: "Stripe annonce déjà la fin d'essai trois jours avant (e-mail système « Fin d'essai annoncée par Stripe ») : choisissez un délai différent pour ne pas écrire deux fois le même jour.",
  },
  { key: "trial.ended", scenario: "TRIAL", label: "Fin d'essai sans abonnement", trigger: "Jours après la fin d'un essai non poursuivi", defaultOffsetDays: 0, minOffsetDays: 0, maxOffsetDays: 7, channel: "EMAIL", templateKey: "trial.ended" },
  {
    key: "payment.reminder_1",
    scenario: "PAYMENT",
    label: "Première relance",
    trigger: "Jours après l'échec du paiement, s'il reste impayé",
    defaultOffsetDays: 2,
    minOffsetDays: 1,
    maxOffsetDays: 10,
    channel: "EMAIL",
    templateKey: "payment.failed_reminder",
    overlap: "Le titulaire reçoit déjà un e-mail système à chaque échec signalé par Stripe : cette relance vient en plus, quelques jours après.",
  },
  { key: "payment.reminder_2", scenario: "PAYMENT", label: "Deuxième relance", trigger: "Jours après l'échec du paiement, s'il reste impayé", defaultOffsetDays: 7, minOffsetDays: 2, maxOffsetDays: 20, channel: "EMAIL", templateKey: "payment.unpaid_final" },
  { key: "payment.internal_alert", scenario: "PAYMENT", label: "Alerte à l'équipe", trigger: "Jours après l'échec du paiement, s'il reste impayé", defaultOffsetDays: 10, minOffsetDays: 3, maxOffsetDays: 30, channel: "INTERNAL" },
  { key: "cancellation.acknowledgement", scenario: "CANCELLATION", label: "Accusé de réception", trigger: "Jours après l'enregistrement de la demande", defaultOffsetDays: 0, minOffsetDays: 0, maxOffsetDays: 3, channel: "EMAIL", templateKey: "cancellation.received" },
  { key: "cancellation.confirmation", scenario: "CANCELLATION", label: "Confirmation", trigger: "Jours après la confirmation de la résiliation", defaultOffsetDays: 0, minOffsetDays: 0, maxOffsetDays: 3, channel: "EMAIL", templateKey: "cancellation.confirmed" },
  { key: "prospect.followup_overdue", scenario: "COMMERCIAL", label: "Relance commerciale dépassée", trigger: "Jours après la date de relance prévue sur un dossier ouvert", defaultOffsetDays: 1, minOffsetDays: 0, maxOffsetDays: 14, channel: "INTERNAL" },
  {
    key: "referral.filleul_joined",
    scenario: "REFERRAL",
    label: "Filleul inscrit",
    trigger: "Jours après l'inscription du filleul",
    defaultOffsetDays: 0,
    minOffsetDays: 0,
    maxOffsetDays: 3,
    channel: "EMAIL",
    templateKey: "referral.filleul_joined",
    alsoDoes: "Une notification s'affiche aussi dans l'application de l'officine du parrain.",
  },
  {
    key: "partner.range_invitation",
    scenario: "PARTNER",
    label: "Invitation à référencer sa gamme",
    trigger: "Jours après la création de la fiche partenaire, si aucune marque n'est encore référencée",
    defaultOffsetDays: 5,
    minOffsetDays: 1,
    maxOffsetDays: 30,
    channel: "EMAIL",
    templateKey: "partner.range_invitation",
    audience: "Partenaire",
  },
];

const RULES_BY_KEY = new Map(AUTOMATION_RULES.map((r) => [r.key, r]));

export function automationRule(key: string): AutomationRuleDefinition | null {
  return RULES_BY_KEY.get(key) ?? null;
}

export type RuleSetting = { enabled: boolean; offsetDays: number };
export type ResolvedRule = AutomationRuleDefinition & RuleSetting;

/** Le réglage en base, ou par défaut : DÉSACTIVÉE, au délai par défaut. Un délai hors bornes est ramené dans les bornes. */
export function resolveRules(stored: { key: string; enabled: boolean; offsetDays: number }[]): ResolvedRule[] {
  const byKey = new Map(stored.map((s) => [s.key, s]));
  return AUTOMATION_RULES.map((rule) => {
    const row = byKey.get(rule.key);
    return { ...rule, enabled: row?.enabled ?? false, offsetDays: clampOffset(rule, row?.offsetDays ?? rule.defaultOffsetDays) };
  });
}

export function clampOffset(rule: AutomationRuleDefinition, offsetDays: number): number {
  if (!Number.isFinite(offsetDays)) return rule.defaultOffsetDays;
  return Math.min(rule.maxOffsetDays, Math.max(rule.minOffsetDays, Math.round(offsetDays)));
}

/** « J+1 », « J-5 », « Le jour même ». */
export function describeOffset(offsetDays: number): string {
  if (offsetDays === 0) return "Le jour même";
  return offsetDays > 0 ? `J+${offsetDays}` : `J${offsetDays}`;
}

// ---------------------------------------------------------------- Candidats

export type SubscriptionCandidate = {
  id: string;
  organizationId: string;
  pharmacyId: string | null;
  status: string;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
  lastPaymentAt: Date | null;
  lastPaymentFailedAt: Date | null;
  /**
   * Le début de la série impayée en cours (voir `unpaidSeriesStart`) : les
   * relances de paiement s'y ancrent, et non sur la dernière tentative de
   * Stripe, qui avance à chaque nouvel essai. À défaut, `lastPaymentFailedAt`.
   */
  unpaidSinceAt?: Date | null;
  suspendedAt: Date | null;
};

export type CancellationCandidate = {
  id: string;
  pharmacyId: string;
  status: string;
  requestedAt: Date;
  confirmedAt: Date | null;
};

export type ProspectCandidate = {
  id: string;
  status: string;
  nextActionAt: Date | null;
  /** Le dernier contact noté sur le dossier : postérieur à la relance prévue, la relance a eu lieu. */
  lastContactAt?: Date | null;
  blockedAt: Date | null;
  salesRepId: string | null;
};

/** Une officine parrainée, avec son parrain : l'e-mail et la notification vont au parrain. */
export type FilleulCandidate = {
  id: string;
  referrerId: string | null;
  isDemo: boolean;
  /** L'inscription du filleul : la création de son officine. */
  createdAt: Date;
};

export type PartnerCandidate = {
  id: string;
  /** `PartnerPublicationStatus` : un partenaire archivé ou suspendu n'est jamais invité. */
  status: string;
  brandCount: number;
  createdAt: Date;
};

export type PlannedAutomation = {
  ruleKey: string;
  dedupeKey: string;
  /** « Pharmacy » : le filleul d'une règle de parrainage (le message va à son parrain, porté par `pharmacyId`). */
  targetType: "Subscription" | "CancellationRequest" | "Prospect" | "Pharmacy" | "Partner";
  targetId: string;
  /** L'officine DESTINATAIRE (pour un partenaire : aucune). */
  pharmacyId: string | null;
  /** Le moment où la règle devenait due : minuit (heure de Paris) de son jour d'échéance. */
  dueAt: Date;
  channel: AutomationChannel;
  templateKey?: string;
  /** L'événement de référence (début d'essai, échec de paiement…) : utile au texte. */
  anchorAt: Date;
};

/** Le jour de l'événement dans la clé de dédoublonnage (jour UTC, inchangé : les clés déjà écrites restent valables). */
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Le jour d'échéance d'une règle : le jour (heure de Paris) de l'événement, plus le délai en jours calendaires. */
export function dueDay(anchorAt: Date, offsetDays: number, timeZone: string = TIME_ZONE): DayKey {
  return addDayKey(calendarDay(anchorAt, timeZone), offsetDays);
}

/**
 * Une règle est due dès que son jour d'échéance est atteint (heure de Paris),
 * et rattrapée au plus `CATCH_UP_DAYS` jours calendaires après.
 */
export function isDueNow(dueOn: DayKey, now: Date, timeZone: string = TIME_ZONE): boolean {
  const late = daysBetween(dueOn, calendarDay(now, timeZone));
  return late >= 0 && late <= CATCH_UP_DAYS;
}

/** Les jours calendaires (heure de Paris) d'aujourd'hui jusqu'à cette date : 0 le jour même, jamais négatif. */
export function calendarDaysUntil(target: Date, now: Date, timeZone: string = TIME_ZONE): number {
  return Math.max(0, daysBetween(calendarDay(now, timeZone), calendarDay(target, timeZone)));
}

/** Un paiement échoué est encore impayé si aucun paiement réussi n'est venu après. */
export function hasUnpaidFailure(sub: Pick<SubscriptionCandidate, "lastPaymentAt" | "lastPaymentFailedAt" | "status">): boolean {
  if (!sub.lastPaymentFailedAt) return false;
  if (sub.status === "CANCELED" || sub.status === "INCOMPLETE_EXPIRED") return false;
  return !sub.lastPaymentAt || sub.lastPaymentAt.getTime() < sub.lastPaymentFailedAt.getTime();
}

/** Les factures (`BillingPayment.status`) qui restent dues. */
export const UNPAID_INVOICE_STATUSES = ["FAILED", "OPEN"] as const;
const UNPAID_INVOICE = new Set<string>(UNPAID_INVOICE_STATUSES);

/**
 * Le début de la série impayée : la création de la plus ancienne facture en
 * échec ou ouverte, venue après le dernier paiement réussi. Stable d'une
 * tentative de Stripe à l'autre ; une nouvelle série (après un paiement
 * réussi) repart de sa propre facture. À défaut de facture connue, le dernier
 * échec signalé.
 */
export function unpaidSeriesStart(sub: Pick<SubscriptionCandidate, "lastPaymentAt" | "lastPaymentFailedAt">, invoices: { status: string; createdAt: Date }[]): Date | null {
  const paidUntil = sub.lastPaymentAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  let oldest: Date | null = null;
  for (const invoice of invoices) {
    if (!UNPAID_INVOICE.has(invoice.status) || invoice.createdAt.getTime() <= paidUntil) continue;
    if (!oldest || invoice.createdAt.getTime() < oldest.getTime()) oldest = invoice.createdAt;
  }
  return oldest ?? sub.lastPaymentFailedAt;
}

/**
 * L'ordre des relances de paiement : la deuxième relance part après la
 * première (jamais le même jour), l'alerte à l'équipe au plus tôt avec la
 * dernière relance. Seules les règles actives comptent.
 */
const PAYMENT_SEQUENCE: { key: string; strictlyAfterPrevious: boolean }[] = [
  { key: "payment.reminder_1", strictlyAfterPrevious: true },
  { key: "payment.reminder_2", strictlyAfterPrevious: true },
  { key: "payment.internal_alert", strictlyAfterPrevious: false },
];

/** Le réglage `change` casserait-il l'ordre des relances de paiement ? Le message à afficher, sinon `null`. */
export function paymentSequenceError(rules: ResolvedRule[], change: { key: string; enabled: boolean; offsetDays: number }): string | null {
  if (!change.enabled || !PAYMENT_SEQUENCE.some((s) => s.key === change.key)) return null;
  const chain = PAYMENT_SEQUENCE.flatMap((step) => {
    const rule = rules.find((r) => r.key === step.key);
    if (!rule) return [];
    const effective = rule.key === change.key ? { ...rule, enabled: true, offsetDays: change.offsetDays } : rule;
    return effective.enabled ? [{ ...step, rule: effective }] : [];
  });
  const index = chain.findIndex((s) => s.key === change.key);
  const current = chain[index];
  const previous = chain[index - 1];
  const next = chain[index + 1];
  const inOrder = (earlier: (typeof chain)[number], later: (typeof chain)[number]) => (later.strictlyAfterPrevious ? later.rule.offsetDays > earlier.rule.offsetDays : later.rule.offsetDays >= earlier.rule.offsetDays);
  if (previous && !inOrder(previous, current)) {
    const earliest = current.strictlyAfterPrevious ? previous.rule.offsetDays + 1 : previous.rule.offsetDays;
    return `« ${current.rule.label} » doit partir ${current.strictlyAfterPrevious ? "après" : "au plus tôt le même jour que"} « ${previous.rule.label} » (${describeOffset(previous.rule.offsetDays)}) : choisissez au moins ${describeOffset(earliest)}.`;
  }
  if (next && !inOrder(current, next)) {
    const latest = next.strictlyAfterPrevious ? next.rule.offsetDays - 1 : next.rule.offsetDays;
    return `« ${current.rule.label} » doit partir ${next.strictlyAfterPrevious ? "avant" : "au plus tard le même jour que"} « ${next.rule.label} » (${describeOffset(next.rule.offsetDays)}) : choisissez au plus ${describeOffset(latest)}, ou repoussez d'abord « ${next.rule.label} ».`;
  }
  return null;
}

const TRIAL_NOT_CONTINUED = new Set(["PAUSED", "CANCELED", "INCOMPLETE", "INCOMPLETE_EXPIRED"]);
const OPEN_CANCELLATION = new Set(["RECEIVED", "IN_PROGRESS"]);
const CLOSED_PROSPECT = new Set(["ACTIVATED", "LOST"]);
const PARTNER_NOT_INVITED = new Set(["SUSPENDED", "ARCHIVED"]);

/**
 * Ce qui est dû maintenant, règle par règle. `alreadyDone` contient les clés
 * déjà consommées : un déclenchement présent n'est jamais reproposé.
 */
export function planAutomations(input: {
  rules: ResolvedRule[];
  subscriptions: SubscriptionCandidate[];
  cancellations: CancellationCandidate[];
  prospects: ProspectCandidate[];
  /** Facultatifs : sans eux, les règles de parrainage et de partenaires ne planifient rien. */
  filleuls?: FilleulCandidate[];
  partners?: PartnerCandidate[];
  alreadyDone: Set<string>;
  now: Date;
}): PlannedAutomation[] {
  const { now } = input;
  const out: PlannedAutomation[] = [];
  const seen = new Set<string>();
  const push = (rule: ResolvedRule, target: { type: PlannedAutomation["targetType"]; id: string; pharmacyId: string | null }, anchorAt: Date) => {
    const dueOn = dueDay(anchorAt, rule.offsetDays);
    if (!isDueNow(dueOn, now)) return;
    const dueAt = zonedDayStart(dueOn, TIME_ZONE);
    const dedupeKey = `${rule.key}:${target.id}:${isoDay(anchorAt)}`;
    if (input.alreadyDone.has(dedupeKey) || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push({ ruleKey: rule.key, dedupeKey, targetType: target.type, targetId: target.id, pharmacyId: target.pharmacyId, dueAt, channel: rule.channel, templateKey: rule.templateKey, anchorAt });
  };

  for (const rule of input.rules) {
    if (!rule.enabled) continue;
    switch (rule.key) {
      case "trial.welcome":
      case "trial.onboarding":
        for (const sub of input.subscriptions) {
          if (sub.status !== "TRIALING" || sub.suspendedAt || !sub.trialStartsAt) continue;
          push(rule, { type: "Subscription", id: sub.id, pharmacyId: sub.pharmacyId }, sub.trialStartsAt);
        }
        break;
      case "trial.ending_soon":
        for (const sub of input.subscriptions) {
          if (sub.status !== "TRIALING" || sub.suspendedAt || !sub.trialEndsAt) continue;
          push(rule, { type: "Subscription", id: sub.id, pharmacyId: sub.pharmacyId }, sub.trialEndsAt);
        }
        break;
      case "trial.ended":
        for (const sub of input.subscriptions) {
          if (!sub.trialEndsAt || sub.suspendedAt || !TRIAL_NOT_CONTINUED.has(sub.status)) continue;
          if (sub.trialEndsAt.getTime() > now.getTime()) continue;
          push(rule, { type: "Subscription", id: sub.id, pharmacyId: sub.pharmacyId }, sub.trialEndsAt);
        }
        break;
      case "payment.reminder_1":
      case "payment.reminder_2":
      case "payment.internal_alert":
        for (const sub of input.subscriptions) {
          if (sub.suspendedAt || !hasUnpaidFailure(sub)) continue;
          // Ancrées sur le début de la série impayée : une nouvelle tentative de Stripe ne relance pas la série.
          push(rule, { type: "Subscription", id: sub.id, pharmacyId: sub.pharmacyId }, sub.unpaidSinceAt ?? sub.lastPaymentFailedAt!);
        }
        break;
      case "cancellation.acknowledgement":
        for (const req of input.cancellations) {
          if (!OPEN_CANCELLATION.has(req.status)) continue;
          push(rule, { type: "CancellationRequest", id: req.id, pharmacyId: req.pharmacyId }, req.requestedAt);
        }
        break;
      case "cancellation.confirmation":
        for (const req of input.cancellations) {
          if (req.status !== "CONFIRMED" || !req.confirmedAt) continue;
          push(rule, { type: "CancellationRequest", id: req.id, pharmacyId: req.pharmacyId }, req.confirmedAt);
        }
        break;
      case "prospect.followup_overdue":
        for (const p of input.prospects) {
          if (!p.nextActionAt || p.blockedAt || CLOSED_PROSPECT.has(p.status)) continue;
          // Un contact noté après la date prévue : la relance a eu lieu, rien à signaler.
          if (p.lastContactAt && p.lastContactAt.getTime() > p.nextActionAt.getTime()) continue;
          push(rule, { type: "Prospect", id: p.id, pharmacyId: null }, p.nextActionAt);
        }
        break;
      case "referral.filleul_joined":
        for (const filleul of input.filleuls ?? []) {
          // Une officine de démonstration, ou sans parrain, n'annonce rien à personne.
          if (filleul.isDemo || !filleul.referrerId) continue;
          push(rule, { type: "Pharmacy", id: filleul.id, pharmacyId: filleul.referrerId }, filleul.createdAt);
        }
        break;
      case "partner.range_invitation":
        for (const partner of input.partners ?? []) {
          if (PARTNER_NOT_INVITED.has(partner.status) || partner.brandCount > 0) continue;
          push(rule, { type: "Partner", id: partner.id, pharmacyId: null }, partner.createdAt);
        }
        break;
    }
  }
  return out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

// ---------------------------------------------------------------- Envoi manuel (« Contacter »)

/**
 * Les modèles qui ont besoin d'un contexte que la fenêtre « Contacter » n'a
 * pas : la relance de contrat porte le lien de signature (elle passe par le
 * bouton « Relancer » du contrat, qui tient aussi le compte des relances), les
 * modèles de résiliation la date de la demande ou la date de fin, le message
 * de parrainage le nom du filleul et son montant, l'invitation d'un partenaire
 * le partenaire lui-même (« Contacter » ne connaît que des officines et des
 * dossiers).
 */
export function isContextBoundTemplate(key: string): boolean {
  return key === "contract.reminder" || key.startsWith("cancellation.") || key === "referral.filleul_joined" || key === "partner.range_invitation";
}

/**
 * Les modèles proposés par « Contacter » : ceux du public demandé (plus le
 * message libre) ; un modèle lié à un contexte seulement si l'appelant le
 * demande explicitement (`defaultTemplateKey`), depuis la page qui détient ce
 * contexte. Un modèle du public « Partenaire » n'est jamais proposé à un
 * titulaire ni à un prospect, même quand l'appelant ne précise aucun public.
 */
export function contactTemplateChoices<T extends { key: string; audience: string }>(templates: T[], options: { audience?: string; defaultTemplateKey?: string } = {}): T[] {
  return templates.filter((t) => {
    const audienceFits = options.audience ? t.audience === options.audience || t.key === "generic.message" : t.audience !== "Partenaire";
    return audienceFits && (!isContextBoundTemplate(t.key) || t.key === options.defaultTemplateKey);
  });
}
