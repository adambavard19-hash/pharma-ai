/**
 * Un robot par comptoir (demande du fondateur, 11 oct. 2026) : chaque comptoir d'une pharmacie a SON robot — même base,
 * couleur et accessoire différents, un petit prénom. En arrivant le matin, on voit tout de suite si l'on est sur son
 * comptoir ou sur celui d'un collègue (« ce n'est pas Bip, c'est Pixel : je me reconnecte »).
 *
 * 20 apparences, assez pour la plus grande pharmacie (20 comptoirs) : 10 accessoires × 2 couleurs chacun. Deux
 * comptoirs voisins (index qui se suivent) n'ont jamais ni la même couleur ni le même accessoire. Le robot de la
 * marque (site, logo) n'est pas l'une d'elles : il reste tel quel.
 */

export const ROBOT_ACCESSORIES = ["cap", "tophat", "crown", "bowtie", "flower", "glasses", "beanie", "star", "heart", "leaf"] as const;
export type RobotAccessory = (typeof ROBOT_ACCESSORIES)[number];

export type RobotPalette = { name: string; ear: string; earDark: string; lamp: string; accent: string };

/** Dix couleurs bien distinctes les unes des autres (oreilles, arceau, lampe, accessoire). */
export const ROBOT_PALETTES: readonly RobotPalette[] = [
  { name: "corail", ear: "#FF7A6B", earDark: "#E0533F", lamp: "#FFB4A8", accent: "#E0533F" },
  { name: "violet", ear: "#9B7BFF", earDark: "#6E4FE0", lamp: "#C9B8FF", accent: "#6E4FE0" },
  { name: "ambre", ear: "#FFB938", earDark: "#E08E00", lamp: "#FFE08A", accent: "#E08E00" },
  { name: "bleu ciel", ear: "#4FB3FF", earDark: "#1E86D6", lamp: "#A8DAFF", accent: "#1E86D6" },
  { name: "rose", ear: "#FF77C0", earDark: "#E0449A", lamp: "#FFB8DE", accent: "#E0449A" },
  { name: "citron vert", ear: "#8ED64A", earDark: "#5FAE1E", lamp: "#C9F09A", accent: "#5FAE1E" },
  { name: "orange", ear: "#FF9248", earDark: "#E0651A", lamp: "#FFC49A", accent: "#E0651A" },
  { name: "indigo", ear: "#5B6CFF", earDark: "#3442D6", lamp: "#AEB6FF", accent: "#3442D6" },
  { name: "framboise", ear: "#E64568", earDark: "#B8213F", lamp: "#F59AAE", accent: "#B8213F" },
  { name: "ardoise", ear: "#6F8798", earDark: "#4A6070", lamp: "#B4C4CF", accent: "#4A6070" },
];

const NAMES = ["Bip", "Pixel", "Nova", "Gizmo", "Zéphyr", "Biscotte", "Lumen", "Pépite", "Écho", "Titan", "Plume", "Comète", "Flash", "Noisette", "Volt", "Myrtille", "Orbit", "Praline", "Turbo", "Opale"] as const;

export const ROBOT_LOOK_COUNT = 20;

export type RobotLook = { index: number; name: string; accessory: RobotAccessory; palette: RobotPalette };

/** L'apparence n° `index` (0 à 19 ; au-delà, on reprend au début). */
export function robotLook(index: number): RobotLook {
  const i = ((Math.trunc(index) % ROBOT_LOOK_COUNT) + ROBOT_LOOK_COUNT) % ROBOT_LOOK_COUNT;
  const accessory = ROBOT_ACCESSORIES[i % 10];
  // Les 10 premiers : couleur n° i ; les 10 suivants : la couleur « d'en face » (i + 5), pour que chaque accessoire ait deux couleurs.
  const palette = ROBOT_PALETTES[i < 10 ? i : (i + 5) % 10];
  return { index: i, name: NAMES[i], accessory, palette };
}

/** Le robot d'un comptoir à créer : le premier libre de la pharmacie ; au-delà de 20, le moins utilisé. */
export function nextLookIndex(used: readonly (number | null | undefined)[]): number {
  const counts = new Array<number>(ROBOT_LOOK_COUNT).fill(0);
  for (const value of used) if (typeof value === "number" && value >= 0 && value < ROBOT_LOOK_COUNT) counts[value] += 1;
  let best = 0;
  for (let i = 1; i < ROBOT_LOOK_COUNT; i += 1) if (counts[i] < counts[best]) best = i;
  return best;
}

/** « Bip · Comptoir 2 » : ce que l'écran dit sous le robot du comptoir. */
export function robotLookCaption(index: number, comptoirName: string): string {
  return `${robotLook(index).name} · ${comptoirName}`;
}

/** Le robot du comptoir de la personne connectée, tel que l'écran l'affiche. */
export type CounterRobotLook = { look: number; caption: string };
