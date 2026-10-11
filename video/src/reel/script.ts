/**
 * LE TEXTE DU REEL INSTAGRAM — une seule source.
 *
 *  - la voix : scripts/voix-reel.mjs lit `say` (la prononciation pour la voix de synthèse) et écrit
 *    public/voix/reel/L1.mp3 … L7.mp3 ;
 *  - le montage : src/films/reel.tsx mesure la durée réelle de chaque fichier et cale dessus les scènes et les
 *    sous-titres (`chunks`, de 2 à 4 mots, le mot clé entre astérisques).
 *
 * Remplacer la voix par une voix humaine : enregistrer `text`, une phrase par fichier, sous les MÊMES noms
 * (`node scripts/voix-reel.mjs --depuis <dossier>` nettoie les silences et règle le niveau). Le montage se recale
 * tout seul au rendu suivant.
 *
 * Les règles des films valent ici : pas de « douchette » ni de « bip » écrits, pas d'« interactions », aucune promesse
 * de délai ; le chiffre d'affaires est dit sans chiffre garanti (l'estimation du site, avec ses hypothèses à l'écran).
 * Ce fichier est lu par Node sans compilation (types effacés) : pas d'enum, pas d'espace de noms.
 */

export type ReelLine = {
  /** Le nom du fichier de voix (public/voix/reel/<id>.mp3). */
  id: string;
  /** Ce qui est dit, mot pour mot : c'est ce texte que la voix humaine lira. */
  text: string;
  /** La même phrase, écrite pour la voix de synthèse de macOS (prononciation, silences `[[slnc ms]]`). */
  say: string;
  /** Les sous-titres incrustés, dans l'ordre : 2 à 4 mots, le mot clé `*entre astérisques*` ; une espace insécable (\u00A0) empêche la coupure. */
  chunks: string[];
  /** Le silence après la phrase, en secondes, avant la suivante (ou la fin du film). */
  gapAfter: number;
};

export const SCRIPT: ReelLine[] = [
  {
    id: "L1",
    text: "Vous êtes pharmacien ? Cette vidéo est pour vous.",
    say: "Vous êtes pharmacien ? Cette vidéo est pour vous !",
    chunks: ["Vous êtes *pharmacien*\u00A0?", "Cette vidéo est *pour\u00A0vous.*"],
    gapAfter: 0.28,
  },
  {
    id: "L2",
    text: "Au comptoir, chaque ordonnance cache un conseil… qu'on n'a pas toujours le temps de proposer.",
    say: "Au comptoir, chaque ordonnance cache un conseil… qu'on n'a pas toujours le temps de proposer.",
    chunks: ["Au *comptoir*,", "chaque *ordonnance*", "cache un *conseil*…", "qu'on n'a pas\u00A0toujours", "le *temps* de\u00A0proposer."],
    gapAfter: 0.3,
  },
  {
    id: "L3",
    text: "Avec PharmaBoost, vous scannez comme d'habitude.",
    say: "Avec Pharma Boost, vous scannez comme d'habitude.",
    chunks: ["Avec *PharmaBoost*,", "vous *scannez*", "comme d'habitude."],
    gapAfter: 0.18,
  },
  {
    id: "L4",
    text: "Et le bon conseil s'affiche, pris dans votre rayon.",
    say: "Et le bon conseil s'affiche, pris dans votre rayon.",
    chunks: ["Et le *bon\u00A0conseil*", "s'affiche,", "pris dans *votre\u00A0rayon.*"],
    gapAfter: 0.22,
  },
  {
    id: "L5",
    text: "Une question si besoin. Vendu, non vendu : un clic.",
    say: "Une question si besoin. Vendu, non vendu : un clic !",
    chunks: ["Une *question*", "si besoin.", "*Vendu*, non\u00A0vendu\u00A0:", "*un\u00A0clic.*"],
    gapAfter: 0.32,
  },
  {
    id: "L6",
    text: "Chaque conseil en plus, c'est du chiffre d'affaires en plus.",
    say: "Chaque conseil en plus, c'est du chiffre d'affaires en plus !",
    chunks: ["Chaque *conseil* en\u00A0plus,", "c'est du *chiffre\u00A0d'affaires*", "*en\u00A0plus.*"],
    // Le temps de lire l'estimation et sa note avant la carte de fin.
    gapAfter: 0.75,
  },
  {
    id: "L7",
    text: "PharmaBoost. Réservez votre démo sur pharmaboost.app.",
    say: "Pharma Boost. Réservez votre démo sur pharma boost point app.",
    chunks: ["*PharmaBoost.*", "Réservez votre démo", "sur *pharmaboost.app*"],
    // La carte de fin reste à l'écran après la dernière phrase.
    gapAfter: 1.9,
  },
];

/** Le dossier des voix, sous public/ (staticFile). */
export const VOICE_DIR = "voix/reel";

/** Les durées attendues (voix de synthèse « Thomas », débit 195), si un fichier manque : le film reste calculable. */
export const FALLBACK_DURATIONS = [2.47, 4.9, 2.9, 2.88, 3.68, 3.4, 3.82];
