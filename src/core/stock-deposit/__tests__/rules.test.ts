import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEPOSIT_ABANDONED_MS,
  DEPOSIT_ACCEPTED,
  DEPOSIT_AGENT_MAX_BYTES,
  DEPOSIT_CONSOLE_LABELS,
  DEPOSIT_DECISION_LABELS,
  DEPOSIT_HOLD_MIN_KNOWN,
  DEPOSIT_HOLD_RATIO,
  DEPOSIT_MAX_BYTES,
  DEPOSIT_RETENTION_DAYS,
  DEPOSIT_SOURCE_LABELS,
  DEPOSIT_STALLED_MS,
  DEPOSIT_STATUS_LABELS,
  STOCK_STALE_SOFT_DAYS,
  STOCK_STALE_STRONG_DAYS,
  assessDeposit,
  cleanDepositFileName,
  depositMaxBytes,
  depositMaxLabel,
  depositMimeType,
  depositStorageKey,
  describeDepositResult,
  isDepositStalled,
  isDepositStorageKey,
  retentionCutoff,
  stockAgeDays,
  stockReminderLevel,
  storageSafeName,
} from "../rules";
import { DEPOSIT_DECISIONS, DEPOSIT_SOURCES, DEPOSIT_STATUSES } from "../types";

const NOW = new Date("2026-10-12T10:00:00Z");
const daysAgo = (days: number, extraHours = 0) => new Date(NOW.getTime() - days * 86_400_000 - extraHours * 3_600_000);

describe("assessDeposit : appliquer, ou attendre l'équipe", () => {
  it("applique un fichier complet", () => {
    expect(assessDeposit({ validLines: 4235, knownLines: 4200 })).toEqual({ verdict: "APPLY" });
    expect(assessDeposit({ validLines: 4235, knownLines: 0 })).toEqual({ verdict: "APPLY" });
  });

  it("retient un fichier qui contient moins de 80 % du stock connu, et dit pourquoi", () => {
    expect(DEPOSIT_HOLD_RATIO).toBe(0.8);
    const verdict = assessDeposit({ validLines: 120, knownLines: 4200 });
    expect(verdict.verdict).toBe("HOLD");
    if (verdict.verdict === "HOLD") {
      expect(verdict.reason).toContain("120 lignes valides");
      expect(verdict.reason).toContain("4200");
      expect(verdict.reason).toContain("moins de 80 %");
      expect(verdict.reason).toContain("Il n'a pas été appliqué");
    }
  });

  it("un fichier qui couvre 60 % du stock (un seul rayon) attend l'équipe : il aurait vidé les 40 % restants", () => {
    expect(assessDeposit({ validLines: 600, knownLines: 1000 }).verdict).toBe("HOLD");
    expect(assessDeposit({ validLines: 799, knownLines: 1000 }).verdict).toBe("HOLD");
  });

  it("la limite est stricte : exactement 80 % passe, une ligne de moins attend", () => {
    expect(assessDeposit({ validLines: 160, knownLines: 200 })).toEqual({ verdict: "APPLY" });
    expect(assessDeposit({ validLines: 159, knownLines: 200 }).verdict).toBe("HOLD");
    // Les arrondis flottants ne déplacent pas la limite : 12 sur 15 est exactement 80 %.
    expect(assessDeposit({ validLines: 12, knownLines: 15 })).toEqual({ verdict: "APPLY" });
    expect(assessDeposit({ validLines: 4, knownLines: 5 })).toEqual({ verdict: "APPLY" });
    expect(assessDeposit({ validLines: 4000, knownLines: 5000 })).toEqual({ verdict: "APPLY" });
    expect(assessDeposit({ validLines: 3999, knownLines: 5000 }).verdict).toBe("HOLD");
  });

  it("sous 50 lignes connues, la comparaison n'a pas de sens : tout passe", () => {
    expect(DEPOSIT_HOLD_MIN_KNOWN).toBe(50);
    expect(assessDeposit({ validLines: 1, knownLines: 49 })).toEqual({ verdict: "APPLY" });
    expect(assessDeposit({ validLines: 1, knownLines: 50 }).verdict).toBe("HOLD");
  });

  it("accorde « ligne » au singulier", () => {
    const verdict = assessDeposit({ validLines: 1, knownLines: 500 });
    expect(verdict.verdict === "HOLD" && verdict.reason).toContain("1 ligne valide,");
  });

  it("un fichier lu en partie (pages illisibles, plafond) attend l'équipe, même s'il couvre tout le stock connu", () => {
    const verdict = assessDeposit({ validLines: 3700, knownLines: 3700, incompleteReason: "3 pages du fichier n'ont pas pu être lues" });
    expect(verdict.verdict).toBe("HOLD");
    if (verdict.verdict !== "HOLD") return;
    expect(verdict.reason).toContain("3 pages du fichier n'ont pas pu être lues : le stock n'a pas été appliqué.");
    // Le message prévient l'équipe de ce qu'elle déclencherait en appliquant quand même.
    expect(verdict.reason).toContain("mettrait à 0");
  });

  it("trop de lignes illisibles attend l'équipe : plus de 5 ET plus de 2 % des lignes", () => {
    // 6 sur 106 lignes : plus de 5, mais 5,7 % > 2 % : on garde.
    expect(assessDeposit({ validLines: 100, knownLines: 100, invalidLines: 6 }).verdict).toBe("HOLD");
    // 5 illisibles : toléré, même sur un petit fichier.
    expect(assessDeposit({ validLines: 20, knownLines: 20, invalidLines: 5 })).toEqual({ verdict: "APPLY" });
    // 20 sur 1 020 lignes (1,96 %) : sous 2 %, toléré.
    expect(assessDeposit({ validLines: 1000, knownLines: 1000, invalidLines: 20 })).toEqual({ verdict: "APPLY" });
    // 21 sur 1 021 (2,06 %) : trop.
    const verdict = assessDeposit({ validLines: 1000, knownLines: 1000, invalidLines: 21 });
    expect(verdict.verdict).toBe("HOLD");
    expect(verdict.verdict === "HOLD" && verdict.reason).toContain("21 lignes du fichier sont illisibles : le stock n'a pas été appliqué.");
    expect(verdict.verdict === "HOLD" && verdict.reason).toContain("mettrait à 0 les produits de ces lignes");
  });

  it("un grand fichier tolère jusqu'à 2 % de lignes illisibles : 5 000 lignes, 100 illisibles passent, 101 non", () => {
    expect(assessDeposit({ validLines: 4900, knownLines: 4900, invalidLines: 100 })).toEqual({ verdict: "APPLY" });
    expect(assessDeposit({ validLines: 4899, knownLines: 4899, invalidLines: 101 }).verdict).toBe("HOLD");
  });
});

describe("les plafonds et les délais", () => {
  it("8 Mo pour le titulaire et l'équipe, 25 Mo pour le dossier PharmaBoost du serveur", () => {
    expect(DEPOSIT_MAX_BYTES).toBe(8 * 1024 * 1024);
    expect(DEPOSIT_AGENT_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(depositMaxBytes("WEB")).toBe(DEPOSIT_MAX_BYTES);
    expect(depositMaxBytes("CONSOLE")).toBe(DEPOSIT_MAX_BYTES);
    expect(depositMaxBytes("AGENT")).toBe(DEPOSIT_AGENT_MAX_BYTES);
    expect([depositMaxLabel("WEB"), depositMaxLabel("CONSOLE"), depositMaxLabel("AGENT")]).toEqual(["8 Mo", "8 Mo", "25 Mo"]);
  });

  it("le plafond de l'agent est celui que la route de l'agent annonce (25 Mo) : le moteur ne refuse pas ce que la route accepte", () => {
    const source = readFileSync(join(process.cwd(), "src/server/services/stock-sync.ts"), "utf8");
    expect(source).toMatch(/export const AGENT_FILE_MAX_BYTES = 25 \* 1024 \* 1024;/);
    expect(DEPOSIT_AGENT_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  it("« en cours » depuis plus de 10 minutes = bloqué ; le passage quotidien referme à 15 minutes", () => {
    expect(DEPOSIT_STALLED_MS).toBe(10 * 60 * 1000);
    expect(DEPOSIT_ABANDONED_MS).toBe(15 * 60 * 1000);
    const at = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
    expect(isDepositStalled({ status: "RECEIVED", receivedAt: at(9) }, NOW)).toBe(false);
    expect(isDepositStalled({ status: "RECEIVED", receivedAt: at(10) }, NOW)).toBe(false);
    expect(isDepositStalled({ status: "RECEIVED", receivedAt: at(11) }, NOW)).toBe(true);
    // Seul un dépôt « en cours » peut être bloqué.
    for (const status of ["APPLIED", "HELD", "FAILED", "REJECTED"] as const) expect(isDepositStalled({ status, receivedAt: at(600) }, NOW), status).toBe(false);
  });
});

describe("le rappel au titulaire", () => {
  it("l'âge se compte en jours entiers ; jamais envoyé = null", () => {
    expect(stockAgeDays(null, NOW)).toBeNull();
    expect(stockAgeDays(daysAgo(0, 5), NOW)).toBe(0);
    expect(stockAgeDays(daysAgo(2, 23), NOW)).toBe(2);
    expect(stockAgeDays(daysAgo(7), NOW)).toBe(7);
    // Une horloge en avance ne donne jamais un âge négatif.
    expect(stockAgeDays(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(0);
  });

  it("rien tant que le stock est récent, doux à 3 jours, appuyé à 7", () => {
    expect([STOCK_STALE_SOFT_DAYS, STOCK_STALE_STRONG_DAYS]).toEqual([3, 7]);
    expect(stockReminderLevel(daysAgo(0), NOW)).toBe("none");
    expect(stockReminderLevel(daysAgo(2, 23), NOW)).toBe("none");
    expect(stockReminderLevel(daysAgo(3), NOW)).toBe("soft");
    expect(stockReminderLevel(daysAgo(6, 23), NOW)).toBe("soft");
    expect(stockReminderLevel(daysAgo(7), NOW)).toBe("strong");
    expect(stockReminderLevel(daysAgo(60), NOW)).toBe("strong");
  });

  it("jamais envoyé : appuyé", () => {
    expect(stockReminderLevel(null, NOW)).toBe("strong");
  });
});

describe("describeDepositResult : une phrase pour le titulaire", () => {
  it("le détail, avec les bons accords", () => {
    expect(describeDepositResult({ lines: 4235, created: 12, updated: 4190, zeroed: 33, invalid: 0 })).toBe(
      `${(4235).toLocaleString("fr-FR")} lignes lues : 12 créées, ${(4190).toLocaleString("fr-FR")} mises à jour, 33 produits absents du fichier, mis à 0.`,
    );
    expect(describeDepositResult({ lines: 10, created: 0, updated: 10, zeroed: 1, invalid: 0 })).toBe("10 lignes lues : 10 mises à jour, 1 produit absent du fichier, mis à 0.");
    expect(describeDepositResult({ lines: 1, created: 1, updated: 0, zeroed: 0, invalid: 1 })).toBe("1 ligne lue : 1 créée, 1 ignorée.");
  });

  it("sans détail, juste les lignes lues", () => {
    expect(describeDepositResult({ lines: 10, created: 0, updated: 0, zeroed: 0, invalid: 0 })).toBe("10 lignes lues.");
    expect(describeDepositResult({ lines: 10, created: null, updated: null, zeroed: null, invalid: null })).toBe("10 lignes lues.");
  });

  it("rien à dire tant que le fichier n'est pas lu", () => {
    expect(describeDepositResult({ lines: null, created: null, updated: null, zeroed: null, invalid: null })).toBe("");
  });
});

describe("la conservation du fichier", () => {
  it("90 jours exactement", () => {
    expect(DEPOSIT_RETENTION_DAYS).toBe(90);
    expect(retentionCutoff(NOW).toISOString()).toBe("2026-07-14T10:00:00.000Z");
  });
});

describe("les formats acceptés", () => {
  it("csv, txt, xlsx, xls, pdf — quelle que soit la casse, et rien d'autre", () => {
    for (const name of ["stock.csv", "STOCK.XLSX", "inventaire.pdf", "a.b.xls", "export.txt"]) expect(DEPOSIT_ACCEPTED.test(name), name).toBe(true);
    for (const name of ["stock.exe", "stock.csv.zip", "stock", "stock.json", "stock.csvx"]) expect(DEPOSIT_ACCEPTED.test(name), name).toBe(false);
  });
});

describe("le nom du fichier gardé", () => {
  it("sans chemin, sans caractère de contrôle, borné", () => {
    expect(cleanDepositFileName("C:\\Users\\Marie\\Bureau\\stock du jour.csv")).toBe("stock du jour.csv");
    expect(cleanDepositFileName("../../etc/passwd.csv")).toBe("passwd.csv");
    expect(cleanDepositFileName("stock\u0000\n.csv")).toBe("stock.csv");
    expect(cleanDepositFileName("x".repeat(500) + ".csv")).toHaveLength(200);
    expect(cleanDepositFileName("")).toBe("stock");
    expect(cleanDepositFileName("/")).toBe("stock");
  });

  it("la clé de stockage ne garde que des caractères sûrs", () => {
    expect(storageSafeName("Inventaire été 2026 (final).xlsx")).toBe("Inventaire_ete_2026_final_.xlsx");
    expect(storageSafeName("..\\..\\secret.csv")).toBe("secret.csv");
    expect(storageSafeName("....")).toBe("stock");
    expect(storageSafeName("é")).toBe("e");
  });

  it("des points consécutifs au milieu d'un nom n'en font qu'un : la clé reste relisible", () => {
    expect(storageSafeName("stock..csv")).toBe("stock.csv");
    expect(storageSafeName("a...xlsx")).toBe("a.xlsx");
    expect(storageSafeName("Inventaire 06.10..pdf")).toBe("Inventaire_06.10.pdf");
    for (const name of ["stock..csv", "a...xlsx", "Inventaire 06.10..pdf", "x....y.csv"]) {
      const key = depositStorageKey("ph_1", "dep_9", name);
      expect(isDepositStorageKey(key, "ph_1", "dep_9"), name).toBe(true);
    }
  });

  it("la clé est rangée par officine puis par dépôt", () => {
    expect(depositStorageKey("ph_1", "dep_9", "Mon stock.csv")).toBe("stock-deposits/ph_1/dep_9/Mon_stock.csv");
  });

  it("une clé relue en base n'est valable que pour CE dépôt de CETTE officine", () => {
    const key = depositStorageKey("ph_1", "dep_9", "stock.csv");
    expect(isDepositStorageKey(key, "ph_1", "dep_9")).toBe(true);
    expect(isDepositStorageKey(key, "ph_2", "dep_9")).toBe(false);
    expect(isDepositStorageKey(key, "ph_1", "dep_8")).toBe(false);
    expect(isDepositStorageKey("stock-deposits/ph_1/dep_9/../../ph_2/dep_1/x.csv", "ph_1", "dep_9")).toBe(false);
    expect(isDepositStorageKey("sales-applications/dep_9/cv.pdf", "ph_1", "dep_9")).toBe(false);
  });

  it("ce sont les segments « .. » et « . » qui sont refusés, pas la sous-chaîne : un fichier « stock..csv » déjà gardé reste relisible", () => {
    expect(isDepositStorageKey("stock-deposits/ph_1/dep_9/stock..csv", "ph_1", "dep_9")).toBe(true);
    expect(isDepositStorageKey("stock-deposits/ph_1/dep_9/a...xlsx", "ph_1", "dep_9")).toBe(true);
    expect(isDepositStorageKey("stock-deposits/ph_1/dep_9/../stock.csv", "ph_1", "dep_9")).toBe(false);
    expect(isDepositStorageKey("stock-deposits/ph_1/dep_9/./stock.csv", "ph_1", "dep_9")).toBe(false);
    expect(isDepositStorageKey("stock-deposits/ph_1/dep_9/..", "ph_1", "dep_9")).toBe(false);
  });

  it("le type du fichier suit l'extension, sinon neutre", () => {
    expect(depositMimeType("a.csv")).toBe("text/csv");
    expect(depositMimeType("a.XLSX")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(depositMimeType("a.pdf")).toBe("application/pdf");
    expect(depositMimeType("a.bin")).toBe("application/octet-stream");
  });
});

describe("les libellés", () => {
  it("chaque statut, chaque origine et chaque décision a son libellé, sans jargon", () => {
    for (const status of DEPOSIT_STATUSES) {
      expect(DEPOSIT_STATUS_LABELS[status], status).toBeTruthy();
      expect(DEPOSIT_CONSOLE_LABELS[status], status).toBeTruthy();
    }
    for (const source of DEPOSIT_SOURCES) expect(DEPOSIT_SOURCE_LABELS[source], source).toBeTruthy();
    for (const decision of DEPOSIT_DECISIONS) expect(DEPOSIT_DECISION_LABELS[decision], decision).toBeTruthy();
    const titulaire = Object.values(DEPOSIT_STATUS_LABELS).join(" ");
    expect(titulaire).not.toMatch(/agent|appairage|CIP|import job/i);
  });
});

describe("assessDeposit : un passage à zéro massif ne se fait pas sans contrôle", () => {
  const base = { validLines: 900, knownLines: 1000 };

  it("100 produits connus absents sur 1 000 (10 %) : le fichier attend la décision de l'équipe", () => {
    const verdict = assessDeposit({ ...base, absentLines: 100 });
    expect(verdict.verdict).toBe("HOLD");
    expect(verdict.verdict === "HOLD" && verdict.reason).toMatch(/mettrait 100 produits à 0 \(10 % du stock connu\)/);
  });

  it("à 5 % ou moins, ou à 25 produits ou moins : appliqué", () => {
    expect(assessDeposit({ ...base, absentLines: 50 }).verdict).toBe("APPLY"); // 5 % exactement
    expect(assessDeposit({ validLines: 180, knownLines: 200, absentLines: 20 }).verdict).toBe("APPLY"); // 10 %, mais 20 produits seulement
    expect(assessDeposit({ ...base, absentLines: 0 }).verdict).toBe("APPLY");
  });

  it("les trois contrôles d'avant restent prioritaires", () => {
    expect(assessDeposit({ validLines: 600, knownLines: 1000, absentLines: 400 }).verdict === "HOLD" && (assessDeposit({ validLines: 600, knownLines: 1000, absentLines: 400 }) as { reason: string }).reason).toMatch(/moins de 80 %/);
    expect((assessDeposit({ ...base, incompleteReason: "Pages illisibles", absentLines: 100 }) as { reason: string }).reason).toMatch(/Pages illisibles/);
  });

  it("un petit stock connu (moins de 50 produits) n'est pas concerné", () => {
    expect(assessDeposit({ validLines: 30, knownLines: 40, absentLines: 30 }).verdict).toBe("APPLY");
  });

  it("sans compte des absents (une décision déjà prise), le comportement est celui d'avant", () => {
    expect(assessDeposit(base).verdict).toBe("APPLY");
  });
});
