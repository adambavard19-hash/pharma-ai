import { describe, expect, it } from "vitest";
import { searchDrugClasses } from "../drug-classes";
import { associationError } from "../rules";

const codes = (query: string) => searchDrugClasses(query).map((item) => item.code);

describe("familles de médicaments des associations", () => {
  it("retrouve la famille par une substance, puis « Tous les antibiotiques »", () => {
    expect(codes("amoxicilline")).toEqual(["J01C", "J01"]);
    expect(codes("amox")).toEqual(["J01C", "J01"]);
    expect(codes("azithro")).toEqual(["J01F", "J01"]);
  });
  it("retrouve la famille par son nom, accents ou non", () => {
    expect(codes("pénicilline")).toContain("J01C");
    expect(codes("macro")).toEqual(["J01F", "J01"]);
    expect(codes("antibio")[0]).toBe("J01");
  });
  it("ne propose rien pour un produit sans rapport", () => {
    expect(codes("doliprane")).toEqual([]);
    expect(codes("am")).toEqual([]);
  });
  it("une famille est un déclencheur, et un seul", () => {
    expect(associationError({ triggerAtcCode: "J01C", adviceProductId: "p1", sentence: null })).toBeNull();
    expect(associationError({ triggerAtcCode: "J01C", triggerSpecialtyId: "s1", adviceProductId: "p1", sentence: null })).toMatch(/un seul/);
  });
});
