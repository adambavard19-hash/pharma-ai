import type { VigilanceRule } from "./vigilance";

/**
 * Antiparasitaires externes pour chiens et chats : ce que le comptoir doit
 * savoir avant de remettre le produit.
 *
 * Deux publications officielles, lues en entier, fondent ces règles — et
 * rien d'autre :
 *   • ANSES, « Ne traitez pas votre chat avec un antiparasitaire pour chien »
 *     (mise à jour du 05/05/2021) ;
 *   • ANSES-ANMV, « Effets indésirables des antiparasitaires externes en
 *     application cutanée chez les animaux domestiques : respecter les
 *     précautions d'usage » (Bietrix, Begon, Demay, Laurentie, septembre 2022).
 *
 * Ce que ce fichier ne fait PAS, volontairement :
 *   • aucune association « conseillée » (shampooing, spray habitat…) : aucune
 *     de ces deux publications n'en recommande, et un RCP de produit n'a pas
 *     été lu ;
 *   • aucune règle sur les vermifuges (comprimés) : les publications portent
 *     sur l'application cutanée ;
 *   • aucune déduction à partir d'une marque : la règle lit l'espèce, la forme
 *     et les substances ÉCRITES dans le libellé (`veterinary.ts`).
 *
 * Elles ne s'appliquent qu'aux produits reconnus comme vétérinaires : un
 * médicament humain à la perméthrine (gale) ne les déclenche jamais.
 * Relecture par un pharmacien : en attente.
 */

const ANSES_CHAT =
  "ANSES — « Ne traitez pas votre chat avec un antiparasitaire pour chien » (mise à jour du 05/05/2021), anses.fr";
const ANSES_APE =
  "ANSES-ANMV — « Effets indésirables des antiparasitaires externes en application cutanée chez les animaux domestiques : respecter les précautions d'usage » (septembre 2022), anses.fr";

export const VETERINARY_VIGILANCES: VigilanceRule[] = [
  {
    key: "vet-chien-permethrine-chat",
    version: "1.0",
    kind: "CONTRAINDICATION",
    severity: "WARNING",
    title: "Danger pour le chat",
    subtitle: "Antiparasitaire externe pour chien",
    atcPrefixes: [],
    substances: [],
    veterinary: { cutaneous: true, species: ["CHIEN"], excludeSpecies: ["CHAT"] },
    explanationTemplate:
      "{drug} est un antiparasitaire externe pour chien. Selon l'ANSES, les antiparasitaires externes pour chiens à base de perméthrine sont toxiques pour le chat : contre-indication absolue chez cette espèce, avec des troubles neurologiques (tremblements, convulsions, ataxie, agitation, coma), parfois associés à des troubles digestifs, pouvant être mortels. Avec les pipettes concentrées, quelques gouttes sur la peau ou léchées peuvent suffire chez les chats les plus sensibles. Demander s'il y a un chat au foyer et lire la composition sur la boîte : si elle contient de la perméthrine, tenir le chien traité à l'écart des chats jusqu'à ce que le site d'application soit sec, et s'assurer qu'aucun chat ne puisse lécher le chien à cet endroit.",
    concerned: [
      "Chat du foyer : la question à poser",
      "Chien traité : à l'écart des chats jusqu'au séchage du site d'application",
      "Chat exposé : lavage à l'eau tiède avec du savon ou du liquide vaisselle, puis avis rapide d'un vétérinaire",
    ],
    patientAdvice:
      "Un chat vit à la maison ? Si le produit contient de la perméthrine, gardez le chien traité à l'écart des chats jusqu'à ce que la zone d'application soit sèche et empêchez les chats de le lécher. Si un chat a été exposé : lavez-le à l'eau tiède avec du savon ou du liquide vaisselle et appelez rapidement un vétérinaire, même sans symptôme.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: [ANSES_CHAT],
  },
  {
    key: "vet-espece-poids-age",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Antiparasitaire externe : espèce, poids, âge",
    atcPrefixes: [],
    substances: [],
    veterinary: { cutaneous: true },
    explanationTemplate:
      "Les effets indésirables graves des antiparasitaires externes comme {drug} sont plus fréquemment observés chez les animaux de petit gabarit, et un mésusage — espèce cible, poids ou âge non respectés — en est souvent à l'origine. Le produit se choisit pour l'espèce, le poids et l'âge de l'animal : un produit pour chien ne se donne pas à un chat, et le lapin tolère très mal le fipronil, présent dans plusieurs médicaments pour chiens et chats. Les conditions d'emploi figurent dans le RCP (www.ircp.anmv.anses.fr).",
    concerned: [],
    patientAdvice: "Choisissez le produit selon l'espèce, le poids et l'âge de l'animal : un produit pour chien ne va pas à un chat, ni à un lapin.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: [ANSES_APE],
  },
  {
    key: "vet-spot-on-lechage",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Pipette (spot-on) : éviter le léchage",
    atcPrefixes: [],
    substances: [],
    veterinary: { cutaneous: true, forms: ["SPOT_ON"] },
    explanationTemplate:
      "Avec une pipette comme {drug}, une grande partie des cas déclarés à l'ANMV est associée à un léchage du produit pendant ou après le traitement. Il faut appliquer la pipette au site prévu et séparer les animaux traités de leurs congénères, pour qu'ils ne puissent pas se lécher entre eux.",
    concerned: [],
    patientAdvice: "Appliquez la pipette à l'endroit indiqué sur la notice et séparez les animaux traités, pour qu'ils ne se lèchent pas entre eux.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: [ANSES_APE],
  },
  {
    key: "vet-non-unidose-surdosage",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Spray, poudre ou shampooing : risque de surdosage",
    atcPrefixes: [],
    substances: [],
    veterinary: { cutaneous: true, forms: ["SPRAY", "SHAMPOOING", "POUDRE"] },
    explanationTemplate:
      "Les poudres, sprays, aérosols et shampooings comme {drug} ne sont pas unidoses : le risque de surdosage y est plus élevé. Les conditions d'emploi du RCP se respectent scrupuleusement, d'autant plus pour un animal de petit gabarit.",
    concerned: [],
    patientAdvice: "Respectez la quantité et le mode d'emploi de la notice : avec un spray, une poudre ou un shampooing, le risque de surdosage est plus élevé.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: [ANSES_APE],
  },
  {
    key: "vet-protection-famille",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Antiparasitaire externe : protéger la famille",
    atcPrefixes: [],
    substances: [],
    veterinary: { cutaneous: true },
    explanationTemplate:
      "Des irritations de la peau et des muqueuses sont régulièrement rapportées chez les personnes en contact accidentel avec un antiparasitaire externe comme {drug}. L'ANMV recommande d'éviter de manipuler l'animal pendant plusieurs heures après l'application et de ne pas le laisser dormir avec ses propriétaires, en particulier les enfants — surtout si le traitement a été fait en fin de journée ou avec un collier. Les pipettes sont surtout associées à des atteintes de la peau ou des yeux (projection à l'ouverture, contact avec la zone traitée), les aérosols plus souvent à des effets respiratoires.",
    concerned: [],
    patientAdvice: "Évitez de caresser l'animal pendant plusieurs heures après l'application et ne le laissez pas dormir avec les enfants, surtout si le traitement est fait le soir ou avec un collier.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: [ANSES_APE],
  },
];
