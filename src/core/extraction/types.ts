/**
 * L'extraction réelle d'une ordonnance photographiée.
 *
 * Un modèle de vision est excellent pour lire, et parfaitement capable de
 * combler un blanc de façon plausible. Sur une ordonnance, une posologie
 * plausible mais fausse est plus dangereuse qu'une posologie absente : la
 * première sera délivrée, la seconde sera relue.
 *
 * La règle est donc structurelle, jamais seulement demandée dans une
 * consigne : pour être retenu, un champ doit être accompagné du texte LU TEL
 * QUEL sur l'image. Un champ sans citation est écarté, quelle que soit la
 * confiance annoncée par le modèle. C'est la seule barrière qui ne dépend pas
 * de la bonne volonté du modèle.
 */

/** Ce qu'un modèle de vision doit renvoyer pour chaque champ. */
export type ClaimedField = {
  /** La valeur normalisée, ou `null` si la zone est illisible. */
  valeur: string | null;
  /**
   * Le texte exactement tel qu'il figure sur l'image, sans correction ni
   * complétion. C'est cette citation qui fait foi : sans elle, la valeur est
   * écartée.
   */
  lu_tel_quel: string | null;
  /** 0 → 1, tel qu'annoncé par le modèle. Jamais cru sur parole. */
  confiance: number | null;
};

export type ClaimedLine = {
  medicament: ClaimedField;
  dosage: ClaimedField;
  forme: ClaimedField;
  posologie: ClaimedField;
  duree_jours: ClaimedField;
  quantite: ClaimedField;
  instructions: ClaimedField;
};

export type ClaimedPrescription = {
  prescripteur: ClaimedField;
  rpps: ClaimedField;
  date_prescription: ClaimedField;
  patient: ClaimedField;
  lignes: ClaimedLine[];
};

/** Motif pour lequel un champ a été écarté. Affiché et journalisé. */
export type RejectionReason =
  | "AUCUNE_CITATION"
  | "CITATION_VIDE"
  | "VALEUR_ABSENTE"
  | "NOMBRE_ILLISIBLE"
  | "CONFIANCE_INVALIDE";

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  AUCUNE_CITATION:
    "le modèle a proposé une valeur sans pouvoir citer le texte correspondant sur l'image",
  CITATION_VIDE: "la citation fournie est vide",
  VALEUR_ABSENTE: "aucune valeur n'a été lue",
  NOMBRE_ILLISIBLE: "la citation ne contient aucun nombre exploitable",
  CONFIANCE_INVALIDE: "la confiance annoncée est hors de l'intervalle 0 → 1",
};

/** Ce que le validateur a écarté, ligne par ligne. Rien n'est silencieux. */
export type RejectedField = {
  /** `null` pour un champ d'en-tête (prescripteur, date…). */
  lineIndex: number | null;
  field: string;
  reason: RejectionReason;
  /** Ce que le modèle prétendait, conservé pour l'audit. */
  claimed: string | null;
};
