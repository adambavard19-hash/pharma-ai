import { describe, expect, it } from "vitest";
import { adviceOutcome, saleIslandState, type SaleIslandInput } from "../sale";

const base: SaleIslandInput = { editing: false, analysing: false, analysisStep: null, liveScan: false, lineCount: 2, warnings: 0, alertDismissed: false, outcomes: [], hasSale: false, emailStage: null, emailValue: "" };

describe("l'île de l'écran de vente", () => {
  it("suit la vraie vente : scan, analyse étape par étape, conseils, rien à ajouter, terminée", () => {
    expect(saleIslandState({ ...base, editing: true, liveScan: true }).stage).toBe("scan");
    expect(saleIslandState({ ...base, editing: true, liveScan: false }).stage).toBe("idle");
    expect(saleIslandState({ ...base, analysing: true, analysisStep: 2 })).toMatchObject({ stage: "analyzing", stepsDone: 2 });
    expect(saleIslandState({ ...base, outcomes: [null, "SOLD"] }).stage).toBe("advice");
    expect(saleIslandState(base).stage).toBe("quiet");
    expect(saleIslandState({ ...base, hasSale: true, warnings: 2 }).stage).toBe("done");
  });

  it("une mise en garde passe avant les conseils, jusqu'à ce qu'on la ferme", () => {
    expect(saleIslandState({ ...base, warnings: 1, outcomes: [null] }).stage).toBe("alert");
    expect(saleIslandState({ ...base, warnings: 1, alertDismissed: true, outcomes: [null] }).stage).toBe("advice");
  });

  it("lit la réponse de chaque conseil", () => {
    expect(adviceOutcome("PRESENTED", true)).toBe("SOLD");
    expect(adviceOutcome("PURCHASED", false)).toBe("SOLD");
    expect(adviceOutcome("DECLINED", false)).toBe("NOT_SOLD");
    expect(adviceOutcome("PROPOSED", false)).toBeNull();
  });
});
