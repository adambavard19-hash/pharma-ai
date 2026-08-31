import { describe, expect, it } from "vitest";
import { describeCoverage } from "../coverage";
import { interactionFindings } from "../findings";
import type { InteractionCatalogState } from "../coverage";

/**
 * La phrase de couverture est la promesse que l'application fait au
 * pharmacien. Ces tests vérifient qu'elle ne promet jamais plus que ce qui a
 * réellement été fait.
 */

const CHARGE: InteractionCatalogState = {
  status: "LOADED",
  sourceName: "Thésaurus ANSM",
  sourceVersion: "2023-09",
  sourceUpdatedAt: "2023-09-15T00:00:00.000Z",
  importedAt: "2026-08-31T00:00:00.000Z",
  ruleCount: 1200,
  classMemberCount: 3400,
};

describe("ce que l'application a le droit d'affirmer", () => {
  it("sans référentiel, dit que les interactions ne sont pas analysées", () => {
    const coverage = describeCoverage({
      catalog: { status: "NOT_LOADED" },
      analysedCount: 2,
      unanalysedCount: 0,
    });
    expect(coverage.loaded).toBe(false);
    expect(coverage.headline).toContain("ne sont pas analysées");
    // Et ne laisse pas croire qu'il ne reste rien à faire.
    expect(coverage.detail).toContain("Seules les redondances de substance active");
  });

  it("sans référentiel, ne dit jamais « aucune interaction »", () => {
    const coverage = describeCoverage({
      catalog: { status: "NOT_LOADED" },
      analysedCount: 3,
      unanalysedCount: 0,
    });
    expect(`${coverage.headline} ${coverage.detail}`).not.toMatch(/aucune interaction/i);
  });

  it("avec référentiel et toutes les lignes rattachées, cite la source", () => {
    const coverage = describeCoverage({
      catalog: CHARGE,
      analysedCount: 3,
      unanalysedCount: 0,
    });
    expect(coverage.headline).toContain("entre les 3 médicaments confirmés");
    expect(coverage.detail).toContain("Thésaurus ANSM 2023-09");
    // Une absence d'alerte ne vaut que pour ce référentiel.
    expect(coverage.detail).toContain("ne dispense pas du jugement professionnel");
  });

  it("annonce une analyse partielle plutôt qu'un vert trompeur", () => {
    const coverage = describeCoverage({
      catalog: CHARGE,
      analysedCount: 2,
      unanalysedCount: 1,
    });
    expect(coverage.headline).toBe("Interactions vérifiées sur 2 lignes sur 3.");
    expect(coverage.detail).toContain("1 ligne n'est pas rattachée");
  });

  it("dit clairement que rien n'a pu être vérifié quand aucune ligne n'est rattachée", () => {
    const coverage = describeCoverage({
      catalog: CHARGE,
      analysedCount: 0,
      unanalysedCount: 2,
    });
    expect(coverage.headline).toContain("Aucune ligne n'a pu être confrontée");
    expect(coverage.detail).toContain("Les 2 lignes ne sont pas rattachées");
  });
});

describe("traduction en signaux de sécurité", () => {
  const vide = { matches: [], overlaps: [], analysedLineIds: ["1"], unanalysedLineIds: [] };

  it("émet toujours un signal de couverture, même sans aucune alerte", () => {
    const findings = interactionFindings(
      vide,
      describeCoverage({ catalog: CHARGE, analysedCount: 1, unanalysedCount: 0 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe("INTERACTION_COVERAGE");
    expect(findings[0].severity).toBe("INFO");
  });

  it("passe la couverture en avertissement quand aucun référentiel n'est chargé", () => {
    const findings = interactionFindings(
      vide,
      describeCoverage({ catalog: { status: "NOT_LOADED" }, analysedCount: 1, unanalysedCount: 0 }),
    );
    expect(findings[0].code).toBe("INTERACTION_NO_REFERENTIAL");
    expect(findings[0].severity).toBe("WARNING");
  });

  it("rend une contre-indication bloquante et cite sa source mot pour mot", () => {
    const findings = interactionFindings(
      {
        ...vide,
        matches: [
          {
            severity: "CONTRAINDICATION",
            lineIds: ["1", "2"],
            leftLabel: "Warfarine",
            rightLabel: "Miconazole",
            viaClass: false,
            risk: "Hémorragies imprévisibles.",
            guidance: "Association contre-indiquée.",
            sourceName: "Thésaurus ANSM",
            sourceVersion: "2023-09",
          },
        ],
      },
      describeCoverage({ catalog: CHARGE, analysedCount: 2, unanalysedCount: 0 }),
    );
    const alerte = findings[0];
    expect(alerte.severity).toBe("BLOCKING");
    expect(alerte.subjectType).toBe("PRESCRIPTION_LINE");
    expect(alerte.message).toContain("Contre-indication — Warfarine + Miconazole");
    expect(alerte.message).toContain("Hémorragies imprévisibles.");
    expect(alerte.message).toContain("Source : Thésaurus ANSM 2023-09");
  });

  it("rend une précaution d'emploi visible sans fermer le comptoir", () => {
    const findings = interactionFindings(
      {
        ...vide,
        matches: [
          {
            severity: "PRECAUTION",
            lineIds: ["1", "2"],
            leftLabel: "A",
            rightLabel: "B",
            viaClass: false,
            risk: "Risque décrit.",
            guidance: null,
            sourceName: "S",
            sourceVersion: "1",
          },
        ],
      },
      describeCoverage({ catalog: CHARGE, analysedCount: 2, unanalysedCount: 0 }),
    );
    expect(findings[0].severity).toBe("WARNING");
  });

  it("nomme une redondance de substance pour ce qu'elle est", () => {
    const findings = interactionFindings(
      {
        ...vide,
        overlaps: [
          {
            substanceLabel: "Paracétamol",
            lineIds: ["1", "2"],
            lineLabels: ["Doliprane", "Dafalgan"],
          },
        ],
      },
      describeCoverage({ catalog: { status: "NOT_LOADED" }, analysedCount: 2, unanalysedCount: 0 }),
    );
    const doublon = findings.find((f) => f.code === "SUBSTANCE_DUPLICATED");
    expect(doublon?.message).toContain("même substance active");
    expect(doublon?.message).toContain("vérifiez la dose totale");
    // Elle est détectée SANS référentiel : le dire évite de la confondre avec
    // une couverture d'interactions.
    expect(doublon?.message).toContain("indépendamment de tout référentiel");
  });
});
