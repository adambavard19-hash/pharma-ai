import { describe, expect, it } from "vitest";
import { readCounterSheet } from "../counter-sheet";

const base = { name: "Gel nettoyant", reasons: [], script: "", contraindications: [], usage: [], description: "" };

describe("étape de routine sur la fiche du conseil", () => {
  it("passe telle quelle quand elle est bien formée", () => {
    const sheet = readCounterSheet({ ...base, routine: { key: "isotretinoin-skin-routine", title: "Routine peau", step: "Nettoyer", index: 0, count: 3 } });
    expect(sheet?.routine).toEqual({ key: "isotretinoin-skin-routine", title: "Routine peau", step: "Nettoyer", index: 0, count: 3 });
  });

  it("disparaît quand elle est mal formée : le conseil reste un conseil seul", () => {
    expect(readCounterSheet({ ...base, routine: { key: "x", title: "y", step: "z", index: -1, count: 3 } })?.routine).toBeUndefined();
    expect(readCounterSheet({ ...base, routine: "routine" })?.routine).toBeUndefined();
    expect(readCounterSheet(base)).not.toHaveProperty("routine");
  });
});
