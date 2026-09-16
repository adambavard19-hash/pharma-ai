import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { currentCoverage, parseBdmItRecord, parseFrenchDate } from "../bdm-it";

/**
 * Les fiches de la base tarifaire, telles que le site les sert (UTF-8).
 * Trois cas réels enregistrés le 17 septembre 2026 : un médicament
 * d'exception, un médicament ordinaire, un CIP inconnu.
 */
function fixture(name: string): string {
  const bytes = readFileSync(path.join(__dirname, "fixtures", name));
  return new TextDecoder("utf-8").decode(bytes);
}

describe("parseBdmItRecord", () => {
  it("lit le statut d'exception et l'homologation de Forsteo", () => {
    const reading = parseBdmItRecord(fixture("bdm-it-forsteo-3400936221628.html"), "3400936221628");
    expect(reading.kind).toBe("RECORD");
    if (reading.kind !== "RECORD") return;
    expect(reading.record.designation).toBe("FORSTEO 20 MICROGRAMMES/80 MICROLITRES (TÉRIPARATIDE)");
    expect(reading.record.isException).toBe(true);
    expect(reading.record.isSpecific).toBe(true);
    expect(reading.record.nature).toBe("A");
    expect(reading.record.notReimbursable).toBe(false);
    expect(reading.record.sourceVersion).toBe("1531");
    expect(reading.record.sourceUpdatedAt?.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    const current = currentCoverage(reading.record.coverage);
    expect(current?.start.toISOString()).toBe("2024-08-17T00:00:00.000Z");
    expect(current?.end?.toISOString()).toBe("2029-08-16T00:00:00.000Z");
    expect(current?.endReason).toBe("REEXAMEN");
    expect(reading.record.coverage).toHaveLength(5);
  });

  it("lit un médicament ordinaire sans statut d'exception", () => {
    const reading = parseBdmItRecord(fixture("bdm-it-doliprane-3400935955838.html"), "3400935955838");
    expect(reading.kind).toBe("RECORD");
    if (reading.kind !== "RECORD") return;
    expect(reading.record.designation).toBe("DOLIPRANE 1 000 MG (PARACETAMOL)");
    expect(reading.record.isException).toBe(false);
    expect(currentCoverage(reading.record.coverage)?.end?.toISOString()).toBe("2030-05-31T00:00:00.000Z");
  });

  it("distingue un CIP inconnu du CEPS d'une fiche", () => {
    const reading = parseBdmItRecord(fixture("bdm-it-inconnu-3400900000000.html"), "3400900000000");
    expect(reading).toEqual({ kind: "UNKNOWN_CIP", cip13: "3400900000000" });
  });

  it("refuse une page qui n'est pas une fiche, et une fiche d'un autre CIP", () => {
    expect(parseBdmItRecord("<html><body>Service indisponible</body></html>", "3400936221628").kind).toBe("UNREADABLE");
    expect(parseBdmItRecord(fixture("bdm-it-forsteo-3400936221628.html"), "3400935955838").kind).toBe("UNREADABLE");
  });
});

describe("parseFrenchDate", () => {
  it("lit jj/mm/aaaa et refuse le reste", () => {
    expect(parseFrenchDate("07/09/2026")?.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(parseFrenchDate("31/02/2026")).toBeNull();
    expect(parseFrenchDate("-")).toBeNull();
    expect(parseFrenchDate("2026-09-07")).toBeNull();
  });
});
