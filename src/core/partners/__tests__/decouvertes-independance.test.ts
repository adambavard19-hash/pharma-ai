import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../../ai/pipeline";
import { drug, patient, product } from "../../ai/__tests__/fixtures";
import type { DrugKnowledge } from "../../ai/types";

/**
 * PharmaBoost Mobile, Découvertes : les campagnes sponsorisées, les nouveautés des marques, les favoris et les demandes
 * d'information n'existent QUE pour l'application. Le moteur de conseil (src/core/ai) et le service qui le fait
 * tourner (src/server/services/analysis.ts) ne les lisent jamais : une campagne payée ne peut pas changer un conseil.
 */

const FORBIDDEN_MODELS = /\b(SponsoredCampaign|SponsoredCampaignDailyStat|PartnerLaunch|UserFavorite|PartnerInfoRequest)\b|\b(sponsoredCampaign|sponsoredCampaignDailyStat|partnerLaunch|userFavorite|partnerInfoRequest)\./;
const FORBIDDEN_IMPORTS = /from\s+["'][^"']*(core\/discover|core\/sponsoring|services\/mobile\/(discover|sponsoring))[^"']*["']/;

function sources(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== "__tests__") walk(path);
      } else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(root);
  return files;
}

describe("le moteur de conseil ignore tout le commercial de l'application mobile", () => {
  const engine = [...sources(join(__dirname, "../../ai")), join(__dirname, "../../../server/services/analysis.ts")];

  it("aucun fichier du moteur ne lit les campagnes, nouveautés, favoris ou demandes d'information", () => {
    expect(engine.length).toBeGreaterThan(10);
    for (const file of engine) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(FORBIDDEN_MODELS);
      expect(source, file).not.toMatch(FORBIDDEN_IMPORTS);
    }
  });

  it("les modules Découvertes et sponsoring n'importent pas le moteur (ils ne peuvent pas le piloter)", () => {
    const discover = [...sources(join(__dirname, "../../discover")), ...sources(join(__dirname, "../../sponsoring"))];
    expect(discover.length).toBeGreaterThan(2);
    for (const file of discover) expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["'][^"']*(core\/ai|\.\.\/ai)\//);
  });

  it("l'entrée du moteur n'a aucun champ où glisser une campagne : le résultat est identique quoi qu'on « sponsorise »", () => {
    const input: PipelineInput = {
      lines: [{ lineIndex: 0, drugName: "Amoxicilline", posology: "1 comprimé matin et soir", durationDays: 6, confirmed: true }],
      knowledge: new Map<string, DrugKnowledge | null>([["amoxicilline", drug()]]),
      patient: patient(),
      catalog: [product({ id: "adapte", name: "AUTRE Flore", brand: "Autre" }), product({ id: "sponsorise", name: "MARQUE A Flore", brand: "Marque A", purchasePriceCents: 100, salePriceCents: 2990 })],
      rules: [],
      history: {},
      explanations: [],
      extractionFindings: [],
      usedSimulatedProviders: false,
    };
    const plain = runAnalysisPipeline(input).recommendations.map((r) => [r.productId, r.totalScore]);
    // Une « campagne » glissée dans l'entrée (champ inconnu du moteur) n'a aucun effet.
    const withCampaign = runAnalysisPipeline({ ...input, sponsoredCampaigns: [{ brand: "Marque A", placements: ["HOME_FEED"] }] } as unknown as PipelineInput).recommendations.map((r) => [r.productId, r.totalScore]);
    expect(withCampaign).toEqual(plain);
  });
});
