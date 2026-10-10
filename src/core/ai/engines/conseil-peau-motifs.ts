import type { AdviceRule } from "./advice";
import type { VigilanceRule } from "./vigilance";

/**
 * Ce que les séries « Conseil peau » ont en commun : les motifs par lesquels le moteur lit les noms de produits d'un rayon
 * (exfoliants, hydratants de visage, solaires, lavants doux, émollients…), et deux fabriques qui donnent à chaque règle écrite
 * à partir d'un document de la pharmacienne ses valeurs par défaut (à valider, sur la classe du médicament, avec sa question).
 *
 * Ces motifs viennent de la Série 2 (7 octobre 2026) ; les séries 1, 3, 4 et 5 s'en servent telles quelles : une règle plus
 * précise ne change pas la façon de reconnaître un exfoliant ou un solaire de visage.
 */

// -----------------------------------------------------------------------------
// Ce que les rayons nomment, dit par motifs (nom du produit sans accents, en minuscules).
// -----------------------------------------------------------------------------

/** Un exfoliant, mécanique ou chimique : le document déconseille d'en ajouter à ces traitements. */
export const EXFOLIANT = [
  String.raw`gommage`,
  String.raw`exfoli`,
  String.raw`peeling`,
  String.raw`\bscrub\b`,
  String.raw`\baha\b`,
  String.raw`\bbha\b`,
  String.raw`acides? (?:glycolique|salicylique|lactique|mandelique)`,
  String.raw`dermo ?acides?`,
  String.raw`effaclar serum`,
];

/**
 * Ce qui n'est pas un hydratant de VISAGE : soin du corps, des pieds, des lèvres, anti-âge, solaire, et tout ce qui
 * lave (le stock réel range « HLE LAVANTE », « LAIT », « CORP200 », « SYNDET » parmi les émollients).
 */
export const NOT_A_FACE_MOISTURIZER = [
  String.raw`\bcorp`,
  String.raw`\blav`,
  String.raw`syndet`,
  String.raw`nettoy`,
  String.raw`\bdch?e?\b`,
  String.raw`gel douche`,
  String.raw`\bpain\b`,
  String.raw`\bcorps\b`,
  String.raw`\blait\b`,
  String.raw`pieds`,
  String.raw`mains`,
  String.raw`anti ?age`,
  String.raw`anti ?rides`,
  String.raw`solaire`,
  String.raw`\bspf`,
  String.raw`levres`,
  String.raw`lèvres`,
];

/**
 * Hydratant de visage, non comédogène : le descripteur d'abord (« non comédogène »,
 * « visage »), puis la référence citée par le document (Eucerin DermoPure Clinical
 * Hydra Repair). Un motif préféré lève une exclusion (matching.ts) : chacun refuse
 * donc d'abord les exfoliants, les soins du corps et les solaires.
 */
export const REFUSED_FIRST = `(?:${[...EXFOLIANT, ...NOT_A_FACE_MOISTURIZER].join("|")})`;
export const FACE_MOISTURIZER_PREFER = [
  String.raw`^(?!.*${REFUSED_FIRST}).*dermopure.*hydra`,
  String.raw`^(?!.*${REFUSED_FIRST}).*hydra repair`,
  String.raw`^(?!.*${REFUSED_FIRST}).*non comedog`,
  String.raw`^(?!.*${REFUSED_FIRST}).*visag`,
];

/** Même exclusion que l'étape « protéger » de la routine sous isotrétinoïne : un solaire de visage, indice élevé, pas un produit enfant, un spray ou une huile. */
export const SUN_EXCLUDE = [
  String.raw`apres ?soleil`,
  String.raw`après ?soleil`,
  String.raw`autobronz`,
  String.raw`\bhuile\b`,
  String.raw`\bhle\b`,
  String.raw`enfant`,
  String.raw`dermoped`,
  String.raw`\bkids\b`,
  String.raw`junior`,
  String.raw`\d+ ?mois`,
  String.raw`bebe`,
  String.raw`bébé`,
  String.raw`\blait\b`,
  String.raw`\bcorps\b`,
  String.raw`\bcorp\b`,
  String.raw`levre`,
  String.raw`lèvre`,
  String.raw`stick`,
  String.raw`brume`,
  String.raw`\bspr\b`,
  String.raw`spray`,
  String.raw`spf ?(15|20|30)\b`,
];
export const SUN_PREFER = [String.raw`sun oil control`, String.raw`oil control`, String.raw`toucher sec`, String.raw`dry touch`, String.raw`non comedog`, String.raw`peau grasse`, String.raw`visag`, String.raw`\bvis\b`, String.raw`fluide`, String.raw`\bmat\b`];

/** Un lavant doux, sans savon : le document cite le Lipikar Syndet AP+. Le gommage « purifiant » n'est pas un lavant. */
export const GENTLE_CLEANSER_EXCLUDE = [...EXFOLIANT, String.raw`purifiant`, String.raw`solaire`, String.raw`\bspf`];
export const CLEANSER_REFUSED = String.raw`(?:gommage|exfoli|peeling|scrub|purifiant|\baha\b|\bbha\b)`;
export const GENTLE_CLEANSER_PREFER = [
  String.raw`^(?!.*${CLEANSER_REFUSED}).*lipikar syndet`,
  String.raw`^(?!.*${CLEANSER_REFUSED}).*(?:syndet|sans savon|sans parfum|surgras|pain dermatologique)`,
];

/** Un émollient de peau atopique : pas un exfoliant, pas un solaire, pas un lavant (« HLE LAVANTE », « GEL LAVANT », « SYNDET »), pas un soin des lèvres. Le Lipikar AP+ est la référence citée. */
export const EMOLLIENT_EXCLUDE = [...EXFOLIANT, String.raw`solaire`, String.raw`\bspf`, String.raw`levres`, String.raw`lèvres`, String.raw`anti ?age`, String.raw`anti ?rides`, String.raw`\blav`, String.raw`syndet`, String.raw`nettoy`, String.raw`\bdch?e?\b`, String.raw`gel douche`, String.raw`\bpain\b`];
// L'ORDRE est décisif au départage : la référence citée par le document d'abord, puis les descripteurs.
export const EMOLLIENT_REFUSED = String.raw`(?:gommage|exfoli|peeling|scrub|solaire|\bspf|\blav|syndet|nettoy|\bpain\b)`;
export const EMOLLIENT_PREFER = [String.raw`^(?!.*${EMOLLIENT_REFUSED}).*lipikar.*ap`, String.raw`^(?!.*${EMOLLIENT_REFUSED}).*(?:emollient|atopi|peau seche)`];

export const PREGNANCY_BLOCK = (drug: string) => (patient: { isPregnant: boolean | null }) =>
  patient.isPregnant === true
    ? `Grossesse : ${drug} est contre-indiqué pendant la grossesse et en cas de projet de grossesse (RCP, rubrique 4.3). Pas de conseil cosmétique : le traitement relève du prescripteur.`
    : null;

/** Un hydratant qui accompagne un traitement irritant : les trois lignes acné du document partagent leur forme. */
export const COMMON_MOISTURIZER = {
  kind: "TOLERANCE" as const,
  version: "1.0",
  validation: { status: "PENDING" as const },
  triggerMode: "CLASS_ONLY" as const,
  category: "DERMOCOSMETIQUE" as const,
  therapeuticClasses: [] as string[],
  sideEffectTriggers: [] as string[],
  basePriority: 72,
  matchingTags: ["hydratation", "peau sensible", "apaisant"],
  excludeTags: ["parfum"],
  productExclude: [...NOT_A_FACE_MOISTURIZER, ...EXFOLIANT],
  productPrefer: FACE_MOISTURIZER_PREFER,
  benefits: ["Peau moins sèche, moins tiraillée", "Non comédogène à privilégier", "Pas d'exfoliant en plus"],
};


export const PROTECTION = "Évitez aussi l'exposition répétée au soleil et aux UV : ils irritent davantage la peau.";

/**
 * Des motifs de préférence qui refusent d'abord ce que la règle écarte : un motif préféré lève une exclusion
 * (matching.ts), donc chacun doit refuser lui-même les exfoliants, les solaires, les lavants… avant de préférer.
 * L'ORDRE est décisif au départage : la référence citée par le document d'abord, puis les descripteurs.
 */
export const refusing = (refused: string, ...patterns: string[]): string[] => patterns.map((pattern) => `^(?!.*${refused}).*${pattern}`);

// -----------------------------------------------------------------------------
// Les produits que plusieurs séries conseillent.
// -----------------------------------------------------------------------------

/** Un hydratant pour peau sensible : Toleriane Dermallergo en tête, puis un hydratant de visage non comédogène, jamais un exfoliant. */
export const SENSITIVE_MOISTURIZER_PREFER = refusing(REFUSED_FIRST, String.raw`toleriane.*(?:dermallergo|creme)`, String.raw`(?:peau sensible|apais|non comedog)`, String.raw`visag`);

export const SENSITIVE_MOISTURIZER = {
  ...COMMON_MOISTURIZER,
  basePriority: 68,
  productExclude: [...NOT_A_FACE_MOISTURIZER, ...EXFOLIANT, String.raw`purifiant`],
  productPrefer: SENSITIVE_MOISTURIZER_PREFER,
  benefits: ["Peau moins sèche, moins tiraillée", "Pour peau sensible", "Après séchage du médicament"],
};

/** L'émollient du psoriasis ou de l'après-gale : le Lipikar AP+M cité par le document, jamais un exfoliant ni un lavant. */
export const EMOLLIENT_BASE = {
  matchingTags: ["émollient", "hydratation", "peau sensible", "apaisant"],
  productExclude: [...EMOLLIENT_EXCLUDE],
  productPrefer: EMOLLIENT_PREFER,
  benefits: ["Peau moins sèche", "Appliqué séparément du médicament", "Sans parfum à privilégier"],
};


/** Un baume labial réparateur : le Cicaplast Lèvres cité par le document d'abord. Ni gloss, ni rouge à lèvres, ni soin du bouton de fièvre. */
export const LIP_BALM_EXCLUDE = [
  String.raw`gommage`, String.raw`exfoli`, String.raw`teint`, String.raw`gloss`, String.raw`rouge a levres`, String.raw`fievre`, String.raw`herpes`, String.raw`bouton`,
  String.raw`\bkids\b`, String.raw`chamallow`, String.raw`bubble`, String.raw`vanille`, String.raw`cola\b`, String.raw`\bmain`,
];
export const LIP_BALM_PREFER = [String.raw`cicaplast.*(?:lev|baume)`, String.raw`baume`, String.raw`stick`, String.raw`levres`, String.raw`lèvres`, String.raw`\blev\b`, String.raw`ceralip`, String.raw`reparat`];

/** Une crème pour les mains : le Cicaplast Mains cité par le document d'abord. Jamais un gel hydroalcoolique, un savon ni un exfoliant. */
export const HAND_CARE_EXCLUDE = [...EXFOLIANT, String.raw`hydroalcool`, String.raw`desinfect`, String.raw`gel mains`, String.raw`savon`, String.raw`\blav`, String.raw`levres`, String.raw`lèvres`, String.raw`solaire`, String.raw`\bspf`, String.raw`pieds`, String.raw`anti ?age`];
export const HAND_CARE_REFUSED = String.raw`(?:gommage|exfoli|peeling|scrub|hydroalcool|desinfect|savon|\blav|levres|solaire|\bspf|pieds)`;
export const HAND_CARE_PREFER = refusing(HAND_CARE_REFUSED, String.raw`cicaplast.*mains`, String.raw`(?:creme|soin|baume) ?mains`, String.raw`mains`);

/** Un émollient de peau atopique : le baume Atoderm AD Intensive cité par le document d'abord, puis le Lipikar AP+. */
export const ATOPIC_EMOLLIENT_PREFER = [...refusing(EMOLLIENT_REFUSED, String.raw`atoderm.*(?:ad|intensive).*baume`, String.raw`atoderm.*baume`), ...EMOLLIENT_PREFER];

/** Ce qui n'est pas un solaire de visage, sous la forme d'un motif à refuser avant de préférer (voir `refusing`). */
export const SUN_REFUSED = `(?:${SUN_EXCLUDE.join("|")})`;

/** Un solaire de visage très haute protection, sans parfum : l'Anthelios UVMUNE 400 cité par le document d'abord, puis les textures de visage. */
export const FACE_SUN_PREFER = refusing(SUN_REFUSED, String.raw`anthelios.*uvmune.*400.*(?:creme|fluide)`, String.raw`uvmune`, String.raw`(?:non comedog|visag|fluide|\bvis\b)`);

/** Un solaire de visage très haute protection, pour une peau fragilisée par un traitement : jamais un SPF 30 ou moins, un lait, une huile. */
export const FACE_SUN_BASE = {
  matchingTags: ["protection solaire", "spf", "photoprotection"],
  productExclude: SUN_EXCLUDE,
  productPrefer: FACE_SUN_PREFER,
  benefits: ["Très haute protection, sans parfum à privilégier", "À renouveler régulièrement", "Complète l'éviction du soleil, ne la remplace pas"],
};

/** Le shampooing doux des lavages intermédiaires : jamais un antipelliculaire, un shampooing d'enfant, d'animal ou de coiffage. */
export const MILD_SHAMPOO_EXCLUDE = [
  String.raw`pellic`, String.raw`anti ?pel\b`, String.raw`kelual`, String.raw`ketoconazole`, String.raw`ketoderm`, String.raw`selsun`, String.raw`selenium sulf`, String.raw`ciclopirox`, String.raw`traitant`, String.raw`\bds\b`,
  String.raw`\bbb\b`, String.raw`bebe`, String.raw`mustela`, String.raw`enfant`, String.raw`kids`, String.raw`poux`, String.raw`canin`, String.raw`chien`, String.raw`\bchat\b`,
  String.raw`\bsec\b`, String.raw`\bdch\b`, String.raw`sport`, String.raw`douche`, String.raw`sans rin`, String.raw`spray`, String.raw`\bspr\b`, String.raw`solide`, String.raw`masq`, String.raw`teint`, String.raw`croissance`, String.raw`densite`, String.raw`epaiss`, String.raw`keratine`, String.raw`solaire`, String.raw`demelant`,
];
export const MILD_SHAMPOO_REFUSED = String.raw`(?:pellic|kelual|ketoconazole|traitant|\bds\b|\bbb\b|bebe|mustela|enfant|\bsec\b)`;
export const MILD_SHAMPOO_PREFER = refusing(MILD_SHAMPOO_REFUSED, String.raw`node.*(?:fluid|shp|shamp)`, String.raw`(?:physio.*\bsh\b|shampooing doux|usage frequent|\bdoux\b)`);

// -----------------------------------------------------------------------------
// Les fabriques : une règle de conseil ou une vigilance, avec ses valeurs par défaut.
// -----------------------------------------------------------------------------

export const BDPM = "Base de données publique des médicaments (ANSM)";


/** Les champs que toutes les règles « conseil peau » écrivent de la même façon. */
type AdviceDefaults = "kind" | "version" | "validation" | "triggerMode" | "category" | "therapeuticClasses" | "sideEffectTriggers" | "excludeTags";

/** Une règle de conseil de peau : à valider (PENDING), sur la classe du médicament seulement, dermocosmétique. */
export function skinAdvice(rule: Omit<AdviceRule, AdviceDefaults> & Partial<Pick<AdviceRule, AdviceDefaults>>): AdviceRule {
  return {
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "DERMOCOSMETIQUE",
    therapeuticClasses: [],
    sideEffectTriggers: [],
    excludeTags: ["parfum"],
    ...rule,
  };
}

type VigilanceDefaults = "version" | "severity" | "substances" | "blockTags" | "cautionTags" | "precautionText" | "patientAdvice" | "concerned";

/** Une vigilance de peau : version 1.0, sans étiquette écartée ni précaution tant qu'elle ne les déclare pas. */
export function skinVigilance(rule: Omit<VigilanceRule, VigilanceDefaults> & Partial<Pick<VigilanceRule, VigilanceDefaults>>): VigilanceRule {
  return {
    version: "1.0",
    severity: "WARNING",
    substances: [],
    concerned: [],
    patientAdvice: null,
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    ...rule,
  };
}
