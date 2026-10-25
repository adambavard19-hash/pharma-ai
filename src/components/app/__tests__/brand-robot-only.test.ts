import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Le fondateur ne veut plus voir, sur aucun écran du logiciel ni du site, l'icône d'application (le robot dessiné sur un
 * carré bleu nuit) : partout, c'est le robot vivant (`components/robot`). Ce test lit chaque fichier d'écran et refuse
 * toute référence aux images à fond bleu.
 *
 * Laissés volontairement, parce que rien ne peut y bouger : l'icône d'onglet et l'icône d'application (fichiers
 * `src/app/icon.png`, `apple-icon.png`, `manifest.ts`, l'icône iOS de /m déclarée dans ses métadonnées), les images de
 * partage (`opengraph-image`), les e-mails (servis hors de `src/app` et `src/components`) et l'icône de l'installateur Windows.
 */

const ROOT = process.cwd();
const SCANNED = ["src/app", "src/components"];

/** Les images à fond bleu tirées par `scripts/logo-robot.ts`. */
const BLUE_ICONS = /(?:\/logo(?:-256|-1200)?\.(?:png|svg)|apple-icon\.png|\/icon\.png|apple-touch-icon\.png|icon-(?:192|512)\.png|maskable-512\.png)/;

/** Les seuls fichiers d'`src/app` et `src/components` qui peuvent encore les citer : ce qui ne s'anime pas. */
const ALLOWED = new Set([
  "src/app/manifest.ts", // icônes d'installation (PWA)
  "src/app/(mobile)/m/layout.tsx", // métadonnées : icône iOS de l'application mobile
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") walk(full, out);
    } else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("la marque à l'écran : le robot vivant, jamais l'icône à fond bleu", () => {
  const files = SCANNED.flatMap((dir) => walk(join(ROOT, dir)));

  it("trouve bien les écrans à lire", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("aucun écran de l'application ni du site ne cite l'icône à fond bleu (hors favicon, icône d'app, partage)", () => {
    const offenders = files
      .map((file) => relative(ROOT, file).split("\\").join("/"))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => BLUE_ICONS.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("le logo centralisé et le robot des en-têtes mobiles sont le robot vivant, réactif au toucher", () => {
    for (const file of ["src/components/app/logo.tsx", "src/app/(mobile)/m/_components/ui.tsx"]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).toMatch(/import \{ Robot \} from "@\/components\/robot"/);
      expect(source).toMatch(/<Robot [^>]*\binteractive\b/);
      expect(source).not.toMatch(/<img|next\/image/);
    }
  });
});
