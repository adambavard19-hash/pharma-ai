/**
 * L'abonnement PharmaBoost, vu du domaine : statuts, libellés, calculs.
 *
 * Aucune dépendance à Stripe ici. Le serveur traduit les objets Stripe en ces
 * formes (`src/server/billing`), et les écrans ne lisent que celles-ci. Ce qui
 * se dit au titulaire et à l'administrateur est écrit ici, une fois.
 */

export const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "SUSPENDED", "INCOMPLETE", "INCOMPLETE_EXPIRED", "UNPAID", "PAUSED"] as const;
export type SubscriptionStatusCode = (typeof SUBSCRIPTION_STATUSES)[number];

export type Tone = "neutral" | "info" | "brand" | "success" | "warning" | "danger";

/** Ce que lisent l'administrateur et le titulaire pour chaque statut. */
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatusCode, { label: string; tone: Tone; patient: string }> = {
  TRIALING: { label: "Essai gratuit", tone: "info", patient: "Votre premier mois est offert." },
  ACTIVE: { label: "Actif", tone: "success", patient: "Votre abonnement est actif." },
  PAST_DUE: { label: "Paiement échoué", tone: "warning", patient: "Le dernier prélèvement a échoué : mettez à jour votre moyen de paiement." },
  CANCELED: { label: "Résilié", tone: "danger", patient: "Votre abonnement est résilié." },
  SUSPENDED: { label: "Suspendu", tone: "danger", patient: "L'accès à PharmaBoost est suspendu. Contactez-nous." },
  INCOMPLETE: { label: "Paiement à finaliser", tone: "warning", patient: "Le paiement initial n'a pas abouti : finalisez-le pour activer l'abonnement." },
  INCOMPLETE_EXPIRED: { label: "Souscription expirée", tone: "danger", patient: "La souscription n'a pas été finalisée à temps." },
  UNPAID: { label: "Impayé", tone: "danger", patient: "Des factures restent impayées : régularisez pour rétablir l'accès." },
  PAUSED: { label: "En pause", tone: "warning", patient: "Votre abonnement est en pause : aucun moyen de paiement n'a été fourni à la fin de l'essai." },
};

/**
 * Le statut Stripe (`trialing`, `active`, `past_due`, `canceled`, `unpaid`,
 * `incomplete`, `incomplete_expired`, `paused`) devient le nôtre. Inconnu :
 * on garde ce que l'on avait, jamais un statut inventé.
 */
export function subscriptionStatusFromStripe(stripeStatus: string, fallback: SubscriptionStatusCode = "INCOMPLETE"): SubscriptionStatusCode {
  const upper = stripeStatus.toUpperCase();
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(upper) ? (upper as SubscriptionStatusCode) : fallback;
}

/** L'accès à l'application reste ouvert dans ces états. */
export function subscriptionGrantsAccess(status: SubscriptionStatusCode): boolean {
  return status === "TRIALING" || status === "ACTIVE" || status === "PAST_DUE" || status === "INCOMPLETE";
}

/** Ce que voit l'administrateur en une ligne : « Invitation envoyée », « Essai gratuit »… */
export type SubscriptionStageInput = {
  status: SubscriptionStatusCode | null;
  inviteSentAt: Date | null;
  suspendedAt: Date | null;
};

export function subscriptionStage(input: SubscriptionStageInput): { label: string; tone: Tone } {
  if (input.suspendedAt) return { label: "Suspendu", tone: "danger" };
  if (input.status) return SUBSCRIPTION_STATUS_LABELS[input.status];
  if (input.inviteSentAt) return { label: "Invitation envoyée", tone: "brand" };
  return { label: "À inviter", tone: "neutral" };
}

export type ContractStageInput = { status: string | null };

/** Contrat : « À préparer / Envoyé / Signé », à partir du statut détaillé. */
export function contractStage(input: ContractStageInput): { label: string; tone: Tone } {
  switch (input.status) {
    case null:
      return { label: "À préparer", tone: "neutral" };
    case "DRAFT":
      return { label: "Préparé", tone: "info" };
    case "SENT":
      return { label: "Envoyé", tone: "brand" };
    case "OPENED":
      return { label: "Ouvert", tone: "brand" };
    case "SIGNED_PHARMACY":
      return { label: "Signé pharmacie", tone: "success" };
    case "SIGNED_COMPANY":
      return { label: "Signé société", tone: "success" };
    case "FINALIZED":
      return { label: "Signé", tone: "success" };
    case "REFUSED":
      return { label: "Refusé", tone: "danger" };
    case "EXPIRED":
      return { label: "Expiré", tone: "warning" };
    default:
      return { label: input.status, tone: "neutral" };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** La fin d'essai, calculée depuis le début et le nombre de jours offerts. */
export function trialEndDate(start: Date, trialDays: number): Date {
  return new Date(start.getTime() + Math.max(0, trialDays) * DAY_MS);
}

export function formatEuros(cents: number): string {
  // Espace insécable classique plutôt que l'espace fine d'Intl : lisible
  // partout, y compris dans le texte du Checkout et les e-mails.
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100).replace(/\u202f|\u00a0/g, " ");
}

export function formatFrenchDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/**
 * La phrase du Checkout, et de l'espace titulaire : « Premier mois offert,
 * puis 129 €/mois à partir du 18/10/2026. Aucun débit pendant la période
 * gratuite. » Sans essai : « 129 €/mois à partir d'aujourd'hui ».
 */
export function trialSentence(input: { monthlyPriceCents: number; trialDays: number; trialEndsAt: Date }): string {
  const price = `${formatEuros(input.monthlyPriceCents)}/mois`;
  if (input.trialDays <= 0) return `${price}, prélevé chaque mois à compter d'aujourd'hui.`;
  const offer = input.trialDays === 30 || input.trialDays === 31 ? "Premier mois offert" : `${input.trialDays} jours offerts`;
  return `${offer}, puis ${price} à partir du ${formatFrenchDate(input.trialEndsAt)}. Aucun débit pendant la période gratuite.`;
}

/** Le MRR : la somme des tarifs des abonnements actifs ou en essai avec moyen de paiement — jamais les résiliés ni les impayés. */
export function monthlyRecurringRevenueCents(rows: { status: SubscriptionStatusCode; monthlyPriceCents: number; cancelAtPeriodEnd: boolean }[]): number {
  return rows
    .filter((row) => (row.status === "ACTIVE" || row.status === "TRIALING" || row.status === "PAST_DUE") && !row.cancelAtPeriodEnd)
    .reduce((sum, row) => sum + row.monthlyPriceCents, 0);
}

/** Les essais qui se terminent dans les `days` prochains jours. */
export function trialEndingSoon(trialEndsAt: Date | null, now: Date, days = 7): boolean {
  if (!trialEndsAt) return false;
  const delta = trialEndsAt.getTime() - now.getTime();
  return delta >= 0 && delta <= days * DAY_MS;
}

/** Un code d'offre : lettres, chiffres, tirets ; en majuscules. */
export function normalizePlanCode(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}
