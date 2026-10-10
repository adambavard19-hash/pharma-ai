import type { AdviceRule } from "./advice";
import type { VigilanceRule } from "./vigilance";
import {
  BDPM,
  CLEANSER_REFUSED,
  EMOLLIENT_BASE,
  GENTLE_CLEANSER_EXCLUDE,
  SENSITIVE_MOISTURIZER,
  refusing,
  skinAdvice,
  skinVigilance,
} from "./conseil-peau-motifs";

/**
 * « Conseil peau — Série 3 » : rosacée et hygiène cutanée ; mycoses, psoriasis et après-gale.
 *
 * Document reçu le 8 octobre 2026. Même principe que la Série 2 : pour chaque médicament déclencheur, la question à poser,
 * le produit conseil à envisager, les conditions et précautions, ET ce qu'il ne faut pas associer ni faire. Le document est
 * la source des CHOIX ; les RCP de la Base de données publique des médicaments sont la source des FAITS — chacun a été relu
 * dans le RCP le 10 octobre 2026 (voir docs/conseil-peau-series-3-4-5.md).
 *
 * La relecture a trouvé dans les RCP des mises en garde que le document ne porte pas (Daivobet contre-indiqué dans la rosacée,
 * l'acné et les infections ; effet antabuse de Rozex avec l'alcool ; latex et Topiscab ; interruption des dermocorticoïdes
 * pendant le traitement de la gale…). Elles sont ajoutées ici, étiquetées « RCP » : elles ne viennent pas du document.
 * Inversement, quelques formulations du document ont été corrigées pour coller au RCP (les « 8 heures » de Topiscab sont le
 * temps de pose avant le rinçage, pas un délai après le lavage ; la restriction de Finacea aux abrasifs et alcools vaut pour la
 * rosacée).
 *
 * Trois niveaux, comme en Série 2 : CONTRAINDICATION (le RCP l'interdit), INTERACTION (à espacer), AVOID (déconseillé en ajout,
 * sans interdiction nominative du RCP — la carte le dit). Les marques citées sont des EXEMPLES. Toutes les règles sont PENDING.
 */

export const SKIN_SERIES_3_DOCUMENT = "peau-serie-3";
const rows = (...numbers: number[]) => ({ document: SKIN_SERIES_3_DOCUMENT, rows: numbers });

const DOCUMENT_SOURCE = "Document PharmaBoost « Conseil peau — Série 3 » (8 octobre 2026)";

const RCP = {
  rozex: `RCP Rozex 0,75 % crème — ${BDPM}, CIS 67763113`,
  soolantra: `RCP Soolantra 10 mg/g crème — ${BDPM}, CIS 69444281`,
  finacea: `RCP Finacea 15 % gel — ${BDPM}, CIS 62749394`,
  ketoderm: `RCP Kétoderm 2 % crème — ${BDPM}, CIS 60557096`,
  terbinafine: `RCP Terbinafine Biogaran 1 % crème — ${BDPM}, CIS 61348060`,
  daivonex: `RCP Daivonex 50 µg/g crème — ${BDPM}, CIS 64016362`,
  daivobet: `RCP Daivobet pommade — ${BDPM}, CIS 63931033`,
  topiscab: `RCP Topiscab 5 % crème — ${BDPM}, CIS 61712553`,
  diprosone: `RCP Diprosone 0,05 % crème (rubrique 4.3) — ${BDPM}, CIS 61938997`,
} as const;

// -----------------------------------------------------------------------------
// Ce que les rayons nomment, propre à cette série.
// -----------------------------------------------------------------------------

/** Un nettoyant doux de VISAGE ou de corps, sans savon : jamais un gommage, un « purifiant », un solaire ni un soin intime. */
const SOFT_CLEANSER_EXCLUDE = [...GENTLE_CLEANSER_EXCLUDE, String.raw`intime`, String.raw`\bgyn\b`, String.raw`shampo`, String.raw`dentifrice`, String.raw`bebe`, String.raw`rasage`];

/** Le nettoyant de visage cité pour la rosacée : Toleriane Dermo-Nettoyant d'abord, puis un lavant sans savon. */
const ROSACEA_CLEANSER_PREFER = refusing(CLEANSER_REFUSED, String.raw`toleriane.*nettoy`, String.raw`(?:sans savon|syndet|surgras|apais|\bdoux)`);

/** Le lavant cité pour les mycoses : Atoderm Intensive gel moussant, puis un lavant sans savon. */
const ANTIFUNGAL_CLEANSER_PREFER = refusing(CLEANSER_REFUSED, String.raw`atoderm.*(?:gel|moussant)`, String.raw`(?:sans savon|syndet|surgras|\bdoux)`);

const ANTIFUNGAL_CLEANSER = {
  matchingTags: ["nettoyant"],
  productExclude: SOFT_CLEANSER_EXCLUDE,
  productPrefer: ANTIFUNGAL_CLEANSER_PREFER,
  benefits: ["Lave sans dessécher", "À rincer, puis bien sécher", "Sans savon à privilégier"],
};

export const SKIN_SERIES_3_ADVICE_RULES: AdviceRule[] = [
  // ---- 1. Métronidazole cutané (Rozex) ----------------------------------------------------------
  skinAdvice({
    key: "skin-metronidazole-cleanser",
    title: "Nettoyant doux sous métronidazole cutané (rosacée)",
    documentRows: rows(1),
    atcPrefixes: ["D06BX01"],
    basePriority: 66,
    question: "Quel nettoyant utilisez-vous ? Votre peau pique-t-elle après la toilette ? (Oui : le nettoyant actuel irrite ou fait piquer la peau.)",
    confirmedReasonTemplate: "Nettoyant qui irrite sous {drug} : un nettoyant doux est justifié.",
    matchingTags: ["nettoyant"],
    productExclude: SOFT_CLEANSER_EXCLUDE,
    productPrefer: ROSACEA_CLEANSER_PREFER,
    benefits: ["Nettoie sans agresser", "Avant l'application de la crème", "Sans savon à privilégier"],
    shortReasonTemplate: "Métronidazole cutané ({drug}) : la crème s'applique après la toilette avec un nettoyant doux.",
    rationaleTemplate:
      "Le RCP de Rozex ({drug}) demande d'appliquer la crème « après la toilette avec un nettoyant doux » et d'utiliser ensuite des cosmétiques non comédogènes et non astringents. Si le nettoyant habituel fait piquer la peau, un nettoyant doux le remplace. Le RCP ne cite aucun produit nommément : le choix d'une marque vient du document.",
    counterScriptTemplate:
      "« Avec {drug}, on lave le visage avec un nettoyant doux avant d'appliquer la crème : {product} peut convenir. Ensuite, des cosmétiques non comédogènes et non astringents. Pas de gommage sur une peau qui pique. »",
    patientReasonTemplate:
      "Votre crème ({drug}) s'applique après la toilette avec un nettoyant doux. {product} nettoie le visage sans l'agresser. Évitez les gommages et les produits astringents.",
    clinicalContext: `${RCP.rozex}, rubrique 4.2 : « Appliquer la crème […] après la toilette avec un nettoyant doux » ; « Ils doivent utiliser des produits cosmétiques non comédogènes et non astringents » ; rubrique 4.4 : la zone traitée ne doit pas être exposée au soleil ni aux UV. Le nettoyant de marque vient du document.`,
    safetyNotes: [
      "Ne pas appliquer sur les yeux ni les muqueuses ; se laver les mains après l'application.",
      "Pas de gommage ni d'astringent sur un visage qui pique.",
    ],
  }),
  // ---- 2. Ivermectine cutanée (Soolantra) -------------------------------------------------------
  skinAdvice({
    ...SENSITIVE_MOISTURIZER,
    key: "skin-ivermectin-moisturizer",
    title: "Hydratant sous ivermectine cutanée (rosacée)",
    documentRows: rows(2),
    atcPrefixes: ["D11AX22"],
    question: "Votre peau est-elle sèche ? Appliquez-vous votre hydratant avant ou après Soolantra ? (Oui : peau sèche, sans hydratant adapté ou appliqué avant la crème.)",
    confirmedReasonTemplate: "Peau sèche sous {drug}, sans hydratant adapté : le conseil est justifié.",
    shortReasonTemplate: "Ivermectine cutanée ({drug}) : un cosmétique ne s'applique qu'après séchage de la crème.",
    rationaleTemplate:
      "Le RCP de Soolantra ({drug}) dit que « des cosmétiques peuvent être appliqués après que Soolantra ait séché » (4.2) et la notice demande de n'en appliquer aucun avant la crème. Aucun délai chiffré n'est imposé. Si la peau est sèche, un hydratant pour peau sensible peut être appliqué après séchage.",
    counterScriptTemplate:
      "« Avec {drug}, on applique d'abord la crème médicamenteuse et on la laisse sécher : un hydratant comme {product} se met ensuite, jamais avant. »",
    patientReasonTemplate:
      "Avec votre crème ({drug}), attendez qu'elle ait séché avant d'appliquer un hydratant. {product} convient à une peau sensible qui tiraille.",
    clinicalContext: `${RCP.soolantra}, rubrique 4.2 : « Des cosmétiques peuvent être appliqués après que Soolantra ait séché » ; notice, rubrique 3 : ne pas appliquer de cosmétiques avant la crème. Aucun délai chiffré. Le choix d'un hydratant de marque vient du document.`,
    safetyNotes: [
      "Hydratant seulement après séchage de la crème médicamenteuse.",
      "Une aggravation passagère la première semaine est attendue ; une aggravation sévère avec forte réaction cutanée impose d'arrêter et de voir le médecin.",
    ],
  }),
  // ---- 3. Acide azélaïque (Finacea) -------------------------------------------------------------
  skinAdvice({
    ...SENSITIVE_MOISTURIZER,
    key: "skin-azelaic-moisturizer",
    title: "Hydratant doux sous acide azélaïque (rosacée)",
    documentRows: rows(3),
    atcPrefixes: ["D10AX03"],
    basePriority: 66,
    question:
      "Finacea traite la rosacée mais aussi l'acné : de quoi s'agit-il ? Le gel provoque-t-il des picotements ? Utilisez-vous déjà un peeling ou un sérum anti-imperfections ? (Oui : rosacée confirmée, avec des picotements ou des tiraillements.)",
    confirmedReasonTemplate: "Rosacée confirmée sous {drug}, avec picotements ou tiraillements : un hydratant doux est justifié.",
    shortReasonTemplate: "Acide azélaïque ({drug}) : des picotements sont possibles ; un hydratant doux peut aider si la rosacée est confirmée.",
    rationaleTemplate:
      "Finacea ({drug}) traite aussi l'acné : le nom seul ne dit pas qu'il s'agit de rosacée, d'où la question. Des picotements sont possibles. Le RCP prévoit de diminuer la quantité ou de passer à une application par jour en cas d'irritation. Un hydratant doux accompagne le soin, il ne traite pas la rosacée. Dans la rosacée, le RCP déconseille démaquillants, teintures et astringents à base d'alcool, agents abrasifs et exfoliants.",
    counterScriptTemplate:
      "« Avec {drug}, des picotements sont possibles : {product} est un hydratant doux qui peut convenir. Pas de peeling, de gommage ni de lotion alcoolisée en plus. En cas d'irritation, voyez votre médecin ou votre pharmacien pour adapter l'application. »",
    patientReasonTemplate:
      "Votre gel ({drug}) peut piquer ou tirailler au début. {product} hydrate en douceur. Évitez les peelings, les gommages et les lotions alcoolisées.",
    clinicalContext: `${RCP.finacea}, rubrique 4.4 : « L'utilisation concomitante de démaquillants, teintures et astringents à base d'alcool, d'agents abrasifs et exfoliants, est déconseillée chez les patients utilisant FINACEA dans le traitement de la rosacée » ; rubrique 4.2 : en cas d'irritation, diminuer la quantité ou passer à une application par jour. Le RCP ne recommande pas d'hydratant : le choix vient du document.`,
    safetyNotes: [
      "Confirmer d'abord la rosacée : la restriction sur les abrasifs et les alcools est écrite pour elle.",
      "Pas de pansement ni de bandage occlusif sur le gel.",
    ],
  }),
  // ---- 4. Kétoconazole cutané (Kétoderm) --------------------------------------------------------
  skinAdvice({
    ...ANTIFUNGAL_CLEANSER,
    key: "skin-ketoconazole-cleanser",
    title: "Lavant doux sous kétoconazole cutané",
    documentRows: rows(4),
    atcPrefixes: ["D01AC08"],
    // Le shampooing au kétoconazole est un antipelliculaire, pas un traitement de mycose du corps : la question ne le concerne pas.
    nameGate: { exclude: ["shampo", String.raw`\bgel\b`, "sachet"] },
    basePriority: 62,
    question: "Quelle mycose traitez-vous ? Votre lavant irrite-t-il les zones atteintes ? (Oui : mycose confirmée, avec un lavant qui irrite.)",
    confirmedReasonTemplate: "Mycose confirmée sous {drug}, lavant qui irrite : un lavant doux est justifié.",
    shortReasonTemplate: "Kétoconazole cutané ({drug}) : la zone se lave puis se sèche avant l'application.",
    rationaleTemplate:
      "La notice de Kétoderm ({drug}) demande de laver la peau atteinte et de la sécher soigneusement avant l'application. Un lavant doux, à rincer, remplace un lavant qui irrite. Pour une candidose, le RCP déconseille les savons à pH acide. Le produit d'hygiène ne remplace pas le traitement antifongique.",
    counterScriptTemplate:
      "« Avec {drug}, on lave la zone puis on la sèche bien avant d'appliquer la crème : {product} est un lavant doux, à rincer. Il ne remplace pas votre crème antifongique. »",
    patientReasonTemplate:
      "Avant d'appliquer votre crème ({drug}), lavez puis séchez bien la zone. {product} lave en douceur et se rince. Il ne remplace pas votre traitement.",
    clinicalContext: `${RCP.ketoderm}, notice rubrique 3 : « Lavez la partie infectée de votre peau et séchez-la soigneusement » ; RCP 4.4 : candidoses, « il est déconseillé d'utiliser un savon à pH acide » ; 4.2 : réservé à l'adulte. Le lavant de marque vient du document.`,
    safetyNotes: [
      "Kétoderm crème est réservé à l'adulte.",
      "Produit d'hygiène : il ne remplace pas le traitement antifongique et n'a aucune action antifongique revendiquée.",
    ],
  }),
  // ---- 5. Terbinafine cutanée -------------------------------------------------------------------
  skinAdvice({
    ...ANTIFUNGAL_CLEANSER,
    key: "skin-terbinafine-cleanser",
    title: "Lavant doux sous terbinafine cutanée",
    documentRows: rows(5),
    atcPrefixes: ["D01AE15"],
    basePriority: 62,
    question: "Quelle zone est atteinte ? Votre produit lavant irrite-t-il ? Séchez-vous bien les plis et entre les orteils ? (Oui : mycose confirmée, avec un lavant qui irrite ou une zone mal séchée.)",
    confirmedReasonTemplate: "Mycose confirmée sous {drug}, avec un lavant qui irrite : un lavant doux est justifié.",
    shortReasonTemplate: "Terbinafine cutanée ({drug}) : la zone se nettoie et se sèche avant l'application.",
    rationaleTemplate:
      "Le RCP de la terbinafine cutanée ({drug}) demande d'appliquer la crème après avoir nettoyé et séché la zone. Un lavant doux, à rincer, remplace un lavant qui irrite. Le produit d'hygiène ne revendique aucune action antifongique et ne remplace pas la crème.",
    counterScriptTemplate:
      "« Avec {drug}, on nettoie et on sèche bien la zone avant d'appliquer la crème, plis et orteils compris : {product} est un lavant doux, à rincer. Il ne remplace pas votre crème. »",
    patientReasonTemplate:
      "Avant d'appliquer votre crème ({drug}), nettoyez puis séchez bien la zone. {product} lave en douceur et se rince. Il ne remplace pas votre traitement.",
    clinicalContext: `${RCP.terbinafine}, rubrique 4.2 : « après avoir nettoyé et séché la zone concernée » ; 4.4 : candidoses, savon à pH acide déconseillé. Le RCP ne parle ni de « macération » ni de « diabète » : ces points viennent du document (ou du bon sens) et ne sont pas attribués au RCP. Le lavant de marque vient du document.`,
    safetyNotes: [
      "Produit d'hygiène : il ne remplace pas la crème antifongique.",
      "Pas d'amélioration une semaine après la fin des applications : consulter de nouveau (RCP, 4.2).",
    ],
  }),
  // ---- 6. Calcipotriol (Daivonex) ---------------------------------------------------------------
  skinAdvice({
    ...EMOLLIENT_BASE,
    key: "skin-calcipotriol-emollient",
    title: "Émollient sous calcipotriol (psoriasis)",
    documentRows: rows(6),
    atcPrefixes: ["D05AX02"],
    basePriority: 66,
    question: "Avez-vous un émollient quotidien ? Utilisez-vous d'autres traitements contenant du calcipotriol ? (Oui : pas d'émollient quotidien.)",
    confirmedReasonTemplate: "Pas d'émollient quotidien sous {drug} : le conseil est justifié.",
    shortReasonTemplate: "Calcipotriol ({drug}) : un émollient complète les soins du psoriasis, appliqué séparément.",
    rationaleTemplate:
      "Dans le psoriasis, les émollients complètent les soins locaux (Vidal, référence du document). Ils s'appliquent séparément de {drug}, sans mélange. Le RCP de Daivonex n'en parle pas ; il demande en revanche de vérifier la quantité totale de calcipotriol (5 mg par semaine, tous produits confondus) et interdit l'application sur le visage.",
    counterScriptTemplate:
      "« En plus de {drug}, un émollient chaque jour garde la peau souple : {product} peut convenir, appliqué séparément de votre crème. Rappel : Daivonex ne s'applique pas sur le visage. »",
    patientReasonTemplate:
      "En plus de votre crème ({drug}), un émollient quotidien aide à garder la peau souple. {product} s'applique séparément, sans mélange avec votre traitement.",
    clinicalContext: `${RCP.daivonex}, rubrique 4.4 : « Daivonex ne doit pas être appliqué sur le visage » ; 4.2 : la dose totale de calcipotriol, tous produits confondus, ne doit pas dépasser 5 mg par semaine. L'émollient vient de Vidal (référence du document), non relu : ni Vidal ni le fabricant ne sont accessibles.`,
    safetyNotes: [
      "Ne pas mélanger l'émollient au médicament ; ne pas modifier la prescription.",
      "Pas sur le visage ; vérifier le cumul de calcipotriol si le patient utilise un autre produit qui en contient.",
    ],
  }),
  // ---- 7. Calcipotriol + bétaméthasone (Daivobet) -----------------------------------------------
  skinAdvice({
    ...EMOLLIENT_BASE,
    key: "skin-calcipotriol-betamethasone-emollient",
    title: "Émollient sous calcipotriol + bétaméthasone (psoriasis)",
    documentRows: rows(7),
    atcPrefixes: ["D05AX52"],
    basePriority: 66,
    question: "Votre peau reste-t-elle sèche ? Ajoutez-vous déjà une autre crème cortisonée sur les plaques ? (Oui : peau sèche, sans autre crème cortisonée.)",
    confirmedReasonTemplate: "Peau sèche sous {drug}, sans autre crème cortisonée : le conseil est justifié.",
    shortReasonTemplate: "Calcipotriol + bétaméthasone ({drug}) : un émollient complète le soin s'il y a sécheresse.",
    rationaleTemplate:
      "Un émollient complète les soins du psoriasis (Vidal, référence du document) ; il s'applique séparément de {drug}, sans mélange. Le RCP de Daivobet contient un corticoïde fort : il demande d'éviter l'utilisation simultanée d'autres corticoïdes, de ne pas l'utiliser sur le visage ni la région génitale et d'éviter l'occlusion.",
    counterScriptTemplate:
      "« En plus de {drug}, si la peau reste sèche, {product} peut compléter le soin, appliqué séparément. Pas d'autre crème cortisonée en même temps, ni de pansement par-dessus. »",
    patientReasonTemplate:
      "En plus de votre traitement ({drug}), un émollient aide si la peau reste sèche. {product} s'applique séparément. N'ajoutez pas d'autre crème à la cortisone sans avis.",
    clinicalContext: `${RCP.daivobet}, rubrique 4.4 : « Daivobet pommade contient un corticoïde du groupe fort de classe III et l'utilisation simultanée d'autres corticoïdes doit être évitée » ; « La peau du visage et de la région génitale sont très sensibles aux corticoïdes. Le produit ne doit pas être utilisé sur ces zones » ; occlusion à éviter.`,
    safetyNotes: [
      "Daivobet contient un corticoïde fort : pas d'autre corticoïde en même temps.",
      "Pas sur le visage ni la région génitale ; adultes seulement ; pas de pansement occlusif.",
    ],
  }),
  // ---- 8. Perméthrine (Topiscab) ----------------------------------------------------------------
  skinAdvice({
    ...EMOLLIENT_BASE,
    key: "skin-permethrin-emollient",
    title: "Émollient après le traitement de la gale",
    documentRows: rows(8),
    atcPrefixes: ["P03AC04"],
    // La perméthrine existe aussi contre les poux : seule la crème à 5 % pour la gale ouvre cette règle.
    nameGate: { include: ["topiscab", String.raw`permethrine.{0,24}5 ?%`, String.raw`\bgale\b`, "scab"] },
    basePriority: 62,
    benefits: ["Peau moins sèche après le rinçage", "À appliquer une fois la crème rincée", "Sans parfum à privilégier"],
    question: "Après le traitement, votre peau reste-t-elle sèche ou irritée ? Avez-vous de nouvelles lésions ? (Oui : peau sèche ou irritée après le rinçage, sans nouvelle lésion.)",
    confirmedReasonTemplate: "Peau sèche ou irritée après le traitement de la gale : un émollient est justifié.",
    shortReasonTemplate: "Perméthrine 5 % ({drug}) : la peau reste souvent sèche après le traitement de la gale.",
    rationaleTemplate:
      "Après le traitement par {drug}, la peau peut rester sèche et le prurit peut durer jusqu'à quatre semaines sans signifier un échec (RCP, 4.8). Le RCP recommande des crèmes hydratantes en cas de peau déshydratée (4.4). Elles se mettent une fois la crème antigale rincée : pas pendant les 8 heures de pose, où il faut éviter bains, douches et lavages.",
    counterScriptTemplate:
      "« Une fois {drug} rincé, la peau peut rester sèche : {product} peut aider, appliqué après le rinçage. Le prurit peut durer quelques semaines sans signifier que le traitement a échoué. Pensez aussi au linge et aux proches. »",
    patientReasonTemplate:
      "Une fois votre crème ({drug}) rincée, {product} aide si la peau reste sèche. Les démangeaisons peuvent durer jusqu'à quatre semaines.",
    clinicalContext: `${RCP.topiscab}, rubrique 4.2 : « La crème doit agir sur la peau pendant au moins 8 heures […] il faut éviter de prendre des bains, de se doucher et de se laver pendant ce laps de temps » (le document place ces 8 heures après l'élimination : le RCP les place AVANT) ; 4.4 : « En cas de peau déshydratée, des crèmes hydratantes […] sont recommandés » ; 4.8 : prurit possible jusqu'à quatre semaines.`,
    safetyNotes: [
      "Pas d'émollient ni de lavage pendant les 8 heures de pose : on rince d'abord.",
      "De nouvelles lésions ou une aggravation : revoir le médecin (le RCP ne le dit pas, c'est le bon sens du document).",
    ],
  }),
];

// -----------------------------------------------------------------------------
// Les vigilances : ce qu'on n'associe pas, ce qu'on ne fait pas.
// -----------------------------------------------------------------------------

const SUN_RCP = "Évitez aussi le soleil direct et les UV sur la zone traitée.";

export const SKIN_SERIES_3_VIGILANCES: VigilanceRule[] = [
  // ---- 1. Rozex ---------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-metronidazole-usage",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Métronidazole cutané détecté",
    atcPrefixes: ["D06BX01"],
    explanationTemplate:
      "Le RCP de Rozex ({drug}) demande d'appliquer la crème deux fois par jour, après la toilette avec un nettoyant doux, puis d'utiliser des cosmétiques non comédogènes et non astringents. La zone traitée ne doit pas être exposée au soleil ni aux UV ; il faut éviter les yeux et les muqueuses, et se laver les mains après l'application. Rozex n'est pas recommandé chez l'enfant. Ces points viennent du RCP.",
    concerned: [],
    patientAdvice: `Nettoyant doux avant la crème, puis des cosmétiques non comédogènes et non astringents. ${SUN_RCP} Lavez-vous les mains après l'application.`,
    documentRows: rows(1),
    sources: [RCP.rozex, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-metronidazole-avoid",
    kind: "AVOID",
    title: "À éviter en plus du traitement",
    subtitle: "Métronidazole cutané détecté",
    atcPrefixes: ["D06BX01"],
    explanationTemplate:
      "Avec {drug}, le RCP demande des cosmétiques non astringents : les gommages et astringents sont déconseillés sur un visage irrité — par déduction de leurs caractéristiques, le RCP ne cite aucun produit nommément. Le RCP signale aussi un effet antabuse rapporté chez un petit nombre de patients qui prennent du métronidazole et de l'alcool en même temps, et une potentialisation de la warfarine avec le métronidazole par voie orale ; le passage par la peau est faible, mais le point est à connaître au comptoir.",
    concerned: [
      "Gommages, peelings et astringents sur un visage irrité (exemple : Eucerin DermoPure Clinical Gommage Purifiant — conseil de tolérance, sans interaction démontrée avec Rozex)",
      "Alcool en même temps que le traitement (effet antabuse rapporté chez peu de patients, RCP 4.5)",
      "Anticoagulant de type warfarine : potentialisation décrite avec le métronidazole par voie orale (RCP 4.5)",
    ],
    patientAdvice: "Pas de gommage ni de produit astringent sur un visage qui pique. Signalez à votre pharmacien si vous prenez un anticoagulant.",
    blockTags: ["exfoliant"],
    documentRows: rows(1),
    sources: [RCP.rozex, DOCUMENT_SOURCE],
  }),
  // ---- 2. Soolantra -----------------------------------------------------------------------------
  skinVigilance({
    key: "skin-ivermectin-usage",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Ivermectine cutanée détectée",
    atcPrefixes: ["D11AX22"],
    explanationTemplate:
      "Le RCP de Soolantra ({drug}) : une application par jour sur le visage seulement, en évitant les yeux, les lèvres et les muqueuses, chez l'adulte ; lavage des mains après l'application. Une aggravation passagère de la rosacée la première semaine est attendue et ne justifie pas d'arrêter ; seule une aggravation sévère avec forte réaction cutanée impose d'interrompre. Non recommandé pendant la grossesse ; pendant l'allaitement, interrompre l'allaitement ou le traitement.",
    patientAdvice: "Une fois par jour sur le visage seulement. Une petite aggravation la première semaine est attendue ; une forte réaction : voyez votre médecin.",
    documentRows: rows(2),
    sources: [RCP.soolantra, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-ivermectin-defer",
    kind: "AVOID",
    severity: "INFO",
    title: "À différer",
    subtitle: "Ivermectine cutanée détectée",
    atcPrefixes: ["D11AX22"],
    explanationTemplate:
      "Avec {drug}, aucun cosmétique ne s'applique avant la crème : le RCP dit que les cosmétiques peuvent être appliqués après que Soolantra ait séché, sans délai chiffré. L'hydratant n'est pas contre-indiqué, il passe après. C'est une question d'ordre d'application, pas une incompatibilité.",
    concerned: ["Tout cosmétique ou hydratant appliqué AVANT la crème (exemple : La Roche-Posay Toleriane Dermallergo Crème) — utilisable après séchage"],
    patientAdvice: "D'abord votre crème, que vous laissez sécher. Votre hydratant ou votre maquillage ensuite.",
    documentRows: rows(2),
    sources: [RCP.soolantra, DOCUMENT_SOURCE],
  }),
  // ---- 3. Finacea -------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-azelaic-avoid",
    kind: "AVOID",
    title: "À éviter dans la rosacée",
    subtitle: "Acide azélaïque détecté",
    atcPrefixes: ["D10AX03"],
    explanationTemplate:
      "Le RCP de Finacea ({drug}) déconseille, chez les patients qui l'utilisent dans la rosacée, l'usage concomitant de démaquillants, teintures et astringents à base d'alcool, d'agents abrasifs et exfoliants. La restriction est écrite pour la rosacée, pas pour l'acné. Les exfoliants et sérums à acides exfoliants s'ajoutent à l'irritation. Pas de pansement ni de bandage occlusif sur le gel.",
    concerned: [
      "Gommages, peelings, abrasifs et acides exfoliants dans la rosacée (exemple : La Roche-Posay Effaclar Sérum Ultra Concentré — rapproché par sa formule, pas nommé par le RCP)",
      "Démaquillants, teintures et astringents à base d'alcool",
      "Pansement ou bandage occlusif sur le gel",
    ],
    patientAdvice: "Pas de gommage, de peeling ni de lotion alcoolisée avec ce gel. Nettoyez la peau à l'eau, un démaquillant doux est possible.",
    blockTags: ["exfoliant"],
    documentRows: rows(3),
    sources: [RCP.finacea, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-azelaic-usage",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Acide azélaïque détecté",
    atcPrefixes: ["D10AX03"],
    explanationTemplate:
      "Le RCP de Finacea ({drug}) : deux applications par jour sur une peau nettoyée à l'eau et séchée, avec un léger massage, sans interruption pendant toute la durée du traitement. En cas d'irritation, diminuer la quantité ou passer à une application par jour. Éviter les yeux, la bouche et les muqueuses ; laver les mains après application. Une aggravation de l'asthme a été rapportée dans de rares cas.",
    patientAdvice: "En cas de picotements, mettez moins de gel ou une seule application par jour jusqu'à ce que ça passe, sans arrêter de votre propre chef.",
    documentRows: rows(3),
    sources: [RCP.finacea, DOCUMENT_SOURCE],
  }),
  // ---- 4. Kétoderm ------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-ketoconazole-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Kétoconazole cutané détecté",
    atcPrefixes: ["D01AC08"],
    substances: ["ketoconazole", "ketoderm"],
    // Le shampooing au kétoconazole (antipelliculaire) a sa propre règle : celle-ci vise la crème.
    nameGate: { exclude: ["shampo", String.raw`\bgel\b`, "sachet"] },
    explanationTemplate:
      "Le RCP de Kétoderm crème ({drug}) déconseille, pour une candidose, un savon à pH acide (pH favorisant la multiplication du candida). Sur des zones inflammatoires, un gommage ou un exfoliant ajoute de l'irritation : conseil de tolérance, sans incompatibilité pharmacologique démontrée avec Kétoderm (RCP 4.5 : interactions peu probables).",
    concerned: [
      "Savon à pH acide en cas de candidose (RCP 4.4)",
      "Gommage ou exfoliant sur les zones inflammatoires (exemple : Eucerin DermoPure Clinical Gommage Purifiant) — conseil de tolérance, pas une incompatibilité",
    ],
    patientAdvice: "Lavez la zone, séchez-la bien, et évitez les savons acides en cas de candidose. Pas de gommage sur les zones rouges.",
    blockTags: ["exfoliant"],
    documentRows: rows(4),
    sources: [RCP.ketoderm, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-ketoconazole-usage",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Kétoconazole cutané détecté",
    atcPrefixes: ["D01AC08"],
    substances: ["ketoderm"],
    nameGate: { exclude: ["shampo", String.raw`\bgel\b`, "sachet"] },
    explanationTemplate:
      "Le RCP de Kétoderm crème ({drug}) : réservé à l'adulte, sur la zone et sa périphérie immédiate, une ou deux fois par jour selon la mycose. Chez un patient sous dermocorticoïde au long cours, le RCP prévoit de garder un dermocorticoïde faible le matin, d'appliquer Kétoderm le soir, puis d'arrêter progressivement le corticoïde sur 2 à 3 semaines. La notice demande de changer régulièrement les vêtements en contact avec la zone et de réserver serviette et gant de toilette.",
    patientAdvice: "Changez souvent les vêtements en contact avec la zone, gardez votre serviette et votre gant pour vous seul.",
    documentRows: rows(4),
    sources: [RCP.ketoderm, DOCUMENT_SOURCE],
  }),
  // ---- 5. Terbinafine cutanée -------------------------------------------------------------------
  skinVigilance({
    key: "skin-terbinafine-corticoid",
    kind: "CONTRAINDICATION",
    title: "Pas de dermocorticoïde sur la mycose",
    subtitle: "Terbinafine cutanée détectée",
    atcPrefixes: ["D01AE15"],
    explanationTemplate:
      "Sous {drug}, un dermocorticoïde ne s'ajoute pas en automédication sur la mycose : le RCP de Diprosone 0,05 % crème contre-indique les infections primitives bactériennes, virales, fongiques ou parasitaires (rubrique 4.3). Ce n'est pas une interaction avec la terbinafine (le RCP de la terbinafine ne connaît aucune interaction avec les formes cutanées) : c'est la contre-indication du corticoïde sur une infection fongique. Diprosone est aussi contre-indiqué dans la rosacée, l'acné et sur les paupières.",
    concerned: ["Dermocorticoïde ajouté sur la mycose (exemple : Diprosone 0,05 % crème) — contre-indiqué par le RCP du corticoïde"],
    patientAdvice: "N'appliquez pas de crème à la cortisone sur une mycose sans avis médical.",
    documentRows: rows(5),
    sources: [RCP.terbinafine, RCP.diprosone, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-terbinafine-usage",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Terbinafine cutanée détectée",
    atcPrefixes: ["D01AE15"],
    explanationTemplate:
      "Le RCP de la terbinafine cutanée ({drug}) : couche mince sur la zone et son pourtour, après avoir nettoyé et séché ; pour un intertrigo, la zone peut être recouverte d'une gaze, surtout la nuit. Candidose : savon à pH acide déconseillé. Les nourrissons ne doivent pas être en contact avec la zone traitée, y compris les seins ; mieux vaut éviter la grossesse et l'allaitement. Pas pour les ongles. Un arrêt trop précoce expose à une rechute.",
    patientAdvice: "Continuez jusqu'au bout du schéma prévu, même si ça va mieux. Pas d'amélioration une semaine après la fin : revoyez votre médecin.",
    documentRows: rows(5),
    sources: [RCP.terbinafine, DOCUMENT_SOURCE],
  }),
  // ---- 6. Daivonex ------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-calcipotriol-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Calcipotriol détecté",
    atcPrefixes: ["D05AX02"],
    explanationTemplate:
      "Le RCP de Daivonex ({drug}) le contre-indique chez les patients ayant des antécédents de troubles du métabolisme calcique (rubrique 4.3), et demande d'éviter son emploi dans le psoriasis pustuleux, en gouttes et érythrodermique (4.4). Cette alerte relève du prescripteur : elle passe avant tout conseil cosmétique. Ces points viennent du RCP, pas du document.",
    concerned: ["Antécédents de troubles du métabolisme calcique (contre-indiqué)", "Psoriasis pustuleux, en gouttes ou érythrodermique (à éviter)"],
    patientAdvice: "Prévenez votre médecin si vous avez déjà eu un problème de calcium dans le sang.",
    documentRows: rows(6),
    sources: [RCP.daivonex],
  }),
  skinVigilance({
    key: "skin-calcipotriol-avoid",
    kind: "AVOID",
    title: "À ne pas faire pendant le traitement",
    subtitle: "Calcipotriol détecté",
    atcPrefixes: ["D05AX02"],
    explanationTemplate:
      "Avec {drug} : pas sur le visage ; la dose totale de calcipotriol, tous produits confondus (Daivobet, Enstilar…), ne doit pas dépasser 5 mg par semaine, soit 100 g de Daivonex ; prudence dans les plis et sous occlusion ; limiter ou éviter les UV naturels ou artificiels (cabines solaires) ; se laver les mains après chaque application. Le cumul avec un autre produit au calcipotriol n'est pas une interdiction absolue : il se comptabilise.",
    concerned: [
      "Application sur le visage (interdit par le RCP)",
      "Cumul avec un autre produit contenant du calcipotriol (exemples : Daivobet, Enstilar) — à comptabiliser, plafond de 5 mg par semaine",
      "Plis de la peau, bandages et pansements occlusifs (prudence)",
      "Soleil, cabines solaires et UV",
    ],
    patientAdvice: "Pas sur le visage, pas de pansement par-dessus, et gardez la même quantité totale par semaine. Évitez soleil et cabines à UV.",
    documentRows: rows(6),
    sources: [RCP.daivonex, "Vidal — Traitements locaux du psoriasis (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
  // ---- 7. Daivobet ------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-calcipotriol-betamethasone-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Calcipotriol + bétaméthasone détecté",
    atcPrefixes: ["D05AX52"],
    explanationTemplate:
      "Le RCP de Daivobet ({drug}) le contre-indique dans le psoriasis érythrodermique, exfoliant et pustuleux, en cas d'antécédents de troubles du métabolisme calcique, et — à cause du corticoïde — en cas de lésions virales (herpès, varicelle), d'infections fongiques, bactériennes ou parasitaires, de dermatite périorale, d'atrophie cutanée, d'ichtyose, d'acné vulgaire, d'acné rosacée, de rosacée, d'ulcères et de plaies (rubrique 4.3). Réservé à l'adulte. Ces points viennent du RCP, pas du document.",
    concerned: [
      "Rosacée, acné, dermatite périorale (contre-indiqué)",
      "Infections de la peau fongiques, bactériennes, virales ou parasitaires — mycose, gale, herpès (contre-indiqué)",
      "Ulcères, plaies, peau atrophique (contre-indiqué)",
      "Antécédents de troubles du métabolisme calcique (contre-indiqué)",
    ],
    patientAdvice: "N'utilisez pas cette pommade sur une peau infectée, sur une rosacée ou de l'acné sans avis médical.",
    documentRows: rows(7),
    sources: [RCP.daivobet],
  }),
  skinVigilance({
    key: "skin-calcipotriol-betamethasone-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Calcipotriol + bétaméthasone détecté",
    atcPrefixes: ["D05AX52"],
    explanationTemplate:
      "Daivobet ({drug}) contient déjà un corticoïde fort : le RCP demande d'éviter l'utilisation simultanée d'autres corticoïdes. Il ne doit pas être utilisé sur le visage ni la région génitale ; l'application sous pansement occlusif doit être évitée, ainsi que sur de larges surfaces, sur les muqueuses ou dans les plis ; pas plus de 30 % de la surface corporelle ; limiter l'exposition excessive à la lumière naturelle ou artificielle. Un émollient s'applique séparément, sans mélange.",
    concerned: [
      "Un autre dermocorticoïde en même temps (exemple : Diprosone 0,05 % crème) — le RCP demande de l'éviter",
      "Visage et région génitale",
      "Pansement occlusif, plis de la peau, larges surfaces",
      "Soleil et lumière artificielle excessifs",
    ],
    patientAdvice: "Pas d'autre crème à la cortisone en même temps, pas de pansement par-dessus, pas sur le visage ni les parties intimes.",
    documentRows: rows(7),
    sources: [RCP.daivobet, "Vidal — Traitements locaux du psoriasis (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
  // ---- 8. Topiscab ------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-permethrin-avoid",
    kind: "AVOID",
    title: "À ne pas faire pendant le traitement",
    subtitle: "Perméthrine 5 % (gale) détectée",
    atcPrefixes: ["P03AC04"],
    nameGate: { include: ["topiscab", String.raw`permethrine.{0,24}5 ?%`, String.raw`\bgale\b`, "scab"] },
    explanationTemplate:
      "Avec {drug}, la crème agit au moins 8 heures : pendant ce temps, pas de bain, de douche ni de lavage. Les produits contenant du latex (préservatifs, diaphragmes) peuvent perdre en efficacité à cause des excipients. Le RCP demande d'envisager l'interruption temporaire des corticostéroïdes dermiques (risque d'exacerbation de l'infestation). Sur une peau irritée, un gommage ajoute de l'irritation : conseil de tolérance, sans interaction démontrée. Les 8 heures sont le temps de pose avant le rinçage, pas un délai après.",
    concerned: [
      "Bain, douche ou lavage pendant les 8 heures de pose",
      "Préservatifs et diaphragmes en latex (efficacité diminuée, RCP 4.4)",
      "Dermocorticoïdes : interruption temporaire à envisager (RCP 4.5)",
      "Gommage sur peau irritée (exemple : Eucerin DermoPure Clinical Gommage Purifiant) — conseil de tolérance",
    ],
    patientAdvice: "Ne vous lavez pas pendant les 8 heures de pose. Utilisez un autre moyen de protection que le latex, et parlez à votre médecin de vos crèmes à la cortisone.",
    blockTags: ["exfoliant"],
    documentRows: rows(8),
    sources: [RCP.topiscab, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-permethrin-usage",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Perméthrine 5 % (gale) détectée",
    atcPrefixes: ["P03AC04"],
    nameGate: { include: ["topiscab", String.raw`permethrine.{0,24}5 ?%`, String.raw`\bgale\b`, "scab"] },
    explanationTemplate:
      "Le RCP de Topiscab ({drug}) : deux applications, à J0 puis J8 (entre 7 et 14 jours d'écart) ; au lendemain de l'application, changer vêtements, draps et serviettes et les laver à au moins 60 °C ; les personnes en contact, notamment la famille et le partenaire, doivent être examinées le plus tôt possible. Le prurit peut durer jusqu'à quatre semaines sans signifier un échec. Dès 2 mois ; à interrompre pendant l'allaitement. Le traitement ne se répète pas sur le seul prurit résiduel.",
    patientAdvice: "Deuxième application une semaine après la première. Lavez linge et draps à 60 °C le lendemain, et faites examiner vos proches.",
    documentRows: rows(8),
    sources: [RCP.topiscab, "Vidal — Traitement de la gale : soins émollients (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
];

