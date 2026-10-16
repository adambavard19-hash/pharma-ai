/**
 * LES TEXTES DES FILMS « PRISE EN MAIN » (17 oct. 2026) — un film pour le TITULAIRE, un pour le PHARMACIEN (fondateur : « le
 * pharmacien n'a pas accès à plein de choses que voit le titulaire, et inversement »). Chacun montre son espace, avec ses onglets.
 *
 *  - la voix : scripts/voix-guide.mjs envoie `say` à ElevenLabs (voix « Yann ») AVEC le minutage de chaque caractère, et écrit
 *    public/voix/guide-<film>/<id>.mp3 et src/prise-en-main/voix-<film>.ts (durées et mots minutés) ;
 *  - les sous-titres suivent les mots réellement prononcés (plus de répartition à l'estimation) ; les mots de `keys` sont en couleur ;
 *  - le son n'est plus mixé par le rendu : scripts/guide-mix.mjs pose chaque phrase à son instant exact sur une seule piste.
 *
 * Lu par Node sans compilation : pas d'enum, pas de JSX, imports avec extension.
 */

export type SceneKey = "intro" | "lgo" | "analyse" | "conseils" | "vendu" | "fin" | "comptoir" | "historique" | "performances" | "resultats" | "stock" | "dates" | "associations" | "equipe" | "bilan" | "outro";
export type FilmKey = "titulaire" | "pharmacien";

export type GuideLine = { id: string; scene: SceneKey; say: string; keys: string[]; gapAfter: number };

export const VOICE = { name: "Yann", id: "nr2EGJNe96rzn9FRlTId", model: "eleven_multilingual_v2" };
export const voiceDir = (film: FilmKey) => `voix/guide-${film}`;

const LGO = "Votre logiciel de pharmacie, votre L.G.O., reste exactement le même. Pharma Boost s'installe à côté, sur chaque poste de comptoir.";
const BANNER = "Dès le scan, la bannière apparaît en haut de l'écran : elle lit la boîte, et vérifie votre stock.";
const CARD = "Pour chaque conseil : le produit, son prix, et la raison, en une phrase.";
const PILLS = "Les pastilles disent l'essentiel : en stock, une date courte à écouler, ou un challenge en cours avec un laboratoire.";
const ASSOC = "Avec « Mes associations », ajoutez vos propres conseils : quand ce produit est dans la vente, Pharma Boost propose celui-ci.";
const OUTRO = "Une question ? Cliquez sur « Contact support », en bas du menu. Pharma Boost : le bon conseil, à chaque vente.";

export const SCRIPTS: Record<FilmKey, GuideLine[]> = {
  titulaire: [
    { id: "T1", scene: "intro", say: "Bienvenue sur Pharma Boost. Cette vidéo est faite pour vous, titulaire : voici comment fonctionne Pharma Boost, au comptoir, et dans votre espace.", keys: ["titulaire"], gapAfter: 0.5 },
    { id: "T2", scene: "lgo", say: LGO, keys: ["LGO", "à côté"], gapAfter: 0.35 },
    { id: "T3", scene: "lgo", say: "Votre équipe scanne les boîtes comme d'habitude. Pharma Boost voit le même scan, et montre le bon conseil.", keys: ["scanne", "bon conseil"], gapAfter: 0.5 },
    { id: "T4", scene: "analyse", say: BANNER, keys: ["bannière", "stock"], gapAfter: 0.35 },
    { id: "T5", scene: "analyse", say: "Repliée, elle reste discrète, sans jamais prendre la main sur le logiciel. On passe la souris dessus pour voir les conseils.", keys: ["discrète", "conseils"], gapAfter: 0.5 },
    { id: "T6", scene: "conseils", say: CARD, keys: ["produit", "prix", "raison"], gapAfter: 0.3 },
    { id: "T7", scene: "conseils", say: PILLS, keys: ["en stock", "date courte", "challenge"], gapAfter: 0.5 },
    { id: "T8", scene: "vendu", say: "Le client prend le produit ? On le scanne : le conseil passe en « vendu », tout seul, sans aucun clic.", keys: ["scanne", "vendu"], gapAfter: 0.5 },
    { id: "T9", scene: "fin", say: "Une ligne supprimée dans L.G.P.I. est aussi retirée de Pharma Boost. Et avec L.G.P.I., la fin de la vente est reconnue toute seule.", keys: ["supprimée", "retirée", "toute seule"], gapAfter: 0.3 },
    { id: "T10", scene: "fin", say: "Le patient peut recevoir ses conseils par e-mail, et chaque conseil vendu est célébré.", keys: ["e-mail", "célébré"], gapAfter: 0.7 },
    { id: "T11", scene: "comptoir", say: "Dans votre espace, l'onglet « Au comptoir » montre en direct les ventes de votre comptoir, et celles terminées aujourd'hui.", keys: ["Au comptoir", "en direct"], gapAfter: 0.5 },
    { id: "T12", scene: "historique", say: "L'historique reprend toutes les ventes de la pharmacie : les boîtes scannées, les conseils proposés, ceux vendus, et ce qu'ils ont rapporté.", keys: ["historique", "toutes les ventes", "rapporté"], gapAfter: 0.5 },
    { id: "T13", scene: "performances", say: "Dans « Performances », le classement de l'équipe : qui propose, et qui vend. Ces chiffres ne sont visibles que par vous.", keys: ["Performances", "classement", "que par vous"], gapAfter: 0.3 },
    { id: "T14", scene: "resultats", say: "Et le chiffre d'affaires que Pharma Boost vous apporte, jour par jour, à télécharger en P.D.F.", keys: ["chiffre d'affaires", "PDF"], gapAfter: 0.5 },
    { id: "T15", scene: "stock", say: "« Mon stock » tient Pharma Boost à jour : il ne propose que ce que vous avez en rayon.", keys: ["Mon stock", "en rayon"], gapAfter: 0.4 },
    { id: "T16", scene: "dates", say: "Dans « Dates courtes », scannez une boîte proche de sa date : elle sera proposée en priorité au comptoir.", keys: ["Dates courtes", "en priorité"], gapAfter: 0.5 },
    { id: "T17", scene: "associations", say: ASSOC, keys: ["Mes associations", "vos propres conseils"], gapAfter: 0.5 },
    { id: "T18", scene: "equipe", say: "Dans « Mon équipe », ajoutez vos collaborateurs. Chacun se connecte sur son poste, avec son propre comptoir.", keys: ["Mon équipe", "son propre comptoir"], gapAfter: 0.5 },
    { id: "T19", scene: "bilan", say: "Chaque matin, vous recevez par e-mail le bilan de la veille de toute la pharmacie, avec son P.D.F. Et chaque collaborateur reçoit le sien.", keys: ["Chaque matin", "bilan", "le sien"], gapAfter: 0.6 },
    { id: "T20", scene: "outro", say: OUTRO, keys: ["question", "Contact support"], gapAfter: 1.6 },
  ],
  pharmacien: [
    { id: "P1", scene: "intro", say: "Bienvenue sur Pharma Boost. Cette vidéo est faite pour vous, au comptoir : voici comment Pharma Boost vous aide, à chaque vente.", keys: ["comptoir"], gapAfter: 0.5 },
    { id: "P2", scene: "lgo", say: LGO, keys: ["LGO", "à côté"], gapAfter: 0.35 },
    { id: "P3", scene: "lgo", say: "Vous scannez les boîtes comme d'habitude. Pharma Boost voit le même scan, et vous montre le bon conseil.", keys: ["scannez", "bon conseil"], gapAfter: 0.5 },
    { id: "P4", scene: "analyse", say: BANNER, keys: ["bannière", "stock"], gapAfter: 0.35 },
    { id: "P5", scene: "analyse", say: "Repliée, elle reste discrète, sans jamais prendre la main sur votre logiciel. Passez la souris dessus pour voir les conseils.", keys: ["discrète", "conseils"], gapAfter: 0.5 },
    { id: "P6", scene: "conseils", say: CARD, keys: ["produit", "prix", "raison"], gapAfter: 0.3 },
    { id: "P7", scene: "conseils", say: PILLS, keys: ["en stock", "date courte", "challenge"], gapAfter: 0.5 },
    { id: "P8", scene: "vendu", say: "Le client prend le produit ? Scannez-le : le conseil passe en « vendu », tout seul, sans aucun clic.", keys: ["Scannez-le", "vendu"], gapAfter: 0.5 },
    { id: "P9", scene: "fin", say: "Vous supprimez une ligne dans L.G.P.I. ? Pharma Boost la retire aussi. Et avec L.G.P.I., la fin de la vente est reconnue toute seule.", keys: ["supprimez", "retire aussi", "toute seule"], gapAfter: 0.3 },
    { id: "P10", scene: "fin", say: "Le patient peut recevoir ses conseils par e-mail. Et chaque conseil vendu est célébré.", keys: ["e-mail", "célébré"], gapAfter: 0.7 },
    { id: "P11", scene: "comptoir", say: "Dans votre espace, l'onglet « Au comptoir » montre en direct les ventes de votre comptoir, et celles terminées aujourd'hui.", keys: ["Au comptoir", "en direct"], gapAfter: 0.5 },
    { id: "P12", scene: "historique", say: "L'historique reprend vos ventes, une par une : les conseils proposés, ceux que vous avez vendus, et ce qu'ils ont rapporté.", keys: ["historique", "vos ventes", "rapporté"], gapAfter: 0.5 },
    { id: "P13", scene: "dates", say: "Une boîte proche de sa date ? Dans « Dates courtes », scannez-la : elle sera proposée en priorité au comptoir.", keys: ["Dates courtes", "en priorité"], gapAfter: 0.5 },
    { id: "P14", scene: "associations", say: ASSOC, keys: ["Mes associations", "vos propres conseils"], gapAfter: 0.5 },
    { id: "P15", scene: "bilan", say: "Chaque matin, vous recevez par e-mail votre bilan de la veille : seulement vos ventes, avec leur P.D.F.", keys: ["Chaque matin", "votre bilan", "seulement vos ventes"], gapAfter: 0.6 },
    { id: "P16", scene: "outro", say: OUTRO, keys: ["question", "Contact support"], gapAfter: 1.6 },
  ],
};

/** Ce que la voix dit, tel qu'on l'écrit à l'écran : « Pharma Boost » en un mot, les sigles sans points, sans guillemets. */
export function displayWord(word: string): string {
  return word.replace(/^L\.G\.O\.?/, "LGO").replace(/^L\.G\.P\.I\.?/, "LGPI").replace(/^P\.D\.F\.?/, "PDF").replace(/[«»]/g, "");
}
