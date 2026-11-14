/**
 * Maquette « Ma prise de sang expliquée » (fondateur, 14 nov. 2026) : UNE fausse prise de sang, écrite à la main.
 * Aucune lecture, aucun appel serveur. Les textes restent généraux : ce qu'est l'analyse, les causes fréquentes en général,
 * jamais un diagnostic ni une dose.
 */

export type Status = "ok" | "low" | "high";

export type FamilyKey = "vitamines" | "sang" | "cholesterol" | "sucre" | "foie" | "reins" | "thyroide" | "mineraux";

export type Analysis = {
  id: string;
  family: FamilyKey;
  name: string;
  value: number;
  unit: string;
  low: number;
  high: number;
  what: string;
  whyLow: string;
  whyHigh: string;
};

export type Family = { key: FamilyKey; label: string; short: string; what: string };

export const FAMILIES: Family[] = [
  { key: "vitamines", label: "Vitamines", short: "Vitamines", what: "Les vitamines que votre corps utilise chaque jour." },
  { key: "sang", label: "Fer et sang", short: "Sang", what: "Vos globules et votre réserve de fer." },
  { key: "cholesterol", label: "Cholestérol", short: "Cholestérol", what: "Les graisses qui circulent dans le sang." },
  { key: "sucre", label: "Sucre", short: "Sucre", what: "Le sucre dans le sang, aujourd'hui et sur 3 mois." },
  { key: "foie", label: "Foie", short: "Foie", what: "Le foie filtre et transforme ce que vous mangez." },
  { key: "reins", label: "Reins", short: "Reins", what: "Les reins nettoient le sang." },
  { key: "thyroide", label: "Thyroïde", short: "Thyroïde", what: "La thyroïde règle l'énergie du corps." },
  { key: "mineraux", label: "Minéraux", short: "Minéraux", what: "Des minéraux utiles aux muscles et aux défenses." },
];

export const ANALYSES: Analysis[] = [
  {
    id: "vitd", family: "vitamines", name: "Vitamine D", value: 17, unit: "ng/mL", low: 30, high: 100,
    what: "Elle aide les os à garder le calcium et soutient les muscles. Le corps la fabrique surtout grâce au soleil.",
    whyLow: "Peu de soleil, surtout en automne et en hiver, une peau souvent couverte, l'âge. C'est très fréquent en France.",
    whyHigh: "Le plus souvent, plusieurs compléments pris en même temps.",
  },
  {
    id: "b12", family: "vitamines", name: "Vitamine B12", value: 180, unit: "pg/mL", low: 200, high: 900,
    what: "Elle aide à fabriquer les globules rouges et fait bien fonctionner les nerfs.",
    whyLow: "Peu de viande, de poisson, d'œufs ou de laitages (par exemple en étant végétarien), l'âge, ou certains médicaments pris longtemps.",
    whyHigh: "Souvent des compléments. Une valeur haute se montre au médecin.",
  },
  {
    id: "b9", family: "vitamines", name: "Vitamine B9 (folates)", value: 8.2, unit: "ng/mL", low: 3.9, high: 20,
    what: "Elle aide le corps à renouveler ses cellules. On la trouve dans les légumes verts.",
    whyLow: "Peu de légumes verts et de fruits, l'alcool, la grossesse.",
    whyHigh: "Souvent des compléments.",
  },
  {
    id: "ferritine", family: "sang", name: "Ferritine", value: 85, unit: "µg/L", low: 30, high: 300,
    what: "C'est la réserve de fer du corps, comme un garde-manger.",
    whyLow: "Des règles abondantes, peu de viande rouge ou de légumes secs, un don de sang récent.",
    whyHigh: "Une inflammation, ou d'autres causes que seul le médecin peut regarder.",
  },
  {
    id: "hb", family: "sang", name: "Hémoglobine", value: 14.2, unit: "g/dL", low: 13, high: 17,
    what: "Elle transporte l'oxygène dans le sang, des poumons jusqu'aux muscles.",
    whyLow: "Le plus souvent un manque de fer ou de vitamines.",
    whyHigh: "Le tabac, la vie en altitude, ou un manque d'eau.",
  },
  {
    id: "gr", family: "sang", name: "Globules rouges", value: 4.9, unit: "T/L", low: 4.3, high: 5.8,
    what: "Les cellules qui portent l'oxygène.",
    whyLow: "Souvent un manque de fer ou de vitamines.",
    whyHigh: "Le tabac ou un manque d'eau, par exemple.",
  },
  {
    id: "gb", family: "sang", name: "Globules blancs", value: 6.4, unit: "G/L", low: 4, high: 10,
    what: "Les cellules qui défendent le corps contre les microbes.",
    whyLow: "Un virus récent, certains médicaments.",
    whyHigh: "Le corps se défend, par exemple contre une infection.",
  },
  {
    id: "plaquettes", family: "sang", name: "Plaquettes", value: 250, unit: "G/L", low: 150, high: 400,
    what: "Elles aident le sang à coaguler quand on se coupe.",
    whyLow: "Un virus récent, certains médicaments.",
    whyHigh: "Une inflammation ou un manque de fer, par exemple.",
  },
  {
    id: "ldl", family: "cholesterol", name: "LDL (« mauvais » cholestérol)", value: 1.85, unit: "g/L", low: 0, high: 1.6,
    what: "Quand il y en a trop, il peut se déposer dans les artères avec le temps.",
    whyLow: "Une valeur basse est en général une bonne nouvelle.",
    whyHigh: "Une alimentation riche en graisses, peu d'activité physique, l'hérédité. Seul votre médecin peut dire s'il faut faire quelque chose.",
  },
  {
    id: "hdl", family: "cholesterol", name: "HDL (« bon » cholestérol)", value: 0.55, unit: "g/L", low: 0.4, high: 1,
    what: "Il aide à nettoyer les artères du cholestérol en trop.",
    whyLow: "Le tabac, le manque d'activité physique, le surpoids.",
    whyHigh: "Une valeur haute est en général une bonne nouvelle.",
  },
  {
    id: "tg", family: "cholesterol", name: "Triglycérides", value: 1.1, unit: "g/L", low: 0, high: 1.5,
    what: "Les graisses qui servent de carburant au corps.",
    whyLow: "Une valeur basse est en général sans souci.",
    whyHigh: "Le sucre, l'alcool, un repas pris trop peu de temps avant la prise de sang.",
  },
  {
    id: "gly", family: "sucre", name: "Glycémie à jeun", value: 0.92, unit: "g/L", low: 0.7, high: 1.1,
    what: "Le sucre dans votre sang au moment de la prise de sang.",
    whyLow: "Un jeûne long, un effort important.",
    whyHigh: "Un repas récent, ou un sucre mal régulé : à voir avec le médecin.",
  },
  {
    id: "hba1c", family: "sucre", name: "Hémoglobine glyquée (HbA1c)", value: 5.4, unit: "%", low: 4, high: 6,
    what: "La moyenne de votre sucre sur les 3 derniers mois.",
    whyLow: "Rarement un souci.",
    whyHigh: "Un sucre trop élevé depuis plusieurs semaines : à voir avec le médecin.",
  },
  {
    id: "alat", family: "foie", name: "ALAT", value: 24, unit: "UI/L", low: 7, high: 40,
    what: "Une enzyme du foie. Elle monte quand le foie travaille trop.",
    whyLow: "Sans souci en général.",
    whyHigh: "L'alcool, le surpoids, certains médicaments.",
  },
  {
    id: "asat", family: "foie", name: "ASAT", value: 22, unit: "UI/L", low: 10, high: 35,
    what: "Une autre enzyme du foie, présente aussi dans les muscles.",
    whyLow: "Sans souci en général.",
    whyHigh: "L'alcool, un effort sportif intense, certains médicaments.",
  },
  {
    id: "ggt", family: "foie", name: "Gamma-GT", value: 28, unit: "UI/L", low: 8, high: 55,
    what: "Une enzyme du foie sensible à l'alcool.",
    whyLow: "Sans souci en général.",
    whyHigh: "L'alcool, certains médicaments.",
  },
  {
    id: "creat", family: "reins", name: "Créatinine", value: 9.5, unit: "mg/L", low: 7, high: 12,
    what: "Un déchet des muscles que les reins éliminent. Elle dit si les reins filtrent bien.",
    whyLow: "Une petite masse musculaire.",
    whyHigh: "Un manque d'eau, beaucoup de muscle, ou des reins qui filtrent moins : à voir avec le médecin.",
  },
  {
    id: "tsh", family: "thyroide", name: "TSH", value: 1.8, unit: "mUI/L", low: 0.4, high: 4,
    what: "L'hormone qui dit à la thyroïde d'accélérer ou de ralentir.",
    whyLow: "La thyroïde travaille peut-être trop : à voir avec le médecin.",
    whyHigh: "La thyroïde travaille peut-être trop peu : à voir avec le médecin.",
  },
  {
    id: "mg", family: "mineraux", name: "Magnésium", value: 21, unit: "mg/L", low: 18, high: 24,
    what: "Il aide les muscles et les nerfs à bien fonctionner.",
    whyLow: "Le stress, peu de fruits secs, de céréales complètes ou de chocolat noir.",
    whyHigh: "Rare, souvent des compléments.",
  },
  {
    id: "zinc", family: "mineraux", name: "Zinc", value: 0.95, unit: "mg/L", low: 0.7, high: 1.2,
    what: "Il aide les défenses, la peau et les cheveux.",
    whyLow: "Peu de viande, de fruits de mer ou de légumes secs.",
    whyHigh: "Rare, souvent des compléments.",
  },
];

export type Product = { name: string; form: string; note: string };

/** Les compléments d'exemple, sans marque ni dose : le pharmacien choisit la référence et explique la prise. */
export const HELP: Partial<Record<string, Product[]>> = {
  vitd: [
    { name: "Vitamine D3", form: "En gouttes", note: "Quelques gouttes, simple à prendre." },
    { name: "Vitamine D3", form: "Comprimés à croquer", note: "Pratique pour toute la famille." },
  ],
  b12: [
    { name: "Vitamine B12", form: "Comprimés à laisser fondre", note: "Souvent conseillée sans viande ni poisson." },
    { name: "Complexe de vitamines B", form: "Gélules", note: "Plusieurs vitamines B en une seule prise." },
  ],
};

export function statusOf(a: Analysis): Status {
  if (a.value < a.low) return "low";
  if (a.value > a.high) return "high";
  return "ok";
}

/** Valeur haute, ou très basse (sous la moitié de la norme) : au médecin, jamais de produit. */
export function goesToDoctor(a: Analysis): boolean {
  const s = statusOf(a);
  return s === "high" || (s === "low" && a.value < a.low / 2);
}

export const fmt = (n: number) => String(n).replace(".", ",");

export const STATUS_COLORS: Record<Status | "doctor", { bg: string; fg: string; dot: string; label: string }> = {
  ok: { bg: "#E6F6EF", fg: "#0F7A5A", dot: "#22B07D", label: "Dans les normes" },
  low: { bg: "#FFF3E0", fg: "#A75A00", dot: "#F29A1F", label: "Un peu bas" },
  high: { bg: "#FDECEC", fg: "#B42323", dot: "#E5484D", label: "Au-dessus" },
  doctor: { bg: "#FDECEC", fg: "#B42323", dot: "#E5484D", label: "À montrer au médecin" },
};

export function familyStatus(key: FamilyKey): Status | "doctor" {
  const list = ANALYSES.filter((a) => a.family === key);
  if (list.some(goesToDoctor)) return "doctor";
  if (list.some((a) => statusOf(a) !== "ok")) return "low";
  return "ok";
}

export const SUMMARY = (() => {
  const ok = ANALYSES.filter((a) => statusOf(a) === "ok").length;
  const low = ANALYSES.filter((a) => statusOf(a) === "low" && !goesToDoctor(a)).length;
  const doctor = ANALYSES.filter(goesToDoctor).length;
  return { total: ANALYSES.length, ok, low, doctor };
})();
