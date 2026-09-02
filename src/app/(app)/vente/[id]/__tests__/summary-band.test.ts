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
    awaitingValidation: false,
    ...overrides,
  });
}

describe("bandeau de synthèse", () => {
  it("tient en trois lignes, une par zone, dans l'ordre de lecture", () => {
    const rows = entree();
    expect(rows.map((r) => r.key)).toEqual(["securite", "ordonnance", "accompagnement"]);
  });

  it("chaque ligne conduit à une zone de l'écran", () => {
    for (const row of entree()) expect(row.href).toMatch(/^#zone-/);
  });
});

describe("sécurité", () => {
  it("passe au rouge et dit ce qu'il faut faire", () => {
    const [securite] = entree({ blockingCount: 2, attentionCount: 1 });
    expect(securite.tone).toBe("danger");
    expect(securite.value).toBe("2 points à vérifier");
    expect(securite.detail).toBe("à acquitter avant tout conseil");
    expect(securite.action).toBe("Acquitter");
  });

  it("distingue une vigilance d'un blocage", () => {
    const [securite] = entree({ attentionCount: 2 });
    expect(securite.tone).toBe("warning");
    expect(securite.value).toBe("2 points de vigilance");
    expect(securite.detail).toBeUndefined();
  });

  it("ne peint pas en vert l'absence de signal", () => {
    // Le vert dirait « rien à signaler ». Ce n'est vrai que dans les limites de
    // ce qui a pu être comparé — et Pharma.ai peut tourner sans référentiel
    // d'interactions. La ligne dit ce qui a été regardé, pas plus.
    const [securite] = entree();
    expect(securite.tone).toBe("neutral");
    expect(securite.value).toBe("Aucun signal sur les lignes retenues");
    // Rien à faire : pas de verbe.
    expect(securite.action).toBeUndefined();
  });
});

describe("ordonnance", () => {
  it("ne transforme jamais une disponibilité inconnue en rupture", () => {
    const [, ordonnance] = entree({ inStock: 0, missing: 0, unknown: 2 });
    expect(ordonnance.detail).toBe("2 non rattachés");
    expect(ordonnance.detail).not.toMatch(/commander|rupture/);
    expect(ordonnance.action).toBe("Rattacher");
  });

  it("signale ce qui est réellement à commander, en orange", () => {
    const [, ordonnance] = entree({
      lineCount: 3,
      explainedCount: 3,
      inStock: 1,
      missing: 1,
      unknown: 1,
    });
    expect(ordonnance.value).toBe("3 médicaments");
    expect(ordonnance.detail).toBe("1 en stock · 1 à commander · 1 non rattaché");
    expect(ordonnance.tone).toBe("warning");
  });

  it("ne dit rien quand tous les traitements sont expliqués", () => {
    // Une information toujours satisfaite finit par ne plus être lue.
    const [, ordonnance] = entree({ lineCount: 2, explainedCount: 2 });
    expect(ordonnance.detail).not.toMatch(/explication/);
  });

  it("signale en revanche un traitement sans explication", () => {
    const [, ordonnance] = entree({ lineCount: 3, inStock: 3, explainedCount: 1 });
    expect(ordonnance.detail).toContain("2 sans explication");
  });

  it("dit que rien n'est validé quand les lignes viennent de la lecture seule", () => {
    // Sans cette mention, « 2 médicaments » se lirait comme un traitement
    // établi, alors que personne n'a encore signé.
    const [, ordonnance] = entree({ awaitingValidation: true });
    expect(ordonnance.detail).toContain("retenus par la lecture, non validés");
    expect(ordonnance.tone).toBe("warning");
    expect(ordonnance.action).toBe("Relire");
  });

  it("redevient neutre une fois l'ordonnance validée et complète", () => {
    const [, ordonnance] = entree({ awaitingValidation: false, inStock: 2 });
    expect(ordonnance.tone).toBe("neutral");
    expect(ordonnance.action).toBeUndefined();
  });
});

describe("accompagnement", () => {
  it("annonce sobrement l'absence de recommandation, sans la présenter comme une anomalie", () => {
    const [, , accompagnement] = entree({ recommendationCount: 0 });
    expect(accompagnement.value).toBe("Aucune recommandation complémentaire pertinente");
    expect(accompagnement.tone).toBe("neutral");
    expect(accompagnement.action).toBeUndefined();
  });

  it("accorde le nombre de propositions", () => {
    expect(entree({ recommendationCount: 1 })[2].value).toBe("1 proposition pertinente");
    expect(entree({ recommendationCount: 3 })[2].value).toBe("3 propositions pertinentes");
  });

  it("ne montre aucune proposition tant que la sécurité n'est pas acquittée", () => {
    const [, , accompagnement] = entree({
      blockingCount: 1,
      locked: true,
      recommendationCount: 2,
    });
    expect(accompagnement.value).toBe("En attente de la vérification de sécurité");
    expect(accompagnement.value).not.toMatch(/proposition/);
    // Orange, jamais rouge : le rouge appartient à la sécurité clinique.
    expect(accompagnement.tone).toBe("warning");
    // Et la ligne conduit là où le geste se trouve, pas là où il manque.
    expect(accompagnement.href).toBe("#zone-securite");
    expect(accompagnement.action).toBe("Acquitter d'abord");
  });
});

describe("la couleur ne ment jamais", () => {
  it("aucune ligne autre que la sécurité ne prend le rouge", () => {
    const cas = [
      entree({ locked: true, blockingCount: 1, recommendationCount: 2 }),
      entree({ lineCount: 3, missing: 3, inStock: 0 }),
      entree({ awaitingValidation: true, unknown: 2 }),
      entree({ recommendationCount: 3 }),
    ];
    for (const rows of cas) {
      for (const row of rows.slice(1)) expect(row.tone).not.toBe("danger");
    }
  });

  it("un verbe n'apparaît que là où il y a réellement quelque chose à faire", () => {
    // Un écran calme ne propose aucune action : trois verbes affichés en
    // permanence ne seraient plus des actions, seulement du décor.
    for (const row of entree()) expect(row.action).toBeUndefined();
  });
});
