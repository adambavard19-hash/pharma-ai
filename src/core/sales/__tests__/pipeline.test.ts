import { describe, expect, it } from "vitest";
import { canSalesRepSetStatus, isOpenStatus, prospectStatusForContract } from "../pipeline";
import { computeCommissionCents, describeCommissionRule } from "../commission";

describe("pipeline commercial", () => {
  it("laisse le commercial avancer la prospection et déclarer un dossier perdu", () => {
    expect(canSalesRepSetStatus("PROSPECT", "CONTACTED")).toBe(true);
    expect(canSalesRepSetStatus("INTERESTED", "PROPOSAL_SENT")).toBe(true);
    expect(canSalesRepSetStatus("PROPOSAL_SENT", "LOST")).toBe(true);
  });

  it("interdit au commercial les étapes qui découlent d'un fait", () => {
    expect(canSalesRepSetStatus("PROPOSAL_SENT", "CONTRACT_SENT")).toBe(false);
    expect(canSalesRepSetStatus("CONTRACT_SENT", "CONTRACT_SIGNED")).toBe(false);
    expect(canSalesRepSetStatus("CONTRACT_SIGNED", "ACTIVATED")).toBe(false);
    expect(canSalesRepSetStatus("CONTRACT_SENT", "PROSPECT")).toBe(false);
    expect(canSalesRepSetStatus("CONTRACT_SENT", "LOST")).toBe(true);
  });

  it("déduit le statut du dossier de celui du contrat", () => {
    expect(prospectStatusForContract("SENT")).toBe("CONTRACT_SENT");
    expect(prospectStatusForContract("SIGNED_PHARMACY")).toBe("CONTRACT_SENT");
    expect(prospectStatusForContract("FINALIZED")).toBe("CONTRACT_SIGNED");
    expect(prospectStatusForContract("REFUSED")).toBeNull();
    expect(isOpenStatus("LOST")).toBe(false);
    expect(isOpenStatus("CONTRACT_SENT")).toBe(true);
  });
});

describe("commission", () => {
  const contract = { monthlyPriceCents: 24_900, durationMonths: 12 };
  it("fixe", () => expect(computeCommissionCents({ type: "FIXED", value: 30_000 }, contract)).toBe(30_000));
  it("pourcentage de la première année", () => expect(computeCommissionCents({ type: "PERCENT", value: 1_000 }, contract)).toBe(29_880));
  it("récurrente sur 12 mois au plus", () => {
    expect(computeCommissionCents({ type: "RECURRING", value: 2_500 }, contract)).toBe(30_000);
    expect(computeCommissionCents({ type: "RECURRING", value: 2_500 }, { ...contract, durationMonths: 24 })).toBe(30_000);
    expect(computeCommissionCents({ type: "RECURRING", value: 2_500 }, { ...contract, durationMonths: 6 })).toBe(15_000);
  });
  it("se décrit sans ambiguïté", () => {
    expect(describeCommissionRule({ type: "FIXED", value: 30_000 })).toBe("300,00 € par contrat");
    expect(describeCommissionRule({ type: "PERCENT", value: 1_250 })).toBe("12,5 % de la première année");
    expect(describeCommissionRule({ type: "RECURRING", value: 2_500 })).toBe("25,00 € par mois, 12 mois");
  });
});
