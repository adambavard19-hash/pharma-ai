/**
 * QUATRE NOUVELLES VIDÉOS DE PRÉSENTATION (fondateur, 6 nov. 2026) : même univers que le film isotrétinoïne (fond blanc,
 * hélice d'ADN, produits dessinés sans marque, vraie bannière), mais quatre récits complètement différents. Chacune dit TOUT :
 * le scan des médicaments de l'ordonnance → un ou plusieurs conseils → la routine ; la date courte, le challenge laboratoire,
 * le laboratoire préféré du titulaire (tout le potentiel de chaque conseil) ; le bilan conseil par QR code et ses rappels ; les
 * offres qui font revenir les patients ; le chiffre d'affaires qui monte ; une pharmacie qui se démarque ; une équipe soulagée.
 * Aucune marque. Lu par Node sans compilation : pas d'enum, pas de JSX.
 */
export type Speaker = "yann" | "clemence";
export type Line = { id: string; film: 1 | 2 | 3 | 4; who: Speaker; say: string };

export const VOICES = {
  yann: { name: "Yann", id: "nr2EGJNe96rzn9FRlTId", model: "eleven_multilingual_v2", settings: { stability: 0.42, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } },
  clemence: { name: "Clémence", id: "LFo5X4P9PhYaOLBA9Hyh", model: "eleven_multilingual_v2", settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } },
};

export const LINES: Line[] = [
  // ---- 1 · Une journée au comptoir
  { id: "A1", film: 1, who: "yann", say: "Huit heures cinquante-neuf. Une journée au comptoir commence." },
  { id: "A2", film: 1, who: "yann", say: "Neuf heures. Une ordonnance d'isotrétinoïne. La boîte est scannée… et PharmaBoost propose aussitôt le bon conseil : une crème lavante apaisante. Puis la routine complète : soin hydratant, baume à lèvres, protection solaire." },
  { id: "A3", film: 1, who: "yann", say: "Onze heures. Un antibiotique. Scanné… un probiotique, choisi dans votre stock : celui en date courte, celui du challenge laboratoire, celui du laboratoire que préfère le titulaire." },
  { id: "A4", film: 1, who: "yann", say: "Seize heures. Un antiallergique. Scanné… un lavage nasal, et la routine des allergies." },
  { id: "A5", film: 1, who: "yann", say: "Votre équipe n'a plus à tout retenir : PharmaBoost l'accompagne, et chaque conseil donne tout son potentiel." },
  { id: "A6", film: 1, who: "yann", say: "Le patient scanne le QR code : son bilan conseil s'ouvre sur son téléphone, avec un rappel avant la fin de sa cure. Et quand vous lancez une offre, il la reçoit… et revient chez vous." },
  { id: "A7", film: 1, who: "yann", say: "Dix-neuf heures. Le titulaire fait le point : plus de conseils vendus, un chiffre d'affaires qui monte, et une équipe soulagée." },
  { id: "A8", film: 1, who: "yann", say: "Une pharmacie qui se démarque. Professionnelle. PharmaBoost, le copilote IA du comptoir de votre pharmacie." },
  // ---- 2 · En trois étapes
  { id: "B1", film: 2, who: "yann", say: "Et si chaque ordonnance donnait enfin tout son potentiel de conseil ? Voici PharmaBoost, en trois étapes." },
  { id: "B2", film: 2, who: "yann", say: "Un. Vous scannez les médicaments de l'ordonnance, comme d'habitude. Ici, de l'isotrétinoïne." },
  { id: "B3", film: 2, who: "yann", say: "Deux. PharmaBoost affiche le bon conseil, en croisant votre stock, vos dates courtes, les challenges laboratoires et le laboratoire préféré du titulaire. Une crème lavante apaisante." },
  { id: "B4", film: 2, who: "yann", say: "Trois. Il complète avec la routine : un soin hydratant, un baume à lèvres, une protection solaire." },
  { id: "B5", film: 2, who: "yann", say: "Et ce n'est pas fini. Le patient scanne le QR code : son bilan conseil arrive sur son téléphone, avec ses rappels. Une offre de votre pharmacie ? Il reçoit la notification, et revient chez vous." },
  { id: "B6", film: 2, who: "yann", say: "Résultat : plus de conseils, plus de chiffre d'affaires, des patients fidèles, et une équipe soulagée, qui n'a plus à tout retenir. Une pharmacie qui se démarque." },
  { id: "B7", film: 2, who: "yann", say: "PharmaBoost. Le copilote IA du comptoir de votre pharmacie." },
  // ---- 3 · La patiente raconte
  { id: "C1", film: 3, who: "clemence", say: "Mon dermatologue m'a prescrit de l'isotrétinoïne. J'avais un peu peur des effets." },
  { id: "C2", film: 3, who: "yann", say: "Au comptoir, sa boîte est scannée. En une seconde, PharmaBoost propose le bon conseil, et la routine qui va avec." },
  { id: "C3", film: 3, who: "clemence", say: "La pharmacienne m'a conseillé une crème lavante très douce, puis une routine complète contre la sécheresse. Elle savait exactement quoi me dire." },
  { id: "C4", film: 3, who: "yann", say: "Derrière, PharmaBoost a tout croisé : le stock, la date courte, le challenge du laboratoire, et le laboratoire préféré du titulaire. La pharmacienne n'a rien eu à retenir." },
  { id: "C5", film: 3, who: "clemence", say: "J'ai scanné un QR code, et mon bilan conseil est arrivé sur mon téléphone. Avec un rappel avant la fin de ma cure." },
  { id: "C6", film: 3, who: "yann", say: "Et quand sa pharmacie lance une offre, elle reçoit la notification." },
  { id: "C7", film: 3, who: "clemence", say: "Maintenant, c'est ma pharmacie. Je n'irais nulle part ailleurs." },
  { id: "C8", film: 3, who: "yann", say: "Une patiente fidèle. Des conseils vendus. Un chiffre d'affaires qui grandit, et une équipe soulagée. PharmaBoost, le copilote IA du comptoir de votre pharmacie." },
  // ---- 4 · Sans / Avec
  { id: "D1", film: 4, who: "yann", say: "Même pharmacie. Même ordonnance d'isotrétinoïne. Deux comptoirs." },
  { id: "D2", film: 4, who: "yann", say: "À gauche, la boîte est scannée… et c'est tout. À droite, PharmaBoost propose la crème lavante apaisante, puis la routine complète." },
  { id: "D3", film: 4, who: "yann", say: "À gauche, la date courte reste en rayon, le challenge du laboratoire est oublié. À droite, PharmaBoost les met en avant, avec le laboratoire préféré du titulaire." },
  { id: "D4", film: 4, who: "yann", say: "À gauche, le patient repart les mains vides. À droite, il scanne son bilan conseil, reçoit ses rappels… et les offres de sa pharmacie." },
  { id: "D5", film: 4, who: "yann", say: "À la fin du mois, à gauche, rien ne bouge. À droite, les conseils, le chiffre d'affaires et les patients fidèles montent. Et l'équipe respire." },
  { id: "D6", film: 4, who: "yann", say: "Une pharmacie comme les autres… ou une pharmacie qui se démarque ? PharmaBoost, le copilote IA du comptoir de votre pharmacie." },
];
