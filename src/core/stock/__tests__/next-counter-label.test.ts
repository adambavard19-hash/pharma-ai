import { describe, expect, it } from "vitest";
import { nextCounterLabel } from "../install";

describe("le nom du prochain comptoir", () => {
  it("le premier est « Comptoir 1 »", () => {
    expect(nextCounterLabel([])).toBe("Comptoir 1");
  });
  it("puis 2, 3…", () => {
    expect(nextCounterLabel(["Comptoir 1"])).toBe("Comptoir 2");
    expect(nextCounterLabel(["Comptoir 1", "Comptoir 2"])).toBe("Comptoir 3");
  });
  it("un ancien poste compte dans le numéro, sans reprendre un nom pris", () => {
    expect(nextCounterLabel(["Caisse 1"])).toBe("Comptoir 2");
    expect(nextCounterLabel(["Comptoir 2"])).toBe("Comptoir 3");
    expect(nextCounterLabel([null, "comptoir 2 "])).toBe("Comptoir 3");
  });
});
