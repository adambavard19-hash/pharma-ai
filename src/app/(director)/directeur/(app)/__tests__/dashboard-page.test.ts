import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Le tableau de bord du directeur, rendu côté serveur sans navigateur ni base :
 * ce qu'il lit à l'écran, ses liens, ses états vides, et ce qu'il n'affiche jamais.
 */

const mocks = vi.hoisted(() => ({ requireDirectorSession: vi.fn(), getDirectorDashboard: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales/director-dashboard", () => ({ getDirectorDashboard: mocks.getDirectorDashboard }));

const page = await import("../page");
const { resolveDirectorPeriod } = await import("@/core/sales/director/dashboard");

const NOW = new Date("2026-10-06T10:00:00Z");
const SESSION = { director: { id: "dir_1", email: "camille@exemple.test", firstName: "Camille", lastName: "Roux", fullName: "Camille Roux", initials: "CR" }, sessionId: "s_1" };

const board = (overrides: Record<string, unknown> = {}) => ({
  period: resolveDirectorPeriod("mois", NOW),
  summary: "Ce mois-ci, votre équipe de 6 commerciaux a ouvert 14 dossiers, réalisé 5 démonstrations et activé 2 officines.",
  team: { activeReps: 6 },
  totals: { opened: 14, demos: 5, contractsSigned: 3, activated: 2, openNow: 31, conversion: { rate: 0.25, signed: 4, opened: 16 } },
  todo: {
    applicationsToReview: 3,
    unassignedProspects: 2,
    commissionsToValidate: { count: 4, amountCents: 120_000 },
    commissionsToPay: { count: 0, amountCents: 0 },
    invoicesToValidate: { count: 1, amountCents: 30_000 },
  },
  challenges: [{ id: "ch_1", title: "Octobre des démos", goal: "5 démonstrations réalisées par commercial", endsAt: new Date("2026-10-31T23:00:00Z"), participants: 6, reached: 2, share: 1 / 3 }],
  ranking: [
    { salesRepId: "rep_a", name: "Alice Martin", rank: 1, activated: 2, contractsSigned: 2, demos: 3, opened: 6 },
    { salesRepId: "rep_b", name: "Bruno Durand", rank: 2, activated: 0, contractsSigned: 1, demos: 2, opened: 8 },
  ],
  quietCount: 4,
  feed: [{ id: "e1", at: new Date(Date.now() - 3_600_000), what: "Contrat signé", who: "L'officine", whoRepId: null, prospectName: "Pharmacie du Centre", city: "Lyon" }, { id: "e2", at: new Date(Date.now() - 7_200_000), what: "Dossier ouvert", who: "Alice Martin", whoRepId: "rep_a", prospectName: "Pharmacie <b>Test</b>", city: null }],
  ...overrides,
});

const render = async (periode?: string) => renderToStaticMarkup((await page.default({ searchParams: Promise.resolve(periode ? { periode } : {}) })) as React.ReactElement);
const plain = (html: string) => html.replace(/[  ]/g, " ");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue(SESSION);
  mocks.getDirectorDashboard.mockResolvedValue(board());
});

describe("la barrière", () => {
  it("sans session, la page s'arrête avant toute lecture", async () => {
    mocks.requireDirectorSession.mockRejectedValue(new Error("NEXT_REDIRECT /directeur/connexion"));
    await expect(render()).rejects.toThrow("NEXT_REDIRECT /directeur/connexion");
    expect(mocks.getDirectorDashboard).not.toHaveBeenCalled();
  });

  it("lit le tableau avec le directeur de la SESSION et la période de l'adresse", async () => {
    await render("annee");
    expect(mocks.getDirectorDashboard).toHaveBeenCalledWith("dir_1", "annee");
    await render("n'importe quoi");
    expect(mocks.getDirectorDashboard).toHaveBeenLastCalledWith("dir_1", "mois");
    await render();
    expect(mocks.getDirectorDashboard).toHaveBeenLastCalledWith("dir_1", "mois");
  });
});

describe("le haut de page", () => {
  it("salue le directeur, donne la phrase de synthèse et le choix de période", async () => {
    const html = plain(await render());
    expect(html).toContain("Tableau de bord");
    expect(html).toContain("Bonjour Camille");
    expect(html).toContain("Ce mois-ci, votre équipe de 6 commerciaux a ouvert 14 dossiers, réalisé 5 démonstrations et activé 2 officines.");
    expect(html).toContain(">Ce mois<");
    expect(html).toContain(">30 jours<");
    expect(html).toContain(">Cette année<");
  });

  it("la période choisie est marquée, les autres sont des liens ordinaires", async () => {
    mocks.getDirectorDashboard.mockResolvedValue(board({ period: resolveDirectorPeriod("annee", NOW) }));
    const html = await render("annee");
    expect(html).toMatch(/<a aria-current="true"[^>]*href="\/directeur\?periode=annee"/);
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
    expect(html).toContain('href="/directeur"');
    expect(html).toContain('href="/directeur?periode=30-jours"');
    expect(html).not.toMatch(/href="\/directeur\?periode=mois"/);
  });
});

describe("les chiffres", () => {
  it("six cartes, chacune un lien vers la page qui la détaille", async () => {
    const html = plain(await render());
    for (const label of ["Commerciaux actifs", "Dossiers créés", "Démonstrations réalisées", "Contrats signés", "Officines activées", "Taux de transformation"]) expect(html).toContain(label);
    expect(html).toContain("31 en cours en ce moment");
    expect(html).toContain("25 %");
    expect(html).toContain("4 dossiers signés sur 16 ouverts");
    expect(html).toContain('aria-label="Les chiffres de la période"');
    expect((html.match(/href="\/directeur\/commerciaux"/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("aucun dossier ouvert : un tiret et une explication, jamais un 0 %", async () => {
    mocks.getDirectorDashboard.mockResolvedValue(board({ totals: { opened: 0, demos: 0, contractsSigned: 0, activated: 0, openNow: 0, conversion: { rate: null, signed: 0, opened: 0 } } }));
    const html = plain(await render());
    expect(html).toContain("Aucun dossier ouvert sur la période");
    expect(html).not.toContain("0 %");
  });
});

describe("à traiter", () => {
  it("liste les cinq rubriques avec leur compte et leur montant, et renvoie vers la bonne page", async () => {
    const html = plain(await render());
    expect(html).toContain("À traiter");
    expect(html).toContain("Candidatures à examiner");
    expect(html).toContain('href="/directeur/candidatures?statut=nouvelle"');
    expect(html).toContain("Dossiers sans commercial");
    expect(html).toContain("Commissions à valider");
    expect(html).toContain("1 200,00 €");
    expect(html).toContain('href="/directeur/commissions?statut=EARNED"');
    expect(html).toContain('href="/directeur/commissions?statut=PAYABLE"');
    expect(html).toContain("Factures à valider");
    expect(html).toContain("300,00 €");
    expect(html).toContain('href="/directeur/factures?statut=RECEIVED"');
    expect(html).toContain("Ce qui attend votre décision.");
  });

  it("ce qui est à zéro reste visible, marqué « rien à traiter », sans montant", async () => {
    const html = plain(await render());
    expect(html).toContain("Commissions à payer");
    expect(html).toContain('aria-label="Rien à traiter"');
    expect(html).not.toMatch(/(^|[^\d,.\s])\s?0,00 €|>0,00 €/);
  });

  it("tout à zéro : on le dit", async () => {
    mocks.getDirectorDashboard.mockResolvedValue(board({ todo: { applicationsToReview: 0, unassignedProspects: 0, commissionsToValidate: { count: 0, amountCents: 0 }, commissionsToPay: { count: 0, amountCents: 0 }, invoicesToValidate: { count: 0, amountCents: 0 } } }));
    expect(await render()).toContain("Rien n&#x27;attend votre décision.");
  });
});

describe("les challenges", () => {
  it("le nom, l'objectif, la fin, la barre et la phrase d'avancement ; un lien vers le challenge", async () => {
    const html = plain(await render());
    expect(html).toContain("Octobre des démos");
    expect(html).toContain('href="/directeur/challenges/ch_1"');
    expect(html).toContain("5 démonstrations réalisées par commercial");
    expect(html).toContain("jusqu&#x27;au 31/10/2026");
    expect(html).toContain("2 commerciaux sur 6 ont atteint l&#x27;objectif.");
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="33"/);
  });

  it("aucun challenge : état vide honnête avec le chemin pour en créer un", async () => {
    mocks.getDirectorDashboard.mockResolvedValue(board({ challenges: [] }));
    const html = await render();
    expect(html).toContain("Aucun challenge en cours");
    expect(html).toContain('href="/directeur/challenges/nouveau"');
  });
});

describe("le classement", () => {
  it("des chiffres par commercial, un lien vers sa fiche, les commerciaux silencieux comptés à part", async () => {
    const html = plain(await render());
    expect(html).toContain("Alice Martin");
    expect(html).toContain('href="/directeur/commerciaux/rep_a"');
    expect(html).toContain('aria-label="Rang 1"');
    for (const label of ["Activées", "Signés", "Démos", "Dossiers"]) expect(html).toContain(label);
    expect(html).toContain("4 commerciaux actifs n&#x27;ont encore rien enregistré sur cette période.");
  });

  it("aucune note, aucune étoile, aucun jugement : seulement des chiffres", async () => {
    const html = await render();
    expect(html).not.toMatch(/performance|note de|score|mauvais|bon commercial|alerte/i);
  });

  it("équipe sans activité : on le dit, et le classement ne montre aucun rang", async () => {
    mocks.getDirectorDashboard.mockResolvedValue(board({ ranking: [], quietCount: 6 }));
    const html = await render();
    expect(html).toContain("Aucune activité sur cette période");
    expect(html).not.toContain("Rang 1");
  });

  it("aucun commercial : invite à en ajouter un, dans la phrase du haut et dans le classement", async () => {
    mocks.getDirectorDashboard.mockResolvedValue(board({ summary: "Votre équipe n'a pas encore de commercial actif. Ajoutez le premier pour commencer.", team: { activeReps: 0 }, ranking: [], quietCount: 0 }));
    const html = await render();
    expect(html).toContain("Aucun commercial actif");
    expect((html.match(/href="\/directeur\/commerciaux\/nouveau"/g) ?? []).length).toBe(2);
  });
});

describe("l'activité récente", () => {
  it("quoi, sur quelle officine, qui, quand ; la fiche du commercial quand c'est lui", async () => {
    const html = plain(await render());
    expect(html).toContain("Contrat signé");
    expect(html).toContain("Pharmacie du Centre · Lyon");
    expect(html).toContain("L&#x27;officine");
    expect(html).toContain('href="/directeur/commerciaux/rep_a"');
    expect(html).toContain("<time");
    expect(html).toMatch(/il y a 1 heure|il y a 2 heures/);
  });

  it("échappe le nom d'une officine", async () => {
    const html = await render();
    expect(html).not.toContain("<b>Test</b>");
    expect(html).toContain("Pharmacie &lt;b&gt;Test&lt;/b&gt;");
  });

  it("aucun événement : état vide", async () => {
    mocks.getDirectorDashboard.mockResolvedValue(board({ feed: [] }));
    expect(await render()).toContain("Aucune activité récente");
  });
});

describe("le périmètre", () => {
  it("ne renvoie que dans l'espace du directeur : jamais la console, l'extranet ni une officine", async () => {
    const html = await render();
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of hrefs) expect(href.startsWith("/directeur"), href).toBe(true);
  });
});
