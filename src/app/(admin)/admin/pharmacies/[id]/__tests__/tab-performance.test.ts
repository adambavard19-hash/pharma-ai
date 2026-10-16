import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdviceRow } from "@/server/services/counter-history";
import type { ClosedSale } from "@/core/counter/sales-report";

/**
 * L'onglet « Performance » de la fiche officine (console, 16 oct. 2026), rendu côté serveur sans base ni navigateur : la
 * période lue dans l'adresse, les quatre chiffres, la liste des conseils (filtrable, chacun se déplie), le PDF de la même
 * période, l'officine de démonstration. Les calculs eux-mêmes sont éprouvés dans le cœur (sales-report).
 */

const NOW = new Date("2026-10-16T10:00:00Z");

const mocks = vi.hoisted(() => ({
  pharmacy: vi.fn(),
  isDemoMode: vi.fn(() => false),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  rangeSeen: [] as { from: Date; to: Date; param: string }[],
}));

const SALE: ClosedSale = {
  id: "rx_1",
  reference: "V-0024",
  closedAt: new Date("2026-10-16T08:30:00Z"),
  who: "Donna",
  boxes: ["CÉTIRIZINE 10 mg"],
  proposed: 3,
  sold: 1,
  notSold: 2,
  unanswered: 0,
  soldItems: [{ name: "AllergiFlash", priceCents: 890, marginCents: 300 }],
  emailSent: false,
};

const ROWS: AdviceRow[] = [
  { id: "r1", at: SALE.closedAt, saleId: "rx_1", saleReference: "V-0024", who: "Donna", product: "AllergiFlash", forDrug: "CÉTIRIZINE 10 mg", status: "SOLD", priceCents: 890, reason: "Les yeux qui piquent", soldByScan: true, boxes: ["CÉTIRIZINE 10 mg"] },
  { id: "r2", at: SALE.closedAt, saleId: "rx_1", saleReference: "V-0024", who: "Donna", product: "Stérimar Nez Allergique", forDrug: "CÉTIRIZINE 10 mg", status: "NOT_SOLD", priceCents: null, reason: "Rincer les pollens", soldByScan: false, boxes: ["CÉTIRIZINE 10 mg"] },
  { id: "r3", at: SALE.closedAt, saleId: "rx_1", saleReference: "V-0024", who: "Donna", product: "Azéol Gorge", forDrug: null, status: "NOT_SOLD", priceCents: null, reason: null, soldByScan: false, boxes: ["CÉTIRIZINE 10 mg"] },
];

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/config/env", () => ({ isDemoMode: mocks.isDemoMode }));
vi.mock("@/server/db/client", () => ({ prisma: { pharmacy: { findUnique: mocks.pharmacy } } }));
vi.mock("@/server/services/counter-history", async () => {
  const { buildSalesReport } = await import("@/core/counter/sales-report");
  return {
    loadSalesReport: async ({ range, now }: { range: { from: Date; to: Date; param: string; label: string; byHour: boolean }; now: Date }) => {
      mocks.rangeSeen.push(range);
      return buildSalesReport({ range, sales: [SALE], now, timeZone: "Europe/Paris" });
    },
    loadAdviceRows: async () => ROWS,
  };
});

const { PerformanceTab } = await import("../tab-performance");
const { parseTab, tabHref, TAB_KEYS } = await import("../shared");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/[\s  ]+/g, " ");
const render = async (query: Record<string, string> = {}) => renderToStaticMarkup((await PerformanceTab({ pharmacyId: "ph_1", query, now: NOW })) as React.ReactElement);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rangeSeen = [];
  mocks.pharmacy.mockResolvedValue({ id: "ph_1", isDemo: false });
  mocks.isDemoMode.mockReturnValue(false);
});

describe("les quatre chiffres, la liste et le PDF", () => {
  it("conseils proposés, vendus, taux de vente, chiffre d'affaires ajouté", async () => {
    const page = text(await render({ periode: "jour" }));
    expect(page).toMatch(/Conseils proposés 3/);
    expect(page).toMatch(/Conseils vendus 1 sur 3 proposés · 1 par le scan/);
    expect(page).toMatch(/Taux de vente 33,3 %/);
    expect(page).toMatch(/Chiffre d'affaires ajouté 8,90 €/);
  });

  it("chaque conseil se déplie : pourquoi, la vente, le résultat (vendu par le scan)", async () => {
    const html = await render({ periode: "jour" });
    expect(html.match(/<details/g)).toHaveLength(3);
    const page = text(html);
    expect(page).toContain("AllergiFlash");
    expect(page).toContain("pour CÉTIRIZINE 10 mg");
    expect(page).toContain("Vendu en bipant le produit · 8,90 € TTC");
    expect(page).toContain("Vente 24");
  });

  it("le filtre « Non vendus » ne garde qu'eux, avec les bons compteurs", async () => {
    const html = await render({ periode: "jour", statut: "non-vendus" });
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(text(html)).toMatch(/Tous 3 Vendus 1 Non vendus 2 Sans réponse 0/);
  });

  it("le PDF suit la période choisie, jour précis compris", async () => {
    expect(await render({ periode: "2026-10-14" })).toContain("/api/admin/pharmacies/ph_1/comptoir-pdf?periode=2026-10-14");
    expect(text(await render({ periode: "2026-10-14" }))).toContain("Télécharger le PDF · Le 14 octobre 2026");
  });
});

describe("la période", () => {
  it("par défaut : les 7 derniers jours ; une valeur douteuse aussi", async () => {
    await render();
    await render({ periode: "<script>" });
    expect(mocks.rangeSeen.map((range) => range.param)).toEqual(["semaine", "semaine"]);
  });

  it("aujourd'hui commence à minuit à Paris ; un mois précis va du 1er à la fin du mois (jamais au-delà de maintenant)", async () => {
    await render({ periode: "jour" });
    await render({ periode: "2026-09" });
    await render({ periode: "2026-10" });
    expect(mocks.rangeSeen[0]!.from.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    expect(mocks.rangeSeen[1]!.from.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(mocks.rangeSeen[1]!.to.toISOString()).toBe("2026-09-30T21:59:59.999Z");
    expect(mocks.rangeSeen[2]!.to.toISOString()).toBe(NOW.toISOString());
  });
});

describe("les cas à part", () => {
  it("officine inconnue : 404", async () => {
    mocks.pharmacy.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("officine de démonstration hors environnement démo : un bandeau, jamais des chiffres présentés comme une mesure", async () => {
    mocks.pharmacy.mockResolvedValue({ id: "ph_1", isDemo: true });
    const page = text(await render());
    expect(page).toContain("Officine de démonstration");
    expect(page).not.toContain("Conseils proposés");
  });
});

describe("l'onglet dans la fiche (adresse et lecture de l'onglet)", () => {
  it("« performance » est un onglet connu ; une valeur inconnue ou vide retombe sur l'aperçu", () => {
    expect(TAB_KEYS).toContain("performance");
    expect(parseTab("performance")).toBe("performance");
    expect(parseTab("x")).toBe("apercu");
    expect(parseTab(null)).toBe("apercu");
  });

  it("le lien de la fiche vers l'onglet porte ?onglet=performance, et la période s'y ajoute sans le perdre", () => {
    expect(tabHref("ph_1", "performance")).toBe("/admin/pharmacies/ph_1?onglet=performance");
    expect(tabHref("ph_1", "performance", { periode: "jour" })).toBe("/admin/pharmacies/ph_1?onglet=performance&periode=jour");
  });
});
