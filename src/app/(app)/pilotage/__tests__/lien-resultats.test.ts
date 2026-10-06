import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Pilotage ne change pas : il garde ses chiffres par collaborateur et ajoute UNE ligne,
 * discrète, qui mène à « Ce que ça rapporte ». Les services sont remplacés.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getCounterPerformance: vi.fn(),
  getEngineOutcomeSummary: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/analytics", () => ({
  getCounterPerformance: mocks.getCounterPerformance,
  getEngineOutcomeSummary: mocks.getEngineOutcomeSummary,
}));
vi.mock("../period-picker", () => ({ PeriodPicker: () => createElement("div", { "data-testid": "period-picker" }) }));
vi.mock("../../parametres/laboratoires/challenges/challenges-pilotage", () => ({
  ChallengesPilotageSection: () => createElement("div", { "data-testid": "challenges" }),
}));

const { default: PilotagePage } = await import("../page");
const { PERMISSIONS } = await import("@/server/rbac/permissions");

const render = async () => renderToStaticMarkup(await PilotagePage({ searchParams: Promise.resolve({}) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({
    permissions: new Set([PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE]),
    scope: { pharmacyId: "ph_a", organizationId: "org_1", userId: "user_a" },
  });
  mocks.getCounterPerformance.mockResolvedValue({
    global: {
      accepted: 0,
      declined: 0,
      decided: 0,
      acceptanceRate: null,
      averageBasketCents: null,
      attributedSalesCount: 0,
      attributedCents: 0,
      attributedMarginCents: 0,
      proposed: 0,
      undecided: 0,
    },
    collaborators: [],
  });
  mocks.getEngineOutcomeSummary.mockResolvedValue({ analyses: 0, withProposals: 0, proposalRate: 0, byOutcome: {} });
});

describe("la ligne de lien vers « Ce que ça rapporte »", () => {
  it("existe une seule fois, vers /resultats", async () => {
    const html = await render();
    expect(html.match(/href="\/resultats[?"]/g)).toHaveLength(1);
    expect(text(html)).toContain("Voir « Ce que ça rapporte »");
  });

  it("ouvre « Ce que ça rapporte » sur le mois, comme Pilotage : jamais 7 jours à côté d'un chiffre du mois", async () => {
    const html = await render();
    // Sans paramètre, /resultats s'ouvre sur les 7 derniers jours : deux montants différents sans que la période soit dite.
    expect(html).toContain('href="/resultats?periode=mois"');
    expect(html).not.toContain('href="/resultats"');
    const href = /href="(\/resultats[^"]*)"/.exec(html)?.[1] ?? "";
    expect(new URL(href, "https://pharmaboost.test").searchParams.get("periode")).toBe("mois");
  });

  it("la période du lien est une période que /resultats comprend (le parseur du cœur la rend telle quelle)", async () => {
    const { parsePeriodParams } = await import("@/core/performance/periods");
    const href = /href="(\/resultats[^"]*)"/.exec(await render())?.[1] ?? "";
    const periode = new URL(href, "https://pharmaboost.test").searchParams.get("periode") ?? undefined;
    const period = parsePeriodParams({ periode }, new Date("2026-10-06T10:00:00Z"), "Europe/Paris");
    expect(period.key).toBe("month");
    expect(period.start).toEqual(new Date("2026-09-30T22:00:00Z"));
  });

  it("explique pourquoi les deux chiffres diffèrent : Pilotage compte aussi les ajouts manuels", async () => {
    const shown = text(await render());
    expect(shown).toContain("« CA additionnel » ci-dessous compte aussi les produits ajoutés à la main");
    expect(shown).toContain("ne compte que les conseils proposés par PharmaBoost");
  });

  it("reste discrète : un paragraphe de texte tertiaire, pas un bouton ni une carte", async () => {
    const html = await render();
    const line = /<p[^>]*>(?:(?!<\/p>).)*href="\/resultats\?periode=mois"(?:(?!<\/p>).)*<\/p>/s.exec(html)?.[0] ?? "";
    expect(line).toContain("text-text-tertiary");
    expect(line).not.toContain("<button");
  });

  it("le reste de Pilotage est intact : mêmes garde-fous et mêmes sections", async () => {
    const html = await render();
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
    expect(mocks.getCounterPerformance).toHaveBeenCalledTimes(1);
    const shown = text(html);
    expect(shown).toContain("Pilotage de l'officine");
    expect(shown).toContain("Par collaborateur");
    expect(html).toContain('data-testid="period-picker"');
    expect(html).toContain('data-testid="challenges"');
  });
});
