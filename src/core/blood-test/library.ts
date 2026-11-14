import type { BloodMarkerKey } from "./rules";

/**
 * La bibliothèque des analyses (fondateur, 14 nov. 2026) : pour chaque analyse courante d'une prise de sang, l'organe
 * qu'elle renseigne et des explications ÉCRITES ET RELUES ici — jamais rédigées par l'IA. Le modèle de vision ne fait que
 * rattacher une ligne du compte rendu à l'un de ces identifiants.
 *
 * Ton : général et prudent. « C'est quoi ? » en une phrase, puis les causes FRÉQUENTES, EN GÉNÉRAL, d'une valeur basse ou
 * haute : jamais un diagnostic, jamais une dose. Une analyse que la bibliothèque ne connaît pas reçoit un texte neutre.
 *
 * Module pur.
 */

export type OrganKey = "thyroide" | "coeur" | "foie" | "estomac" | "pancreas" | "reins" | "sang" | "os" | "muscles";

export type LibraryAnalysis = {
  id: string;
  organ: OrganKey;
  name: string;
  /** Les libellés que l'on trouve sur un compte rendu, pour aider la lecture à rattacher la ligne. */
  hint: string;
  what: string;
  whyLow: string;
  whyHigh: string;
};

export const OTHER_ANALYSIS_TEXT = {
  what: "Votre médecin saura vous expliquer cette analyse.",
  whyLow: "Votre médecin saura vous dire ce que signifie cette valeur.",
  whyHigh: "Votre médecin saura vous dire ce que signifie cette valeur.",
} as const;

export const BLOOD_LIBRARY: LibraryAnalysis[] = [
  // --- Vitamines (absorbées par l'intestin ; la vitamine D sert surtout aux os)
  {
    id: "vitd", organ: "os", name: "Vitamine D", hint: "25-OH vitamine D, 25-hydroxyvitamine D, vitamine D2+D3",
    what: "Elle aide les os à garder le calcium et soutient les muscles. Le corps la fabrique surtout grâce au soleil.",
    whyLow: "Peu de soleil, surtout en automne et en hiver, une peau souvent couverte, l'âge. C'est très fréquent en France.",
    whyHigh: "Le plus souvent, plusieurs compléments pris en même temps.",
  },
  {
    id: "b12", organ: "estomac", name: "Vitamine B12", hint: "vitamine B12, cobalamine",
    what: "Elle aide à fabriquer les globules rouges et fait bien fonctionner les nerfs. Elle est absorbée par l'intestin.",
    whyLow: "Peu de viande, de poisson, d'œufs ou de laitages (par exemple en étant végétarien), l'âge, ou certains médicaments pris longtemps.",
    whyHigh: "Souvent des compléments. Une valeur haute se montre au médecin.",
  },
  {
    id: "b9", organ: "estomac", name: "Vitamine B9 (folates)", hint: "folates sériques, acide folique, vitamine B9",
    what: "Elle aide le corps à renouveler ses cellules. On la trouve dans les légumes verts.",
    whyLow: "Peu de légumes verts et de fruits, l'alcool, la grossesse.",
    whyHigh: "Souvent des compléments.",
  },
  // --- Fer et sang
  {
    id: "ferritine", organ: "sang", name: "Ferritine", hint: "ferritine, ferritinémie",
    what: "C'est la réserve de fer du corps, comme un garde-manger.",
    whyLow: "Des règles abondantes, peu de viande rouge ou de légumes secs, un don de sang récent.",
    whyHigh: "Une inflammation, ou d'autres causes que seul le médecin peut regarder.",
  },
  {
    id: "fer", organ: "sang", name: "Fer sérique", hint: "fer sérique, sidérémie",
    what: "Le fer qui circule dans le sang à ce moment-là. Il varie beaucoup dans la journée.",
    whyLow: "Un manque de fer dans l'alimentation, des pertes de sang, une inflammation.",
    whyHigh: "Un complément en fer récent, ou d'autres causes que le médecin peut regarder.",
  },
  {
    id: "hb", organ: "sang", name: "Hémoglobine", hint: "hémoglobine, Hb",
    what: "Elle transporte l'oxygène dans le sang, des poumons jusqu'aux muscles.",
    whyLow: "Le plus souvent un manque de fer ou de vitamines.",
    whyHigh: "Le tabac, la vie en altitude, ou un manque d'eau.",
  },
  {
    id: "gr", organ: "sang", name: "Globules rouges", hint: "hématies, globules rouges, érythrocytes",
    what: "Les cellules qui portent l'oxygène.",
    whyLow: "Souvent un manque de fer ou de vitamines.",
    whyHigh: "Le tabac ou un manque d'eau, par exemple.",
  },
  {
    id: "vgm", organ: "sang", name: "Volume des globules rouges (VGM)", hint: "VGM, volume globulaire moyen",
    what: "La taille moyenne des globules rouges.",
    whyLow: "Des globules plus petits : souvent un manque de fer.",
    whyHigh: "Des globules plus gros : souvent un manque de vitamine B12 ou B9, ou l'alcool.",
  },
  {
    id: "gb", organ: "sang", name: "Globules blancs", hint: "leucocytes, globules blancs",
    what: "Les cellules qui défendent le corps contre les microbes.",
    whyLow: "Un virus récent, certains médicaments.",
    whyHigh: "Le corps se défend, par exemple contre une infection.",
  },
  {
    id: "plaquettes", organ: "sang", name: "Plaquettes", hint: "plaquettes, thrombocytes",
    what: "Elles aident le sang à coaguler quand on se coupe.",
    whyLow: "Un virus récent, certains médicaments.",
    whyHigh: "Une inflammation ou un manque de fer, par exemple.",
  },
  {
    id: "crp", organ: "sang", name: "CRP (inflammation)", hint: "CRP, protéine C réactive",
    what: "Elle monte quand le corps se défend contre une inflammation ou une infection.",
    whyLow: "Une valeur basse est en général une bonne nouvelle.",
    whyHigh: "Une infection, une inflammation, une blessure récente : à voir avec le médecin.",
  },
  // --- Cholestérol (cœur et vaisseaux)
  {
    id: "ldl", organ: "coeur", name: "LDL (« mauvais » cholestérol)", hint: "LDL cholestérol, cholestérol LDL",
    what: "Quand il y en a trop, il peut se déposer dans les artères avec le temps.",
    whyLow: "Une valeur basse est en général une bonne nouvelle.",
    whyHigh: "Une alimentation riche en graisses, peu d'activité physique, l'hérédité. Seul votre médecin peut dire s'il faut faire quelque chose.",
  },
  {
    id: "hdl", organ: "coeur", name: "HDL (« bon » cholestérol)", hint: "HDL cholestérol, cholestérol HDL",
    what: "Il aide à nettoyer les artères du cholestérol en trop.",
    whyLow: "Le tabac, le manque d'activité physique, le surpoids.",
    whyHigh: "Une valeur haute est en général une bonne nouvelle.",
  },
  {
    id: "cholesterol", organ: "coeur", name: "Cholestérol total", hint: "cholestérol total",
    what: "Tout le cholestérol du sang, le « bon » et le « mauvais » ensemble.",
    whyLow: "Une valeur basse est en général sans souci.",
    whyHigh: "L'alimentation, le manque d'activité physique, l'hérédité : votre médecin regarde surtout le détail (LDL, HDL).",
  },
  {
    id: "tg", organ: "coeur", name: "Triglycérides", hint: "triglycérides",
    what: "Les graisses qui servent de carburant au corps.",
    whyLow: "Une valeur basse est en général sans souci.",
    whyHigh: "Le sucre, l'alcool, un repas pris trop peu de temps avant la prise de sang.",
  },
  // --- Sucre (pancréas)
  {
    id: "gly", organ: "pancreas", name: "Glycémie à jeun", hint: "glycémie, glucose à jeun",
    what: "Le sucre dans votre sang au moment de la prise de sang.",
    whyLow: "Un jeûne long, un effort important.",
    whyHigh: "Un repas récent, ou un sucre mal régulé : à voir avec le médecin.",
  },
  {
    id: "hba1c", organ: "pancreas", name: "Hémoglobine glyquée (HbA1c)", hint: "HbA1c, hémoglobine glyquée",
    what: "La moyenne de votre sucre sur les 3 derniers mois.",
    whyLow: "Rarement un souci.",
    whyHigh: "Un sucre trop élevé depuis plusieurs semaines : à voir avec le médecin.",
  },
  // --- Foie
  {
    id: "alat", organ: "foie", name: "ALAT", hint: "ALAT, ALT, TGP, transaminases ALAT",
    what: "Une enzyme du foie. Elle monte quand le foie travaille trop.",
    whyLow: "Sans souci en général.",
    whyHigh: "L'alcool, le surpoids, certains médicaments.",
  },
  {
    id: "asat", organ: "foie", name: "ASAT", hint: "ASAT, AST, TGO, transaminases ASAT",
    what: "Une autre enzyme du foie, présente aussi dans les muscles.",
    whyLow: "Sans souci en général.",
    whyHigh: "L'alcool, un effort sportif intense, certains médicaments.",
  },
  {
    id: "ggt", organ: "foie", name: "Gamma-GT", hint: "gamma GT, GGT, gamma-glutamyl transférase",
    what: "Une enzyme du foie sensible à l'alcool.",
    whyLow: "Sans souci en général.",
    whyHigh: "L'alcool, certains médicaments.",
  },
  // --- Reins
  {
    id: "creat", organ: "reins", name: "Créatinine", hint: "créatinine, créatininémie",
    what: "Un déchet des muscles que les reins éliminent. Elle dit si les reins filtrent bien.",
    whyLow: "Une petite masse musculaire.",
    whyHigh: "Un manque d'eau, beaucoup de muscle, ou des reins qui filtrent moins : à voir avec le médecin.",
  },
  {
    id: "dfg", organ: "reins", name: "Filtration des reins (DFG)", hint: "DFG, débit de filtration glomérulaire, clairance, CKD-EPI, MDRD",
    what: "Une estimation de la quantité de sang que vos reins nettoient chaque minute.",
    whyLow: "Les reins filtrent moins : l'âge, un manque d'eau, ou d'autres causes à voir avec le médecin.",
    whyHigh: "Une valeur haute est en général sans souci.",
  },
  {
    id: "uree", organ: "reins", name: "Urée", hint: "urée, azotémie",
    what: "Un déchet des protéines que les reins éliminent.",
    whyLow: "Peu de protéines dans l'alimentation.",
    whyHigh: "Un manque d'eau, beaucoup de protéines, ou des reins qui filtrent moins.",
  },
  {
    id: "acide-urique", organ: "reins", name: "Acide urique", hint: "acide urique, uricémie",
    what: "Un déchet que les reins éliminent. En trop, il peut former des cristaux dans les articulations.",
    whyLow: "Sans souci en général.",
    whyHigh: "La viande rouge, les fruits de mer, l'alcool, les boissons sucrées, ou certains médicaments.",
  },
  {
    id: "sodium", organ: "reins", name: "Sodium", hint: "sodium, natrémie, Na",
    what: "Le sel du sang. Il garde l'eau au bon endroit dans le corps.",
    whyLow: "Boire beaucoup d'eau d'un coup, certains médicaments : à voir avec le médecin.",
    whyHigh: "Un manque d'eau, une forte chaleur : à voir avec le médecin.",
  },
  {
    id: "potassium", organ: "reins", name: "Potassium", hint: "potassium, kaliémie, K",
    what: "Un minéral qui aide le cœur et les muscles à bien fonctionner.",
    whyLow: "Des vomissements, une diarrhée, certains médicaments : à voir avec le médecin.",
    whyHigh: "Certains médicaments, ou des reins qui filtrent moins : à voir avec le médecin.",
  },
  // --- Thyroïde
  {
    id: "tsh", organ: "thyroide", name: "TSH", hint: "TSH, thyréostimuline",
    what: "L'hormone qui dit à la thyroïde d'accélérer ou de ralentir.",
    whyLow: "La thyroïde travaille peut-être trop : à voir avec le médecin.",
    whyHigh: "La thyroïde travaille peut-être trop peu : à voir avec le médecin.",
  },
  // --- Os et minéraux
  {
    id: "calcium", organ: "os", name: "Calcium", hint: "calcium, calcémie",
    what: "Le minéral des os et des dents. Il aide aussi les muscles et le cœur.",
    whyLow: "Souvent un manque de vitamine D.",
    whyHigh: "Des compléments, ou d'autres causes que le médecin peut regarder.",
  },
  {
    id: "mg", organ: "muscles", name: "Magnésium", hint: "magnésium, magnésémie",
    what: "Il aide les muscles et les nerfs à bien fonctionner.",
    whyLow: "Le stress, peu de fruits secs, de céréales complètes ou de chocolat noir.",
    whyHigh: "Rare, souvent des compléments.",
  },
  {
    id: "zinc", organ: "muscles", name: "Zinc", hint: "zinc sérique",
    what: "Il aide les défenses, la peau et les cheveux.",
    whyLow: "Peu de viande, de fruits de mer ou de légumes secs.",
    whyHigh: "Rare, souvent des compléments.",
  },
];

export const LIBRARY_IDS = BLOOD_LIBRARY.map((entry) => entry.id);

export function libraryEntry(id: string | null | undefined): LibraryAnalysis | null {
  return id ? (BLOOD_LIBRARY.find((entry) => entry.id === id) ?? null) : null;
}

/** Les 6 analyses qui peuvent ouvrir un conseil (rules.ts), rattachées à leur fiche de la bibliothèque. */
export const MARKER_TO_LIBRARY: Record<BloodMarkerKey, string> = {
  VITAMIN_D: "vitd",
  FERRITIN: "ferritine",
  IRON: "fer",
  B12: "b12",
  FOLATE: "b9",
  MAGNESIUM: "mg",
  ZINC: "zinc",
};

export const LIBRARY_TO_MARKER: Record<string, BloodMarkerKey> = Object.fromEntries(Object.entries(MARKER_TO_LIBRARY).map(([marker, id]) => [id, marker as BloodMarkerKey]));
