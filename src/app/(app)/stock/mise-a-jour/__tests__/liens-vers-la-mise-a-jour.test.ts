import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Un seul chemin pour mettre à jour son stock : « Importer mon stock » (le
 * conseil d'une ordonnance sans stock) et « importer le stock » (la page des
 * gammes sans marque) mènent à « Mettre à jour mon stock », pas à l'ancien
 * assistant d'import. Seul /bienvenue garde le premier import avec aperçu.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/recommendations", () => ({
  addManualRecommendationAction: vi.fn(),
  declineRecommendationAction: vi.fn(),
  modifyRecommendationAction: vi.fn(),
  removeRecommendationAction: vi.fn(),
  reopenRecommendationAction: vi.fn(),
  replaceRecommendationAction: vi.fn(),
  setRecommendationPriceAction: vi.fn(),
}));
vi.mock("@/server/actions/opportunities", () => ({ answerOpportunityAction: vi.fn() }));
vi.mock("@/server/actions/preferred-ranges", () => ({ deletePreferredRangeAction: vi.fn(), setPreferredRangeActiveAction: vi.fn(), savePreferredRangeAction: vi.fn() }));
vi.mock("../../../vente/[id]/product-picker", () => ({ ProductPicker: () => null }));
vi.mock("../../../vente/[id]/reanalyse-button", () => ({ ReanalyseButton: () => null }));
vi.mock("../../../parametres/laboratoires/gammes/range-modal", () => ({ RangeModal: () => null, formatPercent: (n: number) => `${n} %` }));

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

describe("les liens « importer mon stock »", () => {
  it("le conseil d'ordonnance quand le stock n'est pas configuré : « Importer mon stock » mène à la page de mise à jour", async () => {
    const { AdviceZone } = await import("../../../vente/[id]/advice-zone");
    const html = renderToStaticMarkup(
      createElement(AdviceZone, {
        prescriptionId: "rx-1",
        recommendations: [],
        nothingProposed: true,
        canDecide: false,
        locked: false,
        outcome: "STOCK_NOT_CONFIGURED",
        canImportStock: true,
        stockNotice: null,
        presentProductIds: new Set<string>(),
        inBasket: () => false,
        onAccept: vi.fn(),
        onCancelAccept: vi.fn(),
      }),
    );
    expect(html).toContain("Importer mon stock");
    expect(hrefs(html)).toContain("/stock/mise-a-jour");
    expect(hrefs(html)).not.toContain("/stock/import");
  });

  it("sans le droit d'importer le stock, aucun lien", async () => {
    const { AdviceZone } = await import("../../../vente/[id]/advice-zone");
    const html = renderToStaticMarkup(
      createElement(AdviceZone, {
        prescriptionId: "rx-1",
        recommendations: [],
        nothingProposed: true,
        canDecide: false,
        locked: false,
        outcome: "STOCK_NOT_CONFIGURED",
        canImportStock: false,
        stockNotice: null,
        presentProductIds: new Set<string>(),
        inBasket: () => false,
        onAccept: vi.fn(),
        onCancelAccept: vi.fn(),
      }),
    );
    expect(hrefs(html)).not.toContain("/stock/mise-a-jour");
    expect(hrefs(html)).not.toContain("/stock/import");
  });

  it("la page des gammes sans marque lue dans le stock : « importer le stock » mène à la page de mise à jour", async () => {
    const { RangesManager } = await import("../../../parametres/laboratoires/gammes/ranges-manager");
    const html = renderToStaticMarkup(createElement(RangesManager, { ranges: [], brands: [] }));
    expect(html).toContain("importer le stock");
    expect(hrefs(html)).toContain("/stock/mise-a-jour");
    expect(hrefs(html)).not.toContain("/stock/import");
  });
});
