import { describe, expect, it } from "vitest";
import { validateBloodReading, type ClaimedBloodResult } from "../reading";
import { proposeForBloodTest, productFitsRule, type BloodProduct } from "../propose";
import { BLOOD_RULES, bloodRuleKey } from "../rules";

const row = (over: Partial<ClaimedBloodResult>): ClaimedBloodResult => ({ label: "25-OH vitamine D", marker: "VITAMIN_D", value: 18, unit: "ng/mL", refLow: 30, refHigh: 100, labFlag: null, quote: "", ...over });
const product = (name: string, over: Partial<BloodProduct> = {}): BloodProduct => ({ id: name, name, imageUrl: null, salePriceCents: 990, stockQuantity: 5, prescriptionConditions: [], isActive: true, ...over });
const ALL = new Set(BLOOD_RULES.map(bloodRuleKey));

describe("lecture d'une prise de sang", () => {
  it("retient une valeur sous la borne imprimée", () => {
    const reading = validateBloodReading({ isBloodTest: true, results: [row({})] });
    expect(reading.ok && reading.findings).toEqual([expect.objectContaining({ marker: "VITAMIN_D", direction: "LOW", veryLow: false })]);
  });
  it("écarte une valeur dans la fourchette imprimée, même marquée", () => {
    const reading = validateBloodReading({ isBloodTest: true, results: [row({ value: 45, labFlag: "L" })] });
    expect(reading.ok && reading.findings).toEqual([]);
  });
  it("sans fourchette, suit seulement une marque claire du laboratoire", () => {
    const reading = validateBloodReading({ isBloodTest: true, results: [row({ refLow: null, refHigh: null, labFlag: "↓" }), row({ marker: "B12", label: "B12", refLow: null, refHigh: null, labFlag: "*" })] });
    expect(reading.ok && reading.findings.map((f) => f.marker)).toEqual(["VITAMIN_D"]);
  });
  it("refuse un document qui n'est pas une prise de sang", () => {
    expect(validateBloodReading({ isBloodTest: false, results: [row({})] }).ok).toBe(false);
  });
  it("marque une valeur très basse (moins de la moitié de la borne)", () => {
    const reading = validateBloodReading({ isBloodTest: true, results: [row({ value: 9 })] });
    expect(reading.ok && reading.findings[0].veryLow).toBe(true);
  });
});

describe("propositions", () => {
  const findings = (results: ClaimedBloodResult[]) => {
    const reading = validateBloodReading({ isBloodTest: true, results });
    if (!reading.ok) throw new Error(reading.error);
    return reading.findings;
  };

  it("propose un complément en stock pour une règle validée", () => {
    const [proposal] = proposeForBloodTest({ findings: findings([row({})]), validatedRuleKeys: ALL, products: [product("VITAMINE D3 1000 UI GOUTTES"), product("CREME MAINS")] });
    expect(proposal.kind).toBe("ADVICE");
    expect(proposal.products.map((p) => p.name)).toEqual(["VITAMINE D3 1000 UI GOUTTES"]);
  });
  it("aucun produit tant que la règle n'est pas validée", () => {
    const [proposal] = proposeForBloodTest({ findings: findings([row({})]), validatedRuleKeys: new Set(), products: [product("VITAMINE D3 1000 UI")] });
    expect(proposal.kind).toBe("DOCTOR");
    expect(proposal.products).toEqual([]);
  });
  it("une valeur haute, très basse ou inconnue renvoie au médecin", () => {
    const proposals = proposeForBloodTest({
      findings: findings([row({ value: 150 }), row({ marker: "FERRITIN", label: "Ferritine", value: 5, refLow: 15, refHigh: 150 }), row({ marker: "AUTRE", label: "Hémoglobine", value: 10, refLow: 12, refHigh: 16 })]),
      validatedRuleKeys: ALL,
      products: [product("VITAMINE D3"), product("FER BISGLYCINATE")],
    });
    expect(proposals.map((p) => p.kind)).toEqual(["DOCTOR", "DOCTOR", "DOCTOR"]);
  });
  it("jamais un médicament sur ordonnance, une forme fortement dosée, ni un faux ami", () => {
    const rule = (key: string) => BLOOD_RULES.find((r) => r.key === key)!;
    expect(productFitsRule(rule("vitamine-d-basse"), product("VITAMINE D3 100 000 UI AMPOULE"))).toBe(false);
    expect(productFitsRule(rule("vitamine-d-basse"), product("VITAMINE D3", { prescriptionConditions: ["Liste II"] }))).toBe(false);
    expect(productFitsRule(rule("fer-bas"), product("FERVEX ADULTES"))).toBe(false);
    expect(productFitsRule(rule("fer-bas"), product("FER BISGLYCINATE 30 GELULES"))).toBe(true);
  });
});
