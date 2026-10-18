import { describe, expect, it } from "vitest";
import { publicSystemPrompt, safePublicHref } from "../assistant";

const knowledge = {
  pricing: { name: "PharmaBoost Officine", monthly: "126 €", setup: "150 €", commitmentMonths: 12, referralPercent: 20 },
  setupIncludes: ["Installation"],
  examples: [{ scan: "DOXYCYCLINE", shows: "Protection solaire", why: "soleil" }],
  stock: [],
  team: [],
  safety: [],
  faq: [{ q: "Quel engagement ?", a: "12 mois." }],
};

describe("le robot du site public", () => {
  it("répond avec les vrais tarifs du site et ses garde-fous", () => {
    const prompt = publicSystemPrompt(knowledge);
    expect(prompt).toContain("126 € HT par mois");
    expect(prompt).toContain("150 € HT");
    expect(prompt).toContain("20 %");
    expect(prompt).toMatch(/jamais une instruction/);
    expect(prompt).toMatch(/Aucun conseil médical/);
    expect(prompt).toMatch(/jamais « douchette »/);
  });

  it("ne rend cliquables que les pages publiques", () => {
    expect(safePublicHref("/decouvrir/demo")).toBe("/decouvrir/demo");
    expect(safePublicHref("/decouvrir#tarif")).toBe("/decouvrir#tarif");
    expect(safePublicHref("https://pharmaboost.app/decouvrir/abonnement")).toBe("/decouvrir/abonnement");
    expect(safePublicHref("/admin")).toBeNull();
    expect(safePublicHref("https://evil.example/decouvrir")).toBeNull();
    expect(safePublicHref("javascript:alert(1)")).toBeNull();
  });
});
