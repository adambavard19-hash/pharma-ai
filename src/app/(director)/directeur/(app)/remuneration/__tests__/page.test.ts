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
    expect(content).toMatch(/Vos affiliés, chaque mois 10 % à 20 % de l'abonnement, selon leurs pharmacies abonnées \(10 % de 1 à 9 pharmacies, 12 % de 10 à 24, 15 % de 25 à 49, 20 % à partir de 50\), \+ 100 € de prime/);
    expect(content).toMatch(/Votre prime 50 € HT par pharmacie signée par l'équipe/);
    expect(content).toContain("Pharmacies signées par votre équipe");
    // 10 pharmacies au départ : 500 € de primes, et l'équipe touche 10 × 126 € × 12 % (palier 10–24) = 151,20 € par mois.
    expect(content).toMatch(/Vos primes 500 €/);
    expect(content).toMatch(/Ce que touche l'équipe chaque mois : 151,20 € \(10 × 126 € HT × 12 %, taux du palier\)/);
    expect(content).toMatch(/12 % 10–24/);
    expect(content).toMatch(/Primes acquises 100 €/);
  });

  it("sans session de directeur : rien n'est lu", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    mocks.requireDirectorSession.mockRejectedValue(redirected);
    await expect(page.default()).rejects.toBe(redirected);
    expect(mocks.listDirectorBonuses).not.toHaveBeenCalled();
  });
});
