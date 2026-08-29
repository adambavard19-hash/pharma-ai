/**
 * Synchronisation du catalogue national des médicaments (BDPM).
 *
 * Exécution : `npm run bdpm:sync -- --from <dossier>`
 *
 *   --from <dossier>      dossier contenant les fichiers déjà téléchargés
 *   --source-date <date>  date de mise à jour ANNONCÉE PAR LA SOURCE (AAAA-MM-JJ)
 *   --source-url <url>    provenance réelle des fichiers, si ce n'est pas le
 *                         site officiel (un miroir, par exemple). Le journal
 *                         d'import doit dire d'où viennent vraiment les données.
 *   --dry-run             lit et vérifie tout, n'écrit rien dans le catalogue
 *
 * Pourquoi le script ne télécharge pas lui-même : la page de téléchargement de
 * la BDPM n'est pas joignable depuis l'environnement où ce script a été écrit,
 * et l'adresse exacte des fichiers n'a donc pas pu être vérifiée. Inventer une
 * URL aurait produit un script qui échoue chez vous sans qu'on sache pourquoi.
 * On lit donc des fichiers que vous avez téléchargés vous-même — ce qui a
 * l'avantage de rendre l'import reproductible et vérifiable.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { BDPM_FILES, BDPM_UNIMPORTED_FILES } from "../src/core/reference/bdpm/spec";
import { BDPM_SOURCE } from "../src/core/reference/attribution";
import { importBdpm, type BdpmReader } from "../src/server/services/bdpm-import";

const ESC = String.fromCharCode(27);
const OK = `${ESC}[32m✓${ESC}[0m`;
const KO = `${ESC}[31m✗${ESC}[0m`;
const WARN = `${ESC}[33m!${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

type Options = {
  from: string | null;
  sourceDate: Date | null;
  sourceUrl: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Options | { error: string } {
  const options: Options = {
    from: null,
    sourceDate: null,
    sourceUrl: BDPM_SOURCE.downloadUrl,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--from") {
      const value = argv[++i];
      if (!value) return { error: "--from attend un chemin de dossier." };
      options.from = path.resolve(value.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
    } else if (arg === "--source-date") {
      const value = argv[++i];
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { error: "--source-date attend une date au format AAAA-MM-JJ." };
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) return { error: `Date invalide : ${value}` };
      options.sourceDate = date;
    } else if (arg === "--source-url") {
      const value = argv[++i];
      if (!value) return { error: "--source-url attend une adresse." };
      options.sourceUrl = value;
    } else {
      return { error: `Option inconnue : ${arg}` };
    }
  }

  return options;
}

function usage() {
  console.log(`
${BOLD}Synchronisation du catalogue national des médicaments${RESET}

  npm run bdpm:sync -- --from <dossier> [--source-date AAAA-MM-JJ] [--dry-run]

${BOLD}1. Télécharger les fichiers${RESET}
  Rendez-vous sur ${BDPM_SOURCE.downloadUrl}
  et enregistrez ces fichiers dans un même dossier :

${BDPM_FILES.map((spec) => `    ${spec.fileName.padEnd(24)} ${DIM}${spec.label}${RESET}`).join("\n")}

  Notez la date de mise à jour affichée par le site en face de chaque fichier :
  c'est elle que la licence impose d'afficher au pharmacien, pas la date de
  votre import.

  ${DIM}Si vous préférez la ligne de commande, la page lie ses fichiers sous la forme
  ci-dessous. ${BOLD}Cette adresse n'a pas pu être vérifiée${RESET}${DIM} depuis l'environnement de
  développement (accès sortant bloqué) : vérifiez que les fichiers obtenus ne
  sont pas des pages d'erreur avant de lancer l'import.

  mkdir -p ~/bdpm && cd ~/bdpm
${BDPM_FILES.map((spec) => `  curl -fOR "${BDPM_SOURCE.url}/download/file/${spec.fileName}"`).join("\n")}

  L'option -R conserve la date de dernière modification annoncée par le serveur.${RESET}

${BOLD}2. Lancer l'import${RESET}
  npm run bdpm:sync -- --from ~/bdpm --source-date 2026-08-25

  ${DIM}Sur macOS, le dossier que le Finder affiche « Téléchargements » s'appelle
  ~/Downloads sur le disque : c'est ce nom-là qu'attend le terminal.${RESET}

  Ajoutez ${BOLD}--dry-run${RESET} pour tout vérifier sans rien écrire.
`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.log(`\n${KO} ${parsed.error}`);
    usage();
    process.exitCode = 1;
    return;
  }

  if (!parsed.from) {
    usage();
    process.exitCode = 1;
    return;
  }

  const directory = parsed.from;
  const directoryExists = await stat(directory)
    .then((info) => info.isDirectory())
    .catch(() => false);

  if (!directoryExists) {
    console.log(`\n${KO} Dossier introuvable : ${directory}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${BOLD}Catalogue national des médicaments${RESET}`);
  console.log(`${DIM}${directory}${RESET}`);
  console.log(`${DIM}Source : ${BDPM_SOURCE.name} — ${BDPM_SOURCE.publishersLabel}${RESET}`);
  console.log(`${DIM}Provenance des fichiers : ${parsed.sourceUrl}${RESET}\n`);

  if (!parsed.sourceDate) {
    console.log(
      `${WARN} Aucune date de mise à jour fournie. Elle sera enregistrée comme inconnue\n` +
        `  et l'application affichera « date non communiquée ». Relancez avec\n` +
        `  ${BOLD}--source-date AAAA-MM-JJ${RESET} en reprenant la date affichée par la source.\n`,
    );
  }

  const read: BdpmReader = async (fileName) => {
    try {
      const buffer = await readFile(path.join(directory, fileName));
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  };

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    console.log(`${BOLD}Lecture${RESET}`);
    const result = await importBdpm(prisma, read, {
      dryRun: parsed.dryRun,
      sourceUpdatedAt: parsed.sourceDate,
      sourceUrl: parsed.sourceUrl,
      onProgress: (message) => console.log(`${DIM}${message}${RESET}`),
    });

    if (result.status === "FAILED") {
      console.log(`\n${KO} ${BOLD}Import interrompu${RESET}`);
      console.log(`  ${result.error}`);
      console.log(`\n${DIM}Le catalogue existant n'a pas été remplacé.${RESET}\n`);
      process.exitCode = 1;
      return;
    }

    console.log(`\n${BOLD}Résultat${RESET}`);
    console.log(
      `  ${"Fichier".padEnd(26)}${"lues".padStart(8)}${"créées".padStart(9)}${"modifiées".padStart(11)}${"inchangées".padStart(12)}${"ignorées".padStart(10)}`,
    );
    for (const report of result.fileReports) {
      console.log(
        `  ${report.fileName.padEnd(26)}` +
          `${String(report.read).padStart(8)}` +
          `${String(report.created).padStart(9)}` +
          `${String(report.updated).padStart(11)}` +
          `${String(report.unchanged).padStart(12)}` +
          `${String(report.skipped).padStart(10)}`,
      );
      for (const [reason, count] of Object.entries(report.skipReasons)) {
        console.log(`    ${DIM}${count} × ${reason}${RESET}`);
      }
    }

    if (result.missingFiles.length > 0) {
      console.log(
        `\n${WARN} Fichiers facultatifs absents : ${result.missingFiles.join(", ")}`,
      );
    }

    if (!parsed.dryRun) {
      console.log(
        `\n  Retirées de la source : ${result.retired.specialties} spécialité(s), ` +
          `${result.retired.presentations} présentation(s).`,
      );
      console.log(
        `  ${DIM}Marquées retirées, jamais supprimées : un stock d'officine peut encore\n` +
          `  les référencer.${RESET}`,
      );
    }

    console.log(
      `\n${DIM}Non importés à ce stade (format non vérifié) :\n` +
        BDPM_UNIMPORTED_FILES.map((file) => `  ${file.fileName} — ${file.reason}`).join("\n") +
        RESET,
    );

    const seconds = (result.durationMs / 1000).toFixed(1);
    if (parsed.dryRun) {
      console.log(
        `\n${OK} ${BOLD}Vérification terminée en ${seconds} s${RESET} — ${BOLD}rien n'a été écrit${RESET}.`,
      );
      console.log(`${DIM}  Relancez sans --dry-run pour appliquer.${RESET}\n`);
    } else {
      console.log(`\n${OK} ${BOLD}Catalogue mis à jour en ${seconds} s${RESET}`);
      console.log(
        `${DIM}  Source : ${BDPM_SOURCE.name} (${BDPM_SOURCE.url}), publiée par\n` +
          `  ${BDPM_SOURCE.publishersLabel}. Mise à jour de la source : ` +
          `${result.sourceUpdatedAt ? result.sourceUpdatedAt.toISOString().slice(0, 10) : "non communiquée"}.${RESET}\n`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\n${KO} Synchronisation interrompue :`, error);
  process.exit(1);
});
