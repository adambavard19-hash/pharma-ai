/**
 * Deux produits de la même gamme : « NEOBIANACID CITRON CPR 70 » et « NEOBIANACID ACID REFLUX MENTHE CPR CROQ70 ».
 *
 * Au comptoir, le pharmacien prend souvent en rayon un autre parfum ou un autre format que le conseil affiché (essai de
 * Donna, 16 oct. 2026) : c'est le conseil qui a été vendu. La gamme se lit à la marque quand elle est connue, sinon au premier
 * mot du nom — seulement s'il ressemble à un nom de marque (au moins quatre lettres, pas un mot courant comme « gel »,
 * « crème », « vitamine » ou « pansement »). Dans le doute, aucune gamme : seul le produit exact compte.
 */

const GENERIC = new Set(
  [
    "gel", "creme", "spray", "baume", "huile", "huiles", "essentielle", "serum", "lait", "eau", "savon", "shampooing", "shampoing", "poche", "patch",
    "patchs", "pansement", "pansements", "compresse", "compresses", "pastille", "pastilles", "comprime", "comprimes", "gelule", "gelules", "sirop",
    "vitamine", "vitamines", "magnesium", "zinc", "probiotique", "probiotiques", "dentifrice", "brosse", "bain", "mouchoir", "mouchoirs",
    "thermometre", "test", "seringue", "masque", "masques", "gants", "coton", "soin", "soins", "kit", "coffret", "mini", "maxi", "pack", "duo",
    "trio", "boite", "flacon", "tube", "stick", "roll", "ecran", "solaire", "lingette", "lingettes", "physiologique", "chaussettes", "collant",
    "collants", "ceinture", "attelle", "genouillere", "bande", "bandes", "sparadrap", "tisane", "infusion", "complement", "preservatif",
    "preservatifs", "lubrifiant", "alcool", "antiseptique", "solution", "lotion", "mousse", "sterile", "collyre", "biberon", "tetine", "sucette",
    "couche", "couches", "protege", "serviettes", "tampons", "pommade", "capsules", "sachets", "ampoules", "granules", "gouttes", "inhalateur",
    "aerosol", "stylo", "lancettes", "bandelettes", "cicatrisant", "hydratant", "nettoyant", "demaquillant", "anti", "pour", "avec", "sans",
  ].map((word) => word.toLowerCase()),
);

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** La gamme d'un produit (« neobianacid »), ou rien quand elle n'est pas sûre. */
export function rangeKey(name: string | null | undefined, brand?: string | null): string | null {
  const fromBrand = brand ? words(brand).join(" ") : "";
  if (fromBrand.length >= 3) return fromBrand;
  const first = words(name ?? "")[0];
  if (!first || first.length < 4 || /^\d+$/.test(first) || GENERIC.has(first)) return null;
  return first;
}

/** Vrai si les deux produits sont de la même gamme (marque, ou premier mot qui en tient lieu). */
export function sameRange(a: { name: string | null | undefined; brand?: string | null }, b: { name: string | null | undefined; brand?: string | null }): boolean {
  const left = rangeKey(a.name, a.brand);
  return left !== null && left === rangeKey(b.name, b.brand);
}
