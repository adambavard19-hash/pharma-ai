/**
 * Relances d'un contrat non signé : une cadence sobre, réglable depuis la
 * console, qui s'arrête net dès que le titulaire a signé. Pure : la décision
 * ne dépend que du contrat, de la règle et de l'heure.
 */
export type ReminderPolicy = {
  enabled: boolean;
  /** Jours après l'envoi avant le premier rappel. */
  firstAfterDays: number;
  /** Jours après le premier rappel avant le second (0 : pas de second rappel). */
  secondAfterDays: number;
  /** Jours après le dernier rappel avant de signaler le dossier à l'équipe (0 : jamais). */
  escalateAfterDays: number;
};

export const DEFAULT_REMINDER_POLICY: ReminderPolicy = { enabled: true, firstAfterDays: 3, secondAfterDays: 4, escalateAfterDays: 3 };

export const REMINDER_SETTING_KEY = "contract.reminders";

/** Une règle lue en base, bornée : une saisie absurde ne harcèle personne. */
export function sanitizePolicy(value: unknown): ReminderPolicy {
  const v = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof ReminderPolicy, unknown>>;
  const days = (x: unknown, fallback: number, min: number) => {
    const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
    return Number.isFinite(n) ? Math.min(30, Math.max(min, Math.round(n))) : fallback;
  };
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_REMINDER_POLICY.enabled,
    firstAfterDays: days(v.firstAfterDays, DEFAULT_REMINDER_POLICY.firstAfterDays, 1),
    secondAfterDays: days(v.secondAfterDays, DEFAULT_REMINDER_POLICY.secondAfterDays, 0),
    escalateAfterDays: days(v.escalateAfterDays, DEFAULT_REMINDER_POLICY.escalateAfterDays, 0),
  };
}

export type ReminderContract = {
  status: string;
  sentAt: Date | null;
  reminderCount: number;
  lastReminderAt: Date | null;
  escalatedAt: Date | null;
  expiresAt: Date | null;
};

export type ReminderAction = "REMIND" | "ESCALATE" | null;

const DAY = 24 * 3600 * 1000;

/** Seuls les contrats qui attendent la signature du titulaire sont relancés. */
export const AWAITING_PHARMACY = ["SENT", "OPENED"];

export function nextReminderAction(contract: ReminderContract, policy: ReminderPolicy, now: Date): ReminderAction {
  if (!policy.enabled || !contract.sentAt) return null;
  if (!AWAITING_PHARMACY.includes(contract.status)) return null;
  if (contract.expiresAt && contract.expiresAt <= now) return null;
  const elapsed = (since: Date) => now.getTime() - since.getTime();
  const maxReminders = policy.secondAfterDays > 0 ? 2 : 1;
  if (contract.reminderCount === 0) return elapsed(contract.sentAt) >= policy.firstAfterDays * DAY ? "REMIND" : null;
  const last = contract.lastReminderAt ?? contract.sentAt;
  if (contract.reminderCount < maxReminders) return elapsed(last) >= policy.secondAfterDays * DAY ? "REMIND" : null;
  if (policy.escalateAfterDays > 0 && !contract.escalatedAt && elapsed(last) >= policy.escalateAfterDays * DAY) return "ESCALATE";
  return null;
}
