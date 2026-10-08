import { describe, expect, it } from "vitest";
import { DEPOSIT_MAX_BYTES, describeDepositResult } from "@/core/stock-deposit/rules";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import type { DepositView } from "@/core/stock-deposit/types";
import {
  HELD_NOTICE,
  INTERRUPTED_LINE,
  REJECTED_NOTICE,
  UNVERIFIED_NOTICE,
  ZERO_ABSENT_NOTICE,
  checkDepositFile,
  depositBadge,
  describeDepositLine,
  describeReceived,
  exportGuide,
  formatFileSize,
  linesOfLastStock,
  sendOutcome,
  stockState,
} from "../view";

/** La page « Mettre à jour mon stock » : ce qui se décide sans écran. */

const NOW = new Date("2026-10-05T10:00:00Z"); // 12:00 à Paris
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const norm = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");

const deposit = (overrides: Partial<DepositView> = {}): DepositView => ({
  id: "d1",
  pharmacyId: "ph-1",
  fileName: "stock.csv",
  fileSize: 1000,
  status: "APPLIED",
  source: "WEB",
  lines: 4235,
  created: 12,
  updated: 4190,
  invalid: 0,
  zeroed: 33,
  knownLines: 4200,
  message: null,
  receivedAt: ago(HOUR),
  appliedAt: ago(HOUR),
  decidedAt: null,
  hasFile: true,
  stalled: false,
  ...overrides,
});

describe("les étapes selon le logiciel", () => {
  it("LGPI : la procédure vérifiée en officine, sans mention honnête d'étapes à venir", () => {
    const guide = exportGuide("lgpi");
    expect(guide.name).toBe("LGPI");
    expect(guide.verified).toBe(true);
    expect(guide.notice).toBeNull();
    expect(guide.menuSteps).toHaveLength(2);
    expect(guide.menuSteps[0]).toContain("module Inventaire");
    expect(guide.menuSteps[1]).toContain("Prix de vente");
    expect(guide.saveHint).toContain("(F9)");
  });

  it("un autre logiciel : texte générique et aucun menu inventé", () => {
    for (const id of ["smart-rx", "pharmaland", "winpharma", "leo", "autre"]) {
      const guide = exportGuide(id);
      expect(guide.verified).toBe(false);
      expect(guide.notice).toBe(UNVERIFIED_NOTICE);
      expect(guide.saveHint).toBeNull();
      expect(guide.menuSteps).toHaveLength(1);
      expect(guide.menuSteps[0]).toContain("lancez l'export ou l'édition du stock");
      expect(guide.menuSteps[0]).not.toContain("Inventaire");
    }
    expect(exportGuide("winpharma").name).toBe("Winpharma");
  });

  it("un logiciel inconnu ou absent se dit « votre logiciel »", () => {
    expect(exportGuide("autre").name).toBe("votre logiciel");
    expect(exportGuide(null).name).toBe("votre logiciel");
    expect(exportGuide("inconnu").name).toBe("votre logiciel");
  });

  it("l'étape 1 ne reprend ni l'enregistrement ni la relecture (étapes 2 et 3), ni jargon", () => {
    for (const lgo of LGO_DEFINITIONS) {
      const text = exportGuide(lgo.id).menuSteps.join(" ");
      expect(text, lgo.id).not.toMatch(/enregistrez|relit|PharmaBoost Connect/i);
      expect(text, lgo.id).not.toMatch(/\bCIP\b|agent|appairage|facteur/i);
    }
  });
});

describe("« reçu aujourd'hui à 08:42 »", () => {
  it("aujourd'hui, hier, ou la date — à l'heure de Paris", () => {
    expect(describeReceived(new Date("2026-10-05T06:42:00Z"), NOW)).toBe("aujourd'hui à 08:42");
    expect(describeReceived(new Date("2026-10-04T19:10:00Z"), NOW)).toBe("hier à 21:10");
    expect(describeReceived(new Date("2026-10-02T06:42:00Z"), NOW)).toBe("le 02/10/2026 à 08:42");
  });

  it("minuit se juge à Paris, pas en UTC : 23:30 UTC la veille est déjà « aujourd'hui » à Paris", () => {
    expect(describeReceived(new Date("2026-10-04T22:30:00Z"), NOW)).toBe("aujourd'hui à 00:30");
  });
});

describe("l'état du stock, en grand", () => {
  it("jamais reçu : une phrase neutre qui renvoie aux étapes", () => {
    const state = stockState({ syncedAt: null, lines: null, now: NOW });
    expect(state).toEqual({ tone: "neutral", title: "Aucun stock reçu pour l'instant", detail: "Suivez les trois étapes ci-dessous : une minute suffit." });
  });

  it("à jour : vert, avec l'heure et le nombre de lignes", () => {
    const state = stockState({ syncedAt: new Date("2026-10-05T06:42:00Z"), lines: 4235, now: NOW });
    expect(state.tone).toBe("success");
    expect(state.title).toBe("Votre stock est à jour");
    expect(norm(state.detail)).toBe("Reçu aujourd'hui à 08:42 (4 235 lignes)");
  });

  it("à jour sans le chiffre : on ne l'invente pas", () => {
    expect(stockState({ syncedAt: ago(2 * HOUR), lines: null, now: NOW }).detail).not.toContain("ligne");
  });

  it("deux jours : encore à jour ; trois jours : orange", () => {
    expect(stockState({ syncedAt: ago(2 * DAY), lines: null, now: NOW }).tone).toBe("success");
    const old = stockState({ syncedAt: ago(5 * DAY), lines: 4235, now: NOW });
    expect(old.tone).toBe("warning");
    expect(old.title).toBe("Votre stock date de 5 jours");
    expect(norm(old.detail)).toContain("Dernier stock reçu le 30/09/2026");
    expect(norm(old.detail)).toContain("(4 235 lignes)");
    expect(stockState({ syncedAt: ago(3 * DAY), lines: null, now: NOW }).title).toBe("Votre stock date de 3 jours");
  });
});

describe("le nombre de lignes du dernier stock", () => {
  const syncedAt = new Date("2026-10-05T06:42:00Z");

  it("celui du dépôt qui a produit ce stock", () => {
    expect(linesOfLastStock(syncedAt, [deposit({ appliedAt: new Date("2026-10-05T06:42:03Z"), lines: 4235 })])).toBe(4235);
  });

  it("jamais celui d'un dépôt plus ancien : le stock a été mis à jour autrement depuis", () => {
    expect(linesOfLastStock(syncedAt, [deposit({ appliedAt: new Date("2026-10-03T06:42:00Z"), receivedAt: new Date("2026-10-03T06:41:00Z") })])).toBeNull();
  });

  it("ignore un dépôt non appliqué, et ne répond rien sans stock reçu", () => {
    expect(linesOfLastStock(syncedAt, [deposit({ status: "HELD", appliedAt: null, receivedAt: new Date("2026-10-05T06:42:00Z") })])).toBeNull();
    expect(linesOfLastStock(null, [deposit()])).toBeNull();
    expect(linesOfLastStock(syncedAt, [])).toBeNull();
  });
});

describe("le contrôle du fichier avant l'envoi", () => {
  it("accepte un CSV, un Excel, un PDF d'inventaire, quelle que soit la casse", () => {
    for (const name of ["stock.csv", "STOCK.XLSX", "inventaire.pdf", "stock.xls", "export.txt"]) expect(checkDepositFile({ name, size: 1000 })).toBeNull();
  });

  it("refuse un fichier vide, d'un autre format, ou trop gros — en le disant", () => {
    expect(checkDepositFile({ name: "stock.csv", size: 0 })).toBe("Ce fichier est vide.");
    expect(checkDepositFile({ name: "photo.jpg", size: 1000 })).toBe("Ce format n'est pas lu. Formats acceptés : CSV, Excel (.xlsx) ou PDF d'inventaire.");
    expect(checkDepositFile({ name: "stock.csv", size: DEPOSIT_MAX_BYTES + 1 })).toContain("le maximum est de 8 Mo");
    expect(checkDepositFile({ name: "stock.csv", size: DEPOSIT_MAX_BYTES })).toBeNull();
  });

  it("la taille se lit : Ko ou Mo à la française", () => {
    expect(formatFileSize(300)).toBe("1 Ko");
    expect(formatFileSize(812 * 1024)).toBe("812 Ko");
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2,4 Mo");
  });
});

describe("la réponse du serveur, dite au titulaire", () => {
  it("réussi : « votre stock est à jour » et le détail lu", () => {
    const outcome = sendOutcome({ ok: true, data: deposit() });
    expect(outcome.tone).toBe("success");
    expect(outcome.title).toBe("Votre stock est à jour");
    expect(norm(outcome.detail ?? "")).toBe(norm(describeDepositResult(deposit())));
    expect(norm(outcome.detail ?? "")).toContain("4 235 lignes lues : 12 créées, 4 190 mises à jour, 33 ");
  });

  it("en vérification : la phrase du cahier des charges, stock inchangé, « stock complet »", () => {
    const outcome = sendOutcome({ ok: true, data: deposit({ status: "HELD", message: "raison interne" }) });
    expect(outcome.tone).toBe("warning");
    expect(outcome.detail).toBe(HELD_NOTICE);
    expect(HELD_NOTICE).toContain("vérifie votre fichier avant de l'appliquer");
    expect(HELD_NOTICE).toContain("votre stock n'a pas changé");
    expect(HELD_NOTICE).toContain("stock complet");
    // La raison de la console n'est pas pour le titulaire.
    expect(outcome.detail).not.toContain("raison interne");
  });

  it("non lu : la raison, et le stock n'a pas changé", () => {
    const outcome = sendOutcome({ ok: true, data: deposit({ status: "FAILED", message: "Colonnes non reconnues : quantité." }) });
    expect(outcome.tone).toBe("danger");
    expect(outcome.detail).toBe("Colonnes non reconnues : quantité. Votre stock n'a pas changé.");
    expect(sendOutcome({ ok: true, data: deposit({ status: "FAILED", message: null }) }).detail).toBe("Le fichier n'a pas pu être lu. Votre stock n'a pas changé.");
  });

  it("écarté, ou encore en lecture", () => {
    expect(sendOutcome({ ok: true, data: deposit({ status: "REJECTED" }) }).tone).toBe("neutral");
    expect(sendOutcome({ ok: true, data: deposit({ status: "RECEIVED" }) }).tone).toBe("info");
  });

  it("refusé par le serveur : l'erreur lisible telle quelle", () => {
    expect(sendOutcome({ ok: false, error: "Choisissez un fichier." })).toEqual({ tone: "danger", title: "Votre stock n'a pas été mis à jour", detail: "Choisissez un fichier." });
  });
});

describe("vos derniers envois", () => {
  it("chaque état se résume en une ligne, sans jargon", () => {
    expect(norm(describeDepositLine(deposit()))).toBe(norm(describeDepositResult(deposit())));
    expect(norm(describeDepositLine(deposit()))).toContain("4 235 lignes lues : 12 créées, 4 190 mises à jour, 33 ");
    expect(describeDepositLine(deposit({ lines: null, created: null, updated: null, zeroed: null, invalid: null }))).toBe("Stock mis à jour.");
    expect(describeDepositLine(deposit({ status: "RECEIVED" }))).toBe("Lecture en cours…");
    expect(describeDepositLine(deposit({ status: "HELD", message: "Le fichier contient 12 lignes valides…" }))).toBe("L'équipe PharmaBoost le vérifie avant de l'appliquer.");
    expect(describeDepositLine(deposit({ status: "FAILED", message: "Colonnes non reconnues : quantité." }))).toBe("Colonnes non reconnues : quantité.");
    expect(describeDepositLine(deposit({ status: "FAILED", message: null }))).toBe("Le fichier n'a pas pu être lu.");
    expect(describeDepositLine(deposit({ status: "REJECTED" }))).toBe("Écarté par l'équipe PharmaBoost.");
  });
});

describe("un envoi dont la lecture s'est interrompue", () => {
  it("la ligne le dit au lieu de « lecture en cours »", () => {
    expect(describeDepositLine(deposit({ status: "RECEIVED", stalled: true }))).toBe("Lecture interrompue, renvoyez votre fichier.");
    expect(describeDepositLine(deposit({ status: "RECEIVED", stalled: false }))).toBe("Lecture en cours…");
  });

  it("la pastille aussi : orange « Lecture interrompue », pas le bleu « Reçu, en cours de lecture »", () => {
    expect(depositBadge(deposit({ status: "RECEIVED", stalled: true }))).toEqual({ tone: "warning", label: "Lecture interrompue" });
    expect(depositBadge(deposit({ status: "RECEIVED", stalled: false }))).toEqual({ tone: "info", label: "Reçu, en cours de lecture" });
  });

  it("les autres états gardent leur pastille", () => {
    expect(depositBadge(deposit({ status: "APPLIED" }))).toEqual({ tone: "success", label: "Stock à jour" });
    expect(depositBadge(deposit({ status: "HELD" }))).toEqual({ tone: "warning", label: "En vérification par l'équipe PharmaBoost" });
    expect(depositBadge(deposit({ status: "FAILED" }))).toEqual({ tone: "danger", label: "Fichier non lu, stock inchangé" });
    expect(depositBadge(deposit({ status: "REJECTED" }))).toEqual({ tone: "neutral", label: "Fichier écarté, stock inchangé" });
    // « interrompue » ne concerne qu'une lecture : un fichier appliqué reste appliqué.
    expect(depositBadge(deposit({ status: "APPLIED", stalled: true })).label).toBe("Stock à jour");
  });
});

describe("ce que le titulaire sait avant d'envoyer", () => {
  it("le rappel dit que ce qui n'est pas dans le fichier sera mis à 0", () => {
    expect(ZERO_ABSENT_NOTICE).toBe("Ce qui n'est pas dans le fichier sera mis à 0 en stock.");
  });

  it("un fichier écarté a sa phrase : rien n'a changé, envoyez le stock complet", () => {
    expect(REJECTED_NOTICE).toBe("L'équipe PharmaBoost n'a pas appliqué votre dernier fichier. Votre stock n'a pas changé. Envoyez votre stock complet.");
  });

  it("aucune de ces phrases ne parle d'agent, d'appairage ou de CIP", () => {
    for (const notice of [ZERO_ABSENT_NOTICE, REJECTED_NOTICE, HELD_NOTICE, INTERRUPTED_LINE]) {
      expect(notice).not.toMatch(/\bagent\b|appairage|facteur|\bCIP\b/i);
    }
  });
});
