/**
 * Les scénarios de relance de la console : essai, paiement, résiliation,
 * suivi commercial. La cadence des relances de contrat, elle, existe déjà
 * (`PlatformSetting["contract.reminders"]`, `runContractReminders`) : la
 * console la présente avec les autres, sans la dupliquer.
 *
 * Trois garde-fous structurels :
 *   1. une règle est DÉSACTIVÉE tant qu'un administrateur ne l'a pas activée :
 *      déployer ce code n'envoie rien ;
 *   2. une règle ne rattrape que ce qui est échu depuis moins de
 *      `CATCH_UP_DAYS` : activer une règle aujourd'hui n'écrit pas à tous les
 *      essais des derniers mois ;
 *   3. chaque déclenchement porte une clé unique (règle, cible, occurrence) :
 *      deux passages, même simultanés, n'envoient jamais deux fois.
 *
 * Ce module est pur : il reçoit les candidats lus en base et rend la liste
 * de ce qui est dû. L'envoi et l'écriture des clés sont faits côté serveur.
 */

export const CATCH_UP_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AutomationScenario = "TRIAL" | "PAYMENT" | "CANCELLATION" | "COMMERCIAL";
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
  /** Avertissement affiché : un autre envoi existe déjà pour le même moment. */
  overlap?: string;
};

export const AUTOMATION_SCENARIOS: Record<AutomationScenario, { label: string; description: string }> = {
  TRIAL: { label: "Essai gratuit", description: "De la bienvenue à la fin de l'essai, pour les officines en essai." },
  PAYMENT: { label: "Paiement", description: "Après un paiement échoué resté impayé : relances au titulaire, puis alerte à l'équipe." },
  CANCELLATION: { label: "Résiliation", description: "Accusé de réception d'une demande, puis confirmation." },
  COMMERCIAL: { label: "Suivi commercial", description: "Alerte interne quand une relance prévue sur un dossier est dépassée." },
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
  blockedAt: Date | null;
  salesRepId: string | null;
};

export type PlannedAutomation = {
  ruleKey: string;
  dedupeKey: string;
  targetType: "Subscription" | "CancellationRequest" | "Prospect";
  targetId: string;
  pharmacyId: string | null;
  /** Le moment où la règle devenait due. */
  dueAt: Date;
  channel: AutomationChannel;
  templateKey?: string;
  /** L'événement de référence (début d'essai, échec de paiement…) : utile au texte. */
  anchorAt: Date;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/** Une règle est due si son échéance est passée depuis moins de `CATCH_UP_DAYS`. */
export function isDueNow(dueAt: Date, now: Date): boolean {
  const age = now.getTime() - dueAt.getTime();
  return age >= 0 && age <= CATCH_UP_DAYS * DAY_MS;
}

/** Un paiement échoué est encore impayé si aucun paiement réussi n'est venu après. */
export function hasUnpaidFailure(sub: Pick<SubscriptionCandidate, "lastPaymentAt" | "lastPaymentFailedAt" | "status">): boolean {
  if (!sub.lastPaymentFailedAt) return false;
  if (sub.status === "CANCELED" || sub.status === "INCOMPLETE_EXPIRED") return false;
  return !sub.lastPaymentAt || sub.lastPaymentAt.getTime() < sub.lastPaymentFailedAt.getTime();
}

const TRIAL_NOT_CONTINUED = new Set(["PAUSED", "CANCELED", "INCOMPLETE", "INCOMPLETE_EXPIRED"]);
const OPEN_CANCELLATION = new Set(["RECEIVED", "IN_PROGRESS"]);
const CLOSED_PROSPECT = new Set(["ACTIVATED", "LOST"]);

/**
 * Ce qui est dû maintenant, règle par règle. `alreadyDone` contient les clés
 * déjà consommées : un déclenchement présent n'est jamais reproposé.
 */
export function planAutomations(input: {
  rules: ResolvedRule[];
  subscriptions: SubscriptionCandidate[];
  cancellations: CancellationCandidate[];
  prospects: ProspectCandidate[];
  alreadyDone: Set<string>;
  now: Date;
}): PlannedAutomation[] {
  const { now } = input;
  const out: PlannedAutomation[] = [];
  const seen = new Set<string>();
  const push = (rule: ResolvedRule, target: { type: PlannedAutomation["targetType"]; id: string; pharmacyId: string | null }, anchorAt: Date) => {
    const dueAt = addDays(anchorAt, rule.offsetDays);
    if (!isDueNow(dueAt, now)) return;
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
          push(rule, { type: "Subscription", id: sub.id, pharmacyId: sub.pharmacyId }, sub.lastPaymentFailedAt!);
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
          push(rule, { type: "Prospect", id: p.id, pharmacyId: null }, p.nextActionAt);
        }
        break;
    }
  }
  return out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}
