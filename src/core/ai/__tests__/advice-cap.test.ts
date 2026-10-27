import { describe, expect, it } from "vitest";
import { capShownAdvice } from "../advice-cap";
import { product } from "./fixtures";
import type { CatalogProduct, ScoredRecommendation } from "../types";

/** Trois conseils au plus au comptoir : surstock, règle n° 1, sécurité, date courte, challenge, puis la marge (fondateur, 27 oct. 2026). */

const rec = (productId: string, over: Partial<ScoredRecommendation> = {}): ScoredRecommendation => ({
  opportunityKey: productId,
  productId,
  totalScore: 0.8,
  breakdown: { relevance: 1, safety: 1, availability: 1, patientFit: 1, pharmacistPreference: 0, validationHistory: 0, commercial: 0 },
  justification: "",
  shortReason: "",
  patientReason: "",
  counterScript: "",
  precautions: [],
  explanation: [],
  ...over,
});

function cap(recommendations: ScoredRecommendation[], catalog: CatalogProduct[] = [], safety: string[] = [], hidden: string[] = []) {
  return capShownAdvice({
    recommendations,
    max: 3,
    catalogById: new Map(catalog.map((item) => [item.id, item])),
    isHidden: (item) => hidden.includes(item.productId),
    isSafety: (item) => safety.includes(item.productId),
  }).kept.map((item) => item.productId);
}

describe("trois conseils au plus", () => {
  it("garde la règle n° 1, puis les meilleures marges, dans l'ordre du moteur", () => {
    const list = [rec("flore", { marginCents: 300 }), rec("a", { marginCents: 100 }), rec("b", { marginCents: 900 }), rec("c", { marginCents: 500 })];
    expect(cap(list)).toEqual(["flore", "b", "c"]);
  });

  it("le surstock, la date courte et le challenge passent avant la marge", () => {
    const short = product({ id: "short", shortDate: { expiresOn: "2026-11-30", quantity: 3, months: 1 } as never });
    const challenge = product({ id: "chal", activeChallenge: "Challenge Pileje" });
    const list = [rec("flore", { marginCents: 100 }), rec("riche", { marginCents: 2000 }), rec("short", { marginCents: 50 }), rec("chal", { marginCents: 60 }), rec("surstock", { source: "OVERSTOCK" })];
    expect(cap(list, [short, challenge])).toEqual(["flore", "short", "surstock"]);
    expect(cap(list.filter((item) => item.productId !== "surstock"), [short, challenge])).toEqual(["flore", "short", "chal"]);
  });

  it("un conseil de sécurité n'est jamais retiré pour de la marge", () => {
    const list = [rec("flore", { marginCents: 100 }), rec("riche", { marginCents: 2000 }), rec("riche2", { marginCents: 1500 }), rec("soleil", { marginCents: 10 })];
    expect(cap(list, [], ["soleil"])).toEqual(["flore", "riche", "soleil"]);
  });

  it("ne touche à rien sous trois, et les conseils cachés de l'arbre restent hors plafond", () => {
    expect(cap([rec("a"), rec("b")])).toEqual(["a", "b"]);
    expect(cap([rec("a"), rec("b"), rec("c"), rec("poche")], [], [], ["poche"])).toEqual(["a", "b", "c", "poche"]);
  });

  it("garde les alternatives des conseils retenus", () => {
    const flore = rec("flore", { alternatives: [{ ...rec("levure") }] });
    const kept = capShownAdvice({ recommendations: [flore, rec("a"), rec("b"), rec("c")], max: 3, catalogById: new Map(), isHidden: () => false, isSafety: () => false }).kept;
    expect(kept[0].alternatives?.map((item) => item.productId)).toEqual(["levure"]);
  });
});

describe("surstock déjà conseillé par PharmaBoost", () => {
  it("compte comme surstock, et la règle n° 1 reste la flore", () => {
    const list = [rec("multivit", { overstock: true, marginCents: 1000 }), rec("magnesium", { marginCents: 1126 }), rec("flore", { marginCents: 200 }), rec("thermo", { marginCents: 1458 })];
    // L'ordre du moteur met la flore après le surstock : c'est elle, la règle n° 1.
    expect(cap([list[0], list[2], list[1], list[3]])).toEqual(["multivit", "flore", "thermo"]);
  });
});
