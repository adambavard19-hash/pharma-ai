/**
 * RÉFÉRENTIEL MÉDICAMENTEUX DE DÉMONSTRATION — ENTIÈREMENT FICTIF.
 *
 * ⚠️ Ces fiches sont volontairement simplifiées et NE constituent PAS une base
 * médicamenteuse. Elles servent uniquement à faire fonctionner le parcours de
 * démonstration. Toutes portent `isDemoData: true`, ce qui déclenche un
 * avertissement explicite dans l'application.
 *
 * Avant toute utilisation réelle, cette table doit être alimentée par un
 * référentiel pharmaceutique validé et maintenu à jour (voir docs/CONFORMITE.md).
 */

export type DemoDrug = {
  cisCode: string;
  name: string;
  inn: string;
  atcCode: string;
  therapeuticClass: string;
  form: string;
  strength: string;
  commonSideEffects: string[];
  interactionClasses: string[];
  cautionPopulations: string[];
  patientExplanation: string;
  intakeAdvice: string;
};

export const DEMO_DRUGS: DemoDrug[] = [
  {
    cisCode: "DEMO-60001",
    name: "Amoxicilline",
    inn: "Amoxicilline",
    atcCode: "J01CA04",
    therapeuticClass: "Antibiotique de la famille des pénicillines",
    form: "Comprimé dispersible",
    strength: "1 g",
    commonSideEffects: ["diarrhée", "nausées", "troubles digestifs", "éruption cutanée"],
    interactionClasses: ["méthotrexate"],
    cautionPopulations: ["allergie aux pénicillines", "insuffisance rénale"],
    patientExplanation:
      "Cet antibiotique aide votre organisme à combattre une infection due à des bactéries.",
    intakeAdvice:
      "Prenez-le à heures régulières et allez jusqu'au bout du traitement, même si vous vous sentez mieux.",
  },
  {
    cisCode: "DEMO-60002",
    name: "Paracétamol",
    inn: "Paracétamol",
    atcCode: "N02BE01",
    therapeuticClass: "Antalgique et antipyrétique",
    form: "Comprimé",
    strength: "1 g",
    commonSideEffects: [],
    interactionClasses: [],
    cautionPopulations: ["insuffisance hépatique", "consommation d'alcool régulière"],
    patientExplanation: "Ce médicament soulage la douleur et fait baisser la fièvre.",
    intakeAdvice:
      "Respectez un intervalle d'au moins 6 heures entre deux prises et ne dépassez pas la dose indiquée sur 24 heures.",
  },
  {
    cisCode: "DEMO-60003",
    name: "Ibuprofène",
    inn: "Ibuprofène",
    atcCode: "M01AE01",
    therapeuticClass: "Anti-inflammatoire non stéroïdien (AINS)",
    form: "Comprimé",
    strength: "400 mg",
    commonSideEffects: ["gastralgie", "troubles gastriques", "nausées"],
    interactionClasses: ["anticoagulant", "autre AINS", "corticoïde"],
    cautionPopulations: [
      "antécédent d'ulcère",
      "grossesse à partir du 6e mois",
      "insuffisance rénale",
    ],
    patientExplanation:
      "Cet anti-inflammatoire réduit la douleur et l'inflammation.",
    intakeAdvice:
      "À prendre au cours d'un repas, avec un grand verre d'eau, pour limiter l'inconfort digestif.",
  },
  {
    cisCode: "DEMO-60004",
    name: "Bétaméthasone",
    inn: "Bétaméthasone",
    atcCode: "D07AC01",
    therapeuticClass: "Dermocorticoïde d'activité forte",
    form: "Crème",
    strength: "0,05 %",
    commonSideEffects: ["sécheresse cutanée", "irritation", "amincissement cutané"],
    interactionClasses: [],
    cautionPopulations: ["visage", "plis cutanés", "enfant", "application prolongée"],
    patientExplanation:
      "Cette crème calme l'inflammation de la peau lors d'une poussée.",
    intakeAdvice:
      "Appliquez une fine couche uniquement sur les zones atteintes, et respectez la durée indiquée.",
  },
  {
    cisCode: "DEMO-60005",
    name: "Cétirizine",
    inn: "Cétirizine",
    atcCode: "R06AE07",
    therapeuticClass: "Antihistaminique",
    form: "Comprimé",
    strength: "10 mg",
    commonSideEffects: ["somnolence", "sécheresse buccale", "fatigue"],
    interactionClasses: ["alcool", "sédatif"],
    cautionPopulations: ["insuffisance rénale", "conduite de véhicule"],
    patientExplanation:
      "Ce médicament réduit les démangeaisons et les réactions allergiques.",
    intakeAdvice:
      "De préférence le soir, car il peut entraîner une somnolence chez certaines personnes.",
  },
  {
    cisCode: "DEMO-60006",
    name: "Doxycycline",
    inn: "Doxycycline",
    atcCode: "J01AA02",
    therapeuticClass: "Antibiotique de la famille des cyclines",
    form: "Comprimé",
    strength: "100 mg",
    commonSideEffects: [
      "photosensibilisation",
      "troubles digestifs",
      "irritation de l'œsophage",
    ],
    interactionClasses: ["antiacide", "fer", "calcium", "rétinoïde"],
    cautionPopulations: ["grossesse", "enfant de moins de 8 ans", "exposition solaire"],
    patientExplanation:
      "Cet antibiotique agit sur certaines bactéries et est aussi utilisé dans des traitements de longue durée.",
    intakeAdvice:
      "Avec un grand verre d'eau, sans vous allonger dans l'heure qui suit. Évitez l'exposition au soleil.",
  },
  {
    cisCode: "DEMO-60007",
    name: "Fumarate de fer",
    inn: "Fer",
    atcCode: "B03AA02",
    therapeuticClass: "Supplémentation en fer",
    form: "Gélule",
    strength: "80 mg",
    commonSideEffects: ["constipation", "selles foncées", "troubles digestifs", "nausées"],
    interactionClasses: ["cycline", "antiacide", "thé", "café"],
    cautionPopulations: ["surcharge en fer", "maladie inflammatoire de l'intestin"],
    patientExplanation:
      "Ce traitement reconstitue vos réserves en fer lorsque celles-ci sont insuffisantes.",
    intakeAdvice:
      "De préférence à jeun, à distance du thé et du café qui réduisent l'absorption du fer.",
  },
  {
    cisCode: "DEMO-60008",
    name: "Thiocolchicoside",
    inn: "Thiocolchicoside",
    atcCode: "M03BX05",
    therapeuticClass: "Myorelaxant",
    form: "Comprimé",
    strength: "4 mg",
    commonSideEffects: ["somnolence", "troubles digestifs"],
    interactionClasses: [],
    cautionPopulations: ["grossesse", "allaitement", "traitement prolongé"],
    patientExplanation:
      "Ce médicament aide à relâcher les contractures musculaires douloureuses.",
    intakeAdvice: "Traitement de courte durée, à ne pas prolonger sans avis médical.",
  },
  {
    cisCode: "DEMO-60009",
    name: "Alendronate",
    inn: "Acide alendronique",
    atcCode: "M05BA04",
    therapeuticClass: "Traitement de l'ostéoporose",
    form: "Comprimé",
    strength: "70 mg",
    commonSideEffects: ["troubles digestifs", "douleurs musculaires"],
    interactionClasses: ["calcium", "antiacide"],
    cautionPopulations: ["troubles de l'œsophage", "insuffisance rénale"],
    patientExplanation:
      "Ce traitement renforce la solidité de vos os.",
    intakeAdvice:
      "À jeun, avec un grand verre d'eau, en restant debout ou assis 30 minutes après la prise.",
  },
  {
    cisCode: "DEMO-60010",
    name: "Escitalopram",
    inn: "Escitalopram",
    atcCode: "N06AB10",
    therapeuticClass: "Antidépresseur",
    form: "Comprimé",
    strength: "10 mg",
    commonSideEffects: ["fatigue", "sécheresse buccale", "nausées", "troubles du sommeil"],
    interactionClasses: ["millepertuis", "anticoagulant", "triptan"],
    cautionPopulations: ["arrêt brutal déconseillé", "conduite de véhicule"],
    patientExplanation:
      "Ce traitement agit progressivement sur l'humeur et l'anxiété.",
    intakeAdvice:
      "À prendre chaque jour à la même heure. L'effet complet peut demander plusieurs semaines.",
  },
  {
    cisCode: "DEMO-60011",
    name: "Hydrochlorothiazide",
    inn: "Hydrochlorothiazide",
    atcCode: "C03AA03",
    therapeuticClass: "Diurétique thiazidique",
    form: "Comprimé",
    strength: "25 mg",
    commonSideEffects: ["photosensibilisation", "crampes", "fatigue"],
    interactionClasses: ["AINS", "lithium"],
    cautionPopulations: ["insuffisance rénale", "exposition solaire", "sujet âgé"],
    patientExplanation:
      "Ce médicament aide à éliminer l'excès d'eau et de sel, et contribue à faire baisser la tension.",
    intakeAdvice:
      "De préférence le matin, pour éviter d'avoir à vous lever la nuit.",
  },
  {
    cisCode: "DEMO-60012",
    name: "Prednisolone",
    inn: "Prednisolone",
    atcCode: "H02AB06",
    therapeuticClass: "Corticoïde par voie orale",
    form: "Comprimé orodispersible",
    strength: "20 mg",
    commonSideEffects: ["troubles du sommeil", "augmentation de l'appétit", "gastralgie"],
    interactionClasses: ["AINS", "anticoagulant"],
    cautionPopulations: ["diabète", "hypertension", "infection en cours"],
    patientExplanation:
      "Ce corticoïde réduit fortement l'inflammation.",
    intakeAdvice:
      "À prendre le matin, au cours du repas, pour limiter les troubles du sommeil.",
  },
];
