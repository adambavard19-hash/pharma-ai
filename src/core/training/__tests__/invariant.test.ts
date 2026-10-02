/**
 * La formation n'alimente jamais le conseil.
 *
 * Un contenu de formation vient souvent d'un laboratoire : s'il pouvait
 * remonter dans le moteur, un argument de marque finirait dans une raison
 * affichée au comptoir. Le cloisonnement est donc vérifié dans les deux sens,
 * sur le code lui-même : le module formation n'importe rien du moteur de
 * conseil, et le moteur comme ses services n'importent rien de la formation.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function imports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

describe("cloisonnement formation / conseil", () => {
  it("le module formation n'importe rien du moteur de conseil", () => {
    const files = sourceFiles(path.join(SRC, "core/training"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const target of imports(file)) {
        expect(target, path.relative(SRC, file)).not.toMatch(/(^|\/)core\/ai(\/|$)|^\.\.\/ai(\/|$)/);
      }
    }
  });

  it("le moteur de conseil et ses services n'importent rien de la formation", () => {
    const engine = sourceFiles(path.join(SRC, "core/ai"));
    const services = ["server/services/analysis.ts", "server/services/catalog.ts"].map((file) => path.join(SRC, file));
    for (const file of [...engine, ...services]) {
      for (const target of imports(file)) {
        expect(target, path.relative(SRC, file)).not.toMatch(/training|formation/);
      }
    }
  });
});
