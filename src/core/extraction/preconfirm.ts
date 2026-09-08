import { fieldReading } from "./reading";

/**
 * Une ligne d'ordonnance peut-elle être retenue sans qu'un humain la coche ?
 *
 * C'est la seule règle de ce produit qui touche à une garantie de sécurité par
 * un allègement. Aujourd'hui, un professionnel confirme chaque ligne, une par
 * une. Demander ce geste sur une ligne intégralement lue, sans un seul champ
 * douteux, n'ajoute rien à la sécurité : cela ajoute un clic, et un clic
 * systématique finit par être donné sans regarder — y compris sur la ligne qui
 * méritait qu'on s'arrête.
 *
 * La règle est donc conçue pour REFUSER. Elle ne cherche pas ce qui autorise la
 * pré-confirmation, elle cherche tout ce qui l'interdit, et le moindre doute
 * suffit :
 *
 *   • pas de nom de médicament → refus ;
 *   • un seul champ illisible → refus ;
 *   • un seul champ lu sous le seuil de relecture → refus ;
 *   • une valeur présente qu'aucune mesure de lecture n'accompagne → refus.
 *
 * Ce dernier cas est le plus important et le moins évident : une valeur sans
 * mesure n'est pas une valeur sûre, c'est une valeur dont on ignore tout. La
 * traiter comme lue reviendrait à faire confiance au silence.
 *
 * Ce que la pré-confirmation ne fait PAS : signer. `verifiedAt` et
 * `verifiedByUserId` restent vides tant qu'un pharmacien n'a pas validé
 * l'ordonnance. La pré-confirmation retient une ligne pour l'analyse ; elle ne
 * prétend pas qu'un professionnel l'a relue.
 *
 * Fonction pure — c'est ce qui permet de la tester dans les deux sens sans base
 * ni réseau. Une garantie qu'il faudrait une base de données pour vérifier n'en
 * serait pas une.
 */

/** Les champs mesurés par l'extraction, dans l'ordre de l'ordonnance. */
export const PRECONFIRM_FIELDS = [
  { key: "drugName", label: "le nom du médicament" },
  { key: "dosage", label: "le dosage" },
  { key: "form", label: "la forme" },
  { key: "posology", label: "la posologie" },
  { key: "durationDays", label: "la durée" },
  { key: "quantity", label: "la quantité" },
  { key: "instructions", label: "les instructions" },
] as const;

export type PreconfirmField = (typeof PRECONFIRM_FIELDS)[number]["key"];

export type LineReadout = {
  drugName: string | null;
  dosage: string | null;
  form: string | null;
  posology: string | null;
  durationDays: number | null;
  quantity: number | null;
  instructions: string | null;
  /** Champs que l'extraction n'a pas su lire. */
  unreadableFields: string[];
  /** Confiance par champ, telle que produite par la lecture. */
  confidence: Record<string, number | null | undefined>;
};

export type PreconfirmRefusal =
  /** L'officine a désactivé la pré-confirmation. */
  | "DESACTIVEE"
  | "SANS_MEDICAMENT"
  | "CHAMP_ILLISIBLE"
  | "LECTURE_INCERTAINE"
  | "LECTURE_NON_MESUREE";

export type PreconfirmDecision =
  | { preconfirmed: true }
  | { preconfirmed: false; reason: PreconfirmRefusal; field: PreconfirmField | null; message: string };

/** Valeur présente ? Une chaîne vide ou blanche ne compte pas. */
function hasValue(line: LineReadout, key: PreconfirmField): boolean {
  const value = line[key];
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return true;
  return value.trim().length > 0;
}

export function canPreconfirm(
  line: LineReadout,
  options: { enabled: boolean },
): PreconfirmDecision {
  if (!options.enabled) {
    return {
      preconfirmed: false,
      reason: "DESACTIVEE",
      field: null,
      message: "La pré-confirmation automatique est désactivée dans cette officine.",
    };
  }

  if (!hasValue(line, "drugName")) {
    return {
      preconfirmed: false,
      reason: "SANS_MEDICAMENT",
      field: "drugName",
      message: "Aucun nom de médicament n'a été lu sur cette ligne.",
    };
  }

  // Un champ illisible passe avant tout le reste : c'est le cas qui doit
  // toujours ramener un humain, même si les six autres champs sont parfaits.
  const unreadable = new Set(line.unreadableFields);
  for (const field of PRECONFIRM_FIELDS) {
    if (unreadable.has(field.key)) {
      return {
        preconfirmed: false,
        reason: "CHAMP_ILLISIBLE",
        field: field.key,
        message: `Champ illisible : ${field.label}. Cette ligne doit être saisie et confirmée par un professionnel.`,
      };
    }
  }

  for (const field of PRECONFIRM_FIELDS) {
    if (!hasValue(line, field.key)) continue;

    const state = fieldReading({
      unreadable: false,
      confidence: line.confidence[field.key],
    });

    if (state === "TO_CHECK") {
      return {
        preconfirmed: false,
        reason: "LECTURE_INCERTAINE",
        field: field.key,
        message: `Lecture incertaine sur ${field.label}. Cette ligne demande une vérification.`,
      };
    }

    if (state !== "READ") {
      // NO_SIGNAL avec une valeur : la valeur existe, mais rien ne dit d'où
      // elle vient. On ne confond pas « pas de doute » et « pas de mesure ».
      return {
        preconfirmed: false,
        reason: "LECTURE_NON_MESUREE",
        field: field.key,
        message: `Aucune mesure de lecture n'accompagne ${field.label}. Cette ligne demande une vérification.`,
      };
    }
  }

  return { preconfirmed: true };
}

/**
 * Le verdict pour une ordonnance entière.
 *
 * Le parcours ne s'allège que si TOUTES les lignes passent. Une ordonnance dont
 * une ligne reste douteuse repart à la vérification ligne par ligne : mélanger
 * les deux — un écran qui affiche les conseils tout en réclamant une saisie —
 * est exactement la confusion que ce lot doit éviter.
 */
export function preconfirmPrescription(
  lines: LineReadout[],
  options: { enabled: boolean },
): { decisions: PreconfirmDecision[]; allPreconfirmed: boolean; preconfirmedCount: number } {
  const decisions = lines.map((line) => canPreconfirm(line, options));
  const preconfirmedCount = decisions.filter((decision) => decision.preconfirmed).length;

  return {
    decisions,
    // Une ordonnance sans ligne n'est pas une ordonnance entièrement lue.
    allPreconfirmed: lines.length > 0 && preconfirmedCount === lines.length,
    preconfirmedCount,
  };
}
