/**
 * LE TEXTE DU FILM « LE CERCLE » — une seule source (voix + gros texte du haut). Fondateur, 25 oct. 2026.
 *
 * Format Instagram (Reel, 9:16), dans le style de la vidéo de référence envoyée par le fondateur (Loyalti, « Même rue.
 * Deux salons. ») : une rue de nuit en 3D isométrique, deux pharmacies face à face — l'une s'illumine et se remplit,
 * l'autre reste éteinte ; un grand texte en haut, mot à mot, des mots surlignés ; des téléphones ; des phrases courtes.
 * Le message : la pharmacie PharmaBoost conseille plus (le pharmacien), le patient repart avec le vrai complément de son
 * traitement et son bilan conseil, puis (bientôt) les offres de SA pharmacie dans l'appli → il revient → c'est un cercle.
 *
 * Voix : Yann (ElevenLabs), le narrateur des films PharmaBoost. Les deux répliques « Il vous fallait autre chose ? » /
 * « Non merci. » sont REPRISES du film « Rembobinons » (public/rembobine/voix/D1.wav et D2.wav : Clémence et Eric).
 *
 * Vérité (25 oct. 2026) : bannière du comptoir, bilan conseil par e-mail, rappel de fin de cure = en ligne. L'appli
 * patients et les offres de la pharmacie dans l'appli (campagnes du titulaire) = construites mais PAS sorties → « bientôt ».
 * Aucun chiffre, aucune marque réelle, « le pharmacien » reste celui qui conseille.
 * Ce fichier est lu par Node sans compilation : pas d'enum, pas de JSX.
 */

export type Line = { id: string; say: string; caption: string; reuse?: string };

export const VOICE = { name: "Yann", id: "nr2EGJNe96rzn9FRlTId", model: "eleven_multilingual_v2", settings: { stability: 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } };
export const VOICE_DIR = "cercle/voix";

/** `caption` : le gros texte du haut ; les mots entre *astérisques* sont surlignés (boîte citron). */
export const LINES: Line[] = [
  { id: "V1", say: "Même rue. Deux pharmacies.", caption: "Même rue. *Deux* *pharmacies.*" },
  { id: "V2", say: "Mêmes boîtes. Mêmes ordonnances.", caption: "Mêmes boîtes. Mêmes ordonnances." },
  { id: "V3", say: "Mais dans l'une, les patients reviennent.", caption: "Mais dans l'une, les patients *reviennent.*" },
  { id: "V4", say: "Vous savez pourquoi ?", caption: "Vous savez pourquoi ?" },
  { id: "V5", say: "Elle a un copilote.", caption: "Elle a *un* *copilote.*" },
  { id: "V6", say: "Une boîte scannée… et le bon conseil s'affiche au comptoir.", caption: "Une boîte scannée… et le *bon* *conseil* s'affiche au comptoir." },
  { id: "V7", say: "Le pharmacien est guidé. Il conseille plus, et mieux.", caption: "Le pharmacien est guidé. Il conseille *plus,* et *mieux.*" },
  { id: "V8", say: "Le patient repart avec le vrai complément de son traitement. Ça fait pro.", caption: "Le patient repart avec le *vrai* *complément* de son traitement. Ça fait *pro.*" },
  { id: "V9", say: "Son bilan conseil l'attend dans son téléphone.", caption: "Son *bilan* *conseil* l'attend dans son téléphone." },
  { id: "V10", say: "Et bientôt, dans l'appli : les offres de sa pharmacie, sur ses gammes préférées.", caption: "Et bientôt, dans l'appli : les *offres* de *sa* *pharmacie,* sur ses gammes préférées." },
  { id: "V11", say: "Alors il revient. Nouveau passage, nouveau conseil.", caption: "Alors il *revient.* Nouveau passage, nouveau conseil." },
  { id: "V12", say: "C'est un cercle.", caption: "C'est un *cercle.*" },
  { id: "V13", say: "Pendant ce temps, à côté…", caption: "Pendant ce temps, à côté…" },
  { id: "D1", say: "Et avec ceci, il vous fallait autre chose ?", caption: "« Et avec ceci, il vous fallait autre chose ? »", reuse: "rembobine/voix/D1.wav" },
  { id: "D2", say: "Non merci.", caption: "« Non *merci.* »", reuse: "rembobine/voix/D2.wav" },
  { id: "V14", say: "Ce copilote s'appelle… PharmaBoost.", caption: "Ce copilote s'appelle… *PharmaBoost.*" },
  { id: "V15", say: "Et vous, quelle pharmacie voulez-vous être ?", caption: "Et vous, quelle pharmacie *voulez-vous* *être* ?" },
  { id: "V16", say: "Réservez votre démo sur pharmaboost point app.", caption: "Réservez votre démo sur *pharmaboost.app*" },
];

/** Ce qui part à ElevenLabs, d'un seul tenant : une phrase par ligne (les répliques reprises n'y sont pas). */
export const FULL_TEXT = LINES.filter((l) => !l.reuse)
  .map((l) => l.say)
  .join("\n");
