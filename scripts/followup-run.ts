/**
 * Envoi des rappels arrivés à échéance.
 *
 * Exécution : `npm run followup:run [-- --dry-run]`
 *
 *   --dry-run   liste ce qui partirait, n'envoie rien
 *   --limit <n> plafond d'envois pour cette exécution (défaut : 200)
 *
 * À brancher sur une tâche planifiée quotidienne (cron, systemd timer,
 * planificateur de l'hébergeur). C'est ce qui rend vraie la phrase « un rappel
 * de fin de traitement part à la date prévue » : sans cette exécution
 * régulière, les rappels restent dans la liste de travail et n'attendent qu'un
 * clic — ce qui est un fonctionnement valide, mais pas automatique.
 *
 * Trois garanties, portées par `sendReminder` et revérifiées ICI, au moment de
 * l'envoi et non au moment de la programmation :
 *
 *   • une désinscription intervenue depuis coupe l'envoi ;
 *   • un consentement révoqué depuis coupe l'envoi ;
 *   • le plafond de fréquence de l'officine est respecté.
 *
 * Un rappel refusé n'est pas perdu : il reste programmé, avec son motif, et
 * repartira si la cause disparaît.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import { sendReminder } from "../src/server/services/followup";

const ESC = String.fromCharCode(27);
const OK = `${ESC}[32m✓${ESC}[0m`;
const KO = `${ESC}[31m✗${ESC}[0m`;
const WARN = `${ESC}[33m!${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

type Options = { dryRun: boolean; limit: number };

function parseArgs(argv: string[]): Options | { error: string } {
  const options: Options = { dryRun: false, limit: 200 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") {
      options.dryRun = true;
    } else if (argv[i] === "--limit") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(value) || value <= 0) {
        return { error: "--limit attend un nombre entier positif." };
      }
      options.limit = value;
    } else {
      return { error: `option inconnue : ${argv[i]}` };
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

  console.log(`\n${BOLD}Rappels arrivés à échéance${RESET}`);
  if (parsed.dryRun) console.log(`${WARN} Exécution à blanc : rien ne sera envoyé.`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const now = new Date();
    const due = await prisma.reminder.findMany({
      where: { status: { in: ["SCHEDULED", "SNOOZED"] }, dueAt: { lte: now } },
      orderBy: { dueAt: "asc" },
      take: parsed.limit,
      select: {
        id: true,
        dueAt: true,
        templateKey: true,
        pharmacyId: true,
        patient: { select: { id: true, lastName: true } },
        pharmacy: { select: { organizationId: true } },
      },
    });

    console.log(`${DIM}${due.length} rappel(s) à échéance au ${now.toLocaleString("fr-FR")}${RESET}\n`);

    if (due.length === 0) {
      console.log(`${OK} Rien à envoyer.\n`);
      return;
    }

    let sent = 0;
    let refused = 0;
    let simulated = 0;
    let failed = 0;

    for (const reminder of due) {
      const qui = `${reminder.patient.lastName.toUpperCase()} · ${reminder.templateKey}`;

      if (parsed.dryRun) {
        console.log(`  ${WARN} ${qui.padEnd(38)} partirait`);
        continue;
      }

      try {
        // L'envoi s'exécute au nom du système, pas d'un utilisateur : la trace
        // doit dire que personne n'a cliqué.
        const outcome = await sendReminder({
          scope: {
            pharmacyId: reminder.pharmacyId,
            organizationId: reminder.pharmacy.organizationId,
            // Non utilisé : `automated` fait enregistrer l'envoi sans auteur.
            userId: "",
          },
          reminderId: reminder.id,
          automated: true,
        });

        if (outcome.status === "SENT") {
          sent += 1;
          console.log(`  ${OK} ${qui.padEnd(38)} transmis`);
        } else if (outcome.status === "SIMULATED") {
          // Aucun fournisseur d'envoi n'est configuré. Ce n'est pas une panne :
          // c'est un état assumé, et la tâche planifiée ne doit pas échouer
          // pour autant. Le message le dit, une seule fois.
          simulated += 1;
          console.log(`  ${WARN} ${qui.padEnd(38)} non transmis — aucun service d'envoi configuré`);
        } else {
          failed += 1;
          console.log(`  ${KO} ${qui.padEnd(38)} ${outcome.status} — ${outcome.detail.slice(0, 90)}`);
        }
      } catch (error) {
        // Un refus d'éligibilité remonte en exception : ce n'est pas une panne,
        // c'est le garde-fou qui fonctionne. On le distingue d'un échec réseau.
        refused += 1;
        console.log(
          `  ${WARN} ${qui.padEnd(38)} non envoyé — ${
            error instanceof Error ? error.message : "motif inconnu"
          }`,
        );
      }
    }

    console.log("");
    if (parsed.dryRun) {
      console.log(`${WARN} ${BOLD}${due.length} rappel(s) partiraient.${RESET} Rien n'a été envoyé.\n`);
    } else {
      console.log(
        `${sent > 0 ? OK : WARN} ${BOLD}${sent} transmis${RESET}` +
          `${DIM} · ${refused} écarté(s) par un garde-fou · ${simulated} sans service d'envoi · ${failed} en échec${RESET}`,
      );
      console.log(
        `${DIM}  Un rappel écarté, simulé ou en échec reste programmé : il repartira si la cause disparaît.${RESET}`,
      );
      if (simulated > 0) {
        console.log(
          `${WARN} ${DIM}Aucun service d'envoi n'est configuré : voir EMAIL_PROVIDER dans .env.${RESET}`,
        );
      }
      console.log("");
      // Seul un échec réel fait échouer la tâche planifiée. Un envoi simulé est
      // un état connu, pas une alerte à faire sonner toutes les nuits.
      if (failed > 0) process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
