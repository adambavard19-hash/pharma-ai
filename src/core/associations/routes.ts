/**
 * La forme d'un médicament déclencheur : par où il est pris (fondateur, 10 nov. 2026).
 *
 * « Un Niflugel (gel anti-inflammatoire) m'a sorti un oméprazole. L'IPP ne va avec un anti-inflammatoire que s'il est à
 * avaler : un gel, une crème, un patch ne passent pas par l'estomac. » Une association peut donc ne valoir que pour
 * certaines formes du médicament qui la déclenche. Aucune forme cochée : toutes les formes.
 *
 * La forme se lit dans la base officielle des médicaments (voies d'administration, puis forme pharmaceutique), et à défaut
 * dans le nom de la boîte. Une association limitée à certaines formes ne se déclenche JAMAIS sur un médicament dont on ne
 * connaît pas la forme : rien plutôt qu'un conseil faux.
 *
 * Module PUR : aucune base.
 */

export const DRUG_ROUTES = ["ORAL", "SKIN", "MOUTH", "EYE_EAR_NOSE", "INHALED", "RECTAL_VAGINAL", "INJECTABLE"] as const;
export type DrugRoute = (typeof DRUG_ROUTES)[number];

/** Les libellés de la console : courts, avec des exemples de formes. */
export const DRUG_ROUTE_LABELS: Record<DrugRoute, { title: string; examples: string }> = {
  ORAL: { title: "À avaler (per os)", examples: "comprimé, gélule, sachet, sirop, comprimé sublingual" },
  SKIN: { title: "Sur la peau", examples: "gel, crème, pommade, patch, spray cutané" },
  MOUTH: { title: "Dans la bouche, sans avaler", examples: "bain de bouche, gel gingival" },
  EYE_EAR_NOSE: { title: "Yeux, oreilles, nez", examples: "collyre, gouttes auriculaires, spray nasal" },
  INHALED: { title: "À inhaler", examples: "aérosol, poudre à inhaler" },
  RECTAL_VAGINAL: { title: "Rectale ou vaginale", examples: "suppositoire, ovule, lavement" },
  INJECTABLE: { title: "Injectable", examples: "stylo, seringue" },
};

const norm = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Une voie d'administration de la base officielle (« cutanée », « orale »…) → sa forme pour la console. */
function routeOfOfficial(route: string): DrugRoute | null {
  const r = norm(route);
  if (!r) return null;
  if (r === "orale" || r === "sublinguale" || r === "gastro-enterale" || r === "gastrique" || r === "intestinale") return "ORAL";
  if (r === "cutanee" || r === "transdermique" || r === "epilesionnelle" || r === "peri-areolaire") return "SKIN";
  if (r === "voie buccale autre" || r === "gingivale" || r === "buccogingivale" || r === "dentaire") return "MOUTH";
  if (r === "ophtalmique" || r === "auriculaire" || r === "nasale" || r === "endosinusale" || r === "sous-conjonctivale") return "EYE_EAR_NOSE";
  if (r === "inhalee" || r === "endotracheobronchique") return "INHALED";
  if (r === "rectale" || r === "vaginale" || r === "uretrale") return "RECTAL_VAGINAL";
  if (/^(intra|sous-cutanee|peri|infiltration|voie parenterale|hemo|extracorporelle|voie extracorporelle)/.test(r)) return "INJECTABLE";
  return null;
}

/** Ce que dit le nom ou la forme pharmaceutique, quand les voies officielles manquent : la plus précise d'abord. */
const FORM_PATTERNS: [DrugRoute, RegExp][] = [
  ["EYE_EAR_NOSE", /\b(collyre|ophtalmique|auriculaire|nasal[e]?|pulverisation nasale)\b/],
  ["INHALED", /\b(inhal\w*|aerosol)\b/],
  ["RECTAL_VAGINAL", /\b(suppositoire|ovule|rectal[e]?|vaginal[e]?|lavement|capsule vaginale)\b/],
  ["MOUTH", /\b(bain de bouche|gingival[e]?|collutoire|buccal[e]?)\b/],
  ["INJECTABLE", /\b(injectable|injection|seringue|stylo|perfusion)\b/],
  ["SKIN", /\b(gel|creme|pommade|patch|emplatre|lotion|cutane[e]?|dispositif transdermique|pate|mousse|spray|solution pour application)\b/],
  ["ORAL", /\b(comprime|gelule|capsule|sachet|sirop|buvable|suspension buvable|granules|poudre pour solution buvable|lyophilisat|pastille|cp|gel\b.*\bbuv)\b/],
];

/**
 * Les formes d'un médicament : d'abord les voies officielles, puis la forme pharmaceutique, puis le nom. Ensemble vide :
 * forme inconnue.
 */
export function drugRoutesOf(input: { routes?: string[] | null; form?: string | null; name?: string | null }): Set<DrugRoute> {
  const found = new Set<DrugRoute>();
  for (const route of input.routes ?? []) {
    const known = routeOfOfficial(route);
    if (known) found.add(known);
  }
  if (found.size > 0) return found;
  for (const text of [input.form, input.name]) {
    const t = norm(text ?? "");
    if (!t) continue;
    // « gel buvable », « gel oral » : à avaler, pas sur la peau.
    if (/\bgel\b/.test(t) && /\b(buvable|oral)\b/.test(t)) {
      found.add("ORAL");
      return found;
    }
    // La plus précise d'abord : « spray nasal » est le nez, pas la peau.
    const first = FORM_PATTERNS.find(([, pattern]) => pattern.test(t));
    if (first) return new Set([first[0]]);
  }
  return found;
}

/** Garde les seules formes connues, sans doublon, dans l'ordre de la console. */
export function cleanRoutes(values: readonly string[] | null | undefined): DrugRoute[] {
  const wanted = new Set(values ?? []);
  return DRUG_ROUTES.filter((route) => wanted.has(route));
}

/**
 * L'association s'applique-t-elle à ce médicament ? Aucune forme choisie : oui, toujours. Sinon il faut qu'une de ses formes
 * soit cochée ; forme inconnue : non.
 */
export function routesAllow(allowed: readonly string[] | null | undefined, lineRoutes: ReadonlySet<string> | readonly string[] | null | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  const have = lineRoutes ? [...lineRoutes] : [];
  return have.some((route) => allowed.includes(route));
}

/** « À avaler (per os) · Sur la peau » : pour la liste des associations. */
export function routesLabel(values: readonly string[] | null | undefined): string | null {
  const routes = cleanRoutes(values);
  return routes.length === 0 ? null : routes.map((route) => DRUG_ROUTE_LABELS[route].title).join(" · ");
}
