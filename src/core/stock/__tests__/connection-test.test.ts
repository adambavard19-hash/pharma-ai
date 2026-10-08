import { describe, expect, it } from "vitest";
import { buildConnectionOverview, type OverviewConnection, type OverviewInput, type OverviewPost } from "../connection-overview";
import { buildConnectionTest, type ConnectionTestInput, type TestConnection, type TestPost } from "../connection-test";
import { LATEST_AGENT_VERSION } from "@/core/admin/agent-version";
import { robotSetupSchema } from "@/core/robot/integration";

/**
 * « Tester ma connexion » ne déclare bon que ce qui a été reçu. Chaque cas est une situation où
 * un test complaisant dirait « ça marche » à tort.
 */

const NOW = new Date("2026-10-08T10:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
const MIN = 60;
const HOUR = 3600;
const DAY = 86_400;

const serverRow = (overrides: Partial<OverviewConnection & TestConnection> = {}): OverviewConnection & TestConnection => ({
  status: "CONNECTED",
  pairedAt: ago(10 * DAY),
  lastSeenAt: ago(MIN),
  lastSyncAt: ago(2 * HOUR),
  lastSyncLines: 4200,
  lastError: null,
  hostname: "SRV-PHARMA",
  agentVersion: LATEST_AGENT_VERSION,
  pairingExpiresAt: null,
  exportPath: "C:\\PharmaBoost\\Export",
  ...overrides,
});

const postRow = (overrides: Partial<OverviewPost & TestPost> = {}): OverviewPost & TestPost => ({
  id: "post_1",
  label: "Caisse 1",
  hostname: "CAISSE1",
  pairedAt: ago(3 * DAY),
  lastSeenAt: ago(MIN),
  lastScanAt: ago(5 * MIN),
  scanCount: 42,
  version: LATEST_AGENT_VERSION,
  pairingExpiresAt: null,
  exportPath: null,
  lastExportAt: null,
  lastExportError: null,
  ...overrides,
});

function run(options: { overview?: Partial<OverviewInput>; connection?: (OverviewConnection & TestConnection) | null; posts?: (OverviewPost & TestPost)[]; robot?: unknown } = {}) {
  const connection = options.connection === undefined ? null : options.connection;
  const posts = options.posts ?? [];
  const overview = buildConnectionOverview({ now: NOW, lgo: "lgpi", connection, posts, stockSyncedAt: null, stockLines: null, stockProblem: null, ...options.overview });
  const input: ConnectionTestInput = {
    now: NOW,
    lgo: "lgpi",
    lgoLabel: "LGPI",
    overview,
    connection,
    posts,
    latestAgentVersion: LATEST_AGENT_VERSION,
    robot: options.robot ? robotSetupSchema.parse(options.robot) : null,
  };
  return buildConnectionTest(input);
}

const byId = (result: ReturnType<typeof run>, id: string) => result.checks.find((check) => check.id === id);

describe("le départ : rien n'est fait", () => {
  it("un stock jamais reçu est « à regarder », avec le geste à faire — jamais « tout fonctionne »", () => {
    const result = run();
    expect(byId(result, "stock-received")).toMatchObject({ status: "warn" });
    expect(byId(result, "stock-received")?.fix).toMatch(/étape 2/);
    expect(result.tone).toBe("warning");
    expect(result.title).not.toMatch(/fonctionne/);
  });

  it("sans logiciel précisé : une information, pas un manque (le pharmacien ne le choisit plus à l'écran)", () => {
    const overview = buildConnectionOverview({ now: NOW, lgo: null, connection: null, posts: [], stockSyncedAt: null, stockLines: null, stockProblem: null });
    const result = buildConnectionTest({ now: NOW, lgo: null, lgoLabel: null, overview, connection: null, posts: [], latestAgentVersion: LATEST_AGENT_VERSION, robot: null });
    expect(byId(result, "software")).toMatchObject({ status: "info" });
    expect(result.counts.toFix).toBe(1); // seul le stock manque
  });

  it("PharmaBoost Connect non installé n'est pas une erreur : c'est facultatif", () => {
    const result = run({ overview: { stockSyncedAt: ago(HOUR), stockLines: 100 } });
    expect(byId(result, "connect")).toMatchObject({ status: "info" });
    expect(result.counts.toFix).toBe(0);
  });
});

describe("l'envoi automatique du stock n'est dit bon que s'il a eu lieu", () => {
  it("un programme en ligne qui n'a encore rien lu : à regarder, pas « synchronisé »", () => {
    const result = run({ connection: serverRow({ lastSyncAt: null, lastSyncLines: null }), overview: { stockSyncedAt: ago(HOUR) } });
    expect(byId(result, "stock-auto")).toMatchObject({ status: "warn" });
    expect(byId(result, "stock-auto")?.detail).toMatch(/aucun export/i);
  });

  it("un export lu il y a deux heures : vérifié", () => {
    const result = run({ connection: serverRow(), overview: { stockSyncedAt: ago(2 * HOUR), stockLines: 4200 } });
    expect(byId(result, "stock-auto")).toMatchObject({ status: "ok" });
  });

  it("un programme en ligne mais sans export depuis dix jours : le logiciel n'envoie rien tout seul — à regarder", () => {
    const result = run({ connection: serverRow({ lastSyncAt: ago(10 * DAY) }), overview: { stockSyncedAt: ago(10 * DAY) } });
    expect(byId(result, "stock-auto")).toMatchObject({ status: "warn" });
    expect(byId(result, "stock-auto")?.detail).toMatch(/^Dernier export lu il y a/);
    expect(byId(result, "stock-auto")?.fix).toMatch(/n'enregistre pas son stock tout seul/);
  });

  it("un poste qui relit un dossier d'export compte comme lecteur", () => {
    const result = run({ posts: [postRow({ exportPath: "\\\\SRV\\PharmaBoost", lastExportAt: ago(HOUR) })], overview: { stockSyncedAt: ago(HOUR) } });
    expect(byId(result, "stock-auto")).toMatchObject({ status: "ok" });
  });

  it("sans programme lecteur, l'envoi est « non utilisé » et rien n'est affirmé", () => {
    const result = run({ overview: { stockSyncedAt: ago(HOUR) } });
    expect(byId(result, "stock-auto")).toMatchObject({ status: "info" });
  });
});

describe("la connexion des appareils", () => {
  it("un poste qui ne répond plus : à regarder, avec ce qu'il faut faire", () => {
    const result = run({ posts: [postRow({ lastSeenAt: ago(3 * HOUR) })], overview: { stockSyncedAt: ago(HOUR) } });
    const device = byId(result, "device-post-post_1");
    expect(device).toMatchObject({ status: "warn" });
    expect(device?.title).toMatch(/Caisse 1 ne répond plus/);
    expect(device?.fix).toMatch(/allumé/);
  });

  it("un poste jamais vu après l'installation : aucun signe de vie, dit tel quel", () => {
    const result = run({ posts: [postRow({ lastSeenAt: null })] });
    expect(byId(result, "device-post-post_1")?.detail).toMatch(/Aucun signe de vie/);
  });

  it("une ancienne version est signalée sans alarme", () => {
    const result = run({ posts: [postRow({ version: "0.3.0" })] });
    expect(byId(result, "version-post-post_1")).toMatchObject({ status: "info" });
    expect(byId(result, "version-post-post_1")?.fix).toMatch(/met à jour tout seul/);
  });

  it("la dernière version ne produit aucune ligne de version", () => {
    expect(byId(run({ posts: [postRow()] }), "version-post-post_1")).toBeUndefined();
  });

  it("un message d'erreur du programme du serveur est une erreur, citée telle quelle", () => {
    const result = run({ connection: serverRow({ lastError: "Dossier introuvable : C:\\PharmaBoost\\Export" }) });
    expect(byId(result, "server-notice")).toMatchObject({ status: "fail", detail: "Dossier introuvable : C:\\PharmaBoost\\Export" });
    expect(result.tone).toBe("danger");
  });

  it("une erreur de lecture du dossier d'export d'un poste est une erreur", () => {
    const result = run({ posts: [postRow({ exportPath: "\\\\SRV\\X", lastExportError: "Accès refusé" })] });
    expect(byId(result, "export-error-post_1")).toMatchObject({ status: "fail", detail: "Accès refusé" });
  });
});

describe("le stock", () => {
  it("un stock récent avec ses références : vérifié, avec le nombre", () => {
    const result = run({ overview: { stockSyncedAt: ago(2 * HOUR), stockLines: 4200, stockReferences: 3980 } });
    expect(byId(result, "stock-received")).toMatchObject({ status: "ok" });
    expect(byId(result, "stock-references")?.detail).toMatch(/3\s?980 références/);
  });

  it("un stock de vingt et un jours est ancien", () => {
    const result = run({ overview: { stockSyncedAt: ago(21 * DAY) } });
    expect(byId(result, "stock-received")).toMatchObject({ status: "warn" });
    expect(byId(result, "stock-received")?.detail).toMatch(/21 jours/);
  });

  it("un fichier reçu mais vide de références est signalé", () => {
    const result = run({ overview: { stockSyncedAt: ago(HOUR), stockReferences: 0 } });
    expect(byId(result, "stock-empty")).toMatchObject({ status: "warn" });
  });

  it("les lignes illisibles du dernier fichier sont signalées", () => {
    const result = run({ overview: { stockSyncedAt: ago(HOUR), stockIgnored: 12 } });
    expect(byId(result, "stock-ignored")?.detail).toMatch(/12 lignes/);
  });

  it("un fichier non appliqué est une erreur, même si un ancien stock est à jour", () => {
    const result = run({ overview: { stockSyncedAt: ago(HOUR), stockProblem: "FAILED" } });
    expect(byId(result, "stock-problem")).toMatchObject({ status: "fail" });
    expect(result.tone).toBe("danger");
  });
});

describe("les ventes", () => {
  it("sans poste : information, jamais une promesse de lecture du logiciel", () => {
    const check = byId(run(), "sales");
    expect(check).toMatchObject({ status: "info" });
    expect(check?.detail).toMatch(/n'est pas disponible/);
  });

  it("un poste en ligne qui n'a jamais reçu de bip : le suivi n'est pas prouvé", () => {
    const check = byId(run({ posts: [postRow({ scanCount: 0, lastScanAt: null })] }), "sales");
    expect(check).toMatchObject({ status: "warn" });
    expect(check?.fix).toMatch(/essai du bip/);
  });

  it("un poste en ligne avec des bips : vérifié", () => {
    expect(byId(run({ posts: [postRow()] }), "sales")).toMatchObject({ status: "ok" });
  });
});

describe("le robot : aucune connexion simulée", () => {
  it("rien de renseigné : information facultative", () => {
    expect(byId(run(), "robot")).toMatchObject({ status: "info" });
  });

  it("un robot renseigné reste « en préparation » : le test ne prétend rien contrôler", () => {
    const check = byId(run({ robot: { manufacturer: "bd-rowa", model: "Vmax" } }), "robot");
    expect(check).toMatchObject({ status: "info", title: "BD Rowa Vmax" });
    expect(check?.detail).toMatch(/Intégration en préparation/);
    expect(check?.detail).toMatch(/aucune connexion n'est testée/);
  });

  it("le robot ne compte jamais comme « à corriger » ni comme « réussi »", () => {
    const without = run({ overview: { stockSyncedAt: ago(HOUR) } });
    const withRobot = run({ overview: { stockSyncedAt: ago(HOUR) }, robot: { manufacturer: "bd-rowa" } });
    expect(withRobot.counts.ok).toBe(without.counts.ok);
    expect(withRobot.counts.toFix).toBe(without.counts.toFix);
  });
});

describe("le verdict", () => {
  it("tout est vérifié : vert, et il dit qu'il s'agit de ce qui peut être vérifié", () => {
    const result = run({
      connection: serverRow(),
      posts: [postRow()],
      overview: { stockSyncedAt: ago(2 * HOUR), stockLines: 4200, stockReferences: 3980 },
    });
    expect(result.tone).toBe("success");
    expect(result.title).toBe("Tout ce qui peut être vérifié fonctionne");
    expect(result.counts.toFix).toBe(0);
  });

  it("dit toujours ce que le test ne voit pas", () => {
    expect(run().limits).toMatch(/ne se connecte pas à vos ordinateurs/);
  });

  it("ne prétend jamais à une synchronisation automatique ou en temps réel", () => {
    const text = JSON.stringify(
      run({ connection: serverRow(), posts: [postRow()], overview: { stockSyncedAt: ago(2 * HOUR), stockReferences: 10 }, robot: { manufacturer: "mach4" } }),
    );
    expect(text).not.toMatch(/synchronisation automatique|temps réel|en continu|synchronisé/i);
  });

  it("compte les erreurs avant les points à regarder", () => {
    const result = run({ connection: serverRow({ lastError: "Panne" }), overview: { stockSyncedAt: ago(30 * DAY) } });
    expect(result.tone).toBe("danger");
    expect(result.title).toBe("1 erreur à corriger");
  });
});
