/**
 * Contenu figé d'une fiche patient.
 *
 * Le document est un INSTANTANÉ : une fois généré, il ne dépend plus du
 * catalogue ni du stock. Si un prix change demain, la fiche remise au patient
 * reste conforme à ce qui lui a été présenté — condition indispensable à
 * l'auditabilité et à la loyauté commerciale.
 */

export type DocumentTreatmentItem = {
  drugName: string;
  dosage: string | null;
  form: string | null;
  posology: string | null;
  durationDays: number | null;
  instructions: string | null;
  /** Explication vulgarisée, uniquement si une source fiable existe. */
  purpose: string | null;
  tips: string[];
  precautions: string[];
  /** Indique au lecteur d'où vient l'information. */
  sourceLabel: string;
  /** `true` lorsqu'aucune explication fiable n'était disponible. */
  explanationUnavailable: boolean;
};

export type DocumentAdviceItem = {
  productName: string;
  brand: string | null;
  imageUrl: string | null;
  /** Bénéfice autorisé, repris de la fiche produit validée par l'officine. */
  benefit: string | null;
  /** Raison personnalisée, validée par le pharmacien. */
  personalReason: string;
  usage: string | null;
  precautions: string[];
  priceCents: number;
  availability: "IN_STOCK" | "LOW_STOCK" | "ON_ORDER";
  addedManually: boolean;
};

export type DocumentContent = {
  version: 1;
  generatedAt: string;
  pharmacy: {
    name: string;
    logoUrl: string | null;
    brandColor: string;
    addressLine1: string | null;
    postalCode: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
  };
  pharmacist: { fullName: string; roleLabel: string };
  patient: { firstName: string; lastName: string; reference: string } | null;
  prescription: {
    reference: string;
    prescriberName: string | null;
    prescribedAt: string | null;
  };
  treatment: DocumentTreatmentItem[];
  advice: DocumentAdviceItem[];
  /** Message libre du pharmacien, affiché en tête de la section conseils. */
  pharmacistNote: string | null;
  /** Mentions obligatoires affichées en pied de fiche. */
  disclaimers: string[];
  isDemo: boolean;
};

export const DOCUMENT_DISCLAIMERS = [
  "Cette fiche est un document d'accompagnement établi par votre pharmacien. Elle ne remplace ni votre ordonnance, ni l'avis de votre médecin.",
  "Les conseils complémentaires proposés ne sont pas des médicaments prescrits. Ils sont facultatifs.",
  "En cas d'effet inhabituel, de doute ou d'aggravation, contactez votre pharmacien ou votre médecin.",
];

export const DEMO_DISCLAIMER =
  "DOCUMENT DE DÉMONSTRATION — patient, ordonnance, produits et prix sont fictifs. Ce document ne constitue en aucun cas un conseil médical ou pharmaceutique.";
