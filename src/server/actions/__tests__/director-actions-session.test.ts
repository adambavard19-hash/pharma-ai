import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * L'espace du directeur commercial n'a aucun « tenant » : ce qu'une action de
 * `director-*.ts` fait, elle le fait sur toute l'équipe commerciale. La barrière
 * qui la protège est une seule ligne, `await requireDirectorSession()`, et elle
 * doit précéder TOUT le reste : valider la requête, lire la base ou répondre
 * avant de l'avoir franchie laisserait un visiteur sans session sonder l'espace.
 *
 * Même méthode que le garde-fou de la console (`admin-actions-session.test.ts`) :
 * ce test lit les sources, pas des mocks, et analyse l'arbre syntaxique, de sorte
 * qu'un commentaire ou une chaîne qui cite la barrière ne compte jamais pour
 * l'appel.
 *
 * Une seule exception, écrite en toutes lettres : `director-auth.ts`, dont les
 * actions servent à OBTENIR une session (connexion, oubli, choix du mot de
 * passe) ou à la rendre (déconnexion). La liste est exacte : une action de plus
 * dans ce fichier doit porter la barrière, sauf à être ajoutée ici à la main.
 */

const ACTIONS_DIR = join(__dirname, "..");
const SESSION_GATE = "requireDirectorSession";
const SESSION_MODULE = "@/server/auth/director-session";
/** Les modules de session des deux autres espaces : le directeur n'en accepte aucun. */
const OTHER_SESSION_MODULES = ["@/server/auth/platform-session", "@/server/auth/sales-session", "@/server/auth/session"];

const PUBLIC_ACTIONS: Record<string, readonly string[]> = {
  "director-auth.ts": ["directorLoginAction", "directorLogoutAction", "requestDirectorPasswordLinkAction", "setDirectorPasswordAction"],
};

type Verdict = { name: string; ok: boolean; reason: string | null };

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);

/** `await requireDirectorSession()`, éventuellement entre parenthèses. */
function isAwaitedGate(expression: ts.Expression | undefined): boolean {
  let current = expression;
  while (current && ts.isParenthesizedExpression(current)) current = current.expression;
  if (!current || !ts.isAwaitExpression(current)) return false;
  let call: ts.Expression = current.expression;
  while (ts.isParenthesizedExpression(call)) call = call.expression;
  return ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === SESSION_GATE;
}

/** La première instruction du corps : `await requireDirectorSession();` ou `const x = await requireDirectorSession();`. */
function startsWithGate(statement: ts.Statement | undefined): boolean {
  if (!statement) return false;
  if (ts.isExpressionStatement(statement)) return isAwaitedGate(statement.expression);
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations;
    return statement.declarationList.declarations.length === 1 && isAwaitedGate(declaration.initializer);
  }
  return false;
}

function judge(name: string, fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression): Verdict {
  if (!hasModifier(fn, ts.SyntaxKind.AsyncKeyword)) return { name, ok: false, reason: "n'est pas asynchrone : une action serveur l'est toujours" };
  if (!fn.body || !ts.isBlock(fn.body)) return { name, ok: false, reason: "corps sans instruction : la barrière doit être la première" };
  if (!startsWithGate(fn.body.statements[0])) return { name, ok: false, reason: `la première instruction n'est pas « await ${SESSION_GATE}() »` };
  return { name, ok: true, reason: null };
}

/**
 * Tout ce que le fichier exporte et qui s'exécute : fonctions déclarées,
 * constantes fléchées, exports indirects (`export { x }`, `export default x`),
 * que l'on ne sait pas vérifier et qu'on refuse donc. Les types, eux, ne
 * s'exécutent pas : ils sont ignorés.
 */
function inspectActions(source: string, fileName = "actions.ts"): { verdicts: Verdict[]; importsGate: boolean; importedModules: string[]; usesServerDirective: boolean } {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const verdicts: Verdict[] = [];
  const importedModules: string[] = [];
  let importsGate = false;

  const first = file.statements[0];
  const usesServerDirective = Boolean(first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server");

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      importedModules.push(statement.moduleSpecifier.text);
      if (statement.moduleSpecifier.text === SESSION_MODULE) {
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) importsGate ||= bindings.elements.some((element) => (element.propertyName ?? element.name).text === SESSION_GATE && element.name.text === SESSION_GATE);
      }
    }

    if (ts.isFunctionDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      verdicts.push(judge(statement.name?.text ?? "default", statement));
    } else if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText(file);
        const init = declaration.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) verdicts.push(judge(name, init));
      }
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      verdicts.push({ name: statement.getText(file).slice(0, 60), ok: false, reason: "export indirect : déclarez l'action avec « export async function » pour qu'on puisse vérifier sa première ligne" });
    } else if (ts.isExportAssignment(statement)) {
      verdicts.push({ name: "export default", ok: false, reason: "export indirect : déclarez l'action avec « export async function »" });
    }
  }
  return { verdicts, importsGate, importedModules, usesServerDirective };
}

/** Les verdicts d'un fichier, une fois l'exception d'`director-auth.ts` appliquée : `null` si tout est en règle. */
function violationsOf(fileName: string, verdicts: Verdict[]): string[] {
  const allowed = PUBLIC_ACTIONS[fileName] ?? [];
  return verdicts
    .filter((verdict) => !verdict.ok && !allowed.includes(verdict.name))
    .map((verdict) => `${fileName} : ${verdict.name} ${verdict.reason}`);
}

const directorFiles = readdirSync(ACTIONS_DIR)
  .filter((name) => /^director-.+\.ts$/.test(name))
  .sort();

describe("la barrière de session de l'espace du directeur", () => {
  it("le test lit bien les fichiers d'actions du directeur", () => {
    expect(directorFiles).toContain("director-auth.ts");
  });

  for (const name of directorFiles) {
    describe(name, () => {
      const source = readFileSync(join(ACTIONS_DIR, name), "utf8");
      const { verdicts, importsGate, importedModules, usesServerDirective } = inspectActions(source, name);
      const isAuthFile = name in PUBLIC_ACTIONS;

      it("est un fichier d'actions serveur", () => {
        expect(usesServerDirective, `${name} doit commencer par "use server"`).toBe(true);
      });

      it("exporte au moins une action", () => {
        expect(verdicts.length).toBeGreaterThan(0);
      });

      it("n'importe la session d'aucun autre espace : ni la console, ni l'extranet, ni l'officine", () => {
        // `director-auth.ts` lit seulement les métadonnées de la requête (adresse IP) dans le module de session des officines.
        const forbidden = OTHER_SESSION_MODULES.filter((module) => importedModules.includes(module));
        const tolerated = isAuthFile ? ["@/server/auth/session"] : [];
        expect(forbidden.filter((module) => !tolerated.includes(module)), `${name} importe la session d'un autre espace`).toEqual([]);
        if (isAuthFile) expect(source).not.toMatch(/\b(requireSession|getSession|requirePlatformSession|requireSalesSession)\b/);
      });

      if (isAuthFile) {
        it("ne déroge à la barrière que pour les actions d'ouverture et de fermeture, listées une à une", () => {
          const allowed = PUBLIC_ACTIONS[name];
          expect(verdicts.map((verdict) => verdict.name).filter((action) => allowed.includes(action)).sort()).toEqual([...allowed].sort());
          expect(violationsOf(name, verdicts)).toEqual([]);
        });
      } else {
        it("importe la barrière depuis le module de session du directeur", () => {
          expect(importsGate, `${name} doit importer « ${SESSION_GATE} » de « ${SESSION_MODULE} »`).toBe(true);
        });

        it("chaque action appelle requireDirectorSession() avant tout autre traitement", () => {
          expect(violationsOf(name, verdicts)).toEqual([]);
        });
      }
    });
  }
});

describe("le détecteur de barrière détecte", () => {
  const gated = (body: string) => inspectActions(`import { requireDirectorSession } from "${SESSION_MODULE}";\nexport async function agir(payload: unknown) {\n${body}\n}`);

  it("accepte l'appel en première instruction, avec ou sans résultat", () => {
    expect(gated("const session = await requireDirectorSession();\nreturn session;").verdicts).toEqual([{ name: "agir", ok: true, reason: null }]);
    expect(gated("await requireDirectorSession();\nreturn 1;").verdicts[0].ok).toBe(true);
    expect(inspectActions(`export const agir = async () => {\n  await requireDirectorSession();\n};`).verdicts[0].ok).toBe(true);
  });

  it("refuse une action sans la barrière", () => {
    expect(gated("return 1;").verdicts[0].ok).toBe(false);
  });

  it("refuse la barrière placée après un autre traitement (validation, lecture, réponse)", () => {
    expect(gated("const parsed = schema.safeParse(payload);\nconst session = await requireDirectorSession();\nreturn parsed;").verdicts[0].ok).toBe(false);
    expect(gated("if (!payload) return fail('Requête invalide.');\nawait requireDirectorSession();").verdicts[0].ok).toBe(false);
    expect(gated("await prisma.salesRep.count();\nawait requireDirectorSession();").verdicts[0].ok).toBe(false);
  });

  it("refuse un appel qui n'est pas attendu, ou une variante qui ne bloque pas", () => {
    expect(gated("requireDirectorSession();\nreturn 1;").verdicts[0].ok).toBe(false);
    expect(gated("const session = await getDirectorSession();\nreturn session;").verdicts[0].ok).toBe(false);
    expect(gated("const session = await requirePlatformSession();").verdicts[0].ok).toBe(false);
    expect(gated("const session = await requireSalesSession();").verdicts[0].ok).toBe(false);
  });

  it("refuse la barrière cachée derrière une condition, un try ou un commentaire", () => {
    expect(gated("if (payload) {\n  await requireDirectorSession();\n}").verdicts[0].ok).toBe(false);
    expect(gated("try {\n  await requireDirectorSession();\n} catch {}").verdicts[0].ok).toBe(false);
    expect(gated("// await requireDirectorSession();\n/* await requireDirectorSession(); */\nreturn 1;").verdicts[0].ok).toBe(false);
    expect(gated("const note = 'await requireDirectorSession()';\nreturn note;").verdicts[0].ok).toBe(false);
  });

  it("refuse une fonction exportée qui n'est pas asynchrone, une flèche sans corps, un export indirect", () => {
    expect(inspectActions("export function agir() {\n  return 1;\n}").verdicts[0].ok).toBe(false);
    expect(inspectActions("export const agir = async () => 1;").verdicts[0].ok).toBe(false);
    expect(inspectActions("async function agir() {\n  await requireDirectorSession();\n}\nexport { agir };").verdicts[0].ok).toBe(false);
    expect(inspectActions("async function agir() {\n  await requireDirectorSession();\n}\nexport default agir;").verdicts[0].ok).toBe(false);
  });

  it("ne demande rien aux types exportés, et repère l'import d'une fausse barrière locale", () => {
    expect(inspectActions("export type Payload = { id: string };\nexport interface Autre { a: number }").verdicts).toEqual([]);
    expect(inspectActions('import { requireDirectorSession } from "./local-faux";').importsGate).toBe(false);
    expect(inspectActions(`import { requireDirectorSession } from "${SESSION_MODULE}";`).importsGate).toBe(true);
    expect(inspectActions(`import { requireDirectorSession as autre } from "${SESSION_MODULE}";`).importsGate).toBe(false);
  });

  it("repère la directive « use server » et les sessions étrangères importées", () => {
    expect(inspectActions('"use server";\nexport async function a() {}').usesServerDirective).toBe(true);
    expect(inspectActions('import "x";\n"use server";').usesServerDirective).toBe(false);
    expect(inspectActions('import { requirePlatformSession } from "@/server/auth/platform-session";').importedModules).toEqual(["@/server/auth/platform-session"]);
  });
});

describe("l'exception de director-auth.ts", () => {
  const verdict = (name: string, ok = false): Verdict => ({ name, ok, reason: ok ? null : "sans barrière" });

  it("tolère exactement les actions listées, et aucune autre", () => {
    expect(violationsOf("director-auth.ts", [verdict("directorLoginAction"), verdict("directorLogoutAction")])).toEqual([]);
    expect(violationsOf("director-auth.ts", [verdict("deleteEverythingAction")])).toEqual(["director-auth.ts : deleteEverythingAction sans barrière"]);
  });

  it("ne s'applique à aucun autre fichier, même pour une action du même nom", () => {
    expect(violationsOf("director-reps.ts", [verdict("directorLoginAction")])).toEqual(["director-reps.ts : directorLoginAction sans barrière"]);
    expect(violationsOf("director-money.ts", [verdict("payInvoiceAction")])).toEqual(["director-money.ts : payInvoiceAction sans barrière"]);
  });

  it("ne liste que des actions d'ouverture et de fermeture de session", () => {
    expect(PUBLIC_ACTIONS["director-auth.ts"]).toEqual(["directorLoginAction", "directorLogoutAction", "requestDirectorPasswordLinkAction", "setDirectorPasswordAction"]);
    expect(Object.keys(PUBLIC_ACTIONS)).toEqual(["director-auth.ts"]);
  });
});
