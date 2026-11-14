/**
 * Prise de sang → compléments SANS ORDONNANCE (fondateur, 14 nov. 2026).
 *
 * Ce module ne lit pas l'examen et n'interprète rien : il dit, pour une valeur que le LABORATOIRE a déjà signalée hors de
 * ses normes, quel complément vendu sans ordonnance peut être évoqué au comptoir — et avec quelles précautions.
 *
 * Garde-fous, tous écrits ici et testés :
 *  • seules les valeurs BASSES d'une liste fermée ouvrent un conseil (vitamine D, ferritine, B12, folates, magnésium, zinc) ;
 *  • une valeur haute, ou une valeur basse hors de cette liste (hémoglobine, potassium…) : jamais de produit, seulement
 *    « à montrer à votre médecin » ;
 *  • une valeur TRÈS basse (moins de la moitié de la borne basse du laboratoire) : jamais de produit non plus ;
 *  • jamais un médicament soumis à prescription (liste I, II, stupéfiant), ni une forme fortement dosée (ampoule de 50 000 UI…) ;
 *  • chaque règle est « à relire » tant que Donna ou Adam ne l'a pas validée dans Console → Conseils : seule une règle
 *    validée propose un produit, au comptoir comme dans l'appli des patients.
 *
 * Module pur : aucune base, aucun réseau.
 */

export const BLOOD_RULE_PREFIX = "prise-de-sang:";

export type BloodMarkerKey = "VITAMIN_D" | "FERRITIN" | "IRON" | "B12" | "FOLATE" | "MAGNESIUM" | "ZINC";

/** Les analyses que la lecture reconnaît pour ouvrir un conseil. Toute autre ligne hors normes est rendue « à voir avec le médecin ». */
export const BLOOD_MARKERS: Record<BloodMarkerKey, { label: string; hint: string }> = {
  VITAMIN_D: { label: "Vitamine D", hint: "25-OH vitamine D, 25-hydroxyvitamine D, vitamine D2+D3" },
  FERRITIN: { label: "Ferritine", hint: "ferritine, ferritinémie" },
  IRON: { label: "Fer sérique", hint: "fer sérique, sidérémie" },
  B12: { label: "Vitamine B12", hint: "vitamine B12, cobalamine" },
  FOLATE: { label: "Folates (vitamine B9)", hint: "folates sériques, acide folique, vitamine B9 (pas les folates érythrocytaires seuls)" },
  MAGNESIUM: { label: "Magnésium", hint: "magnésium sérique, magnésémie" },
  ZINC: { label: "Zinc", hint: "zinc sérique" },
};

export type BloodRule = {
  key: string;
  version: string;
  title: string;
  markers: BloodMarkerKey[];
  /** Motifs (nom du produit sans accents, en minuscules) qui reconnaissent la référence en rayon. */
  productPatterns: string[];
  /** Motifs qui l'écartent toujours : formes fortement dosées, faux amis (« Fervex » n'est pas du fer). */
  productExclude: string[];
  /** Ce que le pharmacien lit. */
  pharmacistSentence: string;
  /** Ce que le patient lit dans l'appli et sur sa fiche. */
  patientSentence: string;
  /** Précautions, toujours affichées avec le produit. */
  cautions: string[];
};

export const BLOOD_RULES: BloodRule[] = [
  {
    key: "vitamine-d-basse",
    version: "1.0",
    title: "Vitamine D basse",
    markers: ["VITAMIN_D"],
    productPatterns: ["vitamine d", "vit\\.? ?d3?\\b", "\\bd3\\b", "cholecalciferol"],
    productExclude: ["50 ?000", "80 ?000", "100 ?000", "200 ?000", "ampoule", "calcium", "\\bk2\\b.*\\bdose\\b"],
    pharmacistSentence: "La vitamine D est sous les normes du laboratoire : un complément de vitamine D3 peut être évoqué, à confirmer avec le médecin.",
    patientSentence: "Votre vitamine D est un peu basse. Un complément de vitamine D peut vous aider : votre pharmacien vous conseille, et votre médecin confirme la dose.",
    cautions: [
      "Ne pas cumuler avec une vitamine D déjà prescrite (ampoule, gouttes).",
      "Calculs rénaux, calcium élevé ou maladie des reins : avis du médecin avant tout complément.",
    ],
  },
  {
    key: "fer-bas",
    version: "1.0",
    title: "Fer ou ferritine bas",
    markers: ["FERRITIN", "IRON"],
    productPatterns: ["\\bfer\\b", "ferreux", "ferrique", "bisglycinate de fer", "\\biron\\b"],
    productExclude: ["fervex", "ferment", "fertil", "\\bfermet", "ferme", "hemochromatose"],
    pharmacistSentence: "La ferritine (ou le fer) est sous les normes : un complément en fer peut être évoqué. Une carence en fer doit toujours être expliquée par le médecin.",
    patientSentence: "Vos réserves en fer sont basses. Un complément en fer peut aider, mais votre médecin doit en chercher la cause : montrez-lui ce résultat.",
    cautions: [
      "Une carence en fer a toujours une cause (règles abondantes, saignement…) : le médecin doit la chercher.",
      "Pas de fer si un fer est déjà prescrit, ni en cas d'hémochromatose.",
      "À prendre à distance du thé, du café, des pansements gastriques, et à 2 h de la lévothyroxine ou de certains antibiotiques.",
      "Peut noircir les selles et constiper.",
    ],
  },
  {
    key: "b12-basse",
    version: "1.0",
    title: "Vitamine B12 basse",
    markers: ["B12"],
    productPatterns: ["b12", "cobalamine", "cyanocobalamine", "methylcobalamine"],
    productExclude: ["ampoule injectable", "injectable", "1000 ?microg.*injectable"],
    pharmacistSentence: "La vitamine B12 est sous les normes : un complément de B12 peut être évoqué. Selon la cause (absorption), seul le médecin peut décider d'injections.",
    patientSentence: "Votre vitamine B12 est basse. Un complément peut aider, mais parlez-en à votre médecin : selon la cause, un autre traitement peut être nécessaire.",
    cautions: [
      "Fréquent sous metformine ou anti-acide (IPP) au long cours : le signaler au médecin.",
      "Fourmillements, fatigue importante ou troubles de la mémoire : consulter rapidement.",
    ],
  },
  {
    key: "folates-bas",
    version: "1.0",
    title: "Folates (vitamine B9) bas",
    markers: ["FOLATE"],
    productPatterns: ["folate", "acide folique", "\\bb9\\b", "methylfolate"],
    productExclude: ["5 ?mg", "speciafoldine"],
    pharmacistSentence: "Les folates sont sous les normes : un complément de vitamine B9 faiblement dosé peut être évoqué, en vérifiant que la B12 n'est pas basse elle aussi.",
    patientSentence: "Votre vitamine B9 (folates) est basse. Un complément peut aider ; si vous êtes enceinte ou avez un projet de grossesse, voyez votre médecin ou votre sage-femme.",
    cautions: [
      "Grossesse ou projet de grossesse : le dosage se décide avec le médecin ou la sage-femme.",
      "Ne pas corriger les folates sans vérifier la vitamine B12.",
    ],
  },
  {
    key: "magnesium-bas",
    version: "1.0",
    title: "Magnésium bas",
    markers: ["MAGNESIUM"],
    productPatterns: ["magnesium", "\\bmag\\b"],
    productExclude: ["sulfate de magnesium", "injectable", "laxati", "hydroxyde de magnesium", "pansement"],
    pharmacistSentence: "Le magnésium est sous les normes : un complément de magnésium peut être évoqué. Un magnésium très bas ou associé à d'autres anomalies relève du médecin.",
    patientSentence: "Votre magnésium est un peu bas. Un complément de magnésium peut vous aider : demandez conseil à votre pharmacien.",
    cautions: [
      "Pas de complément de magnésium en cas de maladie des reins sans avis du médecin.",
      "À prendre à distance de la lévothyroxine et de certains antibiotiques.",
      "Peut ramollir les selles.",
    ],
  },
  {
    key: "zinc-bas",
    version: "1.0",
    title: "Zinc bas",
    markers: ["ZINC"],
    productPatterns: ["\\bzinc\\b"],
    productExclude: ["oxyde de zinc", "pommade", "creme", "pate", "crème", "dentifrice", "spray"],
    pharmacistSentence: "Le zinc est sous les normes : un complément de zinc peut être évoqué.",
    patientSentence: "Votre zinc est un peu bas. Un complément de zinc peut vous aider : demandez conseil à votre pharmacien.",
    cautions: ["À prendre à distance du fer et de certains antibiotiques.", "Ne pas dépasser la dose indiquée sur une longue durée."],
  },
];

export function bloodRuleKey(rule: Pick<BloodRule, "key">): string {
  return `${BLOOD_RULE_PREFIX}${rule.key}`;
}

export function ruleForMarker(marker: BloodMarkerKey): BloodRule | null {
  return BLOOD_RULES.find((rule) => rule.markers.includes(marker)) ?? null;
}
