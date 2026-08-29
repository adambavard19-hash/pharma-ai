import { describe, expect, it } from "vitest";
import {
  BDPM_SOURCE,
  REFERENCE_STALE_AFTER_DAYS,
  isReferenceStale,
  referenceAgeDays,
  referenceAttribution,
  type ReferenceCatalogState,
} from "../attribution";

/**
 * La licence de la Base de Données Publique des Médicaments impose de mentionner
 * la source ET sa date de mise à jour. Ces tests protègent cette obligation :
 * la mention est produite par une seule fonction, donc il suffit de la tenir ici.
 */

type LoadedState = Extract<ReferenceCatalogState, { counts: unknown }>;

const ready = (overrides: Partial<LoadedState> = {}): LoadedState =>
  ({
    status: "READY" as const,
    sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
    importedAt: "2026-08-15T09:00:00.000Z",
    ageDays: 14,
    counts: { specialties: 14442, presentations: 20083, substances: 3352 },
    lastFailure: null,
    ...overrides,
  }) satisfies LoadedState;

describe("mention de source", () => {
  it("nomme toujours la source même si une resynchronisation a échoué depuis", () => {
    // Un échec postérieur n'efface pas le catalogue en place : la mention doit
    // continuer de désigner la version réellement chargée.
    const mention = referenceAttribution(
      ready({ lastFailure: { attemptedAt: "2026-08-20T10:00:00.000Z", error: "format modifié" } }),
    );
    expect(mention).toContain(BDPM_SOURCE.name);
    expect(mention).toContain("1 août 2026");
  });

  it("nomme la source et la date de mise à jour publiée", () => {
    const mention = referenceAttribution(ready());
    expect(mention).toContain(BDPM_SOURCE.name);
    expect(mention).toContain(BDPM_SOURCE.url);
    expect(mention).toContain("1 août 2026");
  });

  /**
   * La date à afficher est celle de la SOURCE, pas celle de notre import :
   * afficher la seconde laisserait croire à des données plus fraîches
   * qu'elles ne le sont.
   */
  it("n'affiche pas la date d'import à la place de celle de la source", () => {
    expect(referenceAttribution(ready())).not.toContain("15 août");
  });

  it("dit franchement qu'aucune donnée officielle n'est chargée", () => {
    expect(referenceAttribution({ status: "NOT_IMPORTED" })).toContain("Aucune donnée");
    expect(
      referenceAttribution({ status: "FAILED", attemptedAt: "2026-08-15", error: null }),
    ).toContain("Aucune donnée");
  });

  it("signale une date de mise à jour inconnue plutôt que d'en inventer une", () => {
    const mention = referenceAttribution(ready({ sourceUpdatedAt: null }));
    expect(mention).toContain(BDPM_SOURCE.name);
    expect(mention).toContain("non communiquée");
  });
});

describe("fraîcheur du référentiel", () => {
  const now = new Date("2026-08-29T12:00:00.000Z");

  it("compte l'ancienneté en jours pleins depuis la publication", () => {
    expect(referenceAgeDays(new Date("2026-08-01T00:00:00.000Z"), now)).toBe(28);
    expect(referenceAgeDays(new Date("2026-08-29T00:00:00.000Z"), now)).toBe(0);
  });

  it("considère le référentiel périmé au-delà du seuil", () => {
    expect(isReferenceStale(REFERENCE_STALE_AFTER_DAYS)).toBe(false);
    expect(isReferenceStale(REFERENCE_STALE_AFTER_DAYS + 1)).toBe(true);
  });

  /**
   * Une date inconnue n'est pas une date ancienne. Traiter l'absence
   * d'information comme une péremption afficherait une alerte fausse.
   */
  it("ne traite pas une date inconnue comme périmée", () => {
    expect(referenceAgeDays(null, now)).toBeNull();
    expect(isReferenceStale(null)).toBe(false);
  });
});
