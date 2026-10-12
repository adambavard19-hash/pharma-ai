import { describe, expect, it } from "vitest";
import { MAX_RECOMMENDATIONS_COUNTER_SCAN } from "@/config/constants";
import { drugKey, MAX_ASSOCIATION_ADVICE } from "../engines/associations";
import { buildCounterNotice, MAX_COUNTER_CARDS } from "@/core/counter/notice";
import { analyse, AMOXICILLINE, nasalShelf, probioticShelf, ROXITHROMYCINE } from "./scenarios-conseils";
import { product } from "./fixtures";

/**
 * Au comptoir, les associations du pharmacien s'AJOUTENT aux conseils du moteur. Une vente de la douchette plafonne le
 * moteur à trois conseils (`MAX_RECOMMENDATIONS_COUNTER_SCAN`) ; les associations ont leurs propres places, jusqu'à trois
 * (`MAX_ASSOCIATION_ADVICE`) — dans l'analyse comme dans la fenêtre du poste. Avant, la fenêtre prenait les trois
 * meilleurs scores, et les conseils du moteur (mieux notés) chassaient les associations : le pharmacien en écrivait deux,
 * aucune ne s'affichait.
 */

const brosse = product({ id: "assoc-brosse", name: "Brosse à dents souple", category: "HYGIENE", stockQuantity: 7, matchingTags: [] });
const mouchoirs = product({ id: "assoc-mouchoirs", name: "Mouchoirs doux", category: "HYGIENE", stockQuantity: 30, matchingTags: [] });
/** Un spray pour la gorge, que le moteur conseille de lui-même : avec lui, le moteur remplit ses trois places. */
const gorge = product({ id: "engine-gorge", name: "Spray gorge apaisant", category: "SOINS", stockQuantity: 7, matchingTags: [] });
const shelf = [...probioticShelf(), ...nasalShelf(), gorge, brosse, mouchoirs];

/** La vente : deux antibiotiques bipés ; le pharmacien a associé DEUX produits au premier. */
function sale() {
  const roxithromycine = drugKey(ROXITHROMYCINE.name);
  return analyse([ROXITHROMYCINE, AMOXICILLINE], shelf, {
    maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN,
    associations: {
      rules: [
        { id: "a1", triggerKey: roxithromycine, adviceProductId: brosse.id, sentence: "Pour la bouche.", sortOrder: 1 },
        { id: "a2", triggerKey: roxithromycine, adviceProductId: mouchoirs.id, sentence: null, sortOrder: 2 },
      ],
      lines: [{ lineIndex: 0, keys: [roxithromycine], productId: null }],
    },
  });
}

describe("au comptoir, plusieurs associations s'affichent vraiment", () => {
  it("le moteur garde ses trois conseils, et les deux associations s'y ajoutent", () => {
    const result = sale();
    const engine = result.recommendations.filter((rec) => rec.source !== "ASSOCIATION");
    const associations = result.recommendations.filter((rec) => rec.source === "ASSOCIATION");
    // Le moteur a de quoi remplir ses trois places (probiotique, lavage du nez…) : c'est le cas où il pouvait évincer.
    expect(engine).toHaveLength(MAX_RECOMMENDATIONS_COUNTER_SCAN);
    expect(associations.map((rec) => rec.productId)).toEqual([brosse.id, mouchoirs.id]);
  });

  it("dans la fenêtre du poste : les trois conseils du moteur PUIS les deux associations, alors qu'elles ont les moins bons scores", () => {
    const result = sale();
    const byScore = [...result.recommendations].sort((a, b) => b.totalScore - a.totalScore);
    const name = (productId: string) => shelf.find((item) => item.id === productId)?.name ?? productId;
    // Sans places à elles, les trois meilleurs scores ne laissaient aucune association.
    expect(byScore.slice(0, 3).every((rec) => rec.source !== "ASSOCIATION")).toBe(true);

    const notice = buildCounterNotice({
      reference: "ORD-0042",
      prescriptionStatus: "ANALYZED",
      lineNames: [ROXITHROMYCINE.name, AMOXICILLINE.name],
      alerts: [],
      outcome: result.outcome,
      recommendations: byScore.map((rec) => ({ id: rec.productId, name: name(rec.productId), priceCents: 990, reason: rec.shortReason, status: "PROPOSED", association: rec.source === "ASSOCIATION" })),
    });
    expect(notice.items).toHaveLength(5);
    expect(notice.items.slice(3).map((item) => item.name)).toEqual(["Brosse à dents souple", "Mouchoirs doux"]);
  });

  it("le total reste raisonnable : six cartes au plus, trois associations au plus", () => {
    expect(MAX_ASSOCIATION_ADVICE).toBe(3);
    expect(MAX_COUNTER_CARDS).toBe(MAX_RECOMMENDATIONS_COUNTER_SCAN + MAX_ASSOCIATION_ADVICE);
    const many = Array.from({ length: 5 }, (_, index) => ({ id: `e${index}`, name: `Conseil ${index}`, priceCents: null, reason: null, status: "PROPOSED" }));
    const assoc = Array.from({ length: 5 }, (_, index) => ({ id: `a${index}`, name: `Association ${index}`, priceCents: null, reason: null, status: "PROPOSED", association: true }));
    const notice = buildCounterNotice({ reference: "ORD-1", prescriptionStatus: "ANALYZED", lineNames: ["X"], alerts: [], outcome: "PROPOSALS", recommendations: [...assoc, ...many] });
    expect(notice.items.map((item) => item.name)).toEqual(["Conseil 0", "Conseil 1", "Conseil 2", "Association 0", "Association 1", "Association 2"]);
  });
});
