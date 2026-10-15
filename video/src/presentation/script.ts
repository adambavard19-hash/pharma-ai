/**
 * LE TEXTE DU FILM « PRÉSENTATION » — une seule source.
 *
 *  - la voix : scripts/voix-presentation.mjs envoie `say` à ElevenLabs (voix « Yann », la même que le film « Tarif ») et
 *    écrit public/voix/presentation/P1.mp3 … P12 ;
 *  - le montage : src/films/presentation.tsx mesure la durée réelle de chaque fichier et cale dessus les scènes et les
 *    sous-titres (`chunks`, de 2 à 4 mots, le mot clé entre astérisques).
 *
 * Le film de présentation (15 oct. 2026) : le PROBLÈME d'abord (au comptoir tout va vite, le conseil qui aurait aidé n'est pas
 * donné, le patient repart, la pharmacie passe à côté), la RÉVÉLATION (le robot pharmacien), la DÉMONSTRATION (scan, conseil en
 * une seconde, vendu, bilan, la fête), l'ÉQUIPE, la CONFIANCE, puis « PharmaBoost. Le bon conseil, à chaque vente. »
 *
 * (Avant : la visite narrée de ce que PharmaBoost fait pour l'officine : l'île du poste (scan, mise en garde d'abord, deux
 * conseils, Vendu / Non vendu, bilan par e-mail, « Vente terminée »), l'île du logiciel (la journée, les demandes
 * réglées d'un clic, la Discussion), un robot par comptoir, l'équipe et le téléphone, puis « Aucune fiche patient » et
 * le dernier mot au pharmacien.
 *
 * Les règles des films valent ici : pas de « douchette » ni de « bip » écrits, jamais « interactions », ni « essai » ni
 * « gratuit » ; aucune promesse de résultat ; le pharmacien garde la décision.
 * Ce fichier est lu par Node sans compilation (types effacés) : imports avec leur extension, pas d'enum, pas de JSX.
 */
import { VOICE as TARIF_VOICE } from "../tarif/script.ts";

/** L'espace insécable : elle lie la ponctuation haute à son mot (« boîte : »), et deux mots qu'on ne sépare pas. */
const NB = "\u00A0";

export type PresentationLine = {
  /** Le nom du fichier de voix (public/voix/presentation/<id>.mp3). */
  id: string;
  /** Ce qui est dit, tel qu'on l'écrit. */
  text: string;
  /** Ce qui est envoyé à la voix : « Pharma Boost » en deux mots. */
  say: string;
  /** Les sous-titres incrustés, dans l'ordre : 2 à 4 mots, le mot clé `*entre astérisques*` ; l'espace insécable lie. */
  chunks: string[];
  /** Le silence après la phrase, en secondes, avant la suivante (ou la fin de la carte). */
  gapAfter: number;
  /** Pas de sous-titres à l'écran (la carte de fin porte les mots) : les morceaux ne servent qu'au minutage. */
  silentCaptions?: boolean;
};

export const SCRIPT: PresentationLine[] = [
  // ---- 1. Le problème
  {
    id: "P1",
    text: "Au comptoir, tout va très vite.",
    say: "Au comptoir, tout va très vite.",
    chunks: ["Au *comptoir*,", "tout va *très vite*."],
    gapAfter: 0.35,
  },
  {
    id: "P2",
    text: "Un patient, une boîte, une file qui attend.",
    say: "Un patient, une boîte, une file qui attend.",
    chunks: ["Un *patient*,", "une *boîte*,", "une *file* qui attend."],
    gapAfter: 0.3,
  },
  {
    id: "P3",
    text: "Et le conseil qui aurait tout changé… on n'a pas eu le temps d'y penser.",
    say: "Et le conseil qui aurait tout changé… on n'a pas eu le temps d'y penser.",
    chunks: ["Et le *conseil*", "qui aurait *tout changé*…", "on n'a pas eu", "le *temps* d'y penser."],
    gapAfter: 0.35,
  },
  {
    id: "P4",
    text: "Le patient repart sans ce qui l'aurait aidé. Et la pharmacie passe à côté.",
    say: "Le patient repart sans ce qui l'aurait aidé. Et la pharmacie passe à côté.",
    chunks: ["Le patient *repart*", "sans ce qui *l'aurait aidé*.", "Et la pharmacie", "*passe à côté*."],
    gapAfter: 0.6,
  },
  // ---- 2. La révélation
  {
    id: "P5",
    text: "Voici PharmaBoost : un robot pharmacien, sur l'écran de votre comptoir.",
    say: "Voici Pharma Boost : un robot pharmacien, sur l'écran de votre comptoir.",
    chunks: [`Voici *PharmaBoost*${NB}:`, "un robot *pharmacien*,", "sur l'écran", "de votre *comptoir*."],
    gapAfter: 0.35,
  },
  // ---- 3. La démonstration
  {
    id: "P6",
    text: "Vous scannez une boîte. En une seconde, il trouve le bon conseil.",
    say: "Vous scannez une boîte. En une seconde, il trouve le bon conseil.",
    chunks: ["Vous *scannez*", "une boîte.", "En *une seconde*,", "il trouve le *bon conseil*."],
    gapAfter: 0.3,
  },
  {
    id: "P7",
    text: "Un produit de votre stock, avec son prix et le challenge du moment.",
    say: "Un produit de votre stock, avec son prix et le challenge du moment.",
    chunks: ["Un produit", "de *votre stock*,", "avec son *prix*", "et le *challenge* du moment."],
    gapAfter: 0.3,
  },
  {
    id: "P8",
    text: "Vous le proposez. Vendu !",
    say: "Vous le proposez. Vendu !",
    chunks: ["Vous le *proposez*.", `*Vendu*${NB}!`],
    gapAfter: 0.35,
  },
  {
    id: "P9",
    text: "Le patient le souhaite ? Il reçoit son bilan par e-mail.",
    say: "Le patient le souhaite ? Il reçoit son bilan par e-mail.",
    chunks: [`Le patient le *souhaite*${NB}?`, "Il reçoit son *bilan*", "par *e-mail*."],
    gapAfter: 0.3,
  },
  {
    id: "P10",
    text: "Et à la fin de la vente, le robot fête chaque conseil vendu.",
    say: "Et à la fin de la vente, le robot fête chaque conseil vendu.",
    chunks: ["Et à la *fin de la vente*,", "le robot *fête*", "chaque *conseil vendu*."],
    gapAfter: 0.5,
  },
  // ---- 4. L'équipe
  {
    id: "P11",
    text: "Chacun son comptoir, son historique, ses challenges. Et le titulaire suit toute l'équipe.",
    say: "Chacun son comptoir, son historique, ses challenges. Et le titulaire suit toute l'équipe.",
    chunks: ["Chacun son *comptoir*,", "son *historique*,", "ses *challenges*.", "Et le *titulaire*", "suit *toute l'équipe*."],
    gapAfter: 0.4,
  },
  // ---- 5. La confiance
  {
    id: "P12",
    text: "Des règles validées par l'équipe officinale. Aucune fiche patient. Et le dernier mot reste au pharmacien.",
    say: "Des règles validées par l'équipe officinale. Aucune fiche patient. Et le dernier mot reste au pharmacien.",
    chunks: ["Des règles *validées*", "par l'équipe *officinale*.", "Aucune *fiche patient*.", "Et le *dernier mot*", "reste au *pharmacien*."],
    gapAfter: 0.5,
  },
  // ---- 6. Le mot de la fin
  {
    id: "P13",
    text: "PharmaBoost. Le bon conseil, à chaque vente.",
    say: "Pharma Boost. Le bon conseil, à chaque vente.",
    // Pas de sous-titres : la carte de fin écrit les mots quand la voix les dit.
    chunks: ["PharmaBoost.", "Le bon conseil,", "à chaque vente."],
    gapAfter: 0.9,
    silentCaptions: true,
  },
];

/** Les sous-titres comme la voix les prononce (répartition au prorata des syllabes) : « PharmaBoost » se dit en deux mots. */
export function spokenChunk(chunk: string): string {
  return chunk.replace(/\*/g, "").replace(/PharmaBoost/g, "Pharma Boost");
}

/** Le dossier des voix, sous public/ (staticFile). */
export const VOICE_DIR = "voix/presentation";
/** La voix et le modèle d'ElevenLabs : ceux du film « Tarif », la même voix d'un film à l'autre. */
export const VOICE = TARIF_VOICE;

/** Les durées de la voix « Yann » du 12 octobre 2026, si un fichier manque : le film reste calculable. */
export const FALLBACK_DURATIONS = [2.2, 3.0, 4.6, 4.8, 4.6, 4.2, 4.0, 2.2, 3.6, 3.8, 5.6, 6.6, 3.2];
