/**
 * Les trois réponses qu'un patient peut donner à un suivi.
 *
 * Fermées, sans texte libre : un suivi d'officine prend des nouvelles, il ne
 * recueille pas d'anamnèse par e-mail. « J'ai encore besoin d'un conseil »
 * fait remonter le patient dans l'espace de l'officine ; rien n'est déduit,
 * rien n'est modifié dans son traitement.
 */

export type FollowUpAnswerCode = "BETTER" | "SAME" | "NEED_ADVICE";

export const FOLLOW_UP_ANSWERS: {
  code: FollowUpAnswerCode;
  /** Valeur dans le lien du message : courte, sans accent. */
  slug: string;
  emoji: string;
  /** Ce que le patient lit sur le bouton. */
  label: string;
  /** Ce que le pharmacien lit dans sa liste. */
  pharmacistLabel: string;
  /** Réponse affichée au patient après son clic. */
  acknowledgement: (pharmacyName: string) => string;
}[] = [
  {
    code: "BETTER",
    slug: "mieux",
    emoji: "🙂",
    label: "Ça va mieux",
    pharmacistLabel: "Va mieux",
    acknowledgement: (pharmacyName) =>
      `Merci, c'est une bonne nouvelle. Toute l'équipe de la ${pharmacyName} vous souhaite une bonne continuation.`,
  },
  {
    code: "SAME",
    slug: "pareil",
    emoji: "😐",
    label: "Pas vraiment de changement",
    pharmacistLabel: "Pas de changement",
    acknowledgement: (pharmacyName) =>
      `Merci pour votre retour. Si la situation ne s'améliore pas, n'hésitez pas à passer à la ${pharmacyName} ou à consulter votre médecin.`,
  },
  {
    code: "NEED_ADVICE",
    slug: "conseil",
    emoji: "🙁",
    label: "J'ai encore besoin d'un conseil",
    pharmacistLabel: "Besoin d'un conseil",
    acknowledgement: (pharmacyName) =>
      `Merci, votre pharmacien est prévenu. L'équipe de la ${pharmacyName} reprendra contact avec vous ou vous accueillera au comptoir.`,
  },
];

export function findAnswerBySlug(slug: string | null | undefined) {
  return FOLLOW_UP_ANSWERS.find((answer) => answer.slug === slug) ?? null;
}

export function findAnswer(code: string | null | undefined) {
  return FOLLOW_UP_ANSWERS.find((answer) => answer.code === code) ?? null;
}
