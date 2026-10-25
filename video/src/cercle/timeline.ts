/**
 * LE TEMPS DU FILM « LE CERCLE » — tout en SECONDES du film. Une seule source pour les scènes, la voix, la musique.
 *
 * 9:16 (Reel Instagram), 1080 × 1920, 60 i/s, ≈ 52 s ; rendu 4K à l'échelle 2 (2160 × 3840).
 * Les voix (public/cercle/voix/*.wav, mesurées le 25 oct. 2026) sont posées à VOICE_AT ; les scènes suivent la voix.
 * Ce fichier est lu par Node sans compilation (tools/*.mjs) : pas d'enum, pas de JSX, imports avec extension.
 */

export const FPS = 60;
export const TOTAL = 52.5;
export const TOTAL_FRAMES = Math.round(TOTAL * FPS);
/** La révélation du nom (« PharmaBoost » de V14) et le dernier accord (le carton final). */
export const REVEAL = 43.0;
export const FINAL_HIT = 47.0;

/** Le début de chaque fichier de voix, en temps du film (le fichier commence ≈ 50 ms avant la parole). */
export const VOICE_AT: Record<string, number> = {
  V1: 0.5, // « Même rue. Deux pharmacies. »
  V2: 2.7, // « Mêmes boîtes. Mêmes ordonnances. »
  V3: 5.3, // « Mais dans l'une, les patients reviennent. »
  V4: 8.15, // « Vous savez pourquoi ? »
  V5: 9.3, // « Elle a un copilote. »
  V6: 10.95, // « Une boîte scannée… et le bon conseil s'affiche au comptoir. »
  V7: 14.95, // « Le pharmacien est guidé. Il conseille plus, et mieux. »
  V8: 18.45, // « Le patient repart avec le vrai complément de son traitement. Ça fait pro. »
  V9: 22.65, // « Son bilan conseil l'attend dans son téléphone. »
  V10: 25.15, // « Et bientôt, dans l'appli : les offres de sa pharmacie, sur ses gammes préférées. »
  V11: 30.6, // « Alors il revient. Nouveau passage, nouveau conseil. »
  V12: 33.85, // « C'est un cercle. »
  V13: 35.55, // « Pendant ce temps, à côté… »
  D1: 37.45, // la pharmacienne d'à côté : « Et avec ceci, il vous fallait autre chose ? »
  D2: 40.05, // le patient : « Non merci. »
  V14: 41.2, // « Ce copilote s'appelle… PharmaBoost. »
  V15: 44.4, // « Et vous, quelle pharmacie voulez-vous être ? »
  V16: 47.0, // « Réservez votre démo sur pharmaboost.app »
};

export type SceneId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";
export type SceneWindow = { id: SceneId; file: string; name: string; tab: number | null; start: number; end: number };

/**
 * Les fenêtres des scènes ; `end` déborde de 0,5 s sur la suivante (la scène qui SORT est dessinée AU-DESSUS et fait la
 * transition). `tab` : l'onglet allumé dans la barre du haut (0 LE COMPTOIR, 1 LE PATIENT, 2 L'APPLI, 3 LE CERCLE).
 */
const OVER = 0.5;
const CUTS: [SceneId, string, string, number | null, number][] = [
  ["C1", "c1-la-rue", "Même rue, deux pharmacies", null, 0],
  ["C2", "c2-le-comptoir", "Le comptoir", 0, 10.75],
  ["C3", "c3-le-patient", "Le patient", 1, 18.25],
  ["C4", "c4-l-appli", "L'appli", 2, 24.95],
  ["C5", "c5-le-cercle", "Le cercle", 3, 30.4],
  ["C6", "c6-a-cote", "Pendant ce temps, à côté", null, 35.35],
  ["C7", "c7-pharmaboost", "PharmaBoost", null, 41.0],
  ["C8", "c8-final", "Le carton final", null, 46.8],
];
export const SCENES: SceneWindow[] = CUTS.map(([id, file, name, tab, start], i) => ({ id, file, name, tab, start, end: i < CUTS.length - 1 ? CUTS[i + 1][4] + OVER : TOTAL }));
export const sceneById = (id: SceneId) => SCENES.find((s) => s.id === id) as SceneWindow;
/** L'onglet allumé au temps t (null = pas de barre). */
export const tabAt = (t: number) => {
  const s = [...SCENES].reverse().find((w) => t >= w.start);
  return s ? s.tab : null;
};
