import { FOLLOW_UP_TEMPLATES, findTemplate, proposedDueDate } from "./templates";
import type { FollowUpTemplate } from "./templates";

/**
 * Le rappel que l'officine devrait proposer — s'il y en a un.
 *
 * Fonction pure : mêmes entrées, même proposition. Elle décide d'UN seul
 * rappel, jamais d'une liste à trier au comptoir. Proposer trois options
 * revient à demander au pharmacien de réfléchir à notre place pendant qu'un
 * patient attend.
 *
 * Deux règles la gouvernent, dans cet ordre.
 *
 * 1. **Ne rien proposer est un résultat normal.** Pas de consentement, pas
 *    d'adresse, une désinscription, un rappel déjà programmé, un traitement
 *    qui n'appelle aucun suivi : la fonction renvoie `null` avec le motif. Un
 *    produit qui propose toujours quelque chose finit par proposer n'importe
 *    quoi.
 * 2. **La proposition se justifie par le traitement**, jamais par un profil
 *    d'appétence ni par une opportunité commerciale. Un rappel est un acte
 *    d'accompagnement adossé à un fait : une cure qui se termine, un
 *    traitement long qui arrive à échéance.
 */

export type SuggestionInput = {
  /** Durée la plus longue parmi les lignes confirmées, en jours. */
  treatmentDurationDays: number | null;
  hasConsent: boolean;
  optedOut: boolean;
  hasContact: boolean;
  /** Gabarits déjà programmés pour cette ordonnance. */
  alreadyScheduled: string[];
  now: Date;
};

export type FollowUpSuggestion = {
  template: FollowUpTemplate;
  dueAt: Date;
  /** Une phrase, lisible au comptoir, qui dit pourquoi. */
  reason: string;
};

export type SuggestionOutcome =
  | { suggested: true; suggestion: FollowUpSuggestion }
  | { suggested: false; reason: string };

/** Au-delà, une cure n'est plus une cure : c'est un traitement de fond. */
const SHORT_COURSE_MAX_DAYS = 30;
/** En deçà, une « fin de cure » tombe trop tôt pour valoir un message. */
const SHORT_COURSE_MIN_DAYS = 3;
/**
 * À partir de cette durée, l'échéance utile est le renouvellement.
 *
 * Le seuil porte sur la DURÉE PRESCRITE, qui est un fait lu sur l'ordonnance.
 * Pharma.ai ne déduit pas qu'un patient est « chronique » — ce serait un profil,
 * et un rappel adossé à un profil n'est plus un suivi.
 */
const LONG_COURSE_MIN_DAYS = 60;

export function suggestFollowUp(input: SuggestionInput): SuggestionOutcome {
  // L'ordre reprend celui de l'éligibilité à l'envoi : une désinscription
  // prime sur tout, y compris sur un consentement recueilli plus tôt.
  if (input.optedOut) {
    return { suggested: false, reason: "Ce patient s'est désinscrit des suivis." };
  }
  if (!input.hasConsent) {
    return {
      suggested: false,
      reason:
        "Aucun consentement au suivi n'a été recueilli. Proposez-le au patient avant de programmer un rappel.",
    };
  }
  if (!input.hasContact) {
    return {
      suggested: false,
      reason: "Aucune adresse e-mail n'est renseignée pour ce patient.",
    };
  }

  const duration = input.treatmentDurationDays ?? 0;

  const candidate = chooseTemplate({
    duration,
    already: new Set(input.alreadyScheduled),
  });

  if (!candidate) {
    return {
      suggested: false,
      reason:
        input.alreadyScheduled.length > 0
          ? "Un rappel est déjà programmé pour cette ordonnance."
          : "Ce traitement n'appelle pas de rappel particulier.",
    };
  }

  const dueAt = proposedDueDate(candidate.template, input.now, input.treatmentDurationDays);

  return {
    suggested: true,
    suggestion: { template: candidate.template, dueAt, reason: candidate.reason },
  };
}

function chooseTemplate(input: {
  duration: number;
  already: Set<string>;
}): { template: FollowUpTemplate; reason: string } | null {
  const take = (key: string, reason: string) => {
    if (input.already.has(key)) return null;
    const template = findTemplate(key);
    return template ? { template, reason } : null;
  };

  // Un traitement long : l'échéance qui compte est le renouvellement. Une
  // rupture entre deux ordonnances est le risque principal.
  if (input.duration >= LONG_COURSE_MIN_DAYS) {
    const renewal = take(
      "renewal",
      `Traitement de ${input.duration} jours : un rappel avant l'échéance évite une rupture entre deux ordonnances.`,
    );
    if (renewal) return renewal;
  }

  // Une cure courte : le moment utile est sa fin, quand une question reste
  // souvent sans réponse.
  if (input.duration >= SHORT_COURSE_MIN_DAYS && input.duration <= SHORT_COURSE_MAX_DAYS) {
    const courseEnd = take(
      "course-end",
      `Cure de ${input.duration} jours : un point à son terme, quand une question reste souvent sans réponse.`,
    );
    if (courseEnd) return courseEnd;
  }

  // À défaut, le contrôle de tolérance des premiers jours — le moment où un
  // traitement est le plus souvent arrêté prématurément.
  if (input.duration > 0) {
    const tolerance = take(
      "tolerance-check",
      "Les premiers jours sont ceux où un traitement est le plus souvent interrompu.",
    );
    if (tolerance) return tolerance;
  }

  return null;
}

/** Les gabarits proposables d'office. Le sur-mesure et le saisonnier restent manuels. */
export const SUGGESTIBLE_TEMPLATES = FOLLOW_UP_TEMPLATES.filter(
  (template) => template.key !== "custom" && template.key !== "seasonal",
);
