/**
 * Le droit d'envoyer un suivi.
 *
 * Quatre conditions, évaluées ici plutôt qu'à l'écran : une règle qui ne vit
 * que dans l'interface n'est pas une règle. Le service serveur appelle cette
 * fonction avant tout envoi, et la liste de travail l'appelle aussi pour dire
 * au pharmacien *pourquoi* une ligne n'est pas envoyable.
 */

export type SendBlockCode =
  | "NO_CONSENT"
  | "OPTED_OUT"
  | "NO_CONTACT"
  | "NO_LINK"
  | "TOO_SOON";

export type SendEligibility =
  | { allowed: true }
  | { allowed: false; code: SendBlockCode; reason: string; nextPossibleAt?: Date };

export type SendEligibilityInput = {
  /** Consentement `FOLLOW_UP_MESSAGE` explicitement accordé et non révoqué. */
  hasConsent: boolean;
  /** Le patient s'est désinscrit via le lien porté par un message. */
  optedOut: boolean;
  /** Une adresse de contact existe pour le canal choisi. */
  hasContact: boolean;
  /**
   * Une fiche conseil partageable existe. Le message ne contenant aucune donnée
   * de santé, le lien EST son contenu : sans lui, il n'y a rien à envoyer.
   */
  hasSharableLink: boolean;
  /** Date du dernier suivi effectivement envoyé à ce patient. */
  lastFollowUpAt: Date | null;
  /** Plafond de l'officine, en jours. */
  minIntervalDays: number;
  now: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateSendEligibility(input: SendEligibilityInput): SendEligibility {
  // L'ordre compte : une désinscription prime sur tout le reste, y compris sur
  // un consentement recueilli plus tôt au comptoir.
  if (input.optedOut) {
    return {
      allowed: false,
      code: "OPTED_OUT",
      reason: "Ce patient s'est désinscrit des suivis.",
    };
  }

  if (!input.hasConsent) {
    return {
      allowed: false,
      code: "NO_CONSENT",
      reason: "Aucun consentement au suivi n'a été recueilli. À demander au comptoir.",
    };
  }

  if (!input.hasContact) {
    return {
      allowed: false,
      code: "NO_CONTACT",
      reason: "Aucune adresse de contact enregistrée pour ce patient.",
    };
  }

  if (!input.hasSharableLink) {
    return {
      allowed: false,
      code: "NO_LINK",
      reason:
        "Aucune fiche conseil à partager. Générez-la depuis la vente : le message ne contient qu'un lien sécurisé.",
    };
  }

  if (input.lastFollowUpAt && input.minIntervalDays > 0) {
    const nextPossibleAt = new Date(
      input.lastFollowUpAt.getTime() + input.minIntervalDays * DAY_MS,
    );
    if (nextPossibleAt > input.now) {
      return {
        allowed: false,
        code: "TOO_SOON",
        reason: `Un suivi a déjà été envoyé récemment. Prochain envoi possible à partir du ${nextPossibleAt.toLocaleDateString("fr-FR")}.`,
        nextPossibleAt,
      };
    }
  }

  return { allowed: true };
}
