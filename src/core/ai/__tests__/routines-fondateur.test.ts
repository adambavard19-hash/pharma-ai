import { describe, expect, it } from "vitest";
import { classifyProductByName } from "../../catalog/product-vocabulary";
import { tagsFromName } from "../../stock-import/tags";
import type { CatalogProduct } from "../types";
import { analyse } from "./scenarios-conseils";
import { product } from "./fixtures";

/**
 * Les routines demandées par le fondateur (28 oct. 2026) : sous isotrétinoïne, nettoyer, hydrater (peau acnéique), traiter les
 * boutons, protéger du soleil ; sous antihistaminique, les yeux, le nez et un complément — Ergyaller (Nutergia) d'abord.
 * Le rayon est rangé comme à l'import du stock : le dictionnaire d'usage, plus les mots du nom.
 */

function shelfProduct(id: string, name: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const understood = classifyProductByName(name);
  return product({ id, name, brand: null, ean: "3401000000017", category: understood?.category ?? "AUTRE", matchingTags: [...(understood?.tags ?? []), ...tagsFromName(name)], commercialClaims: [], stockQuantity: 6, salePriceCents: 1500, purchasePriceCents: 800, ...overrides });
}

const steps = (result: ReturnType<typeof analyse>, key: string) =>
  result.recommendations.filter((item) => item.routine?.key === key).map((item) => [item.routine?.stepLabel, item.productId]);

describe("routine peau sous isotrétinoïne : quatre étapes", () => {
  const ISOTRETINOINE = { name: "Curacne 20", atc: "D10BA01", klass: "Rétinoïde oral" };
  const rayon = [
    shelfProduct("gel", "GEL NETTOYANT DOUX SANS SAVON VISAGE 200ML"),
    shelfProduct("creme", "EFFACLAR H CREME HYDRATANTE APAISANTE VISAGE 40ML"),
    // Rangés en dermocosmétique, comme dans un vrai stock (le dictionnaire ne les reconnaît pas encore à leur nom).
    shelfProduct("duo", "EFFACLAR DUO+ M 40ML", { category: "DERMOCOSMETIQUE" }),
    shelfProduct("bpo", "GEL PEROXYDE DE BENZOYLE BOUTONS 5%", { category: "DERMOCOSMETIQUE" }),
    shelfProduct("ecran", "FLUIDE VISAGE SPF50+ PEAU GRASSE 50ML"),
  ];

  it("nettoyer, hydrater, traiter les boutons, protéger — dans cet ordre", () => {
    expect(steps(analyse([ISOTRETINOINE], rayon), "isotretinoin-skin-routine")).toEqual([
      ["Nettoyer", "gel"],
      ["Hydrater et réparer", "creme"],
      ["Traiter les boutons", "duo"],
      ["Protéger", "ecran"],
    ]);
  });

  it("jamais de peroxyde de benzoyle pour les boutons : il dessèche une peau déjà fragilisée", () => {
    const proposed = analyse([ISOTRETINOINE], rayon).recommendations.flatMap((item) => [item.productId, ...(item.alternatives ?? []).map((other) => other.productId)]);
    expect(proposed).not.toContain("bpo");
  });
});

describe("prise en charge globale de l'allergie : le complément Ergyaller d'abord", () => {
  const CETIRIZINE = { name: "Cetirizine 10", atc: "R06AE07", klass: "Antihistaminique H1" };
  const rayon = [
    shelfProduct("nez", "EAU DE MER NEZ ALLERGIQUE SPRAY 50ML"),
    shelfProduct("collyre", "COLLYRE APAISANT ALLERGIES UNIDOSES X10"),
    shelfProduct("autre-complement", "COMPLEMENT ALLERGIE SAISON GELULES 30"),
    shelfProduct("ergyaller", "ERGYALLER NUTERGIA GELULES 60"),
  ];

  it("les yeux, le nez, puis Ergyaller", () => {
    expect(steps(analyse([CETIRIZINE], rayon), "allergy-global-routine")).toEqual([
      ["Yeux", "collyre"],
      ["Nez", "nez"],
      ["Complément", "ergyaller"],
    ]);
  });

  it("une seule étape en rayon : pas de « routine » d'un seul produit, le conseil seul reprend", () => {
    const result = analyse([CETIRIZINE], [shelfProduct("nez", "EAU DE MER NEZ ALLERGIQUE SPRAY 50ML")]);
    expect(steps(result, "allergy-global-routine")).toEqual([]);
  });
});
