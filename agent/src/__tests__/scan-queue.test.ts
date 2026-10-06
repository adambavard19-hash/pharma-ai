import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScanQueue, type PendingScan } from "../scan-queue";

/**
 * La file des bips du poste de caisse : une boîte n'est jamais envoyée deux
 * fois. Le serveur n'a pas d'idempotence — un doublon ferait « 2 × DOLIPRANE »
 * à l'écran et retirerait deux boîtes du stock.
 */

const scan = (code: string, seconds = 0): PendingScan => ({ code, scannedAt: new Date(Date.UTC(2026, 9, 6, 9, 0, seconds)).toISOString() });

/** Un envoi dont on décide quand il se termine, ou s'il échoue. */
function controlledSend() {
  const sent: string[] = [];
  const inFlight: { code: string; done: () => void; fail: (error: Error) => void }[] = [];
  const send = vi.fn((item: PendingScan) => {
    sent.push(item.code);
    return new Promise<void>((resolve, reject) => {
      inFlight.push({ code: item.code, done: resolve, fail: reject });
    });
  });
  const settle = async () => {
    // Laisse la vidange avancer d'un envoi avant de regarder ce qui part ensuite.
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { send, sent, inFlight, settle };
}

describe("la vidange est monofil : une seule à la fois", () => {
  it("un bip émis pendant un envoi en vol n'est pas envoyé deux fois (le bip, puis le tour de la boucle)", async () => {
    const io = controlledSend();
    const queue = createScanQueue(io.send);

    // Le bip arrive : `onScan` met en file et vide.
    queue.push(scan("BOITE-1"));
    const first = queue.flush();
    await io.settle();
    expect(io.sent).toEqual(["BOITE-1"]);

    // L'envoi est en vol : le tour de la boucle principale (toutes les 2 à 3 s) revoit la file non vide et vide aussi.
    expect(queue.size).toBe(1);
    const tick = queue.flush();
    await io.settle();
    expect(io.sent).toEqual(["BOITE-1"]);

    io.inFlight[0].done();
    await Promise.all([first, tick]);
    expect(io.sent).toEqual(["BOITE-1"]);
    expect(queue.size).toBe(0);
  });

  it("la simulation du relecteur : bip à 2,8 s, tour à 3 s, requête de 400 ms : une seule fois", async () => {
    vi.useFakeTimers();
    try {
      const sent: string[] = [];
      const queue = createScanQueue(async (item) => {
        sent.push(item.code);
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      await vi.advanceTimersByTimeAsync(2800);
      queue.push(scan("BOITE-1"));
      void queue.flush();
      await vi.advanceTimersByTimeAsync(200);
      // Le tour de la boucle, à 3 s : la file n'est pas encore vide.
      if (queue.size > 0) void queue.flush();
      await vi.advanceTimersByTimeAsync(2000);
      expect(sent).toEqual(["BOITE-1"]);
      expect(queue.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("deux vidanges demandées pendant un envoi rendent la même vidange", async () => {
    const io = controlledSend();
    const queue = createScanQueue(io.send);
    queue.push(scan("A"));
    const one = queue.flush();
    const two = queue.flush();
    expect(two).toBe(one);
    io.inFlight[0].done();
    await one;
  });

  it("un bip lu pendant la vidange est envoyé après les autres, par la même vidange, une seule fois", async () => {
    const io = controlledSend();
    const queue = createScanQueue(io.send);
    queue.push(scan("A", 0));
    const drained = queue.flush();
    await io.settle();
    // B et C sont lus pendant que A est en vol : `onScan` les met en file et demande une vidange.
    queue.push(scan("B", 1));
    void queue.flush();
    queue.push(scan("C", 2));
    void queue.flush();
    await io.settle();
    expect(io.sent).toEqual(["A"]);

    io.inFlight[0].done();
    await io.settle();
    expect(io.sent).toEqual(["A", "B"]);
    io.inFlight[1].done();
    await io.settle();
    expect(io.sent).toEqual(["A", "B", "C"]);
    io.inFlight[2].done();
    await drained;
    expect(io.sent).toEqual(["A", "B", "C"]);
    expect(queue.size).toBe(0);
    expect(io.send).toHaveBeenCalledTimes(3);
  });

  it("les bips partent dans l'ordre de lecture, avec leur heure de lecture", async () => {
    const received: PendingScan[] = [];
    const queue = createScanQueue(async (item) => {
      received.push(item);
    });
    queue.push(scan("A", 0));
    queue.push(scan("B", 5));
    queue.push(scan("C", 9));
    await queue.flush();
    expect(received).toEqual([scan("A", 0), scan("B", 5), scan("C", 9)]);
  });
});

describe("un envoi qui échoue (coupure Internet)", () => {
  it("le bip reste en tête de file : rien n'est perdu, et la vidange suivante le renvoie, une fois", async () => {
    const io = controlledSend();
    const queue = createScanQueue(io.send);
    queue.push(scan("A"));
    const failed = queue.flush();
    await io.settle();
    io.inFlight[0].fail(new Error("réseau coupé"));
    await expect(failed).rejects.toThrow("réseau coupé");
    expect(queue.size).toBe(1);

    const retry = queue.flush();
    await io.settle();
    expect(io.sent).toEqual(["A", "A"]);
    io.inFlight[1].done();
    await retry;
    expect(queue.size).toBe(0);
  });

  it("la garde est libérée après l'échec : la vidange suivante n'est pas bloquée par la précédente", async () => {
    const io = controlledSend();
    const queue = createScanQueue(io.send);
    queue.push(scan("A"));
    const failed = queue.flush();
    await io.settle();
    io.inFlight[0].fail(new Error("réseau coupé"));
    await failed.catch(() => undefined);
    const next = queue.flush();
    expect(next).not.toBe(failed);
    io.inFlight[1].done();
    await next;
  });

  it("les bips lus pendant la coupure attendent derrière celui qui a échoué, dans l'ordre, sans doublon", async () => {
    const io = controlledSend();
    const queue = createScanQueue(io.send);
    queue.push(scan("A", 0));
    const failed = queue.flush();
    await io.settle();
    queue.push(scan("B", 3));
    void queue.flush().catch(() => undefined);
    io.inFlight[0].fail(new Error("réseau coupé"));
    await failed.catch(() => undefined);
    expect(queue.size).toBe(2);

    const replay = queue.flush();
    await io.settle();
    io.inFlight[1].done();
    await io.settle();
    io.inFlight[2].done();
    await replay;
    // A deux fois (le premier envoi a échoué), B une seule.
    expect(io.sent).toEqual(["A", "A", "B"]);
    expect(queue.size).toBe(0);
  });

  it("une vidange déjà rejetée est rejointe par ceux qui l'attendaient : chacun voit l'erreur, aucun envoi de trop", async () => {
    const io = controlledSend();
    const queue = createScanQueue(io.send);
    queue.push(scan("A"));
    const one = queue.flush();
    const two = queue.flush();
    await io.settle();
    io.inFlight[0].fail(new Error("réseau coupé"));
    await expect(one).rejects.toThrow("réseau coupé");
    await expect(two).rejects.toThrow("réseau coupé");
    expect(io.sent).toEqual(["A"]);
  });
});

describe("le câblage de l'agent", () => {
  const source = readFileSync(join(process.cwd(), "agent/src/index.ts"), "utf8");

  it("le poste n'envoie ses bips que par la file monofil : ni envoi direct, ni seconde vidange", () => {
    expect(source).toContain('import { createScanQueue } from "./scan-queue"');
    expect(source).toContain("createScanQueue(");
    // La douchette met en file puis vide ; la boucle vide aussi : toutes deux par la même file.
    expect(source).toMatch(/scans\.push\(\{ code, scannedAt/);
    expect(source).toMatch(/scans\.flush\(\)\.catch/);
    expect(source).toMatch(/if \(scans\.size > 0\) await scans\.flush\(\)/);
    // L'ancienne vidange, qui relisait la tête de file sans garde, n'existe plus.
    expect(source).not.toContain("pendingScans");
    expect(source).not.toMatch(/function flushScans/);
    // `sendScan` n'est appelé que par la file.
    expect(source.match(/sendScan\(/g)).toHaveLength(2); // sa définition et l'appel de la file
  });

  it("le bundle livré (agent/dist) est celui du code source : même file monofil, rien d'ancien", () => {
    const bundle = readFileSync(join(process.cwd(), "agent/dist/pharmaboost-connect.js"), "utf8");
    expect(bundle.includes("function createScanQueue")).toBe(true);
    expect(bundle.includes("flushing ??=")).toBe(true);
    expect(bundle.includes("pendingScans")).toBe(false);
    expect(bundle.includes("function flushScans")).toBe(false);
  });

  it("le bundle livré est exactement ce que `npm run agent:build` produit : on ne livre pas un agent périmé", async () => {
    // Même commande que le script du dépôt, en mémoire.
    const built = await build({
      entryPoints: [join(process.cwd(), "agent/src/index.ts")],
      bundle: true,
      platform: "node",
      target: "node18",
      format: "cjs",
      write: false,
      outfile: join(process.cwd(), "agent/dist/pharmaboost-connect.js"),
      banner: { js: "#!/usr/bin/env node" },
      absWorkingDir: process.cwd(),
    });
    const fresh = built.outputFiles[0]!.text;
    const shipped = readFileSync(join(process.cwd(), "agent/dist/pharmaboost-connect.js"), "utf8");
    expect(fresh === shipped).toBe(true);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});
