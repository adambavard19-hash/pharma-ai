import { describe, expect, it } from "vitest";
import { countUndecided, groupAdviceByLine, nothingToShow, presentProductIds, splitAdvice } from "../group-advice";
import type { AdviceView } from "../types";
import { advice } from "./fixtures";

/**
 * Où s'affiche chaque conseil : sous le médicament qui l'a déclenché, sinon
 * dans la zone générale. Le rangement ne choisit, ne classe ni ne filtre rien.
 */

const lines = [{ id: "l1" }, { id: "l2" }, { id: "l3" }];

const step = (id: string, stepIndex: number, lineIds: string[], overrides: Partial<AdviceView> = {}) =>
  advice({
    id,
    lineIds,
    routine: { key: "routine_peau", title: "Routine peau", stepKey: `s${stepIndex}`, stepLabel: `Étape ${stepIndex}`, stepIndex, stepCount: 3, benefit: "Pour la peau." },
    ...overrides,
  });

const ids = (list: AdviceView[] | undefined) => (list ?? []).map((r) => r.id);

describe("groupAdviceByLine : sous quel médicament", () => {
  it("un conseil va sous le médicament qui l'a déclenché", () => {
    const { byLine, general } = groupAdviceByLine(lines, [advice({ id: "a", lineIds: ["l2"] })]);
    expect(ids(byLine.get("l2"))).toEqual(["a"]);
    expect(general).toEqual([]);
  });

  it("plusieurs lignes : la PREMIÈRE de l'ordonnance, quel que soit l'ordre dans lequel le moteur les liste", () => {
    const { byLine } = groupAdviceByLine(lines, [advice({ id: "a", lineIds: ["l3", "l2"] })]);
    expect(ids(byLine.get("l2"))).toEqual(["a"]);
    expect(byLine.has("l3")).toBe(false);
  });

  it("une ligne non affichée (non confirmée) est sautée : le conseil suit la suivante", () => {
    const shown = [{ id: "l1" }, { id: "l3" }];
    const { byLine, general } = groupAdviceByLine(shown, [advice({ id: "a", lineIds: ["l2", "l3"] })]);
    expect(ids(byLine.get("l3"))).toEqual(["a"]);
    expect(general).toEqual([]);
  });

  it("aucune de ses lignes n'est affichée : zone générale, jamais perdu", () => {
    const { byLine, general } = groupAdviceByLine([{ id: "l1" }], [advice({ id: "a", lineIds: ["l2"] })]);
    expect(ids(general)).toEqual(["a"]);
    expect(byLine.size).toBe(0);
  });

  it("sans lien (analyse ancienne, conseil ajouté à la main) : zone générale", () => {
    const old = advice({ id: "old", lineIds: [] });
    const manual = advice({ id: "manual", origin: "MANUAL", lineIds: [], opportunity: null });
    const { byLine, general } = groupAdviceByLine(lines, [old, manual]);
    expect(ids(general)).toEqual(["old", "manual"]);
    expect(byLine.size).toBe(0);
  });

  it("une analyse ancienne entière s'affiche comme avant : tout dans la zone générale, dans l'ordre reçu", () => {
    const received = ["a", "b", "c", "d", "e"].map((id) => advice({ id }));
    const { byLine, general } = groupAdviceByLine(lines, received);
    expect(ids(general)).toEqual(["a", "b", "c", "d", "e"]);
    expect(byLine.size).toBe(0);
  });

  it("aucun médicament affiché : tout est dans la zone générale", () => {
    const { byLine, general } = groupAdviceByLine([], [advice({ id: "a", lineIds: ["l1"] })]);
    expect(ids(general)).toEqual(["a"]);
    expect(byLine.size).toBe(0);
  });

  it("l'ordre reçu fait foi dans chaque groupe (priorité clinique, puis score, déjà triés par la page)", () => {
    const received = [
      advice({ id: "a", lineIds: ["l1"] }),
      advice({ id: "b", lineIds: ["l2"] }),
      advice({ id: "c", lineIds: ["l1"] }),
      advice({ id: "d", lineIds: [] }),
      advice({ id: "e", lineIds: ["l1"] }),
    ];
    const { byLine, general } = groupAdviceByLine(lines, received);
    expect(ids(byLine.get("l1"))).toEqual(["a", "c", "e"]);
    expect(ids(byLine.get("l2"))).toEqual(["b"]);
    expect(ids(general)).toEqual(["d"]);
  });

  it("un médicament sans conseil n'a pas d'entrée : l'écran n'affiche rien de plus", () => {
    const { byLine } = groupAdviceByLine(lines, [advice({ id: "a", lineIds: ["l2"] })]);
    expect(byLine.get("l1")).toBeUndefined();
    expect(byLine.get("l3")).toBeUndefined();
  });

  it("les conseils tranchés restent là où ils étaient proposés", () => {
    const { byLine } = groupAdviceByLine(lines, [
      advice({ id: "refuse", status: "DECLINED", lineIds: ["l1"] }),
      advice({ id: "retire", status: "REMOVED", lineIds: ["l1"] }),
      advice({ id: "achete", status: "PURCHASED", lineIds: ["l2"] }),
      advice({ id: "ouvert", lineIds: ["l1"] }),
    ]);
    expect(ids(byLine.get("l1"))).toEqual(["refuse", "retire", "ouvert"]);
    expect(ids(byLine.get("l2"))).toEqual(["achete"]);
  });

  it("ne perd et ne duplique aucun conseil", () => {
    const received = [
      advice({ id: "a", lineIds: ["l1"] }),
      advice({ id: "b", lineIds: ["l9"] }),
      advice({ id: "c", lineIds: [] }),
      step("s0", 0, ["l2"]),
      step("s1", 1, []),
    ];
    const { byLine, general } = groupAdviceByLine(lines, received);
    const all = [...byLine.values()].flat().concat(general);
    expect(all.map((r) => r.id).sort()).toEqual(["a", "b", "c", "s0", "s1"]);
  });

  it("ne modifie pas ce qu'il reçoit", () => {
    const received = [advice({ id: "a", lineIds: ["l1"] }), advice({ id: "b", lineIds: [] })];
    const before = JSON.stringify(received);
    groupAdviceByLine(lines, received);
    expect(JSON.stringify(received)).toBe(before);
  });
});

describe("groupAdviceByLine : une routine reste d'un seul bloc", () => {
  it("toutes les étapes suivent la première, même quand les suivantes pointent ailleurs", () => {
    const { byLine, general } = groupAdviceByLine(lines, [step("s0", 0, ["l2"]), step("s1", 1, ["l1"]), step("s2", 2, ["l3"])]);
    expect(ids(byLine.get("l2"))).toEqual(["s0", "s1", "s2"]);
    expect(byLine.has("l1")).toBe(false);
    expect(byLine.has("l3")).toBe(false);
    expect(general).toEqual([]);
  });

  it("la première étape est celle du plus petit rang, pas celle qui arrive en premier", () => {
    const { byLine } = groupAdviceByLine(lines, [step("s2", 2, ["l3"]), step("s0", 0, ["l1"]), step("s1", 1, ["l2"])]);
    expect(ids(byLine.get("l1"))).toEqual(["s2", "s0", "s1"]);
    expect(byLine.size).toBe(1);
  });

  it("la première étape n'a pas de lien : toute la routine va dans la zone générale", () => {
    const { byLine, general } = groupAdviceByLine(lines, [step("s0", 0, []), step("s1", 1, ["l1"]), step("s2", 2, ["l1"])]);
    expect(ids(general)).toEqual(["s0", "s1", "s2"]);
    expect(byLine.size).toBe(0);
  });

  it("une étape déjà tranchée reste avec sa routine", () => {
    const { byLine } = groupAdviceByLine(lines, [step("s0", 0, ["l1"]), step("s1", 1, ["l1"], { status: "DECLINED" })]);
    expect(ids(byLine.get("l1"))).toEqual(["s0", "s1"]);
  });

  it("deux routines distinctes suivent chacune leur première étape", () => {
    const other = (id: string, stepIndex: number, lineIds: string[]) =>
      advice({
        id,
        lineIds,
        routine: { key: "routine_cheveux", title: "Routine cheveux", stepKey: `c${stepIndex}`, stepLabel: "Étape", stepIndex, stepCount: 2, benefit: "" },
      });
    const { byLine } = groupAdviceByLine(lines, [step("p0", 0, ["l1"]), other("c0", 0, ["l3"]), step("p1", 1, ["l2"]), other("c1", 1, ["l1"])]);
    expect(ids(byLine.get("l1"))).toEqual(["p0", "p1"]);
    expect(ids(byLine.get("l3"))).toEqual(["c0", "c1"]);
  });
});

describe("splitAdvice : ce que montre un groupe", () => {
  it("les conseils ouverts deviennent des cartes, dans l'ordre reçu", () => {
    const { cards, unavailable, closed } = splitAdvice([advice({ id: "a" }), advice({ id: "b" })]);
    expect(cards.map((c) => c.kind)).toEqual(["single", "single"]);
    expect(unavailable).toEqual([]);
    expect(closed).toEqual([]);
  });

  it("une routine devient une seule carte, ses étapes dans l'ordre des étapes", () => {
    const { cards } = splitAdvice([advice({ id: "avant" }), step("s1", 1, []), step("s0", 0, []), advice({ id: "apres" })]);
    expect(cards.map((c) => (c.kind === "routine" ? `routine:${c.steps.map((s) => s.id).join(",")}` : c.recommendation.id))).toEqual(["avant", "routine:s0,s1", "apres"]);
  });

  it("un produit à zéro en stock n'est pas une carte : il est dit faute de stock", () => {
    const empty = advice({ id: "vide", product: { ...advice().product!, quantity: 0 } });
    const { cards, unavailable } = splitAdvice([advice({ id: "ok" }), empty]);
    expect(cards).toHaveLength(1);
    expect(unavailable.map((r) => r.id)).toEqual(["vide"]);
  });

  it("refusé, retiré, acheté : tranché, jamais une carte", () => {
    const { cards, closed } = splitAdvice([
      advice({ id: "a", status: "DECLINED" }),
      advice({ id: "b", status: "REMOVED" }),
      advice({ id: "c", status: "PURCHASED" }),
      advice({ id: "d", status: "ACCEPTED" }),
    ]);
    expect(closed.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(cards).toHaveLength(1);
  });

  it("un conseil sans produit (supprimé) reste une carte : le moteur l'a proposé", () => {
    const { cards } = splitAdvice([advice({ id: "a", product: null })]);
    expect(cards).toHaveLength(1);
  });
});

describe("ce qui reste à décider, et quand il n'y a rien du tout", () => {
  it("compte les cartes sans décision ; une routine compte pour une", () => {
    const { cards } = splitAdvice([advice({ id: "a" }), advice({ id: "b" }), step("s0", 0, []), step("s1", 1, [])]);
    expect(countUndecided(cards, () => false)).toBe(3);
    expect(countUndecided(cards, (id) => id === "a")).toBe(2);
    expect(countUndecided(cards, (id) => id === "s0")).toBe(3);
    expect(countUndecided(cards, (id) => id === "s0" || id === "s1")).toBe(2);
    expect(countUndecided(cards, () => true)).toBe(0);
  });

  it("rien à montrer : aucun conseil, ou seulement des conseils écartés faute de stock", () => {
    expect(nothingToShow([])).toBe(true);
    expect(nothingToShow([advice({ product: { ...advice().product!, quantity: 0 } })])).toBe(true);
  });

  it("une carte, ou un conseil tranché, suffit à ne pas dire « rien à proposer »", () => {
    expect(nothingToShow([advice()])).toBe(false);
    expect(nothingToShow([advice({ status: "DECLINED" })])).toBe(false);
  });

  it("les produits déjà présents : tous les conseils ouverts, rattachés ou non, pas les tranchés", () => {
    const present = presentProductIds([
      advice({ id: "a", lineIds: ["l1"], product: { ...advice().product!, id: "p_a" } }),
      advice({ id: "b", lineIds: [], product: { ...advice().product!, id: "p_b" } }),
      advice({ id: "c", status: "DECLINED", product: { ...advice().product!, id: "p_c" } }),
      advice({ id: "d", product: null }),
    ]);
    expect([...present].sort()).toEqual(["p_a", "p_b"]);
  });
});
