import type { AdviceRule } from "./advice";
import type { VigilanceRule } from "./vigilance";
import {
  ATOPIC_EMOLLIENT_PREFER,
  BDPM,
  COMMON_MOISTURIZER,
  EMOLLIENT_BASE,
  FACE_SUN_BASE,
  PREGNANCY_BLOCK,
  skinAdvice,
  skinVigilance,
} from "./conseil-peau-motifs";

/**
 * « Conseil peau — Série 5 » : acné, psoriasis et photoprotection ; atopie et kératoses actiniques.
 *
 * Document reçu le 7 octobre 2026. Pour chaque médicament déclencheur : la question, le produit conseil, les conditions
 * et précautions, ET ce qu'on n'associe pas. La dernière colonne de cette série ne porte que des produits conseil
 * (cosmétiques, compléments alimentaires) : elle ajoute le millepertuis avec la ciclosporine et avec l'aprémilast.
 *
 * Le document est la source des CHOIX ; les RCP (BDPM, ou PDF de l'EMA pour Otezla, Adtralza et Zyclara) sont la source des
 * FAITS, relus le 10 octobre 2026. Écarts retenus à la relecture :
 *   • les mots du document sont parfois plus forts que le RCP (Aklief : « avec précaution », pas « déconseillé » ; Néoral : les
 *     UVB et la PUVA-thérapie ne doivent pas être reçus EN MÊME TEMPS) ou plus faibles (Silkis : les substances qui stimulent
 *     l'absorption du calcium « ne doivent pas être administrées ») — la carte reprend le RCP ;
 *   • des consignes du document ne sont pas dans le RCP (Roaccutane gel : « accord du médecin pour les autres cosmétiques » ;
 *     Efudix : « dermatologue avant tout ajout » ; Zyclara : « pas de mélange ») — elles restent des conseils, étiquetés
 *     « document » ;
 *   • Efudix : l'érosion est décrite par le RCP comme une réponse thérapeutique NORMALE (stade 3) ; la question du document
 *     sur la peau érodée sert à choisir le moment d'un solaire, pas à signaler un problème ;
 *   • les contre-indications que le document ne cite pas : grossesse sous Otezla et Efudix (et allaitement), déficit en DPD,
 *     brivudine et vaccin contre la fièvre jaune avec Efudix, pamplemousse, potassium et AINS avec Néoral, insuffisance
 *     rénale et hypercalcémie avec Silkis, vaccins vivants avec Adtralza.
 *
 * Toutes les règles sont PENDING. Les marques sont des exemples.
 */

export const SKIN_SERIES_5_DOCUMENT = "peau-serie-5";
const rows = (...numbers: number[]) => ({ document: SKIN_SERIES_5_DOCUMENT, rows: numbers });

const DOCUMENT_SOURCE = "Document PharmaBoost « Conseil peau — Série 5 » (7 octobre 2026)";
const EMA = "Agence européenne des médicaments (RCP lié par la BDPM)";

const RCP = {
  aklief: `RCP Aklief 50 µg/g crème — ${BDPM}, CIS 63631908`,
  roaccutaneGel: `RCP Roaccutane 0,05 % gel — ${BDPM}, CIS 66296030`,
  neoral: `RCP Néoral — ${BDPM}, CIS 67194943`,
  otezla: `RCP Otezla — ${EMA}, CIS 60418716`,
  adtralza: `RCP Adtralza — ${EMA}, CIS 62444268`,
  silkis: `RCP Silkis 3 µg/g pommade — ${BDPM}, CIS 62597239`,
  efudix: `RCP Efudix 5 % crème — ${BDPM}, CIS 60627235`,
  zyclara: `RCP Zyclara 3,75 % crème — ${EMA}, CIS 69349666`,
} as const;

/** Efudix est la crème de fluorouracile : le fluorouracile injectable (hôpital) porte le même code ATC L01BC02. */
const EFUDIX = { include: ["efudix", String.raw`fluorouracile.{0,40}creme`, String.raw`creme.{0,40}fluorouracile`] };
/** Zyclara 3,75 % (kératoses actiniques) : Aldara 5 % (condylomes, carcinome basocellulaire superficiel) a le même code ATC D06BB10. */
const ZYCLARA = { include: ["zyclara", String.raw`imiquimod.{0,30}3,75`] };

export const SKIN_SERIES_5_ADVICE_RULES: AdviceRule[] = [
  // ---- 1. Trifarotène cutané (Aklief) -----------------------------------------------------------
  skinAdvice({
    ...COMMON_MOISTURIZER,
    key: "skin-trifarotene-moisturizer",
    title: "Hydratant sous trifarotène",
    documentRows: rows(1),
    atcPrefixes: ["D10AD06"],
    question: "Avez-vous un hydratant dès le début du traitement ? Votre peau tire-t-elle ou pèle-t-elle ? (Oui : peau qui tire ou pèle, sans hydratant adapté.)",
    confirmedReasonTemplate: "Peau qui tire ou pèle sous {drug}, sans hydratant adapté : le conseil est justifié.",
    shortReasonTemplate: "Trifarotène ({drug}) : le RCP recommande un hydratant dès le début du traitement.",
    rationaleTemplate:
      "Le RCP d'Aklief ({drug}) recommande un produit hydratant si besoin dès le début du traitement, en laissant suffisamment de temps avant et après l'application pour que la peau sèche (aucun délai chiffré). Si les réactions sont sévères, le RCP prévoit de réduire la fréquence, de suspendre ou d'interrompre le traitement. Les produits à effet desquamant, irritant ou desséchant s'emploient avec précaution.",
    counterScriptTemplate:
      "« Avec {drug}, un hydratant non comédogène est recommandé dès le début : {product} peut convenir. Laissez la peau sécher entre le gel et l'hydratant. Pas de gommage ni de produit desséchant en plus. »",
    patientReasonTemplate:
      "Votre crème ({drug}) dessèche la peau, surtout au début. {product} l'hydrate sans boucher les pores. Laissez sécher entre les deux, et évitez les produits desséchants.",
    clinicalContext: `${RCP.aklief}, rubrique 4.2 : « L'utilisation d'un produit hydratant est recommandée si besoin dès le début du traitement, tout en laissant suffisamment de temps avant et après l'application d'AKLIEF pour que la peau sèche » ; rubrique 4.3 : grossesse et projet de grossesse, contre-indication. Le RCP dit « si besoin » ; le produit de marque vient du document.`,
    safetyNotes: [
      "Grossesse ou projet de grossesse : contre-indiqué — alerte prioritaire, pas un simple conseil cosmétique.",
      "Réaction sévère : réduire, suspendre ou arrêter avec le prescripteur, sans simplement ajouter un soin.",
    ],
    blockedFor: PREGNANCY_BLOCK("Aklief"),
  }),
  // ---- 2. Isotrétinoïne cutanée (Roaccutane gel) ------------------------------------------------
  skinAdvice({
    ...FACE_SUN_BASE,
    key: "skin-isotretinoin-gel-sunscreen",
    title: "Photoprotection sous isotrétinoïne en gel",
    documentRows: rows(2),
    atcPrefixes: ["D10AD04"],
    basePriority: 74,
    question: "Comment protégez-vous votre visage du soleil ? Avez-vous déjà un solaire adapté ? (Oui : visage exposé, sans solaire adapté.)",
    confirmedReasonTemplate: "Visage exposé au soleil sous {drug}, sans solaire adapté : le conseil est justifié.",
    shortReasonTemplate: "Isotrétinoïne en gel ({drug}) : le soleil et les UV irritent davantage la peau traitée.",
    rationaleTemplate:
      "Le RCP de Roaccutane gel ({drug}) dit que le soleil et les lampes à UV provoquent une irritation supplémentaire ; il demande d'éviter l'exposition dans toute la mesure du possible, et accepte la poursuite du traitement si l'exposition est réduite au minimum (chapeau, crème écran solaire) avec ajustement du rythme. Après une exposition exceptionnelle, ne pas appliquer le gel la veille, le jour même et le lendemain. Il demande aussi d'éviter tout produit parfumé ou alcoolisé : un solaire sans parfum est à privilégier. Ne pas confondre avec l'isotrétinoïne orale : le passage dans le sang est considéré comme nul.",
    counterScriptTemplate:
      "« Avec {drug}, le soleil irrite davantage la peau : limitez l'exposition, portez un chapeau, et un solaire sans parfum comme {product} complète ces mesures. Un solaire de faible indice ne suffit pas comme seule protection. »",
    patientReasonTemplate:
      "Avec votre gel ({drug}), le soleil irrite plus la peau. {product} protège le visage, sans parfum, en complément d'un chapeau et d'une exposition réduite.",
    clinicalContext: `${RCP.roaccutaneGel}, rubrique 4.4 : « L'exposition au soleil et aux lampes à ultraviolets provoque une irritation supplémentaire. Éviter en conséquence une exposition […] dans toute la mesure du possible » ; « Éviter d'utiliser tout produit parfumé ou alcoolisé » ; « ne pas appliquer ROACCUTANE la veille, le jour même et le lendemain » d'une exposition exceptionnelle ; grossesse et projet de grossesse, contre-indiqués (4.3). « Vidal demande l'accord du médecin pour les autres cosmétiques » ne figure PAS dans le RCP : consigne du document.`,
    safetyNotes: [
      "Grossesse ou projet de grossesse : contre-indiqué — alerte prioritaire. Allaitement déconseillé.",
      "Un soin de jour d'indice 15 ne remplace pas un solaire très haute protection.",
    ],
    blockedFor: PREGNANCY_BLOCK("Roaccutane gel"),
  }),
  // ---- 3. Ciclosporine orale (Néoral) -----------------------------------------------------------
  skinAdvice({
    ...FACE_SUN_BASE,
    key: "skin-ciclosporin-photoprotection",
    title: "Photoprotection sous ciclosporine",
    documentRows: rows(3),
    kind: "SAFETY",
    atcPrefixes: ["L04AD01"],
    basePriority: 84,
    question:
      "Quelle est votre protection solaire ? Prenez-vous des compléments pour le stress ou le sommeil (millepertuis) ? (Oui : exposition au soleil sans protection adaptée.)",
    confirmedReasonTemplate: "Exposition au soleil sous {drug}, sans protection adaptée : la photoprotection est justifiée.",
    shortReasonTemplate: "Ciclosporine ({drug}) : le RCP souligne le risque de cancers cutanés et déconseille l'exposition prolongée sans protection.",
    rationaleTemplate:
      "Le RCP de la ciclosporine ({drug}) indique qu'elle augmente le risque de cancers, en particulier cutanés, et déconseille fortement aux patients, notamment traités pour un psoriasis ou une dermatite atopique, de s'exposer longuement au soleil sans protection. Les UVB et la PUVA-thérapie ne doivent pas être reçus en même temps. Aucun solaire ne supprime le risque : la protection complète l'éviction du soleil, vêtements et chapeau compris. Les produits au millepertuis sont contre-indiqués avec la ciclosporine.",
    counterScriptTemplate:
      "« Avec {drug}, la peau est plus exposée aux risques du soleil : évitez les expositions prolongées, couvrez-vous, et protégez les zones découvertes avec {product}, à renouveler. Et aucun produit au millepertuis. »",
    patientReasonTemplate:
      "Votre traitement ({drug}) rend la peau plus vulnérable au soleil. {product} protège le visage et les zones découvertes ; couvrez-vous aussi. Ne prenez pas de millepertuis.",
    clinicalContext: `${RCP.neoral}, rubrique 4.4 : « Du fait du risque potentiel de survenue de cancers cutanés, il est fortement déconseillé aux patients traités par NEORAL, en particulier ceux traités pour un psoriasis ou une dermatite atopique, de s'exposer de façon prolongée au soleil sans protection et d'être traités de façon concomitante par une irradiation UVB ou une PUVA-thérapie » ; « Les patients traités par NEORAL ne doivent pas recevoir en même temps une irradiation par UVB ou une PUVA-thérapie » ; millepertuis contre-indiqué (4.3). Le RCP ne dit rien du renouvellement du solaire ni de « aucun solaire ne supprime le risque » : consignes du document.`,
    safetyNotes: [
      "Millepertuis : contre-indiqué (baisse des concentrations de ciclosporine).",
      "Vêtements, chapeau et éviction du soleil d'abord ; le solaire complète, il ne remplace pas.",
    ],
  }),
  // ---- 4. Aprémilast oral (Otezla) --------------------------------------------------------------
  skinAdvice({
    ...EMOLLIENT_BASE,
    key: "skin-apremilast-emollient",
    title: "Émollient sous aprémilast (psoriasis)",
    documentRows: rows(4),
    atcPrefixes: ["L04AA32"],
    basePriority: 64,
    question:
      "Otezla a d'autres indications : s'agit-il d'un psoriasis cutané ? Votre peau reste-t-elle sèche ? Utilisez-vous des compléments pour le sommeil ou le moral (millepertuis) ? (Oui : psoriasis cutané confirmé, peau sèche.)",
    confirmedReasonTemplate: "Psoriasis cutané confirmé et peau sèche sous {drug} : le conseil est justifié.",
    shortReasonTemplate: "Aprémilast ({drug}) : si le psoriasis est confirmé, un émollient complète les soins.",
    rationaleTemplate:
      "Otezla ({drug}) a d'autres indications (rhumatisme psoriasique, maladie de Behçet) : le nom seul ne suffit pas, d'où la question. Si le psoriasis cutané est confirmé et la peau sèche, un émollient complète les soins locaux (Vidal, référence du document). Une diarrhée importante, une perte de poids inexpliquée ou un changement marqué de l'humeur se signalent au prescripteur ; le millepertuis n'est pas recommandé.",
    counterScriptTemplate:
      "« En plus de {drug}, si la peau reste sèche, un émollient comme {product} peut aider. Une diarrhée importante, une perte de poids ou un moral qui change : prévenez votre médecin. Pas de millepertuis. »",
    patientReasonTemplate:
      "En plus de votre traitement ({drug}), un émollient aide si la peau reste sèche. {product} complète vos soins. Diarrhée importante, perte de poids ou changement d'humeur : prévenez votre médecin.",
    clinicalContext: `${RCP.otezla}, rubrique 4.1 : indications multiples ; rubrique 4.4 : diarrhée, nausées ou vomissements sévères, perte de poids inexpliquée, affections psychiatriques ; rubrique 4.5 : l'association d'inducteurs puissants du CYP3A4 (rifampicine, phénobarbital, carbamazépine, phénytoïne, millepertuis) et d'aprémilast « n'est pas recommandée » ; grossesse contre-indiquée (4.3). L'émollient vient de Vidal et du fabricant (document), non relus.`,
    safetyNotes: [
      "Grossesse : contre-indiquée ; contraception efficace exigée ; allaitement interdit.",
      "Pas de millepertuis ni d'autre inducteur enzymatique puissant : perte d'efficacité.",
    ],
    blockedFor: PREGNANCY_BLOCK("Otezla"),
  }),
  // ---- 5. Tralokinumab (Adtralza) ---------------------------------------------------------------
  skinAdvice({
    ...EMOLLIENT_BASE,
    key: "skin-tralokinumab-emollient",
    title: "Émollient sous tralokinumab (dermatite atopique)",
    documentRows: rows(5),
    atcPrefixes: ["D11AH07"],
    productPrefer: ATOPIC_EMOLLIENT_PREFER,
    basePriority: 66,
    question: "Avez-vous conservé un émollient quotidien ? Est-il bien toléré et appliqué régulièrement ? (Oui : dermatite atopique, sans émollient quotidien adapté.)",
    confirmedReasonTemplate: "Dermatite atopique sous {drug}, sans émollient quotidien adapté : le conseil est justifié.",
    shortReasonTemplate: "Tralokinumab ({drug}) : les soins de fond de l'atopie se poursuivent, dont l'émollient quotidien.",
    rationaleTemplate:
      "Sous {drug}, les soins de fond de la dermatite atopique se poursuivent en complément du traitement prescrit (Vidal, référence du document) : un émollient quotidien bien toléré, appliqué régulièrement. Une conjonctivite qui ne guérit pas, une douleur ou une baisse de vision demandent un avis médical.",
    counterScriptTemplate:
      "« En plus de {drug}, gardez votre émollient chaque jour : {product} peut convenir. Il complète le traitement, il ne le remplace pas. Un œil qui rougit, qui fait mal ou une vue qui baisse : voyez votre médecin. »",
    patientReasonTemplate:
      "En plus de votre traitement ({drug}), continuez l'émollient chaque jour : {product} aide la peau atopique. Œil rouge ou douloureux, vue qui baisse : voyez votre médecin.",
    clinicalContext: `${RCP.adtralza}, rubrique 4.4 : conjonctivite non résolue sous traitement standard → examen ophtalmologique ; « douleur oculaire ou altération de la vision » figure dans la notice, pas dans le RCP ; vaccins vivants à éviter. Le RCP ne dit rien des émollients : le conseil vient de Vidal (document), non relu.`,
    safetyNotes: [
      "Symptômes oculaires nouveaux, douleur ou baisse de vision : avis médical, sans se limiter à un soin de confort.",
      "Pas de vaccin vivant atténué pendant le traitement.",
    ],
  }),
  // ---- 6. Calcitriol cutané (Silkis) ------------------------------------------------------------
  skinAdvice({
    ...EMOLLIENT_BASE,
    key: "skin-calcitriol-emollient",
    title: "Émollient sous calcitriol cutané (psoriasis)",
    documentRows: rows(6),
    atcPrefixes: ["D05AX03"],
    basePriority: 64,
    question: "Votre peau est-elle sèche ? Utilisez-vous un gommage sur les plaques ou des compléments calcium/vitamine D ? (Oui : peau sèche, sans gommage ni complément calcium/vitamine D.)",
    confirmedReasonTemplate: "Peau sèche sous {drug}, sans gommage ni complément calcium/vitamine D : le conseil est justifié.",
    shortReasonTemplate: "Calcitriol cutané ({drug}) : un émollient complète le soin, appliqué séparément.",
    rationaleTemplate:
      "Dans le psoriasis, les émollients complètent les soins locaux (Vidal, référence du document) ; ils s'appliquent séparément de {drug}, sans mélange (le RCP de Silkis : ne pas mélanger à d'autres médicaments). Pas de pansement occlusif, au plus 35 % de la surface corporelle et 30 g de pommade par jour. Les substances qui stimulent l'absorption du calcium ne doivent pas être administrées en même temps.",
    counterScriptTemplate:
      "« En plus de {drug}, si la peau est sèche, un émollient comme {product} peut aider, appliqué séparément. Pas de pansement par-dessus, pas de gommage sur les plaques, et pas de calcium ni de vitamine D en plus sans avis. »",
    patientReasonTemplate:
      "En plus de votre pommade ({drug}), un émollient aide si la peau est sèche. {product} s'applique séparément. Pas de pansement par-dessus, ni de calcium ou de vitamine D en plus sans avis.",
    clinicalContext: `${RCP.silkis}, rubrique 4.4 : « La pommade ne doit pas être recouverte d'un pansement occlusif » ; « les substances qui en stimulent l'absorption [du calcium] ne doivent pas être administrées de façon concomitante » ; 4.5 : « agents desquamants, astringents ou irritants » (effets irritants supplémentaires), prudence avec suppléments calciques et vitamine D à fortes doses ; 6.2 : ne pas mélanger avec d'autres médicaments. L'émollient vient de Vidal et du fabricant (document), non relus.`,
    safetyNotes: [
      "Contre-indiqué en cas d'insuffisance rénale ou hépatique, d'hypercalcémie ou de trouble du métabolisme du calcium.",
      "Éviter chez l'enfant ; visage avec précaution ; ne pas utiliser pendant l'allaitement.",
    ],
  }),
  // ---- 7. Fluorouracile cutané (Efudix) ---------------------------------------------------------
  skinAdvice({
    ...FACE_SUN_BASE,
    key: "skin-fluorouracil-sunscreen",
    title: "Photoprotection sous fluorouracile cutané",
    documentRows: rows(7),
    atcPrefixes: ["L01BC02"],
    nameGate: EFUDIX,
    basePriority: 70,
    question:
      "Comment protégez-vous la zone traitée du soleil ? La peau est-elle refermée, ni érodée ni douloureuse ? (Oui : peau refermée, sans solaire adapté.)",
    confirmedReasonTemplate: "Peau refermée, sans solaire adapté sous {drug} : la photoprotection est justifiée.",
    shortReasonTemplate: "Fluorouracile cutané ({drug}) : le soleil majore les effets du produit sur les lésions.",
    rationaleTemplate:
      "Le RCP d'Efudix ({drug}) dit que l'exposition au soleil des lésions traitées peut majorer les effets du produit, et que le rayonnement UV (soleil direct, salon de bronzage) doit être évité. Le solaire quotidien d'une peau à tendance kératosique se propose sur une peau refermée, après cicatrisation — pas comme soin de plaie. L'érosion est une réponse thérapeutique normale (RCP) : sur une zone encore érodée ou très inflammatoire, on demande l'avis du médecin avant tout ajout.",
    counterScriptTemplate:
      "« Avec {drug}, évitez le soleil sur la zone, chapeau et ombre d'abord. Une fois la peau refermée, {product} peut la protéger au quotidien. Tant qu'elle est érodée ou douloureuse, rien en plus sans l'avis de votre médecin. »",
    patientReasonTemplate:
      "Avec votre crème ({drug}), évitez le soleil sur la zone. Une fois la peau refermée, {product} la protège. Tant qu'elle est érodée ou douloureuse, demandez l'avis de votre médecin.",
    clinicalContext: `${RCP.efudix}, rubrique 4.4 : « L'exposition au soleil des lésions traitées peut entraîner une majoration des effets du produit. L'exposition au rayonnement UV […] doit être évitée » ; rubrique 4.2 : l'érosion (stade 3) est une « réponse thérapeutique normale », puis réépithélisation. « Demander au dermatologue avant tout ajout cosmétique » et « après cicatrisation » ne figurent pas dans le RCP : consignes du document. Grossesse et allaitement : contre-indiqués (4.3).`,
    safetyNotes: [
      "Grossesse et allaitement : contre-indiqués ; contraception 6 mois (femme) et 3 mois (homme) après l'arrêt.",
      "Zone érodée ou très inflammatoire : pas de soin en plus sans avis du médecin.",
    ],
    blockedFor: PREGNANCY_BLOCK("Efudix"),
  }),
  // ---- 8. Imiquimod cutané (Zyclara) ------------------------------------------------------------
  skinAdvice({
    ...FACE_SUN_BASE,
    key: "skin-imiquimod-sunscreen",
    title: "Photoprotection sous imiquimod 3,75 %",
    documentRows: rows(8),
    atcPrefixes: ["D06BB10"],
    nameGate: ZYCLARA,
    basePriority: 70,
    question: "Quel solaire utilisez-vous ? Savez-vous quand laver la crème et quels soins ont été validés par le dermatologue ? (Oui : kératoses actiniques, sans solaire adapté.)",
    confirmedReasonTemplate: "Kératoses actiniques sous {drug}, sans solaire adapté : la photoprotection est justifiée.",
    shortReasonTemplate: "Imiquimod ({drug}) : la sensibilité aux coups de soleil peut augmenter ; la zone traitée se protège du soleil.",
    rationaleTemplate:
      "Le RCP de Zyclara ({drug}) recommande d'utiliser un écran solaire et de minimiser ou d'éviter l'exposition au soleil et aux UV pendant le traitement, la zone cutanée traitée devant être protégée. La crème s'applique avant le coucher et se rince après environ huit heures, à l'eau et au savon. Sur une peau érodée ou inflammatoire, le traitement n'est pas recommandé avant cicatrisation (RCP) : avis du dermatologue.",
    counterScriptTemplate:
      "« Avec {drug}, protégez la zone du soleil : {product} peut convenir, sur une peau tolérante. Respectez l'heure du rinçage le lendemain. Sur une peau érodée ou très rouge, demandez l'avis de votre dermatologue avant d'ajouter un soin. »",
    patientReasonTemplate:
      "Avec votre crème ({drug}), la peau supporte moins bien le soleil. {product} protège la zone ; respectez l'heure de rinçage prévue.",
    clinicalContext: `${RCP.zyclara}, rubrique 4.4 : « il est recommandé d'utiliser un écran solaire et de minimiser ou d'éviter l'exposition à la lumière solaire naturelle ou artificielle […] La zone cutanée traitée doit être protégée de l'exposition au soleil » ; rubrique 4.2 : application avant le coucher, contact environ huit heures puis nettoyage ; rubrique 4.1 : kératoses actiniques du visage ou du cuir chevelu, adulte immunocompétent. « Pas de mélange au traitement » et « validation dermatologique » ne figurent pas tels quels dans le RCP : consignes du document.`,
    safetyNotes: [
      "Adulte immunocompétent, visage ou cuir chevelu ; pas de bandage ni d'occlusion sur la zone.",
      "Fatigue, fièvre, courbatures ou frissons : le RCP prévoit d'envisager l'interruption ou l'adaptation du traitement.",
    ],
  }),
];

// -----------------------------------------------------------------------------
// Les vigilances : ce qu'on n'associe pas, ce qu'on ne fait pas.
// -----------------------------------------------------------------------------

export const SKIN_SERIES_5_VIGILANCES: VigilanceRule[] = [
  // ---- 1. Aklief --------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-trifarotene-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indication du traitement",
    subtitle: "Trifarotène détecté",
    atcPrefixes: ["D10AD06"],
    substances: ["trifarotene", "aklief"],
    explanationTemplate:
      "Le RCP d'Aklief ({drug}) le contre-indique pendant la grossesse et chez les femmes qui planifient une grossesse (rubrique 4.3) : alerte prioritaire, à lever avant tout conseil — pas un simple conseil cosmétique. Les femmes qui allaitent ne doivent pas l'appliquer sur la poitrine. Il ne s'applique pas sur les coupures, les écorchures, une peau eczémateuse ou un érythème solaire, ni sur les yeux, les paupières, les lèvres et les muqueuses ; la cire dépilatoire est à éviter sur la peau traitée. Le trifarotène n'affecte pas les contraceptifs hormonaux.",
    concerned: [
      "Grossesse ou projet de grossesse (contre-indiqué)",
      "Coupures, écorchures, peau eczémateuse ou en érythème solaire",
      "Cire dépilatoire sur la peau traitée",
    ],
    patientAdvice: null,
    documentRows: rows(1),
    sources: [RCP.aklief, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-trifarotene-avoid",
    kind: "AVOID",
    title: "À éviter en plus du traitement",
    subtitle: "Trifarotène détecté",
    atcPrefixes: ["D10AD06"],
    substances: ["trifarotene", "aklief"],
    explanationTemplate:
      "Avec {drug}, le RCP demande d'employer « avec précaution » les produits cosmétiques ou les médicaments contre l'acné à effet desquamant, irritant ou desséchant : ils peuvent ajouter de l'irritation (le RCP dit « précaution », pas « déconseillé » ; le document, lui, déconseille un exfoliant sans validation). Il demande aussi d'éviter l'exposition excessive au soleil et aux lampes UV, avec un écran solaire à large spectre d'indice 30 ou plus et des vêtements couvrants sur les zones traitées quand l'exposition ne peut être évitée.",
    concerned: [
      "Produits desquamants, irritants ou desséchants, gommages et sérums à acides (exemple : La Roche-Posay Effaclar Sérum Ultra Concentré) — le RCP vise la catégorie, pas la marque",
      "Soleil excessif et lampes UV ; écran solaire SPF 30 au moins quand l'exposition ne peut être évitée",
    ],
    patientAdvice: "Pas de gommage, d'acide ni de produit desséchant en plus sans avis. Protégez-vous du soleil : écran solaire d'indice 30 ou plus et vêtements.",
    blockTags: ["exfoliant"],
    documentRows: rows(1),
    sources: [RCP.aklief, DOCUMENT_SOURCE],
  }),
  // ---- 2. Roaccutane gel ------------------------------------------------------------------------
  skinVigilance({
    key: "skin-isotretinoin-gel-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indication du traitement",
    subtitle: "Isotrétinoïne en gel détectée",
    atcPrefixes: ["D10AD04"],
    substances: ["roaccutane 0,05"],
    explanationTemplate:
      "Le RCP de Roaccutane gel ({drug}) le contre-indique pendant la grossesse et chez les femmes qui planifient une grossesse (rubrique 4.3) : alerte prioritaire. L'allaitement est déconseillé. À ne pas confondre avec l'isotrétinoïne orale : le passage dans le sang est considéré comme nul et les précautions des rétinoïdes par voie générale (vitamine A, cyclines) sont levées pour le gel.",
    concerned: ["Grossesse ou projet de grossesse (contre-indiqué)", "Allaitement (déconseillé)"],
    patientAdvice: null,
    documentRows: rows(2),
    sources: [RCP.roaccutaneGel, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-isotretinoin-gel-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Isotrétinoïne en gel détectée",
    atcPrefixes: ["D10AD04"],
    substances: ["roaccutane 0,05"],
    explanationTemplate:
      "Avec {drug}, le RCP demande d'éviter tout produit parfumé ou alcoolisé et de la prudence avec les préparations locales desquamantes (kératolytiques, exfoliantes) ; il demande d'éviter le soleil et les UV dans toute la mesure du possible : le traitement peut se poursuivre si l'exposition est réduite au minimum (chapeau, crème solaire). Après une exposition exceptionnelle (une journée à la mer), ne pas appliquer le gel la veille, le jour même et le lendemain. Un soin de jour d'indice 15 ne remplace pas un solaire très haute protection.",
    concerned: [
      "Produits parfumés ou alcoolisés (RCP 4.4)",
      "Préparations desquamantes, kératolytiques et exfoliantes (prudence particulière)",
      "Soleil et lampes UV ; application du gel la veille, le jour et le lendemain d'une exposition exceptionnelle",
      "Soin de jour d'indice 15 comme seule protection (exemple : Eucerin Hyaluron-Filler +3x Effect SPF 15) — insuffisant, pas une interaction",
    ],
    patientAdvice: "Pas de produit parfumé ou alcoolisé sur la zone. Après une journée de soleil intense, sautez l'application la veille, le jour même et le lendemain.",
    blockTags: ["exfoliant"],
    documentRows: rows(2),
    sources: [RCP.roaccutaneGel, DOCUMENT_SOURCE],
  }),
  // ---- 3. Néoral --------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-ciclosporin-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Ciclosporine détectée",
    atcPrefixes: ["L04AD01"],
    substances: ["ciclosporine", "neoral"],
    // La ciclosporine en collyre (S01XA18) porte la même substance : seule la voie générale ouvre cette règle quand l'ATC est connu.
    systemicOnly: true,
    explanationTemplate:
      "Le RCP de la ciclosporine ({drug}) contre-indique les produits contenant du millepertuis (Hypericum perforatum) : baisse des concentrations sanguines de ciclosporine et de l'efficacité (rubriques 4.3 et 4.5). Il contre-indique aussi les substrats de la glycoprotéine P (bosentan, dabigatran étexilate, aliskirène). Un complément au millepertuis — stress, sommeil, humeur — est écarté de toute proposition.",
    concerned: [
      "Millepertuis, y compris en complément alimentaire pour le stress ou le sommeil (exemple : VIT'ALL+ Millepertuis Bio 250 mg) — contre-indiqué",
      "Bosentan, dabigatran étexilate, aliskirène (contre-indiqués)",
    ],
    patientAdvice: "Aucun produit au millepertuis (stress, sommeil, humeur) avec ce traitement : il le rend moins efficace.",
    blockTags: ["millepertuis"],
    documentRows: rows(3),
    sources: [RCP.neoral, DOCUMENT_SOURCE],
  }),
  skinVigilance({
    key: "skin-ciclosporin-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Ciclosporine détectée",
    atcPrefixes: ["L04AD01"],
    substances: ["ciclosporine", "neoral"],
    // La ciclosporine en collyre (S01XA18) porte la même substance : seule la voie générale ouvre cette règle quand l'ATC est connu.
    systemicOnly: true,
    explanationTemplate:
      "Avec {drug}, le RCP déconseille fortement l'exposition prolongée au soleil sans protection (risque de cancers cutanés) et demande de ne pas recevoir en même temps une irradiation UVB ou une PUVA-thérapie. Le pamplemousse et son jus augmentent la biodisponibilité de la ciclosporine. La prudence s'impose avec les anti-inflammatoires (diclofénac, naproxène, sulindac…) et les autres substances néphrotoxiques, et avec le potassium (compléments, épargneurs de potassium, régime riche en potassium) : risque d'hyperkaliémie. Les vaccins vivants atténués sont à éviter.",
    concerned: [
      "Soleil prolongé sans protection ; UVB et PUVA-thérapie en même temps",
      "Pamplemousse et jus de pamplemousse",
      "Anti-inflammatoires non stéroïdiens et autres substances néphrotoxiques : prudence (les conseiller sans avis est à éviter)",
      "Compléments de potassium : risque d'hyperkaliémie",
      "Vaccins vivants atténués",
    ],
    patientAdvice: "Pas de pamplemousse. Demandez conseil avant un anti-inflammatoire ou un complément de potassium. Prévenez avant un vaccin.",
    cautionTags: ["potassium"],
    precautionText: "Ciclosporine : le potassium expose à une hyperkaliémie (RCP 4.4) — pas de complément de potassium sans avis du médecin.",
    documentRows: rows(3),
    sources: [RCP.neoral, DOCUMENT_SOURCE],
  }),
  // ---- 4. Otezla --------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-apremilast-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Aprémilast détecté",
    atcPrefixes: ["L04AA32"],
    substances: ["apremilast", "otezla"],
    explanationTemplate:
      "Le RCP d'Otezla ({drug}) le contre-indique pendant la grossesse (rubrique 4.3) : toute grossesse doit être exclue avant le début et une contraception efficace est exigée pendant le traitement ; il ne doit pas être utilisé pendant l'allaitement. Il n'est pas non plus pris en cas d'intolérance au lactose ou au galactose. Cette alerte relève du prescripteur : elle passe avant tout conseil. Ces points viennent du RCP, pas du document.",
    concerned: ["Grossesse (contre-indiqué), contraception efficace exigée", "Allaitement (ne doit pas être utilisé)"],
    patientAdvice: null,
    documentRows: rows(4),
    sources: [RCP.otezla],
  }),
  skinVigilance({
    key: "skin-apremilast-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Aprémilast détecté",
    atcPrefixes: ["L04AA32"],
    substances: ["apremilast", "otezla"],
    explanationTemplate:
      "Avec {drug}, le RCP dit que l'association d'inducteurs puissants du CYP3A4 — rifampicine, phénobarbital, carbamazépine, phénytoïne, millepertuis — et d'aprémilast n'est pas recommandée : l'induction enzymatique peut diminuer l'exposition à l'aprémilast et son efficacité. C'est « déconseillé », pas une contre-indication absolue. Une diarrhée, des nausées ou des vomissements sévères, une perte de poids inexpliquée ou un changement marqué de l'humeur se signalent au prescripteur.",
    concerned: [
      "Millepertuis, y compris en complément pour le sommeil ou le moral (exemple : VIT'ALL+ Millepertuis Bio 250 mg) — déconseillé",
      "Rifampicine, phénobarbital, carbamazépine, phénytoïne (inducteurs puissants)",
    ],
    patientAdvice: "Pas de millepertuis (sommeil, moral) avec ce traitement. Diarrhée importante, perte de poids ou changement d'humeur : prévenez votre médecin.",
    blockTags: ["millepertuis"],
    documentRows: rows(4),
    sources: [RCP.otezla, DOCUMENT_SOURCE],
  }),
  // ---- 5. Adtralza ------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-tralokinumab-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Tralokinumab détecté",
    atcPrefixes: ["D11AH07"],
    substances: ["tralokinumab", "adtralza"],
    explanationTemplate:
      "Avec {drug}, le RCP demande de ne pas administrer de vaccins vivants et vivants atténués (sécurité non établie) ; les vaccins inactivés sont possibles. Mieux vaut éviter le médicament pendant la grossesse. Une conjonctivite qui ne guérit pas sous traitement standard demande un examen ophtalmologique ; la notice cite la douleur oculaire et l'altération de la vision. Sur les zones eczémateuses, un gommage est déconseillé : abrasion et acides inadaptés à la peau inflammatoire — aucune interaction pharmacologique avec Adtralza.",
    concerned: [
      "Vaccins vivants atténués (à éviter, RCP 4.4) — les vaccins inactivés restent possibles",
      "Gommage ou exfoliant sur les zones eczémateuses (exemple : Eucerin DermoPure Clinical Gommage Purifiant) — pas une interaction avec Adtralza",
    ],
    patientAdvice: "Prévenez votre médecin avant un vaccin. Œil rouge, douloureux ou vue qui baisse : voyez-le vite. Pas de gommage sur l'eczéma.",
    blockTags: ["exfoliant"],
    documentRows: rows(5),
    sources: [RCP.adtralza, "Vidal — Adtralza : dermatite atopique, conjonctivite (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
  // ---- 6. Silkis --------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-calcitriol-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Calcitriol cutané détecté",
    atcPrefixes: ["D05AX03"],
    substances: ["calcitriol", "silkis"],
    // Le calcitriol en capsules (Rocaltrol) est un autre médicament, d'une autre classe : cette règle vise la pommade.
    nameGate: { exclude: ["capsule", "gelule", "buvable", "injectable"] },
    explanationTemplate:
      "Le RCP de Silkis ({drug}) le contre-indique chez les patients sous traitement systémique d'une carence calcique, en cas d'insuffisance rénale ou hépatique, d'hypercalcémie ou de trouble du métabolisme du calcium (rubrique 4.3). Il est à éviter chez l'enfant ; il ne s'utilise pas pendant l'allaitement. Prudence avec les substances qui augmentent la calcémie (diurétiques thiazidiques) et la digoxine. Ces points viennent du RCP, pas du document.",
    concerned: [
      "Insuffisance rénale ou hépatique, hypercalcémie, trouble du métabolisme du calcium (contre-indiqué)",
      "Traitement par voie générale d'une carence calcique (contre-indiqué)",
      "Diurétiques thiazidiques, digoxine : prudence",
    ],
    patientAdvice: null,
    documentRows: rows(6),
    sources: [RCP.silkis],
  }),
  skinVigilance({
    key: "skin-calcitriol-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Calcitriol cutané détecté",
    atcPrefixes: ["D05AX03"],
    substances: ["calcitriol", "silkis"],
    nameGate: { exclude: ["capsule", "gelule", "buvable", "injectable"] },
    explanationTemplate:
      "Avec {drug}, le RCP dit que les substances qui stimulent l'absorption du calcium ne doivent pas être administrées en même temps, et que la prudence s'impose avec les suppléments calciques et la vitamine D à fortes doses : les apports en calcium et en vitamine D sont à vérifier avant tout complément. La pommade a un léger pouvoir irritant : agents desquamants, astringents ou irritants (un gommage sur les plaques) peuvent ajouter de l'irritation — sans interdiction nominative. Pas de pansement occlusif ; au plus 35 % de la surface corporelle et 30 g par jour ; ne pas la mélanger avec d'autres médicaments.",
    concerned: [
      "Compléments de calcium et de vitamine D à vérifier (le RCP dit : « ne doivent pas être administrées de façon concomitante »)",
      "Gommage, desquamants, astringents ou irritants sur les plaques (exemple : Eucerin DermoPure Clinical Gommage Purifiant) — pas d'interdiction nominative",
      "Pansement occlusif sur la pommade",
    ],
    patientAdvice: "Pas de calcium ni de vitamine D en complément sans avis, pas de pansement par-dessus, pas de gommage sur les plaques.",
    blockTags: ["exfoliant"],
    cautionTags: ["calcium", "vitamine d"],
    precautionText: "Calcitriol cutané : les apports en calcium et en vitamine D sont à vérifier avant tout complément (RCP Silkis 4.4 et 4.5).",
    documentRows: rows(6),
    sources: [RCP.silkis, DOCUMENT_SOURCE],
  }),
  // ---- 7. Efudix --------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-fluorouracil-contraindications",
    kind: "CONTRAINDICATION",
    title: "Contre-indications du traitement",
    subtitle: "Fluorouracile cutané détecté",
    atcPrefixes: ["L01BC02"],
    substances: ["efudix"],
    nameGate: EFUDIX,
    explanationTemplate:
      "Le RCP d'Efudix ({drug}) le contre-indique pendant la grossesse et l'allaitement (contraception efficace pendant le traitement et 6 mois après chez la femme, 3 mois chez l'homme), en cas de déficit connu en DPD, avec la brivudine et la sorivudine (intervalle de 4 semaines au moins) et avec le vaccin contre la fièvre jaune (rubrique 4.3). Sont déconseillés : la phénytoïne et la fosphénytoïne, les vaccins vivants atténués, et les antivitamines K (augmentation de l'effet et du risque hémorragique). Ces points viennent du RCP, pas du document.",
    concerned: [
      "Grossesse et allaitement (contre-indiqué)",
      "Brivudine, sorivudine (contre-indiqué, 4 semaines d'intervalle) ; vaccin contre la fièvre jaune (contre-indiqué)",
      "Phénytoïne, antivitamines K, vaccins vivants atténués (déconseillés)",
      "Déficit connu en DPD (contre-indiqué)",
    ],
    patientAdvice: "Dites à votre pharmacien si vous prenez un anticoagulant ou un antiviral contre le zona, avant tout vaccin et si vous pouvez être enceinte.",
    documentRows: rows(7),
    sources: [RCP.efudix],
  }),
  skinVigilance({
    key: "skin-fluorouracil-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Fluorouracile cutané détecté",
    atcPrefixes: ["L01BC02"],
    substances: ["efudix"],
    nameGate: EFUDIX,
    explanationTemplate:
      "Avec {drug}, le RCP demande d'éviter l'exposition au soleil et aux UV (soleil direct, salon de bronzage), de n'appliquer que sur les lésions, pas sur la peau saine, sur 500 cm² au plus, et d'éviter les muqueuses et les yeux. Les pansements occlusifs peuvent augmenter les réactions inflammatoires. L'absorption est accrue à travers une peau lésée. L'érosion (stade 3) est une réponse thérapeutique normale. Sur une zone érodée ou inflammatoire, un exfoliant est inadapté — prudence de tolérance, sans interaction démontrée.",
    concerned: [
      "Soleil direct et cabines à UV",
      "Application sur peau saine, au-delà de 500 cm², ou sous pansement occlusif",
      "Exfoliant sur zone érodée ou inflammatoire (exemple : La Roche-Posay Effaclar Sérum Ultra Concentré) — pas une interaction",
    ],
    patientAdvice: "Protégez la zone du soleil, ne mettez la crème que sur les lésions, sans pansement fermé par-dessus. Pas d'exfoliant sur une peau à vif.",
    blockTags: ["exfoliant"],
    documentRows: rows(7),
    sources: [RCP.efudix, DOCUMENT_SOURCE],
  }),
  // ---- 8. Zyclara -------------------------------------------------------------------------------
  skinVigilance({
    key: "skin-imiquimod-avoid",
    kind: "AVOID",
    title: "À éviter pendant le traitement",
    subtitle: "Imiquimod 3,75 % détecté",
    atcPrefixes: ["D06BB10"],
    substances: ["zyclara"],
    nameGate: ZYCLARA,
    explanationTemplate:
      "Avec {drug}, le RCP recommande un écran solaire et de minimiser ou d'éviter le soleil et les UV (la sensibilité aux coups de soleil peut augmenter). Pas de bandage ni d'occlusion sur la zone ; éviter les yeux, les lèvres et les narines ; ne pas utiliser en même temps une autre crème à l'imiquimod sur la même zone ; prudence avec les médicaments immunosuppresseurs. Le traitement n'est pas recommandé avant cicatrisation de la peau et peut exacerber les affections inflammatoires cutanées. Un solaire d'indice 15 ne suffit pas comme seule protection ; ce n'est pas une incompatibilité.",
    concerned: [
      "Soleil direct, cabines à UV ; solaire d'indice 15 comme seule protection (exemple : Eucerin Hyaluron-Filler +3x Effect SPF 15)",
      "Bandage, occlusion ; autre crème à l'imiquimod sur la même zone",
      "Peau érodée ou inflammatoire : pas avant cicatrisation, avis du dermatologue",
    ],
    patientAdvice: "Protégez la zone du soleil, ne la couvrez pas d'un pansement, et rincez la crème à l'heure prévue.",
    documentRows: rows(8),
    sources: [RCP.zyclara, "Vidal — Zyclara : traitement et photoprotection (référence du document, non relue)", DOCUMENT_SOURCE],
  }),
];
