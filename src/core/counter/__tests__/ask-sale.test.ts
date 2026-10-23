import { describe, expect, it } from "vitest";
import { ASK_JUSTIFICATION, askTextOf } from "../ask-sale";

describe("vente ouverte par une demande du comptoir", () => {
  it("relit la demande écrite dans les conseils enregistrés", () => {
    expect(askTextOf([{ origin: "MANUAL", justification: `${ASK_JUSTIFICATION}mal de gorge, adulte` }])).toBe("mal de gorge, adulte");
  });
  it("ne prend jamais une vente bipée pour une demande", () => {
    expect(askTextOf([{ origin: "AI", justification: `${ASK_JUSTIFICATION}mal de gorge` }, { origin: "MANUAL", justification: "Ajouté à la main" }])).toBeNull();
  });
});
