import { describe, expect, it } from "vitest";
import { BANNER } from "../../../../agent/src/banner-design";
import { allAnswered, analysisSteps, demoScenario, INITIAL_ISLAND, islandReducer, registerTap, STAGE_MOOD, STAGE_WIDTH, stageTitle, stageTone, type IslandStage } from "../banner-flow";

const STAGES: IslandStage[] = ["idle", "scan", "analyzing", "ready", "advice", "email", "emailSent", "done", "alert", "quiet"];

describe("l'île du comptoir", () => {
  it("reprend les phrases de la bannière Windows (une seule source)", () => {
    expect(stageTitle({ ...INITIAL_ISLAND, stage: "idle" }, 2)).toBe(BANNER.text.idle);
    expect(stageTitle({ ...INITIAL_ISLAND, stage: "scan" }, 2)).toBe(BANNER.text.scanTitle);
    expect(stageTitle({ ...INITIAL_ISLAND, stage: "ready" }, 2)).toBe("2 conseils disponibles");
    expect(stageTitle({ ...INITIAL_ISLAND, stage: "ready" }, 1)).toBe("1 conseil disponible");
    expect(stageTitle({ ...INITIAL_ISLAND, stage: "advice" }, 2)).toBe("2 conseils pour cette vente");
    expect(stageTitle({ ...INITIAL_ISLAND, stage: "done" }, 2)).toBe(BANNER.text.doneTitle);
    expect(stageTitle({ ...INITIAL_ISLAND, stage: "alert" }, 2)).toBe(BANNER.text.readFirst);
  });

  it("donne à chaque étape une humeur, une largeur et un ton ; la mise en garde est sérieuse et ambre, jamais en fête", () => {
    for (const stage of STAGES) {
      expect(STAGE_MOOD[stage]).toBeTruthy();
      expect(STAGE_WIDTH[stage]).toBeGreaterThan(200);
    }
    expect(STAGE_MOOD.alert).toBe("concerned");
    expect(stageTone("alert")).toBe("neutral");
    expect(STAGE_MOOD.done).toBe("celebrate");
    expect(STAGE_WIDTH.idle).toBeLessThan(STAGE_WIDTH.advice);
  });

  it("coche l'analyse une ligne après l'autre, sans dépasser", () => {
    let state = islandReducer(INITIAL_ISLAND, { type: "go", stage: "analyzing" }, 2);
    for (let i = 0; i < 10; i++) state = islandReducer(state, { type: "tick" }, 2);
    expect(state.stepsDone).toBe(analysisSteps("X", 2).length);
    expect(analysisSteps("DOXY", 0).at(-1)).toBe(BANNER.text.quiet);
  });

  it("garde Vendu / Non vendu par carte, et dit quand tout est traité", () => {
    let state = islandReducer(INITIAL_ISLAND, { type: "go", stage: "advice" }, 2);
    state = islandReducer(state, { type: "answer", index: 0, outcome: "SOLD" }, 2);
    expect(allAnswered(state, 2)).toBe(false);
    state = islandReducer(state, { type: "answer", index: 1, outcome: "NOT_SOLD" }, 2);
    expect(state.outcomes).toEqual(["SOLD", "NOT_SOLD"]);
    expect(allAnswered(state, 2)).toBe(true);
    state = islandReducer(state, { type: "answer", index: 9, outcome: "SOLD" }, 2);
    expect(state.outcomes).toHaveLength(2);
  });

  it("repart de zéro à chaque nouveau scan", () => {
    const busy = { ...INITIAL_ISLAND, stage: "done" as const, outcomes: ["SOLD" as const], email: "a@b.fr" };
    expect(islandReducer(busy, { type: "go", stage: "scan" }, 2)).toEqual({ ...INITIAL_ISLAND, stage: "scan" });
  });

  it("joue un scénario complet : vente avec conseils, puis vente sans conseil — aucune mise en garde (produits seulement)", () => {
    const steps = demoScenario(2);
    const stages = steps.flatMap((s) => (s.action.type === "go" ? [s.action.stage] : []));
    for (const stage of ["scan", "analyzing", "ready", "advice", "email", "emailSent", "done", "quiet"] as const) expect(stages).toContain(stage);
    expect(stages).not.toContain("alert");
    expect(steps.every((s) => s.wait > 0)).toBe(true);
  });

  it("proteste quand on tape trop vite sur la capsule", () => {
    let taps: number[] = [];
    let tooMany = false;
    for (let i = 0; i < 4; i++) ({ taps, tooMany } = registerTap(taps, 1000 + i * 200));
    expect(tooMany).toBe(true);
    expect(registerTap([0, 100, 200], 5000).tooMany).toBe(false);
  });
});
