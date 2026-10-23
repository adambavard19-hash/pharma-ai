import { describe, expect, it } from "vitest";
import { sendsToDoctor } from "../answer-filter";

describe("les réponses du comptoir proposent un conseil, jamais seulement « voyez le médecin »", () => {
  it("retire « orienter vers le médecin » sans produit ; garde une réponse avec produit ou qui propose le conseil", () => {
    expect(sendsToDoctor({ say: "Il conseille d'en parler au médecin." })).toBe(true);
    expect(sendsToDoctor({ say: "Ne rien proposer, orienter vers une consultation." })).toBe(true);
    expect(sendsToDoctor({ say: "Le produit, après le repas." })).toBe(false);
    expect(sendsToDoctor({ say: "Si besoin, médecin ; sinon ce produit plus précis.", product: { name: "X" } })).toBe(false);
  });
});
