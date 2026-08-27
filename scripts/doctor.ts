/**
 * Diagnostic d'installation.
 *
 * Exécution : `npm run doctor`
 *
 * Vérifie, dans l'ordre où les choses cassent en pratique : le fichier de
 * configuration, les variables obligatoires, l'accès à la base, l'application
 * des migrations, puis la présence du jeu de démonstration. Chaque échec
 * indique la commande exacte qui le corrige — l'objectif est qu'une personne
 * non développeuse puisse se débloquer seule.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

const ESC = "[";
const OK = `${ESC}32m✓${ESC}0m`;
const KO = `${ESC}31m✗${ESC}0m`;
const WARN = `${ESC}33m!${ESC}0m`;
const DIM = `${ESC}2m`;
const BOLD = `${ESC}1m`;
const RED = `${ESC}31m`;
const RESET = `${ESC}0m`;

const ENV_PATH = path.join(process.cwd(), ".env");
const PLACEHOLDERS = ["remplacer-par", "changeme", "a-remplacer"];

const problems: { title: string; fix: string }[] = [];

function pass(message: string, detail?: string) {
  console.log(`  ${OK} ${message}${detail ? `${DIM}  ${detail}${RESET}` : ""}`);
}

function fail(message: string, title: string, fix: string) {
  console.log(`  ${KO} ${message}`);
  problems.push({ title, fix });
}

function warn(message: string) {
  console.log(`  ${WARN} ${message}`);
}

async function main() {
  console.log(`\n${BOLD}Diagnostic Pharma.ai${RESET}\n`);

  // --- 1. Fichier de configuration ------------------------------------------
  console.log(`${BOLD}Configuration${RESET}`);

  if (!existsSync(ENV_PATH)) {
    fail(
      "Le fichier .env est absent",
      "Configuration manquante",
      "cp .env.example .env\n     puis renseignez DATABASE_URL et les deux secrets (voir README).",
    );
    report();
    return;
  }
  pass("Fichier .env présent");

  const env = readFileSync(ENV_PATH, "utf8");
  const read = (key: string): string | null => {
    const match = env.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]*)"?`, "m"));
    return match ? match[1].trim() : null;
  };

  const databaseUrl = read("DATABASE_URL");
  const sessionSecret = read("AUTH_SESSION_SECRET");
  const encryptionKey = read("DATA_ENCRYPTION_KEY");

  if (!databaseUrl) {
    fail(
      "DATABASE_URL n'est pas renseigné",
      "Base de données non configurée",
      'Ouvrez .env et renseignez DATABASE_URL, par exemple :\n' +
        '     DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pharma_ai?schema=public"',
    );
  } else {
    pass("DATABASE_URL renseigné", databaseUrl.replace(/:\/\/[^@]*@/, "://***@"));
  }

  if (!sessionSecret || sessionSecret.length < 32) {
    fail(
      `AUTH_SESSION_SECRET ${
        sessionSecret
          ? `trop court (${sessionSecret.length} caractères, 32 minimum)`
          : "absent"
      }`,
      "Secret de session invalide",
      "Générez-en un puis collez-le dans .env :\n     openssl rand -base64 48",
    );
  } else if (PLACEHOLDERS.some((placeholder) => sessionSecret.includes(placeholder))) {
    fail(
      "AUTH_SESSION_SECRET est encore la valeur d'exemple",
      "Secret de session non renseigné",
      "openssl rand -base64 48   puis collez le résultat dans .env",
    );
  } else {
    pass("AUTH_SESSION_SECRET renseigné");
  }

  if (
    !encryptionKey ||
    PLACEHOLDERS.some((placeholder) => encryptionKey.includes(placeholder))
  ) {
    fail(
      "DATA_ENCRYPTION_KEY absent ou encore à sa valeur d'exemple",
      "Clé de chiffrement non renseignée",
      "openssl rand -base64 32   puis collez le résultat dans .env",
    );
  } else {
    pass("DATA_ENCRYPTION_KEY renseigné");
  }

  if (problems.length > 0) {
    report();
    return;
  }

  // --- 2. Base de données ----------------------------------------------------
  console.log(`\n${BOLD}Base de données${RESET}`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl as string }),
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    pass("Connexion à PostgreSQL établie");
  } catch (error) {
    // Les erreurs Prisma commencent par une ligne générique ; la cause utile
    // (refus de connexion, base inexistante, mot de passe) est plus bas.
    const raw = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    const lines = [raw, cause]
      .flatMap((text) => text.split("\n"))
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^Invalid `/.test(line));
    const SIGNIFICANT =
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|authentication|password|does not exist|n'existe pas|role .* does not|Can't reach|timeout/i;
    const message =
      lines.find((line) => SIGNIFICANT.test(line)) ??
      lines[lines.length - 1] ??
      "PostgreSQL ne répond pas";

    fail(
      `Connexion impossible — ${message}`,
      "Base de données injoignable",
      "Vérifiez que PostgreSQL tourne et que DATABASE_URL est correct.\n" +
        "     macOS   : brew services start postgresql@16\n" +
        "     Linux   : sudo systemctl start postgresql\n" +
        "     Docker  : docker run -d --name pharma-db -e POSTGRES_PASSWORD=postgres \\\n" +
        "                 -p 5432:5432 postgres:16\n" +
        "     Créer la base : createdb pharma_ai",
    );
    await prisma.$disconnect();
    report();
    return;
  }

  let migrationsApplied = false;
  try {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL`;
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) {
      migrationsApplied = true;
      pass("Migrations appliquées", `${count} migration(s)`);
    } else {
      fail("Aucune migration appliquée", "Schéma absent", "npm run db:deploy");
    }
  } catch {
    fail(
      "Le schéma n'existe pas dans cette base",
      "Schéma absent",
      "npm run db:deploy   (crée les tables)",
    );
  }

  // --- 3. Comptes et jeu de démonstration ------------------------------------
  if (migrationsApplied) {
    console.log(`\n${BOLD}Comptes et données${RESET}`);
    try {
      const [users, pharmacies, patients, prescriptions] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.pharmacy.count(),
        prisma.patient.count(),
        prisma.prescription.count(),
      ]);

      if (users === 0) {
        fail(
          "Aucun compte dans la base — c'est très probablement pourquoi la connexion échoue",
          "Aucun compte utilisateur",
          "npm run db:seed   (installe l'officine et les comptes de démonstration)",
        );
      } else {
        pass(`${users} compte(s) utilisateur`);
        const accounts = await prisma.user.findMany({
          where: { deletedAt: null, status: "ACTIVE" },
          select: { email: true },
          orderBy: { createdAt: "asc" },
          take: 8,
        });
        console.log(
          `${DIM}     ${accounts.map((account) => account.email).join("\n     ")}${RESET}`,
        );
        pass(
          `${pharmacies} officine(s), ${patients} patient(s), ${prescriptions} ordonnance(s)`,
        );

        if (patients === 0) {
          warn("Aucune donnée de démonstration — lancez `npm run db:seed`");
        }
      }

      const admins = await prisma.platformAdmin.count();
      if (admins > 0) {
        pass(`${admins} administrateur(s) plateforme`, "connexion sur /admin-connexion");
      }
    } catch (error) {
      fail(
        `Lecture impossible — ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`,
        "Schéma incomplet",
        "npm run db:deploy && npm run db:seed",
      );
    }
  }

  await prisma.$disconnect();
  report();
}

function report() {
  console.log("");

  if (problems.length === 0) {
    console.log(`${OK} ${BOLD}Tout est en place.${RESET}\n`);
    console.log(`  Lancez l'application :  ${BOLD}npm run dev${RESET}`);
    console.log(`  Puis ouvrez :           ${BOLD}http://localhost:3000${RESET}\n`);
    console.log(`  Mot de passe commun :   ${BOLD}Demo2026!Pharma${RESET}`);
    console.log(
      `${DIM}  Sur l'écran de connexion, les profils de démonstration sont cliquables :\n` +
        `  aucun mot de passe à saisir.${RESET}\n`,
    );
    return;
  }

  console.log(`${BOLD}${RED}${problems.length} problème(s) à corriger${RESET}\n`);
  problems.forEach((problem, index) => {
    console.log(`  ${BOLD}${index + 1}. ${problem.title}${RESET}`);
    console.log(`     ${problem.fix}\n`);
  });
  console.log(`${DIM}  Relancez ensuite : npm run doctor${RESET}\n`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("\nDiagnostic interrompu :", error);
  process.exit(1);
});
