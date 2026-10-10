import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildTeamRanking } from "@/core/team/ranking";

/**
 * « Mon équipe » : une page simple — qui a eu quels conseils, combien validés, son rang, et les challenges. Les services sont remplacés.
 */

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), loadTeamRanking: vi.fn(), loadTeamChallenges: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/team-ranking", () => ({ loadTeamRanking: mocks.loadTeamRanking, loadTeamChallenges: mocks.loadTeamChallenges }));

const { default: PilotagePage } = await import("../page");
const { PERMISSIONS } = await import("@/server/rbac/permissions");

const render = async (periode?: string) => renderToStaticMarkup(await PilotagePage({ searchParams: Promise.resolve({ periode }) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const members = [{ id: "lea", name: "Léa Martin" }, { id: "marc", name: "Marc Durand" }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({ permissions: new Set([PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE]), scope: { pharmacyId: "ph_a", organizationId: "org_1", userId: "user_a" } });
  mocks.loadTeamRanking.mockResolvedValue(buildTeamRanking(members, [{ userId: "marc", status: "PURCHASED", count: 5 }, { userId: "marc", status: "DECLINED", count: 1 }, { userId: "lea", status: "ACCEPTED", count: 2 }]));
  mocks.loadTeamChallenges.mockResolvedValue([]);
});

describe("la page « Mon équipe »", () => {
  it("n'est lue que par le titulaire, pour SA pharmacie", async () => {
    await render();
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
    expect(mocks.loadTeamRanking).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph_a" }), expect.objectContaining({ start: expect.any(Date), end: expect.any(Date) }));
  });

  it("montre le classement : rang, nom, proposés, validés, taux — et le total", async () => {
    const page = text(await render());
    expect(page).toContain("Mon équipe");
    expect(page.indexOf("Marc Durand")).toBeLessThan(page.indexOf("Léa Martin"));
    expect(page).toContain("8 conseils proposés · 7 validés");
    expect(page).toContain("proposés");
    expect(page).toContain("validés");
  });

  it("propose les quatre périodes : jour, semaine, mois, année — et lit celle de l'adresse", async () => {
    const html = await render("annee");
    for (const label of ["Aujourd'hui", "Cette semaine", "Ce mois", "Cette année"]) expect(text(html)).toContain(label);
    expect(html).toMatch(/aria-current="page"[^>]*>Cette année|Cette année<\/a>/);
    const range = mocks.loadTeamRanking.mock.calls[0][1] as { start: Date };
    expect(range.start.getMonth()).toBe(0);
    expect(range.start.getDate()).toBe(1);
  });

  it("une période inconnue retombe sur aujourd'hui, sans erreur", async () => {
    await render("n-importe-quoi");
    const range = mocks.loadTeamRanking.mock.calls[0][1] as { start: Date; end: Date };
    expect(range.end.getTime() - range.start.getTime()).toBeLessThanOrEqual(86_400_000);
  });

  it("dit simplement quand rien n'a été proposé, sans taux inventé", async () => {
    mocks.loadTeamRanking.mockResolvedValue(buildTeamRanking(members, []));
    const page = text(await render());
    expect(page).toContain("Aucun conseil proposé sur cette période.");
    expect(page).toContain("—");
  });

  it("une pharmacie neuve sans équipe : un message clair, pas une page cassée", async () => {
    mocks.loadTeamRanking.mockResolvedValue(buildTeamRanking([], []));
    expect(text(await render())).toContain("Pas encore d'équipe");
  });

  it("montre où en est chacun dans un challenge en cours, du plus avancé au moins avancé", async () => {
    mocks.loadTeamChallenges.mockResolvedValue([{ id: "c1", title: "Challenge Avène été", laboratory: "Avène", endsOn: "2026-10-31", daysRemaining: 12, target: 50, units: 30, people: [{ userId: "lea", name: "Léa Martin", units: 18 }, { userId: "marc", name: "Marc Durand", units: 12 }] }]);
    const page = text(await render());
    expect(page).toContain("Challenge Avène été");
    expect(page).toContain("30 sur 50 unités");
    expect(page).toContain("12 jours restants");
    expect(page.lastIndexOf("Léa Martin")).toBeLessThan(page.lastIndexOf("Marc Durand"));
  });

  it("garde un seul lien vers « Ce que PharmaBoost vous rapporte » (/resultats)", async () => {
    const html = await render();
    expect(html.match(/href="\/resultats[?"]/g)).toHaveLength(1);
  });
});
