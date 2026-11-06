/**
 * LE TEXTE DU FILM DE PRÉSENTATION, version isotrétinoïne (fondateur, 4 nov. 2026). Une seule source pour les voix et les
 * sous-titres. Deux montages du même film :
 *   • « presentation » : la vidéo du site (pharmaboost.app/decouvrir) ;
 *   • « lettre » : la vidéo du QR code du courrier : « Bonjour, Docteur… », « Je vous laisse deux minutes… », puis la
 *     présentation entière, et « Réservez une démonstration ».
 * La routine vient du document du fondateur : isotrétinoïne → nettoyant doux, soin hydratant, baume à lèvres, protection
 * solaire. Aucune marque (les produits sont dessinés sans nom ni logo). L'application n'« arrive » pas : on la montre.
 * `reuse` : réplique déjà enregistrée (rien n'est redemandé). Lu par Node sans compilation : pas d'enum, pas de JSX.
 */
export type Speaker = "yann" | "clemence" | "eric";
export type Line = { id: string; who: Speaker; say: string; reuse?: string; only?: "lettre" };

export const VOICES = {
  yann: { name: "Yann", id: "nr2EGJNe96rzn9FRlTId", model: "eleven_multilingual_v2", settings: { stability: 0.42, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } },
  clemence: { name: "Clémence", id: "LFo5X4P9PhYaOLBA9Hyh", model: "eleven_multilingual_v2", settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } },
};

export const LINES: Line[] = [
  // La lettre (montage « lettre » seulement)
  { id: "L1", who: "yann", only: "lettre", say: "Bonjour, Docteur. Nous avons préféré vous envoyer cette lettre, plutôt que de vous déranger en pleine journée.", reuse: "lettre/voix/Y1.wav" },
  { id: "L2", who: "yann", only: "lettre", say: "Je vous laisse deux minutes pour découvrir ce que PharmaBoost change au comptoir." },
  // Acte 1 : la scène de tous les jours
  { id: "D1", who: "clemence", say: "Et avec ceci, il vous fallait autre chose ?", reuse: "rembobine/voix/D1.wav" },
  { id: "D2", who: "eric", say: "Non merci.", reuse: "rembobine/voix/D2.wav" },
  { id: "I1", who: "yann", say: "Il repart avec son traitement contre l'acné… mais sans rien contre la sécheresse que peut provoquer le médicament." },
  { id: "I2", who: "yann", say: "Cette scène se répète chaque jour, dans toute la France. Et pas seulement pour l'acné : antibiotiques, allergies, douleurs… à chaque ordonnance, des conseils passent à la trappe." },
  { id: "I3", who: "yann", say: "Alors… rembobinons.", reuse: "lettre/voix/Y5.wav" },
  // Acte 2 : la même scène, avec PharmaBoost
  { id: "I4", who: "yann", say: "Même patient. Même ordonnance. Mais cette fois, PharmaBoost est au comptoir.", reuse: "lettre/voix/Y6.wav" },
  { id: "I5", who: "yann", say: "Rien ne change dans vos habitudes : PharmaBoost se connecte directement à votre logiciel." },
  // Les deux questions du fondateur (5 nov. 2026), à la place de « En une seconde, personne ne peut tout avoir en tête ».
  { id: "I6", who: "yann", say: "Votre équipe exploite-t-elle réellement tout le potentiel de conseil de chaque ordonnance ? Combien d'opportunités de conseil passent chaque jour inaperçues au comptoir ?" },
  { id: "I7", who: "yann", say: "PharmaBoost croise votre stock, vos dates courtes, votre surstock, les challenges laboratoires et votre marge… et en sort, en une seconde, le bon conseil et la routine complète." },
  { id: "I8", who: "yann", say: "Dès l'isotrétinoïne scannée, le bon conseil s'affiche, pris dans votre stock : une crème lavante apaisante. Puis la routine pour accompagner tout le traitement : un soin hydratant, un baume à lèvres, une protection solaire." },
  { id: "I9", who: "yann", say: "Les questions à poser. Le conseil à prodiguer. Les challenges laboratoires, les dates courtes." },
  { id: "I10", who: "yann", say: "Et un clic sur le conseil : sa fiche complète, contre-indications comprises." },
  { id: "C1", who: "clemence", say: "Ce traitement peut provoquer une sécheresse à différents niveaux. Je vous conseille cette crème lavante, très douce. Et pour limiter les symptômes de sécheresse, la routine complète : un soin hydratant, un baume pour les lèvres et une protection solaire." },
  { id: "D4", who: "eric", say: "Ah oui, je veux bien !", reuse: "rembobine/voix/D4.wav" },
  { id: "I11", who: "yann", say: "Le pharmacien décide. Le conseil est complet dès la première délivrance." },
  // Acte 3 : après le comptoir
  // Le bilan par QR code (5 nov. 2026), à la place de l'e-mail.
  { id: "I12", who: "yann", say: "Le patient scanne le QR code : son bilan conseil s'ouvre sur son téléphone…" },
  { id: "I13", who: "yann", say: "…et le retrouve dans l'application PharmaBoost : ses conseils, sa routine, le rappel avant la fin de sa cure." },
  { id: "I16", who: "yann", say: "Et aucune donnée de santé n'est gardée : tout reste sur le téléphone du patient." },
  { id: "I14", who: "yann", say: "Et cette application ne sert pas qu'au patient : c'est aussi le lien direct entre votre pharmacie et toute votre patientèle. Vous lancez une campagne d'offres avec un laboratoire ? Vos patients reçoivent la notification… et viennent en profiter chez vous, plutôt qu'ailleurs." },
  { id: "I15", who: "yann", say: "Et le titulaire suit son équipe : conseils vendus, chiffre d'affaires et marge de chacun, le classement, et où chacun en est dans les challenges." },
  // La signature
  { id: "N12", who: "yann", say: "PharmaBoost. Le copilote IA du comptoir de votre pharmacie.", reuse: "rembobine/voix/N12.wav" },
  { id: "D5", who: "clemence", say: "Merci PharmaBoost !", reuse: "rembobine/voix/D5.wav" },
  { id: "L3", who: "yann", only: "lettre", say: "Et vous, quelle pharmacie voulez-vous être ? Réservez une démonstration sur pharmaboost point app.", reuse: "lettre/voix/Y18.wav" },
];

/** Ce qui part à ElevenLabs pour une voix, d'un seul tenant : les phrases nouvelles, une par ligne. */
export const fullText = (who: Speaker) =>
  LINES.filter((l) => l.who === who && !l.reuse)
    .map((l) => l.say)
    .join("\n");
