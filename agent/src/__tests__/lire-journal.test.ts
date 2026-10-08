import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const journal = await import("../lire-journal");

/**
 * La lecture du journal de LGPI : elle doit dire OÙ est le code produit sans jamais montrer une valeur d'une ligne — ni un nom
 * de patient, ni un numéro de sécurité sociale — et ne jamais lire la suite d'une trace d'erreur.
 */

const ROBOT_REQUEST = "2026-10-08 15:41:02,114 INFO  [org.apache.AmqpListener#1-1] fr.pharmagest.automate.OutputHandler - Réception message en provenance de l'automate : OutputRequest(id=12345678, patient=DUPONT Jean, lines=[ArticleLine(articleId=3400930000001, quantity=2)])";
const CODE_LINE = "2026-10-08 15:41:03,200 INFO  [AAA-RobotWorker-4] fr.pharmagest.stock.StockAutomate - Stock automate : Code produit 3095123 dans 2 emplacements";
const NOISE = "2026-10-08 15:41:04,000 INFO  [main] fr.pharmagest.ui.Screen - Ouverture de la fiche de MARTIN Claire née le 01/02/1950";
const STACK = "\tat fr.pharmagest.automate.OutputHandler.handle(OutputHandler.java:42) message robot DUPONT Jean 185057800608436";

describe("une ligne de journal", () => {
  it("se lit par sa date, son niveau, son fil, son logger et son message ; la suite d'une trace n'en est pas une", () => {
    expect(journal.parseEntry(CODE_LINE)).toMatchObject({ date: "2026-10-08", time: "15:41:03", level: "INFO", logger: "fr.pharmagest.stock.StockAutomate" });
    expect(journal.parseEntry(STACK)).toBeNull();
    expect(journal.parseEntry("n'importe quoi")).toBeNull();
  });

  it("reconnaît le robot par ses mots", () => {
    expect(journal.ROBOT_LINE.test("Réception message en provenance de l'automate")).toBe(true);
    expect(journal.ROBOT_LINE.test("Code produit 3095123")).toBe(true);
    expect(journal.ROBOT_LINE.test("OutputRequest(id=1)")).toBe(true);
    expect(journal.ROBOT_LINE.test("Ouverture de la fiche")).toBe(false);
  });
});

describe("le masquage : la forme d'une ligne, jamais une valeur", () => {
  const entry = journal.parseEntry(ROBOT_REQUEST)!;
  const masked = journal.maskEntry(entry);

  it("ne laisse passer ni le nom du patient, ni un chiffre", () => {
    expect(masked).not.toMatch(/DUPONT|Jean|Dupont/i);
    // L'heure reste lisible ; après elle, aucun chiffre autre que 9.
    expect(masked.slice("15:41:02 ".length)).not.toMatch(/[0-8]/);
    expect(masked).toContain("[");
  });

  it("garde les NOMS de structures et de champs : c'est ce qui dit où est le code produit", () => {
    expect(masked).toContain("OutputRequest(");
    expect(masked).toContain("ArticleLine(");
    expect(masked).toContain("articleId=9999999999999");
    expect(masked).toContain("quantity=9");
    // …et le champ qui porte un nom de personne reste un champ, sa valeur masquée.
    expect(masked).toContain("patient=AAAAAA Aaaa");
  });

  it("garde l'heure et le niveau, pas la date du fil ni l'identifiant d'une file", () => {
    expect(masked.startsWith("15:41:02 INFO ")).toBe(true);
    const thread = journal.maskThread("Aaaaaa Aaaaaa: af123dc9-4567-8901-aa9c-123456f78ee9");
    expect(thread).not.toMatch(/[0-8]/);
  });

  it("une ligne qui ne cite pas un nom de classe masque tout mot qui n'est pas du vocabulaire — même un prénom entre parenthèses", () => {
    const line = journal.parseEntry("2026-10-08 10:00:00,000 INFO  [main] x.Y - envoi pour Camille (Dupont) robot")!;
    const out = journal.maskMessage(line.message);
    expect(out).not.toMatch(/Camille|Dupont/);
    expect(out).toContain("robot");
  });
});

describe("l'analyse des journaux", () => {
  const text = [ROBOT_REQUEST, CODE_LINE, NOISE, STACK, CODE_LINE.replace("3095123", "3095124").replace("15:41:03", "15:42:00"), ROBOT_REQUEST.replace("15:41:02", "15:43:10")].join("\n");
  const result = journal.analyse([text]);

  it("compte les lignes lues et celles du robot, jour par jour — la suite d'une trace n'est jamais lue", () => {
    expect(result.entriesRead).toBe(5);
    expect(result.robotEntries).toBe(4);
    expect(result.days).toEqual([{ date: "2026-10-08", robotEntries: 4 }]);
  });

  it("regroupe les lignes de même forme, avec leur nombre et leurs heures", () => {
    const request = result.shapes.find((shape) => shape.shape.includes("OutputRequest("));
    expect(request).toMatchObject({ count: 2, first: "2026-10-08 15:41:02", last: "2026-10-08 15:43:10" });
    const stock = result.shapes.find((shape) => shape.shape.includes("Code produit"));
    expect(stock?.count).toBe(2);
    expect(result.lastLines).toHaveLength(4);
  });

  it("les motifs candidats trouvent les codes produit, avec l'heure — et seulement des codes de produit", () => {
    const byId = Object.fromEntries(result.candidates.map((candidate) => [candidate.candidate.id, candidate]));
    expect(byId["code-produit"]).toMatchObject({ total: 2, distinct: 2 });
    expect(byId["code-produit"].recent.map((hit) => hit.code)).toEqual(["3095123", "3095124"]);
    expect(byId["article"].recent.map((hit) => hit.code)).toEqual(["3400930000001", "3400930000001"]);
    // Le numéro de sécurité sociale, lui, n'est jamais pris pour un code (15 chiffres, aucun mot de produit devant).
    const all = JSON.stringify(result.candidates.map((candidate) => candidate.recent));
    expect(all).not.toContain("185057800608436");
  });

  it("le rapport entier ne contient aucune valeur de patient", () => {
    const report = journal.renderReport({ computer: "POSTE5", now: new Date("2026-10-09T01:36:00"), dir: "C:\\var\\log\\lgpi\\application", files: [{ name: "lgpi.2026-10-08.log", sizeKb: 120, modified: "2026-10-08 23:48" }], analysis: result, errors: [] }).join("\n");
    expect(report).not.toMatch(/DUPONT|MARTIN|Claire|Jean|185057800608436/);
    expect(report).toContain("3095123");
    expect(report).toContain("OutputRequest(");
  });

  it("sans ligne du robot, le dit au lieu d'inventer", () => {
    const empty = journal.analyse([NOISE]);
    const report = journal.renderReport({ computer: "X", now: new Date(), dir: "d", files: [], analysis: empty, errors: [] }).join("\n");
    expect(report).toContain("aucune ligne du robot");
  });
});

describe("la lecture sur le disque", () => {
  let dir: string;
  let desktop: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pb-lgpi-"));
    desktop = mkdtempSync(join(tmpdir(), "pb-bureau-"));
    process.env.PB_BUREAU = desktop;
  });
  afterEach(() => {
    delete process.env.PB_BUREAU;
    rmSync(dir, { recursive: true, force: true });
    rmSync(desktop, { recursive: true, force: true });
  });

  it("lit les journaux les plus récents, écrit UN rapport sur le Bureau, et rien d'autre", () => {
    const old = join(dir, "lgpi.2026-10-01.log");
    const mid = join(dir, "lgpi.2026-10-07.log");
    const today = join(dir, "lgpi.2026-10-08.log");
    const other = join(dir, "autre.txt");
    writeFileSync(old, ROBOT_REQUEST + "\n");
    writeFileSync(mid, NOISE + "\n");
    writeFileSync(today, [CODE_LINE, ROBOT_REQUEST].join("\r\n") + "\r\n");
    writeFileSync(other, "ne se lit pas");
    const now = Date.now();
    utimesSync(old, new Date(now - 7 * 864e5), new Date(now - 7 * 864e5));
    utimesSync(mid, new Date(now - 2 * 864e5), new Date(now - 2 * 864e5));
    const { file, lines } = journal.run({ dirs: [join(dir, "absent"), dir], now: new Date("2026-10-09T01:36:00") });
    expect(file.startsWith(desktop)).toBe(true);
    const written = readFileSync(file, "utf8");
    expect(written.charCodeAt(0)).toBe(0xfeff);
    expect(written).toContain("lgpi.2026-10-08.log");
    expect(written).toContain("3095123");
    expect(written).not.toMatch(/DUPONT|autre\.txt/);
    expect(lines.join("\n")).toContain("Dossier : " + dir);
    expect(() => readFileSync(join(dir, "PharmaBoost-lecture-journal-X.txt"))).toThrow();
  });

  it("aucun dossier de LGPI : le rapport le dit, avec les emplacements essayés", () => {
    const { lines } = journal.run({ dirs: [join(dir, "rien")], now: new Date("2026-10-09T01:36:00") });
    expect(lines.join("\n")).toContain("Aucun journal de LGPI trouvé");
  });

  it("recentJournals ne garde que les journaux de LGPI, du plus ancien au plus récent", () => {
    mkdirSync(join(dir, "sous-dossier"));
    for (const name of ["lgpi.2026-10-01.log", "lgpi.2026-10-02.log", "lgpi.2026-10-03.log", "lgpi.2026-10-04.log", "x.log"]) writeFileSync(join(dir, name), "x");
    const base = Date.now();
    ["lgpi.2026-10-01.log", "lgpi.2026-10-02.log", "lgpi.2026-10-03.log", "lgpi.2026-10-04.log"].forEach((name, index) => utimesSync(join(dir, name), new Date(base - (4 - index) * 1000), new Date(base - (4 - index) * 1000)));
    expect(journal.recentJournals(dir).map((item) => item.info.name)).toEqual(["lgpi.2026-10-02.log", "lgpi.2026-10-03.log", "lgpi.2026-10-04.log"]);
  });
});

describe("le programme livré", () => {
  it("le fichier livré est exactement ce que `npm run agent:build` produit : on ne livre pas une lecture périmée", async () => {
    const built = await build({
      entryPoints: [join(process.cwd(), "agent/src/lire-journal.ts")],
      bundle: true,
      platform: "node",
      target: "node18",
      format: "cjs",
      write: false,
      outfile: join(process.cwd(), "agent/dist/lire-journal.js"),
      absWorkingDir: process.cwd(),
    });
    expect(built.outputFiles[0]!.text === readFileSync(join(process.cwd(), "agent/dist/lire-journal.js"), "utf8")).toBe(true);
  });

  it("ne contient aucune commande qui écrive ailleurs que le rapport, supprime, installe ou envoie", () => {
    const source = readFileSync(join(process.cwd(), "agent/src/lire-journal.ts"), "utf8");
    for (const forbidden of [/fetch\(/, /https?:\/\/(?!pharmaboost)/, /unlinkSync|rmSync|rmdirSync|renameSync|appendFileSync/, /createWriteStream/, /spawn\(|spawnSync\(|\bexecSync\(|fork\(/]) {
      expect(forbidden.test(source), String(forbidden)).toBe(false);
    }
    // Le seul programme lancé : PowerShell, pour demander où est le Bureau (une lecture), jamais autre chose.
    expect(source.match(/execFileSync\(/g)?.length).toBe(1);
    expect(source).toContain("[Environment]::GetFolderPath('Desktop')");
    // Les seules écritures : le rapport (writeFileSync, une fois).
    expect(source.match(/writeFileSync\(/g)?.length).toBe(1);
  });
});
