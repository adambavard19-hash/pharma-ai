/**
 * LE TEXTE DU FILM DE LA LETTRE (version 3, fondateur, 3 nov. 2026) — une seule source pour les voix et les sous-titres.
 * Trois films en un : la lettre (base du 31 oct.), « Rembobinons » rejoué sur la VRAIE routine allergie de la console
 * (cétirizine → nez, yeux, gorge), le patient qui revient (e-mail, appli, notifications), puis « deux pharmacies ».
 * Fond blanc partout, aucune feuille imprimée ni QR code, aucune marque.
 * `reuse` : réplique déjà enregistrée pour « Rembobinons » (rien n'est redemandé).
 * Lu par Node sans compilation : pas d'enum, pas de JSX.
 */
export type Speaker = "yann" | "yann2" | "clemence" | "eric";
export type Line = { id: string; who: Speaker; say: string; reuse?: string };

export const VOICES = {
  yann: { name: "Yann", id: "nr2EGJNe96rzn9FRlTId", model: "eleven_multilingual_v2", settings: { stability: 0.42, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } },
  // La phrase ajoutée le 3 nov. 2026 (fondateur), demandée à part : la voix de Yann déjà enregistrée ne bouge pas.
  yann2: { name: "Yann (ajout)", id: "nr2EGJNe96rzn9FRlTId", model: "eleven_multilingual_v2", settings: { stability: 0.42, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } },
  clemence: { name: "Clémence", id: "LFo5X4P9PhYaOLBA9Hyh", model: "eleven_multilingual_v2", settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } },
};

export const LINES: Line[] = [
  { id: "Y1", who: "yann", say: "Bonjour, Docteur. Nous avons préféré vous envoyer cette lettre, plutôt que de vous déranger en pleine journée." },
  { id: "Y2", who: "yann", say: "Laissez-nous vous montrer, en deux minutes, ce qui change au comptoir." },
  { id: "D1", who: "clemence", say: "Et avec ceci, il vous fallait autre chose ?", reuse: "rembobine/voix/D1.wav" },
  { id: "D2", who: "eric", say: "Non merci.", reuse: "rembobine/voix/D2.wav" },
  { id: "Y3", who: "yann", say: "Il repart avec son traitement contre l'allergie… et rien pour son nez, ses yeux, sa gorge." },
  { id: "Y4", who: "yann", say: "Cette scène se répète chaque jour, dans toute la France." },
  { id: "Y5", who: "yann", say: "Alors… rembobinons." },
  { id: "Y6", who: "yann", say: "Même patient. Même ordonnance. Mais cette fois, PharmaBoost est au comptoir." },
  { id: "Y7", who: "yann", say: "À chaque boîte scannée, la routine idéale s'affiche, écrite par une pharmacienne et prise dans votre stock." },
  { id: "Y8", who: "yann", say: "Les questions à poser. Les mots à dire." },
  { id: "C1", who: "clemence", say: "Pour soulager le reste, je vous conseille un lavage du nez à l'eau de mer, un collyre anti-allergique et des pastilles adoucissantes." },
  { id: "D4", who: "eric", say: "Ah oui, je veux bien !", reuse: "rembobine/voix/D4.wav" },
  { id: "Y9", who: "yann", say: "Le pharmacien décide. Le patient repart avec une prise en charge complète." },
  { id: "Y9b", who: "yann2", say: "PharmaBoost sort le conseil parfait, celui auquel on ne pense pas toujours en une seconde. Et c'est prouvé : dans nos pharmacies tests, le chiffre d'affaires a augmenté." },
  { id: "Y10", who: "yann", say: "Et ça ne s'arrête pas au comptoir." },
  { id: "Y11", who: "yann", say: "Par e-mail et dans l'application PharmaBoost, le patient retrouve son bilan : ses conseils, sa routine, sa cure." },
  { id: "Y12", who: "yann", say: "Une notification lui rappelle que sa cure se termine : il revient." },
  { id: "Y13", who: "yann", say: "Votre pharmacie lance une campagne avec un laboratoire : ses patients sont prévenus, directement dans l'appli." },
  { id: "Y14", who: "yann", say: "Même rue. Deux pharmacies. Mêmes boîtes, mêmes ordonnances." },
  { id: "Y15", who: "yann", say: "Mais dans l'une, les patients reviennent. Nouveau passage, nouveau conseil : c'est un cercle." },
  { id: "Y16", who: "yann", say: "Pendant ce temps, à côté…" },
  { id: "D1b", who: "clemence", say: "Et avec ceci, il vous fallait autre chose ?", reuse: "rembobine/voix/D1.wav" },
  { id: "D2b", who: "eric", say: "Non merci.", reuse: "rembobine/voix/D2.wav" },
  { id: "Y17", who: "yann", say: "PharmaBoost. Votre expertise, soutenue à chaque délivrance." },
  { id: "Y18", who: "yann", say: "Et vous, quelle pharmacie voulez-vous être ? Réservez une démonstration sur pharmaboost point app." },
];

export const fullText = (who: Speaker) => LINES.filter((l) => l.who === who && !l.reuse).map((l) => l.say).join("\n");
