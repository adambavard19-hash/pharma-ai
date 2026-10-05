import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEMO_DRUGS } from "../../../../prisma/seed-data/drugs";
import { NEWS_MIN_INTERVAL_DAYS, NEWS_RETENTION_MONTHS, buildNewsOptInBlock, buildNewsWelcomeEmail, buildPatientNewsEmail, newsUnsubscribeHeaders } from "@/core/patient-news";
import { CAMPAIGN_KINDS, renderCampaignEmail, sampleCampaignValues, type CampaignKindKey, type CampaignSide } from "@/core/admin/campaigns";
import { DEFAULT_EMAIL_CONTEXT } from "@/core/platform/email-layout";
import PrivacyPage from "@/app/(public)/decouvrir/confidentialite/page";

/**
 * Trois garanties du lot « Notifications et campagnes », lues dans les sources :
 *
 *   1. Les nouveautés pour les patients n'ont AUCUN rapport avec la santé : ni
 *      table, ni requête, ni import vers une ordonnance, un plan scellé, un
 *      patient, un conseil, un médicament. Une adresse e-mail et le nom d'une
 *      pharmacie, rien d'autre. C'est ce qui permet de la conserver sans
 *      hébergement HDS.
 *   2. Le patient voit sa pharmacie, pas un logiciel : aucun nom d'outil dans ce
 *      qui lui est montré ou écrit.
 *   3. Chaque message de campagne aux professionnels porte son moyen de se
 *      désinscrire, et chaque message d'essai ne part qu'à celui qui l'a demandé.
 *
 * L'analyse est syntaxique (arbre du compilateur) : un commentaire qui parle
 * d'ordonnance n'est jamais une requête. Chaque détecteur est lui-même éprouvé
 * sur des sources fautives : un garde-fou qui ne détecte rien est pire qu'aucun.
 */

const ROOT = join(__dirname, "../../../..");
const SRC = join(ROOT, "src");

function sourcesUnder(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        if (name !== "__tests__") walk(path);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(dir);
  return files;
}

/** Les sources du lot qui touchent un patient : règles, service, actions, pages publiques. */
const PATIENT_NEWS_FILES = [
  ...sourcesUnder(join(SRC, "core/patient-news")),
  join(SRC, "server/services/patient-news.ts"),
  join(SRC, "server/actions/patient-news.ts"),
  ...sourcesUnder(join(SRC, "app/(public)/nouveautes")),
];

// ---------------------------------------------------------------- Analyse des sources

type Analysis = {
  /** Tous les identifiants : variables, propriétés, types, balises JSX. Jamais un commentaire. */
  identifiers: string[];
  /** Les textes littéraires : chaînes, gabarits, texte JSX, expressions régulières. Jamais un commentaire. */
  texts: string[];
  /** Les modules importés (statiquement ou par `import()`). */
  imports: string[];
  /** Les tables lues ou écrites : `prisma.<table>` et `tx.<table>`. */
  delegates: string[];
};

function analyse(source: string, fileName = "source.tsx"): Analysis {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Analysis = { identifiers: [], texts: [], imports: [], delegates: [] };
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) out.identifiers.push(node.text);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) out.imports.push(node.moduleSpecifier.text);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) out.imports.push(node.arguments[0].text);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.texts.push(node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) out.texts.push(node.text);
    else if (ts.isJsxText(node)) out.texts.push(node.text);
    else if (ts.isRegularExpressionLiteral(node)) out.texts.push(node.text);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === "prisma" || node.expression.text === "tx")) out.delegates.push(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  // Les chaînes des `import … from "…"` sont déjà comptées à part.
  out.texts = out.texts.filter((text) => !out.imports.includes(text));
  return out;
}

/** Sans accents ni majuscules : « Paracétamol » et « paracetamol » sont le même nom. */
const plain = (value: string): string => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// ---------------------------------------------------------------- Règle 1 : rien de médical

/** Les seules tables que le lot a le droit de toucher : l'officine, ses abonnés, ses annonces, ses gammes privilégiées. */
const ALLOWED_DELEGATES = new Set(["pharmacy", "patientNewsSubscription", "patientNewsAnnouncement", "patientNewsDelivery", "preferredRange", "$transaction"]);

/** Un identifiant du monde de la santé : ordonnance, plan scellé, patient (le modèle), conseil, produit, médicament. `patientNews…` n'en est pas un. */
const HEALTH_IDENTIFIER = /^(?:prescriptions?\w*|sealedDocuments?\w*|patients?|patient(?:Health|Document|Consent|Profile)\w*|recommendations?\w*|products?\w*|drugs?\w*|medications?\w*|medicaments?\w*)$/i;

/** Un module du monde de la santé. L'e-mail du plan (`core/documents/email`) est autorisé : c'est lui qui porte l'invitation. */
const HEALTH_MODULE = /(?:prescription|recommendation|sealed-documents|documents\/seal|services\/documents|\/patients?(?:\/|$)|drug|medic|\/products?(?:\/|$)|core\/ai\b|core\/understanding|core\/classification)/i;

/** Les noms de médicaments : le référentiel de démonstration, et les noms que le comptoir voit tous les jours. */
const DRUG_NAMES: string[] = [
  ...new Set(
    [
      ...DEMO_DRUGS.flatMap((drug) => [drug.name, drug.inn]),
      "doliprane", "efferalgan", "dafalgan", "advil", "nurofen", "spasfon", "levothyrox", "kardegic", "aspirine", "metformine", "atorvastatine",
      "amlodipine", "ramipril", "omeprazole", "pantoprazole", "smecta", "imodium", "voltarene", "diclofenac", "tramadol", "codeine", "ventoline",
      "salbutamol", "lexomil", "xanax", "stilnox", "zolpidem", "insuline", "augmentin", "clamoxyl", "toplexil", "humex", "fervex", "gaviscon",
    ]
      .map(plain)
      .filter((name) => name.length >= 6),
  ),
];

const drugNamesIn = (text: string): string[] => DRUG_NAMES.filter((name) => new RegExp(`(?:^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z]|$)`).test(plain(text)));

function healthViolations(file: string, source: string): string[] {
  const found = analyse(source, file);
  const violations: string[] = [];
  for (const delegate of found.delegates) if (!ALLOWED_DELEGATES.has(delegate)) violations.push(`${file} : table « ${delegate} » hors du périmètre des nouveautés`);
  for (const identifier of found.identifiers) if (HEALTH_IDENTIFIER.test(identifier)) violations.push(`${file} : identifiant « ${identifier} »`);
  for (const specifier of found.imports) if (HEALTH_MODULE.test(specifier)) violations.push(`${file} : import « ${specifier} »`);
  for (const text of found.texts) for (const name of drugNamesIn(text)) violations.push(`${file} : nom de médicament « ${name} »`);
  return violations;
}

describe("les nouveautés pour les patients ne touchent à rien de médical (sources)", () => {
  it("le test lit bien les sources du lot", () => {
    expect(PATIENT_NEWS_FILES.length).toBeGreaterThanOrEqual(10);
    expect(PATIENT_NEWS_FILES.some((file) => file.endsWith("services/patient-news.ts"))).toBe(true);
    expect(PATIENT_NEWS_FILES.some((file) => file.includes("(public)/nouveautes"))).toBe(true);
    expect(DRUG_NAMES.length).toBeGreaterThan(20);
    // L'analyse voit bien le code : des identifiants, des textes (regex comprises), les imports du service.
    const seen = PATIENT_NEWS_FILES.map((file) => analyse(readFileSync(file, "utf8"), file));
    expect(seen.reduce((total, found) => total + found.identifiers.length, 0)).toBeGreaterThan(300);
    expect(seen.reduce((total, found) => total + found.texts.length, 0)).toBeGreaterThan(100);
    expect(seen.flatMap((found) => found.texts).some((text) => /ordonnance/.test(text))).toBe(true);
    expect(seen.flatMap((found) => found.imports)).toContain("@/server/db/client");
  });

  it("le détecteur détecte : une table, un identifiant, un import ou un nom de médicament font échouer, un commentaire non", () => {
    expect(healthViolations("a.ts", "await prisma.prescription.findMany();")).toHaveLength(2);
    expect(healthViolations("a.ts", "await prisma.patient.findFirst({ where: { id } });").length).toBeGreaterThanOrEqual(1);
    expect(healthViolations("a.ts", "await tx.sealedDocument.create({ data });").length).toBeGreaterThanOrEqual(1);
    expect(healthViolations("a.ts", "const x = await prisma.pharmacy.findUnique({ select: { recommendations: true } });")).toEqual(["a.ts : identifiant « recommendations »"]);
    expect(healthViolations("a.ts", 'import { sealContent } from "@/core/documents/seal";\nimport { x } from "@/server/services/sealed-documents";')).toHaveLength(2);
    expect(healthViolations("a.ts", 'import { x } from "@/server/services/prescriptions";')).toHaveLength(1);
    expect(healthViolations("a.ts", 'const message = "Profitez de Doliprane 1000 mg en promotion.";')).toEqual(["a.ts : nom de médicament « doliprane »"]);
    expect(healthViolations("a.ts", 'const message = "Du paracétamol pour tous.";')).toEqual(["a.ts : nom de médicament « paracetamol »"]);
    expect(healthViolations("a.tsx", "export default function P() { return <p>Escitalopram</p>; }")).toEqual(["a.tsx : nom de médicament « escitalopram »"]);
    expect(healthViolations("a.ts", "const motif = /ibuprofene/;")).toEqual(["a.ts : nom de médicament « ibuprofene »"]);
    // Ce qui est permis : les tables du lot, l'e-mail du plan, un commentaire, un mot courant.
    expect(
      healthViolations(
        "ok.ts",
        '// Aucun lien avec une prescription, un patient, le Doliprane ou un sealedDocument.\nimport { escapeHtml } from "@/core/documents/email";\nimport { x } from "@/core/patient-news";\nawait prisma.patientNewsSubscription.count({ where: { pharmacyId } });\nawait prisma.preferredRange.findMany();\nconst patientNewsEnabled = true;\nconst texte = "Aucun médicament sur ordonnance n\'est présenté.";',
      ),
    ).toEqual([]);
  });

  it("aucune table hors périmètre, aucun identifiant ni import du monde de la santé, aucun nom de médicament", () => {
    const violations = PATIENT_NEWS_FILES.flatMap((file) => healthViolations(file.replace(`${ROOT}/`, ""), readFileSync(file, "utf8")));
    expect(violations).toEqual([]);
  });

  it("le service ne lit que les tables du lot : il en lit au moins une de chacune", () => {
    const service = analyse(readFileSync(join(SRC, "server/services/patient-news.ts"), "utf8"), "patient-news.ts");
    for (const delegate of ["pharmacy", "patientNewsSubscription", "patientNewsAnnouncement", "patientNewsDelivery"]) expect(service.delegates).toContain(delegate);
    expect(service.delegates.every((delegate) => ALLOWED_DELEGATES.has(delegate))).toBe(true);
  });
});

// ---------------------------------------------------------------- Règle 1 (suite) : le schéma et la migration

const SCHEMA = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
const MIGRATION = readFileSync(join(ROOT, "prisma/migrations/20261007090000_notifications_campagnes/migration.sql"), "utf8");

const NEWS_MODELS = ["PatientNewsSubscription", "PatientNewsAnnouncement", "PatientNewsDelivery"] as const;
const NEWS_TABLES = ["patient_news_subscriptions", "patient_news_announcements", "patient_news_deliveries"];
const SCALAR_TYPES = new Set(["String", "Boolean", "Int", "DateTime"]);
/** Ce que ces tables peuvent désigner : elles-mêmes, leur statut, l'officine. */
const NEWS_RELATIONS = new Set([...NEWS_MODELS, "PatientNewsStatus", "Pharmacy"]);
/** Un nom de champ qui ferait de l'abonné une personne identifiée ou un patient. */
const PERSON_OR_HEALTH_FIELD = /prescription|sealed|recommendation|product|drug|medic|health|treatment|posolog|dose|patientId|firstName|lastName|fullName|birth|phone|address(?!ed)/i;

type ModelField = { name: string; type: string };

function modelFields(schema: string, model: string): ModelField[] | null {
  const block = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1];
  if (block === undefined) return null;
  const fields: ModelField[] = [];
  for (const line of block.split("\n")) {
    const match = /^\s+(\w+)\s+(\w+)(?:\[\])?\??(?:\s|$)/.exec(line);
    if (match && !line.trim().startsWith("//") && !line.trim().startsWith("@@")) fields.push({ name: match[1], type: match[2] });
  }
  return fields;
}

/** Les tables que cette migration crée, avec les tables qu'elles désignent par clé étrangère. */
function foreignKeyTargets(sql: string, table: string): string[] {
  return [...sql.matchAll(new RegExp(`ALTER TABLE "${table}" ADD CONSTRAINT "[^"]+" FOREIGN KEY \\([^)]*\\) REFERENCES "([^"]+)"`, "g"))].map((match) => match[1]);
}

describe("les tables des nouveautés ne désignent ni patient, ni ordonnance, ni plan (schéma et migration)", () => {
  for (const model of NEWS_MODELS) {
    it(`${model} : des colonnes simples, et des liens vers l'officine seulement`, () => {
      const fields = modelFields(SCHEMA, model);
      expect(fields, `modèle ${model} introuvable dans prisma/schema.prisma`).not.toBeNull();
      expect(fields!.length).toBeGreaterThan(5);
      for (const field of fields!) {
        expect(SCALAR_TYPES.has(field.type) || NEWS_RELATIONS.has(field.type), `${model}.${field.name} : type « ${field.type} » hors du périmètre des nouveautés`).toBe(true);
        expect(field.name, `${model}.${field.name}`).not.toMatch(PERSON_OR_HEALTH_FIELD);
      }
    });
  }

  it("les clés étrangères de la migration ne désignent que l'officine et les tables du lot", () => {
    for (const table of NEWS_TABLES) {
      const targets = foreignKeyTargets(MIGRATION, table);
      expect(targets.length, `${table} : aucune clé étrangère trouvée`).toBeGreaterThan(0);
      for (const target of targets) expect(["pharmacies", ...NEWS_TABLES], `${table} → ${target}`).toContain(target);
    }
  });

  it("aucune colonne de ces tables ne porte une personne ou une donnée de santé", () => {
    for (const table of NEWS_TABLES) {
      const block = new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`).exec(MIGRATION)?.[1];
      expect(block, `${table} absente de la migration`).toBeDefined();
      const columns = [...block!.matchAll(/^\s+"(\w+)"/gm)].map((match) => match[1]);
      expect(columns.length).toBeGreaterThan(5);
      for (const column of columns) expect(column, `${table}.${column}`).not.toMatch(PERSON_OR_HEALTH_FIELD);
    }
  });

  it("le détecteur détecte : un champ patient ou ordonnance, un lien vers une autre table", () => {
    const fautif = 'model PatientNewsSubscription {\n  id String @id\n  patientId String\n  prescription Prescription?\n}\n';
    const fields = modelFields(fautif, "PatientNewsSubscription")!;
    expect(fields.map((field) => field.name)).toEqual(["id", "patientId", "prescription"]);
    expect(fields.filter((field) => PERSON_OR_HEALTH_FIELD.test(field.name)).map((field) => field.name)).toEqual(["patientId", "prescription"]);
    expect(fields.filter((field) => !SCALAR_TYPES.has(field.type) && !NEWS_RELATIONS.has(field.type)).map((field) => field.type)).toEqual(["Prescription"]);
    const sql = 'ALTER TABLE "patient_news_subscriptions" ADD CONSTRAINT "x_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE;';
    expect(foreignKeyTargets(sql, "patient_news_subscriptions")).toEqual(["patients"]);
  });
});

// ---------------------------------------------------------------- Règle 2 : le patient voit sa pharmacie

const TOOL_NAME = /pharma\s*-?\s*boost|pharma\.ai/i;

describe("le patient voit sa pharmacie, pas un logiciel", () => {
  it("le détecteur détecte le nom de l'outil sous ses formes courantes", () => {
    for (const name of ["PharmaBoost", "pharmaboost", "Pharma Boost", "Pharma-Boost", "PHARMABOOST", "Pharma.ai", "pharma.ai"]) expect(name).toMatch(TOOL_NAME);
    expect("Pharmacie du Marché").not.toMatch(TOOL_NAME);
  });

  it("aucun texte des sources côté patient ne nomme l'outil (pages, messages, erreurs, métadonnées)", () => {
    const leaks = PATIENT_NEWS_FILES.flatMap((file) => analyse(readFileSync(file, "utf8"), file).texts.filter((text) => TOOL_NAME.test(text)).map((text) => `${file.replace(`${ROOT}/`, "")} : « ${text.slice(0, 60)} »`));
    expect(leaks).toEqual([]);
  });

  it("un texte de source qui nomme l'outil serait repéré, un commentaire non", () => {
    expect(analyse('export const t = "Bienvenue sur PharmaBoost";', "x.ts").texts.filter((text) => TOOL_NAME.test(text))).toHaveLength(1);
    expect(analyse('// PharmaBoost n\'apparaît pas ici\nexport const t = "Bonjour";', "x.ts").texts.filter((text) => TOOL_NAME.test(text))).toEqual([]);
  });

  it("les messages rendus (annonce, test, confirmation, invitation du plan) ne nomment pas l'outil", () => {
    const unsubscribeUrl = "https://exemple.test/nouveautes/desinscription/jeton";
    const pharmacy = { pharmacyName: "Pharmacie du Marché", pharmacyPhone: "01 23 45 67 89", brandColor: "#0F766E" };
    const messages = [
      buildPatientNewsEmail({ ...pharmacy, title: "Une nouvelle gamme solaire", rangeLabel: "Gamme Exemple", message: "Elle est arrivée en pharmacie.\n\nVenez la découvrir.", unsubscribeUrl }),
      buildPatientNewsEmail({ ...pharmacy, title: "Essai", rangeLabel: null, message: "Un essai.", unsubscribeUrl, isTest: true }),
      buildNewsWelcomeEmail({ ...pharmacy, unsubscribeUrl }),
    ];
    const invitation = buildNewsOptInBlock({ pharmacyName: pharmacy.pharmacyName, url: "https://exemple.test/nouveautes/abonnement/jeton", brandColor: pharmacy.brandColor });
    const everything = [...messages.flatMap((message) => [message.subject, message.text, message.html]), ...invitation.text, invitation.html, ...Object.values(newsUnsubscribeHeaders(unsubscribeUrl))].join("\n");
    expect(everything).toContain("Pharmacie du Marché");
    expect(everything).not.toMatch(TOOL_NAME);
  });
});

// ---------------------------------------------------------------- Règle 3 : désinscription et essais

const sampleDraft = (kind: CampaignKindKey, side: CampaignSide) => {
  const { subject, title, body, buttonLabel } = CAMPAIGN_KINDS[kind].defaults;
  const values = sampleCampaignValues(side, { offerAmountCents: 2000, offerEndsAt: new Date("2026-12-31T22:59:59.999Z"), offerConditions: "Offre réservée aux officines abonnées." });
  return { draft: { subject, title, body, buttonLabel }, values };
};

describe("le pied de page des messages aux professionnels porte le lien de désinscription", () => {
  const unsubscribeUrl = "https://exemple.test/offres/desinscription/jeton-signe";
  const cases: [CampaignKindKey, CampaignSide][] = [
    ["BONUS_OFFER", "PHARMACY"],
    ["REFERRAL_OFFER", "PHARMACY"],
    ["PARTNER_INVITATION", "PARTNER"],
    ["ANNOUNCEMENT", "PHARMACY"],
  ];

  for (const [kind, side] of cases) {
    it(`${kind} (${side === "PHARMACY" ? "officines" : "partenaires"}) : texte et HTML disent où se désinscrire`, () => {
      const { draft, values } = sampleDraft(kind, side);
      // Un texte d'annonce sans message écrit est refusé à la validation ; ici on ne regarde que le pied de page.
      const message = renderCampaignEmail({ ...draft, body: draft.body.replace("Écrivez ici votre message.", "Une information.") }, values, { context: DEFAULT_EMAIL_CONTEXT, buttonUrl: null, unsubscribeUrl });
      expect(message.text).toContain(`Ne plus recevoir ces offres : ${unsubscribeUrl}`);
      expect(message.html).toContain(`href="${unsubscribeUrl}"`);
      expect(message.html).toContain("Ne plus recevoir ces offres");
    });
  }

  it("sans adresse de désinscription, le pied de page n'en dit rien : le test distingue donc bien les deux cas", () => {
    const { draft, values } = sampleDraft("BONUS_OFFER", "PHARMACY");
    const message = renderCampaignEmail(draft, values, { context: DEFAULT_EMAIL_CONTEXT, buttonUrl: null, unsubscribeUrl: null });
    expect(message.text).not.toContain("Ne plus recevoir ces offres");
    expect(message.html).not.toContain("Ne plus recevoir ces offres");
  });
});

// L'envoi, lui, est dans le service : on lit l'arbre pour être sûr qu'aucun chemin n'oublie l'adresse ni les en-têtes.

type CallSite = { callee: string; argumentsText: string[]; objectKeys: string[][]; enclosing: string };

function callsIn(source: string, fileName: string, calleeEndsWith: RegExp): CallSite[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const calls: CallSite[] = [];
  const enclosingName = (node: ts.Node): string => {
    for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
      if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
      if (ts.isVariableDeclaration(current) && current.initializer && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer)) && ts.isIdentifier(current.name)) return current.name.text;
    }
    return "(module)";
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(file);
      if (calleeEndsWith.test(callee)) {
        calls.push({
          callee,
          argumentsText: node.arguments.map((argument) => argument.getText(file)),
          objectKeys: node.arguments.map((argument) => (ts.isObjectLiteralExpression(argument) ? argument.properties.map((property) => (ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property) ? property.name.getText(file) : "…")) : [])),
          enclosing: enclosingName(node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return calls;
}

/** La valeur donnée à une propriété d'un littéral d'objet passé en premier argument d'un appel. */
function propertyText(source: string, fileName: string, callee: RegExp, property: string): { enclosing: string; value: string | null }[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: { enclosing: string; value: string | null }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && callee.test(node.expression.getText(file)) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      const prop = node.arguments[0].properties.find((candidate) => (ts.isPropertyAssignment(candidate) || ts.isShorthandPropertyAssignment(candidate)) && candidate.name.getText(file) === property);
      let enclosing = "(module)";
      for (let current: ts.Node | undefined = node.parent; current; current = current.parent) if (ts.isFunctionDeclaration(current) && current.name) { enclosing = current.name.text; break; }
      found.push({ enclosing, value: prop && ts.isPropertyAssignment(prop) ? prop.initializer.getText(file) : prop ? property : null });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("aucun chemin d'envoi n'oublie la désinscription ni ne part vers une adresse saisie", () => {
  const campaigns = readFileSync(join(SRC, "server/services/admin/campaigns.ts"), "utf8");
  const news = readFileSync(join(SRC, "server/services/patient-news.ts"), "utf8");
  const campaignActions = readFileSync(join(SRC, "server/actions/admin-campaigns.ts"), "utf8");
  const newsActions = readFileSync(join(SRC, "server/actions/patient-news.ts"), "utf8");

  it("campagnes : chaque envoi porte les en-têtes de désinscription, chaque rendu reçoit une adresse de désinscription", () => {
    const sends = callsIn(campaigns, "campaigns.ts", /\.sendEmail$/);
    expect(sends.length, "envois attendus : l'essai et la distribution").toBeGreaterThanOrEqual(2);
    for (const send of sends) expect(send.objectKeys[0], `envoi dans ${send.enclosing}`).toContain("headers");

    const renders = callsIn(campaigns, "campaigns.ts", /^renderCampaignEmail$/);
    expect(renders.length, "rendus attendus : l'aperçu et la distribution").toBeGreaterThanOrEqual(2);
    for (const render of renders) {
      expect(render.objectKeys[2], `rendu dans ${render.enclosing}`).toContain("unsubscribeUrl");
      expect(render.argumentsText[2], `rendu dans ${render.enclosing}`).not.toMatch(/unsubscribeUrl:\s*null/);
    }
  });

  it("nouveautés : l'annonce et la confirmation portent l'en-tête de désinscription", () => {
    const sends = callsIn(news, "patient-news.ts", /\.sendEmail$/);
    expect(sends.length).toBeGreaterThanOrEqual(3);
    for (const send of sends.filter((candidate) => candidate.enclosing === "deliverTo" || candidate.enclosing === "sendWelcome")) expect(send.objectKeys[0], `envoi dans ${send.enclosing}`).toContain("headers");
    expect(sends.filter((candidate) => candidate.enclosing === "deliverTo" || candidate.enclosing === "sendWelcome")).toHaveLength(2);
  });

  it("l'essai d'une annonce part vers l'adresse de l'utilisateur connecté, jamais vers une saisie", () => {
    const test = propertyText(news, "patient-news.ts", /\.sendEmail$/, "to").filter((send) => send.enclosing === "sendAnnouncementTest");
    expect(test).toEqual([{ enclosing: "sendAnnouncementTest", value: "scope.email" }]);
    const action = callsIn(newsActions, "patient-news-actions.ts", /^sendAnnouncementTest$/);
    expect(action).toHaveLength(1);
    expect(action[0].argumentsText[0]).toContain("email: session.user.email");
  });

  it("l'essai d'une campagne part vers l'adresse de l'administrateur connecté, jamais vers une saisie", () => {
    const test = propertyText(campaigns, "campaigns.ts", /\.sendEmail$/, "to").filter((send) => send.enclosing === "sendCampaignTest");
    expect(test).toEqual([{ enclosing: "sendCampaignTest", value: "adminEmail" }]);
    const action = callsIn(campaignActions, "admin-campaigns.ts", /^sendCampaignTest$/);
    expect(action).toHaveLength(1);
    expect(action[0].argumentsText[2]).toBe("session.admin.email");
  });

  it("le détecteur détecte : un envoi sans en-têtes, un essai vers une adresse saisie", () => {
    const fautif = "async function distribuer(row) {\n  return messaging.sendEmail({ to: row.email, subject, text });\n}\nasync function sendCampaignTest(draft, adminId, adminEmail) {\n  return messaging.sendEmail({ to: draft.testAddress, headers });\n}";
    const sends = callsIn(fautif, "x.ts", /\.sendEmail$/);
    expect(sends.map((send) => send.objectKeys[0].includes("headers"))).toEqual([false, true]);
    expect(propertyText(fautif, "x.ts", /\.sendEmail$/, "to").filter((send) => send.enclosing === "sendCampaignTest")).toEqual([{ enclosing: "sendCampaignTest", value: "draft.testAddress" }]);
    const rendu = callsIn("function a() { return renderCampaignEmail(c, values, { context, unsubscribeUrl: null }); }", "x.ts", /^renderCampaignEmail$/);
    expect(rendu[0].argumentsText[2]).toMatch(/unsubscribeUrl:\s*null/);
  });
});

// ---------------------------------------------------------------- La page publique dit ce que le serveur applique

describe("la page publique de confidentialité dit ce que le serveur applique", () => {
  const html = renderToStaticMarkup(PrivacyPage());
  const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

  it("présente les deux nouveaux blocs", () => {
    expect(text).toContain("Les nouveautés de votre pharmacie");
    expect(text).toContain("Les messages de PharmaBoost aux professionnels");
  });

  it("la durée écrite est celle que le serveur applique, la fréquence aussi", () => {
    expect(text).toContain(`${NEWS_RETENTION_MONTHS} mois au plus`);
    expect(NEWS_MIN_INTERVAL_DAYS).toBe(7);
    expect(text).toContain("au plus un message par semaine");
  });

  it("dit que c'est facultatif, chiffré, sans donnée de santé, avec une désinscription sans compte, et que la pharmacie est responsable", () => {
    expect(text).toContain("C'est facultatif");
    expect(text).toContain("chiffrée");
    expect(text).toContain("Nous ne conservons aucune donnée de santé");
    expect(text).toContain("sans compte");
    expect(text).toContain("Le responsable de ce traitement est votre pharmacie");
  });

  it("garde la phrase sur l'e-mail du patient, qui reste vraie", () => {
    expect(text).toContain("Un e-mail envoyé à un patient ne contient aucune donnée de santé");
  });
});
