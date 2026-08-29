/**
 * Les messages de suivi patient.
 *
 * Ils vivent dans le code, pas en base : un texte figé, versionné, testable et
 * relu vaut mieux qu'un champ libre où une justification médicale pourrait être
 * improvisée pour faire revenir un patient.
 *
 * Règle structurelle : **un message de suivi ne contient aucune donnée de
 * santé**. Ni molécule, ni pathologie, ni posologie, ni même le motif clinique
 * du rappel. Il dit que la pharmacie a préparé un suivi et propose un lien
 * sécurisé ; tout le contenu de santé reste derrière ce lien, protégé par un
 * jeton à durée limitée. C'est la raison pour laquelle les gabarits ne
 * reçoivent que quatre variables — le reste leur est structurellement
 * inaccessible.
 */

export type ReminderReasonCode =
  | "COURSE_END"
  | "RENEWAL"
  | "TOLERANCE_CHECK"
  | "SEASONAL"
  | "CUSTOM";

/**
 * Tout ce qu'un gabarit peut connaître du patient.
 *
 * Volontairement pauvre. Ajouter un champ ici, c'est autoriser une donnée de
 * plus à sortir de l'officine par e-mail : à ne faire qu'en connaissance de
 * cause, et jamais pour une information de santé.
 */
export type FollowUpVariables = {
  patientFirstName: string;
  pharmacyName: string;
  /** Lien sécurisé vers la fiche conseil, à durée limitée. */
  link: string;
  /** Lien de désinscription, fonctionnel sans compte. */
  unsubscribeLink: string;
};

export type FollowUpTemplate = {
  key: string;
  reason: ReminderReasonCode;
  /** Intitulé destiné au pharmacien, dans la liste de travail. */
  label: string;
  /** Ce que le rappel sert à faire, en langage pharmacien. */
  purpose: string;
  /** Délai proposé par défaut, en jours après le fait générateur. */
  defaultDelayDays: number;
  subject: (variables: FollowUpVariables) => string;
  body: (variables: FollowUpVariables) => string;
};

const signature = (v: FollowUpVariables) =>
  `\n\nVotre pharmacie ${v.pharmacyName}\n\n` +
  `Ce message ne contient aucune information sur votre santé.\n` +
  `Pour ne plus recevoir de suivi : ${v.unsubscribeLink}`;

export const FOLLOW_UP_TEMPLATES: FollowUpTemplate[] = [
  {
    key: "tolerance-check",
    reason: "TOLERANCE_CHECK",
    label: "Contrôle de tolérance",
    purpose:
      "Vérifier que le traitement est bien supporté dans les premiers jours, quand l'arrêt prématuré est le plus fréquent.",
    defaultDelayDays: 3,
    subject: (v) => `${v.pharmacyName} — comment se passent vos premiers jours ?`,
    body: (v) =>
      `Bonjour ${v.patientFirstName},\n\n` +
      `Quelques jours après votre passage, votre pharmacien souhaite savoir si tout se passe bien.\n\n` +
      `Vos conseils personnalisés restent disponibles ici : ${v.link}\n\n` +
      `Si quelque chose vous gêne, n'hésitez pas à passer ou à nous appeler.` +
      signature(v),
  },
  {
    key: "course-end",
    reason: "COURSE_END",
    label: "Fin de traitement",
    purpose:
      "Reprendre contact quand la cure se termine : c'est le moment où une question reste souvent sans réponse.",
    defaultDelayDays: 7,
    subject: (v) => `${v.pharmacyName} — un point de fin de traitement`,
    body: (v) =>
      `Bonjour ${v.patientFirstName},\n\n` +
      `Votre traitement arrive à son terme. Votre pharmacien reste disponible si vous avez une question.\n\n` +
      `Vos conseils personnalisés sont toujours consultables ici : ${v.link}` +
      signature(v),
  },
  {
    key: "renewal",
    reason: "RENEWAL",
    label: "Renouvellement",
    purpose:
      "Rappeler l'échéance d'un traitement au long cours, pour éviter une rupture de traitement entre deux ordonnances.",
    defaultDelayDays: 28,
    subject: (v) => `${v.pharmacyName} — pensez à votre renouvellement`,
    body: (v) =>
      `Bonjour ${v.patientFirstName},\n\n` +
      `Il est bientôt temps de renouveler votre traitement. Votre pharmacie se tient prête à vous accompagner.\n\n` +
      `Vos conseils personnalisés : ${v.link}` +
      signature(v),
  },
  {
    key: "seasonal",
    reason: "SEASONAL",
    label: "Rappel saisonnier",
    purpose:
      "Reprendre contact sur un besoin saisonnier déjà exprimé par le patient — jamais sur un besoin supposé.",
    defaultDelayDays: 180,
    subject: (v) => `${v.pharmacyName} — c'est le moment d'y penser`,
    body: (v) =>
      `Bonjour ${v.patientFirstName},\n\n` +
      `La saison revient : votre pharmacien a préparé quelques conseils à votre attention.\n\n` +
      `À consulter ici : ${v.link}` +
      signature(v),
  },
  {
    key: "custom",
    reason: "CUSTOM",
    label: "Suivi personnalisé",
    purpose: "Un rappel décidé par le pharmacien, hors des cas prévus.",
    defaultDelayDays: 14,
    subject: (v) => `${v.pharmacyName} — votre pharmacien vous recontacte`,
    body: (v) =>
      `Bonjour ${v.patientFirstName},\n\n` +
      `Votre pharmacien a préparé un suivi personnalisé à votre attention.\n\n` +
      `À consulter ici : ${v.link}` +
      signature(v),
  },
];

export function findTemplate(key: string): FollowUpTemplate | null {
  return FOLLOW_UP_TEMPLATES.find((template) => template.key === key) ?? null;
}

/** Échéance proposée à partir du fait générateur. */
export function proposedDueDate(
  template: FollowUpTemplate,
  from: Date,
  treatmentDurationDays?: number | null,
): Date {
  // Une fin de cure se calcule sur la durée réelle du traitement quand on la
  // connaît : proposer J+7 sur une cure de trois mois n'aurait aucun sens.
  const days =
    template.reason === "COURSE_END" && treatmentDurationDays && treatmentDurationDays > 0
      ? treatmentDurationDays
      : template.defaultDelayDays;

  const due = new Date(from);
  due.setDate(due.getDate() + days);
  due.setHours(9, 0, 0, 0);
  return due;
}
