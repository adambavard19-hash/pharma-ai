import { describe, expect, it, vi } from "vitest";
import { DEPOSIT_MAX_BYTES, describeDepositResult } from "@/core/stock-deposit/rules";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import type { DepositView } from "@/core/stock-deposit/types";
import {
  FOLDER_FALLBACK_NOTICE,
  FOLDER_LOCATION_NOTICE,
  FOLDER_SHORTCUT_NOTICE,
  FULL_STOCK_REMINDER,
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
  isFolderReady,
  isStillExpected,
  linesOfLastStock,
  receiveState,
  receiveText,
  sendOutcome,
  shouldPoll,
  sharedFolderPath,
  stockState,
  submitDeposit,
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

describe("le dossier PharmaBoost", () => {
  it("le partage du serveur quand on le connaît, sinon le dossier d'installation", () => {
    expect(sharedFolderPath("SRV-PHARMA")).toBe("\\\\SRV-PHARMA\\PharmaBoost");
    expect(sharedFolderPath("  SRV-PHARMA  ")).toBe("\\\\SRV-PHARMA\\PharmaBoost");
    expect(sharedFolderPath("\\\\SRV\\")).toBe("\\\\SRV\\PharmaBoost");
    expect(sharedFolderPath(null)).toBe("C:\\PharmaBoost\\Export");
    expect(sharedFolderPath("")).toBe("C:\\PharmaBoost\\Export");
  });

  it("le dossier n'existe qu'une fois le serveur relié", () => {
    expect(isFolderReady(null)).toBe(false);
    expect(isFolderReady({ status: "PENDING" })).toBe(false);
    expect(isFolderReady({ status: "DISCONNECTED" })).toBe(false);
    expect(isFolderReady({ status: "CONNECTED" })).toBe(true);
    expect(isFolderReady({ status: "ERROR" })).toBe(true);
  });
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

describe("le statut en direct de l'étape 3", () => {
  const known = { id: "d1", status: "APPLIED" as const };

  it("rien de nouveau depuis l'ouverture : on attend", () => {
    expect(receiveState(null, null)).toBe("waiting");
    expect(receiveState(known, known)).toBe("waiting");
  });

  it("un nouveau dépôt : lecture, puis stock à jour — sans jamais confondre avec l'ancien", () => {
    expect(receiveState(known, { id: "d2", status: "RECEIVED" })).toBe("reading");
    expect(receiveState(known, { id: "d2", status: "APPLIED" })).toBe("done");
    expect(receiveState(null, { id: "d2", status: "APPLIED" })).toBe("done");
  });

  it("en vérification, non lu, écarté : chacun son état, jamais « à jour »", () => {
    expect(receiveState(known, { id: "d2", status: "HELD" })).toBe("held");
    expect(receiveState(known, { id: "d2", status: "FAILED" })).toBe("failed");
    expect(receiveState(known, { id: "d2", status: "REJECTED" })).toBe("rejected");
  });

  it("un dépôt déjà en lecture à l'ouverture est celui qu'on attend : il finit en « à jour »", () => {
    const reading = { id: "d2", status: "RECEIVED" as const };
    expect(receiveState(reading, reading)).toBe("reading");
    expect(receiveState(reading, { id: "d2", status: "APPLIED" })).toBe("done");
  });

  it("la page se rafraîchit seule tant que le stock n'est pas à jour — y compris après une vérification, un échec ou un écart", () => {
    for (const state of ["waiting", "reading", "interrupted", "held", "failed", "rejected"] as const) expect(isStillExpected(state), state).toBe(true);
    expect(isStillExpected("done")).toBe(false);
  });

  it("un même dépôt dont le statut change est une nouveauté : le fichier en vérification ou en échec à l'ouverture, ensuite appliqué par l'équipe", () => {
    expect(receiveState({ id: "d1", status: "HELD" }, { id: "d1", status: "HELD" })).toBe("waiting");
    expect(receiveState({ id: "d1", status: "HELD" }, { id: "d1", status: "APPLIED" })).toBe("done");
    expect(receiveState({ id: "d1", status: "FAILED" }, { id: "d1", status: "APPLIED" })).toBe("done");
    expect(receiveState({ id: "d1", status: "HELD" }, { id: "d1", status: "REJECTED" })).toBe("rejected");
  });

  it("après un échec, le dépôt suivant est bien « nouveau » : appliqué, il passe au vert", () => {
    const failed = { id: "d2", status: "FAILED" as const };
    expect(receiveState(known, failed)).toBe("failed");
    expect(receiveState(known, { id: "d3", status: "APPLIED" })).toBe("done");
  });

  it("une lecture restée bloquée ne tourne pas à vie : « interrompue »", () => {
    expect(receiveState(known, { id: "d2", status: "RECEIVED", stalled: true })).toBe("interrupted");
    expect(receiveState({ id: "d2", status: "RECEIVED" }, { id: "d2", status: "RECEIVED", stalled: true })).toBe("interrupted");
    expect(receiveState(known, { id: "d2", status: "RECEIVED", stalled: false })).toBe("reading");
  });

  it("qui interroge le serveur : tout sauf « à jour » et l'abandon ; sans dossier, seulement un fichier réellement envoyé", () => {
    const folder = { folderReady: true, gaveUp: false };
    const noFolder = { folderReady: false, gaveUp: false };
    for (const state of ["waiting", "reading", "interrupted", "held", "failed", "rejected"] as const) expect(shouldPoll(state, folder), `dossier ${state}`).toBe(true);
    expect(shouldPoll("done", folder)).toBe(false);

    expect(shouldPoll("waiting", noFolder)).toBe(false);
    for (const state of ["reading", "interrupted", "held", "failed", "rejected"] as const) expect(shouldPoll(state, noFolder), `sans dossier ${state}`).toBe(true);
    expect(shouldPoll("done", noFolder)).toBe(false);

    for (const state of ["waiting", "reading", "held", "failed"] as const) expect(shouldPoll(state, { folderReady: true, gaveUp: true }), `abandon ${state}`).toBe(false);
  });

  it("les phrases : jamais de jargon, le nombre de lignes quand on le connaît", () => {
    const options = { folderReady: true, gaveUp: false };
    expect(norm(receiveText("done", { lines: 4235 }, options))).toBe("Fichier reçu : 4 235 lignes, stock à jour.");
    expect(receiveText("done", { lines: 1 }, options)).toBe("Fichier reçu : 1 ligne, stock à jour.");
    expect(receiveText("done", { lines: null }, options)).toBe("Fichier reçu, stock à jour.");
    expect(receiveText("reading", null, options)).toContain("lecture en cours");
    expect(receiveText("held", null, options)).toContain("l'équipe PharmaBoost le vérifie");
    expect(receiveText("failed", null, options)).toContain("Votre stock n'a pas changé");
    expect(receiveText("waiting", null, options)).toContain("En attente de votre fichier");
  });

  it("sans dossier, on n'attend rien tout seul ; après l'abandon de l'attente, on le dit", () => {
    expect(receiveText("waiting", null, { folderReady: false, gaveUp: false })).toContain("Quand vous envoyez votre fichier ci-dessous");
    expect(receiveText("waiting", null, { folderReady: true, gaveUp: true })).toContain("Rechargez la page");
  });

  it("une lecture interrompue : « Lecture interrompue, renvoyez votre fichier » — sans promettre que le stock n'a pas changé", () => {
    const text = receiveText("interrupted", null, { folderReady: true, gaveUp: false });
    expect(text).toBe("Lecture interrompue, renvoyez votre fichier.");
    expect(text).toBe(INTERRUPTED_LINE);
    expect(text).not.toContain("n'a pas changé");
  });

  it("après l'abandon, chaque état garde sa phrase et ajoute l'invitation à recharger", () => {
    const gaveUp = { folderReady: true, gaveUp: true };
    for (const state of ["held", "failed", "rejected", "interrupted"] as const) {
      const text = receiveText(state, null, gaveUp);
      expect(text, state).toContain(receiveText(state, null, { folderReady: true, gaveUp: false }));
      expect(text, state).toContain("Rechargez la page pour vérifier de nouveau.");
    }
    expect(receiveText("reading", null, gaveUp)).toContain("La lecture prend plus de temps que prévu. Rechargez la page");
    expect(receiveText("reading", null, gaveUp)).not.toContain("lecture en cours");
    // Un stock à jour n'a rien à recharger.
    expect(receiveText("done", { lines: 3 }, gaveUp)).not.toContain("Rechargez");
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

describe("l'envoi, du fichier choisi à la phrase affichée", () => {
  const file = (name = "stock.csv", content = "cip;qte\n1;2") => new File([content], name);

  it("envoie le fichier dans le champ « file » et rend l'issue", async () => {
    const send = vi.fn(async (body: FormData) => {
      expect((body.get("file") as File).name).toBe("stock.csv");
      return { ok: true as const, data: deposit() };
    });
    const result = await submitDeposit(file(), send);
    expect(send).toHaveBeenCalledOnce();
    expect(result.sent).toBe(true);
    expect(result.outcome.tone).toBe("success");
  });

  it("un fichier refusé par le contrôle ne part pas", async () => {
    const send = vi.fn();
    const result = await submitDeposit(file("photo.jpg"), send);
    expect(send).not.toHaveBeenCalled();
    expect(result.sent).toBe(false);
    expect(result.outcome.detail).toContain("Ce format n'est pas lu");
  });

  it("en vérification : parti (la zone se vide), mais jamais présenté comme réussi", async () => {
    const result = await submitDeposit(file(), async () => ({ ok: true as const, data: deposit({ status: "HELD" }) }));
    expect(result.sent).toBe(true);
    expect(result.outcome.tone).toBe("warning");
  });

  it("une erreur du serveur : le fichier reste choisi, pour réessayer", async () => {
    const result = await submitDeposit(file(), async () => ({ ok: false as const, error: "Trop d'envois aujourd'hui." }));
    expect(result.sent).toBe(false);
    expect(result.outcome.detail).toBe("Trop d'envois aujourd'hui.");
  });

  it("une panne réseau ne devient jamais une exception à l'écran", async () => {
    const result = await submitDeposit(file(), async () => {
      throw new Error("fetch failed");
    });
    expect(result.sent).toBe(false);
    expect(result.outcome.tone).toBe("danger");
    expect(result.outcome.detail).toBe("L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez.");
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
  it("le rappel « stock complet » dit que ce qui n'est pas dans le fichier sera mis à 0", () => {
    expect(ZERO_ABSENT_NOTICE).toBe("Ce qui n'est pas dans le fichier sera mis à 0 en stock.");
    expect(FULL_STOCK_REMINDER).toContain("Envoyez toujours votre stock complet (tous les produits en stock), pas seulement ce qui vient d'arriver.");
    expect(FULL_STOCK_REMINDER).toContain(ZERO_ABSENT_NOTICE);
  });

  it("un fichier écarté a sa phrase : rien n'a changé, envoyez le stock complet", () => {
    expect(REJECTED_NOTICE).toBe("L'équipe PharmaBoost n'a pas appliqué votre dernier fichier. Votre stock n'a pas changé. Envoyez votre stock complet.");
  });

  it("le dossier : où il se trouve, le raccourci du serveur, et le repli par l'envoi du fichier — sans jargon", () => {
    expect(FOLDER_LOCATION_NOTICE).toBe("Le dossier PharmaBoost se trouve sur le serveur de l'officine :");
    expect(FOLDER_SHORTCUT_NOTICE).toBe("Sur le serveur, un raccourci « Stock PharmaBoost » est posé sur le bureau.");
    expect(FOLDER_FALLBACK_NOTICE).toBe("Ce chemin ne s'ouvre pas ? Pas de souci : envoyez le fichier avec le bouton ci-dessous, c'est tout aussi bon.");
    for (const notice of [FOLDER_LOCATION_NOTICE, FOLDER_SHORTCUT_NOTICE, FOLDER_FALLBACK_NOTICE, FULL_STOCK_REMINDER, REJECTED_NOTICE, INTERRUPTED_LINE]) {
      expect(notice).not.toMatch(/\bagent\b|appairage|facteur|\bCIP\b/i);
    }
  });
});

