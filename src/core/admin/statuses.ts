/**
 * Les statuts que lit la console, avec leur libellé et leur couleur : un seul
 * endroit, pour qu'un même état se lise pareil sur toutes les pages.
 */

export type StatusTone = "neutral" | "info" | "brand" | "success" | "warning" | "danger";
export type StatusLabel = { label: string; tone: StatusTone };

// ---------------------------------------------------------------- Résiliations

export const CANCELLATION_STATUSES = ["RECEIVED", "IN_PROGRESS", "CONFIRMED", "CANCELED", "COMPLETED"] as const;
export type CancellationStatusCode = (typeof CANCELLATION_STATUSES)[number];

export const CANCELLATION_STATUS_LABELS: Record<CancellationStatusCode, StatusLabel> = {
  RECEIVED: { label: "Demande reçue", tone: "warning" },
  IN_PROGRESS: { label: "En traitement", tone: "info" },
  CONFIRMED: { label: "Confirmée", tone: "danger" },
  CANCELED: { label: "Annulée par le client", tone: "success" },
  COMPLETED: { label: "Terminée", tone: "neutral" },
};

/** Les passages permis : on avance, on annule, mais une demande terminée ou annulée ne rouvre pas. */
export const CANCELLATION_TRANSITIONS: Record<CancellationStatusCode, CancellationStatusCode[]> = {
  RECEIVED: ["IN_PROGRESS", "CONFIRMED", "CANCELED"],
  IN_PROGRESS: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["COMPLETED", "CANCELED"],
  CANCELED: [],
  COMPLETED: [],
};

export function canMoveCancellation(from: CancellationStatusCode, to: CancellationStatusCode): boolean {
  return CANCELLATION_TRANSITIONS[from].includes(to);
}

export function isOpenCancellation(status: string): boolean {
  return status === "RECEIVED" || status === "IN_PROGRESS" || status === "CONFIRMED";
}

export const CANCELLATION_REASONS: Record<string, string> = {
  PRICE: "Prix",
  NOT_USED: "Peu utilisé",
  MISSING_FEATURE: "Fonctionnalité manquante",
  CLOSURE: "Cession ou fermeture de l'officine",
  COMPETITOR: "Passage à un concurrent",
  TECHNICAL: "Difficulté technique",
  OTHER: "Autre",
};

export const CANCELLATION_CHANNELS: Record<string, string> = {
  EMAIL: "E-mail",
  PHONE: "Téléphone",
  MAIL: "Courrier",
  MEETING: "Rendez-vous",
  OTHER: "Autre",
};

// ---------------------------------------------------------------- Paiements (factures Stripe)

export const PAYMENT_STATUS_LABELS: Record<string, StatusLabel> = {
  PAID: { label: "Payée", tone: "success" },
  FAILED: { label: "Échouée", tone: "danger" },
  OPEN: { label: "En attente", tone: "warning" },
  VOID: { label: "Annulée", tone: "neutral" },
  UNCOLLECTIBLE: { label: "Irrécouvrable", tone: "danger" },
  DRAFT: { label: "Brouillon", tone: "neutral" },
};

export function paymentStatusLabel(status: string): StatusLabel {
  return PAYMENT_STATUS_LABELS[status] ?? { label: status, tone: "neutral" };
}

// ---------------------------------------------------------------- E-mails

export const DISPATCH_STATUS: Record<string, StatusLabel> = {
  SENT: { label: "Envoyé", tone: "info" },
  DELIVERED: { label: "Délivré", tone: "success" },
  DELAYED: { label: "Délivrance retardée", tone: "warning" },
  BOUNCED: { label: "Adresse rejetée", tone: "danger" },
  COMPLAINED: { label: "Signalé comme indésirable", tone: "danger" },
  FAILED: { label: "Échec d'envoi", tone: "danger" },
  SIMULATED: { label: "Non envoyé (messagerie non configurée)", tone: "warning" },
};

export function dispatchStatusLabel(status: string): StatusLabel {
  return DISPATCH_STATUS[status] ?? { label: status, tone: "neutral" };
}

export const DISPATCH_TRIGGER_LABELS: Record<string, string> = {
  AUTOMATIC: "Automatique",
  MANUAL: "Manuel",
  TEST: "Test",
  SYSTEM: "Système",
};

export const DISPATCH_KIND_LABELS: Record<string, string> = {
  INVITATION: "Invitation à créer son espace",
  WELCOME: "Bienvenue (accès)",
  ACCESS_LINK: "Lien d'accès",
  DOSSIER_RECEIVED: "Dossier d'inscription reçu",
  CONTRACT_SENT: "Envoi du contrat",
  CONTRACT_REMINDER: "Relance de contrat",
  PAYMENT_FAILED: "Paiement échoué",
  TRIAL_ENDING: "Fin d'essai (Stripe)",
  SUBSCRIPTION_STARTED: "Abonnement démarré",
  CONTRACT_SIGNED_PHARMACY: "Signature de l'officine reçue",
  CONTRACT_FINALIZED: "Contrat finalisé",
  SUBSCRIPTION_INVITE: "Lien d'activation de l'abonnement",
  EMAIL_CONFIRMATION: "Confirmation d'adresse avant contrat",
  SUBSCRIPTION_RECEIVED: "Demande d'abonnement reçue",
  SITE_LEAD_ACK: "Accusé de demande de démonstration",
  INSTALL_GUIDE: "Guide d'installation",
  SUPPORT_ALERT: "Alerte support (une officine a écrit)",
  SUPPORT_REPLY: "Réponse du support à une officine",
  PATIENT_REPORT: "Bilan de comptoir envoyé à un patient",
  COUNTER_MONTHLY: "Bilan mensuel du comptoir au titulaire",
  TEMPLATE: "Modèle",
  CAMPAIGN: "Campagne",
};
