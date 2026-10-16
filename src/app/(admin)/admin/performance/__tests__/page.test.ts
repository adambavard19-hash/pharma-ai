import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClosedSale } from "@/core/counter/sales-report";

/**
 * La page « Performance » de la console (16 oct. 2026) : la période, les quatre chiffres de toutes les pharmacies réunies,
 * une ligne par pharmacie (la plus rentable d'abord), chaque ligne menant au rapport de la pharmacie sur la même période.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  isDemoMode: vi.fn(() => false),
  requirePlatformSession: vi.fn(async () => ({ admin: { id: "adm" } })),
  salesBy: {} as Record<string, unknown[]>,
}));

const sale = (overrides: Partial<ClosedSale>): ClosedSale => ({
  id: "rx",
  closedAt: new Date(),
  who: "Comptoir",
  boxes: [],
  proposed: 2,
  sold: 1,
  notSold: 1,
  unanswered: 0,
  soldItems: [{ name: "Produit", priceCents: 1000, marginCents: null }],
  emailSent: false,
  ...overrides,
});

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/config/env", () => ({ isDemoMode: mocks.isDemoMode }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/db/client", () => ({ prisma: { pharmacy: { findMany: mocks.findMany } } }));
vi.mock("@/server/services/counter-history", async () => {
  const { buildSalesReport } = await import("@/core/counter/sales-report");
  return {
    loadSalesReport: async ({ pharmacyId, range, now }: { pharmacyId: string; range: never; now: Date }) =>
      buildSalesReport({ range, sales: (mocks.salesBy[pharmacyId] ?? []) as ClosedSale[], now, timeZone: "Europe/Paris" }),
  };
});

const { default: PerformancePage } = await import("../page");

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/[\s  ]+/g, " ");
const render = async (params: Record<string, string> = {}) => renderToStaticMarkup((await PerformancePage({ searchParams: Promise.resolve(params) })) as React.ReactElement);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([
    { id: "ph_a", name: "Pharmacie A", city: "Nice" },
    { id: "ph_b", name: "Pharmacie B", city: null },
  ]);
  mocks.salesBy = {
    ph_a: [],
    ph_b: [sale({ id: "s1" }), sale({ id: "s2", proposed: 3, sold: 2, notSold: 1, soldItems: [{ name: "X", priceCents: 500, marginCents: null }, { name: "Y", priceCents: 700, marginCents: null }] })],
  };
});

describe("la page Performance de la console", () => {
  it("les totaux de toutes les pharmacies : proposés, vendus, taux, chiffre d'affaires", async () => {
    const page = text(await render({ periode: "jour" }));
    expect(page).toMatch(/Conseils proposés 5/);
    expect(page).toMatch(/Conseils vendus 3/);
    expect(page).toMatch(/Taux de vente 60 %/);
    expect(page).toMatch(/Chiffre d'affaires ajouté 22,00 €/);
  });

  it("une ligne par pharmacie, la plus rentable d'abord, qui mène à son rapport sur la même période", async () => {
    const html = await render({ periode: "2026-10" });
    expect(html.indexOf("Pharmacie B")).toBeLessThan(html.indexOf("Pharmacie A"));
    expect(html).toContain("/admin/pharmacies/ph_b?onglet=performance&amp;periode=2026-10");
  });

  it("les pharmacies de démonstration ne sont pas lues hors environnement démo", async () => {
    await render();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, isDemo: false } }));
  });

  it("réservée à la console", async () => {
    await render();
    expect(mocks.requirePlatformSession).toHaveBeenCalled();
  });
});
