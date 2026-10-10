import type { AdviceRule } from "./advice";
import type { VigilanceRule } from "./vigilance";
import { BDPM, COMMON_MOISTURIZER, FACE_SUN_BASE, PREGNANCY_BLOCK, refusing, skinAdvice, skinVigilance } from "./conseil-peau-motifs";

/**
 * « Médicaments déclencheurs et produits conseil » — première série : peau et antibiotiques.
 *
 * Document reçu le 7 octobre 2026 (6 lignes : isotrétinoïne orale × 3, Differine × 2, antibiotique oral). La première série a
 * précédé les séries 2 à 5 ; trois de ses lignes étaient déjà portées par des règles du moteur (baume labial et routine peau
 * sous isotrétinoïne, probiotique sous antibiotique : `lip-care-isotretinoin`, `isotretinoin-skin-routine`,
 * `digestive-tolerance-antibiotics`, qui portent maintenant leur ligne du document). Ce fichier ajoute ce qui manquait : les
 * larmes artificielles sous isotrétinoïne (ligne 3), l'hydratant et la protection solaire sous Differine (lignes 4 et 5), et la
 * colonne que cette première série nomme « Associations à bloquer » — les soins exfoliants irritants et la vitamine A sous
 * isotrétinoïne — avec ce que le RCP y ajoute.
 *
 * Relecture dans les RCP de la BDPM, le 10 octobre 2026 (Acnetrait 10 mg CIS 62121489, Curacné 10 mg CIS 62318935, Differine
 * 0,1 % crème CIS 69718483) :
 *   • la « formulation adaptée aux lentilles » n'est pas dans le RCP : il conseille les LUNETTES si l'intolérance aux lentilles
 *     gêne pendant le traitement — la règle le dit ;
 *   • « hydratant non comédogène » sous Differine est dans la NOTICE, pas dans le RCP ; « exfoliants supplémentaires » n'est pas
 *     écrit pour la période de traitement (le RCP dit « agents desséchants ou irritants ») ; « adaptée à la peau acnéique » n'y est pas ;
 *   • omis par le document et ajoutés ici, étiquetés « RCP » : cyclines et autres rétinoïdes contre-indiqués avec l'isotrétinoïne ;
 *     dermabrasions chimiques et lasers à éviter pendant le traitement et 5 à 6 mois après ; épilation à la cire pendant le
 *     traitement et au moins 6 mois après ; soleil et cabines à UV ; yeux, lèvres et narines avec Differine ; exposition solaire
 *     exceptionnelle ; grossesse.
 *
 * Toutes les règles sont PENDING. Les marques sont des exemples.
 */

export const SKIN_SERIES_1_DOCUMENT = "peau-serie-1";
const rows = (...numbers: number[]) => ({ document: SKIN_SERIES_1_DOCUMENT, rows: numbers });

const DOCUMENT_SOURCE = "Document PharmaBoost « Médicaments déclencheurs et produits conseil — première série » (7 octobre 2026)";

const RCP = {
  isotretinoin: `RCP Acnetrait 10 mg (rubriques 4.3, 4.4, 4.5) — ${BDPM}, CIS 62121489 ; Curacné 10 mg, CIS 62318935`,
  differine: `RCP Differine 0,1 % crème — ${BDPM}, CIS 69718483`,
} as const;

export const SKIN_SERIES_1_ADVICE_RULES: AdviceRule[] = [
  // ---- 3. Isotrétinoïne orale — yeux ------------------------------------------------------------
  skinAdvice({
    key: "skin-isotretinoin-dry-eye",
    title: "Larmes artificielles sous isotrétinoïne orale",
    documentRows: rows(3),
    category: "SOINS",
    // L'ATC seul : le RCP cité est celui de l'isotrétinoïne orale, pas celui des autres rétinoïdes oraux.
    atcPrefixes: ["D10BA01"],
    basePriority: 66,
    question: "Vos yeux sont-ils secs ? Portez-vous des lentilles ? (Oui : yeux secs ou qui tirent sous isotrétinoïne.)",
    confirmedReasonTemplate: "Yeux secs sous {drug} : des larmes artificielles sont justifiées.",
    matchingTags: ["larmes", "sécheresse oculaire"],
    // Un motif préféré lève une exclusion : chacun refuse d'abord les collyres antibiotiques et antiseptiques (« unidose » ne sauve pas Azyter).
    productPrefer: refusing(String.raw`(?:azyter|tobrex|antibio|antiseptique|desomedine|desosept|hexamidine|cortico|dexamethasone)`, String.raw`sans conservateur`, String.raw`unidose`, String.raw`hyaluron`, String.raw`hylo`, String.raw`hyabak`, String.raw`aqualarm`, String.raw`thealoz`, String.raw`vismed`, String.raw`larmes`),
    productExclude: [
      String.raw`antiseptique`, String.raw`desomedine`, String.raw`desosept`, String.raw`pommade`, String.raw`lavage`, String.raw`dacryoserum`, String.raw`allergi`, String.raw`antihistamin`,
      String.raw`vasoconstric`, String.raw`blanchi`, String.raw`biocanina`, String.raw`lotion`, String.raw`paupi`, String.raw`lingette`, String.raw`azyter`, String.raw`vitamine a`, String.raw`vita ?pos`,
    ],
    benefits: ["Lubrifie l'œil sec", "Sans conservateur à privilégier", "À utiliser à la demande"],
    shortReasonTemplate: "Isotrétinoïne orale ({drug}) : la sécheresse oculaire est fréquente ; le RCP cite les larmes artificielles.",
    rationaleTemplate:
      "Le RCP de l'isotrétinoïne orale ({drug}) dit que la sécheresse oculaire peut être prévenue par une pommade ophtalmique lubrifiante ou des larmes artificielles. Si les lentilles de contact deviennent intolérables, le RCP et la notice conseillent de porter des lunettes pendant la durée du traitement : le RCP ne parle pas de larmes « pour lentilles ». Les troubles de la vision sont orientés vers un ophtalmologue, sans se limiter à un collyre de confort.",
    counterScriptTemplate:
      "« Avec {drug}, les yeux peuvent s'assécher : {product} peut aider, à la demande. Si vous portez des lentilles et que l'œil est très sec, la notice conseille des lunettes pendant le traitement. Une douleur ou une vue qui baisse : voyez votre médecin. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) peut dessécher les yeux. {product} les lubrifie. Avec des lentilles, préférez des lunettes si l'œil devient très sec. Une vue qui baisse : voyez votre médecin.",
    clinicalContext: `${RCP.isotretinoin}, rubrique 4.4 : « La sécheresse oculaire peut être prévenue par l'application d'une pommade ophtalmique lubrifiante ou de larmes artificielles » ; « Les patients souffrant de troubles de la vision doivent être orientés vers une consultation spécialisée en ophtalmologie » ; « Une intolérance au port des lentilles de contact peut nécessiter le recours aux lunettes pendant la durée du traitement ». « Formulation adaptée aux lentilles » : consigne du document, absente du RCP.`,
    safetyNotes: [
      "Douleur oculaire, baisse de vision ou autre trouble visuel : orientation médicale, sans se limiter à un collyre de confort.",
      "Intolérance aux lentilles : le RCP conseille les lunettes pendant le traitement.",
    ],
  }),
  // ---- 4. Adapalène (Differine) — hydratant -----------------------------------------------------
  skinAdvice({
    ...COMMON_MOISTURIZER,
    key: "skin-adapalene-moisturizer",
    title: "Hydratant sous adapalène",
    documentRows: rows(4),
    atcPrefixes: ["D10AD03"],
    question: "Votre peau devient-elle sèche ou irritée depuis le début du traitement ? (Oui : peau sèche ou irritée, sans hydratant adapté.)",
    confirmedReasonTemplate: "Peau sèche ou irritée sous {drug}, sans hydratant adapté : le conseil est justifié.",
    shortReasonTemplate: "Adapalène ({drug}) : crème légèrement irritante ; la notice cite les hydratants non comédogènes.",
    rationaleTemplate:
      "La notice de Differine ({drug}) autorise les produits hydratants choisis parmi les produits testés non comédogènes. Le RCP demande d'éviter les cosmétiques nettoyants astringents et les agents desséchants ou irritants (produits parfumés ou alcoolisés). Une irritation sévère impose d'interrompre la crème provisoirement, voire définitivement.",
    counterScriptTemplate:
      "« Avec {drug}, la peau peut devenir sèche ou irritée : un hydratant non comédogène peut convenir, comme {product}. Évitez les produits astringents, parfumés ou alcoolisés, et les exfoliants en plus. »",
    patientReasonTemplate:
      "Votre crème ({drug}) irrite un peu la peau, c'est normal au début. {product} l'hydrate sans boucher les pores. Évitez les produits astringents, parfumés ou alcoolisés.",
    clinicalContext: `${RCP.differine}, rubrique 4.4 : « l'usage concomitant de produits cosmétiques nettoyants astringents et d'agents desséchants ou irritants (tels que produits parfumés ou alcoolisés) est à éviter » ; notice, rubrique 2 : hydratants « parmi les produits testés non comédogènes » (la notice, pas le RCP) ; irritation sévère : « interrompue provisoirement voire définitivement ». « Réévaluation » et « exfoliants supplémentaires » viennent du document.`,
    safetyNotes: [
      "Grossesse ou projet de grossesse : contre-indiqué — alerte avant tout conseil.",
      "Augmenter les quantités n'améliore pas l'activité : rougeur, desquamation et inconfort possibles.",
    ],
    blockedFor: PREGNANCY_BLOCK("Differine"),
  }),
  // ---- 5. Adapalène (Differine) — protection solaire --------------------------------------------
  skinAdvice({
    ...FACE_SUN_BASE,
    key: "skin-adapalene-sunscreen",
    title: "Photoprotection sous adapalène",
    documentRows: rows(5),
    atcPrefixes: ["D10AD03"],
    basePriority: 72,
    question: "Comment protégez-vous votre peau du soleil ? (Oui : peau exposée, sans solaire adapté.)",
    confirmedReasonTemplate: "Peau exposée au soleil sous {drug}, sans solaire adapté : la photoprotection est justifiée.",
    shortReasonTemplate: "Adapalène ({drug}) : le soleil et les UV provoquent une irritation supplémentaire.",
    rationaleTemplate:
      "Le RCP de Differine ({drug}) dit que l'exposition au soleil et aux lampes UV provoque une irritation supplémentaire : éviter l'exposition dans toute la mesure du possible. Le traitement peut être poursuivi si l'exposition est réduite au minimum (chapeau, crème écran solaire) et le rythme des applications ajusté. La crème solaire ne suffit pas à autoriser une exposition prolongée. Après une exposition exceptionnelle (une journée à la mer), ne pas appliquer la veille, le jour même et le lendemain.",
    counterScriptTemplate:
      "« Avec {drug}, le soleil irrite davantage la peau : limitez l'exposition, portez un chapeau, et {product} complète ces mesures. La crème solaire ne permet pas de rester longtemps au soleil. »",
    patientReasonTemplate:
      "Avec votre crème ({drug}), le soleil irrite plus la peau. {product} protège le visage, en complément d'un chapeau et d'une exposition réduite.",
    clinicalContext: `${RCP.differine}, rubrique 4.4 : « L'exposition au soleil et aux lampes à ultraviolet provoque une irritation supplémentaire. Eviter en conséquence une exposition pendant le traitement dans toute la mesure du possible » ; « Le traitement pourra cependant être poursuivi si l'exposition solaire est réduite au minimum (protection par le port d'un chapeau et l'utilisation d'une crème écran solaire) » ; « ne pas appliquer la veille, le jour même et le lendemain » d'une exposition exceptionnelle. Le RCP ne parle pas de peau « acnéique » : texture non comédogène choisie par le document.`,
    safetyNotes: [
      "Grossesse ou projet de grossesse : contre-indiqué — alerte avant tout conseil.",
      "Après un coup de soleil, attendre le complet rétablissement avant d'appliquer.",
    ],
    blockedFor: PREGNANCY_BLOCK("Differine"),
  }),
];

// -----------------------------------------------------------------------------
// Les vigilances : « Associations à bloquer » et ce que le RCP y ajoute.
// -----------------------------------------------------------------------------

export const SKIN_SERIES_1_VIGILANCES: VigilanceRule[] = [
  skinVigilance({
    key: "skin-isotretinoin-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Isotrétinoïne orale détectée",
    atcPrefixes: ["D10BA01"],
    substances: ["isotretinoine"],
    explanationTemplate:
      "Avec l'isotrétinoïne ({drug}), le RCP demande d'éviter les kératolytiques locaux et les antiacnéiques exfoliants (risque accru d'irritation locale) et, de manière générale, tout produit irritant. Il demande d'éviter les dermabrasions chimiques agressives et les lasers dermatologiques pendant le traitement et 5 à 6 mois après l'arrêt, et l'épilation à la cire pendant le traitement et au moins 6 mois après (risque de décollement épidermique). L'exposition intense au soleil et les UV sont à éviter, sinon une crème solaire d'indice 15 ou plus ; pas de cabines de bronzage. Ces points viennent du RCP ; le document ne cite que les exfoliants et la vitamine A.",
    concerned: [
      "Exfoliants, kératolytiques, gommages, acides (exemples : Eucerin DermoPure Clinical Peeling 10, La Roche-Posay Effaclar Sérum Ultra Concentré) — le RCP les déconseille nommément comme catégorie",
      "Épilation à la cire pendant le traitement et au moins 6 mois après",
      "Dermabrasions chimiques agressives et lasers dermatologiques pendant le traitement et 5 à 6 mois après",
      "Soleil intense, cabines de bronzage et lampes UV",
    ],
    patientAdvice: "Pas de gommage, d'acide, d'épilation à la cire ni de laser pendant le traitement et plusieurs mois après. Protégez-vous du soleil (indice 15 au moins), pas de cabines à UV.",
    blockTags: ["exfoliant"],
    documentRows: rows(1, 2),
    sources: [RCP.isotretinoin, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-isotretinoin-eyes",
    kind: "USAGE",
    severity: "INFO",
    title: "Yeux et lentilles",
    subtitle: "Isotrétinoïne orale détectée",
    atcPrefixes: ["D10BA01"],
    substances: ["isotretinoine"],
    explanationTemplate:
      "Sous isotrétinoïne ({drug}), la sécheresse oculaire peut être prévenue par des larmes artificielles ou une pommade ophtalmique lubrifiante ; une intolérance aux lentilles de contact peut obliger à porter des lunettes pendant le traitement. Les troubles de la vision sont orientés vers une consultation d'ophtalmologie, et l'arrêt du traitement est parfois nécessaire.",
    patientAdvice: "Si l'œil est très sec, portez des lunettes plutôt que des lentilles pendant le traitement. Un trouble de la vue : prévenez votre médecin rapidement.",
    documentRows: rows(3),
    sources: [RCP.isotretinoin, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-adapalene-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indication du traitement",
    subtitle: "Adapalène détecté",
    atcPrefixes: ["D10AD03"],
    substances: ["adapalene", "differine"],
    explanationTemplate:
      "Le RCP de Differine ({drug}) le contre-indique pendant la grossesse et chez les femmes qui planifient une grossesse : alerte prioritaire, à lever avant tout conseil. Il est réservé aux adultes et adolescents de 12 ans et plus. Ces points viennent du RCP, pas du document.",
    concerned: ["Grossesse ou projet de grossesse (contre-indiqué)", "Hypersensibilité aux parabènes (excipients)"],
    patientAdvice: null,
    documentRows: rows(4, 5),
    sources: [RCP.differine],
  }),
  skinVigilance({
    key: "skin-adapalene-avoid",
    kind: "AVOID",
    title: "À éviter en plus du traitement",
    subtitle: "Adapalène détecté",
    atcPrefixes: ["D10AD03"],
    substances: ["adapalene", "differine"],
    explanationTemplate:
      "Avec {drug}, le RCP demande d'éviter l'usage concomitant de produits cosmétiques nettoyants astringents et d'agents desséchants ou irritants (produits parfumés ou alcoolisés). Les exfoliants s'ajoutent à cette irritation : déconseillés par déduction, le RCP ne les nomme pas pendant le traitement. La crème évite les yeux, les paupières, les narines et les lèvres. En cas d'exposition solaire exceptionnelle, ne pas l'appliquer la veille, le jour même et le lendemain. Augmenter les quantités n'améliore pas l'effet et peut provoquer rougeur et desquamation.",
    concerned: [
      "Produits astringents, desséchants, parfumés ou alcoolisés (RCP 4.4)",
      "Gommages, peelings et acides exfoliants — déduction, le RCP ne les nomme pas",
      "Soleil et lampes UV ; application la veille, le jour même et le lendemain d'une exposition exceptionnelle",
      "Yeux, paupières, narines et lèvres",
    ],
    patientAdvice: "Pas de produit desséchant, parfumé ou alcoolisé, ni de gommage, en plus de la crème. Évitez les yeux, les lèvres et les narines.",
    blockTags: ["exfoliant"],
    documentRows: rows(4, 5),
    sources: [RCP.differine, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-adapalene-usage",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Adapalène détecté",
    atcPrefixes: ["D10AD03"],
    substances: ["adapalene", "differine"],
    explanationTemplate:
      "Le RCP de Differine ({drug}) : une application le soir sur peau nettoyée et séchée ; elle peut être associée à d'autres traitements antiacnéiques appliqués le matin — lotion à l'érythromycine 4 %, à la clindamycine 1 %, ou gel aqueux au peroxyde de benzoyle jusqu'à 10 %. L'interaction avec des médicaments pris par voie générale est peu probable (faible absorption).",
    patientAdvice: "Une application le soir. Un autre traitement contre l'acné se met le matin, uniquement si votre médecin l'a prescrit.",
    documentRows: rows(4, 5),
    sources: [RCP.differine],
  }),
];
