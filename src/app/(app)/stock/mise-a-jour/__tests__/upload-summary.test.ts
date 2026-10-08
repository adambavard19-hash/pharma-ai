import { describe, expect, it } from "vitest";
import { uploadSummary } from "../view";
import type { DepositView } from "@/core/stock-deposit/types";

const NOW = new Date("2026-10-08T12:00:00Z");

const deposit = (extra: Partial<DepositView> = {}): DepositView => ({
  id: "dep_1",
  pharmacyId: "ph_1",
  fileName: "stock.csv",
  fileSize: 100,
  status: "APPLIED",
  source: "WEB",
  lines: 4306,
  created: 0,
  updated: 4306,
  invalid: 0,
  zeroed: 0,
  knownLines: 4300,
  message: null,
  receivedAt: new Date("2026-10-08T11:59:00Z"),
  appliedAt: new Date("2026-10-08T11:59:30Z"),
  decidedAt: null,
  hasFile: true,
  stalled: false,
  ...extra,
});

describe("la confirmation de l'envoi du stock", () => {
  it("un stock appliqué dit le nombre de produits et la date", () => {
    const outcome = uploadSummary({ ok: true, data: deposit() }, NOW);
    expect(outcome.tone).toBe("success");
    expect(outcome.title).toBe("Stock reçu");
    expect(outcome.detail).toMatch(/^4\s?306 produits · aujourd'hui à \d\d:\d\d\.$/);
  });

  it("un seul produit : au singulier", () => {
    expect(uploadSummary({ ok: true, data: deposit({ lines: 1 }) }, NOW).detail).toMatch(/^1 produit · /);
  });

  it("les lignes illisibles sont dites, et la confirmation devient un avertissement", () => {
    const outcome = uploadSummary({ ok: true, data: deposit({ invalid: 12 }) }, NOW);
    expect(outcome.tone).toBe("warning");
    expect(outcome.detail).toMatch(/12 lignes illisibles ignorées\.$/);
  });

  it("un fichier en vérification dit que le stock n'a pas changé — jamais « reçu »", () => {
    const outcome = uploadSummary({ ok: true, data: deposit({ status: "HELD", appliedAt: null }) }, NOW);
    expect(outcome.tone).toBe("warning");
    expect(outcome.title).not.toBe("Stock reçu");
    expect(outcome.detail).toMatch(/n'a pas changé/);
  });

  it("un fichier illisible ou un refus du serveur : l'erreur, et le stock n'est pas mis à jour", () => {
    const outcome = uploadSummary({ ok: false, error: "Le fichier n'a pas pu être lu." }, NOW);
    expect(outcome).toMatchObject({ tone: "danger", detail: "Le fichier n'a pas pu être lu." });
    expect(outcome.title).toMatch(/n'a pas été mis à jour/);
  });
});
