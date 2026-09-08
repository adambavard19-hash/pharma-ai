type Tone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

export const PRESCRIPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  EXTRACTING: { label: "Extraction en cours", tone: "info" },
  NEEDS_VERIFICATION: { label: "À vérifier", tone: "warning" },
  VERIFIED: { label: "Vérifiée", tone: "info" },
  ANALYZING: { label: "Analyse en cours", tone: "info" },
  ANALYZED: { label: "Conseils à valider", tone: "brand" },
  VALIDATED: { label: "Validée", tone: "success" },
  DELIVERED: { label: "Délivrée", tone: "success" },
  CANCELLED: { label: "Annulée", tone: "neutral" },
  FAILED: { label: "Échec", tone: "danger" },
};

export const RECOMMENDATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  PROPOSED: { label: "Proposé", tone: "brand" },
  ACCEPTED: { label: "Accepté", tone: "success" },
  MODIFIED: { label: "Modifié", tone: "info" },
  REPLACED: { label: "Remplacé", tone: "info" },
  REMOVED: { label: "Retiré", tone: "neutral" },
  PRESENTED: { label: "Présenté au patient", tone: "info" },
  PURCHASED: { label: "Acheté", tone: "accent" },
  DECLINED: { label: "Non retenu", tone: "neutral" },
};

export const CONSENT_LABELS: Record<string, { label: string; description: string }> = {
  DATA_PROCESSING: {
    label: "Traitement des données personnelles",
    description: "Identité, coordonnées et historique commercial.",
  },
  HEALTH_DATA: {
    label: "Traitement des données de santé",
    description: "Traitements, allergies et informations médicales nécessaires au conseil.",
  },
  ADVICE_SHARING: {
    label: "Réception de la fiche conseil",
    description: "Remise ou envoi du document d'accompagnement personnalisé.",
  },
  MARKETING_EMAIL: {
    label: "Communications par e-mail",
    description: "Informations et offres de l'officine.",
  },
  MARKETING_SMS: {
    label: "Communications par SMS",
    description: "Informations et offres de l'officine.",
  },
};

/**
 * Les tons suivent la règle de couleur du comptoir (`@/config/counter-tone`) :
 * une information est neutre, jamais bleue. Une cinquième couleur dans l'écran
 * de vente reviendrait à demander au pharmacien d'en apprendre une de plus.
 */
export const SAFETY_SEVERITY: Record<string, { label: string; tone: Tone }> = {
  INFO: { label: "Information", tone: "neutral" },
  CAUTION: { label: "À vérifier", tone: "warning" },
  WARNING: { label: "Vigilance", tone: "warning" },
  BLOCKING: { label: "Bloquant", tone: "danger" },
};
