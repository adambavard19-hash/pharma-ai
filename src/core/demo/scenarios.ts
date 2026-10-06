/**
 * Les délivrances que le présentateur peut simuler.
 *
 * Chaque scénario est une SUITE DE BIPS, comme au comptoir : les boîtes
 * arrivent l'une après l'autre, à quelques secondes d'écart, et forment une
 * seule délivrance — celle du patient qui est là. Rien n'est inventé côté
 * conseil : c'est le vrai moteur qui lit les boîtes, voit le stock de
 * l'officine de démonstration et propose. Le scénario ne choisit que ce qui est
 * « passé à la douchette » (ou, pour une vente sans ordonnance, la demande).
 *
 * `expects` dit ce que le scénario DOIT faire apparaître (clés des règles de
 * conseil) : c'est ce que le test de couverture vérifie, pour qu'aucun
 * scénario ne se retrouve muet le jour où une règle ou le rayon change.
 */

export type DemoScanItem = { drug: string; quantity?: number } | { product: string; quantity?: number };

export type DemoCounterRequest = { text: string; ageYears: number | null; isPregnant: boolean; isBreastfeeding: boolean; treatments: string[] };

export type DemoScenario = {
  id: string;
  title: string;
  /** La situation, en une phrase de comptoir. */
  situation: string;
  group: "ordonnance" | "chronique" | "sans-ordonnance";
  /** Les bips, dans l'ordre. Vide pour une demande sans ordonnance. */
  items: DemoScanItem[];
  /** Une demande au comptoir, à la place des bips. */
  request?: DemoCounterRequest;
  /** Ce que le scénario fait apparaître : les règles de conseil attendues. */
  expects: string[];
  /** Ce qu'on peut montrer, dans l'ordre du rendez-vous. */
  show: string[];
  /** Un geste utile pour que la démonstration soit complète. */
  tip: string;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "angine",
    title: "Angine : l'ordonnance classique",
    situation: "Un patient arrive avec un antibiotique et du paracétamol.",
    group: "ordonnance",
    items: [{ drug: "augmentin-adulte" }, { drug: "doliprane-1000" }],
    expects: ["digestive-tolerance-antibiotics", "convalescence-immunity-vitamins", "antibiotic-intimate-care"],
    show: ["Les boîtes arrivent sans saisie, l'ordonnance se reconstitue", "Le besoin repéré : la flore pendant l'antibiotique", "Un médicament conseil, un complément, un produit de parapharmacie", "« Pourquoi ce conseil ? » et le stock disponible", "Accepter l'un, refuser l'autre, puis le bilan"],
    tip: "Répondez « oui » aux questions pour faire apparaître les conseils de confort.",
  },
  {
    id: "antibiotique-dent",
    title: "Antibiotique et anti-inflammatoire",
    situation: "Soins dentaires : un antibiotique, un anti-inflammatoire et du paracétamol.",
    group: "ordonnance",
    items: [{ drug: "azithromycine" }, { drug: "ibuprofene-400" }, { drug: "doliprane-1000" }],
    expects: ["digestive-tolerance-antibiotics", "gastric-protection-nsaid"],
    show: ["Deux médicaments, deux besoins différents : la flore, puis l'estomac", "Le moteur pose la question avant de proposer le confort gastrique", "Un conseil par médicament, rangé sous sa boîte"],
    tip: "Répondez « oui » à la gêne gastrique, « non » à la fatigue : le panier reste sobre.",
  },
  {
    id: "douleur-dos",
    title: "Douleur : lombalgie",
    situation: "Anti-inflammatoire, antalgique fort et antispasmodique pour un mal de dos.",
    group: "ordonnance",
    items: [{ drug: "ibuprofene-400" }, { drug: "ixprim" }, { drug: "spasfon" }],
    expects: ["gastric-protection-nsaid", "pain-cold-hot-pack", "opioid-transit"],
    show: ["Le confort gastrique sous anti-inflammatoire", "La poche chaud-froid", "Le transit sous antalgique opioïde", "La question posée AVANT de proposer"],
    tip: "Répondez « oui » à la gêne gastrique : la proposition apparaît.",
  },
  {
    id: "allergie",
    title: "Allergie saisonnière",
    situation: "Un antihistaminique et un spray nasal, au printemps.",
    group: "ordonnance",
    items: [{ drug: "cetirizine" }, { drug: "nasonex" }],
    expects: ["eye-irritation-allergy", "nasal-hygiene-orl"],
    show: ["Les yeux et le nez : des besoins que l'ordonnance ne couvre pas", "Un collyre en médicament conseil", "Le sérum physiologique en parapharmacie"],
    tip: "Confirmez la gêne aux yeux pour proposer le collyre.",
  },
  {
    id: "senior",
    title: "Patient senior, traitement chronique",
    situation: "Cinq boîtes de renouvellement pour un patient suivi depuis des années.",
    group: "chronique",
    items: [{ drug: "amlodipine" }, { drug: "ramipril" }, { drug: "metformine" }, { drug: "omeprazole" }, { drug: "kardegic" }],
    expects: ["hypertension-self-measurement", "magnesium-ppi-longterm", "diabetes-foot-care"],
    show: ["Le moteur ne propose que ce qui a du sens pour ce traitement", "L'automesure de la tension", "Le magnésium sous inhibiteur de la pompe à protons", "Le soin des pieds du patient diabétique", "Rien d'inutile : un conseil sourcé ou rien"],
    tip: "Cinq boîtes de renouvellement : montrez qu'il ne propose pas cinq conseils pour la forme.",
  },
  {
    id: "ordonnance-chargee",
    title: "Ordonnance chargée : sept boîtes",
    situation: "Une longue ordonnance, plusieurs traitements en même temps.",
    group: "ordonnance",
    items: [{ drug: "augmentin-adulte" }, { drug: "ibuprofene-400" }, { drug: "doliprane-1000" }, { drug: "omeprazole" }, { drug: "cetirizine" }, { drug: "levothyrox" }, { drug: "spasfon" }],
    expects: ["digestive-tolerance-antibiotics", "gastric-protection-nsaid", "magnesium-ppi-longterm"],
    show: ["Les boîtes se regroupent en une seule ordonnance", "Les conseils sont classés par médicament", "Huit conseils au plus : le pharmacien n'est pas noyé"],
    tip: "Ouvrez « Pourquoi ce conseil ? » sur deux cartes différentes.",
  },
  {
    id: "isotretinoine",
    title: "Peau : isotrétinoïne",
    situation: "Un traitement de l'acné qui dessèche la peau, les lèvres et les yeux.",
    group: "ordonnance",
    items: [{ drug: "isotretinoine" }],
    expects: ["isotretinoin-skin-routine", "lip-care-isotretinoin"],
    show: ["Une routine en trois gestes : nettoyer, hydrater, protéger", "Les lèvres", "Les produits de la même gamme sont proposés ensemble"],
    tip: "Acceptez la routine en entier : le panier se remplit d'un geste.",
  },
  {
    id: "herpes-rupture",
    title: "Herpès : un produit en rupture",
    situation: "Un antiviral pour une poussée d'herpès, la lysine est en rupture.",
    group: "ordonnance",
    items: [{ drug: "valaciclovir" }],
    expects: ["herpes-labial-patch", "herpes-zona-antiseptic", "herpes-lysine"],
    show: ["Patch, antiseptique, réparation : ce que le stock couvre", "La lysine : adaptée, mais à zéro en rayon, donc jamais proposée", "Le besoin non couvert remonte dans « Assortiment »"],
    tip: "Après la vente, ouvrez « Assortiment » : le manque y est consigné.",
  },
  {
    id: "asthme",
    title: "Asthme : deux inhalateurs",
    situation: "Un bronchodilatateur et un corticoïde inhalé.",
    group: "chronique",
    items: [{ drug: "ventoline" }, { drug: "flixotide" }],
    expects: ["inhaler-spacer-chamber", "mouth-rinse-inhaled-corticosteroid"],
    show: ["La chambre d'inhalation", "Le bain de bouche sans alcool après le corticoïde inhalé", "Des conseils d'usage, pas des ventes forcées"],
    tip: "Refusez l'un des deux conseils pour montrer le suivi des refus.",
  },
  {
    id: "diabete",
    title: "Diabète et injections",
    situation: "Une insuline en stylo et de la metformine.",
    group: "chronique",
    items: [{ drug: "lantus" }, { drug: "metformine" }],
    expects: ["self-injection-sharps-container", "diabetes-foot-care", "hypoglycemia-fast-sugar"],
    show: ["Le collecteur d'aiguilles", "Le sucre rapide contre l'hypoglycémie", "Le soin des pieds"],
    tip: "Répondez « oui » aux questions de sécurité pour tout voir.",
  },
  {
    id: "corticoide",
    title: "Corticoïde par voie orale",
    situation: "Une cure de corticoïde pour une poussée inflammatoire.",
    group: "ordonnance",
    items: [{ drug: "prednisolone" }, { drug: "omeprazole" }],
    expects: ["corticosteroid-oral-calcium"],
    show: ["Le calcium et la vitamine D sous corticothérapie prolongée", "Le stock bas d'un produit (calcium)"],
    tip: "Notez la quantité en stock sur la carte : elle baisse après la vente.",
  },
  {
    id: "hors-stock",
    title: "Anticoagulant : vigilance et boîte en rupture",
    situation: "L'ordonnance porte un anticoagulant que l'officine n'a plus en rayon.",
    group: "ordonnance",
    items: [{ drug: "eliquis" }, { drug: "doliprane-1000" }],
    expects: [],
    show: ["La carte « Anticoagulant détecté » : ce qu'il faut éviter de conseiller", "La boîte est reconnue, mais le stock dit « zéro » : la commande est à passer", "Les autres lignes de l'ordonnance se traitent normalement", "Le moteur ne propose rien quand rien n'a de sens, et le dit"],
    tip: "Ouvrez la carte de vigilance, puis montrez la ligne « Stock à zéro ».",
  },
  {
    id: "sans-ordonnance-gorge",
    title: "Vente sans ordonnance : gorge et nez",
    situation: "Un client demande quelque chose pour un début de rhume, sans ordonnance.",
    group: "sans-ordonnance",
    items: [],
    request: { text: "Mal de gorge depuis hier, le nez bouché, pas de fièvre.", ageYears: 34, isPregnant: false, isBreastfeeding: false, treatments: [] },
    expects: ["sore-throat-orl", "nasal-hygiene-orl"],
    show: ["Le conseil sans ordonnance : on décrit la demande, le moteur propose", "Les questions à poser avant de conseiller", "Les produits du rayon, avec leur stock"],
    tip: "La demande est déjà saisie : lancez l'analyse.",
  },
  {
    id: "enfant-diarrhee",
    title: "Un enfant : diarrhée depuis ce matin",
    situation: "Un parent demande conseil pour son enfant de 4 ans, sans ordonnance.",
    group: "sans-ordonnance",
    items: [],
    request: { text: "Diarrhée depuis ce matin chez un enfant de 4 ans, un peu de fièvre.", ageYears: 4, isPregnant: false, isBreastfeeding: false, treatments: [] },
    expects: ["rehydration-digestive"],
    show: ["L'âge change ce que le moteur propose", "La réhydratation avant tout", "Les questions de vigilance : sang, fièvre, durée", "L'orientation vers le médecin quand il le faut"],
    tip: "Changez l'âge à 1 an et relancez : la réponse devient plus prudente.",
  },
  {
    id: "vigilance-enceinte",
    title: "Vigilance : patiente enceinte",
    situation: "Une cliente enceinte demande quelque chose contre la toux.",
    group: "sans-ordonnance",
    items: [],
    request: { text: "Toux sèche qui gratte la gorge depuis trois jours.", ageYears: 29, isPregnant: true, isBreastfeeding: false, treatments: [] },
    expects: ["cough-throat-comfort", "cough-bronchial-essential-oils"],
    show: ["Les huiles essentielles sont écartées pour une femme enceinte", "Les vigilances déclarées par la pharmacie s'affichent", "Le moteur propose ce qui reste sûr"],
    tip: "Décochez « enceinte » et relancez : les huiles essentielles reviennent.",
  },
];

export const DEMO_SCENARIO_BY_ID = new Map(DEMO_SCENARIOS.map((scenario) => [scenario.id, scenario]));

export function findDemoScenario(id: string): DemoScenario | null {
  return DEMO_SCENARIO_BY_ID.get(id) ?? null;
}

/** Le nombre de bips d'un scénario, quantités comprises. */
export function scanCount(scenario: DemoScenario): number {
  return scenario.items.reduce((total, item) => total + (item.quantity ?? 1), 0);
}
