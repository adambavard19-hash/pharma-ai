import { DEMO_PRODUCTS, type DemoProduct } from "../../../prisma/seed-data/products";

/**
 * Le rayon et le stock médicament de l'officine de démonstration.
 *
 * Les produits de parapharmacie reprennent le catalogue fictif de la démo
 * historique (marques inventées, prix inventés) et le complètent : de quoi
 * servir chaque règle de conseil que la démonstration fait jouer. Les
 * médicaments sont de VRAIES références du catalogue national (BDPM), cherchées
 * par leur nom au moment de l'installation : le moteur lit donc, pour eux, les
 * mêmes substances, formes et conditions de prescription que chez un client.
 */

export type { DemoProduct };

const extra = (product: Omit<DemoProduct, "vatRate" | "alertThreshold"> & { vatRate?: number; alertThreshold?: number }): DemoProduct => ({
  vatRate: 20,
  alertThreshold: 4,
  ...product,
});

/** Ce que le catalogue historique ne contient pas, et que les scénarios font jouer. */
export const DEMO_EXTRA_PRODUCTS: DemoProduct[] = [
  extra({ slug: "poche-chaud-froid", name: "Poche chaud-froid réutilisable", brand: "Medipro", category: "DISPOSITIFS_MEDICAUX", subCategory: "Douleurs musculaires", ean: "3400900000901", description: "Poche gel à chauffer ou à refroidir, pour les douleurs musculaires et articulaires.", commercialClaims: ["Chaud ou froid selon la douleur"], precautions: ["Ne pas appliquer directement sur la peau."], matchingTags: [], contraindications: [], purchasePriceCents: 520, salePriceCents: 1290, quantity: 16, location: "Linéaire D1" }),
  extra({ slug: "tensiometre-bras", name: "Tensiomètre électronique au bras", brand: "Medipro", category: "DISPOSITIFS_MEDICAUX", subCategory: "Automesure", ean: "3400900000902", description: "Tensiomètre au bras, brassard standard, mémoire des mesures.", commercialClaims: ["Automesure à domicile"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 2490, salePriceCents: 4990, quantity: 6, vatRate: 20, location: "Vitrine 2" }),
  extra({ slug: "chambre-inhalation", name: "Chambre d'inhalation adulte", brand: "Medipro", category: "DISPOSITIFS_MEDICAUX", subCategory: "Respiratoire", ean: "3400900000903", description: "Chambre d'inhalation pour aérosol-doseur, valve anti-retour.", commercialClaims: ["Améliore la délivrance du médicament"], precautions: ["Rincer à l'eau tiède, laisser sécher à l'air."], matchingTags: [], contraindications: [], purchasePriceCents: 790, salePriceCents: 1890, quantity: 9, location: "Vitrine 2" }),
  extra({ slug: "peigne-poux", name: "Peigne anti-poux métal", brand: "Medipro", category: "DISPOSITIFS_MEDICAUX", subCategory: "Parasites", ean: "3400900000904", description: "Peigne à dents fines en métal pour retirer poux et lentes.", commercialClaims: ["Retire poux et lentes"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 450, salePriceCents: 1090, quantity: 11, location: "Linéaire D2" }),
  extra({ slug: "collecteur-aiguilles", name: "Collecteur d'aiguilles 1 litre", brand: "Medipro", category: "DISPOSITIFS_MEDICAUX", subCategory: "Injections", ean: "3400900000905", description: "Boîte à aiguilles à fermeture sécurisée pour les injections à domicile.", commercialClaims: ["Élimination sécurisée des aiguilles"], precautions: ["Ne pas remplir au-delà du trait."], matchingTags: [], contraindications: [], purchasePriceCents: 190, salePriceCents: 490, quantity: 20, vatRate: 5.5, location: "Linéaire D2" }),
  extra({ slug: "serum-physiologique", name: "Sérum physiologique unidoses x40", brand: "Puréa", category: "SOINS", subCategory: "Yeux et nez", ean: "3400900000906", description: "Unidoses de sérum physiologique pour le lavage des yeux et du nez.", commercialClaims: ["Lavage doux des yeux et du nez"], precautions: ["Une unidose par usage."], matchingTags: [], contraindications: [], purchasePriceCents: 210, salePriceCents: 590, quantity: 52, location: "Linéaire B1" }),
  extra({ slug: "larmes-hyaluronate", name: "Larmes artificielles hyaluronate sans conservateur", brand: "Oralis", category: "SOINS", subCategory: "Yeux secs", ean: "3400900000907", description: "Collyre lubrifiant sans conservateur pour yeux secs et fatigués par les écrans.", commercialClaims: ["Lubrifie et hydrate la surface de l'œil"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 640, salePriceCents: 1390, quantity: 18, vatRate: 10, location: "Linéaire B2" }),
  extra({ slug: "lingettes-paupieres", name: "Lingettes hygiène des paupières", brand: "Oralis", category: "SOINS", subCategory: "Yeux secs", ean: "3400900000908", description: "Lingettes stériles pour nettoyer les paupières et les cils.", commercialClaims: ["Nettoie les bords des paupières"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 480, salePriceCents: 1190, quantity: 14, location: "Linéaire B2" }),
  extra({ slug: "spray-nasal-hypertonique", name: "Spray nasal hypertonique décongestion", brand: "Puréa", category: "SOINS", subCategory: "ORL", ean: "3400900000909", description: "Eau de mer hypertonique pour dégager le nez bouché.", commercialClaims: ["Aide à décongestionner le nez"], precautions: ["Déconseillé chez le nourrisson."], matchingTags: [], contraindications: [], purchasePriceCents: 560, salePriceCents: 1290, quantity: 24, location: "Linéaire B1" }),
  extra({ slug: "sirop-toux-miel", name: "Sirop toux irritante miel-thym", brand: "Naturéo", category: "SOINS", subCategory: "Toux", ean: "3400900000910", description: "Sirop adoucissant au miel et au thym, pour la toux irritante.", commercialClaims: ["Adoucit la gorge et apaise la toux"], precautions: ["Ne pas donner aux enfants de moins d'un an (miel)."], matchingTags: [], contraindications: [], purchasePriceCents: 480, salePriceCents: 1190, quantity: 21, location: "Linéaire B1" }),
  extra({ slug: "huiles-bronches", name: "Complexe huiles essentielles confort des bronches", brand: "Naturéo", category: "PHYTOTHERAPIE", subCategory: "Respiratoire", ean: "3400900000911", description: "Association d'huiles essentielles pour le confort respiratoire, en friction.", commercialClaims: ["Soutient le confort respiratoire"], precautions: ["Réservé à l'adulte. Ne pas utiliser pendant la grossesse ni l'allaitement."], matchingTags: [], contraindications: ["grossesse", "allaitement", "enfant de moins de 6 ans", "épilepsie"], purchasePriceCents: 690, salePriceCents: 1590, quantity: 12, location: "Linéaire C2" }),
  extra({ slug: "patch-bouton-fievre", name: "Patchs bouton de fièvre x15", brand: "Dermalia", category: "SOINS", subCategory: "Herpès", ean: "3400900000912", description: "Patchs hydrocolloïdes invisibles pour le bouton de fièvre.", commercialClaims: ["Protège la lésion et limite la contamination"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 520, salePriceCents: 1190, quantity: 17, vatRate: 10, location: "Linéaire B3" }),
  extra({ slug: "antiseptique-cutane", name: "Antiseptique cutané chlorhexidine", brand: "Puréa", category: "SOINS", subCategory: "Antisepsie", ean: "3400900000913", description: "Solution antiseptique pour la peau lésée, flacon pompe.", commercialClaims: ["Désinfecte la peau abîmée"], precautions: ["Usage externe."], matchingTags: [], contraindications: [], purchasePriceCents: 310, salePriceCents: 790, quantity: 27, location: "Linéaire B3" }),
  extra({ slug: "creme-cicatrisante", name: "Crème réparatrice apaisante cicatrisante", brand: "Dermalia", category: "DERMOCOSMETIQUE", subCategory: "Réparation", ean: "3400900000914", description: "Soin réparateur apaisant pour les peaux irritées ou en cicatrisation.", commercialClaims: ["Aide la peau à se réparer"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 690, salePriceCents: 1590, quantity: 22, vatRate: 10, location: "Linéaire A3" }),
  extra({ slug: "lysine-1000", name: "L-Lysine 1000 mg comprimés", brand: "Vitalys", category: "NUTRITION", subCategory: "Acides aminés", ean: "3400900000915", description: "Complément de L-Lysine, cure de 30 jours.", commercialClaims: ["Complément alimentaire à base de L-Lysine"], precautions: ["Ne se substitue pas au traitement prescrit."], matchingTags: [], contraindications: [], purchasePriceCents: 790, salePriceCents: 1790, quantity: 0, vatRate: 5.5, location: "Linéaire C1" }),
  extra({ slug: "gel-nettoyant-doux", name: "Gel nettoyant visage doux sans savon", brand: "Dermalia", category: "DERMOCOSMETIQUE", subCategory: "Nettoyants", ean: "3400900000916", description: "Gel lavant visage sans savon pour peaux sèches et sensibles.", commercialClaims: ["Nettoie sans dessécher"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 580, salePriceCents: 1390, quantity: 31, location: "Linéaire A3" }),
  extra({ slug: "creme-pieds-uree", name: "Crème pieds secs à l'urée 10 %", brand: "Dermalia", category: "SOINS", subCategory: "Pieds", ean: "3400900000917", description: "Crème hydratante à l'urée pour les pieds secs et fragilisés.", commercialClaims: ["Hydrate et assouplit les pieds secs"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 530, salePriceCents: 1290, quantity: 19, location: "Linéaire A4" }),
  extra({ slug: "multivitamines-immunite", name: "Multivitamines et minéraux défenses immunitaires", brand: "Solvia", category: "VITAMINES", subCategory: "Multivitamines", ean: "3400900000918", description: "Multivitamines et minéraux pour soutenir les défenses, cure de 30 jours.", commercialClaims: ["Contribue au fonctionnement normal du système immunitaire"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 790, salePriceCents: 1890, quantity: 26, vatRate: 5.5, location: "Linéaire C1" }),
  extra({ slug: "gel-intime-flore", name: "Gel lavant intime doux", brand: "Puréa", category: "HYGIENE", subCategory: "Toilette intime", ean: "3400900000919", description: "Soin lavant pour l'hygiène intime, pH adapté, sans savon.", commercialClaims: ["Respecte l'équilibre de la zone intime"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 620, salePriceCents: 990, quantity: 23, location: "Linéaire A4" }),
  extra({ slug: "sucre-rapide", name: "Sucre rapide en sticks resucrage", brand: "Vitalys", category: "NUTRITION", subCategory: "Resucrage", ean: "3400900000920", description: "Sticks de glucose à action rapide en cas de malaise hypoglycémique.", commercialClaims: ["Sucre rapide, à emporter partout"], precautions: [], matchingTags: [], contraindications: [], purchasePriceCents: 190, salePriceCents: 490, quantity: 35, vatRate: 5.5, location: "Linéaire C1" }),
];

/** Le rayon complet de la démonstration : la base historique + les compléments. */
/**
 * Les étiquettes d'un produit quand le dictionnaire d'usage en poserait de trop : « hygiène » seul, dans
 * « hygiène intime » ou « hygiène bucco-dentaire », ferait aussi servir ces produits à la règle « hygiène des mains »
 * (l'appariement lit les mots, pas les expressions).
 */
export const DEMO_TAG_OVERRIDES: Record<string, string[]> = {
  "gel-intime-flore": ["flore vaginale"],
  "spray-bouche-seche": ["bouche sèche", "salive", "bucco-dentaire", "hydratation"],
};

/** Ajustements de prix sur le catalogue historique, pour que la démonstration tienne la route : un gel hydroalcoolique de poche à 2,90 € ne ferait pas une proposition crédible. */
const PRICE_ADJUSTMENTS: Record<string, Pick<DemoProduct, "salePriceCents" | "purchasePriceCents">> = {
  "gel-hydroalcoolique": { salePriceCents: 590, purchasePriceCents: 190 },
};

export const DEMO_SHELF: DemoProduct[] = [...DEMO_PRODUCTS.map((product) => ({ ...product, ...(PRICE_ADJUSTMENTS[product.slug] ?? {}) })), ...DEMO_EXTRA_PRODUCTS];

/**
 * Les vigilances que le pharmacien a déclarées sur ses produits (population, niveau, note).
 * Elles s'affichent sur la carte de conseil quand le patient est concerné.
 */
export const DEMO_VIGILANCES: { slug: string; population: string; level: "CONTRAINDICATION" | "PHARMACIST_VALIDATION" | "CAUTION" | "INFO"; note: string }[] = [
  { slug: "huiles-bronches", population: "PREGNANCY", level: "CONTRAINDICATION", note: "Huiles essentielles déconseillées pendant la grossesse." },
  { slug: "huiles-bronches", population: "BREASTFEEDING", level: "CONTRAINDICATION", note: "Huiles essentielles déconseillées pendant l'allaitement." },
  { slug: "huiles-bronches", population: "CHILD", level: "CONTRAINDICATION", note: "Réservé à l'adulte." },
  { slug: "huiles-bronches", population: "EPILEPSY", level: "CAUTION", note: "Certaines huiles essentielles abaissent le seuil épileptogène." },
  { slug: "huiles-bronches", population: "ASTHMA", level: "CAUTION", note: "Peut provoquer un bronchospasme : demander l'avis du pharmacien." },
  { slug: "spray-nasal-hypertonique", population: "CHILD", level: "CAUTION", note: "Déconseillé chez le nourrisson." },
  { slug: "sirop-toux-miel", population: "CHILD", level: "CAUTION", note: "Pas de miel avant un an." },
];

/**
 * Un médicament du catalogue national, cherché par le début de son nom exact.
 * `classification` est ce que le moteur saurait par ailleurs de cette boîte
 * (substance, code ATC, classe) : il est posé une fois dans le cache de
 * classification, de sorte que la démonstration n'appelle jamais de modèle.
 */
export type DemoDrug = {
  key: string;
  /** Le début du nom de la spécialité, tel que le catalogue national l'écrit. */
  search: string;
  quantity: number;
  /** Le prix pratiqué, en centimes, quand le catalogue n'en donne pas. */
  priceCents?: number;
  classification?: { substance: string; atcCode: string; therapeuticClass: string; sideEffects: string[] };
};

const drug = (key: string, search: string, quantity: number, classification?: DemoDrug["classification"], priceCents?: number): DemoDrug => ({ key, search, quantity, classification, priceCents });

export const DEMO_DRUGS: DemoDrug[] = [
  // Antibiotiques
  drug("augmentin-adulte", "AUGMENTIN 500 mg/62,5 mg, comprimé pelliculé", 14, { substance: "amoxicilline + acide clavulanique", atcCode: "J01CR02", therapeuticClass: "Antibiotique", sideEffects: ["diarrhée", "troubles digestifs", "nausées"] }),
  drug("augmentin-enfant", "AUGMENTIN 100 mg/12,50 mg par ml ENFANTS", 8, { substance: "amoxicilline + acide clavulanique", atcCode: "J01CR02", therapeuticClass: "Antibiotique", sideEffects: ["diarrhée", "troubles digestifs"] }),
  drug("azithromycine", "AZITHROMYCINE ARROW LAB 250 mg, comprimé pelliculé", 10, { substance: "azithromycine", atcCode: "J01FA10", therapeuticClass: "Antibiotique", sideEffects: ["diarrhée", "nausées", "douleurs abdominales"] }),
  // Antalgiques et anti-inflammatoires
  drug("doliprane-1000", "DOLIPRANE 1000 mg, comprimé", 60, { substance: "paracétamol", atcCode: "N02BE01", therapeuticClass: "Antalgique", sideEffects: [] }),
  drug("doliprane-suppo", "DOLIPRANE 100 mg, suppositoire sécable", 12, { substance: "paracétamol", atcCode: "N02BE01", therapeuticClass: "Antalgique", sideEffects: [] }),
  drug("ibuprofene-400", "IBUPROFENE ARROW 400 mg, comprimé pelliculé", 28, { substance: "ibuprofène", atcCode: "M01AE01", therapeuticClass: "Anti-inflammatoire non stéroïdien", sideEffects: ["gastralgie", "troubles gastriques"] }),
  drug("tramadol-50", "TRAMADOL ARROW 50 mg, comprimé", 9, { substance: "tramadol", atcCode: "N02AX02", therapeuticClass: "Antalgique opioïde", sideEffects: ["constipation", "somnolence", "nausées"] }),
  drug("ixprim", "IXPRIM 37,5 mg/325 mg, comprimé pelliculé", 7, { substance: "tramadol + paracétamol", atcCode: "N02AX52", therapeuticClass: "Antalgique opioïde", sideEffects: ["constipation", "somnolence"] }),
  drug("spasfon", "SPASFON, comprimé enrobé", 22, { substance: "phloroglucinol", atcCode: "A03AX12", therapeuticClass: "Antispasmodique", sideEffects: [] }),
  // Allergie, ORL, respiratoire
  drug("cetirizine", "CETIRIZINE BIOGARAN 10 mg, comprimé pelliculé sécable", 30, { substance: "cétirizine", atcCode: "R06AE07", therapeuticClass: "Antihistaminique", sideEffects: ["somnolence", "bouche sèche"] }),
  drug("xyzall", "XYZALL 5 mg, comprimé pelliculé", 12, { substance: "lévocétirizine", atcCode: "R06AE09", therapeuticClass: "Antihistaminique", sideEffects: ["somnolence", "bouche sèche"] }),
  drug("nasonex", "NASONEX 50 microgrammes/dose, suspension pour pulvérisation nasale", 6, { substance: "mométasone", atcCode: "R01AD09", therapeuticClass: "Corticoïde nasal", sideEffects: ["sécheresse nasale"] }),
  drug("ventoline", "VENTOLINE 100 microgrammes/dose, suspension pour inhalation en flacon pressurisé", 10, { substance: "salbutamol", atcCode: "R03AC02", therapeuticClass: "Bronchodilatateur", sideEffects: ["tremblements", "palpitations"] }),
  drug("flixotide", "FLIXOTIDE 125 microgrammes/dose, suspension pour inhalation en flacon pressurisé", 6, { substance: "fluticasone", atcCode: "R03BA05", therapeuticClass: "Corticoïde inhalé", sideEffects: ["mycose buccale", "enrouement"] }),
  // Cardiologie, métabolisme, digestif, thyroïde
  drug("amlodipine", "AMLODIPINE BIOGARAN 5 mg, gélule", 24, { substance: "amlodipine", atcCode: "C08CA01", therapeuticClass: "Antihypertenseur", sideEffects: ["œdèmes", "céphalées"] }),
  drug("ramipril", "RAMIPRIL BIOGARAN 10 mg, comprimé sécable", 20, { substance: "ramipril", atcCode: "C09AA05", therapeuticClass: "Antihypertenseur", sideEffects: ["toux sèche", "vertiges"] }),
  drug("atorvastatine", "ATORVASTATINE BIOGARAN 20 mg, comprimé pelliculé", 18, { substance: "atorvastatine", atcCode: "C10AA05", therapeuticClass: "Hypolipémiant", sideEffects: ["douleurs musculaires"] }),
  drug("kardegic", "KARDEGIC 75 mg, poudre pour solution buvable en sachet-dose", 15, { substance: "acétylsalicylate de lysine", atcCode: "B01AC06", therapeuticClass: "Antiagrégant plaquettaire", sideEffects: ["troubles gastriques", "saignements"] }),
  drug("metformine", "METFORMINE BIOGARAN 1000 mg, comprimé pelliculé", 26, { substance: "metformine", atcCode: "A10BA02", therapeuticClass: "Antidiabétique", sideEffects: ["diarrhée", "nausées", "troubles digestifs"] }),
  drug("lantus", "LANTUS SOLOSTAR 100 unités/ ml, solution injectable en stylo prérempli", 5, { substance: "insuline glargine", atcCode: "A10AE04", therapeuticClass: "Insuline", sideEffects: ["hypoglycémie"] }),
  drug("omeprazole", "OMEPRAZOLE ARROW 20 mg, gélule gastro-résistante", 32, { substance: "oméprazole", atcCode: "A02BC01", therapeuticClass: "Inhibiteur de la pompe à protons", sideEffects: ["céphalées", "diarrhée"] }),
  drug("levothyrox", "LEVOTHYROX 75 microgrammes, comprimé sécable", 16, { substance: "lévothyroxine", atcCode: "H03AA01", therapeuticClass: "Hormone thyroïdienne", sideEffects: [] }),
  drug("escitalopram", "ESCITALOPRAM BIOGARAN 10 mg, comprimé pelliculé sécable", 14, { substance: "escitalopram", atcCode: "N06AB10", therapeuticClass: "Antidépresseur", sideEffects: ["bouche sèche", "fatigue", "nausées"] }),
  drug("prednisolone", "PREDNISOLONE ARROW 20 mg, comprimé effervescent sécable", 10, { substance: "prednisolone", atcCode: "H02AB06", therapeuticClass: "Corticoïde", sideEffects: ["troubles digestifs", "insomnie"] }),
  // Dermatologie, virologie, pédiatrie
  drug("isotretinoine", "ISOTRETINOINE ACNETRAIT 20 mg, capsule molle", 6, { substance: "isotrétinoïne", atcCode: "D10BA01", therapeuticClass: "Rétinoïde", sideEffects: ["sécheresse cutanée", "lèvres sèches", "yeux secs", "photosensibilisation"] }),
  drug("valaciclovir", "VALACICLOVIR BIOGARAN 500 mg, comprimé pelliculé", 12, { substance: "valaciclovir", atcCode: "J05AB11", therapeuticClass: "Antiviral", sideEffects: ["céphalées", "nausées"] }),
  drug("eliquis", "ELIQUIS 5 mg, comprimé pelliculé", 0, { substance: "apixaban", atcCode: "B01AF02", therapeuticClass: "Anticoagulant oral", sideEffects: ["saignements"] }),
  drug("tiorfan-enfant", "TIORFAN 30 mg ENFANTS, poudre orale en sachet-dose", 8, { substance: "racécadotril", atcCode: "A07XA04", therapeuticClass: "Antidiarrhéique", sideEffects: [] }),
  // Médicaments de conseil (sans ordonnance), proposés en complément
  drug("ultra-levure", "ULTRA-LEVURE 50 mg, gélule", 24, undefined, 790),
  drug("lacteol", "LACTEOL 340 mg, poudre pour suspension buvable en sachet-dose", 15, undefined, 890),
  drug("smecta", "SMECTA 3 g ORANGE-VANILLE, poudre pour suspension buvable en sachet", 28, undefined, 397),
  drug("gaviscon", "GAVISCON, suspension buvable en sachet", 20, undefined, 397),
  drug("cromabak", "CROMABAK 20 mg/ml, collyre en solution", 9, undefined, 612),
  drug("biseptine", "BISEPTINE, solution pour application locale", 18, undefined, 450),
];

export const DEMO_DRUG_BY_KEY = new Map(DEMO_DRUGS.map((entry) => [entry.key, entry]));
