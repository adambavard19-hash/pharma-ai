import { describe, expect, it } from "vitest";
import {
  COUNTER_TONE_RULE,
  adviceTone,
  safetySummaryTone,
  safetyTone,
  stockTone,
} from "../counter-tone";

/**
 * La couleur est une promesse faite au comptoir : le rouge arrête, l'orange
 * fait ralentir. Ces tests protègent cette promesse — surtout dans le sens
 * « ce qui ne doit JAMAIS prendre telle couleur ».
 */

describe("règle de couleur du comptoir", () => {
  it("n'a que quatre couleurs, chacune avec une signification", () => {
    expect(Object.keys(COUNTER_TONE_RULE).sort()).toEqual([
      "danger",
      "neutral",
      "success",
      "warning",
    ]);
  });
});

describe("le rouge est réservé à la sécurité clinique", () => {
  it("un signal bloquant est rouge", () => {
    expect(safetyTone("BLOCKING")).toBe("danger");
    expect(safetySummaryTone({ blockingCount: 1, attentionCount: 0 })).toBe("danger");
  });

  it("une zone de conseils fermée est orange, jamais rouge", () => {
    // Le danger est déjà rouge une ligne plus haut. Le redire ici userait la
    // couleur qui doit arrêter le geste.
    expect(adviceTone({ locked: true, recommendationCount: 3 })).toBe("warning");
  });

  it("un stock manquant est orange, jamais rouge", () => {
    expect(stockTone("REFERENCED_EMPTY")).toBe("warning");
    expect(stockTone("NOT_REFERENCED")).toBe("warning");
  });

  it("aucune situation commerciale ou de stock ne produit du rouge", () => {
    const commercial = [
      stockTone("IN_STOCK"),
      stockTone("REFERENCED_EMPTY"),
      stockTone("NOT_REFERENCED"),
      stockTone("UNKNOWN"),
      stockTone(null),
      adviceTone({ locked: true, recommendationCount: 0 }),
      adviceTone({ locked: false, recommendationCount: 3 }),
      adviceTone({ locked: false, recommendationCount: 0 }),
    ];
    expect(commercial).not.toContain("danger");
  });
});

describe("l'absence de signal n'est pas un feu vert", () => {
  it("une sécurité sans signal est neutre, pas verte", () => {
    // Le vert dirait « rien à signaler ». Ce n'est vrai que dans les limites de
    // ce qui a pu être comparé — et la phrase de couverture, juste en dessous,
    // dit précisément que ces limites existent.
    expect(safetySummaryTone({ blockingCount: 0, attentionCount: 0 })).toBe("neutral");
  });

  it("un signal informatif est neutre", () => {
    expect(safetyTone("INFO")).toBe("neutral");
  });

  it("une sévérité inconnue ne crie pas", () => {
    // Le moteur peut ajouter une sévérité demain : elle ne doit pas hériter du
    // rouge par accident.
    expect(safetyTone("QUELQUE_CHOSE_DE_NOUVEAU")).toBe("neutral");
    expect(safetyTone("")).toBe("neutral");
  });
});

describe("ne pas savoir n'est pas une rupture", () => {
  it("une disponibilité inconnue est neutre", () => {
    expect(stockTone("UNKNOWN")).toBe("neutral");
    expect(stockTone(null)).toBe("neutral");
    expect(stockTone(undefined)).toBe("neutral");
  });
});

describe("le vert dit ce qu'on peut faire maintenant", () => {
  it("un produit en stock est vert", () => {
    expect(stockTone("IN_STOCK")).toBe("success");
  });

  it("des conseils disponibles sont verts", () => {
    expect(adviceTone({ locked: false, recommendationCount: 1 })).toBe("success");
  });

  it("aucune proposition est neutre, pas une anomalie", () => {
    expect(adviceTone({ locked: false, recommendationCount: 0 })).toBe("neutral");
  });
});
