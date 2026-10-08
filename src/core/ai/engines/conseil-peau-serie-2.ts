import type { AdviceRule } from "./advice";
import type { VigilanceRule } from "./vigilance";

/**
 * « Conseil peau — Série 2 » : acné, photoprotection, eczéma, cuir chevelu.
 *
 * Document reçu le 7 octobre 2026. Pour chaque médicament déclencheur : la
 * question à poser au patient, le produit conseil à envisager, les conditions
 * et précautions, ET ce qu'il ne faut pas associer ni faire. C'est cette
 * dernière colonne qui distingue PharmaBoost d'un simple poussoir de produits :
 * le conseil est accompagné de ce qui doit rester à l'écart.
 *
 * Le document est la source des CHOIX (quel produit pour quel médicament, quelle
 * question) ; les RCP de la base de données publique des médicaments (ANSM) sont
 * la source des FAITS (« à espacer de 2 heures », « contre-indiqué », « pas de
 * pansement occlusif »). Chaque fait de la colonne « à ne pas associer » a été
 * relu dans le RCP le 7 octobre 2026 ; ce qui ne vient que du document (Vidal,
 * fabricants) est dit tel dans docs/conseil-peau-serie-2.md.
 *
 * Trois niveaux, que la carte du comptoir distingue :
 *   • CONTRAINDICATION — le RCP l'interdit (grossesse sous Epiduo, Curacné sous
 *     doxycycline) ;
 *   • INTERACTION      — à espacer (déjà portée par `cycline-quinolone-chelation`) ;
 *   • AVOID            — déconseillé en ajout : tolérance et pertinence, sans
 *     interdiction nominative du RCP. La carte le dit : « le RCP ne cite aucun
 *     produit ». Un produit n'est jamais présenté comme contre-indiqué quand il
 *     ne l'est pas.
 *
 * Les marques citées dans le document sont des EXEMPLES à choisir selon le
 * besoin, la tolérance, l'âge et le stock : elles servent de préférence d'ordre
 * (`productPrefer`) et d'exclusion, jamais d'obligation. « Association à une
 * catégorie ≠ preuve d'une combinaison commerciale » (document, page 3).
 *
 * Toutes les règles sont `PENDING` : écrites et testées, pas encore relues par
 * le pharmacien signataire.
 */

const DOCUMENT = "peau-serie-2";
const rows = (...numbers: number[]) => ({ document: DOCUMENT, rows: numbers });

const DOCUMENT_SOURCE = "Document PharmaBoost « Conseil peau — Série 2 » (7 octobre 2026)";
const BDPM = "Base de données publique des médicaments (ANSM)";

const RCP = {
  cutacnyl: `RCP Cutacnyl 2,5 % gel — ${BDPM}, CIS 60809088`,
  epiduo: `RCP Epiduo 0,1 %/2,5 % gel — ${BDPM}, CIS 60972530`,
  effederm: `RCP Effederm 0,05 % crème — ${BDPM}, CIS 67020138`,
  doxycycline: `RCP Doxycycline Sandoz 100 mg — ${BDPM}, CIS 60982364`,
  protopic: `RCP Protopic 0,1 % pommade (rubriques 4.2 et 4.4) — ${BDPM}, CIS 63213392`,
  locoid: `RCP Locoid 0,1 % crème — ${BDPM}, CIS 66841235`,
  gerda: `RCP Ciclopirox olamine Gerda 1,5 % shampooing — ${BDPM}, CIS 60655327`,
} as const;

// -----------------------------------------------------------------------------
// Ce que les rayons nomment, dit par motifs (nom du produit sans accents, en minuscules).
// -----------------------------------------------------------------------------

/** Un exfoliant, mécanique ou chimique : le document déconseille d'en ajouter à ces traitements. */
const EXFOLIANT = [
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
const NOT_A_FACE_MOISTURIZER = [
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
const REFUSED_FIRST = `(?:${[...EXFOLIANT, ...NOT_A_FACE_MOISTURIZER].join("|")})`;
const FACE_MOISTURIZER_PREFER = [
  String.raw`^(?!.*${REFUSED_FIRST}).*dermopure.*hydra`,
  String.raw`^(?!.*${REFUSED_FIRST}).*hydra repair`,
  String.raw`^(?!.*${REFUSED_FIRST}).*non comedog`,
  String.raw`^(?!.*${REFUSED_FIRST}).*visag`,
];

/** Même exclusion que l'étape « protéger » de la routine sous isotrétinoïne : un solaire de visage, indice élevé, pas un produit enfant, un spray ou une huile. */
const SUN_EXCLUDE = [
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
const SUN_PREFER = [String.raw`sun oil control`, String.raw`oil control`, String.raw`toucher sec`, String.raw`dry touch`, String.raw`non comedog`, String.raw`peau grasse`, String.raw`visag`, String.raw`\bvis\b`, String.raw`fluide`, String.raw`\bmat\b`];

/** Un lavant doux, sans savon : le document cite le Lipikar Syndet AP+. Le gommage « purifiant » n'est pas un lavant. */
const GENTLE_CLEANSER_EXCLUDE = [...EXFOLIANT, String.raw`purifiant`, String.raw`solaire`, String.raw`\bspf`];
const CLEANSER_REFUSED = String.raw`(?:gommage|exfoli|peeling|scrub|purifiant|\baha\b|\bbha\b)`;
const GENTLE_CLEANSER_PREFER = [
  String.raw`^(?!.*${CLEANSER_REFUSED}).*lipikar syndet`,
  String.raw`^(?!.*${CLEANSER_REFUSED}).*(?:syndet|sans savon|sans parfum|surgras|pain dermatologique)`,
];

/** Un émollient de peau atopique : pas un exfoliant, pas un solaire, pas un lavant (« HLE LAVANTE », « GEL LAVANT », « SYNDET »), pas un soin des lèvres. Le Lipikar AP+ est la référence citée. */
const EMOLLIENT_EXCLUDE = [...EXFOLIANT, String.raw`solaire`, String.raw`\bspf`, String.raw`levres`, String.raw`lèvres`, String.raw`anti ?age`, String.raw`anti ?rides`, String.raw`\blav`, String.raw`syndet`, String.raw`nettoy`, String.raw`\bdch?e?\b`, String.raw`gel douche`, String.raw`\bpain\b`];
// L'ORDRE est décisif au départage : la référence citée par le document d'abord, puis les descripteurs.
const EMOLLIENT_REFUSED = String.raw`(?:gommage|exfoli|peeling|scrub|solaire|\bspf|\blav|syndet|nettoy|\bpain\b)`;
const EMOLLIENT_PREFER = [String.raw`^(?!.*${EMOLLIENT_REFUSED}).*lipikar.*ap`, String.raw`^(?!.*${EMOLLIENT_REFUSED}).*(?:emollient|atopi|peau seche)`];

const PREGNANCY_BLOCK = (drug: string) => (patient: { isPregnant: boolean | null }) =>
  patient.isPregnant === true
    ? `Grossesse : ${drug} est contre-indiqué pendant la grossesse et en cas de projet de grossesse (RCP, rubrique 4.3). Pas de conseil cosmétique : le traitement relève du prescripteur.`
    : null;

/** Un hydratant qui accompagne un traitement irritant : les trois lignes acné du document partagent leur forme. */
const COMMON_MOISTURIZER = {
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

export const SKIN_SERIES_2_ADVICE_RULES: AdviceRule[] = [
  // ---- 1. Peroxyde de benzoyle (Cutacnyl) -------------------------------------------------------
  {
    ...COMMON_MOISTURIZER,
    key: "skin-bpo-moisturizer",
    title: "Hydratant sous peroxyde de benzoyle",
    documentRows: rows(1),
    atcPrefixes: ["D10AE"],
    question: "Votre peau tiraille-t-elle ou pèle-t-elle ? Avez-vous déjà un hydratant ? (Oui : elle tiraille ou pèle, sans hydratant adapté déjà utilisé.)",
    confirmedReasonTemplate: "Peau qui tiraille ou pèle sous {drug}, sans hydratant adapté : le conseil est justifié.",
    shortReasonTemplate: "Peroxyde de benzoyle ({drug}) : sécheresse et desquamation de la peau très fréquentes.",
    rationaleTemplate:
      "Sous peroxyde de benzoyle ({drug}), la sécheresse cutanée, la rougeur et la desquamation sont très fréquentes (RCP). Un hydratant non comédogène aide à supporter le traitement. À l'inverse, le RCP demande d'éviter les autres traitements locaux kératolytiques ou détersifs : pas d'exfoliant ajouté.",
    counterScriptTemplate:
      "« Sous {drug}, la peau peut tirailler ou peler. Un hydratant non comédogène aide à mieux supporter le traitement : {product} peut convenir. Pas de gommage ni d'acide exfoliant en plus. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) peut dessécher la peau et la faire peler. {product} l'hydrate sans boucher les pores. Évitez les gommages et les acides en plus.",
    clinicalContext: `${RCP.cutacnyl} : sécheresse, érythème, desquamation « très fréquents » ; « éviter, en règle générale, l'emploi concomitant avec d'autres thérapeutiques locales kératolytiques ou détersives ». Le RCP ne recommande pas nommément un hydratant : le choix vient du document.`,
    safetyNotes: [
      "Pas d'exfoliant ni de cosmétique irritant en plus du traitement.",
      "Irritation importante : réévaluer le traitement avec le prescripteur, ne pas simplement ajouter un soin.",
    ],
  },
  // ---- 2. Adapalène + peroxyde de benzoyle (Epiduo) ---------------------------------------------
  {
    ...COMMON_MOISTURIZER,
    key: "skin-adapalene-bpo-moisturizer",
    title: "Hydratant sous adapalène + peroxyde de benzoyle",
    documentRows: rows(2),
    atcPrefixes: ["D10AD53"],
    question: "Le gel vous provoque-t-il une sécheresse ou une irritation ? (Oui : sécheresse ou irritation sous le gel.)",
    confirmedReasonTemplate: "Sécheresse ou irritation sous {drug} : le RCP recommande un hydratant non comédogène.",
    shortReasonTemplate: "Adapalène + peroxyde de benzoyle ({drug}) : irritation et sécheresse de la peau fréquentes.",
    rationaleTemplate:
      "Le RCP d'Epiduo ({drug}) dit : « en cas d'irritation, recommander au patient d'appliquer un produit hydratant non-comédogène, d'espacer les applications ». Il ne faut ajouter ni autre rétinoïde, ni autre peroxyde de benzoyle, et l'emploi de cosmétiques astringents, irritants ou desséchants se fait avec précaution.",
    counterScriptTemplate:
      "« Avec {drug}, une sécheresse ou une irritation est fréquente. Un hydratant non comédogène est prévu en cas d'irritation : {product} peut convenir. Pas d'autre produit à base de rétinoïde ou de peroxyde de benzoyle en même temps. »",
    patientReasonTemplate:
      "Votre gel ({drug}) peut irriter et dessécher la peau. {product} l'hydrate sans boucher les pores. Ne l'associez à aucun autre produit contre l'acné sans demander conseil.",
    clinicalContext: `${RCP.epiduo}, rubrique 4.4 : « En cas d'irritation, recommander au patient d'appliquer un produit hydratant non-comédogène, d'espacer les applications ». Grossesse et projet de grossesse : contre-indiqués (rubrique 4.3).`,
    safetyNotes: [
      "Grossesse ou projet de grossesse : contre-indiqué — alerte avant tout conseil.",
      "Pas d'autre rétinoïde ni peroxyde de benzoyle en même temps (RCP).",
    ],
    blockedFor: PREGNANCY_BLOCK("Epiduo"),
  },
  // ---- 3. Trétinoïne cutanée (Effederm) ---------------------------------------------------------
  {
    ...COMMON_MOISTURIZER,
    key: "skin-tretinoin-moisturizer",
    title: "Hydratant sous trétinoïne cutanée",
    documentRows: rows(3),
    atcPrefixes: ["D10AD01"],
    question: "Votre peau devient-elle sèche ? Utilisez-vous des gommages ou des acides ? (Oui : la peau devient sèche, sans soin adapté.)",
    confirmedReasonTemplate: "Peau sèche sous {drug}, sans soin adapté : le conseil est justifié.",
    shortReasonTemplate: "Trétinoïne cutanée ({drug}) : peau irritée et sèche, à accompagner d'un soin adapté.",
    rationaleTemplate:
      "La trétinoïne cutanée ({drug}) est irritante : le RCP demande d'éviter les cosmétiques nettoyants astringents et les agents desséchants ou irritants (produits parfumés ou alcoolisés). Un hydratant non comédogène peut aider si la peau est sèche et qu'aucun soin adapté n'est utilisé. Le RCP ne cite aucun exfoliant nommément : ils sont déconseillés par déduction.",
    counterScriptTemplate:
      "« {drug} irrite et assèche la peau. Si elle devient sèche, un hydratant non comédogène aide : {product} peut convenir. Évitez les gommages, les acides et les produits parfumés ou alcoolisés. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) irrite et dessèche la peau. {product} l'hydrate sans boucher les pores. Évitez gommages, acides et produits parfumés ou alcoolisés.",
    clinicalContext: `${RCP.effederm} : « l'usage concomitant de produits cosmétiques nettoyants astringents et d'agents desséchants ou irritants (tels que produits parfumés ou alcoolisés) est à éviter ». Grossesse et projet de grossesse : contre-indiqués (rubrique 4.3).`,
    safetyNotes: [
      "Grossesse ou projet de grossesse : contre-indiqué — alerte prioritaire, pas un simple conseil cosmétique.",
      "Pas de cosmétique irritant : le RCP ne nomme aucun produit, la liste est déduite des caractéristiques.",
    ],
    blockedFor: PREGNANCY_BLOCK("Effederm"),
  },
  // ---- 4. Doxycycline orale ---------------------------------------------------------------------
  {
    key: "skin-doxycycline-photoprotection",
    title: "Photoprotection sous doxycycline",
    documentRows: rows(4),
    kind: "SAFETY",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["J01AA02"],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 86,
    question: "Êtes-vous exposé au soleil, notamment pour votre travail ou vos déplacements ? (Oui : le patient s'expose au soleil.)",
    confirmedReasonTemplate: "Exposition au soleil sous {drug} : la photoprotection est justifiée.",
    matchingTags: ["protection solaire", "spf", "photoprotection"],
    excludeTags: [],
    productExclude: SUN_EXCLUDE,
    productPrefer: SUN_PREFER,
    benefits: ["Prévient la réaction au soleil", "SPF 50+, toucher sec", "À renouveler régulièrement"],
    shortReasonTemplate: "Doxycycline ({drug}) : risque de photosensibilisation, soleil et UV à éviter.",
    rationaleTemplate:
      "Le RCP de la doxycycline ({drug}) conseille « d'éviter toute exposition directe au soleil et aux U.V. » (photosensibilisation). La priorité est d'éviter le soleil direct et de couvrir la peau ; la photoprotection complète ces mesures, elle ne les remplace pas. Pour une peau à tendance acnéique, une texture non comédogène à toucher sec est à privilégier.",
    counterScriptTemplate:
      "« Avec {drug}, la peau réagit plus facilement au soleil : évitez l'exposition directe et couvrez-vous. {product} complète ces mesures, avec une texture adaptée à une peau à tendance acnéique. En cas de rougeurs après exposition, suivez la notice et prévenez votre médecin. »",
    patientReasonTemplate:
      "Pendant votre traitement ({drug}), votre peau supporte moins bien le soleil. {product} protège le visage, en complément d'une exposition réduite et de vêtements couvrants.",
    clinicalContext: `${RCP.doxycycline}, rubrique 4.4 : « En raison des risques de photosensibilisation, il est conseillé d'éviter toute exposition directe au soleil et aux U.V. » ; rubrique 4.8 : réactions de photosensibilisation. Le solaire complète les mesures, il ne les remplace pas.`,
    safetyNotes: [
      "Éviter le soleil direct et les UV : la photoprotection complète ces mesures, elle ne les remplace pas.",
      "Rougeurs sous exposition : appliquer les consignes de la notice et contacter le prescripteur.",
    ],
  },
  // ---- 5. Dermocorticoïde cutané — émollient ----------------------------------------------------
  {
    key: "skin-corticoid-atopic-emollient",
    title: "Émollient sous dermocorticoïde (eczéma atopique)",
    documentRows: rows(5),
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["D07A"],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 70,
    // Un dermocorticoïde a plusieurs indications (RCP Locoid : eczéma de contact, dermatite atopique, psoriasis, dermite
    // séborrhéique…) : le nom seul ne dit pas que la peau est atopique. La question est le garde-fou.
    question: "Pour quelle affection cette crème est-elle prescrite ? Avez-vous un émollient quotidien ? (Oui : eczéma atopique ou peau sèche confirmés, sans émollient quotidien.)",
    confirmedReasonTemplate: "Eczéma atopique ou peau sèche confirmés sous {drug}, sans émollient quotidien : le conseil est justifié.",
    matchingTags: ["émollient", "hydratation", "peau sensible", "apaisant"],
    excludeTags: ["parfum"],
    productExclude: [...EMOLLIENT_EXCLUDE],
    productPrefer: EMOLLIENT_PREFER,
    benefits: ["Peau atopique moins sèche", "Soin quotidien, même hors poussée", "Sans parfum à privilégier"],
    shortReasonTemplate: "Dermocorticoïde ({drug}) : si l'eczéma atopique est confirmé, un émollient quotidien complète le traitement.",
    rationaleTemplate:
      "Un dermocorticoïde ({drug}) a plusieurs indications : le nom seul ne suffit pas, d'où la question. Si l'eczéma atopique ou la peau sèche est confirmé, un émollient quotidien fait partie de la prise en charge (Vidal, dermatite atopique). Il s'ajoute au traitement, il ne se mélange pas au dermocorticoïde et ne modifie pas la prescription.",
    counterScriptTemplate:
      "« En plus de {drug} pour votre eczéma, un émollient chaque jour entretient la peau entre deux poussées. {product} peut convenir. Appliquez-le séparément, sans le mélanger à votre crème. »",
    patientReasonTemplate:
      "En plus de votre traitement ({drug}), un émollient quotidien aide à garder la peau souple entre les poussées. {product} s'applique séparément, sans mélange avec votre crème.",
    clinicalContext: `${RCP.locoid} : indications privilégiées « eczéma de contact » et « dermatite atopique », mais aussi dermite de stase, psoriasis, dermite séborrhéique : le nom du médicament ne désigne pas l'affection. Émollient et dermatite atopique : Vidal (référence du document).`,
    safetyNotes: [
      "Ne pas mélanger l'émollient au dermocorticoïde, ne pas modifier la prescription.",
      "Pas de gommage ni d'exfoliant sur les zones eczémateuses.",
    ],
  },
  // ---- 6. Dermocorticoïde cutané — hygiène ------------------------------------------------------
  {
    key: "skin-corticoid-atopic-cleanser",
    title: "Lavant doux sous dermocorticoïde (eczéma atopique)",
    documentRows: rows(6),
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["D07A"],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 64,
    question: "Avec quoi vous lavez-vous ? Est-ce que cela dessèche la peau ? (Oui : eczéma atopique confirmé, avec un lavant qui dessèche ou irrite.)",
    confirmedReasonTemplate: "Eczéma atopique confirmé sous {drug}, lavant qui dessèche : un lavant doux est justifié.",
    matchingTags: ["nettoyant"],
    excludeTags: ["parfum"],
    productExclude: GENTLE_CLEANSER_EXCLUDE,
    productPrefer: GENTLE_CLEANSER_PREFER,
    benefits: ["Lave sans dessécher", "Sans savon, sans parfum", "Douche tiède"],
    shortReasonTemplate: "Dermocorticoïde ({drug}) : si l'eczéma atopique est confirmé, un lavant doux évite d'irriter la peau.",
    rationaleTemplate:
      "Sur une peau atopique traitée par dermocorticoïde ({drug}), un lavant irritant dessèche et entretient l'inflammation. Si le lavant habituel dessèche ou irrite, un lavant doux sans savon et sans parfum le remplace (Vidal Reco, dermatite atopique de l'adulte : soins d'hygiène). Douches tièdes, lavage doux, rinçage. Il ne remplace pas le traitement prescrit.",
    counterScriptTemplate:
      "« Avec {drug}, on évite ce qui dessèche la peau : douches tièdes, lavage doux et rinçage. {product} est un lavant doux, sans savon. Il ne remplace pas votre traitement. »",
    patientReasonTemplate:
      "Pour votre peau atopique, un lavant doux évite de l'irriter pendant que {drug} agit. {product} se rince à l'eau tiède. Il ne remplace pas votre traitement.",
    clinicalContext: `${RCP.locoid} : le nom du médicament ne désigne pas l'affection, d'où la question. Soins d'hygiène de la dermatite atopique de l'adulte : Vidal Reco (référence du document).`,
    safetyNotes: [
      "Produit d'hygiène : il ne remplace pas le traitement prescrit.",
      "Éviter les allergènes de contact connus du patient.",
    ],
  },
  // ---- 7. Tacrolimus cutané (Protopic) ----------------------------------------------------------
  {
    key: "skin-tacrolimus-emollient",
    title: "Émollient sous tacrolimus cutané",
    documentRows: rows(7),
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["D11AH01"],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 70,
    question: "Avez-vous un émollient ? À quel moment l'appliquez-vous par rapport à Protopic ? (Oui : pas d'émollient, ou un émollient appliqué trop près de la pommade.)",
    confirmedReasonTemplate: "Pas d'émollient adapté, ou délai avec {drug} non respecté : le conseil est justifié.",
    matchingTags: ["émollient", "hydratation", "peau sensible", "apaisant"],
    excludeTags: ["parfum"],
    productExclude: [...EMOLLIENT_EXCLUDE],
    productPrefer: EMOLLIENT_PREFER,
    benefits: ["Peau atopique moins sèche", "Après un délai de 2 heures", "Sans parfum à privilégier"],
    shortReasonTemplate: "Tacrolimus cutané ({drug}) : un émollient s'applique, mais pas dans les 2 heures sur la même zone.",
    rationaleTemplate:
      "Le RCP de Protopic ({drug}) dit : « Un délai de 2 heures doit être respecté en cas d'application de préparations émollientes sur la même zone ». Un émollient adapté à la peau atopique est donc possible, après ce délai. L'usage d'autres produits topiques n'a pas été évalué avec Protopic.",
    counterScriptTemplate:
      "« Avec {drug}, l'émollient est utile mais pas sur la même zone dans les 2 heures qui suivent la pommade : attendez, puis appliquez {product}. Pas de pansement ni de bandage par-dessus la pommade. »",
    patientReasonTemplate:
      "Avec votre pommade ({drug}), attendez 2 heures avant d'appliquer {product} sur la même zone. Pas de pansement ni de bandage sur la pommade.",
    clinicalContext: `${RCP.protopic} : « Un délai de 2 heures doit être respecté en cas d'application de préparations émollientes sur la même zone que Protopic pommade. L'usage concomitant d'autres produits topiques n'a pas été évalué. »`,
    safetyNotes: [
      "2 heures entre Protopic et l'émollient sur la même zone ; l'émollient reste utilisable après cet intervalle.",
      "Signe d'infection de la peau : avis médical avant d'appliquer Protopic.",
    ],
  },
  // ---- 8. Ciclopirox olamine, shampooing (Gerda) ------------------------------------------------
  {
    key: "skin-ciclopirox-shampoo",
    title: "Shampooing doux entre les applications de ciclopirox",
    documentRows: rows(8),
    kind: "TOLERANCE",
    version: "1.0",
    validation: { status: "PENDING" },
    triggerMode: "CLASS_ONLY",
    category: "DERMOCOSMETIQUE",
    atcPrefixes: ["D01AE14"],
    therapeuticClasses: [],
    sideEffectTriggers: [],
    basePriority: 62,
    question: "Quel shampooing utilisez-vous entre les applications du traitement ? (Oui : pas de shampooing doux entre les applications.)",
    confirmedReasonTemplate: "Pas de shampooing doux entre les applications de {drug} : le conseil est justifié.",
    matchingTags: ["shampooing", "cuir chevelu"],
    excludeTags: [],
    // Un autre antipelliculaire n'est pas ajouté d'office pendant le traitement (document : « ajout à vérifier »).
    // Le stock réel abrège (« SH », « SHP », « A/PELLIC ») : les motifs lisent ces abréviations. Ni bébé, ni animal, ni anti-poux, ni shampooing sec ou de coiffage.
    productExclude: [
      String.raw`pellic`, String.raw`anti ?pel\b`, String.raw`kelual`, String.raw`ketoconazole`, String.raw`ketoderm`, String.raw`selsun`, String.raw`selenium sulf`, String.raw`ciclopirox`, String.raw`traitant`, String.raw`\bds\b`,
      String.raw`\bbb\b`, String.raw`bebe`, String.raw`mustela`, String.raw`enfant`, String.raw`kids`, String.raw`poux`, String.raw`canin`, String.raw`chien`, String.raw`\bchat\b`,
      String.raw`\bsec\b`, String.raw`\bdch\b`, String.raw`sport`, String.raw`douche`, String.raw`sans rin`, String.raw`spray`, String.raw`\bspr\b`, String.raw`solide`, String.raw`masq`, String.raw`teint`, String.raw`croissance`, String.raw`densite`, String.raw`epaiss`, String.raw`keratine`, String.raw`solaire`, String.raw`demelant`,
    ],
    // Le Nodé Fluide, cité par le document, passe en tête (l'ordre départage) ; puis les shampooings doux.
    productPrefer: [
      String.raw`^(?!.*(?:pellic|kelual|ketoconazole|traitant|\bds\b|\bbb\b|bebe|mustela|enfant|\bsec\b)).*node.*(?:fluid|shp|shamp)`,
      String.raw`^(?!.*(?:pellic|kelual|ketoconazole|traitant|\bds\b|\bbb\b|bebe|mustela|enfant|\bsec\b)).*(?:physio.*\bsh\b|shampooing doux|usage frequent|\bdoux\b)`,
    ],
    benefits: ["Lavage doux entre les applications", "Calendrier du traitement conservé", "Tolérance du parfum à vérifier"],
    shortReasonTemplate: "Ciclopirox shampooing ({drug}) : un shampooing doux est prévu entre les applications.",
    rationaleTemplate:
      "Le RCP du shampooing au ciclopirox ({drug}) dit : « Un shampooing doux peut être utilisé entre les applications du shampooing à 1,5 % de ciclopirox olamine ». Le traitement s'applique deux à trois fois par semaine pendant 4 semaines : le calendrier est conservé, le shampooing doux fait les lavages intermédiaires.",
    counterScriptTemplate:
      "« Avec {drug}, un shampooing doux est prévu pour les lavages entre les applications : {product} peut convenir. Gardez le calendrier prescrit, deux à trois fois par semaine. »",
    patientReasonTemplate:
      "Entre deux applications de votre shampooing traitant ({drug}), {product} lave les cheveux en douceur. Gardez le calendrier prescrit.",
    clinicalContext: `${RCP.gerda} : « Un shampooing doux peut être utilisé entre les applications du shampooing à 1,5 % de ciclopirox olamine » ; « deux à trois fois par semaine » ; durée recommandée 4 semaines. Un autre antipelliculaire n'est pas ajouté d'office : aucune incompatibilité démontrée dans les sources consultées, mais le calendrier est à valider.`,
    safetyNotes: [
      "Conserver le calendrier prescrit (2 à 3 fois par semaine).",
      "Vérifier la tolérance d'un shampooing parfumé.",
    ],
  },
];

// -----------------------------------------------------------------------------
// Les vigilances : ce qu'on n'associe pas, ce qu'on ne fait pas, ce qu'on espace.
// -----------------------------------------------------------------------------

const PROTECTION = "Évitez aussi l'exposition répétée au soleil et aux UV : ils irritent davantage la peau.";

export const SKIN_SERIES_2_VIGILANCES: VigilanceRule[] = [
  // ---- 1. Peroxyde de benzoyle ------------------------------------------------------------------
  {
    key: "skin-bpo-avoid",
    version: "1.0",
    kind: "AVOID",
    severity: "WARNING",
    title: "À éviter en plus du traitement",
    subtitle: "Peroxyde de benzoyle détecté",
    atcPrefixes: ["D10AE"],
    substances: ["peroxyde de benzoyle", "benzoyle", "cutacnyl"],
    explanationTemplate:
      "Sous peroxyde de benzoyle ({drug}), la peau sèche, rougit et pèle déjà. Le RCP demande d'éviter, en règle générale, l'emploi d'autres traitements locaux kératolytiques ou détersifs, et de la prudence avec les préparations qui font desquamer la peau ; il demande aussi de ne pas s'exposer de façon répétée au soleil et aux UV. Un exfoliant ou un acide ajouté cumule les irritations. Le RCP ne cite aucun produit nommément : ces exemples sont déconseillés en ajout par déduction.",
    concerned: [
      "Gommages et peelings",
      "Acides exfoliants (glycolique, salicylique, lactique…)",
      "Exemples déconseillés en ajout : Eucerin DermoPure Clinical Peeling 10, La Roche-Posay Effaclar Sérum Ultra Concentré",
      "Exposition répétée au soleil et aux UV",
    ],
    patientAdvice: `Pas de gommage ni d'acide exfoliant en plus de votre traitement. ${PROTECTION}`,
    blockTags: ["exfoliant"],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(1),
    sources: [RCP.cutacnyl, DOCUMENT_SOURCE],
  },
  // ---- 2. Adapalène + peroxyde de benzoyle ------------------------------------------------------
  {
    key: "skin-adapalene-bpo-contraindications",
    version: "1.0",
    kind: "CONTRAINDICATION",
    severity: "WARNING",
    title: "Contre-indications du traitement",
    subtitle: "Adapalène + peroxyde de benzoyle détecté",
    atcPrefixes: ["D10AD53"],
    substances: ["adapalene", "epiduo"],
    explanationTemplate:
      "Le RCP d'Epiduo ({drug}) contre-indique la grossesse et le projet de grossesse (rubrique 4.3) : alerte à lever avant tout conseil, c'est une question pour le prescripteur, pas pour un soin. Il interdit aussi l'emploi concomitant d'autres médicaments contenant des rétinoïdes, du peroxyde de benzoyle ou des substances de mode d'action similaire.",
    concerned: ["Grossesse ou projet de grossesse (contre-indiqué)", "Un autre médicament à base de rétinoïde ou de peroxyde de benzoyle en même temps"],
    patientAdvice: "N'utilisez pas en même temps un autre produit contenant un rétinoïde ou du peroxyde de benzoyle.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(2),
    sources: [RCP.epiduo, DOCUMENT_SOURCE],
  },
  {
    key: "skin-adapalene-bpo-avoid",
    version: "1.0",
    kind: "AVOID",
    severity: "WARNING",
    title: "À éviter en plus du traitement",
    subtitle: "Adapalène + peroxyde de benzoyle détecté",
    atcPrefixes: ["D10AD53"],
    substances: ["adapalene", "epiduo"],
    explanationTemplate:
      "Avec {drug}, le RCP demande de la précaution avec les produits cosmétiques astringents, irritants ou desséchants (irritation supplémentaire) et d'éviter l'exposition excessive au soleil ou aux lampes à UV. Les exfoliants s'ajoutent à cette irritation : déconseillés en ajout, sans validation. Le RCP ne cite aucun produit nommément.",
    concerned: [
      "Cosmétiques astringents, irritants ou desséchants",
      "Gommages, peelings et acides exfoliants",
      "Exemples déconseillés en ajout sans validation : Eucerin DermoPure Clinical Peeling 10, La Roche-Posay Effaclar Sérum Ultra Concentré",
      "Exposition excessive au soleil ou aux lampes à UV",
    ],
    patientAdvice: `Pas de gommage, d'acide ni de produit asséchant en plus du gel sans avis. ${PROTECTION}`,
    blockTags: ["exfoliant"],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(2),
    sources: [RCP.epiduo, DOCUMENT_SOURCE],
  },
  // ---- 3. Trétinoïne cutanée --------------------------------------------------------------------
  {
    key: "skin-tretinoin-pregnancy",
    version: "1.0",
    kind: "CONTRAINDICATION",
    severity: "WARNING",
    title: "Contre-indication du traitement",
    subtitle: "Trétinoïne cutanée détectée",
    atcPrefixes: ["D10AD01"],
    substances: ["effederm"],
    explanationTemplate:
      "Le RCP d'Effederm ({drug}) le contre-indique chez les femmes enceintes ou qui planifient une grossesse (rubrique 4.3) : alerte prioritaire, à lever avant tout conseil — pas un simple conseil cosmétique.",
    concerned: ["Grossesse ou projet de grossesse (contre-indiqué)"],
    patientAdvice: null,
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(3),
    sources: [RCP.effederm, DOCUMENT_SOURCE],
  },
  {
    key: "skin-tretinoin-avoid",
    version: "1.0",
    kind: "AVOID",
    severity: "WARNING",
    title: "À éviter en plus du traitement",
    subtitle: "Trétinoïne cutanée détectée",
    atcPrefixes: ["D10AD01"],
    substances: ["effederm", "tretinoine"],
    explanationTemplate:
      "Le RCP d'Effederm ({drug}) dit que l'usage concomitant de produits cosmétiques nettoyants astringents et d'agents desséchants ou irritants (produits parfumés ou alcoolisés) est à éviter, et qu'il est préférable d'éviter tout produit pouvant entraîner une irritation locale. Le RCP ne cite aucun produit nommément : les exfoliants sont déconseillés par déduction de leurs caractéristiques.",
    concerned: [
      "Cosmétiques nettoyants astringents, agents desséchants ou irritants (parfumés, alcoolisés)",
      "Gommages, peelings et acides exfoliants",
      "Exemples déconseillés en ajout sans validation : Eucerin DermoPure Clinical Peeling 10, La Roche-Posay Effaclar Sérum Ultra Concentré",
      "Exposition au soleil et aux lampes à UV",
    ],
    patientAdvice: `Pas de gommage, d'acide, de produit parfumé ou alcoolisé en plus de votre traitement. ${PROTECTION}`,
    blockTags: ["exfoliant"],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(3),
    sources: [RCP.effederm, DOCUMENT_SOURCE],
  },
  // ---- 4. Doxycycline orale ---------------------------------------------------------------------
  {
    key: "skin-doxycycline-contraindications",
    version: "1.0",
    kind: "CONTRAINDICATION",
    severity: "WARNING",
    title: "Contre-indications du traitement",
    subtitle: "Doxycycline détectée",
    atcPrefixes: ["J01AA02"],
    substances: ["doxycycline"],
    explanationTemplate:
      "Le RCP de la doxycycline ({drug}) contre-indique l'association avec les rétinoïdes par voie générale (isotrétinoïne orale, Curacné) et un apport en vitamine A de 10 000 UI/jour et plus : risque d'hypertension intracrânienne. Un complément de vitamine A est écarté. Le zinc (Effizinc 15 mg…), le fer et les antiacides ne sont pas interdits : ils se prennent à distance, plus de 2 heures si possible (voir « Interaction potentielle »).",
    concerned: [
      "Isotrétinoïne orale (Curacné…) : contre-indiqué",
      "Vitamine A à partir de 10 000 UI par jour : contre-indiqué",
      "Zinc, fer, antiacides : à espacer de plus de 2 heures si possible — pas interdit",
    ],
    patientAdvice: "Ne prenez ni isotrétinoïne (Curacné) ni complément de vitamine A en même temps, sauf avis de votre médecin. Zinc et fer : à plus de 2 heures de la doxycycline.",
    blockTags: ["vitamine a"],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(4),
    sources: [RCP.doxycycline, DOCUMENT_SOURCE, "ANSM — isotrétinoïne orale : groupe incluant Curacné (BDPM)"],
  },
  {
    key: "skin-doxycycline-sun-avoid",
    version: "1.0",
    kind: "AVOID",
    severity: "WARNING",
    title: "À ne pas faire pendant le traitement",
    subtitle: "Doxycycline détectée",
    atcPrefixes: ["J01AA02"],
    substances: ["doxycycline"],
    explanationTemplate:
      "Le RCP de la doxycycline ({drug}) conseille d'éviter toute exposition directe au soleil et aux UV (photosensibilisation). Priorité : pas de soleil direct, peau couverte ; le solaire complète ces mesures. Des rougeurs après exposition : appliquer les consignes de la notice et contacter le prescripteur.",
    concerned: ["Exposition directe au soleil", "Rayons UV (cabines de bronzage)"],
    patientAdvice: "Évitez le soleil direct et les UV, couvrez votre peau. En cas de rougeurs après exposition, suivez la notice et appelez votre médecin.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(4),
    sources: [RCP.doxycycline, DOCUMENT_SOURCE],
  },
  // ---- 5 et 6. Dermocorticoïde cutané -----------------------------------------------------------
  {
    key: "skin-corticoid-atopic-avoid",
    version: "1.0",
    kind: "AVOID",
    severity: "INFO",
    title: "À éviter sur les zones eczémateuses",
    subtitle: "Dermocorticoïde cutané détecté",
    atcPrefixes: ["D07A"],
    substances: ["locoid", "diprosone"],
    explanationTemplate:
      "Sur les zones eczémateuses traitées par {drug}, les exfoliants (gommages mécaniques ou chimiques) abîment une peau déjà lésée : ce n'est pas une interaction avec le corticoïde, c'est un choix lié à la peau. Éviter aussi les allergènes de contact connus. Un soin complémentaire ne se mélange pas au dermocorticoïde et ne modifie pas la prescription.",
    concerned: [
      "Gommages et exfoliants sur les zones eczémateuses (exemple : Eucerin DermoPure Clinical Gommage Purifiant)",
      "Allergènes de contact connus (parfums, conservateurs…)",
      "Mélanger un soin à la crème du médicament",
    ],
    patientAdvice: "Pas de gommage ni de produit exfoliant sur les zones d'eczéma. N'ajoutez rien dans votre crème médicamenteuse.",
    blockTags: ["exfoliant"],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(5, 6),
    sources: [RCP.locoid, DOCUMENT_SOURCE],
  },
  // ---- 7. Tacrolimus cutané ---------------------------------------------------------------------
  {
    key: "skin-tacrolimus-usage",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Tacrolimus cutané",
    atcPrefixes: ["D11AH01"],
    substances: ["protopic"],
    explanationTemplate:
      "Le RCP de Protopic ({drug}) demande de respecter un délai de 2 heures quand une préparation émolliente est appliquée sur la même zone. L'émollient reste utilisable, après cet intervalle.",
    concerned: [],
    patientAdvice: "Attendez 2 heures entre la pommade et votre émollient sur la même zone.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(7),
    sources: [RCP.protopic, "Vidal — Protopic : délai entre pommade et émollient (référence du document)"],
  },
  {
    key: "skin-tacrolimus-avoid",
    version: "1.0",
    kind: "AVOID",
    severity: "WARNING",
    title: "À ne pas faire pendant le traitement",
    subtitle: "Tacrolimus cutané détecté",
    atcPrefixes: ["D11AH01"],
    substances: ["protopic"],
    explanationTemplate:
      "Pendant le traitement par {drug} : pas de pansement occlusif sur la pommade (non étudié, non recommandé, RCP) ; réduire l'exposition de la peau au soleil et éviter les UV de solarium (RCP) ; en cas de signe d'infection de la peau sur les zones à traiter, avis médical avant d'appliquer (RCP).",
    concerned: ["Pansement ou bandage occlusif sur la pommade", "Exposition au soleil et UV de solarium", "Application sur une peau qui semble infectée"],
    patientAdvice: "Pas de pansement ni de bandage par-dessus la pommade ; peu de soleil, pas de solarium. Une peau qui suinte ou semble infectée : voyez votre médecin avant d'appliquer.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(7),
    sources: [RCP.protopic, DOCUMENT_SOURCE],
  },
  // ---- 8. Ciclopirox olamine, shampooing --------------------------------------------------------
  {
    key: "skin-ciclopirox-usage",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Ciclopirox shampooing",
    atcPrefixes: ["D01AE14"],
    substances: ["ciclopirox"],
    explanationTemplate:
      "Le RCP de {drug} prévoit deux à trois applications par semaine, pendant 4 semaines, et dit qu'un shampooing doux peut être utilisé entre les applications. Le calendrier est à conserver.",
    concerned: [],
    patientAdvice: "Gardez le calendrier : 2 à 3 fois par semaine pendant 4 semaines. Entre deux applications, un shampooing doux.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(8),
    sources: [RCP.gerda, "Vidal — Ciclopirox olamine Gerda 1,5 %, shampooing (référence du document)"],
  },
  {
    key: "skin-ciclopirox-check-addition",
    version: "1.0",
    kind: "AVOID",
    severity: "INFO",
    title: "Ajout à vérifier",
    subtitle: "Ciclopirox shampooing détecté",
    atcPrefixes: ["D01AE14"],
    substances: ["ciclopirox"],
    explanationTemplate:
      "Ajouter un autre antipelliculaire pendant le traitement par {drug} est à vérifier : ce n'est pas une contre-indication, et aucune incompatibilité n'est démontrée dans les sources consultées. Mais il n'est pas ajouté automatiquement entre les applications, et le calendrier est à valider avant.",
    concerned: ["Autre shampooing antipelliculaire (exemple : Ducray Kelual DS Intensive) : à vérifier, pas contre-indiqué"],
    patientAdvice: null,
    blockTags: ["antipelliculaire"],
    cautionTags: [],
    precautionText: null,
    documentRows: rows(8),
    sources: [RCP.gerda, DOCUMENT_SOURCE],
  },
];
