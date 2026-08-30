import { describe, expect, it } from "vitest";
import { buildSummaryRows } from "../summary-band";

/**
 * Le bandeau est la première chose lue au comptoir. Ces tests fixent ce qu'il
 * a le droit de dire — et surtout ce qu'il n'a pas le droit de laisser croire.
 */

function entree(overrides: Partial<Parameters<typeof buildSummaryRows>[0]> = {}) {
  return buildSummaryRows({
    blockingCount: 0,
    attentionCount: 0,
    lineCount: 2,
    inStock: 2,
    missing: 0,
    unknown: 0,
    explainedCount: 2,
    recommendationCount: 0,
    locked: false,
    ...overrides,
  });
}

describe("bandeau de synthèse", () => {
  it("garde toujours les quatre lignes, dans l'ordre sécurité → ordonnance → conseil → accompagnement", () => {
    const rows = entree();
    expect(rows.map((r) => r.key)).toEqual([
      "securite",
      "ordonnance",
      "conseil",
      "accompagnement",
    ]);
  });

  it("annonce sobrement l'absence de recommandation, sans la présenter comme une anomalie", () => {
    const [securite, , , accompagnement] = entree({ recommendationCount: 0 });
    expect(accompagnement.value).toBe("Aucune recommandation complémentaire pertinente");
    // Ni rouge ni orange : c'est un résultat normal.
    expect(accompagnement.tone).toBe("neutral");
    expect(securite.tone).toBe("success");
  });

  it("accorde le nombre de propositions", () => {
    expect(entree({ recommendationCount: 1 })[3].value).toBe("1 proposition pertinente");
    expect(entree({ recommendationCount: 3 })[3].value).toBe("3 propositions pertinentes");
  });

  it("passe la sécurité en rouge et dit ce qu'il faut faire", () => {
    const [securite] = entree({ blockingCount: 2, attentionCount: 1 });
    expect(securite.tone).toBe("danger");
    expect(securite.value).toBe("2 points à vérifier");
    expect(securite.detail).toBe("à acquitter avant tout conseil");
  });

  it("ne montre aucune proposition tant que la sécurité n'est pas acquittée", () => {
    const rows = entree({ blockingCount: 1, locked: true, recommendationCount: 2 });
    const accompagnement = rows[3];
    expect(accompagnement.value).toBe("En attente de la vérification de sécurité");
    expect(accompagnement.value).not.toMatch(/proposition/);
  });

  it("distingue une vigilance d'un blocage", () => {
    const [securite] = entree({ attentionCount: 2 });
    expect(securite.tone).toBe("warning");
    expect(securite.value).toBe("2 points de vigilance");
    expect(securite.detail).toBeUndefined();
  });

  it("ne transforme jamais une disponibilité inconnue en rupture", () => {
    const [, ordonnance] = entree({ inStock: 0, missing: 0, unknown: 2 });
    expect(ordonnance.detail).toBe("2 non rattachés");
    expect(ordonnance.detail).not.toMatch(/commander|rupture/);
    // Une information manquante n'est pas un problème de stock : ton neutre.
    expect(ordonnance.tone).toBe("neutral");
  });

  it("signale en orange ce qui est réellement à commander", () => {
    const [, ordonnance] = entree({ lineCount: 3, inStock: 1, missing: 1, unknown: 1 });
    expect(ordonnance.value).toBe("3 médicaments");
    expect(ordonnance.detail).toBe("1 en stock · 1 à commander · 1 non rattaché");
    expect(ordonnance.tone).toBe("warning");
  });

  it("chaque ligne conduit à la zone correspondante", () => {
    for (const row of entree()) expect(row.href).toMatch(/^#zone-/);
  });
});
