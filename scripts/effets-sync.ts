/**
 * Les effets indésirables fréquents de chaque spécialité, lus dans son RCP officiel (BDPM, rubrique 4.8).
 *
 * Exécution : `npm run effets:sync -- [options]`
 *
 *   (sans option)          toutes les spécialités en stock (quantité > 0) dans au moins une pharmacie
 *   --cis <c1,c2,…>        seulement ces CIS (8 chiffres, séparés par des virgules ou des espaces)
 *   --limit <n>            s'arrêter après n spécialités (essai)
 *   --pause <ms>           pause entre deux téléchargements, 1 500 ms par défaut, jamais moins de 500
 *   --cache <dossier>      cache disque des pages, `.cache/rcp-bdpm` par défaut (une reprise ne retélécharge rien)
 *   --sans-cache           ne rien lire ni écrire sur disque
 *   --rafraichir           retélécharger et relire même ce qui est déjà à jour
 *   --dry-run              tout lire, ne rien écrire en base
 *
 * La page lue est celle de la spécialité sur la BDPM, onglet « RCP » :
 *   https://base-donnees-publique.medicaments.gouv.fr/medicament/<CIS>/extrait#tab-rcp
 * (l'ancienne adresse `affichageDoc.php?specid=<CIS>&typedoc=R` y redirige). Les médicaments autorisés par la
 * Commission européenne n'y ont pas de RCP (renvoi au site de l'EMA) : statut `NO_SECTION`, rien n'est retenu.
 *
 * Reprise : un CIS déjà lu par la version courante du lecteur est sauté ; une page en cache est relue sans réseau. Un
 * arrêt (Ctrl+C) ne perd que la spécialité en cours. Licence de la BDPM : la source et la date de lecture sont
 * enregistrées avec chaque ligne et affichées au pharmacien (« RCP (BDPM) »).
 */

import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { RCP_READER_VERSION, syncOfficialSideEffects, type SyncLine } from "../src/server/services/official-side-effects-sync";

const ESC = String.fromCharCode(27);
const OK = `${ESC}[32m✓${ESC}[0m`;
const KO = `${ESC}[31m✗${ESC}[0m`;
const WARN = `${ESC}[33m!${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

const USER_AGENT = "PharmaBoost/1.0 (lecture des RCP, rubrique 4.8 ; contact@pharmaboost.app)";

type Options = { cis: string[] | null; limit: number | null; pauseMs: number; cacheDir: string | null; refresh: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Options | { error: string } {
  const options: Options = { cis: null, limit: null, pauseMs: 1500, cacheDir: path.join(process.cwd(), ".cache", "rcp-bdpm"), refresh: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--cis") {
      const values: string[] = [];
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) values.push(...argv[++i].split(/[\s,;]+/).filter(Boolean));
      if (values.length === 0) return { error: "--cis attend au moins un code CIS." };
      const invalid = values.filter((value) => !/^\d{8}$/.test(value));
      if (invalid.length > 0) return { error: `CIS invalide(s) : ${invalid.join(", ")} (8 chiffres attendus).` };
      options.cis = values;
    } else if (arg === "--limit") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) return { error: "--limit attend un entier positif." };
      options.limit = value;
    } else if (arg === "--pause") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value < 500) return { error: "--pause attend un nombre de millisecondes, 500 au moins (débit poli)." };
      options.pauseMs = value;
    } else if (arg === "--cache") {
      const value = argv[++i];
      if (!value) return { error: "--cache attend un dossier." };
      options.cacheDir = path.resolve(value.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
    } else if (arg === "--sans-cache") {
      options.cacheDir = null;
    } else if (arg === "--rafraichir") {
      options.refresh = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else {
      return { error: `Option inconnue : ${arg}` };
    }
  }
  return options;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.log(`\n${KO} ${parsed.error}\n`);
    process.exitCode = 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.log(`\n${KO} DATABASE_URL absente de l'environnement.\n`);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    let cisCodes = parsed.cis;
    if (!cisCodes) {
      // Les spécialités utiles : celles qu'au moins une pharmacie a en stock. Une donnée publique, lue une fois pour toutes.
      const rows = await prisma.$queryRaw<{ cisCode: string }[]>`
        SELECT DISTINCT s."cisCode"
        FROM pharmacy_drug_stocks st
        JOIN drug_presentations p ON p.id = st."presentationId"
        JOIN drug_specialties s ON s.id = p."specialtyId"
        WHERE st.quantity > 0
        ORDER BY s."cisCode"`;
      cisCodes = rows.map((row) => row.cisCode);
      console.log(`\n${BOLD}Effets indésirables officiels${RESET} — ${cisCodes.length} spécialité(s) en stock dans au moins une pharmacie.`);
    } else {
      console.log(`\n${BOLD}Effets indésirables officiels${RESET} — ${cisCodes.length} spécialité(s) demandée(s).`);
    }
    if (parsed.limit) cisCodes = cisCodes.slice(0, parsed.limit);
    console.log(`${DIM}Lecteur v${RCP_READER_VERSION} · pause ${parsed.pauseMs} ms · cache ${parsed.cacheDir ?? "aucun"}${parsed.dryRun ? " · essai à blanc, rien n'est écrit" : ""}${RESET}\n`);

    const names = new Map(
      (await prisma.drugSpecialty.findMany({ where: { cisCode: { in: cisCodes } }, select: { cisCode: true, name: true } })).map((row) => [row.cisCode, row.name]),
    );
    let done = 0;
    const results: SyncLine[] = [];
    // Une spécialité à la fois : chaque ligne est écrite dès qu'elle est lue, un arrêt ne perd que la dernière.
    for (const cisCode of cisCodes) {
      const [line] = await syncOfficialSideEffects({
        db: prisma,
        cisCodes: [cisCode],
        fetchPage: (url) => fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, redirect: "follow" }),
        cacheDir: parsed.cacheDir,
        pauseMs: parsed.pauseMs,
        refresh: parsed.refresh,
        dryRun: parsed.dryRun,
        log: (text) => console.log(`${WARN}${text}`),
      });
      done += 1;
      results.push(line);
      const mark = line.outcome === "FAILED" ? KO : line.outcome === "READ" || line.outcome === "SKIPPED" ? OK : WARN;
      const label = (names.get(cisCode) ?? "").slice(0, 60);
      const detail = line.error ?? (line.effects.length > 0 ? line.effects.join(", ") : "aucun effet de la liste");
      console.log(`${mark} ${String(done).padStart(4)}/${cisCodes.length} ${cisCode} ${DIM}${label}${RESET} — ${line.outcome}${line.fromCache ? " (cache)" : ""} : ${detail}`);
      // La pause entre deux téléchargements est tenue ici, d'un appel à l'autre.
      if (!line.fromCache && line.outcome !== "SKIPPED" && done < cisCodes.length) await new Promise((resolve) => setTimeout(resolve, parsed.pauseMs));
    }

    const count = (outcome: string) => results.filter((line) => line.outcome === outcome).length;
    console.log(
      `\n${BOLD}Bilan${RESET} : ${count("READ")} lu(s) dont ${results.filter((line) => line.outcome === "READ" && line.effects.length > 0).length} avec au moins un effet, ` +
        `${count("SKIPPED")} déjà à jour, ${count("NO_FREQUENCY")} sans fréquence, ${count("NO_SECTION")} sans rubrique 4.8 (RCP européen…), ` +
        `${count("NOT_FOUND")} inconnu(s) de la BDPM, ${count("FAILED")} en échec${count("FAILED") > 0 ? " — relancez la même commande pour reprendre" : ""}.\n`,
    );
    if (count("FAILED") > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\n${KO} ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
