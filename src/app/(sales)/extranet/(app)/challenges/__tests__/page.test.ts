import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * « Mes challenges » côté commercial, rendu côté serveur sans navigateur ni base :
 * son avancement, son rang, le classement par prénom + initiale du nom, et rien
 * d'autre sur les autres commerciaux.
 */

const mocks = vi.hoisted(() => ({ requireSalesSession: vi.fn(), challengesOfRep: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/sales-session", () => ({ requireSalesSession: mocks.requireSalesSession }));
vi.mock("@/server/services/sales/challenges", () => ({ challengesOfRep: mocks.challengesOfRep }));

const page = await import("../page");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

const NOW = new Date("2026-10-15T10:00:00.000Z");
const OCT_START = new Date("2026-09-30T22:00:00.000Z");
const OCT_END = new Date("2026-10-31T23:00:00.000Z");

const challenge = (extra: Record<string, unknown> = {}) => ({ id: "ch_1", title: "Octobre des démos", description: "Montrons PharmaBoost.", metric: "DEMOS_DONE", target: 5, startsAt: OCT_START, endsAt: OCT_END, rewardLabel: "Prime de 200 €", rewardCents: 20000, ...extra });
const row = (extra: Record<string, unknown> = {}) => ({
  challenge: challenge(),
  state: "RUNNING",
  stoppedEarly: false,
  mine: { value: 3, target: 5, percent: 60, reached: false, rank: 2 },
  participants: 6,
  ranking: [
    { rank: 1, name: "Alice M.", value: 5, isMe: false },
    { rank: 2, name: "Bob D.", value: 3, isMe: true },
    { rank: 2, name: "Chloé P.", value: 3, isMe: false },
  ],
  ...extra,
});
const render = async () => renderToStaticMarkup((await page.default()) as never);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.requireSalesSession.mockResolvedValue({ rep: { id: "rep_bob", firstName: "Bob" }, sessionId: "s_1" });
});
afterEach(() => vi.useRealTimers());

describe("Mes challenges", () => {
  it("exige la session d'un commercial avant de lire quoi que ce soit, et ne lit que SES challenges", async () => {
    mocks.requireSalesSession.mockRejectedValue(new Error("NEXT_REDIRECT /extranet/connexion"));
    await expect(page.default()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.challengesOfRep).not.toHaveBeenCalled();
    mocks.requireSalesSession.mockResolvedValue({ rep: { id: "rep_bob" }, sessionId: "s_1" });
    mocks.challengesOfRep.mockResolvedValue({ running: [], upcoming: [], ended: [] });
    await render();
    expect(mocks.challengesOfRep).toHaveBeenCalledWith("rep_bob", NOW);
  });

  it("sans challenge : un état vide honnête", async () => {
    mocks.challengesOfRep.mockResolvedValue({ running: [], upcoming: [], ended: [] });
    const html = text(await render());
    expect(html).toContain("Mes challenges");
    expect(html).toContain("Aucun challenge pour l'instant.");
  });

  it("en cours : l'objectif, la période, la récompense, son avancement chiffré et son rang", async () => {
    mocks.challengesOfRep.mockResolvedValue({ running: [row()], upcoming: [], ended: [] });
    const html = text(await render());
    expect(html).toContain("Octobre des démos");
    expect(html).toContain("Objectif : 5 démonstrations réalisées, du 1er au 31 octobre 2026.");
    expect(html).toContain("Plus que 16 jours");
    expect(html).toContain("Prime de 200 €");
    expect(html).toContain("Montrons PharmaBoost.");
    expect(html).toContain("3 / 5");
    expect(html).toContain("Il vous manque 2 démonstrations réalisées.");
    expect(html).toContain("Vous êtes 2e sur 6.");
  });

  it("le classement ne donne que le rang, prénom + initiale du nom et le résultat ; « vous » est repéré", async () => {
    mocks.challengesOfRep.mockResolvedValue({ running: [row()], upcoming: [], ended: [] });
    const html = text(await render());
    expect(html).toMatch(/1er Alice M\. 5/);
    expect(html).toMatch(/2e Bob D\. \(vous\) 3/);
    expect(html).toMatch(/2e Chloé P\. 3/);
  });

  it("ne montre jamais plus que ce que le service rend : ni identifiant, ni nom complet, ni e-mail d'un autre commercial", async () => {
    const leaky = row({ ranking: [{ rank: 1, name: "Alice M.", value: 5, isMe: false, salesRepId: "rep_alice", fullName: "Alice Martin", email: "alice@exemple.fr" }] });
    mocks.challengesOfRep.mockResolvedValue({ running: [leaky], upcoming: [], ended: [] });
    const html = await render();
    for (const secret of ["rep_alice", "Alice Martin", "alice@exemple.fr"]) expect(html).not.toContain(secret);
  });

  it("objectif atteint : le dit ; pas encore classé : le dit aussi", async () => {
    mocks.challengesOfRep.mockResolvedValue({ running: [row({ mine: { value: 6, target: 5, percent: 120, reached: true, rank: 1 } })], upcoming: [], ended: [] });
    expect(text(await render())).toContain("Objectif atteint.");
    mocks.challengesOfRep.mockResolvedValue({ running: [row({ mine: { value: 0, target: 5, percent: 0, reached: false, rank: null }, ranking: [] })], upcoming: [], ended: [] });
    const html = text(await render());
    expect(html).toContain("Pas encore classé");
    expect(html).toContain("Le classement apparaît dès le premier résultat de l'équipe.");
    expect(html).toContain("Il vous manque 5 démonstrations réalisées.");
  });

  it("un long classement garde les dix premiers et la ligne de l'utilisateur", async () => {
    const ranking = Array.from({ length: 14 }, (_, i) => ({ rank: i + 1, name: `Commercial ${String.fromCharCode(65 + i)}.`, value: 20 - i, isMe: i === 12 }));
    mocks.challengesOfRep.mockResolvedValue({ running: [row({ ranking, mine: { value: 8, target: 5, percent: 160, reached: true, rank: 13 } })], upcoming: [], ended: [] });
    const html = text(await render());
    expect(html).toContain("Commercial J.");
    expect(html).not.toContain("Commercial K.");
    expect(html).toMatch(/13e Commercial M\. \(vous\)/);
  });

  it("à venir et terminés : listés, avec le résultat de l'utilisateur", async () => {
    const upcoming = row({ challenge: challenge({ id: "ch_2", title: "Décembre des contrats", metric: "CONTRACTS_SIGNED", target: 2, startsAt: new Date("2026-11-30T23:00:00Z"), endsAt: new Date("2026-12-31T23:00:00Z") }), state: "UPCOMING", mine: null, ranking: [] });
    const ended = row({ challenge: challenge({ id: "ch_3", title: "Septembre des dossiers", metric: "PROSPECTS_CREATED", startsAt: new Date("2026-08-31T22:00:00Z"), endsAt: new Date("2026-09-30T22:00:00Z") }), state: "ENDED", mine: { value: 7, target: 5, percent: 140, reached: true, rank: 1 } });
    const missed = row({ challenge: challenge({ id: "ch_4", title: "Août des activations", metric: "ACTIVATIONS", target: 3 }), state: "ENDED", mine: { value: 1, target: 3, percent: 33, reached: false, rank: null } });
    mocks.challengesOfRep.mockResolvedValue({ running: [], upcoming: [upcoming], ended: [ended, missed] });
    const html = text(await render());
    expect(html).toContain("À venir");
    expect(html).toContain("Décembre des contrats");
    expect(html).toContain("Commence dans 47 jours");
    expect(html).toContain("Terminés");
    expect(html).toContain("Septembre des dossiers");
    expect(html).toMatch(/Objectif atteint/);
    expect(html).toContain("vous : 7 / 5, 1er sur 6");
    expect(html).toContain("Objectif non atteint");
    expect(html).toContain("vous : 1 / 3");
    expect(html).not.toContain("Aucun challenge pour l'instant");
  });
});
