import { timeline } from "../kit";

/**
 * Film 4 « Sans / Avec » — la ligne de temps (6 nov. 2026). Six répliques de Yann (D1–D6), chacune calée sur la fin de la
 * précédente ; tout ce qui apparaît à l'écran se règle sur un MOT (w).
 */
export const { VAT, end, w } = timeline();
VAT.D1 = 1.0;
VAT.D2 = end("D1") + 0.5;
VAT.D3 = end("D2") + 0.5;
VAT.D4 = end("D3") + 0.5;
VAT.D5 = end("D4") + 0.5;
VAT.D6 = end("D5") + 0.55;

/** Les six tableaux de chaque moitié (mêmes bornes à gauche et à droite : les deux comptoirs avancent ensemble). */
export const B = {
  /** Le comptoir : la même ordonnance, puis le scan (D1–D2). */
  comptoir: 0,
  /** Le rayon : date courte, challenge, laboratoire préféré (D3). */
  rayon: VAT.D3 - 0.3,
  /** Le patient repart / le bilan sur son téléphone (D4). */
  patient: VAT.D4 - 0.3,
  /** La fin du mois : les courbes (D5). */
  mois: VAT.D5 - 0.3,
  /** « Et l'équipe respire » : la pharmacienne. */
  equipe: w("D5", "et") - 0.25,
  /** La rue : deux pharmacies, la gauche se brise (D6). */
  rue: VAT.D6 - 0.25,
};
/** La ligne de séparation balaie la gauche : la droite envahit l'écran. */
export const SWEEP = w("D6", "démarque") - 0.1;
/** La fin de marque. */
export const FIN = w("D6", "pharmaboost") + 0.1;
export const LAST = end("D6");
export const BUTTON = LAST + 0.25;
export const TOTAL = Math.ceil((LAST + 3.3) * 60) / 60;
