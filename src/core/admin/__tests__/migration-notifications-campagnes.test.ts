import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La migration `20261007090000_notifications_campagnes` est APPLIQUÉE en
 * production sur une base qui contient déjà des officines, des ordonnances, des
 * contrats. Elle n'a le droit que d'ajouter : des types, des tables, des index,
 * des clés étrangères entre tables neuves, et deux colonnes à `pharmacies` qui
 * ne cassent aucune ligne existante. Aucun `DROP`, aucun `RENAME`, aucun
 * `DELETE`, aucune modification d'une colonne existante.
 *
 * Et ce que le schéma Prisma déclare pour ce lot doit y figurer en entier : une
 * table, une colonne, un index ou une clé étrangère oubliés dans le SQL, c'est
 * un déploiement qui compile et qui échoue à la première requête.
 *
 * Le test lit les fichiers, il n'ouvre aucune base. Chaque détecteur est éprouvé
 * sur des sources fautives.
 */

const ROOT = join(__dirname, "../../../..");
const SQL = readFileSync(join(ROOT, "prisma/migrations/20261007090000_notifications_campagnes/migration.sql"), "utf8");
const SCHEMA = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");

/** Les tables et types que ce lot crée. La liste est dite ici ET relue dans le schéma : l'une ne peut pas dériver sans l'autre. */
const LOT_MODELS = ["PatientNewsSubscription", "PatientNewsAnnouncement", "PatientNewsDelivery", "Campaign", "CampaignRecipient", "MarketingOptOut", "ReferralOffer"];
const LOT_ENUMS = ["PatientNewsStatus", "CampaignKind", "CampaignStatus"];
/** Les seules colonnes ajoutées à une table qui existait déjà. */
const PHARMACY_COLUMNS = ["patientNewsEnabled", "referralAmountCents"];

// ---------------------------------------------------------------- Lecture du SQL

/** Le SQL sans commentaires : un commentaire a le droit de dire « ne supprime rien ». */
function withoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function statementsOf(sql: string): string[] {
  return withoutComments(sql)
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const DESTRUCTIVE: [RegExp, string][] = [
  [/\bDROP\b/i, "DROP"],
  [/\bRENAME\b/i, "RENAME"],
  [/\bDELETE\s+FROM\b/i, "DELETE FROM"],
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/^\s*UPDATE\b/im, "UPDATE"],
  [/^\s*INSERT\b/im, "INSERT"],
  [/\bALTER\s+COLUMN\b/i, "ALTER COLUMN"],
  [/\bSET\s+NOT\s+NULL\b/i, "SET NOT NULL"],
  [/\bALTER\s+TYPE\b/i, "ALTER TYPE"],
];

/** Les formes d'instruction permises : le reste est refusé, même inoffensif en apparence. */
const ALLOWED_STATEMENT = [/^CREATE TYPE "\w+" AS ENUM \(/, /^CREATE TABLE "\w+" \(/, /^CREATE (?:UNIQUE )?INDEX "[^"]+" ON "\w+"\(/, /^ALTER TABLE "\w+" ADD (?:COLUMN|CONSTRAINT) /];

/** Les actions d'un `ALTER TABLE`, séparées : `ADD COLUMN …,\nADD COLUMN …`. */
function alterActions(statement: string): string[] {
  return statement
    .replace(/^ALTER TABLE "\w+"\s+/, "")
    .split(/,\s*\n(?=\s*(?:ADD|DROP|ALTER|RENAME)\b)/i)
    .map((action) => action.trim());
}

function migrationViolations(sql: string): string[] {
  const clean = withoutComments(sql);
  const violations: string[] = [];
  for (const [pattern, label] of DESTRUCTIVE) if (pattern.test(clean)) violations.push(`contient ${label}`);

  const created = new Set([...clean.matchAll(/CREATE TABLE "(\w+)"/g)].map((match) => match[1]));
  for (const statement of statementsOf(sql)) {
    const head = statement.split("\n")[0].slice(0, 80);
    if (!ALLOWED_STATEMENT.some((form) => form.test(statement))) {
      violations.push(`instruction non permise : ${head}`);
      continue;
    }
    const alter = /^ALTER TABLE "(\w+)"/.exec(statement);
    if (!alter) continue;
    const table = alter[1];
    for (const action of alterActions(statement)) {
      if (/^ADD COLUMN\b/i.test(action)) {
        if (created.has(table)) continue;
        // Une colonne ajoutée à une table qui existait déjà ne doit casser aucune ligne : nullable, ou une valeur par défaut.
        if (/\bNOT NULL\b/i.test(action) && !/\bDEFAULT\b/i.test(action)) violations.push(`colonne obligatoire sans valeur par défaut sur une table existante : ${table} (${action.slice(0, 50)})`);
      } else if (/^ADD CONSTRAINT\b/i.test(action)) {
        if (!created.has(table)) violations.push(`contrainte ajoutée à une table qui existait déjà : ${table}`);
      } else {
        violations.push(`action non permise sur ${table} : ${action.slice(0, 50)}`);
      }
    }
  }
  return violations;
}

describe("la migration des notifications et campagnes est additive", () => {
  it("le test lit bien la migration", () => {
    expect(statementsOf(SQL).length).toBeGreaterThan(30);
    expect(SQL).toContain('CREATE TABLE "patient_news_subscriptions"');
  });

  it("aucun DROP, RENAME, DELETE, TRUNCATE, UPDATE, INSERT, aucune modification d'une colonne existante", () => {
    expect(migrationViolations(SQL)).toEqual([]);
  });

  it("n'ajoute à une table existante que les deux colonnes de l'officine, sans casser une ligne", () => {
    const added = [...withoutComments(SQL).matchAll(/ALTER TABLE "(\w+)"\s+ADD COLUMN\s+"(\w+)"([^,;]*)(?:,\s*\n\s*ADD COLUMN\s+"(\w+)"([^,;]*))?/g)];
    const columns = added.flatMap((match) => [[match[1], match[2], match[3]], ...(match[4] ? [[match[1], match[4], match[5]]] : [])]);
    expect(columns.map(([table]) => table)).toEqual(["pharmacies", "pharmacies"]);
    expect(columns.map(([, name]) => name).sort()).toEqual([...PHARMACY_COLUMNS].sort());
    for (const [, name, definition] of columns) {
      expect(/NOT NULL/.test(definition) ? /DEFAULT/.test(definition) : true, `pharmacies.${name} : obligatoire sans valeur par défaut`).toBe(true);
    }
  });

  it("le détecteur détecte : chaque opération destructrice, une colonne qui casserait une ligne, une contrainte sur une table existante", () => {
    const base = 'CREATE TABLE "neuve" (\n    "id" TEXT NOT NULL,\n    CONSTRAINT "neuve_pkey" PRIMARY KEY ("id")\n);\n';
    expect(migrationViolations(base)).toEqual([]);
    expect(migrationViolations(`${base}DROP TABLE "campaigns";`)).toContain("contient DROP");
    expect(migrationViolations(`${base}ALTER TABLE "pharmacies" DROP COLUMN "name";`)).toContain("contient DROP");
    expect(migrationViolations(`${base}ALTER TABLE "pharmacies" RENAME COLUMN "name" TO "nom";`)).toContain("contient RENAME");
    expect(migrationViolations(`${base}ALTER TABLE "pharmacies" RENAME TO "officines";`)).toContain("contient RENAME");
    expect(migrationViolations(`${base}DELETE FROM "pharmacies";`)).toContain("contient DELETE FROM");
    expect(migrationViolations(`${base}TRUNCATE TABLE "pharmacies";`)).toContain("contient TRUNCATE");
    expect(migrationViolations(`${base}UPDATE "pharmacies" SET "name" = 'x';`)).toContain("contient UPDATE");
    expect(migrationViolations(`${base}INSERT INTO "pharmacies" ("id") VALUES ('x');`)).toContain("contient INSERT");
    expect(migrationViolations(`${base}ALTER TABLE "pharmacies" ALTER COLUMN "name" SET NOT NULL;`)).toContain("contient ALTER COLUMN");
    expect(migrationViolations(`${base}ALTER TABLE "pharmacies" ADD COLUMN "x" TEXT NOT NULL;`).join("\n")).toContain("colonne obligatoire sans valeur par défaut sur une table existante : pharmacies");
    expect(migrationViolations(`${base}ALTER TABLE "pharmacies" ADD CONSTRAINT "c" FOREIGN KEY ("id") REFERENCES "neuve"("id");`).join("\n")).toContain("contrainte ajoutée à une table qui existait déjà : pharmacies");
    expect(migrationViolations(`${base}GRANT ALL ON "neuve" TO PUBLIC;`).join("\n")).toContain("instruction non permise");
  });

  it("ne confond ni un commentaire ni « ON DELETE CASCADE » avec une suppression", () => {
    const sql = `-- Ne supprime, ne renomme et ne modifie rien : pas de DROP, pas de DELETE FROM, pas de RENAME.
/* DROP TABLE "x"; */
CREATE TABLE "enfant" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    CONSTRAINT "enfant_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "enfant" ADD CONSTRAINT "enfant_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pharmacies" ADD COLUMN     "a" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "b" INTEGER;`;
    expect(migrationViolations(sql)).toEqual([]);
  });
});

// ---------------------------------------------------------------- Le schéma Prisma du lot est tout entier dans la migration

type SchemaField = { name: string; type: string; optional: boolean; list: boolean; column: string; unique: boolean; relation: { fields: string[]; onDelete: string | null } | null };
type SchemaModel = { name: string; table: string; fields: SchemaField[]; uniques: string[][]; indexes: string[][] };

function parseModels(schema: string): Map<string, SchemaModel> {
  const models = new Map<string, SchemaModel>();
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match;
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? name;
    const fields: SchemaField[] = [];
    const uniques: string[][] = [];
    const indexes: string[][] = [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//")) continue;
      const list = (inner: string) => inner.split(",").map((part) => part.trim());
      const unique = /^@@unique\(\[([^\]]+)\]/.exec(line);
      const index = /^@@index\(\[([^\]]+)\]/.exec(line);
      if (unique) uniques.push(list(unique[1]));
      else if (index) indexes.push(list(index[1]));
      else if (!line.startsWith("@@")) {
        const field = /^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(line);
        if (!field) continue;
        const attributes = field[5];
        const relation = /@relation\(([^)]*)\)/.exec(attributes);
        const fieldsOf = relation ? /fields:\s*\[([^\]]+)\]/.exec(relation[1]) : null;
        fields.push({
          name: field[1],
          type: field[2],
          optional: field[4] === "?",
          list: field[3] === "[]",
          column: /@map\("([^"]+)"\)/.exec(attributes)?.[1] ?? field[1],
          unique: /@unique\b/.test(attributes),
          relation: relation ? { fields: fieldsOf ? list(fieldsOf[1]) : [], onDelete: /onDelete:\s*(\w+)/.exec(relation[1])?.[1] ?? null } : null,
        });
      }
    }
    models.set(name, { name, table, fields, uniques, indexes });
  }
  return models;
}

/** Ce que le lot déclare : de sa bannière jusqu'à la bannière suivante (ou la fin du fichier). */
function lotSection(schema: string): string {
  const lines = schema.split("\n");
  const title = lines.findIndex((line) => line.includes("NOTIFICATIONS ET CAMPAGNES"));
  if (title < 0) return "";
  const isBanner = (line: string) => /^\/\/ =+$/.test(line.trim());
  const headerEnd = lines.findIndex((line, i) => i > title && isBanner(line));
  const next = lines.findIndex((line, i) => i > headerEnd && isBanner(line));
  return lines.slice(headerEnd + 1, next < 0 ? undefined : next).join("\n");
}

const SCALAR_COLUMN_TYPES = new Set(["String", "Boolean", "Int", "DateTime", "Json", "Float", "Decimal", "BigInt"]);

function schemaVsMigrationViolations(schema: string, sql: string): string[] {
  const violations: string[] = [];
  const clean = withoutComments(sql);
  const models = parseModels(schema);
  const section = lotSection(schema);

  const inSectionModels = [...section.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]);
  const inSectionEnums = [...section.matchAll(/^enum (\w+) \{/gm)].map((match) => match[1]);
  if (JSON.stringify([...inSectionModels].sort()) !== JSON.stringify([...LOT_MODELS].sort())) violations.push(`modèles de la section du lot : ${inSectionModels.join(", ") || "(aucun)"} ≠ ${LOT_MODELS.join(", ")}`);
  if (JSON.stringify([...inSectionEnums].sort()) !== JSON.stringify([...LOT_ENUMS].sort())) violations.push(`enums de la section du lot : ${inSectionEnums.join(", ") || "(aucun)"} ≠ ${LOT_ENUMS.join(", ")}`);

  for (const enumName of new Set([...LOT_ENUMS, ...inSectionEnums])) {
    const values = new RegExp(`^enum ${enumName} \\{([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1];
    const declared = values?.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//"));
    const created = new RegExp(`CREATE TYPE "${enumName}" AS ENUM \\(([^)]*)\\)`).exec(clean)?.[1];
    if (!declared) violations.push(`enum ${enumName} absent du schéma`);
    else if (!created) violations.push(`type ${enumName} absent de la migration`);
    else if (JSON.stringify([...created.matchAll(/'([^']+)'/g)].map((match) => match[1])) !== JSON.stringify(declared)) violations.push(`type ${enumName} : valeurs différentes du schéma`);
  }

  for (const modelName of new Set([...LOT_MODELS, ...inSectionModels])) {
    const model = models.get(modelName);
    if (!model) {
      violations.push(`modèle ${modelName} absent du schéma`);
      continue;
    }
    const table = model.table;
    const block = new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`).exec(clean)?.[1];
    if (block === undefined) {
      violations.push(`table ${table} (${modelName}) absente de la migration`);
      continue;
    }
    const columns = new Map<string, string>();
    for (const line of block.split("\n")) {
      const column = /^\s+"(\w+)"\s+(.*?),?\s*$/.exec(line);
      if (column) columns.set(column[1], column[2]);
    }
    const isRelation = (field: SchemaField) => field.list || models.has(field.type);
    for (const field of model.fields.filter((candidate) => !isRelation(candidate))) {
      const definition = columns.get(field.column);
      if (definition === undefined) violations.push(`${table}.${field.column} absente de la migration`);
      else if (!SCALAR_COLUMN_TYPES.has(field.type) && !LOT_ENUMS.includes(field.type)) violations.push(`${table}.${field.column} : type ${field.type} inattendu`);
      else if (/\bNOT NULL\b/.test(definition) === field.optional) violations.push(`${table}.${field.column} : ${field.optional ? "facultative dans le schéma, NOT NULL dans la migration" : "obligatoire dans le schéma, nullable dans la migration"}`);
    }
    const scalarColumns = new Set(model.fields.filter((field) => !isRelation(field)).map((field) => field.column));
    for (const column of columns.keys()) if (!scalarColumns.has(column)) violations.push(`${table}.${column} : dans la migration, pas dans le schéma`);

    const indexNames: { name: string; unique: boolean }[] = [
      ...model.uniques.map((keys) => ({ name: `${table}_${keys.join("_")}_key`, unique: true })),
      ...model.indexes.map((keys) => ({ name: `${table}_${keys.join("_")}_idx`, unique: false })),
      ...model.fields.filter((field) => field.unique).map((field) => ({ name: `${table}_${field.column}_key`, unique: true })),
    ];
    for (const { name, unique } of indexNames) {
      if (!new RegExp(`CREATE ${unique ? "UNIQUE " : ""}INDEX "${name}" ON "${table}"\\(`).test(clean)) violations.push(`${unique ? "index unique" : "index"} ${name} absent de la migration`);
    }

    for (const field of model.fields.filter((candidate) => candidate.relation && candidate.relation.fields.length > 0)) {
      const target = models.get(field.type);
      const key = field.relation!.fields[0];
      const name = `${table}_${key}_fkey`;
      const found = new RegExp(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" FOREIGN KEY \\("${key}"\\) REFERENCES "${target?.table ?? "?"}"\\("id"\\) ON DELETE (CASCADE|SET NULL|RESTRICT|SET DEFAULT) ON UPDATE`).exec(clean);
      if (!found) violations.push(`clé étrangère ${name} (vers ${target?.table ?? field.type}) absente de la migration`);
      else {
        const wanted = { Cascade: "CASCADE", SetNull: "SET NULL", Restrict: "RESTRICT", SetDefault: "SET DEFAULT" }[field.relation!.onDelete ?? ""] ?? (field.optional ? "SET NULL" : "RESTRICT");
        if (found[1] !== wanted) violations.push(`clé étrangère ${name} : ON DELETE ${found[1]} dans la migration, ${wanted} dans le schéma`);
      }
    }
  }

  const pharmacy = models.get("Pharmacy");
  for (const column of PHARMACY_COLUMNS) {
    if (!pharmacy?.fields.some((field) => field.name === column)) violations.push(`pharmacies.${column} absente du schéma`);
    if (!new RegExp(`ALTER TABLE "pharmacies"[^;]*ADD COLUMN\\s+"${column}"`).test(clean)) violations.push(`pharmacies.${column} absente de la migration`);
  }
  return violations;
}

describe("chaque table nouvelle du schéma Prisma de ce lot figure dans la migration", () => {
  it("le test lit bien le schéma : la section du lot, ses sept modèles et ses trois types", () => {
    const section = lotSection(SCHEMA);
    expect(section.length).toBeGreaterThan(1000);
    expect([...section.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]).sort()).toEqual([...LOT_MODELS].sort());
    expect([...section.matchAll(/^enum (\w+) \{/gm)].map((match) => match[1]).sort()).toEqual([...LOT_ENUMS].sort());
  });

  it("tables, colonnes (et leur nullabilité), types, index, clés étrangères : le schéma et la migration disent la même chose", () => {
    expect(schemaVsMigrationViolations(SCHEMA, SQL)).toEqual([]);
  });

  it("les deux colonnes de l'officine sont déclarées des deux côtés", () => {
    const pharmacy = parseModels(SCHEMA).get("Pharmacy");
    expect(pharmacy?.fields.find((field) => field.name === "patientNewsEnabled")?.type).toBe("Boolean");
    expect(pharmacy?.fields.find((field) => field.name === "referralAmountCents")).toMatchObject({ type: "Int", optional: true });
    expect(SQL).toContain('"patientNewsEnabled" BOOLEAN NOT NULL DEFAULT true');
    expect(SQL).toMatch(/"referralAmountCents" INTEGER(?!\s+NOT NULL)/);
  });

  it("le détecteur détecte : une table, une colonne, une valeur d'enum, un index ou une clé étrangère oubliés dans le SQL", () => {
    expect(schemaVsMigrationViolations(SCHEMA, SQL)).toEqual([]);

    const sansTable = SQL.replace(/CREATE TABLE "referral_offers" \([\s\S]*?\n\);/, "");
    expect(schemaVsMigrationViolations(SCHEMA, sansTable).join("\n")).toContain("table referral_offers (ReferralOffer) absente de la migration");

    const sansColonne = SQL.replace('    "offerConditions" TEXT,\n', "");
    expect(schemaVsMigrationViolations(SCHEMA, sansColonne)).toContain("campaigns.offerConditions absente de la migration");

    const nullabiliteInversee = SQL.replace('"emailCipher" TEXT,', '"emailCipher" TEXT NOT NULL,');
    expect(schemaVsMigrationViolations(SCHEMA, nullabiliteInversee).join("\n")).toContain("patient_news_subscriptions.emailCipher : facultative dans le schéma, NOT NULL dans la migration");

    const sansValeur = SQL.replace("'DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELED'", "'DRAFT', 'SCHEDULED', 'SENDING', 'SENT'");
    expect(schemaVsMigrationViolations(SCHEMA, sansValeur)).toContain("type CampaignStatus : valeurs différentes du schéma");

    const sansIndex = SQL.replace(/CREATE UNIQUE INDEX "patient_news_deliveries_announcementId_subscriptionId_key"[^;]*;/, "");
    expect(schemaVsMigrationViolations(SCHEMA, sansIndex)).toContain("index unique patient_news_deliveries_announcementId_subscriptionId_key absent de la migration");

    const sansCle = SQL.replace(/ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey"[^;]*;/, "");
    expect(schemaVsMigrationViolations(SCHEMA, sansCle).join("\n")).toContain("clé étrangère campaign_recipients_campaignId_fkey (vers campaigns) absente de la migration");

    const mauvaiseSuppression = SQL.replace(/("patient_news_deliveries_announcementId_fkey" FOREIGN KEY \("announcementId"\) REFERENCES "patient_news_announcements"\("id"\) ON DELETE) CASCADE/, "$1 RESTRICT");
    expect(schemaVsMigrationViolations(SCHEMA, mauvaiseSuppression).join("\n")).toContain("ON DELETE RESTRICT dans la migration, CASCADE dans le schéma");

    const sansColonnePharmacie = SQL.replace(/ADD COLUMN\s+"referralAmountCents" INTEGER/, "ADD COLUMN \"autre\" INTEGER");
    expect(schemaVsMigrationViolations(SCHEMA, sansColonnePharmacie)).toContain("pharmacies.referralAmountCents absente de la migration");

    const modeleEnPlus = SCHEMA.replace('model ReferralOffer {', 'model NouvelleTable {\n  id String @id\n\n  @@map("nouvelle_table")\n}\n\nmodel ReferralOffer {');
    expect(schemaVsMigrationViolations(modeleEnPlus, SQL).join("\n")).toContain("modèles de la section du lot");
    expect(schemaVsMigrationViolations(modeleEnPlus, SQL).join("\n")).toContain("table nouvelle_table (NouvelleTable) absente de la migration");
  });
});
