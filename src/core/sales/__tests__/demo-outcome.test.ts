import { describe, expect, it } from "vitest";
import { demoCounts, demoOutcome } from "../demo-outcome";

const now = new Date("2026-10-17T12:00:00Z");
describe("l'issue d'une démonstration", () => {
  it("programmée, à confirmer, faite, abonnée, pas allée au bout", () => {
    expect(demoOutcome({ status: "DEMO_SCHEDULED", demoAt: new Date("2026-10-20T08:00:00Z"), demoDoneAt: null }, now)).toBe("PROGRAMMEE");
    expect(demoOutcome({ status: "DEMO_SCHEDULED", demoAt: new Date("2026-10-15T08:00:00Z"), demoDoneAt: null }, now)).toBe("A_CONFIRMER");
    expect(demoOutcome({ status: "DEMO_DONE", demoAt: new Date("2026-10-15T08:00:00Z"), demoDoneAt: new Date("2026-10-15T09:00:00Z") }, now)).toBe("REALISEE");
    expect(demoOutcome({ status: "ACTIVATED", demoAt: new Date("2026-10-15T08:00:00Z"), demoDoneAt: null }, now)).toBe("ABONNEE");
    expect(demoOutcome({ status: "LOST", demoAt: new Date("2026-10-15T08:00:00Z"), demoDoneAt: new Date("2026-10-15T09:00:00Z") }, now)).toBe("PERDUE");
  });
  it("les compteurs", () => {
    expect(demoCounts(["PROGRAMMEE", "REALISEE", "ABONNEE", "PERDUE", "A_CONFIRMER"])).toEqual({ total: 5, done: 3, subscribed: 1, lost: 1, upcoming: 1 });
  });
});
