import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHALLENGE_DATA_SOURCES, challengeDataSourceInfo, describeChallengeSources } from "../sources";

/**
 * Deux garanties :
 * - l'écran ne prétend jamais qu'un connecteur partenaire est branché quand il
 *   ne l'est pas (Opeaz est déclaré « non connecté ») ;
 * - les challenges restent hors du moteur de conseil : le module n'importe rien
 *   du moteur, et le moteur n'importe rien des challenges.
 */

describe("sources des données d'un challenge", () => {
  it("n'annonce comme disponible que les ventes enregistrées dans PharmaBoost", () => {
    expect(CHALLENGE_DATA_SOURCES.filter((source) => source.status === "available").map((source) => source.key)).toEqual(["PHARMABOOST"]);
  });

  it("déclare Opeaz non connecté, et le dit en toutes lettres", () => {
    expect(challengeDataSourceInfo("OPEAZ")?.status).toBe("not_connected");
    expect(challengeDataSourceInfo("OPEAZ")?.description).toMatch(/^Non connecté/);
    expect(challengeDataSourceInfo("INCONNUE")).toBeNull();
  });

  it("résume les sources sur une ligne", () => {
    expect(describeChallengeSources()).toBe("Ventes enregistrées dans PharmaBoost · Opeaz : non connecté");
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("séparation du commercial et du clinique", () => {
  const root = join(__dirname, "..", "..");
  const src = join(root, "..");
  const IMPORTS_ENGINE = /(?:from\s+|import\s*\(\s*)["'](?:@\/core\/ai|(?:\.\.\/)+ai)(?:\/|["'])/;
  const IMPORTS_CHALLENGES = /(?:from\s+|import\s*\(\s*)["'][^"']*challenge[^"']*["']/i;

  it("le module des challenges n'importe rien du moteur de conseil", () => {
    for (const file of sourceFiles(join(root, "challenges"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(IMPORTS_ENGINE);
    }
  });

  it("ni son service, ni ses actions, ni ses écrans n'importent le moteur de conseil", () => {
    const files = [
      join(src, "server", "services", "challenges.ts"),
      join(src, "server", "services", "challenge-sources.ts"),
      join(src, "server", "actions", "challenges.ts"),
      ...sourceFiles(join(src, "app", "(app)", "parametres", "laboratoires", "challenges")),
      ...sourceFiles(join(src, "app", "(admin)", "admin", "challenges")),
    ];
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(IMPORTS_ENGINE);
    }
  });

  it("le comptoir n'importe rien des challenges : aucun objectif commercial devant le patient", () => {
    const files = [...sourceFiles(join(src, "app", "(app)", "vente")), ...sourceFiles(join(root, "counter"))];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(IMPORTS_CHALLENGES);
    }
  });

  it("le moteur de conseil n'importe rien des challenges", () => {
    for (const file of sourceFiles(join(root, "ai"))) {
      // Les commentaires peuvent parler des challenges ; aucun import ne doit y mener.
      expect(readFileSync(file, "utf8"), file).not.toMatch(IMPORTS_CHALLENGES);
    }
  });
});
