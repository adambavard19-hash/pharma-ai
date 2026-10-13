import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RCP_READER_VERSION, syncOfficialSideEffects } from "../official-side-effects-sync";

/**
 * L'import des effets indésirables officiels, sans réseau ni base : une fausse BDPM qui sert de vrais extraits de RCP,
 * une fausse table. On vérifie la politesse (pause, nouvelles tentatives), la reprise (cache disque, CIS déjà lu) et
 * qu'un CIS inconnu ou une erreur durable n'écrivent rien de faux.
 */
const FIXTURES = path.join(__dirname, "../../../core/reference/rcp/__tests__/fixtures");
const page = (prefix: string) => readFileSync(path.join(FIXTURES, readdirSync(FIXTURES).find((name) => name.startsWith(prefix))!), "utf8");

function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    db: {
      drugOfficialSideEffects: {
        findUnique: vi.fn(async ({ where }: { where: { cisCode: string } }) => rows.get(where.cisCode) ?? null),
        upsert: vi.fn(async ({ where, create, update }: { where: { cisCode: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
          rows.set(where.cisCode, { ...(rows.get(where.cisCode) ?? create), ...update });
          return rows.get(where.cisCode);
        }),
      },
    } as never,
  };
}

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(os.tmpdir(), "rcp-cache-"));
});
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

const ok = (html: string) => ({ status: 200, text: async () => html });

describe("effets:sync", () => {
  it("télécharge, lit, écrit une ligne par CIS avec sa source, et garde la page en cache", async () => {
    const { db, rows } = fakeDb();
    const fetchPage = vi.fn(async (url: string) => (url.includes("61665908") ? ok(page("61665908")) : ok(page("64362325"))));
    const sleep = vi.fn(async () => undefined);
    const lines = await syncOfficialSideEffects({ db, cisCodes: ["61665908", "64362325"], fetchPage, cacheDir, pauseMs: 1500, sleep });

    expect(lines.map((line) => [line.cisCode, line.outcome, line.effects])).toEqual([
      ["61665908", "READ", ["sécheresse buccale", "diarrhée", "somnolence", "fatigue (asthénie)"]],
      ["64362325", "READ", []],
    ]);
    expect(fetchPage).toHaveBeenCalledWith("https://base-donnees-publique.medicaments.gouv.fr/medicament/61665908/extrait");
    expect(rows.get("61665908")).toMatchObject({
      cisCode: "61665908",
      status: "READ",
      sourceUrl: "https://base-donnees-publique.medicaments.gouv.fr/medicament/61665908/extrait#tab-rcp",
      readerVersion: RCP_READER_VERSION,
    });
    expect((rows.get("61665908")!.details as { evidence: string }[])[0].evidence).toBe("Sécheresse buccale — 2,09 % (placebo : 0,82 %)");
    expect(rows.get("61665908")!.sectionHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await readdir(cacheDir)).sort()).toEqual(["61665908.html", "64362325.html"]);
    // Une pause polie entre les deux téléchargements.
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("reprise : un CIS déjà lu par ce lecteur est sauté, une page en cache est relue sans réseau", async () => {
    const { db } = fakeDb();
    const fetchPage = vi.fn(async () => ok(page("61665908")));
    await syncOfficialSideEffects({ db, cisCodes: ["61665908"], fetchPage, cacheDir, pauseMs: 0 });
    const again = await syncOfficialSideEffects({ db, cisCodes: ["61665908"], fetchPage, cacheDir, pauseMs: 0 });
    expect(again[0].outcome).toBe("SKIPPED");

    const { db: fresh } = fakeDb();
    const reread = await syncOfficialSideEffects({ db: fresh, cisCodes: ["61665908"], fetchPage, cacheDir, pauseMs: 0 });
    expect(reread[0]).toMatchObject({ outcome: "READ", fromCache: true });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("429 puis 200 : nouvelle tentative après une attente ; erreur durable : rien n'est écrit", async () => {
    const { db, rows } = fakeDb();
    const sleep = vi.fn(async () => undefined);
    const flaky = vi.fn().mockResolvedValueOnce({ status: 429, text: async () => "" }).mockResolvedValueOnce(ok(page("69118175")));
    const [line] = await syncOfficialSideEffects({ db, cisCodes: ["69118175"], fetchPage: flaky, cacheDir: null, pauseMs: 0, sleep });
    expect(line).toMatchObject({ outcome: "READ", effects: ["nausées", "diarrhée"] });
    expect(sleep).toHaveBeenCalledWith(5000);

    const down = vi.fn(async () => ({ status: 503, text: async () => "" }));
    const [failed] = await syncOfficialSideEffects({ db, cisCodes: ["60160707"], fetchPage: down, cacheDir: null, pauseMs: 0, sleep });
    expect(failed).toMatchObject({ outcome: "FAILED", error: "HTTP 503" });
    expect(down).toHaveBeenCalledTimes(4);
    expect(rows.has("60160707")).toBe(false);
  });

  it("CIS inconnu de la BDPM (404) : noté NOT_FOUND, sans effet ; CIS mal formé : refusé", async () => {
    const { db, rows } = fakeDb();
    const lines = await syncOfficialSideEffects({ db, cisCodes: ["99999999", "12AB"], fetchPage: async () => ({ status: 404, text: async () => "" }), cacheDir: null, pauseMs: 0 });
    expect(lines.map((line) => line.outcome)).toEqual(["NOT_FOUND", "FAILED"]);
    expect(rows.get("99999999")).toMatchObject({ status: "NOT_FOUND", effects: [] });
  });

  it("essai à blanc : lit tout, n'écrit rien", async () => {
    const { db, rows } = fakeDb();
    const [line] = await syncOfficialSideEffects({ db, cisCodes: ["61665908"], fetchPage: async () => ok(page("61665908")), cacheDir, pauseMs: 0, dryRun: true });
    expect(line.outcome).toBe("READ");
    expect(rows.size).toBe(0);
    expect(await readFile(path.join(cacheDir, "61665908.html"), "utf8")).toContain("4.8. Effets indésirables");
  });
});
