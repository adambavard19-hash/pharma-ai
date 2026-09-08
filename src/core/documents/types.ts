import type { PosologySchedule } from "@/core/posology";

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
  /**
   * Répartition confirmée par le pharmacien. `null` lorsqu'aucune prise n'a
   * été renseignée : le plan affiche alors la posologie écrite telle quelle,
   * sans reconstituer d'horaires que personne n'a validés.
   */
  schedule: PosologySchedule | null;
  durationDays: number | null;
  instructions: string | null;
  /**
   * Le dosage du médicament AVEC son unité (« 150 mg », « 250 µg/dose »),
   * pris dans le nom officiel de la spécialité rattachée ou dans un dosage
   * écrit avec son unité. `null` quand on ne le sait pas : on n'affiche alors
   * ni « 150 » ni rien qui puisse être lu comme une quantité à prendre.
   */
  strength?: string | null;
  /** L'unité de prise (« comprimé », « bouffée »), déduite de la forme officielle ou lue. */
  unit?: string;
  /** Rythme non quotidien validé (« un jour sur deux »), sinon `null`. */
  rhythm?: string | null;
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
  /**
   * Date du passage à l'officine (dépôt de l'ordonnance). Absente des
   * instantanés antérieurs : on retombe alors sur `generatedAt`.
   */
  passageAt?: string;
  treatment: DocumentTreatmentItem[];
  advice: DocumentAdviceItem[];
  /**
   * « À retenir » : uniquement des faits validés au comptoir — durée confirmée
   * d'un traitement, consigne écrite par le pharmacien. Jamais une
   * contre-indication ou une interaction générée. Vide = la zone n'apparaît pas.
   */
  keyPoints?: string[];
  /** Suivi activé par l'officine pour ce passage : le patient sait quand on reprendra contact. */
  followUp?: { label: string; dueAt: string } | null;
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

/**
 * Rappel systématique en pied de courriel : le patient doit savoir pourquoi il
 * reçoit ce message et que rien de médical n'y transite.
 */
export const DOCUMENT_EMAIL_SIGNATURE_HINT =
  "Vous recevez ce message parce que vous avez accepté que votre pharmacien vous transmette vos conseils. Il ne contient aucune information sur votre santé.";
