import type { AdviceRule } from "./advice";
import type { VigilanceRule } from "./vigilance";
import {
  ATOPIC_EMOLLIENT_PREFER,
  BDPM,
  COMMON_MOISTURIZER,
  EMOLLIENT_BASE,
  GENTLE_CLEANSER_EXCLUDE,
  HAND_CARE_EXCLUDE,
  HAND_CARE_PREFER,
  LIP_BALM_EXCLUDE,
  LIP_BALM_PREFER,
  MILD_SHAMPOO_EXCLUDE,
  MILD_SHAMPOO_PREFER,
  SENSITIVE_MOISTURIZER,
  refusing,
  skinAdvice,
  skinVigilance,
} from "./conseil-peau-motifs";

/**
 * « Conseil peau — Série 4 » : rétinoïdes oraux, acné et rosacée ; atopie, psoriasis et candidose cutanée.
 *
 * Document reçu le 8 octobre 2026. Pour chaque médicament déclencheur : la question, le produit conseil, les conditions et
 * précautions, et — la colonne qui distingue PharmaBoost — ce qu'on n'associe pas. Le document est la source des CHOIX ; les
 * RCP (BDPM, ou PDF de l'EMA pour les médicaments à autorisation centralisée) sont la source des FAITS, relus le 10 octobre 2026.
 *
 * Cette série dit elle-même que sa dernière colonne ne porte que des produits conseil (cosmétiques, compléments, hygiène) :
 * les interactions entre médicaments sont dans « conditions et précautions ». Ici, les deux sont rendues : les produits
 * écartés passent par `blockTags`, les interactions entre médicaments sont des lignes de la carte « contre-indiqué » ou
 * « surveillance ». Ce que la relecture a ajouté au document est étiqueté « RCP » : contre-indications de Mirvaso (IMAO,
 * antidépresseurs), de Dermoval (acné, rosacée, infections), de Toctino (vitamine A, soja, arachide), de Soriatane
 * (méthotrexate, alcool dans les médicaments, don du sang), teintures capillaires et Clobex, vaccins vivants et Dupixent…
 *
 * À ne pas généraliser : Erythrogel déconseille le savon ALCALIN, l'éconazole en candidose le savon ACIDE. Aucune règle de
 * « lavant » commune n'est écrite pour ces deux-là.
 *
 * Toutes les règles sont PENDING. Les marques sont des exemples.
 */

export const SKIN_SERIES_4_DOCUMENT = "peau-serie-4";
const rows = (...numbers: number[]) => ({ document: SKIN_SERIES_4_DOCUMENT, rows: numbers });

const DOCUMENT_SOURCE = "Document PharmaBoost « Conseil peau — Série 4 » (8 octobre 2026)";
const EMA = "Agence européenne des médicaments (RCP lié par la BDPM)";

const RCP = {
  soriatane: `RCP Soriatane 25 mg — ${BDPM}, CIS 64225999`,
  toctino: `RCP Toctino 30 mg — ${BDPM}, CIS 69219167`,
  erythrogel: `RCP et notice Erythrogel 4 % — ${BDPM}, CIS 65256289`,
  mirvaso: `RCP Mirvaso 3 mg/g — ${EMA}, CIS 68293613`,
  dupixent: `RCP Dupixent — ${EMA}, CIS 64627916`,
  dermoval: `RCP Dermoval 0,05 % crème — ${BDPM}, CIS 61777782`,
  clobex: `RCP Clobex 500 µg/g shampooing — ${BDPM}, CIS 69724301`,
  econazole: `RCP Éconazole Viatris 1 % crème — ${BDPM}, CIS 61820358`,
  doxycycline: `RCP Doxycycline Sandoz 100 mg — ${BDPM}, CIS 60982364`,
  daivobet: `RCP Daivobet pommade (rubrique 4.4) — ${BDPM}, CIS 63931033`,
} as const;

/** Le clobétasol de Dermoval (crème) et celui de Clobex (shampooing) ont le même code ATC : seul le nom les distingue. */
const CLOBETASOL_SHAMPOO = { include: ["clobex", "shampo"] };
const CLOBETASOL_CREAM = { exclude: ["clobex", "shampo"] };

/** Un lavant doux à pH alcalin pour la toilette externe : la gamme Saforelle citée par le document d'abord. Jamais un ovule ni un antifongique. */
const GENTLE_INTIMATE_PREFER = refusing(String.raw`(?:ovule|vaginal|econazole|mycohydralin|lubrifiant|preserv)`, String.raw`saforelle`, String.raw`(?:soin lavant|lavant doux|toilette intime)`);
const GENTLE_INTIMATE_EXCLUDE = [...GENTLE_CLEANSER_EXCLUDE, String.raw`ovule`, String.raw`vaginal`, String.raw`econazole`, String.raw`mycohydralin`, String.raw`lubrifiant`, String.raw`preserv`, String.raw`lingette`];

export const SKIN_SERIES_4_ADVICE_RULES: AdviceRule[] = [
  // ---- 1. Acitrétine orale (Soriatane) ----------------------------------------------------------
  skinAdvice({
    key: "skin-acitretin-lip-balm",
    title: "Baume labial sous acitrétine",
    documentRows: rows(1),
    atcPrefixes: ["D05BB02"],
    basePriority: 68,
    question: "Avez-vous les lèvres sèches ou fendillées ? Avez-vous déjà un baume adapté ? (Oui : lèvres sèches ou fendillées, sans baume adapté.)",
    confirmedReasonTemplate: "Lèvres sèches sous {drug}, sans baume adapté : le conseil est justifié.",
    matchingTags: ["lèvres", "baume"],
    productExclude: LIP_BALM_EXCLUDE,
    productPrefer: LIP_BALM_PREFER,
    benefits: ["Lèvres réparées", "À renouveler dans la journée", "Formule sans parfum à privilégier"],
    shortReasonTemplate: "Acitrétine orale ({drug}) : la sécheresse des lèvres est fréquente ; un baume labial est recommandé.",
    rationaleTemplate:
      "La notice de Soriatane ({drug}) recommande d'appliquer pommades ou crèmes hydratantes et un baume labial pendant le traitement pour lutter contre la sécheresse cutanée ou labiale. Le conseil est possible dès le début. Le RCP ne cite aucune marque : le choix vient du document.",
    counterScriptTemplate:
      "« Avec {drug}, les lèvres se dessèchent souvent : la notice recommande un baume labial. {product} peut convenir, à renouveler dans la journée. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) dessèche souvent les lèvres. {product} les protège ; la notice recommande un baume labial pendant la cure.",
    clinicalContext: `${RCP.soriatane}, rubrique 4.8 : sécheresse des lèvres « qui peut être soulagée avec un baume à lèvre » ; notice : « Appliquez des pommades ou des crèmes hydratantes et un baume labial (sur les lèvres) pendant le traitement ». Le baume de marque vient du document.`,
    safetyNotes: [
      "Programme de prévention de la grossesse : contraception avant (1 mois), pendant et 3 ans après l'arrêt — alerte prioritaire, pas un conseil cosmétique.",
      "Alcool, vitamine A, cyclines et méthotrexate : voir les alertes du traitement.",
    ],
  }),
  // ---- 2. Alitrétinoïne orale (Toctino) ---------------------------------------------------------
  skinAdvice({
    key: "skin-alitretinoin-hand-care",
    title: "Soin des mains sous alitrétinoïne",
    documentRows: rows(2),
    atcPrefixes: ["D11AH04"],
    basePriority: 66,
    question: "Les mains tiraillent-elles ? Que mettez-vous après les lavages et pour vous protéger des irritants ? (Oui : mains qui tiraillent, sans soin toléré.)",
    confirmedReasonTemplate: "Mains qui tiraillent sous {drug}, sans soin toléré : le conseil est justifié.",
    matchingTags: ["émollient", "hydratation", "peau sensible", "apaisant"],
    productExclude: HAND_CARE_EXCLUDE,
    productPrefer: HAND_CARE_PREFER,
    benefits: ["Mains moins sèches", "À renouveler après chaque lavage", "Sans parfum à privilégier"],
    shortReasonTemplate: "Alitrétinoïne orale ({drug}) : sécheresse de la peau fréquente ; le RCP recommande une crème hydratante.",
    rationaleTemplate:
      "Le RCP de Toctino ({drug}) conseille aux patients sujets à la sécheresse de la peau et des lèvres d'utiliser une crème hydratante et un baume à lèvres. Dans l'eczéma chronique des mains, la protection de la peau contre les irritants fait partie de la prise en charge (RCP, 4.2). Le soin de marque vient du document.",
    counterScriptTemplate:
      "« Avec {drug}, les mains peuvent tirailler : une crème pour les mains après chaque lavage aide. {product} peut convenir. Gardez aussi les gestes de protection contre les irritants. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) peut dessécher la peau. {product} s'applique après chaque lavage des mains. Continuez à vous protéger des irritants.",
    clinicalContext: `${RCP.toctino}, rubrique 4.4 : « Il est nécessaire de conseiller aux patients sujets à la sécheresse de la peau et des lèvres d'utiliser une crème hydratante et un baume à lèvres » ; rubrique 4.2 : protection de la peau, évitement des allergènes et des irritants. Le soin de marque vient du document.`,
    safetyNotes: [
      "Programme de prévention de la grossesse : contraception au moins 1 mois avant, pendant et 1 mois après — alerte prioritaire.",
      "Doxycycline et autres cyclines, vitamine A et autres rétinoïdes : contre-indiqués avec Toctino.",
    ],
  }),
  // ---- 3. Érythromycine cutanée (Erythrogel) ----------------------------------------------------
  skinAdvice({
    ...COMMON_MOISTURIZER,
    key: "skin-erythromycin-moisturizer",
    title: "Hydratant sous érythromycine cutanée",
    documentRows: rows(3),
    atcPrefixes: ["D10AF02"],
    question: "Votre peau sèche-t-elle depuis le début du gel ? Utilisez-vous un sérum exfoliant ? (Oui : peau sèche sous le gel, sans hydratant adapté.)",
    confirmedReasonTemplate: "Peau sèche sous {drug}, sans hydratant adapté : le conseil est justifié.",
    shortReasonTemplate: "Érythromycine cutanée ({drug}) : la notice autorise un hydratant non comédogène et déconseille les produits irritants.",
    rationaleTemplate:
      "La notice d'Erythrogel ({drug}) autorise les hydratants parmi les produits testés non comédogènes, et demande d'éviter pendant le traitement les cosmétiques nettoyants astringents, desséchants ou irritants, les produits parfumés ou alcoolisés. Le RCP ne cite aucun exfoliant nommément.",
    counterScriptTemplate:
      "« Avec {drug}, un hydratant non comédogène est possible : {product} peut convenir. Évitez en revanche les produits parfumés ou alcoolisés, les parfums et eaux de toilette, et les exfoliants en plus. »",
    patientReasonTemplate:
      "Votre gel ({drug}) peut dessécher la peau. {product} l'hydrate sans boucher les pores. Évitez parfums, produits alcoolisés et exfoliants.",
    clinicalContext: `${RCP.erythrogel} : notice, « Vous pouvez utiliser les produits de maquillage et les produits hydratants de votre choix en les choisissant parmi les produits testés non comédogènes » ; « Évitez […] produits cosmétiques nettoyants astringents, desséchants ou irritants, ou […] parfumés ou alcoolisés » ; rubrique 4.4 : éviter parfums et eaux de toilette. « Irritation sévère : réévaluation » ne figure pas dans le RCP (document).`,
    safetyNotes: [
      "Erythrogel déconseille le savon ALCALIN et les lavages trop fréquents ; ne pas confondre avec le savon acide déconseillé dans la candidose.",
      "Une réaction cutanée sévère (éruption rouge squameuse avec cloques) : contacter un médecin sans attendre.",
    ],
  }),
  // ---- 4. Brimonidine cutanée (Mirvaso) ---------------------------------------------------------
  skinAdvice({
    ...SENSITIVE_MOISTURIZER,
    key: "skin-brimonidine-moisturizer",
    title: "Hydratant doux sous brimonidine (rosacée)",
    documentRows: rows(4),
    atcPrefixes: ["D11AX21"],
    question: "Avez-vous besoin d'un hydratant ? Les rougeurs s'aggravent-elles après le gel ? (Oui : peau sèche, sans aggravation des rougeurs.)",
    confirmedReasonTemplate: "Peau sèche sous {drug}, sans aggravation des rougeurs : le conseil est justifié.",
    shortReasonTemplate: "Brimonidine ({drug}) : un cosmétique ne s'applique qu'une fois le gel absorbé par la peau.",
    rationaleTemplate:
      "Le RCP de Mirvaso ({drug}) permet d'utiliser des produits cosmétiques, qui ne doivent pas être appliqués immédiatement avant le gel mais seulement après son absorption par la peau. Mirvaso ne s'applique pas sur une peau irritée. Une rougeur qui s'aggrave ou une irritation importante demande d'arrêter le gel et de joindre le prescripteur — pas d'ajouter un soin.",
    counterScriptTemplate:
      "« Avec {drug}, on applique d'abord le gel et on attend qu'il soit absorbé : {product} se met ensuite si la peau est sèche. Si les rougeurs augmentent ou si la peau brûle, arrêtez le gel et appelez votre médecin. »",
    patientReasonTemplate:
      "Avec votre gel ({drug}), attendez qu'il soit absorbé avant d'appliquer un hydratant comme {product}. Si les rougeurs augmentent, arrêtez et contactez votre médecin.",
    clinicalContext: `${RCP.mirvaso}, rubrique 4.2 : les produits cosmétiques « ne doivent pas être appliqués immédiatement avant l'application quotidienne de Mirvaso ; ils doivent être appliqués seulement après absorption de Mirvaso par la peau » ; rubrique 4.4 : ne pas appliquer sur une peau irritée ; arrêter en cas d'aggravation de l'érythème. Source du document : Vidal et fabricant, non relus.`,
    safetyNotes: [
      "Rougeur plus intense, cuisson ou irritation importante : arrêter le gel et contacter le prescripteur, sans simplement ajouter un soin.",
      "Antidépresseurs de type IMAO, tricycliques ou tétracycliques : Mirvaso est contre-indiqué.",
    ],
  }),
  // ---- 5. Dupilumab (Dupixent) ------------------------------------------------------------------
  skinAdvice({
    ...EMOLLIENT_BASE,
    key: "skin-dupilumab-emollient",
    title: "Émollient sous dupilumab (dermatite atopique)",
    documentRows: rows(5),
    atcPrefixes: ["D11AH05"],
    productPrefer: ATOPIC_EMOLLIENT_PREFER,
    basePriority: 66,
    question: "Dupixent a plusieurs indications : s'agit-il de la dermatite atopique ? Continuez-vous à hydrater votre peau chaque jour ? Votre soin actuel vous convient-il ? (Oui : dermatite atopique confirmée, sans émollient quotidien adapté.)",
    confirmedReasonTemplate: "Dermatite atopique confirmée sous {drug}, sans émollient quotidien adapté : le conseil est justifié.",
    shortReasonTemplate: "Dupilumab ({drug}) : si la dermatite atopique est confirmée, l'émollient quotidien complète le traitement.",
    rationaleTemplate:
      "Dupixent ({drug}) a plusieurs indications (dermatite atopique, asthme…) : le nom seul ne suffit pas, d'où la question. Si la dermatite atopique est confirmée, un émollient quotidien complète le traitement prescrit, il ne le remplace pas. Une nouvelle rougeur de l'œil, une douleur ou un trouble visuel demandent un avis médical.",
    counterScriptTemplate:
      "« En plus de {drug}, un émollient chaque jour entretient la peau atopique : {product} peut convenir. Il complète vos soins, il ne les remplace pas. Un œil qui rougit ou qui fait mal : prévenez votre médecin. »",
    patientReasonTemplate:
      "En plus de votre traitement ({drug}), un émollient quotidien aide la peau atopique. {product} complète vos soins prescrits. Un œil rouge ou douloureux : voyez votre médecin.",
    clinicalContext: `${RCP.dupixent}, rubrique 4.4 : conjonctivite et kératite — signaler tout symptôme oculaire nouveau ou qui s'aggrave ; examen ophtalmologique si la conjonctivite ne guérit pas ; ne pas interrompre brutalement les corticostéroïdes. Aucune interaction avec les cosmétiques ni les émollients dans le RCP : l'émollient vient de Vidal et du fabricant (document), non relus.`,
    safetyNotes: [
      "Nouvelle rougeur de l'œil, douleur ou trouble visuel : avis médical, sans se limiter à un soin de confort.",
      "Ne pas arrêter ni modifier de soi-même un traitement de l'asthme ou un corticoïde.",
    ],
  }),
  // ---- 6. Clobétasol cutané, crème (Dermoval) ---------------------------------------------------
  skinAdvice({
    ...EMOLLIENT_BASE,
    key: "skin-clobetasol-cream-emollient",
    title: "Émollient sous clobétasol crème (psoriasis)",
    documentRows: rows(6),
    atcPrefixes: ["D07AD01"],
    nameGate: CLOBETASOL_CREAM,
    basePriority: 66,
    question: "Pour quelle affection la crème est-elle prescrite ? Avez-vous un émollient pour les zones sèches ? (Oui : psoriasis confirmé, sans émollient quotidien.)",
    confirmedReasonTemplate: "Psoriasis confirmé sous {drug}, sans émollient quotidien : le conseil est justifié.",
    shortReasonTemplate: "Clobétasol crème ({drug}) : si le psoriasis est confirmé, un émollient complète le soin, appliqué séparément.",
    rationaleTemplate:
      "Le clobétasol ({drug}) est un corticoïde très fort (groupe IV) aux indications multiples (plaques limitées et résistantes de psoriasis, lupus discoïde, lichen…) : le nom seul ne dit pas l'affection, d'où la question. Si le psoriasis est confirmé, un émollient quotidien complète le soin, appliqué séparément. Durée, surface et suivi se respectent ; au-delà de 2 semaines, une préparation moins puissante doit être envisagée.",
    counterScriptTemplate:
      "« En plus de {drug}, un émollient chaque jour sur les zones sèches complète le soin : {product} peut convenir, appliqué séparément de la crème. Respectez la durée et la surface prescrites. »",
    patientReasonTemplate:
      "En plus de votre crème ({drug}), un émollient aide les zones sèches. {product} s'applique séparément. Respectez la durée et la surface prescrites.",
    clinicalContext: `${RCP.dermoval}, rubrique 4.1 : « plaques limitées et résistantes » de psoriasis, lupus érythémateux discoïde, lichens ; 4.2 : au-delà de 2 semaines, envisager une préparation moins puissante ; 4.4 : psoriasis, surveillance médicale attentive. L'émollient séparé vient de Vidal (document), non relu.`,
    safetyNotes: [
      "Corticoïde très fort : durée, surface et suivi prescrits ; pas d'autre corticoïde en même temps sans avis.",
      "Pas de pansement occlusif ni de couche sur la zone : l'absorption augmente.",
    ],
  }),
  // ---- 7. Clobétasol, shampooing (Clobex) -------------------------------------------------------
  skinAdvice({
    key: "skin-clobetasol-shampoo-mild-shampoo",
    title: "Shampooing doux avec Clobex (psoriasis du cuir chevelu)",
    documentRows: rows(7),
    atcPrefixes: ["D07AD01"],
    nameGate: CLOBETASOL_SHAMPOO,
    basePriority: 60,
    question: "Avez-vous besoin d'un shampooing doux pour compléter le rinçage ou les autres lavages ? (Oui : pas de shampooing doux pour les lavages.)",
    confirmedReasonTemplate: "Pas de shampooing doux pour les lavages avec {drug} : le conseil est justifié.",
    matchingTags: ["shampooing", "cuir chevelu"],
    productExclude: MILD_SHAMPOO_EXCLUDE,
    productPrefer: MILD_SHAMPOO_PREFER,
    benefits: ["Lavage doux, rinçage complet", "Calendrier du traitement conservé", "Tolérance du parfum à vérifier"],
    shortReasonTemplate: "Clobétasol shampooing ({drug}) : un shampooing habituel peut compléter le lavage ; le produit se rince à fond.",
    rationaleTemplate:
      "Le RCP de Clobex ({drug}) : le produit reste posé 15 minutes sans être couvert, puis se rince à fond ; les cheveux peuvent être lavés en ajoutant, si nécessaire, du shampooing normal. Il ne se rince pas à moitié : un rinçage insuffisant interagit avec les teintures capillaires. Un autre antipelliculaire n'est pas ajouté d'office : le besoin et le calendrier se valident.",
    counterScriptTemplate:
      "« Avec {drug}, on laisse poser 15 minutes sans couvrir, puis on rince à fond ; un shampooing doux comme {product} peut compléter le lavage. Gardez le calendrier prescrit, quatre semaines au plus. »",
    patientReasonTemplate:
      "Après le temps de pose de votre shampooing ({drug}), rincez à fond. {product} peut compléter le lavage en douceur. Gardez le calendrier prescrit.",
    clinicalContext: `${RCP.clobex}, rubrique 4.2 : « Après application, CLOBEX doit rester posé sans être couvert pendant 15 minutes » puis rincé à fond ; durée au plus 4 semaines, 50 g par semaine au plus ; rubrique 4.4 : rincer à fond « pour éviter toute interaction avec les teintures capillaires ». Aucune interdiction de shampooing dans le RCP. Le shampooing de marque vient du document.`,
    safetyNotes: [
      "Réservé au cuir chevelu de l'adulte (psoriasis modéré) : jamais sur le visage ni d'autres zones.",
      "Pas de bonnet occlusif ; rincer à fond, surtout après une coloration.",
    ],
  }),
  // ---- 8. Éconazole cutané ----------------------------------------------------------------------
  skinAdvice({
    key: "skin-econazole-cleanser",
    title: "Lavant doux sous éconazole cutané (candidose)",
    documentRows: rows(8),
    category: "HYGIENE",
    atcPrefixes: ["D01AC03"],
    basePriority: 60,
    question: "Quelle zone est atteinte ? Quel lavant utilisez-vous ? Prenez-vous un anticoagulant antivitamine K ? (Oui : candidose cutanée confirmée, avec un lavant acide ou qui irrite.)",
    confirmedReasonTemplate: "Candidose cutanée confirmée sous {drug}, avec un lavant acide ou irritant : un lavant doux est justifié.",
    matchingTags: ["hygiène intime"],
    productExclude: GENTLE_INTIMATE_EXCLUDE,
    productPrefer: GENTLE_INTIMATE_PREFER,
    benefits: ["Lavage doux de la zone", "À rincer, puis bien sécher", "Parfum : tolérance à vérifier"],
    shortReasonTemplate: "Éconazole cutané ({drug}) : en cas de candidose, le savon à pH acide est déconseillé.",
    rationaleTemplate:
      "Le RCP de l'éconazole ({drug}) déconseille, en cas de candidose, un savon à pH acide (pH favorisant la multiplication du candida). Un lavant doux sans savon, à pH alcalin, le remplace pour la toilette externe. Sous antivitamine K (Coumadine…), l'INR est contrôlé plus souvent pendant le traitement et après son arrêt.",
    counterScriptTemplate:
      "« Avec {drug}, on évite les savons acides sur la zone atteinte : {product} est un lavant doux qui peut convenir, à rincer puis bien sécher. Si vous prenez un anticoagulant, prévenez votre médecin : l'INR est à contrôler plus souvent. »",
    patientReasonTemplate:
      "Avec votre crème ({drug}), évitez les savons acides sur la zone atteinte. {product} lave en douceur ; rincez et séchez bien. Si vous prenez un anticoagulant, prévenez votre médecin.",
    clinicalContext: `${RCP.econazole}, rubrique 4.4 : « Candidoses : il est déconseillé d'utiliser un savon à pH acide » ; « Interaction médicamenteuse avec les antivitamines K : l'INR doit être contrôlé plus fréquemment […] pendant le traitement […] et après son arrêt » ; rubrique 4.1 : indication à confirmer (mycoses des plis non macérées…). Le lavant de marque (Saforelle, dès 10 ans, peau non lésée) vient du fabricant, non relu.`,
    safetyNotes: [
      "Ne pas arrêter l'anticoagulant de soi-même : le médecin adapte la dose (la notice dit de le prévenir).",
      "Peau lésée ou suintante : pas de lavant parfumé sans avis ; le RCP conseille d'éviter l'éconazole le 1er trimestre de grossesse.",
    ],
  }),
];

// -----------------------------------------------------------------------------
// Les vigilances : ce qu'on n'associe pas, ce qu'on ne fait pas.
// -----------------------------------------------------------------------------

const UV_RCP = "Évitez l'exposition intense au soleil et les cabines à UV ; au besoin, une protection solaire d'indice SPF 15 au moins.";

export const SKIN_SERIES_4_VIGILANCES: VigilanceRule[] = [
  // ---- 1. Soriatane -----------------------------------------------------------------------------
  skinVigilance({
    key: "skin-acitretin-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Acitrétine détectée",
    atcPrefixes: ["D05BB02"],
    substances: ["acitretine", "soriatane"],
    explanationTemplate:
      "Le RCP de Soriatane ({drug}) contre-indique la grossesse et l'allaitement (programme de prévention : contraception sans interruption de 1 mois avant à 3 ans après l'arrêt), l'alcool sous toutes ses formes — boissons, aliments, médicaments — chez la femme en âge de procréer pendant le traitement et 2 mois après, la vitamine A et les autres rétinoïdes (hypervitaminose A), les tétracyclines dont la doxycycline (hypertension intracrânienne) et le méthotrexate (hépatotoxicité). Pas de don de sang pendant le traitement et 3 ans après. Un complément de vitamine A est écarté ; les produits qui contiennent de l'alcool sont à signaler.",
    concerned: [
      "Vitamine A et multivitamines qui en contiennent (contre-indiqué)",
      "Doxycycline et autres tétracyclines (contre-indiqué, des deux côtés : RCP de Soriatane et de la doxycycline)",
      "Méthotrexate (contre-indiqué)",
      "Alcool, y compris dans les médicaments et les aliments, chez la femme en âge de procréer (contre-indiqué)",
      "Grossesse et allaitement (contre-indiqué), don de sang (interdit pendant 3 ans après)",
    ],
    patientAdvice: "Ni vitamine A, ni cycline (doxycycline…), ni alcool — boissons, aliments, médicaments — si vous pouvez être enceinte, et pas de don de sang. Demandez toujours à votre pharmacien avant de prendre quoi que ce soit en plus.",
    blockTags: ["vitamine a"],
    documentRows: rows(1),
    sources: [RCP.soriatane, RCP.doxycycline, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-acitretin-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Acitrétine détectée",
    atcPrefixes: ["D05BB02"],
    substances: ["acitretine", "soriatane"],
    explanationTemplate:
      "Avec {drug}, le RCP demande d'éviter l'exposition intense au soleil et les lampes UV (protection SPF 15 ou plus si besoin). La notice conseille les lunettes plutôt que les lentilles de contact en cas de sécheresse oculaire importante. Le RCP ne cite aucun cosmétique à éviter (« les traitements locaux usuels n'interfèrent pas avec l'acitrétine ») : un exfoliant sur une peau irritée est déconseillé par tolérance, pas par interdiction.",
    concerned: [
      "Soleil intense et cabines à UV (RCP 4.4)",
      "Lentilles de contact en cas de sécheresse oculaire importante : préférer les lunettes (notice)",
      "Soins exfoliants sur une peau irritée (exemple : La Roche-Posay Effaclar Sérum Ultra Concentré) — choix de tolérance, pas contre-indication",
    ],
    patientAdvice: UV_RCP,
    blockTags: ["exfoliant"],
    documentRows: rows(1),
    sources: [RCP.soriatane, DOCUMENT_SOURCE],
  }),
  // ---- 2. Toctino -------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-alitretinoin-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Alitrétinoïne détectée",
    atcPrefixes: ["D11AH04"],
    substances: ["alitretinoine", "toctino"],
    explanationTemplate:
      "Le RCP de Toctino ({drug}) contre-indique la grossesse et l'allaitement (programme de prévention : contraception au moins 1 mois avant, pendant et 1 mois après, avec suivi mensuel), les tétracyclines dont la doxycycline (association contre-indiquée), la vitamine A et les autres rétinoïdes (hypervitaminose A), et l'allergie aux arachides et au soja (le médicament contient de l'huile de soja). Pas de don de sang pendant le traitement et 1 mois après. Contrairement à Soriatane, le RCP ne restreint pas l'alcool. Un complément de vitamine A est écarté.",
    concerned: [
      "Doxycycline et autres tétracyclines (contre-indiqué)",
      "Vitamine A et autres rétinoïdes, multivitamines qui en contiennent (contre-indiqué)",
      "Allergie aux arachides ou au soja (contre-indiqué)",
      "Grossesse et allaitement (contre-indiqué)",
      "Fluconazole, miconazole, kétoconazole par voie générale : réduction de la dose à envisager (affaire du prescripteur)",
    ],
    patientAdvice: "Ni vitamine A, ni cycline (doxycycline…) pendant le traitement. Pas de don de sang pendant le traitement et 1 mois après.",
    blockTags: ["vitamine a"],
    documentRows: rows(2),
    sources: [RCP.toctino, RCP.doxycycline, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-alitretinoin-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Alitrétinoïne détectée",
    atcPrefixes: ["D11AH04"],
    substances: ["alitretinoine", "toctino"],
    explanationTemplate:
      "Avec {drug}, le RCP demande d'éviter l'exposition intense au soleil et les lampes UV (SPF 15 ou plus au besoin) et de prévenir la sécheresse oculaire par larmes artificielles ou pommade lubrifiante ; une intolérance aux lentilles de contact peut obliger à porter des lunettes. Sur des mains en eczéma inflammatoire, un gommage ajoute de l'irritation : conseil de tolérance, sans interaction avec Toctino.",
    concerned: [
      "Gommage ou exfoliant sur les mains en eczéma inflammatoire (exemple : Eucerin DermoPure Clinical Gommage Purifiant) — conseil de tolérance",
      "Soleil intense et cabines à UV (RCP 4.4)",
      "Lentilles de contact si l'œil devient sec : préférer les lunettes",
    ],
    patientAdvice: "Pas de gommage sur les mains qui sont en poussée. Protégez-vous du soleil et des UV.",
    blockTags: ["exfoliant"],
    documentRows: rows(2),
    sources: [RCP.toctino, DOCUMENT_SOURCE],
  }),
  // ---- 3. Erythrogel ----------------------------------------------------------------------------
  skinVigilance({
    key: "skin-erythromycin-avoid",
    kind: "AVOID",
    title: "À éviter en plus du traitement",
    subtitle: "Érythromycine cutanée détectée",
    atcPrefixes: ["D10AF02"],
    substances: ["erythrogel"],
    explanationTemplate:
      "La notice d'Erythrogel ({drug}) demande d'éviter pendant le traitement les produits cosmétiques nettoyants astringents, desséchants ou irritants, les produits parfumés ou alcoolisés ; le RCP demande d'éviter parfums, eaux de toilette et eaux de Cologne, les lavages trop fréquents et — attention — les savons ALCALINS qui favorisent la production de sébum. Il demande aussi d'éviter le contact avec les muqueuses et les zones fragiles (le gel contient de l'alcool). Un sérum exfoliant à acides s'ajoute à l'irritation : déconseillé par déduction, sans interdiction nominative. Une résistance croisée est possible avec les autres antibiotiques locaux (macrolides, clindamycine).",
    concerned: [
      "Parfums, eaux de toilette, produits parfumés ou alcoolisés (RCP 4.4, notice)",
      "Nettoyants astringents, desséchants ou irritants ; savons alcalins et lavages trop fréquents",
      "Exfoliants et sérums à acides (exemple : La Roche-Posay Effaclar Sérum Ultra Concentré) — déduction de leur formule",
      "Autre antibiotique local contre l'acné (résistance croisée possible)",
    ],
    patientAdvice: "Pas de parfum ni de produit alcoolisé sur la zone, pas d'exfoliant en plus, et pas de lavages trop fréquents au savon.",
    blockTags: ["exfoliant"],
    documentRows: rows(3),
    sources: [RCP.erythrogel, DOCUMENT_SOURCE],
  }),
  // ---- 4. Mirvaso -------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-brimonidine-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Brimonidine cutanée détectée",
    atcPrefixes: ["D11AX21"],
    substances: ["brimonidine", "mirvaso"],
    explanationTemplate:
      "Le RCP de Mirvaso ({drug}) le contre-indique chez les patients traités par un inhibiteur de la monoamine oxydase (sélégiline, moclobémide), par un antidépresseur tricyclique (imipramine) ou tétracyclique (maprotiline, miansérine, mirtazapine), et chez l'enfant de moins de 2 ans ; il ne s'utilise pas de 2 à 18 ans. Prudence avec l'alcool et les dépresseurs du système nerveux central, avec les antihypertenseurs et les glucosides cardiotoniques. Ces points viennent du RCP, pas du document : la question au comptoir doit porter sur les antidépresseurs.",
    concerned: [
      "IMAO, antidépresseurs tricycliques ou tétracycliques (contre-indiqué)",
      "Alcool, sédatifs, opiacés : effet additif possible (prudence)",
      "Enfant de moins de 18 ans (contre-indiqué avant 2 ans, non utilisé ensuite)",
    ],
    patientAdvice: "Dites à votre pharmacien si vous prenez un antidépresseur : ce gel est contre-indiqué avec certains.",
    documentRows: rows(4),
    sources: [RCP.mirvaso],
  }),
  skinVigilance({
    key: "skin-brimonidine-avoid",
    kind: "AVOID",
    title: "À différer ou à éviter",
    subtitle: "Brimonidine cutanée détectée",
    atcPrefixes: ["D11AX21"],
    substances: ["brimonidine", "mirvaso"],
    explanationTemplate:
      "Avec {drug}, aucun cosmétique n'est appliqué avant le gel : seulement après son absorption par la peau. Le gel ne s'applique pas sur une peau irritée ni sur des plaies ; un sérum à acides exfoliants est déconseillé sur la peau irritée par tolérance, sans interaction établie. Dose maximale : 1 g par jour (environ 5 petits pois), une application par 24 heures, sur le visage. L'érythème et les bouffées de chaleur peuvent réapparaître plus intenses ; en cas d'aggravation, arrêter le gel.",
    concerned: [
      "Tout cosmétique ou hydratant appliqué avant le gel (exemple : La Roche-Posay Toleriane Dermallergo Crème — utilisable après absorption)",
      "Peau irritée (y compris après un laser) ou plaies ouvertes",
      "Exfoliants et sérums à acides sur peau irritée (exemple : Effaclar Sérum Ultra Concentré) — tolérance, pas une interaction établie",
    ],
    patientAdvice: "Gel d'abord, hydratant ensuite, une fois le gel absorbé. Les rougeurs qui augmentent : arrêtez le gel et appelez votre médecin.",
    blockTags: ["exfoliant"],
    documentRows: rows(4),
    sources: [RCP.mirvaso, "Vidal — Mirvaso : tolérance et ordre des cosmétiques (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
  // ---- 5. Dupixent ------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-dupilumab-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Dupilumab détecté",
    atcPrefixes: ["D11AH05"],
    substances: ["dupilumab", "dupixent"],
    explanationTemplate:
      "Avec {drug}, le RCP demande d'éviter les vaccins vivants et vivants atténués (sécurité non établie) ; les vaccins inactivés sont possibles. Les corticoïdes ne s'interrompent pas brutalement et le traitement de l'asthme ne se modifie pas sans avis. Une conjonctivite qui ne guérit pas, une rougeur oculaire nouvelle, une douleur ou un trouble visuel demandent un avis médical. Sur les zones eczémateuses, un gommage est déconseillé : choix lié à la peau lésée, sans aucune incompatibilité pharmacologique avec Dupixent.",
    concerned: [
      "Vaccins vivants atténués (à éviter, RCP 4.4) — les vaccins inactivés restent possibles",
      "Gommage ou exfoliant sur les zones eczémateuses (exemple : Eucerin DermoPure Clinical Gommage Purifiant) — pas une interaction avec Dupixent",
      "Arrêter brutalement un corticoïde ou un traitement de l'asthme",
    ],
    patientAdvice: "Prévenez votre médecin avant un vaccin, et en cas de rougeur ou de douleur de l'œil. Pas de gommage sur les zones d'eczéma.",
    blockTags: ["exfoliant"],
    documentRows: rows(5),
    sources: [RCP.dupixent, "Vidal — Dupixent : effets indésirables oculaires (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
  // ---- 6. Dermoval ------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-clobetasol-cream-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Clobétasol crème détecté",
    atcPrefixes: ["D07AD01"],
    substances: ["dermoval"],
    nameGate: CLOBETASOL_CREAM,
    explanationTemplate:
      "Le RCP de Dermoval ({drug}) le contre-indique en cas d'infections non traitées, de lésions ulcérées, d'acné, de rosacée, de dermatite péri-orale, et chez le nourrisson (rubrique 4.3) ; il n'est pas recommandé avant 12 ans. Ces contre-indications comptent dès qu'un patient associe un produit contre l'acné ou la rosacée. Ces points viennent du RCP, pas du document.",
    concerned: ["Acné, rosacée, dermatite péri-orale (contre-indiqué)", "Infection non traitée, lésion ulcérée (contre-indiqué)", "Nourrisson (contre-indiqué)"],
    patientAdvice: null,
    documentRows: rows(6),
    sources: [RCP.dermoval],
  }),
  skinVigilance({
    key: "skin-clobetasol-cream-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Clobétasol crème détecté",
    atcPrefixes: ["D07AD01"],
    substances: ["dermoval"],
    nameGate: CLOBETASOL_CREAM,
    explanationTemplate:
      "Dermoval ({drug}) est un corticoïde de groupe IV : le RCP de Daivobet demande d'éviter l'utilisation simultanée d'autres corticoïdes, donc pas de Daivobet sur les mêmes plaques sans validation médicale (cumul de corticoïdes). L'occlusion (pansement occlusif, couche, plis) augmente l'absorption ; une application prolongée sur le visage est déconseillée ; sur les paupières, risque de cataracte et de glaucome. La crème contient de la paraffine : ne pas fumer ni s'approcher d'une flamme nue. Les corticoïdes locaux peuvent diminuer la tolérance au glucose avec les antidiabétiques. Sur des plaques inflammatoires ou fissurées, un gommage irrite : à ne pas confondre avec un kératolytique prescrit pour des plaques épaisses.",
    concerned: [
      "Un autre corticoïde en même temps sur les mêmes plaques (exemple : Daivobet) — cumul à valider par le médecin",
      "Pansement occlusif, couches, plis ; visage ; paupières",
      "Flammes nues et cigarette (paraffine inflammable)",
      "Gommage sur plaques inflammatoires ou fissurées (exemple : Eucerin DermoPure Clinical Gommage Purifiant) — pas une interaction",
    ],
    patientAdvice: "Pas d'autre crème à la cortisone sur les mêmes plaques sans avis, pas de pansement par-dessus, pas de cigarette ni de flamme juste après l'application.",
    blockTags: ["exfoliant"],
    documentRows: rows(6),
    sources: [RCP.dermoval, RCP.daivobet, "Vidal — Psoriasis : traitements locaux et émollients (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
  // ---- 7. Clobex --------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-clobetasol-shampoo-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Clobétasol shampooing détecté",
    atcPrefixes: ["D07AD01"],
    substances: ["clobex"],
    nameGate: CLOBETASOL_SHAMPOO,
    explanationTemplate:
      "Le RCP de Clobex ({drug}) le contre-indique en cas d'infection bactérienne, virale, fongique ou parasitaire, de plaies ulcérées, sur les yeux et les paupières, et chez l'enfant de moins de 2 ans ; il n'est pas recommandé dans l'acné vulgaire, la rosacée ou la dermatite périorale. Il ne s'utilise que sur le cuir chevelu de l'adulte (psoriasis modéré), jamais sur le visage ni comme shampooing ordinaire. Ces points viennent du RCP, pas du document.",
    concerned: ["Infection du cuir chevelu, plaies ulcérées (contre-indiqué)", "Yeux et paupières (contre-indiqué)", "Acné, rosacée, dermatite périorale (non recommandé)"],
    patientAdvice: null,
    documentRows: rows(7),
    sources: [RCP.clobex],
  }),
  skinVigilance({
    key: "skin-clobetasol-shampoo-avoid",
    kind: "AVOID",
    title: "À éviter ou à vérifier",
    subtitle: "Clobétasol shampooing détecté",
    atcPrefixes: ["D07AD01"],
    substances: ["clobex"],
    nameGate: CLOBETASOL_SHAMPOO,
    explanationTemplate:
      "Avec {drug}, le produit se rince à fond pour éviter toute interaction avec les teintures capillaires ; pas de bonnet ni de bandeau occlusif (le produit reste posé 15 minutes sans être couvert) ; au plus 4 semaines et 50 g par semaine. Un autre antipelliculaire (exemple : Ducray Kelual DS Intensive, conçu pour les pellicules sévères) n'est pas ajouté d'office : il ne remplace pas Clobex et le besoin et le calendrier sont à valider — aucune contre-indication de cette combinaison n'est établie dans les sources consultées.",
    concerned: [
      "Coloration capillaire : rincer Clobex à fond (RCP 4.4)",
      "Bonnet ou bandeau occlusif pendant la pose (RCP 4.2 : « sans être couvert »)",
      "Autre shampooing antipelliculaire en ajout (exemple : Ducray Kelual DS Intensive) — à vérifier, pas contre-indiqué",
    ],
    patientAdvice: "Rincez bien, surtout si vous colorez vos cheveux. Pas de bonnet pendant la pose. Un autre shampooing traitant : demandez d'abord conseil.",
    blockTags: ["antipelliculaire"],
    documentRows: rows(7),
    sources: [RCP.clobex, "Ducray France — Kelual DS Intensive shampooing (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
  // ---- 8. Éconazole cutané ----------------------------------------------------------------------
  skinVigilance({
    key: "skin-econazole-anticoagulant",
    kind: "MONITORING",
    title: "Antivitamine K : contrôle de l'INR",
    subtitle: "Éconazole cutané détecté",
    atcPrefixes: ["D01AC03"],
    substances: ["econazole"],
    // Les ovules et les formes vaginales ont leurs propres mises en garde : cette règle vise la crème cutanée.
    nameGate: { exclude: ["ovule", "vaginal", "capsule"] },
    explanationTemplate:
      "Sous {drug}, si le patient prend un antivitamine K (acénocoumarol, fluindione, warfarine — Coumadine…), le RCP demande de contrôler l'INR plus fréquemment pendant le traitement et après son arrêt, avec adaptation éventuelle de la dose de l'antivitamine K par le médecin (précaution d'emploi : augmentation de l'effet et du risque hémorragique). C'est à demander au comptoir. Le patient ne doit pas arrêter son anticoagulant de lui-même.",
    concerned: ["Antivitamine K : acénocoumarol, fluindione, warfarine (Coumadine) — INR à contrôler plus souvent"],
    patientAdvice: "Si vous prenez un anticoagulant (Coumadine, Préviscan…), prévenez votre médecin : l'INR est à contrôler plus souvent. N'arrêtez pas votre anticoagulant seul.",
    documentRows: rows(8),
    sources: [RCP.econazole, "Vidal — Coumadine : warfarine (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-econazole-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Éconazole cutané détecté",
    atcPrefixes: ["D01AC03"],
    substances: ["econazole"],
    nameGate: { exclude: ["ovule", "vaginal", "capsule"] },
    explanationTemplate:
      "Avec {drug}, en cas de candidose, le RCP déconseille un savon à pH acide. Ne pas appliquer sur les yeux, le nez ni les muqueuses ; l'occlusion locale (plis, escarres, sujets âgés) augmente le passage dans le sang ; à éviter au premier trimestre de la grossesse sauf nécessité, et ne pas appliquer sur les seins en allaitant. La crème est parfumée (allergènes à déclaration) : réaction cutanée possible. Aucun lavant de marque n'est à exclure systématiquement : l'interdiction du savon acide ne s'attribue pas à un produit précis.",
    concerned: [
      "Savon à pH acide en cas de candidose (RCP 4.4)",
      "Occlusion, peau lésée, grande surface (passage systémique)",
      "Muqueuses et yeux",
    ],
    patientAdvice: "Évitez les savons acides sur la zone atteinte, rincez et séchez bien. Pas de pansement fermé par-dessus.",
    documentRows: rows(8),
    sources: [RCP.econazole, DOCUMENT_SOURCE],
  }),
];

