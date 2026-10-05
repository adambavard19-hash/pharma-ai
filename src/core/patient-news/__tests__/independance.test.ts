import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Les nouveautés d'une officine sont l'affaire de l'officine et de ses
 * patients. Aucun partenaire, aucun laboratoire, aucun paiement ne les
 * déclenche, ne les finance ni n'y mêle sa marque : le module n'importe ni
 * module ni modèle « partenaire ». Comme pour le moteur de conseil, la garantie
 * est dans les sources, pas dans une promesse.
 */

const SRC = join(__dirname, "../../..");

function sourcesUnder(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        if (name !== "__tests__") walk(path);
      } else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(dir);
  return files;
}

/** Le code, sans les commentaires : un commentaire a le droit de parler de partenaires. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const importedModules = (source: string): string[] => [...code(source).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);
const partnerModels = (source: string): string[] => code(source).match(/\bPartner[A-Za-z]*\b|prisma\.partner\w*/gi) ?? [];
const paymentImports = (source: string): string[] => importedModules(source).filter((specifier) => /billing|stripe|referral|campaign/i.test(specifier));

const FILES = [
  ...sourcesUnder(join(SRC, "core/patient-news")),
  join(SRC, "server/services/patient-news.ts"),
  join(SRC, "server/actions/patient-news.ts"),
  ...sourcesUnder(join(SRC, "app/(public)/nouveautes")),
];

describe("les nouveautés pour les patients sont indépendantes des partenaires", () => {
  it("le test lit bien les sources du module", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(10);
    expect(FILES.some((file) => file.endsWith("services/patient-news.ts"))).toBe(true);
  });

  it("le détecteur détecte : un import, un modèle ou un paiement le font échouer, un commentaire non", () => {
    expect(importedModules('import { x } from "@/server/services/partners/brands";\nconst y = await import("@/core/partners/commission");')).toEqual(["@/server/services/partners/brands", "@/core/partners/commission"]);
    expect(partnerModels("await prisma.partnerBrand.findMany(); const t: PartnerOrder = null;")).toEqual(["prisma.partnerBrand", "PartnerOrder"]);
    expect(partnerModels("// Aucun PartnerBrand ici\n/* ni PartnerOffer */\nconst ok = 1;")).toEqual([]);
    expect(paymentImports('import { a } from "@/core/billing/referral";')).toEqual(["@/core/billing/referral"]);
  });

  it("aucun import ne vise un module « partenaire »", () => {
    for (const file of FILES) {
      for (const specifier of importedModules(readFileSync(file, "utf8"))) expect(specifier, file).not.toMatch(/partner/i);
    }
  });

  it("aucun modèle ni accès « partenaire » dans le code", () => {
    for (const file of FILES) expect(partnerModels(readFileSync(file, "utf8")), file).toEqual([]);
  });

  it("ni paiement ni parrainage : rien n'est déclenché par un abonnement ou une offre", () => {
    for (const file of FILES) expect(paymentImports(readFileSync(file, "utf8")), file).toEqual([]);
  });
});
