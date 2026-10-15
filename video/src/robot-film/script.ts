/**
 * LE TEXTE DU FILM « ROBOT » — une seule source.
 *
 *  - la voix : scripts/voix-robot.mjs envoie `say` à ElevenLabs (voix « Yann », la même que le film « Tarif ») et écrit
 *    public/voix/robot/R1.mp3 … R11.mp3 ;
 *  - le montage : src/films/robot.tsx mesure la durée réelle de chaque fichier et cale dessus les gestes de l'île et
 *    les sous-titres (`chunks`, de 2 à 4 mots, le mot clé entre astérisques).
 *
 * Un portrait du robot, peu parlé : quatre temps muets où l'île joue seule (`gapAfter`), la voix dit l'essentiel.
 * Les règles des films valent ici : pas de « douchette » ni de « bip » écrits, pas d'« interactions » (on dit « mise
 * en garde »), jamais « essai » ni « gratuit », aucune promesse de résultat ; le pharmacien décide.
 * Ce fichier est lu par Node sans compilation (types effacés) : imports avec leur extension, pas d'enum, pas de JSX.
 */
import { VOICE as TARIF_VOICE } from "../tarif/script.ts";

/** L'espace insécable : elle lie la ponctuation haute à son mot dans les sous-titres. */
const NB = " ";

export type RobotLine = {
  /** Le nom du fichier de voix (public/voix/robot/<id>.mp3). */
  id: string;
  /** Ce qui est dit, tel qu'on l'écrit. */
  text: string;
  /** Ce qui est envoyé à la voix : « Pharma Boost » en deux mots. */
  say: string;
  /** Les sous-titres incrustés, dans l'ordre : 2 à 4 mots, le mot clé `*entre astérisques*`. Vide : pas de sous-titre. */
  chunks: string[];
  /** Le silence après la phrase, en secondes (les temps muets où l'île joue seule). */
  gapAfter: number;
};

export const SCRIPT: RobotLine[] = [
  {
    id: "R1",
    text: "Lui, c'est le robot de PharmaBoost.",
    say: "Lui, c'est le robot de Pharma Boost.",
    chunks: ["Lui, c'est", "le *robot*", "de *PharmaBoost*."],
    gapAfter: 0.3,
  },
  {
    id: "R2",
    text: "Il ne range pas vos boîtes. Il trouve le bon conseil.",
    say: "Il ne range pas vos boîtes. Il trouve le bon conseil.",
    chunks: ["Il ne range pas", "*vos boîtes*.", "Il trouve", `le *bon${NB}conseil*.`],
    // Temps muet 1 : le scan, l'analyse qui se coche, la mise en garde.
    gapAfter: 3.2,
  },
  {
    id: "R3",
    text: "Une mise en garde ? Il devient sérieux. Pas de fête.",
    say: "Une mise en garde ? Il devient sérieux. Pas de fête.",
    chunks: [`Une *mise en${NB}garde*${NB}?`, "Il devient *sérieux*.", `Pas de${NB}*fête*.`],
    // Les cartes de conseil s'ouvrent dans le silence.
    gapAfter: 1.4,
  },
  {
    id: "R4",
    text: "Ensuite, deux conseils. Vendu, non vendu : c'est vous qui tranchez.",
    say: "Ensuite, deux conseils. Vendu, non vendu : c'est vous qui tranchez.",
    chunks: [`Ensuite, *deux${NB}conseils*.`, `Vendu, *non${NB}vendu*${NB}:`, "c'est vous", "qui *tranchez*."],
    gapAfter: 0.6,
  },
  {
    id: "R5",
    text: "Si le patient le souhaite, son bilan part par e-mail.",
    say: "Si le patient le souhaite, son bilan part par e-mail.",
    chunks: ["Si le patient", "*le souhaite*,", "son *bilan* part", "par *e-mail*."],
    // Temps muet 2 : l'e-mail part, la vente se termine, le robot fait la fête.
    gapAfter: 4.6,
  },
  {
    id: "R6",
    text: "Dans votre logiciel, c'est le même robot. Une demande ? Un clic, c'est réglé.",
    say: "Dans votre logiciel, c'est le même robot. Une demande ? Un clic, c'est réglé.",
    chunks: ["Dans votre *logiciel*,", `c'est *le même${NB}robot*.`, `Une *demande*${NB}?`, `Un clic, *c'est${NB}réglé*.`],
    gapAfter: 0.4,
  },
  {
    id: "R7",
    text: "Posez-lui une question : il lit vos chiffres, sans rien toucher.",
    say: "Posez-lui une question : il lit vos chiffres, sans rien toucher.",
    chunks: [`Posez-lui *une question*${NB}:`, "il lit *vos chiffres*,", "sans rien *toucher*."],
    // La réponse s'écrit dans le silence.
    gapAfter: 3.0,
  },
  {
    id: "R8",
    text: "Votre stock ? Glissez le fichier : rien ne change sans votre accord.",
    say: "Votre stock ? Glissez le fichier : rien ne change sans votre accord.",
    chunks: [`Votre *stock*${NB}?`, `Glissez *le fichier*${NB}:`, "rien ne change", `sans *votre${NB}accord*.`],
    // Temps muets 3 et 4 : le stock part, retour au poste, puis les petites tapes sur le robot.
    gapAfter: 5.8,
  },
  {
    id: "R9",
    text: "Et il a du caractère.",
    say: "Et il a du caractère.",
    chunks: ["Et il a", "du *caractère*."],
    gapAfter: 0.6,
  },
  {
    id: "R10",
    text: "Chaque comptoir a le sien.",
    say: "Chaque comptoir a le sien.",
    chunks: ["Chaque *comptoir*", `a *le${NB}sien*.`],
    gapAfter: 0.5,
  },
  {
    id: "R11",
    text: "PharmaBoost. Le robot du comptoir.",
    say: "Pharma Boost. Le robot du comptoir.",
    // La carte de fin écrit déjà ces mots : pas de sous-titre.
    chunks: [],
    // La carte tient environ 2,5 s après la voix.
    gapAfter: 2.5,
  },
];

/** Les sous-titres, comme la voix les prononce (sert au calage à la syllabe). */
export function spokenChunk(chunk: string): string {
  return chunk.replace(/\*/g, "").replace(/PharmaBoost/g, "Pharma Boost");
}

/** Le dossier des voix, sous public/ (staticFile). */
export const VOICE_DIR = "voix/robot";
/** La voix et le modèle d'ElevenLabs : ceux du film « Tarif », importés pour ne jamais diverger. */
export const VOICE = TARIF_VOICE;

/** Des durées de secours (≈ 18,8 caractères par seconde, mesurés sur « Tarif »), si un fichier manque : le film reste calculable. */
export const FALLBACK_DURATIONS = SCRIPT.map((line) => Math.round((line.say.length / 18.8) * 100) / 100);
