/**
 * Les migrations de la base de production, appliquées par la publication automatique (.github/workflows/production.yml).
 *
 *   node scripts/ci/migrations-production.mjs
 *
 * Lit DATABASE_URL (et DATABASE_URL_UNPOOLED s'il existe) dans l'environnement — jamais dans le code — puis :
 *   1. se connecte en DIRECT (sans le pooler de Neon) : le verrou de Prisma (pg_advisory_lock) n'est fiable que sur une
 *      connexion directe ; il reste ACTIF, si bien que deux publications ne migrent jamais en même temps (la publication
 *      automatique n'en lance de toute façon qu'une à la fois) ;
 *   2. refuse de continuer si une migration précédente est restée à moitié appliquée ;
 *   3. liste les migrations en attente et refuse toute opération qui efface des données (DROP TABLE, DROP COLUMN,
 *      TRUNCATE, DELETE…) sauf si le message de la version publiée contient « [migration-destructive-validee] » ;
 *   4. applique les migrations (`prisma migrate deploy`) et écrit le compte rendu dans l'historique de la publication.
 *
 * Aucun mot de passe n'est jamais affiché : l'adresse de la base n'apparaît que sous la forme « hôte / base ».
 */
import { readdirSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = "prisma/migrations";
const DESTRUCTIVE_OK = "[migration-destructive-validee]";
const DESTRUCTIVE = [
  [/\bDROP\s+TABLE\b/i, "suppression d'une table"],
  [/\bDROP\s+COLUMN\b/i, "suppression d'une colonne"],
  [/\bTRUNCATE\b/i, "vidage d'une table"],
  [/\bDELETE\s+FROM\b/i, "suppression de lignes"],
  [/\bDROP\s+TYPE\b/i, "suppression d'un type"],
  [/\bALTER\s+COLUMN\s+"?[\w]+"?\s+(SET\s+DATA\s+)?TYPE\b/i, "changement de type d'une colonne"],
  [/\bDROP\s+SCHEMA\b/i, "suppression d'un schéma"],
];

const summary = (line) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  console.log(line);
};

function fail(title, detail) {
  summary(`\n### ❌ ${title}\n\n${detail}\n\nRien n'a été mis en ligne : le site reste sur la version précédente.`);
  console.error(`::error title=${title}::${detail.replace(/\n/g, " ")}`);
  process.exit(1);
}

/** L'adresse directe : DATABASE_URL_UNPOOLED si Neon la fournit, sinon DATABASE_URL sans « -pooler ». */
export function directUrl(env) {
  const raw = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!raw) return null;
  const url = new URL(raw);
  url.hostname = url.hostname.replace("-pooler.", ".");
  return url.toString();
}

/** Ce qui, dans le SQL d'une migration, efface des données. Les commentaires ne comptent pas. */
export function destructiveOperations(sql) {
  const code = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return DESTRUCTIVE.filter(([pattern]) => pattern.test(code)).map(([, label]) => label);
}

async function main() {
  const url = directUrl(process.env);
  if (!url) fail("Adresse de la base introuvable", "La variable DATABASE_URL de production n'a pas été récupérée depuis Vercel. Vérifiez qu'elle existe pour l'environnement « Production » du projet.");
  const where = (() => {
    const parsed = new URL(url);
    return `${parsed.hostname} / ${parsed.pathname.slice(1)}`;
  })();

  const local = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(MIGRATIONS_DIR, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20_000 });
  try {
    await client.connect();
  } catch (error) {
    fail("Base de production injoignable", `Connexion impossible à ${where} (${error.code ?? "erreur réseau"}). La base Neon est peut-être en pause ou l'adresse a changé.`);
  }

  let applied = new Set();
  try {
    const table = await client.query(`SELECT to_regclass('public._prisma_migrations') AS t`);
    if (table.rows[0].t) {
      const broken = await client.query(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`);
      if (broken.rows.length > 0) {
        fail(
          "Une migration précédente est restée inachevée",
          `Migration bloquée : ${broken.rows.map((row) => row.migration_name).join(", ")}. Il faut la réparer à la main avant toute nouvelle publication (prisma migrate resolve).`,
        );
      }
      const rows = await client.query(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
      applied = new Set(rows.rows.map((row) => row.migration_name));
    }
  } finally {
    await client.end();
  }

  const unknown = [...applied].filter((name) => !local.includes(name));
  if (unknown.length > 0) {
    fail("La base est en avance sur le code", `La base contient des migrations absentes du code publié : ${unknown.join(", ")}. On ne publie pas une version plus ancienne que la base.`);
  }

  const pending = local.filter((name) => !applied.has(name));
  summary(`## Base de données\n\nBase : \`${where}\` · ${applied.size} migration(s) déjà appliquée(s) · **${pending.length} en attente**.`);
  if (pending.length === 0) {
    summary("\n✅ Aucune migration à appliquer.");
    return;
  }

  const message = process.env.COMMIT_MESSAGE ?? "";
  const risky = pending.map((name) => ({ name, ops: destructiveOperations(readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8")) })).filter((entry) => entry.ops.length > 0);
  for (const name of pending) summary(`- ${name}`);
  if (risky.length > 0 && !message.includes(DESTRUCTIVE_OK)) {
    fail(
      "Migration qui efface des données : publication arrêtée",
      `${risky.map((entry) => `${entry.name} (${entry.ops.join(", ")})`).join(" ; ")}. Si c'est voulu et vérifié, republiez avec « ${DESTRUCTIVE_OK} » dans le message de la version.`,
    );
  }

  // Le verrou de Prisma reste actif : jamais PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK ici.
  const env = { ...process.env, DATABASE_URL: url };
  delete env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK;
  const run = spawnSync("npx", ["prisma", "migrate", "deploy"], { env, encoding: "utf8" });
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.replaceAll(url, where);
  console.log(output);
  if (run.status !== 0) {
    const reason = /P1002|advisory lock/i.test(output)
      ? "Une autre migration était en cours (verrou occupé). Relancez la publication dans quelques minutes."
      : (output.match(/Error:[^\n]*/)?.[0] ?? "Voir le détail de l'étape « Migrations » ci-dessus.");
    fail("Les migrations ont échoué", reason);
  }
  summary(`\n✅ ${pending.length} migration(s) appliquée(s).`);
}

// Lancé en commande (pas importé par les tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
