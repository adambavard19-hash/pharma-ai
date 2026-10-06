import { describe, expect, it } from "vitest";
import { countUndecided, describePendingQuestions, familyMixOf, groupAdviceByLine, nothingToShow, pendingQuestionsOf, presentProductIds, splitAdvice } from "../group-advice";
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

/** Un conseil de telle famille, avec son propre produit. */
const ofFamily = (id: string, family: AdviceView["family"], overrides: Partial<AdviceView> = {}) =>
  advice({ id, family, product: { ...advice().product!, id: `p_${id}`, name: `Produit ${id}` }, ...overrides });

/** Un conseil qui ne se confirme que par une question au patient. */
const asking = (id: string, question: string | null, overrides: Partial<NonNullable<AdviceView["opportunity"]>> = {}, extra: Partial<AdviceView> = {}) =>
  ofFamily(id, "COMPLEMENT", {
    opportunity: { ...advice().opportunity!, id: `opp_${id}`, requiresConfirmation: true, question, ...overrides },
    ...extra,
  });

describe("familyMixOf : le conseil complet, famille par famille", () => {
  it("compte chaque famille, dans l'ordre fixe : médicament conseil, complément, parapharmacie", () => {
    const { open, conditional } = familyMixOf([ofFamily("a", "PARAPHARMACIE"), ofFamily("b", "COMPLEMENT"), ofFamily("c", "MEDICAMENT"), ofFamily("d", "COMPLEMENT"), ofFamily("e", "PARAPHARMACIE"), ofFamily("f", "PARAPHARMACIE")]);
    expect(open.counts).toEqual({ MEDICAMENT: 1, COMPLEMENT: 2, PARAPHARMACIE: 3 });
    expect(open.total).toBe(6);
    expect(open.summary).toBe("1 médicament conseil · 2 compléments alimentaires · 3 produits de parapharmacie");
    expect(conditional).toEqual({ counts: { MEDICAMENT: 0, COMPLEMENT: 0, PARAPHARMACIE: 0 }, total: 0, summary: "" });
  });

  it("une famille sans conseil n'est pas écrite : ni reproche, ni produit inventé", () => {
    const { open } = familyMixOf([ofFamily("a", "COMPLEMENT"), ofFamily("b", "PARAPHARMACIE")]);
    expect(open.counts.MEDICAMENT).toBe(0);
    expect(open.summary).toBe("1 complément alimentaire · 1 produit de parapharmacie");
    expect(open.summary).not.toContain("médicament");
  });

  it("singulier et pluriel s'accordent", () => {
    expect(familyMixOf([ofFamily("a", "MEDICAMENT")]).open.summary).toBe("1 médicament conseil");
    expect(familyMixOf([ofFamily("a", "MEDICAMENT"), ofFamily("b", "MEDICAMENT")]).open.summary).toBe("2 médicaments conseil");
    expect(familyMixOf([ofFamily("a", "COMPLEMENT"), ofFamily("b", "COMPLEMENT")]).open.summary).toBe("2 compléments alimentaires");
    expect(familyMixOf([ofFamily("a", "PARAPHARMACIE")]).open.summary).toBe("1 produit de parapharmacie");
  });

  it("aucun conseil : rien à dire", () => {
    const empty = { counts: { MEDICAMENT: 0, COMPLEMENT: 0, PARAPHARMACIE: 0 }, total: 0, summary: "" };
    expect(familyMixOf([])).toEqual({ open: empty, conditional: empty });
  });

  it("les conseils tranchés (refusé, retiré, acheté) ne comptent pas, ni ceux écartés faute de stock", () => {
    const { open, conditional } = familyMixOf([
      ofFamily("ouvert", "COMPLEMENT"),
      ofFamily("refuse", "MEDICAMENT", { status: "DECLINED" }),
      ofFamily("retire", "PARAPHARMACIE", { status: "REMOVED" }),
      ofFamily("achete", "PARAPHARMACIE", { status: "PURCHASED" }),
      ofFamily("rupture", "MEDICAMENT", { product: { ...advice().product!, quantity: 0 } }),
      asking("question-refusee", "Q ?", {}, { status: "DECLINED", family: "MEDICAMENT" }),
    ]);
    expect(open.counts).toEqual({ MEDICAMENT: 0, COMPLEMENT: 1, PARAPHARMACIE: 0 });
    expect(open.total).toBe(1);
    expect(conditional.total).toBe(0);
  });

  it("un conseil accepté (dans la délivrance) compte : il est toujours proposé à l'écran", () => {
    expect(familyMixOf([ofFamily("a", "COMPLEMENT", { status: "ACCEPTED" })]).open.total).toBe(1);
  });

  it("une routine est UNE carte, de la famille de sa première étape", () => {
    const { open } = familyMixOf([
      step("s2", 2, [], { family: "PARAPHARMACIE" }),
      step("s0", 0, [], { family: "PARAPHARMACIE" }),
      step("s1", 1, [], { family: "PARAPHARMACIE" }),
      ofFamily("a", "COMPLEMENT"),
    ]);
    expect(open.counts).toEqual({ MEDICAMENT: 0, COMPLEMENT: 1, PARAPHARMACIE: 1 });
    expect(open.total).toBe(2);
  });

  it("une routine dont les étapes mélangent les familles prend celle de sa PREMIÈRE étape", () => {
    const { open } = familyMixOf([step("s1", 1, [], { family: "COMPLEMENT" }), step("s0", 0, [], { family: "PARAPHARMACIE" }), step("s2", 2, [], { family: "MEDICAMENT" })]);
    expect(open.counts).toEqual({ MEDICAMENT: 0, COMPLEMENT: 0, PARAPHARMACIE: 1 });
  });

  it("compte aussi les conseils sans médicament lié : tout ce qui est à l'écran", () => {
    expect(familyMixOf([ofFamily("a", "COMPLEMENT", { lineIds: ["l1"] }), ofFamily("b", "PARAPHARMACIE", { lineIds: [] })]).open.total).toBe(2);
  });
});

describe("familyMixOf : ce qui est proposé, et ce qui l'est sous réserve d'une réponse du patient", () => {
  it("un conseil dont la carte est une question n'est PAS proposé : il compte sous réserve", () => {
    const { open, conditional } = familyMixOf([ofFamily("a", "COMPLEMENT"), asking("b", "Le patient a-t-il la gorge irritée ?", {}, { family: "PARAPHARMACIE" })]);
    expect(open.counts).toEqual({ MEDICAMENT: 0, COMPLEMENT: 1, PARAPHARMACIE: 0 });
    expect(open.summary).toBe("1 complément alimentaire");
    expect(conditional.counts).toEqual({ MEDICAMENT: 0, COMPLEMENT: 0, PARAPHARMACIE: 1 });
    expect(conditional.summary).toBe("1 produit de parapharmacie");
  });

  it("les fixtures de la vente ORD-0770 : cinq conseils, dont deux (gorge, nez) sous réserve d'une réponse", () => {
    const sore = asking("sore-throat-orl", "Le patient a-t-il la gorge irritée ou douloureuse ?", {}, { family: "PARAPHARMACIE" });
    const nasal = asking("nasal-hygiene-orl", "Le patient a-t-il aussi le nez bouché ou qui coule ?", {}, { family: "PARAPHARMACIE" });
    const { open, conditional } = familyMixOf([
      ofFamily("mouth-rinse-inhaled-corticosteroid", "PARAPHARMACIE"),
      sore,
      nasal,
      ofFamily("opioid-transit", "COMPLEMENT"),
      ofFamily("digestive-tolerance-antibiotics", "COMPLEMENT"),
    ]);
    // Avant la correction, le bandeau annonçait « 2 compléments alimentaires · 3 produits de parapharmacie ».
    expect(open.summary).toBe("2 compléments alimentaires · 1 produit de parapharmacie");
    expect(open.total).toBe(3);
    expect(conditional.summary).toBe("2 produits de parapharmacie");
    expect(conditional.total).toBe(2);
    expect(open.total + conditional.total).toBe(5);
  });

  it("si le seul médicament conseil est derrière une question, « 1 médicament conseil » n'est pas affirmé", () => {
    const { open, conditional } = familyMixOf([ofFamily("a", "COMPLEMENT"), asking("m", "Le patient s'injecte-t-il lui-même ?", {}, { family: "MEDICAMENT" })]);
    expect(open.counts.MEDICAMENT).toBe(0);
    expect(open.summary).not.toContain("médicament");
    expect(conditional.counts.MEDICAMENT).toBe(1);
  });

  it("une fois répondu « oui », le conseil est proposé : il passe de « sous réserve » à « proposé »", () => {
    const before = familyMixOf([asking("a", "Q ?", {}, { family: "PARAPHARMACIE" })]);
    expect(before.open.total).toBe(0);
    expect(before.conditional.total).toBe(1);
    const after = familyMixOf([asking("a", "Q ?", { answer: true, answeredAt: "2026-10-05T09:00:00.000Z" }, { family: "PARAPHARMACIE" })]);
    expect(after.open.total).toBe(1);
    expect(after.conditional.total).toBe(0);
  });

  it("« le patient ne sait pas » : la question a été posée, la proposition est visible à l'appréciation du pharmacien, donc proposée", () => {
    const { open, conditional } = familyMixOf([asking("a", "Q ?", { answer: null, answeredAt: "2026-10-05T09:00:00.000Z" }, { family: "COMPLEMENT" })]);
    expect(open.total).toBe(1);
    expect(conditional.total).toBe(0);
  });

  it("une réponse « oui » suffit, même sans date de réponse : la carte ne pose plus la question, le conseil est proposé", () => {
    const { open, conditional } = familyMixOf([asking("a", "Q ?", { answer: true, answeredAt: null }, { family: "COMPLEMENT" })]);
    expect(open.total).toBe(1);
    expect(conditional.total).toBe(0);
    expect(pendingQuestionsOf([asking("a", "Q ?", { answer: true, answeredAt: null })])).toEqual([]);
  });

  it("un besoin qui ne se confirme pas par le patient, ou une question vide, n'est jamais sous réserve", () => {
    const { open, conditional } = familyMixOf([
      asking("a", "Question informative ?", { requiresConfirmation: false }),
      asking("b", null),
      asking("c", "   "),
    ]);
    expect(open.total).toBe(3);
    expect(conditional.total).toBe(0);
  });

  it("deux conseils d'un même besoin sous question : deux conseils sous réserve (une seule question à poser)", () => {
    const shared = { id: "opp_commun" };
    const recommendations = [asking("a", "Le nez est-il bouché ?", shared, { family: "PARAPHARMACIE" }), asking("b", "Le nez est-il bouché ?", shared, { family: "PARAPHARMACIE" })];
    expect(familyMixOf(recommendations).conditional.total).toBe(2);
    expect(pendingQuestionsOf(recommendations)).toHaveLength(1);
  });

  it("une routine n'est jamais sous réserve : elle ne pose pas de question sur sa carte", () => {
    const withQuestion = (id: string, stepIndex: number) => step(id, stepIndex, [], { family: "PARAPHARMACIE", opportunity: { ...advice().opportunity!, id: "opp_routine", requiresConfirmation: true, question: "Peau sèche ?" } });
    const { open, conditional } = familyMixOf([withQuestion("s0", 0), withQuestion("s1", 1)]);
    expect(open.total).toBe(1);
    expect(conditional.total).toBe(0);
  });

  it("le même prédicat que la liste des questions : chaque question en attente correspond à un conseil sous réserve, et inversement", () => {
    const recommendations = [
      ofFamily("ouvert", "COMPLEMENT"),
      asking("q1", "Question 1 ?", {}, { family: "PARAPHARMACIE" }),
      asking("q2", "Question 2 ?", { answer: true, answeredAt: "2026-10-05T09:00:00.000Z" }),
      asking("q3", "Question 3 ?", { answer: null, answeredAt: "2026-10-05T09:00:00.000Z" }),
      asking("q4", "Question 4 ?", {}, { family: "MEDICAMENT" }),
      asking("q5", "Question 5 ?", {}, { status: "DECLINED" }),
      asking("q6", "Question 6 ?", {}, { product: { ...advice().product!, quantity: 0 } }),
    ];
    const pending = pendingQuestionsOf(recommendations).map((item) => item.recommendationId);
    expect(pending).toEqual(["q1", "q4"]);
    expect(familyMixOf(recommendations).conditional.total).toBe(pending.length);
  });
});

describe("pendingQuestionsOf : les questions pour aller plus loin", () => {
  it("liste la question d'un conseil en attente de réponse, dans l'ordre reçu", () => {
    const pending = pendingQuestionsOf([asking("a", "Le patient a-t-il le ventre sensible ?"), ofFamily("sans", "PARAPHARMACIE"), asking("b", "A-t-il la gorge irritée ?")]);
    expect(pending).toEqual([
      { opportunityId: "opp_a", recommendationId: "a", question: "Le patient a-t-il le ventre sensible ?" },
      { opportunityId: "opp_b", recommendationId: "b", question: "A-t-il la gorge irritée ?" },
    ]);
  });

  it("un conseil sans question n'apparaît pas", () => {
    expect(pendingQuestionsOf([advice({ id: "a" }), advice({ id: "b", opportunity: null })])).toEqual([]);
  });

  it("une question dont le besoin n'a pas à être confirmé n'est pas posée", () => {
    expect(pendingQuestionsOf([asking("a", "Question informative ?", { requiresConfirmation: false })])).toEqual([]);
  });

  it("une question vide ou faite d'espaces n'est pas une question", () => {
    expect(pendingQuestionsOf([asking("a", null), asking("b", ""), asking("c", "   ")])).toEqual([]);
  });

  it("répondue « oui » ou « non » : plus en attente", () => {
    expect(pendingQuestionsOf([asking("oui", "Q ?", { answer: true, answeredAt: "2026-10-05T09:00:00.000Z" }), asking("non", "Q ?", { answer: false, answeredAt: "2026-10-05T09:00:00.000Z" })])).toEqual([]);
  });

  it("« le patient ne sait pas » (question posée, sans réponse tranchée) : plus en attente", () => {
    expect(pendingQuestionsOf([asking("a", "Q ?", { answer: null, answeredAt: "2026-10-05T09:00:00.000Z" })])).toEqual([]);
  });

  it("un conseil tranché ou écarté faute de stock ne pose plus sa question", () => {
    expect(
      pendingQuestionsOf([
        asking("refuse", "Q1 ?", {}, { status: "DECLINED" }),
        asking("retire", "Q2 ?", {}, { status: "REMOVED" }),
        asking("rupture", "Q3 ?", {}, { product: { ...advice().product!, quantity: 0 } }),
      ]),
    ).toEqual([]);
  });

  it("deux conseils d'un même besoin : une seule question, la réponse vaut pour les deux", () => {
    const pending = pendingQuestionsOf([asking("a", "Le nez est-il bouché ?", { id: "opp_commun" }), asking("b", "Le nez est-il bouché ?", { id: "opp_commun" })]);
    expect(pending).toEqual([{ opportunityId: "opp_commun", recommendationId: "a", question: "Le nez est-il bouché ?" }]);
  });

  it("une routine ne pose pas de question sur sa carte : ses étapes n'en ajoutent aucune", () => {
    const withQuestion = (id: string, stepIndex: number) => step(id, stepIndex, [], { opportunity: { ...advice().opportunity!, id: "opp_routine", requiresConfirmation: true, question: "Peau sèche ?" } });
    expect(pendingQuestionsOf([withQuestion("s0", 0), withQuestion("s1", 1)])).toEqual([]);
  });

  it("le texte est celui de la règle, nettoyé de ses espaces de bord, jamais reformulé", () => {
    expect(pendingQuestionsOf([asking("a", "  Prend-il aussi un anticoagulant ?  ")])[0].question).toBe("Prend-il aussi un anticoagulant ?");
  });
});

describe("describePendingQuestions : singulier et pluriel", () => {
  it("une question, des questions", () => {
    expect(describePendingQuestions(1)).toBe("1 question pour aller plus loin");
    expect(describePendingQuestions(2)).toBe("2 questions pour aller plus loin");
    expect(describePendingQuestions(5)).toBe("5 questions pour aller plus loin");
  });
});
