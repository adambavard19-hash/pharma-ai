/**
 * Un dépôt de stock : le fichier que le titulaire envoie depuis son espace
 * PharmaBoost. Les types partagés par le service, les actions et les deux
 * écrans (espace officine et console).
 */
export const DEPOSIT_STATUSES = ["RECEIVED", "APPLIED", "HELD", "FAILED", "REJECTED"] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

/** Ce que l'équipe décide d'un fichier resté en attente (HELD). */
export const DEPOSIT_DECISIONS = ["APPLY_FULL", "APPLY_PARTIAL", "REJECT"] as const;
export type DepositDecision = (typeof DEPOSIT_DECISIONS)[number];

/** D'où vient le fichier : l'espace du titulaire, le petit facteur du serveur, ou l'équipe PharmaBoost. */
export const DEPOSIT_SOURCES = ["WEB", "AGENT", "CONSOLE"] as const;
export type DepositSource = (typeof DEPOSIT_SOURCES)[number];

export type DepositView = {
  id: string;
  pharmacyId: string;
  /** Renseigné pour la console ; absent côté officine. */
  pharmacyName?: string;
  fileName: string;
  fileSize: number;
  status: DepositStatus;
  source: DepositSource;
  /** Lignes valides lues dans le fichier. */
  lines: number | null;
  created: number | null;
  updated: number | null;
  invalid: number | null;
  /** Produits absents du fichier remis à zéro. */
  zeroed: number | null;
  /** Lignes de stock connues avant l'envoi. */
  knownLines: number | null;
  /** L'erreur, ou la raison pour laquelle le fichier attend l'équipe. */
  message: string | null;
  receivedAt: Date;
  appliedAt: Date | null;
  decidedAt: Date | null;
  /** Le fichier d'origine est encore téléchargeable (pas purgé). */
  hasFile: boolean;
  /** Reçu depuis plus de 10 minutes et toujours « en cours » : le traitement a été interrompu. */
  stalled: boolean;
};
