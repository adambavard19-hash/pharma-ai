import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 ne charge plus `.env` automatiquement.
loadEnv({ path: ".env", quiet: true });

/**
 * Prisma 7 configuration.
 *
 * The connection string never lives in the schema file: it is read from the
 * environment here (migrations / introspection) and passed to the driver
 * adapter at runtime in `src/server/db/client.ts`.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
