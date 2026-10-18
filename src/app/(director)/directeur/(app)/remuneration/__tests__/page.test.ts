import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * « Rémunération » du directeur : les tarifs de la source des prix, ce que touchent ses affiliés, sa prime de 50 € par
 * pharmacie signée, le simulateur, et ses seules primes (d'après sa session).
 */

const mocks = vi.hoisted(() => ({ requireDirectorSession: vi.fn(), listDirectorBonuses: vi.fn(), loadPublicPricing: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales/director-bonuses", () => ({ listDirectorBonuses: mocks.listDirectorBonuses }));
vi.mock("@/server/services/public-pricing", () => ({ loadPublicPricing: mocks.loadPublicPricing }));

const page = await import("../page");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/[  ]/g, " ").replace(/\s+/g, " ");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue({ director: { id: "dir_1", firstName: "Diane" } });
  mocks.listDirectorBonuses.mockResolvedValue({ rows: [], earnedCents: 10_000, payableCents: 5_000, paidCents: 0 });
  mocks.loadPublicPricing.mockResolvedValue({ name: "PharmaBoost Officine", source: "PLAN", monthlyPriceCents: 12_600, setupFeeCents: 15_000, commitmentMonths: 12, referralDiscountPercent: 20, planId: "plan_1" });
});

describe("la rémunération du directeur", () => {
  it("tarifs, affiliés, prime, simulateur ; ses seules primes", async () => {
    const content = text(renderToStaticMarkup(await page.default()));
    expect(mocks.listDirectorBonuses).toHaveBeenCalledWith({ salesDirectorId: "dir_1" });
    expect(content).toMatch(/Abonnement 126 € HT par mois/);
    expect(content).toMatch(/Mise en service 150 € HT/);
    expect(content).toMatch(/Vos affiliés 10 % · 12,60 €/);
    expect(content).toMatch(/Votre prime 50 € HT par pharmacie signée par l'équipe/);
    expect(content).toContain("Pharmacies signées par votre équipe");
    // 10 pharmacies au départ : 500 € de primes, et l'équipe touche 126 € par mois.
    expect(content).toMatch(/Vos primes 500 €/);
    expect(content).toMatch(/Votre équipe touche, elle, 126 € par mois/);
    expect(content).toMatch(/Primes acquises 100 €/);
  });

  it("sans session de directeur : rien n'est lu", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    mocks.requireDirectorSession.mockRejectedValue(redirected);
    await expect(page.default()).rejects.toBe(redirected);
    expect(mocks.listDirectorBonuses).not.toHaveBeenCalled();
  });
});
