import type { DrugKnowledge, VigilanceKind, VigilanceResult } from "../types";
import { BASE_MAITRE_VIGILANCES } from "./vigilance-base-maitre";

/**
 * Vigilances au comptoir : ce que le traitement prescrit impose de savoir
 * AVANT de conseiller quoi que ce soit en vente libre.
 *
 * Quatre natures, et la carte du comptoir les distingue :
 *   • INTERACTION      — un complément courant se prend à distance du
 *                        médicament (fer et lévothyroxine, par exemple) ;
 *   • CONTRAINDICATION — un complément est à écarter sans avis médical
 *                        (potassium et diurétique hyperkaliémiant) ;
 *   • MONITORING       — le conseil se discute au vu du bilan biologique ;
 *   • SCREENING        — le traitement justifie de penser à un dépistage ;
 *   • USAGE            — le bon usage à rappeler au comptoir (au cours du
 *                        repas, intervalle entre deux prises, toux sèche
 *                        seulement…), tiré du RCP.
 *
 * Chaque règle est écrite ici, sourcée, versionnée — jamais formulée par le
 * modèle. Elle ne dit que ce que le résumé des caractéristiques du produit ou
 * le thésaurus des interactions de l'ANSM dit ; elle ne diagnostique rien.
 *
 * Effets sur le moteur : `blockTags` écarte les conseils et références qui
 * portent ces étiquettes ; `cautionTags` ajoute une précaution — la phrase de
 * prise à distance — aux propositions qui les portent, sans les écarter.
 */

export type VigilanceRule = {
  key: string;
  version: string;
  kind: VigilanceKind;
  severity: "WARNING" | "INFO";
  /** Ce que lit le pharmacien en titre : « Interaction potentielle ». */
  title: string;
  /** Sous-titre, avec la classe ou la substance : « Lévothyroxine détectée ». */
  subtitle: string;
  atcPrefixes: string[];
  /** Substances (DCI) reconnues dans le nom ou la DCI, sans accents, minuscules. */
  substances: string[];
  /** L'explication, `{drug}` remplacé par le nom prescrit. */
  explanationTemplate: string;
  /** Les compléments concernés, tels qu'affichés. */
  concerned: string[];
  /** La phrase à transmettre au patient, s'il y en a une. */
  patientAdvice: string | null;
  /** Étiquettes du vocabulaire produit à ÉCARTER pour cette ordonnance. */
  blockTags: string[];
  /** Étiquettes qui appellent une précaution sur la carte, sans écarter. */
  cautionTags: string[];
  precautionText: string | null;
  sources: string[];
  /** Lignes de la Base maître « Connecteur Pharma » V1 que cette règle couvre. */
  sourceRules?: number[];
};

/** Étiquettes que les vigilances reconnaissent : elles rejoignent le vocabulaire fermé. */
export const VIGILANCE_TAGS = [
  "fer", "calcium", "zinc", "potassium", "vitamine a", "millepertuis", "magnésium",
  // Base maître V1 : les compléments que les cent règles du classeur nomment.
  "vitamine k", "vitamine b12", "acide folique", "vitamine d", "vitamine e", "vitamine c", "vitamine b6", "biotine",
  "iode", "chrome", "niacine", "coenzyme q10", "levure de riz rouge", "ail", "ginkgo", "oméga-3", "ginseng",
  "échinacée", "kava", "thé vert", "curcuma", "réglisse", "hydraste", "antiacide", "multivitamines", "antioxydant",
] as const;

const CORE_VIGILANCES: VigilanceRule[] = [
  {
    key: "levothyroxine-mineral-spacing",
    version: "1.0",
    kind: "INTERACTION",
    severity: "WARNING",
    title: "Interaction potentielle",
    subtitle: "Lévothyroxine détectée",
    atcPrefixes: ["H03AA"],
    substances: ["levothyroxine", "liothyronine"],
    explanationTemplate:
      "Le fer, le calcium, le magnésium et les antiacides peuvent diminuer l'absorption de la lévothyroxine ({drug}). Un complément qui en contient se prend à distance : au moins 2 heures après, 4 heures par prudence.",
    concerned: ["Fer", "Calcium", "Magnésium", "Zinc et multiminéraux", "Chrome (picolinate) : à distance", "Biotine : fausse les dosages de TSH et d'hormones thyroïdiennes, à signaler avant un bilan"],
    patientAdvice: "Prenez votre complément au moins 2 heures après votre lévothyroxine, 4 heures par prudence.",
    blockTags: [],
    cautionTags: ["fer", "calcium", "magnésium", "zinc", "antiacide", "chrome", "biotine"],
    precautionText: "Lévothyroxine sur l'ordonnance : à prendre au moins 2 heures après, 4 heures par prudence.",
    sourceRules: [36, 37, 75, 77],
    sources: ["RCP Levothyrox (ANSM) — interactions : sels de fer, de calcium, antiacides", "Thésaurus des interactions médicamenteuses, ANSM", "NIH Office of Dietary Supplements — Calcium, Iron, Chromium, Biotin (Health Professional fact sheets)"],
  },
  {
    key: "cycline-quinolone-chelation",
    version: "1.0",
    kind: "INTERACTION",
    severity: "WARNING",
    title: "Interaction potentielle",
    subtitle: "Antibiotique chélaté par les minéraux",
    atcPrefixes: ["J01AA", "J01MA"],
    substances: ["doxycycline", "minocycline", "lymecycline", "tetracycline", "ciprofloxacine", "levofloxacine", "ofloxacine", "moxifloxacine", "norfloxacine"],
    explanationTemplate:
      "Les cyclines et les fluoroquinolones ({drug}) forment des complexes avec le fer, le calcium, le magnésium et le zinc, qui réduisent leur absorption. Un complément minéral se prend à distance de l'antibiotique, au moins 2 heures.",
    concerned: ["Fer", "Calcium", "Magnésium", "Zinc"],
    patientAdvice: "Prenez votre complément minéral au moins 2 heures après votre antibiotique.",
    blockTags: [],
    cautionTags: ["fer", "calcium", "magnésium", "zinc"],
    precautionText: "Cycline ou fluoroquinolone sur l'ordonnance : à prendre au moins 2 heures après l'antibiotique.",
    sourceRules: [39, 40, 41, 42],
    sources: ["Thésaurus des interactions médicamenteuses, ANSM — cyclines, fluoroquinolones et cations divalents"],
  },
  {
    key: "bisphosphonate-spacing",
    version: "1.0",
    kind: "INTERACTION",
    severity: "WARNING",
    title: "Interaction potentielle",
    subtitle: "Bisphosphonate détecté",
    atcPrefixes: ["M05BA", "M05BB"],
    substances: ["alendronique", "alendronate", "risedronique", "risedronate", "ibandronique", "ibandronate"],
    explanationTemplate:
      "Le calcium, le fer et le magnésium empêchent l'absorption du bisphosphonate ({drug}), qui se prend à jeun avec un grand verre d'eau. Tout complément minéral attend au moins 30 minutes, et le calcium plutôt à un autre moment de la journée.",
    concerned: ["Calcium", "Fer", "Magnésium"],
    patientAdvice: "Prenez votre bisphosphonate à jeun, puis attendez au moins 30 minutes avant tout complément ; le calcium, plutôt à un autre moment de la journée.",
    blockTags: [],
    cautionTags: ["calcium", "fer", "magnésium"],
    precautionText: "Bisphosphonate sur l'ordonnance : jamais en même temps, au moins 30 minutes après.",
    sourceRules: [43],
    sources: ["RCP acide alendronique (ANSM) — mode d'administration et interactions"],
  },
  {
    key: "potassium-hyperkaliemia",
    version: "1.0",
    kind: "CONTRAINDICATION",
    severity: "WARNING",
    title: "Contre-indication / vigilance",
    subtitle: "Traitement hyperkaliémiant détecté",
    atcPrefixes: ["C03DA", "C03DB", "C03EA", "C09A", "C09B", "C09C", "C09D", "G03AA12", "G03AC"],
    substances: ["spironolactone", "eplerenone", "amiloride", "triamterene", "drospirenone"],
    explanationTemplate:
      "{drug} favorise la rétention de potassium (diurétique épargneur, IEC, ARA II, drospirénone). Un apport en potassium expose à une hyperkaliémie, surtout en cas d'insuffisance rénale ou d'association à un IEC ou un ARA II : la supplémentation relève d'un avis médical.",
    concerned: ["Potassium (suppléments, sels de régime, multivitamines riches en potassium)", "Iodure de potassium (compléments iodés)"],
    patientAdvice: null,
    blockTags: ["potassium"],
    cautionTags: [],
    precautionText: null,
    sourceRules: [16, 17, 18, 19, 80, 81, 97],
    sources: ["Thésaurus des interactions médicamenteuses, ANSM — hyperkaliémiants et potassium : association déconseillée"],
  },
  {
    key: "loop-thiazide-monitoring",
    version: "1.0",
    kind: "MONITORING",
    severity: "WARNING",
    title: "Surveillance",
    subtitle: "Diurétique détecté",
    atcPrefixes: ["C03A", "C03B", "C03C"],
    substances: ["furosemide", "bumetanide", "hydrochlorothiazide", "indapamide", "chlortalidone"],
    explanationTemplate:
      "Les diurétiques de l'anse et thiazidiques ({drug}) augmentent les pertes urinaires de potassium et de magnésium, et au long cours de zinc. Le potassium ne se vend jamais de lui-même : il dépend du bilan et peut devenir dangereux si le contexte change. Le magnésium et le zinc se discutent au vu du bilan et du terrain. Avec un thiazidique, calcium et vitamine D peuvent conduire à une hypercalcémie, surtout chez le sujet âgé ou insuffisant rénal.",
    concerned: ["Potassium (écarté sans prescription)", "Magnésium", "Zinc (traitement prolongé)", "Calcium et vitamine D (thiazidique) : hypercalcémie possible"],
    patientAdvice: null,
    blockTags: ["potassium"],
    cautionTags: ["magnésium", "zinc", "calcium", "vitamine d"],
    precautionText: "Diurétique sur l'ordonnance : conseil à adapter au bilan biologique (kaliémie, magnésémie).",
    sourceRules: [11, 12, 13, 14, 15, 49],
    sources: ["RCP furosémide et hydrochlorothiazide (ANSM) — effets indésirables métaboliques", "NIH Office of Dietary Supplements — Magnesium, Potassium, Zinc, Vitamin D (Health Professional fact sheets)"],
  },
  {
    key: "metformin-b12",
    version: "1.0",
    kind: "SCREENING",
    severity: "INFO",
    title: "Dépistage / vigilance",
    subtitle: "Metformine détectée",
    atcPrefixes: ["A10BA02", "A10BD"],
    substances: ["metformine"],
    explanationTemplate:
      "Un traitement prolongé par metformine ({drug}) peut s'accompagner d'une baisse de la vitamine B12. En cas de fatigue inhabituelle, de fourmillements ou d'anémie, un dosage se discute avec le médecin ; une supplémentation ne se propose qu'après. L'hydraste du Canada (goldenseal) peut réduire l'exposition à la metformine d'environ 25 % : elle est écartée.",
    concerned: ["Vitamine B12 : à proposer seulement si une carence est confirmée", "Hydraste du Canada (écartée)"],
    patientAdvice: null,
    blockTags: ["hydraste"],
    cautionTags: [],
    precautionText: null,
    sourceRules: [10, 72],
    sources: ["RCP metformine (ANSM, 2022) — mise en garde : carence en vitamine B12", "MHRA Drug Safety Update — Metformin and reduced vitamin B12 levels", "NCCIH (NIH) — Goldenseal"],
  },
  {
    key: "isotretinoin-vigilance",
    version: "1.0",
    kind: "CONTRAINDICATION",
    severity: "WARNING",
    title: "Vigilances importantes",
    subtitle: "Isotrétinoïne détectée",
    atcPrefixes: ["D10BA01"],
    substances: ["isotretinoine"],
    explanationTemplate:
      "Avec l'isotrétinoïne ({drug}) : pas de vitamine A ni de complément qui en contient (hypervitaminose A), pas de cycline (hypertension intracrânienne — association contre-indiquée), et pas de soin exfoliant ou irritant sur une peau déjà fragilisée.",
    concerned: ["Vitamine A et multivitamines qui en contiennent", "Cyclines (association contre-indiquée)", "Gommages, acides exfoliants, rétinol cosmétique"],
    patientAdvice: "Évitez les compléments contenant de la vitamine A et les soins exfoliants pendant le traitement.",
    blockTags: ["vitamine a"],
    cautionTags: [],
    precautionText: null,
    sourceRules: [47],
    sources: ["RCP isotrétinoïne orale (ANSM) — contre-indications et mises en garde"],
  },
  {
    key: "anticoagulant-millepertuis",
    version: "1.0",
    kind: "CONTRAINDICATION",
    severity: "WARNING",
    title: "Contre-indication / vigilance",
    subtitle: "Anticoagulant détecté",
    atcPrefixes: ["B01AA", "B01AE", "B01AF"],
    substances: ["warfarine", "fluindione", "acenocoumarol", "apixaban", "rivaroxaban", "dabigatran", "edoxaban"],
    explanationTemplate:
      "Le millepertuis diminue l'effet de {drug} (induction enzymatique) : l'association est contre-indiquée. Sous AVK, tout apport en vitamine K doit rester stable : pas de supplément qui en contient sans coordination de l'INR — y compris après une antibiothérapie prolongée, qui peut modifier le statut en vitamine K. Le ginkgo, l'ail concentré, la vitamine E à forte dose, les oméga-3 à dose élevée, le ginseng peuvent majorer le risque de saignement ; la coenzyme Q10 peut réduire l'effet de la warfarine. Aucun ne se propose sans avis, et tout saignement inhabituel se signale.",
    concerned: ["Millepertuis (contre-indiqué)", "Vitamine K et multivitamines qui en contiennent (AVK : écartées sans coordination de l'INR)", "Ginkgo, ail concentré, ginseng : risque de saignement", "Vitamine E à forte dose, oméga-3 à dose élevée : surveillance", "Coenzyme Q10 (warfarine) : effet réduit possible"],
    patientAdvice: "Ne prenez aucun produit à base de millepertuis, gardez des apports stables en vitamine K, et demandez conseil avant toute plante ou vitamine en complément.",
    blockTags: ["millepertuis", "vitamine k"],
    cautionTags: ["ginkgo", "ail", "ginseng", "vitamine e", "oméga-3", "coenzyme q10", "multivitamines"],
    precautionText: "Anticoagulant sur l'ordonnance : risque de saignement ou d'INR modifié, à ne proposer qu'après avis.",
    sourceRules: [3, 45, 46, 53, 60, 61, 63, 64, 68, 90],
    sources: ["Thésaurus des interactions médicamenteuses, ANSM — millepertuis et anticoagulants oraux", "NIH Office of Dietary Supplements — Vitamin K, Vitamin E, Omega-3 Fatty Acids (Health Professional fact sheets)", "NCCIH (NIH) — Ginkgo, Garlic, Coenzyme Q10, Asian Ginseng"],
  },
  // ---- Bon usage : ce que le pharmacien rappelle en remettant la boîte.
  {
    key: "usage-oral-corticosteroid",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Corticoïde par voie orale",
    atcPrefixes: ["H02AB"],
    substances: ["prednisolone", "prednisone", "methylprednisolone", "betamethasone", "dexamethasone"],
    explanationTemplate: "{drug} se prend en une seule prise, le matin, au cours du repas : c'est ce qui limite l'irritation de l'estomac et respecte le rythme naturel du cortisol.",
    concerned: [],
    patientAdvice: "Prenez-le le matin, en une seule fois, pendant le repas — jamais à jeun.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: ["RCP Solupred (ANSM) — posologie et mode d'administration"],
  },
  {
    key: "usage-paracetamol",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Paracétamol",
    atcPrefixes: ["N02BE01", "N02BE51", "N02AJ"],
    substances: ["paracetamol"],
    explanationTemplate: "Avec {drug}, la dose prescrite se respecte : au moins 4 heures entre deux prises, et aucun autre médicament contenant du paracétamol en même temps (le foie ne fait pas la différence).",
    concerned: [],
    patientAdvice: "Respectez les doses : 4 heures minimum entre deux prises, et vérifiez qu'aucun autre médicament que vous prenez ne contient déjà du paracétamol.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: ["RCP Doliprane (ANSM) — posologie, mises en garde"],
  },
  {
    key: "usage-antitussive-dry-cough",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Sirop contre la toux sèche",
    atcPrefixes: ["R05DA", "R05DB", "R06AD08"],
    substances: ["oxomemazine", "dextromethorphane", "pholcodine", "codeine"],
    explanationTemplate: "{drug} calme une toux sèche, d'irritation. Si la toux devient grasse, il faut l'arrêter : les sécrétions doivent être expectorées, et c'est un fluidifiant qui devient adapté.",
    concerned: [],
    patientAdvice: "Ce sirop est pour la toux sèche. Si votre toux devient grasse, arrêtez-le et demandez conseil pour un fluidifiant.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: ["RCP Toplexil (ANSM) — indications, contre-indication en cas de toux productive"],
  },
  {
    key: "usage-antibiotic-course",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Antibiotique",
    atcPrefixes: ["J01"],
    substances: [],
    explanationTemplate: "{drug} se prend à heures régulières, jusqu'au bout de la cure prescrite, même quand on se sent mieux avant : un traitement interrompu favorise la rechute et les résistances.",
    concerned: [],
    patientAdvice: "Prenez-le à heures régulières et jusqu'à la fin, même si vous allez mieux avant.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: ["ANSM — bon usage des antibiotiques ; RCP de la spécialité"],
  },
  {
    key: "usage-nsaid-with-food",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Anti-inflammatoire",
    atcPrefixes: ["M01A"],
    substances: ["ibuprofene", "ketoprofene", "diclofenac", "naproxene"],
    explanationTemplate: "{drug} se prend au cours du repas, à la dose la plus faible et le moins longtemps possible : c'est ce qui protège l'estomac.",
    concerned: [],
    patientAdvice: "Prenez-le pendant le repas, jamais à jeun, et pas plus longtemps que prescrit.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: ["RCP ibuprofène, kétoprofène (ANSM) — mode d'administration"],
  },
  {
    key: "usage-ppi-before-breakfast",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Inhibiteur de la pompe à protons",
    atcPrefixes: ["A02BC"],
    substances: ["omeprazole", "esomeprazole", "pantoprazole", "lansoprazole", "rabeprazole"],
    explanationTemplate: "{drug} agit mieux pris le matin, avant le petit-déjeuner, en une prise : l'acidité est bloquée avant le premier repas.",
    concerned: [],
    patientAdvice: "Prenez-le le matin, avant le petit-déjeuner, avec un verre d'eau.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: ["RCP oméprazole, ésoméprazole (ANSM) — mode d'administration"],
  },
  {
    key: "usage-tear-substitutes",
    version: "1.0",
    kind: "USAGE",
    severity: "INFO",
    title: "Bon usage",
    subtitle: "Larmes artificielles",
    atcPrefixes: ["S01XA20", "S01KA"],
    substances: ["carbomere", "carbomère", "hypromellose", "hyaluronate", "carmellose", "povidone", "trehalose", "tréhalose"],
    explanationTemplate: "{drug} s'instille à distance des autres collyres (au moins cinq minutes, le gel en dernier), et les unidoses ne se gardent pas d'un jour à l'autre. Devant un écran, la règle des 20-20-20 : toutes les 20 minutes, regarder à 20 pieds (6 mètres) pendant 20 secondes, et cligner.",
    concerned: [],
    patientAdvice: "Cinq minutes entre deux collyres, le gel en dernier ; devant l'écran, une pause toutes les 20 minutes en regardant au loin, et pensez à cligner.",
    blockTags: [],
    cautionTags: [],
    precautionText: null,
    sources: ["RCP Lacrifluid, Aquarest (ANSM) — mode d'administration", "SFO — sécheresse oculaire et écrans"],
  },
];

/** Toutes les vigilances : celles du cœur, puis celles de la Base maître V1. */
export const VIGILANCE_RULES: VigilanceRule[] = [...CORE_VIGILANCES, ...BASE_MAITRE_VIGILANCES];

function norm(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Les vigilances que le traitement impose, une par règle déclenchée. */
export function evaluateVigilances(drugs: DrugKnowledge[]): VigilanceResult[] {
  const results: VigilanceResult[] = [];
  for (const rule of VIGILANCE_RULES) {
    const hits = drugs.filter((drug) => {
      const atc = drug.atcCode ?? "";
      if (rule.atcPrefixes.some((prefix) => atc.startsWith(prefix))) return true;
      const haystack = norm(`${drug.inn ?? ""} ${drug.name}`);
      return rule.substances.some((substance) => haystack.includes(substance));
    });
    if (hits.length === 0) continue;
    const drugNames = [...new Set(hits.map((drug) => drug.name))];
    results.push({
      key: rule.key,
      version: rule.version,
      kind: rule.kind,
      severity: rule.severity,
      title: rule.title,
      subtitle: rule.subtitle,
      drugNames,
      explanation: rule.explanationTemplate.replaceAll("{drug}", drugNames.join(", ")),
      concerned: rule.concerned,
      patientAdvice: rule.patientAdvice,
      blockTags: rule.blockTags,
      cautionTags: rule.cautionTags,
      precautionText: rule.precautionText,
      sources: rule.sources,
    });
  }
  return results;
}

/** Vrai si une étiquette du produit ou du conseil tombe sous une vigilance. */
export function tagsIntersect(tags: readonly string[], vigilanceTags: readonly string[]): string[] {
  const normalized = new Set(tags.map(norm));
  return vigilanceTags.filter((tag) => normalized.has(norm(tag)));
}
