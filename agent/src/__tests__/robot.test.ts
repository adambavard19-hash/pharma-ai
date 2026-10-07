import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrossSourceDedupe, LineBuffer, compileRobotPattern, dryRunRobotFile, extractRobotCodes, startRobotJournal } from "../robot";

/**
 * Le branchement du robot ne connaît AUCUN protocole : il lit la fin d'un fichier et en
 * extrait des codes produit désignés par une expression écrite par le technicien. Ces tests
 * vérifient ce mécanisme sur des lignes de FORME LIBRE, inventées pour l'essai : ils ne disent
 * rien du format réel d'un journal BD Rowa ou LGPI, qu'il faut d'abord observer en officine.
 */

const dirs: string[] = [];
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pb-robot-"));
  dirs.push(dir);
});
afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const compile = (pattern: string) => {
  const result = compileRobotPattern(pattern);
  if (!result.ok) throw new Error(result.error);
  return result.regex;
};

describe("l'expression qui désigne le code produit", () => {
  it("accepte une expression avec un groupe de capture", () => {
    expect(compileRobotPattern("article=(\\d{13})").ok).toBe(true);
  });

  it("refuse le vide, une expression illisible, et une expression sans groupe de capture", () => {
    expect(compileRobotPattern("  ")).toMatchObject({ ok: false });
    expect(compileRobotPattern("(\\d{13}")).toMatchObject({ ok: false, error: expect.stringContaining("illisible") });
    expect(compileRobotPattern("\\d{13}")).toMatchObject({ ok: false, error: expect.stringContaining("groupe de capture") });
  });
});

describe("les codes d'une ligne", () => {
  it("rend le code capturé quand il a la forme d'un code-barres de boîte", () => {
    expect(extractRobotCodes("sortie article=3400930000001 qte=2", compile("article=(\\d+)"))).toEqual(["3400930000001"]);
    expect(extractRobotCodes("cip 3400930", compile("cip (\\d+)"))).toEqual(["3400930"]);
  });

  it("jette ce qui n'a pas la forme d'un code de boîte : numéro de sécurité sociale (15 chiffres), numéro trop court", () => {
    const regex = compile("n=(\\d+)");
    expect(extractRobotCodes("n=185057800608436", regex)).toEqual([]);
    expect(extractRobotCodes("n=42", regex)).toEqual([]);
  });

  it("MAIS un nombre de 7 ou 8 chiffres a la forme d'un CIP7 ou d'un EAN8 : l'expression doit être précise, ancrée sur un mot du journal", () => {
    expect(extractRobotCodes("n=20261007", compile("n=(\\d+)"))).toEqual(["20261007"]);
    expect(extractRobotCodes("date=20261007 article=3400930000001", compile("article=(\\d+)"))).toEqual(["3400930000001"]);
  });

  it("une ligne à plusieurs produits les rend tous, une fois chacun, dans l'ordre", () => {
    expect(extractRobotCodes("A:3400930000001 B:3400930000002 A:3400930000001", compile("[AB]:(\\d{13})"))).toEqual(["3400930000001", "3400930000002"]);
  });

  it("une expression qui peut capturer du vide ne boucle pas", () => {
    expect(extractRobotCodes("rien ici", compile("(\\d{13})?"))).toEqual([]);
  });

  it("extrait le CIP13 d'un Datamatrix GS1", () => {
    expect(extractRobotCodes("dm=01034009300000011721103110ABC", compile("dm=(\\S+)"))).toEqual(["3400930000001"]);
  });
});

describe("la lecture par morceaux", () => {
  it("ne rend une ligne que complète : le reste attend le morceau suivant", () => {
    const buffer = new LineBuffer();
    expect(buffer.push("première\nsecon")).toEqual(["première"]);
    expect(buffer.push("de\r\ntroisième")).toEqual(["seconde"]);
    expect(buffer.push("\n")).toEqual(["troisième"]);
  });

  it("un journal d'un seul tenant, sans fin de ligne, ne grossit pas sans fin", () => {
    const buffer = new LineBuffer();
    for (let i = 0; i < 40; i += 1) buffer.push("x".repeat(10_000));
    expect(buffer.push("\n")[0]?.length).toBeLessThan(80_000);
  });
});

describe("la surveillance du fichier", () => {
  const start = (pattern = "article=(\\d{13})") => {
    const path = join(dir, "robot.log");
    const scans: string[] = [];
    const statuses: string[] = [];
    const stop = startRobotJournal({ kind: "journal", path, pattern }, { onScan: (code) => scans.push(code), onStatus: (message) => statuses.push(message) });
    return { path, scans, statuses, stop };
  };

  it("part de la fin : l'historique du robot n'est jamais rejoué", async () => {
    vi.useFakeTimers();
    const path = join(dir, "robot.log");
    writeFileSync(path, "article=3400930000001\narticle=3400930000002\n");
    const scans: string[] = [];
    const stop = startRobotJournal({ kind: "journal", path, pattern: "article=(\\d{13})" }, { onScan: (code) => scans.push(code), onStatus: () => undefined });
    await vi.advanceTimersByTimeAsync(3000);
    expect(scans).toEqual([]);
    appendFileSync(path, "article=3400930000003\n");
    await vi.advanceTimersByTimeAsync(1500);
    expect(scans).toEqual(["3400930000003"]);
    stop();
  });

  it("une ligne écrite en deux fois n'est lue qu'une fois complète, et une seule fois", async () => {
    vi.useFakeTimers();
    const { path, scans, stop } = start();
    writeFileSync(path, "");
    await vi.advanceTimersByTimeAsync(1500);
    appendFileSync(path, "article=34009300");
    await vi.advanceTimersByTimeAsync(1500);
    expect(scans).toEqual([]);
    appendFileSync(path, "00004\n");
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(3000);
    expect(scans).toEqual(["3400930000004"]);
    stop();
  });

  it("un fichier qui rétrécit (rotation) est relu depuis le début", async () => {
    vi.useFakeTimers();
    const { path, scans, stop } = start();
    writeFileSync(path, "x".repeat(500) + "\n");
    await vi.advanceTimersByTimeAsync(1500);
    writeFileSync(path, "article=3400930000005\n");
    await vi.advanceTimersByTimeAsync(1500);
    expect(scans).toEqual(["3400930000005"]);
    stop();
  });

  it("un fichier absent est attendu, dit une fois, sans bruit ni erreur", async () => {
    vi.useFakeTimers();
    const { statuses, scans, stop } = start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(statuses.filter((message) => message.includes("n'existe pas"))).toHaveLength(1);
    expect(scans).toEqual([]);
    stop();
  });

  it("une expression inutilisable n'écoute rien et le dit", () => {
    const statuses: string[] = [];
    const stop = startRobotJournal({ kind: "journal", path: join(dir, "robot.log"), pattern: "\\d{13}" }, { onScan: () => undefined, onStatus: (message) => statuses.push(message) });
    expect(statuses[0]).toContain("groupe de capture");
    stop();
  });
});

describe("la même boîte vue par la douchette et par le robot", () => {
  it("ne compte qu'une fois quand l'autre source vient de l'annoncer", () => {
    const dedupe = new CrossSourceDedupe(45_000);
    expect(dedupe.isDuplicate("3400930000001", "robot", 1000)).toBe(false);
    expect(dedupe.isDuplicate("3400930000001", "douchette", 20_000)).toBe(true);
  });

  it("deux boîtes identiques de la MÊME source sont bien deux boîtes", () => {
    const dedupe = new CrossSourceDedupe();
    expect(dedupe.isDuplicate("3400930000001", "douchette", 1000)).toBe(false);
    expect(dedupe.isDuplicate("3400930000001", "douchette", 2000)).toBe(false);
  });

  it("au-delà de la fenêtre, c'est une autre vente", () => {
    const dedupe = new CrossSourceDedupe(45_000);
    expect(dedupe.isDuplicate("3400930000001", "robot", 0)).toBe(false);
    expect(dedupe.isDuplicate("3400930000001", "douchette", 46_000)).toBe(false);
  });

  it("un produit différent n'est jamais écarté", () => {
    const dedupe = new CrossSourceDedupe();
    expect(dedupe.isDuplicate("3400930000001", "robot", 0)).toBe(false);
    expect(dedupe.isDuplicate("3400930000002", "douchette", 1000)).toBe(false);
  });
});

describe("l'essai à blanc", () => {
  it("lit la fin du fichier et dit ce qui serait envoyé, sans rien envoyer", () => {
    const path = join(dir, "robot.log");
    writeFileSync(path, "ligne sans produit\narticle=3400930000001\narticle=3400930000002\n");
    expect(dryRunRobotFile(path, "article=(\\d{13})")).toEqual({ ok: true, lines: 4, codes: ["3400930000001", "3400930000002"] });
  });

  it("dit pourquoi quand le fichier manque ou que l'expression est mauvaise", () => {
    expect(dryRunRobotFile(join(dir, "absent.log"), "(\\d{13})")).toMatchObject({ ok: false, error: expect.stringContaining("n'existe pas") });
    expect(dryRunRobotFile(join(dir, "absent.log"), "\\d{13}")).toMatchObject({ ok: false, error: expect.stringContaining("groupe") });
  });
});
