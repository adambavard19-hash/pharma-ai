import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * La console d'administration n'a aucun « tenant » : ce qu'une action de
 * `admin-*.ts` fait, elle le fait pour toute la plateforme. La barrière qui la
 * protège est une seule ligne, `await requirePlatformSession()`, et elle doit
 * précéder TOUT le reste : valider la requête, lire la base ou répondre avant de
 * l'avoir franchie laisserait un visiteur sans session sonder la console (une
 * réponse « Requête invalide » est déjà une information).
 *
 * Ce test lit les sources, pas des mocks : une action ajoutée demain sans la
 * barrière, ou avec la barrière trop tard, fait échouer la suite. Il analyse
 * l'arbre syntaxique, de sorte qu'un commentaire ou une chaîne qui cite
 * `requirePlatformSession()` ne compte jamais pour l'appel.
 */

const ACTIONS_DIR = join(__dirname, "..");
const SESSION_GATE = "requirePlatformSession";
const SESSION_MODULE = "@/server/auth/platform-session";

type Verdict = { name: string; ok: boolean; reason: string | null };

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);

/** `await requirePlatformSession()`, éventuellement entre parenthèses. */
function isAwaitedGate(expression: ts.Expression | undefined): boolean {
  let current = expression;
  while (current && ts.isParenthesizedExpression(current)) current = current.expression;
  if (!current || !ts.isAwaitExpression(current)) return false;
  let call: ts.Expression = current.expression;
  while (ts.isParenthesizedExpression(call)) call = call.expression;
  return ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === SESSION_GATE;
}

/** La première instruction du corps : `await requirePlatformSession();` ou `const x = await requirePlatformSession();`. */
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
function inspectActions(source: string, fileName = "actions.ts"): { verdicts: Verdict[]; importsGate: boolean } {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const verdicts: Verdict[] = [];
  let importsGate = false;

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === SESSION_MODULE) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) importsGate ||= bindings.elements.some((element) => (element.propertyName ?? element.name).text === SESSION_GATE && element.name.text === SESSION_GATE);
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
  return { verdicts, importsGate };
}

const adminFiles = readdirSync(ACTIONS_DIR)
  .filter((name) => /^admin-.+\.ts$/.test(name))
  .sort();

describe("la barrière de session de la console", () => {
  it("le test lit bien les fichiers d'actions de la console", () => {
    expect(adminFiles.length).toBeGreaterThanOrEqual(8);
    expect(adminFiles).toContain("admin-campaigns.ts");
  });

  for (const name of adminFiles) {
    describe(name, () => {
      const source = readFileSync(join(ACTIONS_DIR, name), "utf8");
      const { verdicts, importsGate } = inspectActions(source, name);

      it("importe la barrière depuis le module de session de la console", () => {
        expect(importsGate, `${name} doit importer « ${SESSION_GATE} » de « ${SESSION_MODULE} »`).toBe(true);
      });

      it("exporte au moins une action", () => {
        expect(verdicts.length).toBeGreaterThan(0);
      });

      it("chaque action appelle requirePlatformSession() avant tout autre traitement", () => {
        const violations = verdicts.filter((verdict) => !verdict.ok).map((verdict) => `${name} : ${verdict.name} ${verdict.reason}`);
        expect(violations).toEqual([]);
      });
    });
  }
});

describe("le détecteur de barrière détecte", () => {
  const gated = (body: string) => inspectActions(`import { requirePlatformSession } from "${SESSION_MODULE}";\nexport async function agir(payload: unknown) {\n${body}\n}`);

  it("accepte l'appel en première instruction, avec ou sans résultat", () => {
    expect(gated("const session = await requirePlatformSession();\nreturn session;").verdicts).toEqual([{ name: "agir", ok: true, reason: null }]);
    expect(gated("await requirePlatformSession();\nreturn 1;").verdicts[0].ok).toBe(true);
    expect(inspectActions(`export const agir = async () => {\n  await requirePlatformSession();\n};`).verdicts[0].ok).toBe(true);
  });

  it("refuse une action sans la barrière", () => {
    expect(gated("return 1;").verdicts[0].ok).toBe(false);
  });

  it("refuse la barrière placée après un autre traitement (validation, lecture, réponse)", () => {
    expect(gated("const parsed = schema.safeParse(payload);\nconst session = await requirePlatformSession();\nreturn parsed;").verdicts[0].ok).toBe(false);
    expect(gated("if (!payload) return fail('Requête invalide.');\nawait requirePlatformSession();").verdicts[0].ok).toBe(false);
    expect(gated("await prisma.pharmacy.count();\nawait requirePlatformSession();").verdicts[0].ok).toBe(false);
  });

  it("refuse un appel qui n'est pas attendu, ou une variante qui ne bloque pas", () => {
    expect(gated("requirePlatformSession();\nreturn 1;").verdicts[0].ok).toBe(false);
    expect(gated("const session = await getPlatformSession();\nreturn session;").verdicts[0].ok).toBe(false);
    expect(gated("const session = await requirePermission(PERMISSIONS.NEWS_MANAGE);").verdicts[0].ok).toBe(false);
  });

  it("refuse la barrière cachée derrière une condition, un try ou un commentaire", () => {
    expect(gated("if (payload) {\n  await requirePlatformSession();\n}").verdicts[0].ok).toBe(false);
    expect(gated("try {\n  await requirePlatformSession();\n} catch {}").verdicts[0].ok).toBe(false);
    expect(gated("// await requirePlatformSession();\n/* await requirePlatformSession(); */\nreturn 1;").verdicts[0].ok).toBe(false);
    expect(gated("const note = 'await requirePlatformSession()';\nreturn note;").verdicts[0].ok).toBe(false);
  });

  it("refuse une fonction exportée qui n'est pas asynchrone, une flèche sans corps, un export indirect", () => {
    expect(inspectActions("export function agir() {\n  return 1;\n}").verdicts[0].ok).toBe(false);
    expect(inspectActions("export const agir = async () => 1;").verdicts[0].ok).toBe(false);
    expect(inspectActions("async function agir() {\n  await requirePlatformSession();\n}\nexport { agir };").verdicts[0].ok).toBe(false);
    expect(inspectActions("async function agir() {\n  await requirePlatformSession();\n}\nexport default agir;").verdicts[0].ok).toBe(false);
  });

  it("ne demande rien aux types exportés, et repère l'import d'une fausse barrière locale", () => {
    expect(inspectActions("export type Payload = { id: string };\nexport interface Autre { a: number }").verdicts).toEqual([]);
    expect(inspectActions('import { requirePlatformSession } from "./local-faux";').importsGate).toBe(false);
    expect(inspectActions(`import { requirePlatformSession } from "${SESSION_MODULE}";`).importsGate).toBe(true);
    expect(inspectActions(`import { requirePlatformSession as autre } from "${SESSION_MODULE}";`).importsGate).toBe(false);
  });
});
