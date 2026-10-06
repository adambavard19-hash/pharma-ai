import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { buildProducts, buildUniverses } from "../products";
import type { AdviceRow, AdviceStatus, ConfirmedLineRow } from "../types";

const NOW = new Date("2026-10-06T12:00:00Z");
const OLD = new Date("2026-10-01T09:00:00Z");

let seq = 0;
function advice(overrides: Partial<AdviceRow> & { status?: AdviceStatus } = {}): AdviceRow {
  seq += 1;
  return {
    id: `a${seq}`,
    createdAt: OLD,
    origin: "AI",
    status: "ACCEPTED",
    productId: "prod-1",
    presentationId: null,
    label: "Produit un",
    category: "VITAMINES",
    unitPriceCents: 0,
    prescriptionDeleted: false,
    ...overrides,
  };
}

function line(overrides: Partial<ConfirmedLineRow> = {}): ConfirmedLineRow {
  seq += 1;
  return {
    saleId: `s${seq}`,
    saleCreatedAt: new Date("2026-10-02T10:00:00Z"),
    lineId: `l${seq}`,
    recommendationId: `r${seq}`,
    origin: "AI",
    productId: "prod-1",
    presentationId: null,
    label: "Produit un",
    category: "VITAMINES",
    quantity: 1,
    unitPriceCents: 1000,
    totalCents: 1000,
    vatRate: 20,
    ...overrides,
  };
}

function many(count: number, overrides: Partial<AdviceRow> = {}): AdviceRow[] {
  return Array.from({ length: count }, () => advice(overrides));
}

describe("buildProducts : clés et regroupement", () => {
  it("clé p: pour un produit de l'officine, m: pour un médicament conseil", () => {
    const rows = buildProducts({
      advice: [
        advice({ productId: "prod-9", label: "Magnésium" }),
        advice({ productId: null, presentationId: "pres-4", label: "Doliprane 500 mg", category: "MEDICAMENT" }),
      ],
      lines: [],
    });
    expect(rows.map((row) => row.key).sort()).toEqual(["m:pres-4", "p:prod-9"]);
    expect(rows.find((row) => row.key === "m:pres-4")).toMatchObject({ label: "Doliprane 500 mg", category: "MEDICAMENT" });
  });

  it("un médicament conseil est une ligne par présentation, pas par catégorie", () => {
    const rows = buildProducts({
      advice: [
        ...many(2, { productId: null, presentationId: "pres-1", label: "Boîte A", category: "MEDICAMENT" }),
        ...many(1, { productId: null, presentationId: "pres-2", label: "Boîte B", category: "MEDICAMENT" }),
      ],
      lines: [line({ productId: null, presentationId: "pres-1", label: "Boîte A", category: "MEDICAMENT" })],
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.key === "m:pres-1")).toMatchObject({ proposed: 2, unitsSold: 1, revenueTtcCents: 1000 });
    expect(rows.find((row) => row.key === "m:pres-2")).toMatchObject({ proposed: 1, unitsSold: 0, revenueTtcCents: 0 });
  });

  it("regroupe tout ce qui n'a plus de produit sous « Produit retiré du catalogue »", () => {
    const rows = buildProducts({
      advice: [
        advice({ productId: null, presentationId: null, label: "Ancien A", status: "ACCEPTED" }),
        advice({ productId: null, presentationId: null, label: "Ancien B", status: "REMOVED" }),
      ],
      lines: [line({ productId: null, presentationId: null, label: "Ancien C", totalCents: 700, unitPriceCents: 700 })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "x:removed",
      label: "Produit retiré du catalogue",
      category: "AUTRE",
      proposed: 2,
      accepted: 1,
      unitsSold: 1,
      revenueTtcCents: 700,
    });
  });

  it("garde le nom le plus récent d'un produit renommé", () => {
    const rows = buildProducts({
      advice: [
        advice({ label: "Ancien nom", createdAt: new Date("2026-09-20T09:00:00Z") }),
        advice({ label: "Nouveau nom", createdAt: new Date("2026-10-03T09:00:00Z") }),
      ],
      lines: [line({ label: "Nom intermédiaire", saleCreatedAt: new Date("2026-09-25T09:00:00Z") })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Nouveau nom");
  });

  it("rend une liste vide sans conseil ni vente", () => {
    expect(buildProducts({ advice: [], lines: [] })).toEqual([]);
    expect(buildUniverses({ advice: [], lines: [] })).toEqual([]);
  });
});

describe("buildProducts : les chiffres d'un produit", () => {
  it("compte proposés, acceptés (6 statuts) et achetés (PURCHASED seulement)", () => {
    const statuses: AdviceStatus[] = ["PROPOSED", "ACCEPTED", "MODIFIED", "REPLACED", "REMOVED", "PRESENTED", "PURCHASED", "DECLINED", "IGNORED"];
    const [row] = buildProducts({ advice: statuses.map((status) => advice({ status })), lines: [] });
    expect(row).toMatchObject({ proposed: 9, accepted: 6, purchased: 1 });
  });

  it("additionne les unités de toutes les lignes mais le chiffre d'affaires du prix connu seulement", () => {
    const [row] = buildProducts({
      advice: [],
      lines: [
        line({ quantity: 2, unitPriceCents: 450, totalCents: 900 }),
        line({ quantity: 1, unitPriceCents: 1290, totalCents: 1290 }),
        line({ quantity: 3, unitPriceCents: 0, totalCents: 0 }), // sans prix : vendu, pas de CA
        line({ quantity: 1, unitPriceCents: 0, totalCents: 500 }), // donnée incohérente : prix 0, le total ne compte pas
      ],
    });
    expect(row).toMatchObject({ unitsSold: 7, revenueTtcCents: 2190, proposed: 0, accepted: 0, purchased: 0, acceptanceRate: null });
  });

  it("un produit vendu mais proposé avant la période apparaît avec du chiffre d'affaires et zéro conseil", () => {
    const rows = buildProducts({
      advice: [advice({ productId: "prod-a", label: "A" })],
      lines: [line({ productId: "prod-b", label: "B", totalCents: 5000, unitPriceCents: 5000 })],
    });
    expect(rows.map((row) => [row.key, row.proposed, row.revenueTtcCents])).toEqual([
      ["p:prod-b", 0, 5000],
      ["p:prod-a", 1, 0],
    ]);
  });

  it("ne garde aucun arrondi caché : les centimes restent entiers", () => {
    const [row] = buildProducts({
      advice: [],
      lines: [line({ totalCents: 333, unitPriceCents: 333 }), line({ totalCents: 334, unitPriceCents: 334 })],
    });
    expect(row.revenueTtcCents).toBe(667);
  });
});

describe("buildProducts : taux d'acceptation", () => {
  it("reste null sous 3 conseils tranchés, jamais un 100 % sur un seul conseil", () => {
    const [one] = buildProducts({ advice: many(1), lines: [] });
    expect(one.acceptanceRate).toBeNull();
    const [two] = buildProducts({ advice: many(2), lines: [] });
    expect(two.acceptanceRate).toBeNull();
    const [three] = buildProducts({ advice: many(3), lines: [] });
    expect(three.acceptanceRate).toBe(1);
  });

  it("vaut acceptés ÷ proposés sans `now`, et sort les conseils en attente avec `now`", () => {
    const rows = [
      advice({ status: "ACCEPTED" }),
      advice({ status: "ACCEPTED" }),
      advice({ status: "REMOVED" }),
      advice({ status: "PROPOSED", createdAt: new Date(NOW.getTime() - 3_600_000) }), // il y a 1 h : en attente
    ];
    const withoutNow = buildProducts({ advice: rows, lines: [] });
    expect(withoutNow[0].acceptanceRate).toBe(2 / 4);
    const withNow = buildProducts({ advice: rows, lines: [], now: NOW });
    expect(withNow[0].acceptanceRate).toBe(2 / 3);
  });

  it("un conseil PROPOSED de plus de 24 h compte comme sans réponse, pas comme en attente", () => {
    const rows = [
      advice({ status: "ACCEPTED" }),
      advice({ status: "ACCEPTED" }),
      advice({ status: "PROPOSED", createdAt: new Date(NOW.getTime() - 24 * 3_600_000) }),
    ];
    expect(buildProducts({ advice: rows, lines: [], now: NOW })[0].acceptanceRate).toBe(2 / 3);
  });
});

describe("buildProducts : tri et limite", () => {
  it("trie par chiffre d'affaires, puis acceptés, puis proposés, puis nom", () => {
    const rows = buildProducts({
      advice: [
        ...many(1, { productId: "p-cher", label: "Cher" }),
        ...many(5, { productId: "p-beaucoup-acceptes", label: "Beaucoup acceptés", status: "ACCEPTED" }),
        ...many(2, { productId: "p-acceptes", label: "Acceptés", status: "ACCEPTED" }),
        ...many(4, { productId: "p-z-proposes", label: "Proposés", status: "REMOVED" }),
        ...many(4, { productId: "p-a-zebre", label: "Zèbre", status: "REMOVED" }),
        ...many(2, { productId: "p-abricot", label: "Abricot", status: "ACCEPTED" }),
        ...many(1, { productId: "p-aa", label: "Aardvark", status: "REMOVED" }),
      ],
      lines: [line({ productId: "p-cher", label: "Cher", totalCents: 9900, unitPriceCents: 9900 })],
    });
    expect(rows.map((row) => row.label)).toEqual(["Cher", "Beaucoup acceptés", "Abricot", "Acceptés", "Proposés", "Zèbre", "Aardvark"]);
  });

  it("ne garde que 8 produits par défaut, et autant que demandé avec `limit`", () => {
    const advices = Array.from({ length: 10 }, (_, i) => advice({ productId: `p${i}`, label: `Produit ${String(i).padStart(2, "0")}` }));
    expect(buildProducts({ advice: advices, lines: [] })).toHaveLength(8);
    expect(buildProducts({ advice: advices, lines: [], limit: 3 })).toHaveLength(3);
    expect(buildProducts({ advice: advices, lines: [], limit: 0 })).toEqual([]);
    expect(buildProducts({ advice: advices, lines: [], limit: Number.POSITIVE_INFINITY })).toHaveLength(10);
  });

  it("la limite coupe après le tri : on garde les meilleurs, pas les premiers rencontrés", () => {
    const advices = Array.from({ length: 10 }, (_, i) => advice({ productId: `p${i}`, label: `Produit ${i}` }));
    const lines = [line({ productId: "p9", label: "Produit 9", totalCents: 100, unitPriceCents: 100 })];
    const rows = buildProducts({ advice: advices, lines, limit: 1 });
    expect(rows.map((row) => row.key)).toEqual(["p:p9"]);
  });

  it("ne modifie pas ses entrées", () => {
    const advices = many(3);
    const lines = [line()];
    const snapshot = JSON.stringify([advices, lines]);
    buildProducts({ advice: advices, lines });
    buildUniverses({ advice: advices, lines });
    expect(JSON.stringify([advices, lines])).toBe(snapshot);
  });
});

describe("buildUniverses", () => {
  it("nomme chaque univers par le libellé du catalogue, et « Médicaments conseil » pour les présentations", () => {
    const universes = buildUniverses({
      advice: [
        advice({ category: "VITAMINES" }),
        advice({ category: "MEDICAMENT", productId: null, presentationId: "pres-1" }),
        advice({ category: "DERMOCOSMETIQUE" }),
      ],
      lines: [],
    });
    const labels = Object.fromEntries(universes.map((row) => [row.category, row.label]));
    expect(labels).toEqual({
      VITAMINES: PRODUCT_CATEGORY_LABELS.VITAMINES,
      DERMOCOSMETIQUE: PRODUCT_CATEGORY_LABELS.DERMOCOSMETIQUE,
      MEDICAMENT: "Médicaments conseil",
    });
  });

  it("range un code inconnu (ou hérité du prototype) dans « Autres produits de conseil »", () => {
    const universes = buildUniverses({
      advice: [advice({ category: "CATEGORIE_DISPARUE" }), advice({ category: "constructor" }), advice({ category: "" })],
      lines: [],
    });
    expect(universes).toHaveLength(1);
    expect(universes[0]).toMatchObject({ category: "AUTRE", label: PRODUCT_CATEGORY_LABELS.AUTRE, proposed: 3 });
  });

  it("trie par chiffre d'affaires décroissant, puis acceptés, puis proposés", () => {
    const universes = buildUniverses({
      advice: [
        ...many(6, { category: "SOINS", status: "ACCEPTED" }),
        ...many(2, { category: "HYGIENE", status: "ACCEPTED" }),
        ...many(9, { category: "NUTRITION", status: "REMOVED" }),
      ],
      lines: [line({ category: "HYGIENE", totalCents: 4000, unitPriceCents: 4000 }), line({ category: "MINERAUX", totalCents: 1500, unitPriceCents: 1500 })],
    });
    expect(universes.map((row) => row.category)).toEqual(["HYGIENE", "MINERAUX", "SOINS", "NUTRITION"]);
  });

  it("totalise comme les produits : le chiffre d'affaires par univers égale celui des lignes au prix connu", () => {
    const lines = [
      line({ category: "VITAMINES", productId: "p1", totalCents: 1200, unitPriceCents: 1200 }),
      line({ category: "VITAMINES", productId: "p2", totalCents: 800, unitPriceCents: 800 }),
      line({ category: "MEDICAMENT", productId: null, presentationId: "pres-1", totalCents: 500, unitPriceCents: 500 }),
      line({ category: "SOINS", productId: "p3", totalCents: 0, unitPriceCents: 0 }),
    ];
    const advices = [advice({ category: "VITAMINES", productId: "p1" }), advice({ category: "SOINS", productId: "p3" })];
    const universes = buildUniverses({ advice: advices, lines });
    const products = buildProducts({ advice: advices, lines, limit: Number.POSITIVE_INFINITY });
    const priced = 1200 + 800 + 500;
    expect(universes.reduce((sum, row) => sum + row.revenueTtcCents, 0)).toBe(priced);
    expect(products.reduce((sum, row) => sum + row.revenueTtcCents, 0)).toBe(priced);
    expect(universes.reduce((sum, row) => sum + row.proposed, 0)).toBe(advices.length);
    expect(universes.find((row) => row.category === "VITAMINES")).toMatchObject({ revenueTtcCents: 2000, proposed: 1 });
  });

  it("calcule le taux d'un univers sur les conseils tranchés, null sous 3", () => {
    const universes = buildUniverses({
      advice: [
        ...many(3, { category: "SOINS", status: "ACCEPTED" }),
        advice({ category: "SOINS", status: "REMOVED" }),
        ...many(2, { category: "HYGIENE", status: "ACCEPTED" }),
      ],
      lines: [],
    });
    expect(universes.find((row) => row.category === "SOINS")?.acceptanceRate).toBe(3 / 4);
    expect(universes.find((row) => row.category === "HYGIENE")?.acceptanceRate).toBeNull();
  });
});
