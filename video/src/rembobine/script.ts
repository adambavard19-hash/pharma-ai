/**
 * LE TEXTE DU FILM « REMBOBINONS » — une seule source (voix + sous-titres). Fondateur, 25 oct. 2026.
 *
 * L'idée : on ouvre sur la scène que tout le monde connaît (« Il vous fallait autre chose ? » — « Non merci. »), le patient
 * repart avec son antibiotique et rien d'autre. On REMBOBINE, et la même scène se rejoue avec PharmaBoost au comptoir.
 * Puis ce que chacun y gagne : l'équipe, le patient (bilan, rappel de fin de cure, l'application qui arrive), les marques.
 *
 * Trois voix ElevenLabs : Yann (le narrateur des films PharmaBoost), Clémence (la pharmacienne), Eric (le patient).
 * Une demande par voix, avec l'horodatage des caractères, puis le découpage en une phrase par fichier (tools/voix.mjs).
 *
 * Vérité (relue le 25 oct. 2026) : tout ce qui est dit existe et est en ligne — bannière du comptoir une ligne par boîte
 * (stock, marge, challenge, date courte), onglets Questions / Discours / Fiche, compteur des conseils vendus
 * (Performances), bilan par e-mail, rappel avant la fin de cure, challenges des laboratoires. L'application patients
 * n'est PAS sortie : on dit « bientôt ». Aucun chiffre inventé, aucune marque réelle, « le pharmacien décide ».
 * Ce fichier est lu par Node sans compilation : pas d'enum, pas de JSX.
 */

export type Speaker = "yann" | "clemence" | "eric";
/** `retake` : la phrase REDITE seule, écrite comme elle doit se prononcer (« scanné » pour le verbe scanner, que la voix
 * lisait « scanneur »). `say` ne change pas : la demande d'origine de la voix reste valable pour les autres phrases.
 * `tempo` : la vitesse de la reprise (1,034 = 3,4 % plus vite), pour que ses mots retombent sur les temps de l'image. */
export type Line = { id: string; who: Speaker; say: string; caption: string; retake?: string; tempo?: number };

export const VOICES: Record<Speaker, { name: string; id: string; model: string; settings: Record<string, number | boolean> }> = {
  yann: { name: "Yann", id: "nr2EGJNe96rzn9FRlTId", model: "eleven_multilingual_v2", settings: { stability: 0.42, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } },
  clemence: { name: "Clémence", id: "LFo5X4P9PhYaOLBA9Hyh", model: "eleven_multilingual_v2", settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } },
  eric: { name: "Eric", id: "qlfxsYlCv09qu8y6PkmY", model: "eleven_multilingual_v2", settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } },
};
export const VOICE_DIR = "rembobine/voix";

export const LINES: Line[] = [
  // ACTE 1 — la scène de tous les jours
  { id: "D1", who: "clemence", say: "Et avec ceci, il vous fallait autre chose ?", caption: "« Et avec ceci, il vous fallait autre chose ? »" },
  { id: "D2", who: "eric", say: "Non merci.", caption: "« Non merci. »" },
  { id: "N1", who: "yann", say: "Il repart avec son antibiotique… et rien pour sa flore intestinale.", caption: "Il repart avec son antibiotique… et *rien* pour sa flore intestinale." },
  { id: "N2", who: "yann", say: "Cette scène se répète chaque jour, dans toute la France.", caption: "Cette scène se répète *chaque jour*, dans toute la France." },
  { id: "N3", who: "yann", say: "Alors… rembobinons.", caption: "Alors… *rembobinons*." },
  // ACTE 2 — la même scène, avec PharmaBoost
  { id: "N4", who: "yann", say: "Même patient. Même ordonnance. Mais cette fois, PharmaBoost est au comptoir.", caption: "Même patient. Même ordonnance. Mais cette fois, *PharmaBoost* est au comptoir." },
  { id: "N5", who: "yann", say: "À chaque boîte scannée, le bon conseil s'affiche, pris dans votre stock.", caption: "À chaque boîte scannée, le *bon conseil* s'affiche, pris dans votre stock." },
  { id: "N6", who: "yann", say: "Les questions à poser. Les mots à dire. La marge, le challenge, la date courte.", caption: "Les *questions* à poser. Les *mots* à dire. La marge, le challenge, la date courte." },
  { id: "D3", who: "clemence", say: "Avec votre antibiotique, je vous conseille un probiotique.", caption: "« Avec votre antibiotique, je vous conseille un *probiotique*. »" },
  { id: "D4", who: "eric", say: "Ah oui, je veux bien !", caption: "« Ah oui, *je veux bien* ! »" },
  { id: "N7", who: "yann", say: "Le pharmacien décide. Le patient repart mieux conseillé.", caption: "Le pharmacien *décide*. Le patient repart *mieux conseillé*." },
  // ACTE 3 — ce que chacun y gagne
  { id: "N8", who: "yann", say: "Pour l'équipe : chaque conseil vendu se compte, en direct.", caption: "Pour l'équipe : chaque *conseil vendu* se compte, en direct." },
  { id: "N9", who: "yann", say: "Pour le patient : son bilan par e-mail, et un rappel avant la fin de sa cure.", caption: "Pour le patient : son *bilan* par e-mail, et un *rappel* avant la fin de sa cure." },
  { id: "N10", who: "yann", say: "Et bientôt, l'application PharmaBoost : scanner ses boîtes, suivre ses cures, profiter d'offres.", retake: "Et bientôt, l'application PharmaBoost : scanné ses boîtes, suivre ses cures, profiter d'offres.", tempo: 1.034, caption: "Et bientôt, l'*application PharmaBoost* : scanner ses boîtes, suivre ses cures, profiter d'offres." },
  { id: "N11", who: "yann", say: "Pour les marques : leurs challenges sur l'écran du comptoir, au bon moment. Et chaque vente, comptée.", caption: "Pour les marques : leurs *challenges* sur l'écran du comptoir, au bon moment. Et chaque vente, *comptée*." },
  // ACTE 4 — la signature
  { id: "N12", who: "yann", say: "PharmaBoost. Le copilote IA du comptoir de votre pharmacie.", caption: "*PharmaBoost*. Le copilote IA du comptoir de votre pharmacie." },
  // La pharmacienne remercie (fondateur, 30 oct. 2026 : « à la place de dire ça, qu'elle dise "Merci PharmaBoost" ») : la
  // phrase est REDITE seule (`retake`), le reste de sa voix ne change pas.
  { id: "D5", who: "clemence", say: "Il vous fallait autre chose ?", retake: "Merci PharmaBoost !", caption: "« Merci *PharmaBoost* ! »" },
];

/** Ce qui part à ElevenLabs pour une voix, d'un seul tenant : une phrase par ligne. */
export const fullText = (who: Speaker) =>
  LINES.filter((l) => l.who === who)
    .map((l) => l.say)
    .join("\n");
