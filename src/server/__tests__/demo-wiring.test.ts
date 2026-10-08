import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Le câblage de l'officine de démonstration, tenu par le code : chaque endroit où une officine
 * (et non la plateforme) appelle un fournisseur externe passe le drapeau `demo`. Un nouvel appel
 * sans drapeau ferait sortir la démonstration de chez elle : ce test le refuse.
 * (Le comportement du drapeau lui-même est éprouvé dans `ai/__tests__/registry-demo.test.ts`.)
 */

const read = (path: string) => readFileSync(path, "utf8");

/** Chaque appel `fonction(...)` du fichier, avec ses arguments (la parenthèse fermante suffit ici : aucun appel n'en imbrique). */
const calls = (source: string, name: string) => [...source.matchAll(new RegExp(`${name}\\(([^)]*)\\)`, "g"))].map((match) => match[1]);

const MESSAGING_SITES = [
  "src/server/actions/documents.ts",
  "src/server/services/followup.ts",
  "src/server/services/user-password.ts",
  "src/server/services/sealed-documents.ts",
  "src/server/services/patient-news.ts",
];
const AI_SITES = ["src/server/services/analysis.ts", "src/server/services/classification.ts", "src/server/services/product-classification.ts", "src/server/services/counter-request.ts"];
const OCR_SITES = ["src/server/services/analysis.ts", "src/server/services/prescription-upload.ts", "src/server/actions/prescriptions.ts"];

describe("les appels aux fournisseurs, côté officine", () => {
  for (const file of MESSAGING_SITES) {
    it(`${file} : chaque envoi d'e-mail porte le drapeau démo`, () => {
      const found = calls(read(file), "getMessagingProvider").filter((args) => args !== "" || true);
      // Les lectures d'état (`.info`) ne sont pas des envois : on ne contrôle que les appels qui envoient.
      const source = read(file);
      const sending = [...source.matchAll(/getMessagingProvider\(([^)]*)\)\s*\.sendEmail|messaging = [^;\n]*getMessagingProvider\(([^)]*)\)/g)];
      expect(sending.length, `aucun envoi trouvé dans ${file}`).toBeGreaterThan(0);
      for (const match of sending) expect(`${match[1] ?? ""}${match[2] ?? ""}`, `${file} : envoi sans drapeau démo`).toContain("demo:");
      expect(found.length).toBeGreaterThan(0);
    });
  }

  for (const file of AI_SITES) {
    it(`${file} : le modèle n'est jamais appelé pour la démonstration`, () => {
      const found = calls(read(file), "getAIProvider");
      expect(found.length).toBeGreaterThan(0);
      for (const args of found) expect(args, `${file} : getAIProvider() sans drapeau démo`).toContain("demo:");
    });
  }

  for (const file of OCR_SITES) {
    it(`${file} : aucune image n'est confiée à un tiers pour la démonstration`, () => {
      const found = calls(read(file), "getOCRProvider");
      expect(found.length).toBeGreaterThan(0);
      for (const args of found) expect(args, `${file} : getOCRProvider() sans drapeau démo`).toContain("demo:");
    });
  }
});
