import { describe, expect, it } from "vitest";
import { LGO_DEFINITIONS, describeAge, lgoLabel, listStockConnectors, stockFreshness } from "../connectors";

describe("fraîcheur du stock synchronisé", () => {
  const now = new Date("2026-09-12T10:00:00Z");
  const minutes = (n: number) => new Date(now.getTime() - n * 60_000);

  it("est fraîche tant que la dernière synchronisation est récente", () => {
    expect(stockFreshness({ lastSyncAt: minutes(2), lastSeenAt: minutes(1), intervalSeconds: 300, now })).toEqual({ state: "FRESH", ageSeconds: 120 });
  });

  it("devient périmée au-delà de trois intervalles, quinze minutes au moins", () => {
    expect(stockFreshness({ lastSyncAt: minutes(16), lastSeenAt: minutes(1), intervalSeconds: 300, now }).state).toBe("STALE");
    expect(stockFreshness({ lastSyncAt: minutes(14), lastSeenAt: minutes(1), intervalSeconds: 60, now }).state).toBe("FRESH");
    expect(stockFreshness({ lastSyncAt: null, lastSeenAt: minutes(1), intervalSeconds: 300, now }).state).toBe("STALE");
  });

  it("dit « déconnecté » quand l'agent ne donne plus signe de vie depuis une heure", () => {
    expect(stockFreshness({ lastSyncAt: minutes(2), lastSeenAt: minutes(61), intervalSeconds: 300, now }).state).toBe("DISCONNECTED");
    expect(stockFreshness({ lastSyncAt: minutes(2), lastSeenAt: null, intervalSeconds: 300, now }).state).toBe("DISCONNECTED");
  });

  it("décrit un âge en français", () => {
    expect(describeAge(null)).toBe("jamais");
    expect(describeAge(30)).toBe("à l'instant");
    expect(describeAge(600)).toBe("il y a 10 min");
    expect(describeAge(7200)).toBe("il y a 2 h");
  });

  it("n'annonce aucun connecteur fictif et connaît les LGO du marché", () => {
    expect(listStockConnectors().map((c) => c.id)).toEqual(["file-import", "pharmaboost-connect"]);
    expect(LGO_DEFINITIONS.map((l) => l.id)).toEqual(expect.arrayContaining(["lgpi", "smart-rx", "pharmaland", "winpharma", "leo"]));
    expect(lgoLabel("lgpi")).toBe("LGPI");
    expect(lgoLabel("inconnu")).toBe("inconnu");
  });
});

describe("procédure d'export par logiciel", () => {
  it("donne à chaque logiciel un dossier surveillé et des étapes, LGPI avec l'édition d'inventaire vérifiée", async () => {
    const { LGO_DEFINITIONS, DEFAULT_EXPORT_PATH } = await import("../connectors");
    for (const lgo of LGO_DEFINITIONS) {
      expect(lgo.defaultExportPath).toBe(DEFAULT_EXPORT_PATH);
      expect(lgo.exportSteps.length).toBeGreaterThanOrEqual(3);
    }
    const lgpi = LGO_DEFINITIONS.find((l) => l.id === "lgpi");
    expect(lgpi?.exportSteps.join(" ")).toMatch(/Inventaire.*Édition.*Prix de vente.*PDF/s);
    expect(lgpi?.exportHint).not.toMatch(/export planifié/);
  });
});

