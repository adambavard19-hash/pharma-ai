import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma";
import { extractRcpSection48 } from "@/core/reference/rcp/html";
import { RCP_SIDE_EFFECTS_SOURCE, officialSideEffectLabels, readRcpSideEffects } from "@/core/reference/rcp/side-effects";

/**
 * L'import des effets indésirables officiels : pour chaque CIS, la page RCP de la BDPM est téléchargée (ou relue du
 * cache disque), sa rubrique 4.8 lue par le lecteur pur (`src/core/reference/rcp/side-effects.ts`), et le résultat
 * écrit dans `drug_official_side_effects` — une ligne par CIS, même quand rien n'est retenu (le statut dit pourquoi).
 *
 * Politesse envers le site public : une requête à la fois, une pause entre deux téléchargements (1,5 s par défaut),
 * trois nouvelles tentatives espacées (5 s, 15 s, 45 s) sur erreur réseau, 429 ou 5xx, puis on passe au suivant. Le
 * cache disque fait qu'une reprise ne retélécharge rien ; un CIS déjà lu par la même version du lecteur est sauté.
 *
 * Ne dépend ni de Next ni de `server-only` : le script `scripts/effets-sync.ts` lui passe son propre client Prisma.
 */

/** À incrémenter à chaque changement du lecteur ou de la liste fermée : les pages en cache seront relues, sans réseau. */
export const RCP_READER_VERSION = 1;

export type RcpFetch = (url: string) => Promise<{ status: number; text: () => Promise<string> }>;

export type SyncOptions = {
  db: Pick<PrismaClient, "drugOfficialSideEffects">;
  cisCodes: readonly string[];
  fetchPage: RcpFetch;
  /** Dossier du cache disque des pages (`.cache/rcp-bdpm`), ou `null` pour ne rien garder. */
  cacheDir: string | null;
  pauseMs: number;
  /** Retélécharge même ce qui est en cache, relit même ce qui est à jour. */
  refresh?: boolean;
  dryRun?: boolean;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  now?: () => Date;
};

export type SyncLine = {
  cisCode: string;
  outcome: "SKIPPED" | "READ" | "NO_FREQUENCY" | "NO_SECTION" | "NOT_FOUND" | "FAILED";
  effects: string[];
  fromCache: boolean;
  error?: string;
};

const RETRY_DELAYS_MS = [5_000, 15_000, 45_000];
const CIS = /^\d{8}$/;

export async function syncOfficialSideEffects(options: SyncOptions): Promise<SyncLine[]> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? (() => undefined);
  const now = options.now ?? (() => new Date());
  const results: SyncLine[] = [];
  let lastNetworkAt = 0;

  for (const cisCode of [...new Set(options.cisCodes)]) {
    if (!CIS.test(cisCode)) {
      results.push({ cisCode, outcome: "FAILED", effects: [], fromCache: false, error: "CIS invalide (8 chiffres attendus)" });
      continue;
    }
    if (!options.refresh) {
      const existing = await options.db.drugOfficialSideEffects.findUnique({ where: { cisCode }, select: { readerVersion: true, effects: true } });
      if (existing && existing.readerVersion >= RCP_READER_VERSION) {
        results.push({ cisCode, outcome: "SKIPPED", effects: existing.effects, fromCache: false });
        continue;
      }
    }

    const url = RCP_SIDE_EFFECTS_SOURCE.urlFor(cisCode);
    const cacheFile = options.cacheDir ? path.join(options.cacheDir, `${cisCode}.html`) : null;
    let html: string | null = null;
    let fromCache = false;
    let fetchedAt = now();
    if (cacheFile && !options.refresh) {
      html = await readFile(cacheFile, "utf8").catch(() => null);
      fromCache = html !== null;
      // La date est celle du téléchargement (le fichier en cache), pas celle de la relecture.
      if (fromCache) fetchedAt = (await stat(cacheFile)).mtime;
    }

    let notFound = false;
    let failure: string | null = null;
    if (html === null) {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        const wait = lastNetworkAt + options.pauseMs - Date.now();
        if (lastNetworkAt > 0 && wait > 0) await sleep(wait);
        lastNetworkAt = Date.now();
        try {
          const response = await options.fetchPage(url.replace(/#.*$/, ""));
          if (response.status === 404) {
            notFound = true;
            break;
          }
          if (response.status === 200) {
            html = await response.text();
            fetchedAt = now();
            break;
          }
          failure = `HTTP ${response.status}`;
          if (response.status !== 429 && response.status < 500) break;
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error);
        }
        if (attempt < RETRY_DELAYS_MS.length) {
          log(`  ${cisCode} : ${failure}, nouvel essai dans ${RETRY_DELAYS_MS[attempt] / 1000} s`);
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
      if (html !== null && cacheFile) {
        await mkdir(path.dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, html, "utf8");
      }
    }

    if (html === null && !notFound) {
      results.push({ cisCode, outcome: "FAILED", effects: [], fromCache: false, error: failure ?? "page vide" });
      continue;
    }

    const reading = html === null ? null : readRcpSideEffects(html);
    const status = reading ? reading.status : "NOT_FOUND";
    const effects = reading ? officialSideEffectLabels(reading.effects) : [];
    const section = html ? extractRcpSection48(html) : null;
    const record = {
      status,
      effects,
      details: reading?.effects ?? [],
      sourceUrl: url,
      sectionHash: section ? createHash("sha256").update(section).digest("hex") : null,
      readerVersion: RCP_READER_VERSION,
      fetchedAt,
    };
    if (!options.dryRun) {
      await options.db.drugOfficialSideEffects.upsert({ where: { cisCode }, create: { cisCode, ...record }, update: record });
    }
    results.push({ cisCode, outcome: status, effects, fromCache });
  }
  return results;
}
