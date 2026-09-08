import { OCR_REVIEW_THRESHOLD } from "@/config/constants";

/**
 * L'état de lecture d'un champ d'ordonnance, tel qu'il doit être dit au
 * comptoir.
 *
 * Un pourcentage ne se lit pas : « 87 % » oblige le pharmacien à se souvenir du
 * seuil, à faire la comparaison lui-même, et le conduit à croire qu'une valeur
 * proche de 100 est vérifiée. Ce qu'il a besoin de savoir tient en un mot :
 * est-ce que je dois regarder cette ligne ?
 *
 * Le chiffre n'est pas supprimé pour autant — il reste dans le détail technique
 * de la ligne, où il sert à comprendre après coup pourquoi un champ a été
 * signalé. Ce qui change est l'ordre : le résultat d'abord, la mesure ensuite.
 *
 * Fonction pure, seule autorité sur ce classement. Le seuil est celui du reste
 * du moteur (`OCR_REVIEW_THRESHOLD`) : deux seuils différents entre l'écran et
 * l'analyse produiraient un champ affiché « lu » que la sécurité traite comme
 * douteux.
 */
export type FieldReading =
  /** Rien n'a été lu. Le champ est vide et attend une saisie humaine. */
  | "UNREADABLE"
  /** Lu, mais en dessous du seuil : à confronter à l'ordonnance. */
  | "TO_CHECK"
  /** Lu au-dessus du seuil. Lu par une machine — pas vérifié par un humain. */
  | "READ"
  /** Aucune mesure de lecture n'accompagne ce champ : on n'affirme rien. */
  | "NO_SIGNAL";

export function fieldReading(input: {
  unreadable: boolean;
  confidence: number | null | undefined;
}): FieldReading {
  // Un champ illisible le reste, quelle que soit la confiance annoncée par
  // ailleurs : c'est le cas qui ne doit jamais être adouci.
  if (input.unreadable) return "UNREADABLE";

  const confidence = input.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence <= 0) {
    return "NO_SIGNAL";
  }

  return confidence < OCR_REVIEW_THRESHOLD ? "TO_CHECK" : "READ";
}

/**
 * Ce que l'écran affiche pour chaque état.
 *
 * « Lu » et non « Confirmé » : personne n'a confirmé ce champ. La confirmation
 * est un acte du pharmacien, elle porte sur la ligne entière et elle a son
 * propre bouton. Employer le même mot pour une lecture machine ferait croire à
 * une vérification qui n'a pas eu lieu.
 */
export const FIELD_READING_LABELS: Record<
  Exclude<FieldReading, "NO_SIGNAL">,
  { label: string; description: string }
> = {
  UNREADABLE: {
    label: "Illisible",
    description: "Rien n'a été lu pour ce champ : saisissez-le d'après l'ordonnance.",
  },
  TO_CHECK: {
    label: "À vérifier",
    description: "Lu sans certitude suffisante : confrontez-le à l'ordonnance avant de confirmer.",
  },
  READ: {
    label: "Lu",
    description: "Lu au-dessus du seuil de relecture. Lecture automatique, pas une vérification.",
  },
};
