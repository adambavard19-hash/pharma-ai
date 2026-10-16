import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/stock-lots", () => ({ saveLotAction: vi.fn(), searchStockItemsAction: vi.fn() }));

const { scannedInput } = await import("../lot-form");

describe("la douchette dans l'onglet Dates courtes", () => {
  it("un Datamatrix donne le CIP13 et la date imprimée", () => {
    expect(scannedInput("010340093290381817270331" + "10AB12")).toEqual({ code: "3400932903818", expiry: "31/03/2027" });
  });
  it("un code-barres simple donne le code, sans date", () => {
    expect(scannedInput("3400932903818")).toEqual({ code: "3400932903818", expiry: null });
    expect(scannedInput("3760001234567")).toEqual({ code: "3760001234567", expiry: null });
  });
  it("un nom tapé au clavier n'est pas un scan", () => {
    expect(scannedInput("doliprane")).toBeNull();
    expect(scannedInput("RULID 150")).toBeNull();
  });
});
