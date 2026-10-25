import { describe, expect, it } from "vitest";
import { campaignDraftError, campaignEnd, readOverstockLabel, tiedUpCents, withOverstockLabel } from "../campaign";

const draft = { productId: "p1", atcCodes: ["J01"], familyIds: [], sentence: "", targetQuantity: 0, endsOn: "2026-12-24" };

describe("une campagne de surstock", () => {
  it("demande un produit et au moins une situation, une date à venir", () => {
    expect(campaignDraftError(draft, "2026-10-25")).toBeNull();
    expect(campaignDraftError({ ...draft, productId: "" }, "2026-10-25")).toMatch(/produit/);
    expect(campaignDraftError({ ...draft, atcCodes: [] }, "2026-10-25")).toMatch(/au moins une situation/);
    expect(campaignDraftError({ ...draft, atcCodes: ["Z99"] }, "2026-10-25")).toMatch(/inconnue/);
    expect(campaignDraftError({ ...draft, endsOn: "2026-10-25" }, "2026-10-25")).toMatch(/après aujourd'hui/);
    expect(campaignDraftError({ ...draft, targetQuantity: -1 }, "2026-10-25")).toMatch(/objectif/);
  });

  it("s'arrête seule à l'objectif de stock, ou après sa date de fin", () => {
    expect(campaignEnd({ targetQuantity: 6, endsOn: null }, 6, "2026-10-25")).toBe("OBJECTIF");
    expect(campaignEnd({ targetQuantity: 0, endsOn: "2026-10-24" }, 12, "2026-10-25")).toBe("DATE");
    expect(campaignEnd({ targetQuantity: 0, endsOn: "2026-10-25" }, 12, "2026-10-25")).toBeNull();
  });

  it("chiffre l'argent immobilisé au prix d'achat, rien sans prix", () => {
    expect(tiedUpCents(24, 950)).toBe(22_800);
    expect(tiedUpCents(24, 0)).toBeNull();
    expect(tiedUpCents(0, 950)).toBe(0);
  });

  it("« Surstock » voyage dans le libellé du challenge et se relit sans perdre le challenge du laboratoire", () => {
    expect(readOverstockLabel(withOverstockLabel(null))).toEqual({ overstock: true, challenge: null });
    expect(readOverstockLabel(withOverstockLabel("Pileje · 1 € par boîte"))).toEqual({ overstock: true, challenge: "Pileje · 1 € par boîte" });
    expect(readOverstockLabel("Pileje · 1 € par boîte")).toEqual({ overstock: false, challenge: "Pileje · 1 € par boîte" });
    expect(readOverstockLabel("")).toEqual({ overstock: false, challenge: null });
  });
});

describe("sur la bannière du poste", () => {
  it("un produit en surstock passe devant un challenge, une date courte et une meilleure marge", async () => {
    const { bestOrder } = await import("@/components/island/mix-island");
    const order = bestOrder([
      { challenge: true, shortDate: "30/11/2026", margin: "12,00 €" },
      { overstock: true, margin: "2,00 €" },
      { margin: "8,00 €" },
    ]);
    expect(order[0]).toBe(1);
  });
});
