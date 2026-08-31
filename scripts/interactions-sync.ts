/**
 * Chargement d'un référentiel d'interactions médicamenteuses.
 *
 * Exécution : `npm run interactions:sync -- --from <dossier>`
 *
 *   --from <dossier>   dossier contenant meta.json, interactions.tsv et,
 *                      facultativement, classes.tsv
 *   --source-url <url> provenance réelle des fichiers, si elle diffère de
 *                      celle déclarée dans meta.json
 *   --dry-run          lit et vérifie tout, n'écrit rien
 *
 * Pourquoi ce script ne télécharge rien : il n'existe pas, à ce jour, de
 * référentiel français d'interactions publié dans un format exploitable par
 * une machine. Le thésaurus national de l'ANSM est un PDF, et l'ANSM a cessé
 * de le mettre à jour — la dernière version date de septembre 2023. Fabriquer
 * un référentiel à partir d'une extraction approximative de ce PDF reviendrait
 * à inventer des données de sécurité : c'est exactement ce que ce produit
 * s'interdit.
 *
 * L'officine fournit donc le fichier, depuis la source de son choix — sa base
 * sous licence, son groupement, ou une extraction du thésaurus qu'elle a
 * vérifiée. Pharma.ai le charge, le date et cite sa provenance sur chaque
 * alerte. Il ne le complète jamais.
 *
 * Format attendu, décrit dans docs/INTERACTIONS.md.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import {
  ALIASES_FILE,
  CLASSES_FILE,
  INTERACTIONS_FILE,
  META_FILE,
  ANSM_THESAURUS_NOTICE,
} from "../src/core/interactions";
import { importInteractions } from "../src/server/services/interactions-import";

const ESC = String.fromCharCode(27);
const OK = `${ESC}[32m✓${ESC}[0m`;
const KO = `${ESC}[31m✗${ESC}[0m`;
const WARN = `${ESC}[33m!${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

type Options = { from: string | null; sourceUrl: string | null; dryRun: boolean };

function parseArgs(argv: string[]): Options | { error: string } {
  const options: Options = { from: null, sourceUrl: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--from") {
      const value = argv[++i];
      if (!value) return { error: "--from attend un chemin de dossier." };
      options.from = path.resolve(value.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
    } else if (arg === "--source-url") {
      const value = argv[++i];
      if (!value) return { error: "--source-url attend une adresse." };
      options.sourceUrl = value;
    } else {
      return { error: `option inconnue : ${arg}` };
    }
  }
  return options;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(`\n${KO} ${parsed.error}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${BOLD}Référentiel d'interactions médicamenteuses${RESET}`);

  if (!parsed.from) {
    console.log(`\n${KO} Indiquez le dossier des fichiers : ${BOLD}--from <dossier>${RESET}\n`);
    console.log(`  Fichiers attendus dans ce dossier :`);
    console.log(`    ${BOLD}${META_FILE}${RESET}          nom, version et date du référentiel (obligatoire)`);
    console.log(`    ${BOLD}${INTERACTIONS_FILE}${RESET}  les couples et leur niveau (obligatoire)`);
    console.log(`    ${BOLD}${CLASSES_FILE}${RESET}       les substances de chaque classe (facultatif)`);
    console.log(`    ${BOLD}${ALIASES_FILE}${RESET}         correspondances de vocabulaire (facultatif)`);
    console.log(`\n${DIM}  Le format est décrit dans docs/INTERACTIONS.md.${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  const directory = parsed.from;
  const exists = await stat(directory).then((s) => s.isDirectory()).catch(() => false);
  if (!exists) {
    console.error(`\n${KO} Dossier introuvable : ${directory}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`${DIM}${directory}${RESET}`);
  if (parsed.dryRun) console.log(`${WARN} Exécution à blanc : rien ne sera écrit.`);
  console.log("");

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const result = await importInteractions({
      isDryRun: parsed.dryRun,
      sourceUrl: parsed.sourceUrl ?? undefined,
      read: async (fileName) =>
        readFile(path.join(directory, fileName), "utf8").catch(() => null),
    });

    for (const file of result.files) {
      console.log(`  ${OK} ${file.file.padEnd(20)} ${String(file.rows).padStart(6)} ligne(s)`);
    }

    if (result.status === "FAILED") {
      console.error(`\n${KO} ${BOLD}Import interrompu.${RESET}`);
      console.error(`\n${result.error}\n`);
      console.error(
        `${DIM}  Rien n'a été modifié : le référentiel en place, s'il y en avait un, est intact.${RESET}\n`,
      );
      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log(`  Référentiel  ${BOLD}${result.meta?.name}${RESET} ${result.meta?.version}`);
    console.log(
      `  Mise à jour  ${result.meta?.updatedAt?.toLocaleDateString("fr-FR") ?? "non renseignée"}`,
    );
    console.log(`  Règles       ${result.rules}`);
    console.log(`  Classes      ${result.classMembers} appartenance(s)`);
    console.log(`  Alias        ${result.aliases} correspondance(s) de vocabulaire`);

    // L'information la plus utile de l'import : ce qui ne se rencontrera
    // jamais. Un référentiel valide peut ne rien déclencher simplement parce
    // qu'il n'écrit pas les substances comme le catalogue national.
    if (result.unmatchedSubstances > 0) {
      console.log(
        `\n${WARN} ${BOLD}${result.unmatchedSubstances} substance(s) du référentiel ne correspondent à aucun libellé du catalogue national.${RESET}`,
      );
      console.log(
        `${DIM}  Elles ne déclencheront jamais d'alerte. Déclarez leur équivalent dans ${ALIASES_FILE}.${RESET}`,
      );
      for (const sample of result.unmatchedSamples) console.log(`${DIM}    · ${sample}${RESET}`);
    } else {
      console.log(
        `${DIM}  Toutes les substances citées ont un équivalent dans le catalogue national.${RESET}`,
      );
    }
    if (result.removedRules > 0) {
      console.log(
        `${DIM}  ${result.removedRules} règle(s) présente(s) auparavant ne figurent plus dans ce fichier.${RESET}`,
      );
    }

    console.log(
      `\n${parsed.dryRun ? WARN : OK} ${BOLD}${
        parsed.dryRun ? "Vérification terminée — rien n'a été écrit." : "Référentiel chargé."
      }${RESET}`,
    );
    console.log(`\n${WARN} ${DIM}${ANSM_THESAURUS_NOTICE}${RESET}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
