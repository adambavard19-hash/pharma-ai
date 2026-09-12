import type { ProductCategoryCode } from "@/core/ai/types";
import { ADVICE_RULES } from "@/core/ai/engines/advice";

/**
 * Comprendre ce qu'un produit EST, dans les termes que le moteur de conseil
 * comprend.
 *
 * Le moteur rapproche un besoin (« tolérance digestive pendant
 * l'antibiothérapie ») d'un produit par sa catégorie et par un vocabulaire
 * fermé — celui des règles de conseil. Un fichier de stock, lui, dit « ULTRA-
 * LEVURE 200MG GELULE B/30 » ou « PHYSIOMER SPRAY 135ML » : sans traduction,
 * aucune de ces lignes ne rejoint jamais un besoin, et le comptoir affiche
 * « rien à proposer » devant un rayon plein.
 *
 * Ce module fait cette traduction sans modèle, par dictionnaire : c'est la
 * première passe, déterministe, testée, qui couvre l'essentiel d'un rayon de
 * conseil. Le modèle n'intervient qu'ensuite, sur ce que le dictionnaire n'a
 * pas su ranger, et ne peut choisir QUE dans ce même vocabulaire.
 */

/** Le vocabulaire fermé : toutes les étiquettes que les règles de conseil connaissent. */
export const ADVICE_VOCABULARY: readonly string[] = [
  ...new Set(ADVICE_RULES.flatMap((rule) => rule.matchingTags.map((tag) => tag.toLowerCase()))),
].sort();

export const CLASSIFICATION_SOURCES = ["HEURISTIC", "AI", "PHARMACIST"] as const;
export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number];

export type ProductClassificationResult = {
  category: ProductCategoryCode;
  /** Étiquettes prises dans `ADVICE_VOCABULARY`. Vide : le produit est rangé mais ne répond à aucune règle. */
  tags: string[];
  confidence: number;
  source: ClassificationSource;
  /** Règles de conseil que ce produit peut servir. Pour l'explication, jamais pour décider. */
  ruleKeys: string[];
};

export function normalizeProductText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Pattern = {
  test: RegExp;
  category: ProductCategoryCode;
  /** Étiquettes du vocabulaire des règles. */
  tags: string[];
  ruleKeys: string[];
  confidence: number;
};

/**
 * Le dictionnaire. Chaque motif est testé sur le texte normalisé (minuscules,
 * sans accents, ponctuation remplacée par des espaces). Les motifs des règles
 * de conseil viennent d'abord ; les catégories génériques ensuite.
 *
 * Les marques citées sont des exemples courants du rayon de conseil français ;
 * elles ne sont ni exhaustives ni recommandées : elles servent à reconnaître
 * ce que le titulaire a déjà en rayon.
 */
const PATTERNS: Pattern[] = [
  {
    test: /\b(probioti|prebioti|levure|ultra ?levure|lactobacil|bifidobact|saccharomyces|flore intestinale|ferments? lactiques?|lactibiane|ergyphilus|smebiocta|bion ?3|probiolog|lactéol|lacteol|enterogermina|alflorex|imgalt)/,
    category: "PROBIOTIQUES",
    tags: ["probiotique", "flore intestinale", "tolérance digestive"],
    ruleKeys: ["digestive-tolerance-antibiotics"],
    confidence: 0.9,
  },
  {
    test: /\b(physiomer|sterimar|prorhinel|humer|rhinomer|marimer|eau de mer|serum physio|serum phy|physiologique|lavage nasal|spray nasal|solution nasale|hygiene nasale|dosettes? nasales?|nasal|rhino ?horn|respimer)/,
    category: "SOINS",
    tags: ["nez", "nasal", "lavage", "eau de mer", "orl", "spray nasal"],
    ruleKeys: ["nasal-hygiene-orl"],
    confidence: 0.88,
  },
  {
    test: /\b(pastilles?|gorge|strepsils|drill|lysopaine|lysopaïne|humex mal de gorge|maxilase|hexaspray|colludol|propolis|spray gorge|angispray|gommes? ?gorge)/,
    category: "SOINS",
    tags: ["gorge", "irritation", "orl", "pastilles", "miel"],
    ruleKeys: ["sore-throat-orl", "cough-throat-comfort"],
    confidence: 0.82,
  },
  {
    // Le miel seul : un adoucissant de la gorge, pas une pastille.
    test: /\b(miel de thym|miel de manuka|\bmiel\b)/,
    category: "SOINS",
    tags: ["gorge", "miel", "irritation", "orl"],
    ruleKeys: ["sore-throat-orl", "cough-throat-comfort"],
    confidence: 0.75,
  },
  {
    test: /\b(sirop (pour la |contre la )?toux|toux|antitussif|prospan|helicidine|bronchokod|thym|lierre|hedera|petit houx|drosera|toplexil|humex toux|clarix)/,
    category: "SOINS",
    tags: ["toux", "gorge", "miel", "irritation"],
    ruleKeys: ["cough-throat-comfort"],
    confidence: 0.8,
  },
  {
    test: /\b(thermometre|thermomètre|thermo ?flash|thermometer)/,
    category: "DISPOSITIFS_MEDICAUX",
    tags: ["thermomètre", "fièvre", "mesure"],
    ruleKeys: ["fever-thermometer"],
    confidence: 0.95,
  },
  {
    test: /\b(rehydratation|réhydratation|adiaril|viatol|hydranova|sels? de rehydratation|\bsro\b|\bors\b|solution de rehydratation|picolite|novalac hydranova)/,
    category: "NUTRITION",
    tags: ["réhydratation", "diarrhée", "sels minéraux"],
    ruleKeys: ["rehydration-digestive"],
    confidence: 0.9,
  },
  {
    test: /\b(collyre|larmes? artificielles?|lavage oculaire|dacryoserum|dacryo|hylo|optone|innoxa|vismed|thealoz|yeux|oculaire|ophtalmi|opticalm|unidoses? (ophtalmiques?|yeux))/,
    category: "SOINS",
    tags: ["yeux", "oculaire", "collyre", "lavage", "larmes"],
    ruleKeys: ["eye-irritation-allergy"],
    confidence: 0.86,
  },
  {
    test: /\b(bouche seche|bouche sèche|artisial|aequasyal|xerostom|bioxtra|biotene|salive|substitut salivaire|hydratant buccal)/,
    category: "HYGIENE",
    tags: ["bouche sèche", "salive", "hygiène bucco-dentaire"],
    ruleKeys: ["dry-mouth-hygiene"],
    confidence: 0.88,
  },
  {
    test: /\b(bain de bouche|bains? de bouche|eludril|paroex|alodont|listerine|elgydium bain|meridol bain|rincage buccal|rinçage buccal|solution buccale|antiseptique buccal|chlorhexidine bain)/,
    category: "HYGIENE",
    tags: ["bain de bouche", "rinçage", "bucco-dentaire"],
    ruleKeys: ["mouth-rinse-inhaled-corticosteroid"],
    confidence: 0.9,
  },
  {
    test: /\b(magnesium|magnésium|mag ?2|magnevie|magnespasmyl|magne ?b6|magnesium marin)/,
    category: "MAGNESIUM",
    tags: ["magnésium", "fatigue", "crampes", "vitamine b6"],
    ruleKeys: ["magnesium-fatigue"],
    confidence: 0.9,
  },
  {
    test: /\b(vitamine? ?d ?3?\b|vit ?d3?\b|uvedose|zymad|zyma ?d\b|cholecalciferol|colecalciferol|adrigyl|sterogyl|dedrogyl)/,
    category: "VITAMINES",
    tags: ["vitamine d", "os", "calcium"],
    ruleKeys: ["vitamin-d-elderly"],
    confidence: 0.88,
  },
  {
    test: /\b(gaviscon|maalox|rennie|gelox|moxydar|antiacide|anti ?acide|brulures? d ?estomac|estomac|gastri|reflux|smecta|alginate|phosphalugel|xolaam)/,
    category: "SOINS",
    tags: ["confort gastrique", "estomac", "digestion"],
    ruleKeys: ["gastric-protection-nsaid"],
    confidence: 0.85,
  },
  {
    test: /\b(transit|fibres|psyllium|ispaghul|forlax|macrogol|movicol|transipeg|lactulose|duphalac|constipation|pruneau|son d ?avoine|laxatif)/,
    category: "NUTRITION",
    tags: ["transit", "fibres", "confort digestif"],
    ruleKeys: ["iron-absorption-support"],
    confidence: 0.85,
  },
  {
    test: /\b(emollient|émollient|hydratant|creme hydratante|lait hydratant|baume|dexeryl|atoderm|lipikar|xemose|xeracalm|topialyse|peau seche|peaux? seches?|peau sensible|peaux? sensibles?|cold cream|cicalfate|cicaplast|apaisant|relipidant|nutritive)/,
    category: "DERMOCOSMETIQUE",
    tags: ["hydratation", "peau sensible", "émollient", "apaisant"],
    ruleKeys: ["hydration-dermato-topical"],
    confidence: 0.82,
  },
  {
    test: /\b(spf ?\d*\b|solaire|photoprotect|ecran total|anthelios|photoderm|sun ?screen|indice 50|ip ?50\b|\buv\b|apres ?soleil)/,
    category: "DERMOCOSMETIQUE",
    tags: ["protection solaire", "spf", "photoprotection"],
    ruleKeys: ["sun-photosensitivity"],
    confidence: 0.9,
  },
  // Catégories génériques : le produit est rangé, mais ne sert aucune règle.
  { test: /\b(vitamine|vit ?c|vit ?b|multivitamin|berocca|supradyn|acide folique|complexe vitamin)/, category: "VITAMINES", tags: [], ruleKeys: [], confidence: 0.7 },
  { test: /(\bfer\b|\bzinc\b|selenium|\bcalcium\b|\biode\b|potassium|oligo ?element|mineraux)/, category: "MINERAUX", tags: [], ruleKeys: [], confidence: 0.6 },
  { test: /\b(dentifrice|brosse a dents|fil dentaire|shampo|savon|gel douche|deodorant|déodorant|hygiene intime|coton|lingettes?|mouchoirs?|gel hydroalcoolique|solution hydroalcoolique)/, category: "HYGIENE", tags: [], ruleKeys: [], confidence: 0.7 },
  { test: /\b(pansements?|compresses?|sparadrap|bande|seringues?|poires? (nasale|de lavage|auriculaire)|tensiometre|tensiomètre|glucometre|bandelettes?|lancettes?|masques?|gants?|orthese|orthèse|attelle|bas de contention|chaussettes? de contention|test antigenique|autotest|inhalateur|aerosol|pilulier)/, category: "DISPOSITIFS_MEDICAUX", tags: [], ruleKeys: [], confidence: 0.75 },
  { test: /\b(tisane|infusion|huile essentielle|huiles essentielles|plante|phyto|arkogelules|arkopharma|elusanes|valeriane|passiflore|millepertuis|harpagophytum|gelules? de plantes?)/, category: "PHYTOTHERAPIE", tags: [], ruleKeys: [], confidence: 0.7 },
  { test: /\b(complement alimentaire|proteine|lait infantile|lait \d|nutrition|dietetique|diététique|\bbarre\b|boisson|substitut de repas)/, category: "NUTRITION", tags: [], ruleKeys: [], confidence: 0.6 },
  { test: /\b(creme|crème|serum|sérum|visage|corps|lotion|demaquillant|démaquillant|anti ?age|anti ?rides|eau micellaire|contour des yeux|fluide|masque visage|gommage)/, category: "DERMOCOSMETIQUE", tags: [], ruleKeys: [], confidence: 0.55 },
  { test: /\b(anti ?moustiques?|repulsif|répulsif|poux|anti ?poux|apres ?piqure|piqures?|coup de froid|hivernal)/, category: "SAISONNIER", tags: [], ruleKeys: [], confidence: 0.6 },
];

/**
 * Substances actives du catalogue national qui désignent sans ambiguïté un
 * médicament de conseil servant une règle. La forme ou la voie affine : un
 * chlorure de sodium n'est « nasal » que s'il est en spray ou en dosette
 * nasale.
 */
const SUBSTANCE_PATTERNS: (Pattern & { requires?: RegExp })[] = [
  { test: /saccharomyces|lactobacillus|bifidobacterium|bacillus clausii|levure/, category: "PROBIOTIQUES", tags: ["probiotique", "flore intestinale", "tolérance digestive"], ruleKeys: ["digestive-tolerance-antibiotics"], confidence: 0.95 },
  { test: /chlorure de sodium|sodium chlorure|eau de mer/, requires: /nasal|nez|spray|pulverisation|dosette|unidose|rhin/, category: "SOINS", tags: ["nez", "nasal", "lavage", "eau de mer", "orl", "spray nasal"], ruleKeys: ["nasal-hygiene-orl"], confidence: 0.85 },
  { test: /chlorhexidine|hexetidine|cetylpyridinium/, requires: /bain de bouche|buccal|bouche|gargarisme/, category: "HYGIENE", tags: ["bain de bouche", "rinçage", "bucco-dentaire"], ruleKeys: ["mouth-rinse-inhaled-corticosteroid"], confidence: 0.9 },
  { test: /lidocaine|tetracaine|amylmetacresol|alcool dichlorobenzylique|benzalkonium|hexamidine/, requires: /pastille|gorge|collutoire|spray|comprime a sucer|comprimé à sucer|tablette/, category: "SOINS", tags: ["gorge", "irritation", "orl", "pastilles"], ruleKeys: ["sore-throat-orl"], confidence: 0.85 },
  { test: /dextromethorphane|oxomemazine|pholcodine|helicidine|hedera helix|lierre|thym|carbocisteine|acetylcysteine|ambroxol/, requires: /sirop|toux|buvable/, category: "SOINS", tags: ["toux", "gorge", "irritation"], ruleKeys: ["cough-throat-comfort"], confidence: 0.8 },
  { test: /glucose.*chlorure de sodium|citrate.*glucose|rehydratation|réhydratation/, category: "NUTRITION", tags: ["réhydratation", "diarrhée", "sels minéraux"], ruleKeys: ["rehydration-digestive"], confidence: 0.9 },
  { test: /hyaluronate|hypromellose|carbomere|carbomère|povidone|acide borique|borate/, requires: /collyre|ophtalm|oculaire|yeux|unidose/, category: "SOINS", tags: ["yeux", "oculaire", "collyre", "lavage", "larmes"], ruleKeys: ["eye-irritation-allergy"], confidence: 0.85 },
  { test: /magnesium|magnésium/, category: "MAGNESIUM", tags: ["magnésium", "fatigue", "crampes", "vitamine b6"], ruleKeys: ["magnesium-fatigue"], confidence: 0.9 },
  { test: /colecalciferol|cholecalciferol|ergocalciferol|calcifediol/, category: "VITAMINES", tags: ["vitamine d", "os", "calcium"], ruleKeys: ["vitamin-d-elderly"], confidence: 0.9 },
  { test: /alginate|hydroxyde d aluminium|hydroxyde de magnesium|carbonate de calcium|magaldrate|diosmectite|hydrotalcite/, category: "SOINS", tags: ["confort gastrique", "estomac", "digestion"], ruleKeys: ["gastric-protection-nsaid"], confidence: 0.85 },
  { test: /macrogol|lactulose|ispaghul|psyllium|sorbitol|lactitol|son de ble/, category: "NUTRITION", tags: ["transit", "fibres", "confort digestif"], ruleKeys: ["iron-absorption-support"], confidence: 0.85 },
];

/** Le meilleur motif du dictionnaire pour un nom de produit, ou `null`. */
export function classifyProductByName(
  name: string,
  extra: { brand?: string | null; description?: string | null } = {},
): ProductClassificationResult | null {
  const text = normalizeProductText([name, extra.brand ?? "", extra.description ?? ""].join(" "));
  if (!text) return null;

  let best: Pattern | null = null;
  for (const pattern of PATTERNS) {
    if (!pattern.test.test(text)) continue;
    // Un motif qui sert une règle prime sur une catégorie générique ; à
    // égalité, la confiance départage.
    const better =
      !best ||
      (pattern.tags.length > 0 && best.tags.length === 0) ||
      (pattern.tags.length > 0 === best.tags.length > 0 && pattern.confidence > best.confidence);
    if (better) best = pattern;
  }
  if (!best) return null;
  return { category: best.category, tags: [...best.tags], confidence: best.confidence, source: "HEURISTIC", ruleKeys: [...best.ruleKeys] };
}

/**
 * Un médicament du catalogue national, vu par ses substances et sa forme. Le
 * nom commercial est aussi passé au dictionnaire des produits : « ULTRA-
 * LEVURE » se reconnaît au nom comme à la substance.
 */
export function classifyNationalDrug(input: {
  name: string;
  substances: string[];
  form?: string | null;
  routes?: string[];
  label?: string | null;
}): ProductClassificationResult | null {
  const substances = normalizeProductText(input.substances.join(" ; "));
  const context = normalizeProductText([input.name, input.form ?? "", input.label ?? "", ...(input.routes ?? [])].join(" "));

  let best: (Pattern & { requires?: RegExp }) | null = null;
  for (const pattern of SUBSTANCE_PATTERNS) {
    if (!pattern.test.test(substances) && !pattern.test.test(context)) continue;
    if (pattern.requires && !pattern.requires.test(context)) continue;
    if (!best || pattern.confidence > best.confidence) best = pattern;
  }
  if (best) return { category: best.category, tags: [...best.tags], confidence: best.confidence, source: "HEURISTIC", ruleKeys: [...best.ruleKeys] };

  return classifyProductByName(input.name, { description: input.label ?? null });
}

/** Les étiquettes d'un produit ne sont retenues que si elles appartiennent au vocabulaire fermé. */
export function restrictToVocabulary(tags: string[]): string[] {
  const allowed = new Set(ADVICE_VOCABULARY);
  return [...new Set(tags.map((tag) => tag.toLowerCase().trim()).filter((tag) => allowed.has(tag)))];
}

/** Les règles que ce jeu d'étiquettes et cette catégorie peuvent servir. */
export function rulesServedBy(category: ProductCategoryCode, tags: string[]): string[] {
  const set = new Set(tags.map((t) => t.toLowerCase()));
  return ADVICE_RULES.filter((rule) => rule.category === category || rule.matchingTags.some((tag) => set.has(tag.toLowerCase()))).map((rule) => rule.key);
}
