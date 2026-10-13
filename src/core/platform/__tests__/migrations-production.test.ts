import { describe, expect, it } from "vitest";
import { destructiveOperations, directUrl } from "../../../../scripts/ci/migrations-production.mjs";

/** Le garde-fou des migrations de la publication automatique (.github/workflows/production.yml). */
describe("migrations de production", () => {
  it("se connecte en direct (sans le pooler de Neon), pour que le verrou de Prisma soit fiable", () => {
    expect(directUrl({ DATABASE_URL: "postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require" })).toBe("postgresql://u:p@ep-x.us-east-1.aws.neon.tech/neondb?sslmode=require");
    expect(directUrl({ DATABASE_URL: "postgresql://u:p@ep-x-pooler.h/db", DATABASE_URL_UNPOOLED: "postgresql://u:p@ep-x.h/db" })).toBe("postgresql://u:p@ep-x.h/db");
    expect(directUrl({})).toBeNull();
  });

  it("repère ce qui efface des données, pas ce qui en ajoute", () => {
    expect(destructiveOperations('ALTER TABLE "a" ADD COLUMN "b" TEXT;\nCREATE TABLE "c" ("id" TEXT);')).toEqual([]);
    expect(destructiveOperations('ALTER TYPE "CentralTriggerKind" ADD VALUE \'ATC\';')).toEqual([]);
    expect(destructiveOperations('ALTER TABLE "a" DROP COLUMN "b";')).toEqual(["suppression d'une colonne"]);
    expect(destructiveOperations('DROP TABLE "old";\nDELETE FROM "x";')).toEqual(["suppression d'une table", "suppression de lignes"]);
    expect(destructiveOperations('-- DROP TABLE "commentaire"\nSELECT 1;')).toEqual([]);
    expect(destructiveOperations('ALTER TABLE "a" ALTER COLUMN "b" SET DATA TYPE INTEGER;')).toEqual(["changement de type d'une colonne"]);
  });

  it("les migrations déjà livrées ne contiennent rien qui efface des données, ou bien c'était voulu (aucun faux blocage à venir)", async () => {
    const { readdirSync, readFileSync, existsSync } = await import("node:fs");
    const recent = readdirSync("prisma/migrations").filter((name) => existsSync(`prisma/migrations/${name}/migration.sql`)).sort().slice(-3);
    for (const name of recent) expect(destructiveOperations(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8")), name).toEqual([]);
  });
});
