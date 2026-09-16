/**
 * Synchronisation de la base tarifaire de l'Assurance Maladie (BdM_IT).
 *
 * Exécution : `npm run reglementation:sync -- [options]`
 *
 *   --toutes          toutes les boîtes remboursables (défaut)
 *   --cip 3400…       une ou plusieurs boîtes (répétable)
 *   --limite N        s'arrêter après N boîtes (pour un essai)
 *   --concurrence N   lectures en parallèle (défaut 3, maximum 6)
 *
 * Lit la fiche CIP de chaque boîte, écrit son statut (médicament d'exception,
 * homologation) et journalise ce qui a changé depuis la dernière passe. Le
 * site est public mais ancien : on reste à quelques requêtes par seconde.
 */

import { syncCoverageStatuses } from "../src/server/services/regulation";
import { BDM_IT_SOURCE } from "../src/core/regulation/bdm-it";

const ESC = String.fromCharCode(27);
const OK = `${ESC}[32m✓${ESC}[0m`;
const KO = `${ESC}[31m✗${ESC}[0m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

function parseArgs(argv: string[]) {
  const options: { cip13s: string[]; limit?: number; concurrency?: number } = { cip13s: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--toutes") continue;
    if (arg === "--cip") {
      const value = argv[++i];
      if (!value || !/^\d{13}$/.test(value)) throw new Error("--cip attend un code CIP à 13 chiffres.");
      options.cip13s.push(value);
    } else if (arg === "--limite") {
      options.limit = Number(argv[++i]);
      if (!Number.isInteger(options.limit) || options.limit <= 0) throw new Error("--limite attend un entier positif.");
    } else if (arg === "--concurrence") {
      options.concurrency = Number(argv[++i]);
      if (!Number.isInteger(options.concurrency) || options.concurrency <= 0) throw new Error("--concurrence attend un entier positif.");
    } else {
      throw new Error(`Option inconnue : ${arg}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`${DIM}Source : ${BDM_IT_SOURCE.name}${RESET}`);
  const startedAt = Date.now();
  let lastPrinted = 0;
  const report = await syncCoverageStatuses({
    cip13s: options.cip13s.length > 0 ? options.cip13s : undefined,
    limit: options.limit,
    concurrency: options.concurrency,
    onProgress: (done, total) => {
      if (done - lastPrinted >= 200 || done === total) {
        lastPrinted = done;
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        console.log(`${DIM}  ${done}/${total} boîtes lues (${seconds} s)${RESET}`);
      }
    },
  });
  const minutes = ((Date.now() - startedAt) / 60_000).toFixed(1);
  console.log(`${OK} ${report.records} fiches lues, ${report.exceptions} médicaments d'exception, ${report.unknown} CIP inconnus de la CNAM, ${report.changes} évolutions journalisées — ${minutes} min`);
  if (report.unreadable > 0) {
    console.log(`${KO} ${report.unreadable} fiches illisibles :`);
    for (const error of report.errors.slice(0, 20)) console.log(`   ${error.cip13} — ${error.reason}`);
    if (report.errors.length > 20) console.log(`   … et ${report.errors.length - 20} autres`);
  }
}

main().catch((error) => {
  console.error(`${KO} ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
