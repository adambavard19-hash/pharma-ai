import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les écrans « Challenges » du directeur, rendus côté serveur sans navigateur ni
 * base (aucune session de directeur n'existe en local pour les voir en direct) :
 * la liste, la création et la fiche, services simulés. On lit le texte rendu.
 */

const mocks = vi.hoisted(() => ({
  requireDirectorSession: vi.fn(),
  listChallenges: vi.fn(),
  getChallengeDetail: vi.fn(),
  countActiveReps: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
// La fenêtre de confirmation s'ouvre à la demande : seul son bouton d'ouverture compte ici.
vi.mock("@/components/ui/modal", () => ({ Modal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? createElement("div", null, children) : null) }));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales/challenges", () => ({ listChallenges: mocks.listChallenges, getChallengeDetail: mocks.getChallengeDetail, countActiveReps: mocks.countActiveReps }));
vi.mock("@/server/actions/director-challenges", () => ({ createChallengeAction: vi.fn(), updateChallengeAction: vi.fn(), endChallengeAction: vi.fn(), deleteChallengeAction: vi.fn() }));

const list = await import("../page");
const detail = await import("../[id]/page");
const create = await import("../nouveau/page");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

const OCT_START = new Date("2026-09-30T22:00:00.000Z");
const OCT_END = new Date("2026-10-31T23:00:00.000Z");
const NOW = new Date("2026-10-15T10:00:00.000Z");

const challenge = (extra: Record<string, unknown> = {}) => ({
  id: "ch_1",
  title: "Octobre des démos",
  description: "Montrons PharmaBoost à toutes les officines.",
  metric: "DEMOS_DONE",
  target: 5,
  startsAt: OCT_START,
  endsAt: OCT_END,
  rewardLabel: "Prime de 200 €",
  rewardCents: 20000,
  isActive: true,
  createdByType: "DIRECTOR",
  createdById: "dir_1",
  createdByLabel: "Dora Directrice",
  createdAt: new Date("2026-09-20T09:00:00Z"),
  updatedAt: new Date("2026-09-20T09:00:00Z"),
  ...extra,
});
const totals = (extra: Record<string, unknown> = {}) => ({ participants: 6, reached: 3, reachedShare: 0.5, totalValue: 17, totalTarget: 30, ...extra });
const item = (extra: Record<string, unknown> = {}, state = "RUNNING") => ({ challenge: challenge(extra), state, stoppedEarly: false, totals: state === "UPCOMING" ? null : totals() });
const rep = (id: string, name: string, value: number, rank: number | null) => ({ salesRepId: id, name, shortName: name, value, target: 5, percent: Math.floor((value * 100) / 5), reached: value >= 5, rank });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.requireDirectorSession.mockResolvedValue({ director: { id: "dir_1" }, sessionId: "s_1" });
});
afterEach(() => vi.useRealTimers());

describe("la liste des challenges", () => {
  const render = async () => text(renderToStaticMarkup((await list.default()) as never));

  it("exige la session du directeur avant de lire quoi que ce soit", async () => {
    mocks.requireDirectorSession.mockRejectedValue(new Error("NEXT_REDIRECT /directeur/connexion"));
    await expect(list.default()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.listChallenges).not.toHaveBeenCalled();
  });

  it("sans aucun challenge : un état vide honnête qui propose d'en lancer un", async () => {
    mocks.listChallenges.mockResolvedValue({ running: [], upcoming: [], ended: [], total: 0 });
    const page = await render();
    expect(page).toContain("Aucun challenge pour l'instant");
    expect(page).toContain("Lancer le premier challenge");
    expect(page).not.toContain("En cours");
  });

  it("montre chaque challenge : objectif, période, récompense, part de l'équipe qui l'a atteint", async () => {
    mocks.listChallenges.mockResolvedValue({
      running: [item()],
      upcoming: [item({ id: "ch_2", title: "Décembre des contrats", metric: "CONTRACTS_SIGNED", target: 2, startsAt: new Date("2026-11-30T23:00:00Z"), endsAt: new Date("2026-12-31T23:00:00Z"), rewardLabel: null, rewardCents: null }, "UPCOMING")],
      ended: [{ ...item({ id: "ch_3", title: "Septembre des dossiers", metric: "PROSPECTS_CREATED", startsAt: new Date("2026-08-31T22:00:00Z"), endsAt: new Date("2026-09-30T22:00:00Z") }, "ENDED"), stoppedEarly: true }],
      total: 3,
    });
    const page = await render();
    expect(page).toContain("Octobre des démos");
    expect(page).toContain("5 démonstrations réalisées par commercial, du 1er au 31 octobre 2026.");
    expect(page).toContain("Prime de 200 €");
    expect(page).toContain("3 commerciaux sur 6 ont atteint l'objectif.");
    expect(page).toContain("Plus que 16 jours");
    expect(page).toContain("Décembre des contrats");
    expect(page).toContain("2 contrats signés par commercial");
    expect(page).toContain("Commence dans 47 jours");
    expect(page).toContain("Septembre des dossiers");
    expect(page).toContain("Arrêté");
    for (const section of ["En cours", "À venir", "Terminés"]) expect(page).toContain(section);
    const html = renderToStaticMarkup((await list.default()) as never);
    expect(html).toContain('href="/directeur/challenges/ch_1"');
    expect(html).toContain('href="/directeur/challenges/nouveau"');
  });

  it("aucun challenge en cours mais un terminé : le dit, sans masquer le reste", async () => {
    mocks.listChallenges.mockResolvedValue({ running: [], upcoming: [], ended: [item({}, "ENDED")], total: 1 });
    const page = await render();
    expect(page).toContain("Aucun challenge en cours.");
    expect(page).toContain("Terminés");
    expect(page).not.toContain("À venir");
  });
});

describe("le nouveau challenge", () => {
  it("propose aujourd'hui jusqu'à la fin du mois et dit combien de commerciaux seront prévenus", async () => {
    mocks.countActiveReps.mockResolvedValue(6);
    const html = renderToStaticMarkup((await create.default()) as never);
    expect(html).toContain('value="2026-10-15"');
    expect(html).toContain('value="2026-10-31"');
    const page = text(html);
    expect(page).toContain("Lancer le challenge");
    expect(page).toContain("Les 6 commerciaux actifs participent et reçoivent une notification.");
    expect(page).toContain("Leur avancement se calcule tout seul, à partir de leurs dossiers.");
  });

  it("sans commercial actif : le dit honnêtement", async () => {
    mocks.countActiveReps.mockResolvedValue(0);
    const page = text(renderToStaticMarkup((await create.default()) as never));
    expect(page).toContain("Aucun commercial actif pour l'instant : personne ne sera prévenu.");
  });
});

describe("la fiche d'un challenge", () => {
  const view = (state: string, extra: Record<string, unknown> = {}, reps = [rep("r1", "Alice Martin", 5, 1), rep("r2", "Bob Durand", 3, 2), rep("r3", "Chloé Petit", 3, 2), rep("r4", "Dan Roux", 0, null)]) => ({
    challenge: challenge(extra),
    state,
    stoppedEarly: false,
    progress: { challengeId: "ch_1", reps, ranking: reps.filter((r) => r.rank !== null), totals: totals({ participants: reps.length, reached: reps.filter((r) => r.reached).length, totalValue: reps.reduce((sum, r) => sum + r.value, 0), totalTarget: 5 * reps.length }) },
  });
  const render = async (id = "ch_1") => renderToStaticMarkup((await detail.default({ params: Promise.resolve({ id }) })) as never);

  it("exige la session, et un challenge inconnu est une page introuvable", async () => {
    mocks.requireDirectorSession.mockRejectedValue(new Error("NEXT_REDIRECT /directeur/connexion"));
    await expect(render()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getChallengeDetail).not.toHaveBeenCalled();
    mocks.requireDirectorSession.mockResolvedValue({ director: { id: "dir_1" } });
    mocks.getChallengeDetail.mockResolvedValue(null);
    await expect(render("absent")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("en cours : le défi, l'avancement classé, chaque commercial lié à sa fiche, Terminer et Supprimer", async () => {
    mocks.getChallengeDetail.mockResolvedValue(view("RUNNING"));
    const html = await render();
    const page = text(html);
    expect(page).toContain("Octobre des démos");
    expect(page).toContain("Montrons PharmaBoost à toutes les officines.");
    expect(page).toContain("Démonstrations réalisées");
    expect(page).toContain("5 démonstrations réalisées");
    expect(page).toContain("du 1er au 31 octobre 2026");
    expect(page).toContain("Montant : 200,00 €");
    expect(page).toContain("Dora Directrice, le 20 septembre 2026");
    expect(page).toContain("1 commercial sur 4 a atteint l'objectif.");
    expect(page).toContain("À eux tous : 11 sur 20 visés.");
    // Classement : 1er, 2e, 2e (ex æquo), et « — » pour qui n'a rien réalisé.
    expect(page).toMatch(/1er Alice Martin Objectif atteint 5 \/ 5/);
    expect(page).toMatch(/2e Bob Durand 3 \/ 5/);
    expect(page).toMatch(/2e Chloé Petit 3 \/ 5/);
    expect(page).toMatch(/— Dan Roux 0 \/ 5/);
    expect(html).toContain('href="/directeur/commerciaux/r1"');
    expect(page).toContain("Terminer maintenant");
    expect(page).toContain("Supprimer");
    expect(page).toContain("Le challenge a commencé : ce qu'il compte et son premier jour ne se modifient plus.");
    // Le formulaire : ce qui ne bouge plus est grisé.
    expect(html).toMatch(/<select[^>]*id="challenge-metric"[^>]*disabled/);
    expect(html).toMatch(/<input[^>]*id="challenge-starts"[^>]*disabled/);
    expect(html).not.toMatch(/<input[^>]*id="challenge-ends"[^>]*disabled/);
  });

  it("terminé : plus de bouton « Terminer », et seuls les textes se modifient", async () => {
    mocks.getChallengeDetail.mockResolvedValue(view("ENDED"));
    const html = await render();
    const page = text(html);
    expect(page).not.toContain("Terminer maintenant");
    expect(page).toContain("Le challenge est terminé : seuls le titre");
    expect(html).toMatch(/<input[^>]*id="challenge-target"[^>]*disabled/);
    expect(html).not.toMatch(/<input[^>]*id="challenge-title"[^>]*disabled/);
    expect(page).toContain("Supprimer");
  });

  it("à venir : tout se modifie, les chiffres attendent le premier jour", async () => {
    mocks.getChallengeDetail.mockResolvedValue(view("UPCOMING", { startsAt: new Date("2026-10-31T23:00:00Z"), endsAt: new Date("2026-11-30T23:00:00Z") }));
    const html = await render();
    const page = text(html);
    expect(page).toContain("Le challenge n'a pas commencé : les chiffres apparaîtront dès le premier jour.");
    expect(page).not.toContain("ont atteint l'objectif");
    expect(page).not.toContain("Terminer maintenant");
    expect(html).not.toMatch(/<select[^>]*id="challenge-metric"[^>]*disabled/);
  });

  it("sans commercial actif : un état vide qui renvoie vers les commerciaux", async () => {
    mocks.getChallengeDetail.mockResolvedValue(view("RUNNING", {}, []));
    const html = await render();
    expect(text(html)).toContain("Aucun commercial actif");
    expect(html).toContain('href="/directeur/commerciaux"');
  });

  it("sans récompense ni mot pour l'équipe : « Aucune », rien d'inventé", async () => {
    mocks.getChallengeDetail.mockResolvedValue(view("RUNNING", { description: null, rewardLabel: null, rewardCents: null }));
    const page = text(await render());
    expect(page).toContain("Récompense Aucune");
    expect(page).not.toContain("Montant :");
  });
});
