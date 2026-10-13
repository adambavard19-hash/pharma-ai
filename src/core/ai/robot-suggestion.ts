import { MAX_RECOMMENDATIONS_PER_PRESCRIPTION } from "@/config/constants";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { ADVICE_VOCABULARY, normalizeProductText } from "@/core/catalog/product-vocabulary";
import { REIMBURSABLE_DRUG_VAT } from "@/core/catalog/margin";
import { NEED_DEFINITIONS, NEED_KEYS } from "@/core/understanding/needs";
import { ADVICE_RULES, type AdviceRule } from "./engines/advice";
import { normalizeProductName } from "./engines/product-name";
import { runAnalysisPipeline, type PipelineInput } from "./pipeline";
import type { AdviceOpportunityResult, AnalysisResult, CatalogProduct, ProductCategoryCode, ScoredRecommendation } from "./types";
import type { CustomRuleDefinition } from "./central-advice";

/**
 * La suggestion du robot — le secours encadré quand AUCUNE règle ne couvre un médicament de la vente.
 *
 * Décision du fondateur (13 oct. 2026), après un MAALOX bipé sans aucun conseil : « il ne faut pas attendre d'avoir une
 * règle pour proposer quelque chose ». Le principe du moteur ne change pas pour autant :
 *
 *  • le modèle ne voit QUE le médicament (nom, substance, famille) et une LISTE FERMÉE de produits du stock de CETTE
 *    officine, préparée ici — jamais le patient (ni nom, ni âge, ni historique, ni allergie) ;
 *  • il choisit 0 à 2 produits DE CETTE LISTE, par leur identifiant court ; tout le reste est rejeté à la validation ;
 *  • chaque choix devient une règle éphémère, ciblée sur ce seul produit, que le moteur fait passer par TOUS ses garde-fous
 *    (vigilances, contre-indications, patient, exclusions de l'officine, stock, prescription) : ce sont les filtres du
 *    moteur qui décident, jamais le modèle ;
 *  • aucune mention d'origine n'est écrite dans la raison (décision du fondateur du 13 oct. 2026) — l'origine reste
 *    dans la règle `robot:…` et la console ; `ROBOT_LABEL` ne sert plus qu'à nettoyer les raisons déjà enregistrées ; la
 *    proposition part dans la console de la pharmacienne de PharmaBoost, qui la valide pour toutes les pharmacies ou la
 *    refuse pour toujours.
 *
 * Module pur : aucune base, aucun réseau, aucune horloge (l'heure est passée en paramètre).
 */

export const ROBOT_LABEL = "Suggestion du robot — à confirmer par la pharmacienne";
/** Les produits proposés au modèle, au plus. Au-delà, la réponse s'allonge sans gain et le coût monte. */
export const ROBOT_MAX_CANDIDATES = 60;
/** Ce que le modèle peut choisir pour un médicament. */
export const ROBOT_MAX_ITEMS = 2;
/** Lignes d'une même vente envoyées au modèle, au plus (la fenêtre du comptoir n'en montre pas plus de deux). */
export const ROBOT_MAX_LINES = 2;
/** Ce que la vente attend le modèle avant de partir sans lui : la suggestion la rejoint dès qu'elle arrive. */
export const ROBOT_WAIT_MS = 1500;
/** La durée de vie d'une réponse en cache, par officine et par médicament. */
export const ROBOT_CACHE_DAYS = 30;
/** Après un échec (crédit épuisé, délai, refus), on ne redemande pas avant ce délai : le comptoir ne paie jamais deux fois une panne. */
export const ROBOT_RETRY_AFTER_FAILURE_MS = 30 * 60 * 1000;
/** Un appel « en cours » plus vieux que cela est tenu pour perdu (serveur coupé en route) : on peut redemander. */
export const ROBOT_PENDING_STALE_MS = 60 * 1000;
/** En dessous de cette ressemblance entre la liste d'hier et celle d'aujourd'hui, le stock a « notablement » changé. */
export const ROBOT_STOCK_SIMILARITY_MIN = 0.6;
export const ROBOT_TEXT_LIMITS = { reason: { min: 10, max: 160 }, script: { min: 15, max: 300 } } as const;

export const ROBOT_RULE_PREFIX = "robot-";
export const robotRuleKey = (proposalId: string): string => `${ROBOT_RULE_PREFIX}${proposalId}`;
export const isRobotRuleKey = (key: string | null | undefined): key is string => typeof key === "string" && key.startsWith(ROBOT_RULE_PREFIX);
export const proposalIdOfRuleKey = (key: string): string => key.slice(ROBOT_RULE_PREFIX.length);

// ---------------------------------------------------------------------------------------------------------------
// Les besoins : une liste fermée (celle de la compréhension, plus quelques besoins de comptoir sans médicament)
// ---------------------------------------------------------------------------------------------------------------

const COUNTER_NEEDS = {
  DIGESTIVE_COMFORT: "Confort digestif",
  ORAL_CARE: "Hygiène et confort de la bouche",
  SKIN_CARE: "Soin et protection de la peau",
  EYE_NOSE_CARE: "Hygiène des yeux ou du nez",
  MUSCLE_JOINT_COMFORT: "Confort musculaire ou articulaire, sans médicament",
  SLEEP_RELAXATION: "Sommeil et détente",
  NUTRITION_SUPPORT: "Apport nutritionnel (vitamines, minéraux)",
  MONITORING_DEVICE: "Matériel de suivi (thermomètre, tensiomètre, pilulier)",
  HYGIENE_PROTECTION: "Hygiène et protection",
} as const;

export const ROBOT_NEED_KEYS: readonly string[] = [...NEED_KEYS, ...Object.keys(COUNTER_NEEDS)];
export const ROBOT_NEED_LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(NEED_KEYS.map((key) => [key, NEED_DEFINITIONS[key].label])),
  ...COUNTER_NEEDS,
};

// ---------------------------------------------------------------------------------------------------------------
// Ce qui déclenche : une ligne médicament confirmée, classée, qu'aucune règle ni association n'a servie
// ---------------------------------------------------------------------------------------------------------------

export type RobotDrug = {
  lineIndex: number;
  drugName: string;
  /** La clé du cache et des propositions : « atc:A02AD01 », à défaut « classe:<classe normalisée> ». */
  drugKey: string;
  atcCode: string | null;
  therapeuticClass: string | null;
  /** Substances publiées (BDPM) ou, à défaut, la DCI de la fiche. */
  substances: string[];
};

/** Le médicament se reconnaît par sa famille : deux marques d'un même code ATC reçoivent la même suggestion, et la même décision. */
export function robotDrugKey(drug: { atcCode: string | null; therapeuticClass: string | null }): string | null {
  const atc = drug.atcCode?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  if (atc) return `atc:${atc}`;
  const klass = normalizeProductText(drug.therapeuticClass ?? "");
  return klass ? `classe:${klass}` : null;
}

/**
 * Les lignes médicament qu'aucun conseil (règle du code, conseil ajouté, association) n'a servies. Une ligne dont un
 * conseil a été ÉCARTÉ par la sécurité n'en fait pas partie : la sécurité a parlé, le robot ne la contourne pas.
 */
export function uncoveredDrugs(input: PipelineInput, result: AnalysisResult): RobotDrug[] {
  if (result.status === "FAILED") return [];
  const opportunityByKey = new Map(result.opportunities.map((opportunity) => [opportunity.key, opportunity]));
  const covered = new Set<number>();
  for (const recommendation of result.recommendations) {
    for (const trigger of opportunityByKey.get(recommendation.opportunityKey)?.triggeredBy ?? []) covered.add(trigger.lineIndex);
  }
  const blocked = new Set(result.opportunities.filter((opportunity) => opportunity.isBlocked).flatMap((opportunity) => opportunity.triggeredBy.map((trigger) => trigger.lineIndex)));

  const drugs: RobotDrug[] = [];
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (!line.confirmed || !line.drugName || covered.has(line.lineIndex) || blocked.has(line.lineIndex)) continue;
    const name = line.drugName.toLowerCase();
    const knowledge = input.knowledge.get(name) ?? null;
    // Un produit de parapharmacie bipé n'a pas de fiche ; un produit pour animaux n'est pas un médicament humain.
    if (!knowledge || knowledge.origin === "VETERINARY_NAME") continue;
    const atcCode = knowledge.atcCode?.trim().toUpperCase() || null;
    // Une famille officielle parle par son code, jamais par son libellé (même principe que les règles).
    const therapeuticClass = knowledge.therapeuticClass?.trim() || null;
    if (!atcCode && (!therapeuticClass || knowledge.origin === "OFFICIAL_ATC")) continue;
    const drugKey = robotDrugKey({ atcCode, therapeuticClass });
    if (!drugKey || seen.has(drugKey)) continue;
    seen.add(drugKey);
    const official = input.official?.get(name) ?? null;
    const substances = official?.substances.length ? official.substances : knowledge.inn ? [knowledge.inn] : [];
    drugs.push({ lineIndex: line.lineIndex, drugName: line.drugName, drugKey, atcCode, therapeuticClass, substances });
  }
  return drugs;
}

// ---------------------------------------------------------------------------------------------------------------
// La liste fermée : préparée ici, à partir du stock de CETTE officine
// ---------------------------------------------------------------------------------------------------------------

export type RobotCandidate = {
  /** « P01 » : le seul identifiant que voit le modèle. */
  shortId: string;
  productId: string;
  /** La clé commune à toutes les officines (code-barres, sinon nom normalisé) : elle porte la proposition et le refus. */
  productKey: string;
  name: string;
  brand: string | null;
  ean: string | null;
  category: ProductCategoryCode;
  /** Étiquettes d'usage, prises dans le vocabulaire fermé des règles. */
  tags: string[];
};

export function robotProductKey(product: { ean: string | null; name: string }): string {
  const ean = (product.ean ?? "").replace(/\D/g, "");
  return ean.length >= 7 ? `ean:${ean}` : `nom:${normalizeProductText(product.name)}`;
}

type Affinity = { categories: ProductCategoryCode[]; tags: string[] };

/**
 * Ce qui accompagne d'ordinaire une famille de médicaments au comptoir. Sert à CLASSER la liste envoyée au modèle (les
 * produits les plus plausibles d'abord), jamais à choisir : le modèle choisit, la sécurité tranche.
 */
const AFFINITY: [prefix: string, affinity: Affinity][] = [
  ["A02", { categories: ["PHYTOTHERAPIE", "PROBIOTIQUES", "NUTRITION"], tags: ["digestion", "confort digestif", "confort gastrique", "estomac", "flore intestinale", "probiotique"] }],
  ["A03", { categories: ["PHYTOTHERAPIE", "PROBIOTIQUES"], tags: ["digestion", "confort digestif", "flore intestinale", "réhydratation"] }],
  ["A04", { categories: ["NUTRITION", "PHYTOTHERAPIE"], tags: ["réhydratation", "sels minéraux", "digestion", "confort digestif"] }],
  ["A06", { categories: ["NUTRITION", "PROBIOTIQUES"], tags: ["transit", "fibres", "hydratation", "flore intestinale", "probiotique"] }],
  ["A07", { categories: ["NUTRITION", "PROBIOTIQUES"], tags: ["réhydratation", "sels minéraux", "flore intestinale", "probiotique"] }],
  ["A10", { categories: ["DISPOSITIFS_MEDICAUX", "SOINS", "DERMATOLOGIE"], tags: ["pieds", "resucrage", "mesure", "émollient", "hydratation"] }],
  ["B03", { categories: ["NUTRITION", "VITAMINES"], tags: ["transit", "fibres", "vitamine c"] }],
  ["C", { categories: ["DISPOSITIFS_MEDICAUX"], tags: ["tensiomètre", "mesure"] }],
  ["D", { categories: ["DERMOCOSMETIQUE", "DERMATOLOGIE", "SOINS"], tags: ["émollient", "hydratation", "peau sensible", "cicatrisant", "apaisant", "protection solaire", "nettoyant", "cutané"] }],
  ["G01", { categories: ["HYGIENE", "PROBIOTIQUES"], tags: ["hygiène intime", "flore vaginale", "probiotique"] }],
  ["H02", { categories: ["MINERAUX", "VITAMINES"], tags: ["calcium", "vitamine d", "os", "confort gastrique"] }],
  ["J01", { categories: ["PROBIOTIQUES", "DISPOSITIFS_MEDICAUX"], tags: ["probiotique", "flore intestinale", "tolérance digestive", "thermomètre"] }],
  ["J05", { categories: ["SOINS", "DERMATOLOGIE"], tags: ["herpès", "bouton de fièvre", "lèvres", "antiseptique"] }],
  ["M01", { categories: ["DISPOSITIFS_MEDICAUX", "SOINS", "PHYTOTHERAPIE"], tags: ["confort gastrique", "chaud froid", "zone dos", "zone genou", "zone nuque", "zone épaule"] }],
  ["M02", { categories: ["DISPOSITIFS_MEDICAUX", "SOINS"], tags: ["chaud froid", "zone dos", "zone genou", "zone cheville", "zone épaule"] }],
  ["N02", { categories: ["DISPOSITIFS_MEDICAUX", "SOINS"], tags: ["thermomètre", "fièvre", "chaud froid", "zone dos", "zone nuque"] }],
  ["N05", { categories: ["PHYTOTHERAPIE", "MAGNESIUM", "HYGIENE"], tags: ["bouche sèche", "salive", "fatigue", "magnésium"] }],
  ["N06", { categories: ["PHYTOTHERAPIE", "MAGNESIUM", "HYGIENE"], tags: ["bouche sèche", "salive", "fatigue", "magnésium"] }],
  ["R01", { categories: ["HYGIENE", "DISPOSITIFS_MEDICAUX", "SAISONNIER"], tags: ["eau de mer", "spray nasal", "lavage", "nez", "nasal", "orl"] }],
  ["R02", { categories: ["SAISONNIER", "PHYTOTHERAPIE"], tags: ["gorge", "pastilles", "miel", "orl"] }],
  ["R03", { categories: ["DISPOSITIFS_MEDICAUX", "HYGIENE"], tags: ["chambre d'inhalation", "bain de bouche", "bucco-dentaire", "rinçage"] }],
  ["R05", { categories: ["SAISONNIER", "PHYTOTHERAPIE"], tags: ["gorge", "miel", "pastilles", "orl", "bronches"] }],
  ["R06", { categories: ["HYGIENE", "DISPOSITIFS_MEDICAUX", "SAISONNIER"], tags: ["yeux", "collyre", "larmes", "lavage", "eau de mer", "nez"] }],
  ["S01", { categories: ["HYGIENE", "DISPOSITIFS_MEDICAUX"], tags: ["larmes", "sécheresse oculaire", "paupières", "lavage", "oculaire", "yeux"] }],
  ["P03", { categories: ["HYGIENE"], tags: ["peigne anti-poux", "shampooing"] }],
];

/**
 * Les usages qui DOUBLERAIENT le médicament (un second antiacide derrière un Maalox, un second laxatif) : ces produits ne
 * sont jamais proposés au modèle. Le moteur ne connaît pas la composition d'un produit de parapharmacie ; c'est donc ici,
 * avant le modèle, qu'on écarte le doublon évident.
 */
const DUPLICATES: [prefix: string, tags: string[]][] = [
  ["A02A", ["antiacide"]],
  ["A06", ["transit"]],
  ["A07", ["diarrhée"]],
  ["A11", ["vitamines", "multivitamines"]],
  ["A12AA", ["calcium"]],
  ["A12CC", ["magnésium"]],
  ["B03", ["fer"]],
  ["R05", ["toux"]],
  ["S01X", ["larmes", "sécheresse oculaire"]],
];

/** Les mots d'une substance qui ne disent rien de l'actif (sels, formes). */
const SALT_WORDS = new Set(["hydroxyde", "chlorhydrate", "sodium", "sodique", "monohydrate", "dihydrate", "trihydrate", "anhydre", "acide", "phosphate", "sulfate", "citrate", "acetate", "carbonate", "oxyde", "chlorure", "bromure", "maleate", "fumarate", "succinate", "tartrate", "base", "equivalant", "equivalent"]);

const longestPrefix = <T>(table: [string, T][], atc: string | null): T | null => {
  if (!atc) return null;
  let best: [string, T] | null = null;
  for (const entry of table) if (atc.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  return best ? best[1] : null;
};

/** Les mots qui désignent le médicament lui-même : sa marque (premier mot) et ses substances actives. */
function drugWords(drug: RobotDrug): string[] {
  const brand = normalizeProductText(drug.drugName).split(" ").find((word) => word.length >= 4 && /[a-z]/.test(word));
  const substances = drug.substances.flatMap((substance) => normalizeProductText(substance).split(" ")).filter((word) => word.length >= 6 && !SALT_WORDS.has(word));
  return [...new Set([...(brand ? [brand] : []), ...substances])];
}

const vocabulary = new Set(ADVICE_VOCABULARY);

/**
 * Ce produit de l'officine peut-il être un MÉDICAMENT ? Un produit de l'officine ne déclare jamais ni substance ni
 * condition de délivrance (catalog.ts les fige à vide) : un code CIP inconnu de la BDPM locale, créé par l'import, la
 * synchronisation du poste ou un dépôt, devient un produit « AUTRE » comme un autre. Le filtre « sans prescription » ne
 * voit donc rien ; c'est ici qu'on l'écarte, sur ce qui se lit sans le nom : remboursé, code CIP (13 chiffres en 3400,
 * ou 7 chiffres), TVA du médicament remboursable (2,1 %), rayon « AUTRE » sans aucune étiquette d'usage. Dans le doute,
 * le produit n'est pas proposé au modèle : une suggestion de moins vaut mieux qu'un antibiotique au comptoir.
 */
export function mayBeDrug(product: Pick<CatalogProduct, "reimbursed" | "ean" | "reference" | "vatRate" | "category" | "matchingTags" | "substances" | "prescriptionConditions">): boolean {
  if (product.reimbursed === true || product.substances.length > 0 || product.prescriptionConditions.length > 0) return true;
  if (Math.abs(product.vatRate - REIMBURSABLE_DRUG_VAT) < 0.001) return true;
  for (const code of [product.ean, product.reference]) {
    const digits = (code ?? "").trim();
    if (/^\d{7}$/.test(digits) || /^3400\d{9}$/.test(digits)) return true;
  }
  return product.category === "AUTRE" && !product.matchingTags.some((tag) => vocabulary.has(tag.toLowerCase()));
}

/**
 * La liste fermée proposée au modèle : des produits de l'officine (jamais un médicament du catalogue national), actifs,
 * en stock, qui ne peuvent pas être un médicament (`mayBeDrug` : ni remboursé, ni code CIP, ni TVA à 2,1 %, ni rayon
 * « AUTRE » sans usage), qui ne doublent pas le médicament et dont la proposition n'a pas été refusée par la pharmacienne
 * de PharmaBoost. Les plus plausibles pour la famille du médicament d'abord ; au plus `ROBOT_MAX_CANDIDATES`.
 */
export function selectRobotCandidates(params: {
  catalog: CatalogProduct[];
  drug: RobotDrug;
  /** Clés produit refusées pour CE médicament (console de la pharmacienne). */
  refusedProductKeys?: ReadonlySet<string>;
  limit?: number;
}): RobotCandidate[] {
  const { drug } = params;
  const affinity = longestPrefix(AFFINITY, drug.atcCode) ?? longestPrefix(AFFINITY, drug.atcCode?.slice(0, 1) ?? null);
  const duplicateTags = new Set(longestPrefix(DUPLICATES, drug.atcCode) ?? []);
  const ownWords = drugWords(drug);
  const scored = params.catalog
    .filter((product) => {
      if (product.origin !== "PHARMACY_CATALOG" || !product.isActive || product.stockQuantity <= 0) return false;
      if (mayBeDrug(product)) return false;
      const tags = product.matchingTags.map((tag) => tag.toLowerCase());
      if (tags.some((tag) => duplicateTags.has(tag))) return false;
      const words = normalizeProductText(product.name).split(" ");
      if (ownWords.some((word) => words.includes(word))) return false;
      return !params.refusedProductKeys?.has(robotProductKey(product));
    })
    .map((product) => {
      const tags = [...new Set(product.matchingTags.map((tag) => tag.toLowerCase()).filter((tag) => vocabulary.has(tag)))];
      const tagHits = affinity ? tags.filter((tag) => affinity.tags.includes(tag)).length : 0;
      const score =
        (affinity?.categories.includes(product.category) ? 3 : 0) +
        2 * Math.min(3, tagHits) +
        (tags.length > 0 ? 0.5 : 0) -
        (product.category === "AUTRE" ? 0.5 : 0);
      return { product, tags, score };
    })
    .sort((a, b) => b.score - a.score || b.product.stockQuantity - a.product.stockQuantity || a.product.name.localeCompare(b.product.name, "fr") || a.product.id.localeCompare(b.product.id));

  return scored.slice(0, params.limit ?? ROBOT_MAX_CANDIDATES).map(({ product, tags }, index) => ({
    shortId: `P${String(index + 1).padStart(2, "0")}`,
    productId: product.id,
    productKey: robotProductKey(product),
    name: product.name,
    brand: product.brand,
    ean: product.ean,
    category: product.category,
    tags,
  }));
}

/** Ressemblance entre deux listes (indice de Jaccard sur les identifiants produit). */
export function candidateSimilarity(before: readonly string[], now: readonly string[]): number {
  if (before.length === 0 && now.length === 0) return 1;
  const a = new Set(before);
  const b = new Set(now);
  let common = 0;
  for (const id of a) if (b.has(id)) common += 1;
  return common / (a.size + b.size - common);
}

// ---------------------------------------------------------------------------------------------------------------
// Le cache : servir, attendre, ou redemander
// ---------------------------------------------------------------------------------------------------------------

export type RobotItem = { proposalId: string; productId: string; need: string; reason: string; counterScript: string };

export type RobotCacheRow = {
  status: "PENDING" | "READY" | "FAILED";
  items: unknown;
  candidateIds: string[];
  requestedAt: Date;
  expiresAt: Date;
};

export function parseRobotItems(raw: unknown): RobotItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const fields = [item.proposalId, item.productId, item.need, item.reason, item.counterScript];
    return fields.every((value) => typeof value === "string" && value.length > 0) ? [item as unknown as RobotItem] : [];
  });
}

/**
 * Que faire d'une ligne de cache ?
 *  • USE  — une réponse fraîche, sur un stock qui n'a pas notablement changé (une réponse « aucun produit » en est une) ;
 *  • WAIT — un appel est en cours ailleurs, ou un échec récent : on ne redemande pas ;
 *  • ASK  — rien, périmé, ou le stock a changé : on demande au modèle.
 */
export function robotCacheDecision(row: RobotCacheRow | null, candidateIds: readonly string[], now: Date): "USE" | "WAIT" | "ASK" {
  if (!row) return "ASK";
  if (row.status === "PENDING") return now.getTime() - row.requestedAt.getTime() < ROBOT_PENDING_STALE_MS ? "WAIT" : "ASK";
  if (row.expiresAt.getTime() <= now.getTime()) return "ASK";
  if (row.status === "FAILED") return "WAIT";
  if (candidateSimilarity(row.candidateIds, candidateIds) < ROBOT_STOCK_SIMILARITY_MIN) return "ASK";
  const items = parseRobotItems(row.items);
  // Tous les produits choisis ont quitté la liste (rupture, refus) : la réponse ne sert plus, on redemande.
  if (items.length > 0 && !items.some((item) => candidateIds.includes(item.productId))) return "ASK";
  return "USE";
}

// ---------------------------------------------------------------------------------------------------------------
// Le contrat avec le modèle
// ---------------------------------------------------------------------------------------------------------------

export const ROBOT_TOOL_NAME = "choisir_produits";

export const ROBOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["produits"],
  properties: {
    produits: {
      type: "array",
      description: "De 0 à 2 produits, choisis UNIQUEMENT dans la liste reçue. Liste vide si aucun ne complète utilement ce médicament.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "besoin", "raison", "phrase"],
        properties: {
          id: { type: "string", description: "L'identifiant du produit tel que reçu (« P01 »)." },
          besoin: { type: "string", enum: [...ROBOT_NEED_KEYS], description: "Le besoin auquel le produit répond, dans la liste fermée." },
          raison: { type: "string", description: "Pour le pharmacien, en une phrase de 140 caractères au plus : pourquoi ce produit a du sens avec ce médicament." },
          phrase: { type: "string", description: "Ce que le pharmacien peut dire, 250 caractères au plus, vouvoiement, avec {product} à la place du nom du produit." },
        },
      },
    },
  },
} as const;

export const ROBOT_SYSTEM_PROMPT = `Tu aides un pharmacien d'officine en France, au comptoir, pendant une délivrance. Aucune règle de conseil n'est écrite pour le médicament délivré ; tu peux proposer jusqu'à deux produits qui le complètent utilement, choisis UNIQUEMENT dans la liste des produits en stock de cette pharmacie.

Ce que tu choisis :
- un produit de confort, d'hygiène, de soin, de nutrition ou un dispositif qui accompagne logiquement ce traitement ;
- jamais un produit qui ferait doublon avec le médicament (même usage, même actif) ni un médicament ;
- jamais un produit dont l'association avec ce médicament pose un problème connu ;
- rien si aucun produit de la liste ne convient : une liste vide est une bonne réponse, bien meilleure qu'un produit forcé.

Pour chaque produit : son identifiant (« P01 »), le besoin dans la liste fermée, une raison pour le pharmacien (140 caractères au plus) et une phrase que le pharmacien peut dire (250 caractères au plus), qui contient {product} à la place du nom du produit. La phrase est sobre : elle propose, elle ne promet rien ; aucune allégation thérapeutique ni promesse d'effet (« guérit », « soigne », « soulage », « traite », « calme », « apaise », « efficace », « contre les… »…), aucun dosage, aucune posologie, aucun chiffre.

Tu ne sais rien du patient et tu n'as pas à le deviner : le pharmacien vérifiera.

Réponds toujours en appelant l'outil ${ROBOT_TOOL_NAME}, même pour ne rien proposer.

Besoins possibles : ${ROBOT_NEED_KEYS.map((key) => `${key} (${ROBOT_NEED_LABELS[key]})`).join(" · ")}.`;

const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "");
const shorten = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/**
 * Le texte envoyé au modèle : le médicament (nom, substance, famille) et la liste fermée. Rien d'autre — en particulier
 * rien du patient : cette fonction ne le reçoit pas.
 */
export function buildRobotPrompt(drug: RobotDrug, candidates: RobotCandidate[]): string {
  const family = [drug.atcCode ? `code ATC ${drug.atcCode}` : null, drug.therapeuticClass].filter(Boolean).join(" — ");
  const lines = candidates.map((candidate) =>
    [
      candidate.shortId,
      shorten(clean(candidate.name), 120),
      candidate.brand ? `marque ${shorten(clean(candidate.brand), 40)}` : null,
      PRODUCT_CATEGORY_LABELS[candidate.category] ?? candidate.category,
      candidate.tags.length > 0 ? `usages : ${candidate.tags.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  return [
    `Médicament délivré : ${shorten(clean(drug.drugName), 160)}`,
    `Substance(s) : ${drug.substances.length > 0 ? drug.substances.map((substance) => clean(substance)).join(", ") : "non publiée"}`,
    `Famille : ${family || "non précisée"}`,
    "",
    `Produits en stock dans cette pharmacie (${candidates.length}) — identifiant · nom · marque · rayon · usages :`,
    ...lines,
  ].join("\n");
}

export type RobotChoice = { shortId: string; need: string; reason: string; counterScript: string };

/** Un dosage, une posologie, un chiffre de quantité : refusé dans une phrase de comptoir écrite par le modèle. */
const DOSAGE = /\d+(?:[.,]\d+)?\s?(?:mg|g|ml|cl|µg|mcg|ui|%|gélules?|comprimés?|sachets?|ampoules?|gouttes?|doses?|fois|jours?|semaines?)\b/i;
/** Une allégation thérapeutique ou une promesse (début de mot, accents compris : « élimine » comme « guérit »). */
const CLAIM =
  /(?<![\p{L}\p{N}])(?:gu[ée]ri|soign|miracul|garanti|[ée]limin|pr[ée]vien|pr[ée]venir|emp[êe]ch|radical|infaillible|soulag|trait(?:e|es|ent|er|é|ée|és|ées|ant)(?![\p{L}])|calm|apais|efficac|combat|r[ée]par|ulc[èe]r|cicatris|rem[èe]de|stopp|lutt|contre\s+(?:les?|la|l['’]|des?|du|ces?|cette|vos|votre))|100\s?%/iu;
const PLACEHOLDER = /\{([a-z]+)\}/g;

function textProblem(text: string, kind: "reason" | "script"): string | null {
  const limits = ROBOT_TEXT_LIMITS[kind];
  if (text.length < limits.min) return "texte vide ou trop court";
  if (text.length > limits.max) return "texte trop long";
  if (DOSAGE.test(text)) return "dosage ou quantité";
  if (CLAIM.test(text)) return "allégation thérapeutique";
  if (/https?:|www\.|@/i.test(text)) return "lien ou adresse";
  const placeholders = [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
  if (kind === "reason" && (placeholders.length > 0 || /[{}]/.test(text))) return "accolades dans la raison";
  if (kind === "script") {
    if (!placeholders.includes("product")) return "phrase sans {product}";
    if (placeholders.some((name) => name !== "product" && name !== "drug")) return "accolade inconnue";
  }
  return null;
}

/**
 * La validation stricte de ce que le modèle a répondu. Un identifiant hors liste, un besoin inconnu, un doublon, un texte
 * vide, trop long, chiffré ou prometteur : rejeté. « Aucun produit » est une réponse valable. Au-delà de deux, les
 * suivants sont ignorés.
 */
export function validateRobotChoices(raw: unknown, candidates: readonly RobotCandidate[]): { choices: RobotChoice[]; warnings: string[] } {
  const input = (raw && typeof raw === "object" ? raw : {}) as { produits?: unknown };
  const warnings: string[] = [];
  if (!Array.isArray(input.produits)) return { choices: [], warnings: ["Réponse sans liste de produits : rien n'est retenu."] };
  const known = new Set(candidates.map((candidate) => candidate.shortId));
  const choices: RobotChoice[] = [];
  for (const entry of input.produits) {
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const shortId = clean(item.id).toUpperCase();
    if (!known.has(shortId)) {
      warnings.push(`Identifiant « ${shortId || "?"} » hors de la liste : rejeté.`);
      continue;
    }
    if (choices.some((choice) => choice.shortId === shortId)) {
      warnings.push(`${shortId} choisi deux fois : doublon ignoré.`);
      continue;
    }
    const need = clean(item.besoin).toUpperCase();
    if (!ROBOT_NEED_KEYS.includes(need)) {
      warnings.push(`${shortId} : besoin « ${need || "?"} » hors de la liste fermée : rejeté.`);
      continue;
    }
    const reason = clean(item.raison);
    const counterScript = clean(item.phrase);
    const problem = textProblem(reason, "reason") ?? textProblem(counterScript, "script");
    if (problem) {
      warnings.push(`${shortId} : ${problem} — rejeté.`);
      continue;
    }
    if (choices.length >= ROBOT_MAX_ITEMS) {
      warnings.push(`${shortId} : au-delà de ${ROBOT_MAX_ITEMS} produits — ignoré.`);
      continue;
    }
    choices.push({ shortId, need, reason, counterScript });
  }
  return { choices, warnings };
}

// ---------------------------------------------------------------------------------------------------------------
// Les garde-fous du moteur : chaque choix devient une règle éphémère, ciblée sur un seul produit
// ---------------------------------------------------------------------------------------------------------------

export type RobotPlan = { drug: RobotDrug; items: RobotItem[] };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * La règle que le moteur lit pour un choix du robot. Elle ne vise QUE le produit choisi (tous les autres noms sont
 * écartés, seul le sien est sauvé ; l'étiquette `robot-…` n'existe que sur lui) et passe par tout le moteur : vigilances,
 * sécurité produit, patient, exclusions de l'officine, stock. Le patient ne lit rien du modèle : sa phrase reste vide (le
 * document dit alors « conseil proposé par votre pharmacien »).
 */
export function robotRule(drug: RobotDrug, item: RobotItem, product: CatalogProduct): AdviceRule {
  const key = robotRuleKey(item.proposalId);
  return {
    key,
    title: `Suggestion du robot — ${ROBOT_NEED_LABELS[item.need] ?? item.need}`,
    kind: "COMFORT",
    version: "robot-1",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: product.category,
    atcPrefixes: drug.atcCode ? [drug.atcCode] : [],
    therapeuticClasses: drug.atcCode || !drug.therapeuticClass ? [] : [drug.therapeuticClass],
    sideEffectTriggers: [],
    basePriority: 20,
    matchingTags: [key],
    excludeTags: [],
    productExclude: ["."],
    productPrefer: [`^${escapeRegExp(normalizeProductName(product.name))}$`],
    benefits: [],
    // Aucune mention d'origine au comptoir (décision du fondateur, 13 oct. 2026) : l'origine reste en base (source, règle robot:…).
    rationaleTemplate: item.reason,
    shortReasonTemplate: item.reason,
    counterScriptTemplate: item.counterScript,
    patientReasonTemplate: "",
    clinicalContext: "Aucune règle écrite pour ce médicament : produit choisi par le modèle dans une liste fermée du stock de l'officine, puis passé par tous les garde-fous du moteur. À confirmer par la pharmacienne.",
    safetyNotes: [],
  };
}

/** Combien de suggestions du robot la vente peut encore recevoir : une seule s'il y a déjà d'autres conseils, deux sinon, jamais au-delà du plafond. */
export function robotSlots(result: Pick<AnalysisResult, "recommendations" | "opportunities">, maxRecommendations: number = MAX_RECOMMENDATIONS_PER_PRESCRIPTION): number {
  const ruleKeyOf = new Map(result.opportunities.map((opportunity) => [opportunity.key, opportunity.ruleKey]));
  const robot = result.recommendations.filter((item) => isRobotRuleKey(ruleKeyOf.get(item.opportunityKey))).length;
  const others = result.recommendations.length - robot;
  const engine = result.recommendations.filter((item) => item.source !== "ASSOCIATION").length;
  return Math.max(0, Math.min((others > 0 ? 1 : ROBOT_MAX_ITEMS) - robot, maxRecommendations - engine));
}

export type RobotMerge = {
  result: AnalysisResult;
  /** Les conseils du robot retenus, dans l'ordre (ligne, puis rang donné par le modèle). */
  added: ScoredRecommendation[];
  /** Leurs opportunités, prêtes à enregistrer. */
  opportunities: AdviceOpportunityResult[];
  notes: string[];
};

/**
 * Fait passer les choix du robot par le moteur, puis les ajoute à l'analyse sans rien déplacer : le moteur est relancé
 * avec les seules règles du robot (mêmes lignes, même patient, même stock, mêmes vigilances), ses propositions s'ajoutent
 * APRÈS celles des règles, dans la limite des places (`robotSlots`), jamais pour un produit déjà proposé.
 */
export function applyRobotSuggestions(params: { input: PipelineInput; base: AnalysisResult; plans: RobotPlan[] }): RobotMerge {
  const { input, base } = params;
  const unchanged: RobotMerge = { result: base, added: [], opportunities: [], notes: [] };
  const catalogById = new Map(input.catalog.map((product) => [product.id, product]));
  const rules: AdviceRule[] = [];
  const rank = new Map<string, number>();
  const tagged = new Map<string, string[]>();
  for (const plan of params.plans) {
    for (const item of plan.items) {
      const product = catalogById.get(item.productId);
      const key = robotRuleKey(item.proposalId);
      // Une réponse en cache peut dater d'avant un changement du stock ou du filtre : ce qui peut être un médicament ne
      // sort jamais, même choisi hier.
      if (!product || rank.has(key) || mayBeDrug(product)) continue;
      rules.push(robotRule(plan.drug, item, product));
      rank.set(key, rank.size);
      tagged.set(product.id, [...(tagged.get(product.id) ?? []), key]);
    }
  }
  if (rules.length === 0) return unchanged;

  const startedAt = Date.now();
  const rerun = runAnalysisPipeline({
    ...input,
    catalog: input.catalog.map((product) => (tagged.has(product.id) ? { ...product, matchingTags: [...product.matchingTags, ...(tagged.get(product.id) ?? [])] } : product)),
    // Les seules règles du robot : celles du code et de la console ont déjà parlé dans l'analyse de base.
    disabledRuleKeys: ADVICE_RULES.map((rule) => rule.key),
    customRules: rules,
    associations: undefined,
    maxRecommendations: rules.length + 1,
  });

  const notes: string[] = [];
  const ruleKeyOf = new Map(rerun.opportunities.map((opportunity) => [opportunity.key, opportunity.ruleKey]));
  const kept = new Set(rerun.recommendations.map((item) => ruleKeyOf.get(item.opportunityKey)));
  for (const rule of rules) {
    if (!kept.has(rule.key)) notes.push(`« ${rule.title} » : écartée par le moteur (sécurité, patient, exclusions de l'officine ou stock).`);
  }
  const already = new Set(base.recommendations.flatMap((item) => [item.productId, ...(item.companion ? [item.companion.productId] : [])]));
  let slots = robotSlots(base, input.maxRecommendations);
  const lowest = base.recommendations.length > 0 ? Math.min(...base.recommendations.map((item) => item.totalScore)) : null;
  const added: ScoredRecommendation[] = [];
  const candidates = rerun.recommendations
    .filter((item) => isRobotRuleKey(ruleKeyOf.get(item.opportunityKey)))
    .sort((a, b) => (rank.get(ruleKeyOf.get(a.opportunityKey) as string) ?? 0) - (rank.get(ruleKeyOf.get(b.opportunityKey) as string) ?? 0));
  for (const item of candidates) {
    const name = catalogById.get(item.productId)?.name ?? item.productId;
    if (already.has(item.productId)) {
      notes.push(`« ${name} » : déjà proposé par un autre conseil, non répété.`);
      continue;
    }
    if (slots <= 0) {
      notes.push(`« ${name} » : plafond des suggestions du robot atteint.`);
      continue;
    }
    already.add(item.productId);
    slots -= 1;
    // Rangée APRÈS les conseils des règles (l'écran du comptoir les lit par score) ; rien d'autre ne change.
    added.push({ ...item, alternatives: [], ...(lowest !== null ? { totalScore: Math.min(item.totalScore, Math.max(0, lowest - 0.01)) } : {}) });
  }
  if (added.length === 0) return { ...unchanged, notes };

  const itemByKey = new Map(params.plans.flatMap((plan) => plan.items.map((item) => [robotRuleKey(item.proposalId), item] as const)));
  const opportunities = rerun.opportunities
    .filter((opportunity) => added.some((item) => item.opportunityKey === opportunity.key))
    .map((opportunity) => {
      const item = itemByKey.get(opportunity.ruleKey ?? "");
      return { ...opportunity, needKey: item?.need ?? null, aiJustification: item?.reason ?? null, coverage: "COVERED" as const };
    });
  notes.unshift(`${added.length} suggestion(s) du robot ajoutée(s), faute de règle pour ce médicament : ${added.map((item) => `« ${catalogById.get(item.productId)?.name ?? item.productId} »`).join(", ")}.`);

  return {
    added,
    opportunities,
    notes,
    result: {
      ...base,
      outcome: "PROPOSALS",
      opportunities: [...base.opportunities, ...opportunities],
      recommendations: [...base.recommendations, ...added],
      trace: [
        ...base.trace,
        { stage: "ADVICE_OPPORTUNITIES", label: "Suggestion du robot (aucune règle pour ce médicament)", status: "OK", durationMs: Date.now() - startedAt, inputCount: rules.length, outputCount: added.length, notes },
      ],
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// La proposition validée : ce qu'elle devient pour toutes les pharmacies
// ---------------------------------------------------------------------------------------------------------------

export type RobotProposalFacts = {
  drugLabel: string;
  atcCode: string | null;
  substance: string | null;
  productName: string;
  productEan: string | null;
  productCategory: ProductCategoryCode;
  productTags: string[];
  need: string;
  reason: string;
  counterScript: string;
};

/** La phrase « patient » d'un conseil né d'une suggestion : neutre, fixe — jamais un texte du modèle. */
export const ROBOT_PATIENT_REASON = "Proposé par votre pharmacien en complément de votre traitement.";

export type RobotCentralDraft =
  | { kind: "CUSTOM_RULE"; definition: CustomRuleDefinition; summary: string }
  | { kind: "ASSOCIATION"; trigger: string; ean: string; sentence: string; summary: string }
  | { kind: "MANUAL"; summary: string };

/**
 * Le format central qui porte la proposition, s'il en existe un :
 *  • un CONSEIL AJOUTÉ (même format que la console « Conseils ») quand le médicament a un code ATC et que le produit porte
 *    au moins une étiquette d'usage du vocabulaire : « famille → rayon et usage », pour toutes les pharmacies ;
 *  • sinon une ASSOCIATION COMMUNE (médicament → produit par son code-barres) ;
 *  • sinon rien : la proposition reste dans la liste « à écrire à la main ».
 */
export function robotCentralDraft(facts: RobotProposalFacts): RobotCentralDraft {
  const tags = facts.productTags.filter((tag) => vocabulary.has(tag)).slice(0, 6);
  const needLabel = ROBOT_NEED_LABELS[facts.need] ?? facts.need;
  const drugShort = facts.drugLabel.replace(/,.*$/, "").trim();
  if (facts.atcCode && tags.length > 0) {
    const definition: CustomRuleDefinition = {
      title: shorten(`${needLabel} — ${facts.substance ? facts.substance.toLowerCase() : drugShort}`, 80),
      kind: "COMFORT",
      atcPrefixes: [facts.atcCode],
      therapeuticClasses: [],
      category: facts.productCategory,
      matchingTags: tags,
      question: null,
      shortReason: facts.reason,
      counterScript: facts.counterScript,
      patientReason: ROBOT_PATIENT_REASON,
      source: "Suggestion du robot validée dans la console de PharmaBoost.",
      safetyNotes: [],
    };
    return { kind: "CUSTOM_RULE", definition, summary: `Conseil pour toutes les pharmacies : code ATC ${facts.atcCode} → ${PRODUCT_CATEGORY_LABELS[facts.productCategory] ?? facts.productCategory} (${tags.join(", ")}).` };
  }
  const ean = (facts.productEan ?? "").replace(/\D/g, "");
  if (/^\d{7,14}$/.test(ean)) {
    const sentence = shorten(facts.counterScript.replaceAll("{product}", facts.productName.replace(/,.*$/, "").trim()).replaceAll("{drug}", drugShort), 280);
    return { kind: "ASSOCIATION", trigger: facts.drugLabel, ean, sentence, summary: `Association commune : ${drugShort} → ${facts.productName} (code ${ean}).` };
  }
  return { kind: "MANUAL", summary: "Ni étiquette d'usage ni code-barres : à écrire à la main dans « Conseils »." };
}
