import { describe, expect, it } from "vitest";
import { oneTreeCardPerProduct } from "../tree-state";

/** « Où le patient a-t-il mal ? » se coche à plusieurs : épaule ET genou retiennent souvent la même poche multi-zones. */
const rec = (id: string, productId: string | null, ruleKey: string | null, status = "PROPOSED") => ({ id, productId, status, opportunity: ruleKey === null ? null : { ruleKey } });

describe("une carte par produit parmi les conseils de l'arbre débloqués", () => {
  it("deux zones cochées, une même poche : une seule carte, la première dans l'ordre", () => {
    const kept = oneTreeCardPerProduct([rec("shoulder", "multi", "pain-pack-shoulder"), rec("knee", "multi", "pain-pack-knee"), rec("back", "dos", "pain-pack-back")]);
    expect(kept.map((r) => r.id)).toEqual(["shoulder", "back"]);
  });

  it("une carte déjà tranchée garde la place, pour que la décision du pharmacien reste visible", () => {
    const kept = oneTreeCardPerProduct([rec("shoulder", "multi", "pain-pack-shoulder"), rec("knee", "multi", "pain-pack-knee", "ACCEPTED")]);
    expect(kept.map((r) => r.id)).toEqual(["knee"]);
  });

  it("ne touche ni les conseils hors de l'arbre, ni les recommandations sans produit", () => {
    const list = [rec("a", "multi", "some-other-rule"), rec("b", "multi", "some-other-rule"), rec("c", null, "pain-pack-knee"), rec("d", null, "pain-pack-hip"), rec("e", "x", null)];
    expect(oneTreeCardPerProduct(list).map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
