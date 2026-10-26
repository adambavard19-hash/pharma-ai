import { describe, expect, it } from "vitest";
import { APP_ICON_SCRIPT, looksLikeIco } from "../app-icon";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("l'icône du logiciel sur les postes déjà installés", () => {
  it("l'icône livrée est un vrai .ico, que l'agent accepte", () => {
    const bytes = readFileSync(join(__dirname, "..", "..", "..", "installateur", "assets", "pharmaboost.ico"));
    expect(looksLikeIco(new Uint8Array(bytes))).toBe(true);
  });

  it("refuse ce qui n'est pas une icône (une page d'erreur, un fichier vide)", () => {
    expect(looksLikeIco(new TextEncoder().encode("<html>erreur</html>"))).toBe(false);
    expect(looksLikeIco(new Uint8Array())).toBe(false);
  });

  it("touche les deux raccourcis posés par l'installateur, et eux seuls", () => {
    const nsi = readFileSync(join(__dirname, "..", "..", "..", "installateur", "installer.nsi"), "utf8");
    expect(nsi).toContain('"$SMPROGRAMS\\PharmaBoost\\PharmaBoost.lnk"');
    expect(nsi).toContain('"$DESKTOP\\PharmaBoost.url"');
    expect(APP_ICON_SCRIPT).toContain("'PharmaBoost\\PharmaBoost.lnk'");
    expect(APP_ICON_SCRIPT).toContain("'PharmaBoost.url'");
  });
});
