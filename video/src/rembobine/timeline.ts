/**
 * LE TEMPS DU FILM « REMBOBINONS » — tout en SECONDES du film. Une seule source pour les scènes, la voix, la musique.
 *
 * 16:9, 1920 × 1080, 60 i/s, ≈ 75 s ; rendu 4K à l'échelle 2.
 * Les voix (public/rembobine/voix/*.wav, mesurées le 25 oct. 2026) sont posées à VOICE_AT ; les scènes suivent la voix.
 * La musique : M1 « Tension » de 0 à DROP (coupée net par la bande qui rembobine), M2 « Groove » de DROP à la fin, avec
 * son dernier accord à FINAL_HIT.
 *
 * Ce fichier est lu par Node sans compilation (tools/*.mjs) : pas d'enum, pas de JSX, imports avec extension.
 */

export const FPS = 60;

/** Le DROP : la bande a fini de rembobiner, PharmaBoost entre en scène, la musique explose. */
export const DROP = 20;
/**
 * LA COUPE (fondateur, 30 oct. 2026 : « supprime la partie 3 sur 3 pour les marques ») : le chapitre des marques (S12, N11)
 * est retiré. Les scènes, les voix, les sous-titres et la musique gardent leur temps « d'histoire » (celui du montage
 * d'origine, 75 s) ; le film saute GAP secondes à CUT. 6 s = trois mesures de la musique (120 BPM) : le temps fort reste
 * sur le temps fort. Temps du film = filmTime(temps d'histoire) ; l'inverse : storyTime.
 */
export const CUT = 59.6;
export const GAP = 6;
export const filmTime = (story: number) => (story >= CUT + GAP ? story - GAP : story);
export const storyTime = (film: number) => (film >= CUT ? film + GAP : film);
/** Les répliques qui ne sont plus dites (le chapitre des marques). */
export const DROPPED_VOICES = ["N11"];

/** Le dernier accord de la musique (le logo claque une dernière fois), en temps d'histoire. */
export const FINAL_HIT = 72;
/** La fin, en temps d'histoire (S13 et la musique le lisent). */
export const TOTAL = 75;
/** La durée du FILM, après la coupe. */
export const FILM_TOTAL = TOTAL - GAP;
export const TOTAL_FRAMES = Math.round(FILM_TOTAL * FPS);

/** Le début de chaque fichier de voix, en temps du film (le fichier commence ≈ 50 ms avant la parole). */
export const VOICE_AT: Record<string, number> = {
  D1: 1.4, // pharmacienne : « Et avec ceci, il vous fallait autre chose ? »
  D2: 4.3, // patient : « Non merci. »
  N1: 6.0, // « Il repart avec son antibiotique… et rien pour sa flore intestinale. »
  N2: 12.7, // « Cette scène se répète chaque jour, dans toute la France. »
  N3: 16.8, // « Alors… rembobinons. »
  N4: 20.4, // « Même patient. Même ordonnance. Mais cette fois, PharmaBoost est au comptoir. »
  N5: 26.0, // « À chaque boîte scannée, le bon conseil s'affiche, pris dans votre stock. »
  N6: 30.1, // « Les questions à poser. Les mots à dire. La marge, le challenge, la date courte. »
  D3: 35.5, // pharmacienne : « Avec votre antibiotique, je vous conseille un probiotique. »
  D4: 38.8, // patient : « Ah oui, je veux bien ! »
  N7: 40.5, // « Le pharmacien décide. Le patient repart mieux conseillé. »
  N8: 45.0, // « Pour l'équipe : chaque conseil vendu se compte, en direct. »
  N9: 48.7, // « Pour le patient : son bilan par e-mail, et un rappel avant la fin de sa cure. »
  N10: 53.45, // reprise « scanné » (25 oct.), calée sur les mots de la 1re prise — « Et bientôt, l'application PharmaBoost : scanner ses boîtes, suivre ses cures, profiter d'offres. »
  N11: 59.8, // (retirée : DROPPED_VOICES) « Pour les marques : leurs challenges sur l'écran du comptoir, au bon moment. Et chaque vente, comptée. »
  N12: 65.7, // « PharmaBoost. Le copilote IA du comptoir de votre pharmacie. »
  D5: 70.0, // pharmacienne : « Il vous fallait autre chose ? »
};

export type SceneId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10" | "S11" | "S13";
/** `start`, `end` : en temps du FILM ; `offset` : ce qu'on ajoute au temps du film pour donner son temps d'histoire à la scène. */
export type SceneWindow = { id: SceneId; file: string; name: string; start: number; end: number; offset: number };

/**
 * Les fenêtres des scènes. `end` déborde de 0,5 s sur la scène suivante : la transition se fait dans ce chevauchement
 * (la scène qui SORT est dessinée AU-DESSUS ; elle peut s'effacer, filer, se découper…).
 */
const OVER = 0.5;
const CUTS: [SceneId, string, string, number][] = [
  ["S1", "s01-comptoir", "Le comptoir", 0],
  ["S2", "s02-rien", "Et rien d'autre", 6.0],
  ["S3", "s03-chaque-jour", "Chaque jour, partout", 12.6],
  ["S4", "s04-rembobinons", "Rembobinons", 16.7],
  ["S5", "s05-meme-ordonnance", "Même ordonnance", DROP],
  ["S6", "s06-le-bon-conseil", "Le bon conseil", 25.9],
  ["S7", "s07-les-mots", "Les questions, les mots", 30.0],
  ["S8", "s08-je-veux-bien", "Je veux bien", 35.3],
  ["S9", "s09-equipe", "L'équipe", 44.8],
  ["S10", "s10-patient", "Le patient", 48.5],
  ["S11", "s11-application", "L'application", 53.3],
  // S12 « Les marques » (59,6 → 65,5) : retirée le 30 oct. 2026. La signature arrive sous la sortie de S11.
  ["S13", "s13-signature", "La signature", 65.5 - GAP],
];
export const SCENES: SceneWindow[] = CUTS.map(([id, file, name, start], i) => ({
  id,
  file,
  name,
  start,
  end: i < CUTS.length - 1 ? CUTS[i + 1][3] + OVER : FILM_TOTAL,
  offset: start >= CUT - 0.2 ? GAP : 0,
}));

export const sceneById = (id: SceneId) => SCENES.find((s) => s.id === id) as SceneWindow;
