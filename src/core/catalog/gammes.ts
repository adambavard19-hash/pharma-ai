import { normalizeProductText } from "./product-vocabulary";

/**
 * Les gammes de produits conseil (fondateur, 5 nov. 2026) : « quand je crée une association, je veux que tu me proposes
 * toi tous les produits de cette catégorie, plutôt que je les rentre à la main un par un ». On tape « réhydratation »,
 * « électrolytes » ou « Hydratis », et PharmaBoost propose d'un coup toute la gamme : Hydratis, Hydrafizz, Hydraplus,
 * Adiaril… lus dans l'intitulé des produits des pharmacies.
 *
 * Par dictionnaire, sans modèle : chaque gamme a ses mots (ce qu'on tape pour la trouver) et son motif (ce que l'intitulé
 * d'un produit doit contenir, sur le texte normalisé : minuscules, sans accents, ponctuation en espaces). Les marques citées
 * servent à reconnaître le rayon ; elles ne sont ni exhaustives ni recommandées. Le choix final reste à la personne : la
 * gamme est une proposition, produit par produit décochable.
 */
export type Gamme = {
  key: string;
  label: string;
  /** Ce qu'on tape pour la trouver (normalisé à la comparaison). */
  words: string[];
  /** L'intitulé d'un produit de la gamme (texte normalisé). */
  test: RegExp;
  /** L'intitulé ne doit pas contenir ceci (texte normalisé). */
  not?: RegExp;
};

const HAIR = "(anti ?chute|a chute|antichute|chute|cheveu|capillaire|forcapil|phyto ?phanere|cystiphane|inneov|pilocaps|biotine|keratine|hair|anacaps|forticea|neoptide|triphasic|densifiant|fortifiant)";
const ORAL = "(gelule|gel\\b|gelu|comprime|cpr|caps|capsule|gummies|gummy|gommes?|cure|complement|ampoule|sachets?|stick)";
const SHAMPOO = "(shampo+i?n?g|shamp|shp)";
const LOTION = "(lotion|spray|spr\\b|serum|ampoules? capillaires?|soin sans rincage)";

export const GAMMES: readonly Gamme[] = [
  {
    key: "rehydratation",
    label: "Réhydratation : pastilles et solutions d'électrolytes",
    words: ["réhydratation", "rehydratation", "réhydrater", "électrolytes", "electrolytes", "sro", "sels de réhydratation", "hydratis", "hydrafiz", "hydrafizz", "hydraplus", "adiaril", "déshydratation", "pastilles effervescentes hydratation"],
    test: /(rehydrat|electrolyt|hydratis|hydrafiz+|hydra ?plus|hydranova|adiaril|viatol|fanolyte|picolite|\bsro\b|\bors\b|sels? de rehydratation|solute de rehydratation|ges ?45)/,
    // Une crème ou un baume « réhydratant » n'est pas une réhydratation orale.
    not: /\b(bme|baume|creme|cr|lait|levres?|lab|gel douche|serum|masque|lotion|soin|visage|corps|mains?|shampo\w*)\b/,
  },
  {
    key: "chute-cheveux-complements",
    label: "Chute de cheveux : compléments à avaler (gélules, comprimés, gummies)",
    words: ["chute de cheveux", "chute des cheveux", "anti-chute", "antichute", "cheveux", "complément cheveux", "gummies cheveux", "forcapil", "phytophanère", "cystiphane", "innéov", "pilocaps", "biotine"],
    test: new RegExp(`(?=.*${HAIR})(?=.*${ORAL})`),
    not: new RegExp(`${SHAMPOO}|${LOTION}|apres shampo|masque`),
  },
  {
    key: "chute-cheveux-shampoings",
    label: "Chute de cheveux : shampoings anti-chute",
    words: ["shampoing anti-chute", "shampooing anti-chute", "shampoing chute", "shampoing cheveux", "anti-chute", "chute de cheveux", "cheveux"],
    test: new RegExp(`(?=.*${SHAMPOO})(?=.*(chute|anti ?chute|a chute|forticea|densifiant|fortifiant|stimulant|cystiphane|triphasic|neoptide|energisant|revitalisant))`),
  },
  {
    key: "chute-cheveux-lotions",
    label: "Chute de cheveux : lotions, sprays et sérums anti-chute",
    words: ["lotion anti-chute", "spray anti-chute", "sérum anti-chute", "anti-chute", "chute de cheveux", "cheveux"],
    test: new RegExp(`(?=.*${LOTION})(?=.*(chute|anti ?chute|a chute|neoptide|triphasic|forticea|densifiant|capillaire|cheveu))`),
    not: new RegExp(SHAMPOO),
  },
  {
    key: "probiotiques",
    label: "Probiotiques et flore intestinale",
    words: ["probiotique", "probiotiques", "flore intestinale", "ferments lactiques", "levure", "ultra-levure", "lactibiane", "bion 3"],
    test: /(probioti|prebioti|ultra ?levure|lactobacil|bifidobact|saccharomyces|flore intestinale|ferments? lactiques?|lactibiane|ergyphilus|smebiocta|bion ?3|probiolog|lacteol|enterogermina|alflorex|imgalt)/,
    not: /\b(topic|creme|baume|emollient|lait corps|gel douche|huile lavante)\b/,
  },
  {
    key: "lavage-nasal",
    label: "Hygiène nasale : eau de mer, sérum physiologique",
    words: ["lavage nasal", "eau de mer", "spray nasal", "sérum physiologique", "nez", "physiomer", "stérimar"],
    test: /(physiomer|sterimar|prorhinel|humer|rhinomer|marimer|eau de mer|serum physio|serum phy|physiologique|lavage nasal|solution nasale|hygiene nasale|dosettes? nasales?)/,
  },
  {
    key: "protection-solaire",
    label: "Protection solaire (SPF)",
    words: ["solaire", "protection solaire", "crème solaire", "spf", "écran total"],
    test: /(\bspf\b|spf ?\d|solaire|ecran|anthelios|photoderm|capital soleil|ip ?50)/,
  },
  {
    key: "levres",
    label: "Soins des lèvres : baumes, sticks",
    words: ["lèvres", "levres", "baume lèvres", "stick lèvres", "lèvres sèches"],
    test: /(levres?|stick lev|baume lev|labial|lipikar stick|cicalfate levres)/,
  },
  {
    key: "transit-laxatifs-doux",
    label: "Transit : fibres, laxatifs doux, pruneaux",
    words: ["constipation", "transit", "fibres", "laxatif doux", "psyllium", "ispaghul"],
    test: /(transit|psyllium|ispaghul|fibres?|constipation|pruneau|macrogol|lactulose|transipeg|forlax|movicol|microlax|normacol|spagulax|dulcosoft)/,
  },
  {
    key: "anti-moustiques",
    label: "Anti-moustiques et piqûres",
    words: ["moustique", "moustiques", "répulsif", "anti-moustique", "piqûres"],
    test: /(moustique|repulsif|insect|pique|insect ecran|cinq sur cinq|5 sur 5|apaisyl|parazeet)/,
  },
];

/** Les gammes qui répondent à ce qu'on a tapé : par leurs mots, ou parce que ce qu'on a tapé est l'intitulé d'un de leurs produits. */
export function gammesFor(query: string): Gamme[] {
  const q = normalizeProductText(query);
  if (q.length < 3) return [];
  return GAMMES.filter((gamme) => gamme.words.some((word) => { const w = normalizeProductText(word); return w.includes(q) || q.includes(w); }) || inGamme(gamme, q));
}

/** Ce produit (intitulé et marque) est-il de cette gamme ? */
export function inGamme(gamme: Gamme, productText: string): boolean {
  const text = normalizeProductText(productText);
  return gamme.test.test(text) && !(gamme.not?.test(text) ?? false);
}
