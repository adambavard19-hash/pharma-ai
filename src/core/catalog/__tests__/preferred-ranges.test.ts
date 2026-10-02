import { describe, expect, expectTypeOf, it } from "vitest";
import { engineRangesFrom, rangeCoversProduct, rangeRankFor, type PreferredRangeInput, type RangeCandidate } from "../preferred-ranges";
import { brandKey } from "../brand";
import { UNIVERSES } from "../../../config/universes";

/**
 * Les gammes privilégiées, telles que le moteur les lit.
 *
 * Une gamme ne sert qu'à DÉPARTAGER des références déjà jugées également
 * pertinentes et sûres : le module ne renvoie qu'un rang (1 = prioritaire) ou
 * null. Ces tests figent quand une gamme s'applique — univers, produits
 * explicites ou marque entière, meilleure priorité — et rappellent que la
 * remise négociée et l'état « inactive » ne franchissent jamais la frontière
 * du moteur : le service ne charge que les gammes actives, sans remise.
 */

const range = (overrides: Partial<PreferredRangeInput> = {}): PreferredRangeInput => ({
  id: "range-1",
  universe: "NUTRITION",
  brandKey: brandKey("Fresubin"),
  priority: 1,
  productIds: [],
  ...overrides,
});

const product = (overrides: Partial<RangeCandidate> = {}): RangeCandidate => ({
  id: "prod-1",
  name: "FRESUBIN 2 KCAL DRINK VANILLE 4X200ML",
  brand: null,
  category: "NUTRITION",
  ...overrides,
});

/**
 * Le moteur charge les gammes par loadPreferredRanges (src/server/services/catalog.ts),
 * qui passe par engineRangesFrom : c'est donc le vrai code qui est testé ici.
 */
type StoredRange = PreferredRangeInput & { isActive: boolean; discountPercent: number | null };
const loadedForEngine = (stored: StoredRange[]): PreferredRangeInput[] => engineRangesFrom(stored);

describe("gamme inactive : non chargée côté service", () => {
  it("l'entrée du moteur ne porte ni l'état actif ni la remise : le tri se fait au chargement", () => {
    expectTypeOf<PreferredRangeInput>().not.toHaveProperty("isActive");
    expectTypeOf<PreferredRangeInput>().not.toHaveProperty("discountPercent");
    expect(Object.keys(range()).sort()).toEqual(["brandKey", "id", "priority", "productIds", "universe"]);
  });

  it("une gamme désactivée ne départage plus rien, même plus prioritaire", () => {
    const stored: StoredRange[] = [
      { ...range({ id: "inactive", priority: 1 }), isActive: false, discountPercent: 30 },
      { ...range({ id: "active", priority: 4 }), isActive: true, discountPercent: null },
    ];
    expect(rangeRankFor(product(), "NUTRITION", loadedForEngine(stored))).toBe(4);
    expect(rangeRankFor(product(), "NUTRITION", loadedForEngine([stored[0]]))).toBeNull();
  });

  it("la remise négociée ne change pas le rang", () => {
    const sansRemise = loadedForEngine([{ ...range({ priority: 2 }), isActive: true, discountPercent: null }]);
    const grosseRemise = loadedForEngine([{ ...range({ priority: 2 }), isActive: true, discountPercent: 60 }]);
    expect(rangeRankFor(product(), "NUTRITION", grosseRemise)).toBe(rangeRankFor(product(), "NUTRITION", sansRemise));
  });
});

describe("univers qui ne s'applique pas", () => {
  it("ne départage pas un conseil d'une autre catégorie", () => {
    const candidate = product({ category: "VITAMINES" });
    expect(rangeRankFor(candidate, "VITAMINES", [range({ universe: "NUTRITION" })])).toBeNull();
  });

  it("s'applique par la catégorie du conseil ou par celle du produit", () => {
    expect(rangeRankFor(product({ category: "AUTRE" }), "NUTRITION", [range()])).toBe(1);
    expect(rangeRankFor(product({ category: "NUTRITION" }), null, [range()])).toBe(1);
    expect(rangeRankFor(product({ category: null }), null, [range()])).toBeNull();
  });

  it("ignore un univers inconnu (retiré de la configuration)", () => {
    expect(rangeRankFor(product(), "NUTRITION", [range({ universe: "UNIVERS_DISPARU" })])).toBeNull();
  });

  it("ne relie un univers qu'à des catégories du moteur qui existent", () => {
    const known = new Set(["PROBIOTIQUES", "VITAMINES", "MINERAUX", "MAGNESIUM", "HYGIENE", "DERMATOLOGIE", "DERMOCOSMETIQUE", "SOINS", "NUTRITION", "DISPOSITIFS_MEDICAUX", "PHYTOTHERAPIE", "SAISONNIER", "AUTRE"]);
    for (const universe of UNIVERSES) {
      for (const category of universe.categories) expect(known.has(category), `${universe.key} → ${category}`).toBe(true);
    }
  });
});

describe("univers sans catégorie", () => {
  const bebe = range({ universe: "BEBE", brandKey: brandKey("Mustela") });

  it("s'applique à tout conseil, mais seulement aux produits de la gamme", () => {
    const mustela = product({ id: "m", name: "MUSTELA HYDRA BEBE CREME VISAGE 40ML", category: "DERMOCOSMETIQUE" });
    expect(UNIVERSES.find((u) => u.key === "BEBE")?.categories).toEqual([]);
    expect(rangeRankFor(mustela, "DERMOCOSMETIQUE", [bebe])).toBe(1);
    expect(rangeRankFor(mustela, null, [bebe])).toBe(1);
  });

  it("ne touche pas un produit d'une autre marque", () => {
    const autre = product({ id: "a", name: "BIODERMA ABCDERM CREME 40ML", category: "DERMOCOSMETIQUE" });
    expect(rangeRankFor(autre, "DERMOCOSMETIQUE", [bebe])).toBeNull();
  });
});

describe("produits explicites ou toute la marque", () => {
  const vanille = product({ id: "vanille" });
  const fraise = product({ id: "fraise", name: "FRESUBIN 2 KCAL DRINK FRAISE 4X200ML" });

  it("sans produit choisi, couvre toute la marque", () => {
    expect(rangeCoversProduct(range(), vanille)).toBe(true);
    expect(rangeCoversProduct(range(), fraise)).toBe(true);
  });

  it("avec des produits choisis, ne couvre qu'eux, même s'ils sont de la marque", () => {
    const seulementVanille = range({ productIds: ["vanille"] });
    expect(rangeRankFor(vanille, "NUTRITION", [seulementVanille])).toBe(1);
    expect(rangeRankFor(fraise, "NUTRITION", [seulementVanille])).toBeNull();
  });

  it("la liste explicite prime sur la marque du libellé", () => {
    const sansMarqueDansLeNom = product({ id: "x", name: "BOISSON HYPERCALORIQUE 200ML", brand: null });
    expect(rangeCoversProduct(range({ productIds: ["x"] }), sansMarqueDansLeNom)).toBe(true);
    expect(rangeCoversProduct(range(), sansMarqueDansLeNom)).toBe(false);
  });

  it("reconnaît la marque par le champ marque, accents compris", () => {
    const avene = range({ universe: "BEBE", brandKey: brandKey("AVÈNE") });
    expect(rangeCoversProduct(avene, product({ name: "PEDIATRIL CREME 50ML", brand: "Avene" }))).toBe(true);
    expect(rangeCoversProduct(avene, product({ name: "AVENEX GEL", brand: null }))).toBe(false);
  });
});

describe("meilleure priorité", () => {
  it("garde la plus petite priorité parmi les gammes qui couvrent le produit, quel que soit l'ordre", () => {
    const ranges = [range({ id: "a", priority: 3 }), range({ id: "b", priority: 1, productIds: ["prod-1"] }), range({ id: "c", priority: 2 })];
    expect(rangeRankFor(product(), "NUTRITION", ranges)).toBe(1);
    expect(rangeRankFor(product(), "NUTRITION", [...ranges].reverse())).toBe(1);
  });

  it("ne retient pas la priorité d'une gamme qui ne s'applique pas", () => {
    const ranges = [range({ id: "hors-univers", universe: "HIVER", priority: 1 }), range({ id: "autre-produit", priority: 1, productIds: ["autre"] }), range({ id: "ok", priority: 5 })];
    expect(rangeRankFor(product(), "NUTRITION", ranges)).toBe(5);
  });

  it("ramène une priorité saisie hors bornes à un rang entier d'au moins 1", () => {
    expect(rangeRankFor(product(), "NUTRITION", [range({ priority: 0 })])).toBe(1);
    expect(rangeRankFor(product(), "NUTRITION", [range({ priority: -4 })])).toBe(1);
    expect(rangeRankFor(product(), "NUTRITION", [range({ priority: 2.6 })])).toBe(3);
  });

  it("ne renvoie qu'un rang ou rien : jamais de gamme, rien n'est renvoyé", () => {
    expect(rangeRankFor(product(), "NUTRITION", [])).toBeNull();
    const rank = rangeRankFor(product(), "NUTRITION", [range({ priority: 2 })]);
    expect(Number.isInteger(rank)).toBe(true);
  });
});
