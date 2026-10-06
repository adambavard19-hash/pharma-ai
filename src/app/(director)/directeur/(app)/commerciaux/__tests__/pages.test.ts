import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les écrans « Commerciaux » du directeur, rendus côté serveur sans navigateur
 * ni base (aucune session directeur n'est disponible pour les voir en direct) :
 * la liste, l'ajout, la fiche et ses quatre onglets, services simulés. On lit
 * le texte rendu, pas le balisage.
 */

const mocks = vi.hoisted(() => ({
  requireDirectorSession: vi.fn(),
  listTeam: vi.fn(),
  listUnassignedProspects: vi.fn(),
  listAssignableReps: vi.fn(),
  getTeamMember: vi.fn(),
  getPortfolio: vi.fn(),
  getActivity: vi.fn(),
  getMoney: vi.fn(),
  challengesOfRep: vi.fn(),
  getStandardCommissionCents: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
// Les fenêtres s'ouvrent à la demande : seul leur bouton d'ouverture compte ici.
vi.mock("@/components/ui/modal", () => ({ Modal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? createElement("div", null, children) : null) }));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales/director-team", () => ({
  listTeam: mocks.listTeam,
  listUnassignedProspects: mocks.listUnassignedProspects,
  listAssignableReps: mocks.listAssignableReps,
  getTeamMember: mocks.getTeamMember,
  getPortfolio: mocks.getPortfolio,
  getActivity: mocks.getActivity,
  getMoney: mocks.getMoney,
}));
vi.mock("@/server/services/sales/challenges", () => ({ challengesOfRep: mocks.challengesOfRep }));
vi.mock("@/server/services/standard-commission", () => ({ getStandardCommissionCents: mocks.getStandardCommissionCents }));
vi.mock("@/server/actions/director-reps", () => ({ createRepAction: vi.fn(), updateRepAction: vi.fn(), setRepActiveAction: vi.fn(), inviteRepAction: vi.fn(), deleteRepAction: vi.fn(), reassignProspectsAction: vi.fn() }));

const list = await import("../page");
const create = await import("../nouveau/page");
const detail = await import("../[id]/page");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));

const renderList = async (query: Record<string, string | string[] | undefined> = {}) => renderToStaticMarkup((await list.default({ searchParams: Promise.resolve(query) })) as never);
const renderCreate = async () => renderToStaticMarkup((await create.default()) as never);
const renderDetail = async (id = "rep_1", query: Record<string, string | string[] | undefined> = {}) => renderToStaticMarkup((await detail.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) })) as never);

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "rep_1",
  firstName: "Marie",
  lastName: "Dupont",
  email: "marie@exemple.fr",
  phone: null,
  zone: "Rhône",
  commissionType: "FIXED",
  commissionValue: 25000,
  isActive: true,
  invitedAt: new Date("2026-10-01T09:00:00Z"),
  lastLoginAt: new Date("2026-10-05T09:00:00Z"),
  openProspects: 4,
  activationsThisMonth: 2,
  ...overrides,
});

const teamOf = (overrides: Record<string, unknown> = {}) => ({
  rows: [row(), row({ id: "rep_2", firstName: "Paul", lastName: "Martin", email: "paul@exemple.fr", invitedAt: null, lastLoginAt: null, openProspects: 0, activationsThisMonth: 0 }), row({ id: "rep_3", firstName: "Lea", lastName: "Roux", email: "lea@exemple.fr", isActive: false, lastLoginAt: null })],
  counts: { all: 3, active: 2, inactive: 1 },
  grandTotal: 3,
  ...overrides,
});

const overviewOf = (overrides: Record<string, unknown> = {}, member: Record<string, unknown> = {}) => ({
  member: { id: "rep_1", firstName: "Marie", lastName: "Dupont", name: "Marie Dupont", email: "marie@exemple.fr", phone: "06 12 34 56 78", zone: "Rhône", commissionType: "FIXED", commissionValue: 25000, isActive: true, invitedAt: new Date("2026-10-01T09:00:00Z"), lastLoginAt: new Date("2026-10-05T09:00:00Z"), createdAt: new Date("2026-09-01T09:00:00Z"), ...member },
  stats: { prospects: 8, openProspects: 5, contractsSent: 3, contractsSigned: 2, activated: 1, lost: 1, conversionRate: 0.25, commissionEarnedCents: 50000, commissionPendingCents: 25000, commissionPaidCents: 75000 },
  footprint: { prospects: 8, commissions: 3, invoices: 1, tasks: 2 },
  deletionRefusal: "Ce commercial a un historique : désactivez-le ou réaffectez ses dossiers. À son nom : 8 dossiers, 3 commissions, 1 facture, 2 tâches.",
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue({ director: { id: "dir_1" } });
  mocks.listUnassignedProspects.mockResolvedValue({ rows: [], total: 0 });
  mocks.listAssignableReps.mockResolvedValue([
    { id: "rep_1", name: "Marie Dupont" },
    { id: "rep_2", name: "Paul Martin" },
  ]);
  mocks.getStandardCommissionCents.mockResolvedValue(25000);
});

describe("la liste de l'équipe", () => {
  it("passe d'abord par la session du directeur : sans elle, rien n'est lu", async () => {
    mocks.requireDirectorSession.mockRejectedValue(new Error("NEXT_REDIRECT /directeur/connexion"));
    await expect(renderList()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.listTeam).not.toHaveBeenCalled();
    expect(mocks.listUnassignedProspects).not.toHaveBeenCalled();
  });

  it("montre chaque commercial : dossiers ouverts, activations du mois, connexion, invitation, et le bouton d'ajout", async () => {
    mocks.listTeam.mockResolvedValue(teamOf());
    const html = await renderList();
    const content = text(html);
    expect(mocks.listTeam).toHaveBeenCalledWith({ q: "", status: null }, expect.any(Date));
    expect(content).toContain("2 commerciaux actifs, 1 désactivé");
    expect(content).toContain("Marie Dupont");
    expect(content).toContain("marie@exemple.fr");
    expect(content).toContain("Rhône");
    expect(content).toContain("250,00 € par contrat");
    expect(content).toContain("Dossiers ouverts");
    expect(content).toContain("Activations du mois");
    expect(content).toContain("Connecté"); // Marie s'est connectée
    expect(content).toContain("Invitation non envoyée"); // Paul n'a jamais été invité
    expect(content).toContain("Jamais"); // Paul ne s'est jamais connecté
    expect(content).toContain("Désactivé"); // Léa
    expect(content).toMatch(/Tous\s*3/);
    expect(content).toMatch(/Actifs\s*2/);
    expect(content).toMatch(/Désactivés\s*1/);
    expect(hrefs(html)).toContain("/directeur/commerciaux/nouveau");
    expect(hrefs(html)).toContain("/directeur/commerciaux/rep_1");
    expect(content).toContain("Ajouter un commercial");
  });

  it("une invitation partie mais pas encore suivie d'une connexion le dit, avec la date", async () => {
    mocks.listTeam.mockResolvedValue(teamOf({ rows: [row({ lastLoginAt: null })] }));
    expect(text(await renderList())).toContain("Invitation envoyée le 01/10/2026");
  });

  it("la recherche et le filtre de l'adresse sont transmis au service et gardés dans les liens", async () => {
    mocks.listTeam.mockResolvedValue(teamOf());
    const html = await renderList({ q: "  dupont lyon ", statut: "actifs" });
    expect(mocks.listTeam).toHaveBeenCalledWith({ q: "dupont lyon", status: "actifs" }, expect.any(Date));
    expect(html).toContain('name="statut" value="actifs"');
    expect(hrefs(html)).toContain("/directeur/commerciaux?q=dupont+lyon&statut=inactifs");
  });

  it("un statut inconnu dans l'adresse ne filtre rien", async () => {
    mocks.listTeam.mockResolvedValue(teamOf());
    await renderList({ statut: "n-importe-quoi" });
    expect(mocks.listTeam).toHaveBeenCalledWith({ q: "", status: null }, expect.any(Date));
  });

  it("état vide honnête : aucun commercial", async () => {
    mocks.listTeam.mockResolvedValue(teamOf({ rows: [], counts: { all: 0, active: 0, inactive: 0 }, grandTotal: 0 }));
    const content = text(await renderList());
    expect(content).toContain("Aucun commercial pour l'instant");
    expect(content).toContain("Ajoutez le premier");
    expect(content).not.toContain("Marie");
  });

  it("état vide d'une recherche : on dit ce qui ne correspond pas, sans prétendre qu'il n'y a personne", async () => {
    mocks.listTeam.mockResolvedValue(teamOf({ rows: [], grandTotal: 3 }));
    const content = text(await renderList({ q: "zzz" }));
    expect(content).toContain("Aucun commercial ne correspond");
    expect(content).toContain("« zzz »");
    expect(content).not.toContain("Aucun commercial pour l'instant");
  });

  it("les dossiers sans commercial : un panneau pour les attribuer, seulement s'il y en a", async () => {
    mocks.listTeam.mockResolvedValue(teamOf());
    expect(text(await renderList())).not.toContain("Dossiers sans commercial");

    mocks.listUnassignedProspects.mockResolvedValue({ rows: [{ id: "p1", name: "Pharmacie du Port", city: "Nantes", status: "PROSPECT", createdAt: new Date("2026-10-03T09:00:00Z") }], total: 12 });
    const content = text(await renderList());
    expect(content).toContain("Dossiers sans commercial (12)");
    expect(content).toContain("Pharmacie du Port");
    expect(content).toContain("Nantes");
    expect(content).toContain("Attribuer");
    expect(content).toContain("Les 1 plus récents sont affichés");
  });

  it("n'offre aucun lien vers la console, l'extranet ni une officine", async () => {
    mocks.listTeam.mockResolvedValue(teamOf());
    mocks.listUnassignedProspects.mockResolvedValue({ rows: [{ id: "p1", name: "Pharmacie du Port", city: null, status: "PROSPECT", createdAt: new Date() }], total: 1 });
    for (const href of hrefs(await renderList())) expect(href.startsWith("/directeur"), href).toBe(true);
  });
});

describe("l'ajout d'un commercial", () => {
  it("passe d'abord par la session du directeur", async () => {
    mocks.requireDirectorSession.mockRejectedValue(new Error("NEXT_REDIRECT /directeur/connexion"));
    await expect(renderCreate()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getStandardCommissionCents).not.toHaveBeenCalled();
  });

  it("propose la commission standard, l'aide du type, et l'invitation cochée par défaut", async () => {
    const html = await renderCreate();
    const content = text(html);
    expect(content).toContain("Ajouter un commercial");
    expect(content).toContain("Prénom");
    expect(content).toContain("Adresse e-mail");
    expect(content).toContain("Une somme fixe, versée pour chaque officine qui s'abonne");
    expect(html).toContain('value="250"'); // la commission standard de la plateforme
    expect(html).toMatch(/id="rep-invite"[^>]*checked/);
    expect(content).toContain("Envoyer l'invitation maintenant");
    expect(content).toContain("Ajouter et inviter");
  });
});

describe("la fiche d'un commercial", () => {
  it("passe d'abord par la session du directeur, puis 404 pour un identifiant inconnu", async () => {
    mocks.requireDirectorSession.mockRejectedValueOnce(new Error("NEXT_REDIRECT /directeur/connexion"));
    await expect(renderDetail()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getTeamMember).not.toHaveBeenCalled();

    mocks.getTeamMember.mockResolvedValue(null);
    await expect(renderDetail("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getPortfolio).not.toHaveBeenCalled();
  });

  it("l'en-tête : identité, règle de commission, chiffres, renvoi vers ses commissions filtrées", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getPortfolio.mockResolvedValue({ prospects: [], truncated: false });
    const html = await renderDetail();
    const content = text(html);
    expect(content).toContain("Marie Dupont");
    expect(content).toContain("Actif");
    expect(content).toContain("marie@exemple.fr · 06 12 34 56 78 · Rhône · 250,00 € par contrat · dernière connexion le 05/10/2026");
    expect(content).toMatch(/Dossiers ouverts\s*5\s*sur 8 au total/);
    expect(content).toMatch(/Contrats signés\s*2\s*25 % des dossiers/);
    expect(content).toMatch(/Officines activées\s*1\s*1 dossier perdu/);
    expect(content).toMatch(/Commissions acquises\s*500,00 €/);
    expect(content).toContain("250,00 € prévisionnelles");
    expect(content).toContain("750,00 € payées");
    expect(hrefs(html)).toContain("/directeur/commissions?commercial=rep_1");
    expect(content).toContain("Modifier");
    // Déjà connecté : plus d'invitation à envoyer.
    expect(content).not.toContain("Renvoyer l'invitation");
  });

  it("jamais connecté : l'invitation se renvoie depuis la fiche", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf({}, { lastLoginAt: null }));
    mocks.getPortfolio.mockResolvedValue({ prospects: [], truncated: false });
    const content = text(await renderDetail());
    expect(content).toContain("invité le 01/10/2026, pas encore connecté");
    expect(content).toContain("Renvoyer l'invitation");
  });

  it("portefeuille : ses dossiers par étape, la réaffectation vers un AUTRE commercial actif seulement", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getPortfolio.mockResolvedValue({
      prospects: [
        { id: "p1", name: "Pharmacie du Port", city: "Nantes", status: "DEMO_DONE", nextActionAt: new Date("2026-09-01T09:00:00Z"), nextActionLabel: "Rappeler", lastContactAt: new Date("2026-09-20T09:00:00Z"), monthlyPriceCents: 9900, blocked: false },
        { id: "p2", name: "Pharmacie du Centre", city: null, status: "PROSPECT", nextActionAt: null, nextActionLabel: null, lastContactAt: null, monthlyPriceCents: null, blocked: true },
      ],
      truncated: false,
    });
    const html = await renderDetail();
    const content = text(html);
    expect(content).toContain("Pharmacie du Port");
    expect(content).toContain("Nantes");
    expect(content).toContain("Rappeler le 01/09/2026 (en retard)");
    expect(content).toContain("dernier contact le 20/09/2026");
    expect(content).toContain("99,00 € / mois");
    expect(content).toContain("Suspendu");
    expect(content).toContain("Ville non renseignée");
    // Rangés dans l'ordre du pipeline : Prospect avant Démo réalisée.
    expect(content.indexOf("Prospect")).toBeLessThan(content.indexOf("Démo réalisée"));
    // Réaffecter : les autres commerciaux actifs, jamais lui-même.
    expect(content).toContain("Confier à…");
    expect(content).toContain("Paul Martin");
    expect(html).not.toMatch(/<option[^>]*>Marie Dupont<\/option>/);
    expect(content).toContain("Réaffecter");
  });

  it("portefeuille vide : état honnête", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getPortfolio.mockResolvedValue({ prospects: [], truncated: false });
    expect(text(await renderDetail())).toContain("Aucun dossier ne lui est confié pour l'instant.");
  });

  it("ce qu'il a fait : relances, démonstrations, fil d'activité sur 30 jours, sans lien vers un dossier", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getActivity.mockResolvedValue({
      since: new Date("2026-09-15T10:00:00Z"),
      events: [{ id: "e1", type: "STATUS_CHANGED", summary: "Contacté → Démo réalisée.", actorLabel: "Marie Dupont", createdAt: new Date("2026-10-04T09:00:00Z"), prospect: { id: "p1", name: "Pharmacie du Port" } }],
      tasksDone: 7,
      overdueTasks: [{ id: "t1", label: "Rappeler", dueAt: new Date("2026-09-30T08:00:00Z"), prospect: { id: "p1", name: "Pharmacie du Port" } }],
      demosDone: 3,
      demosUpcoming: 2,
    });
    const html = await renderDetail("rep_1", { onglet: "activite" });
    const content = text(html);
    expect(mocks.getActivity).toHaveBeenCalledWith("rep_1", expect.any(Date));
    expect(mocks.getPortfolio).not.toHaveBeenCalled(); // seul l'onglet ouvert est lu
    expect(content).toMatch(/Relances faites\s*7/);
    expect(content).toMatch(/Relances en retard\s*1/);
    expect(content).toMatch(/Démonstrations réalisées\s*3/);
    expect(content).toMatch(/Démonstrations à venir\s*2/);
    expect(content).toContain("Rappeler");
    expect(content).toContain("prévue le 30/09/2026");
    expect(content).toContain("Contacté → Démo réalisée.");
    expect(content).toContain("Pharmacie du Port");
    expect(content).toContain("par Marie Dupont");
    expect(content).toContain("Les contrats et les e-mails n'y figurent pas");
    for (const href of hrefs(html)) expect(href.startsWith("/directeur"), href).toBe(true);
  });

  it("ce qu'il a fait, sans rien : états honnêtes", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getActivity.mockResolvedValue({ since: new Date("2026-09-15T10:00:00Z"), events: [], tasksDone: 0, overdueTasks: [], demosDone: 0, demosUpcoming: 0 });
    const content = text(await renderDetail("rep_1", { onglet: "activite" }));
    expect(content).toContain("Aucune activité sur ses dossiers ces 30 derniers jours.");
    expect(content).not.toContain("Relances en retard Relances");
  });

  it("commissions et factures : ses lignes, les liens vers les pages de la direction, la facture rattachée", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getMoney.mockResolvedValue({
      commissions: [
        { id: "c1", prospectName: "Pharmacie du Port", amountCents: 25000, status: "PAYABLE", type: "FIXED", createdAt: new Date("2026-09-10T09:00:00Z"), paidAt: null, invoiceId: "inv_1" },
        { id: "c2", prospectName: "Pharmacie du Centre", amountCents: 25000, status: "PAID", type: "FIXED", createdAt: new Date("2026-08-10T09:00:00Z"), paidAt: new Date("2026-09-01T09:00:00Z"), invoiceId: null },
      ],
      commissionsTruncated: false,
      invoices: [{ id: "inv_1", number: "F-2026-014", amountCents: 25000, issuedAt: new Date("2026-09-12T09:00:00Z"), status: "APPROVED", periodLabel: "Septembre 2026" }],
      invoicesTruncated: false,
    });
    const html = await renderDetail("rep_1", { onglet: "argent" });
    const content = text(html);
    expect(content).toContain("Pharmacie du Port");
    expect(content).toContain("250,00 €");
    expect(content).toContain("À payer");
    expect(content).toContain("payée le 01/09/2026");
    expect(content).toContain("F-2026-014");
    expect(content).toContain("Septembre 2026");
    expect(content).toContain("Validée");
    expect(hrefs(html)).toEqual(expect.arrayContaining(["/directeur/commissions?commercial=rep_1", "/directeur/factures?commercial=rep_1", "/directeur/factures/inv_1"]));
  });

  it("commissions et factures vides : états honnêtes", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getMoney.mockResolvedValue({ commissions: [], commissionsTruncated: false, invoices: [], invoicesTruncated: false });
    const content = text(await renderDetail("rep_1", { onglet: "argent" }));
    expect(content).toContain("Aucune commission pour l'instant");
    expect(content).toContain("Aucune facture pour l'instant");
  });

  it("challenges : son avancement et son rang, calculés par le service ; un état vide honnête sinon", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.challengesOfRep.mockResolvedValue({
      running: [{ challenge: { id: "ch_1", title: "Octobre sprint", description: null, metric: "DEMOS_DONE", target: 5, startsAt: new Date("2026-09-30T22:00:00Z"), endsAt: new Date("2026-10-31T23:00:00Z"), rewardLabel: null, rewardCents: null }, state: "RUNNING", stoppedEarly: false, mine: { value: 3, target: 5, percent: 60, reached: false, rank: 2 }, participants: 4, ranking: [] }],
      upcoming: [],
      ended: [],
    });
    const html = await renderDetail("rep_1", { onglet: "challenges" });
    const content = text(html);
    expect(mocks.challengesOfRep).toHaveBeenCalledWith("rep_1", expect.any(Date));
    expect(content).toContain("Octobre sprint");
    expect(content).toContain("5 démonstrations réalisées");
    expect(content).toContain("3 sur 5 · 60 %");
    expect(content).toContain("2e sur 4");
    expect(hrefs(html)).toContain("/directeur/challenges/ch_1");

    mocks.challengesOfRep.mockResolvedValue({ running: [], upcoming: [], ended: [] });
    expect(text(await renderDetail("rep_1", { onglet: "challenges" }))).toContain("Aucun challenge pour l'instant");
  });

  it("un onglet inconnu retombe sur le portefeuille", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getPortfolio.mockResolvedValue({ prospects: [], truncated: false });
    await renderDetail("rep_1", { onglet: "n-importe-quoi" });
    expect(mocks.getPortfolio).toHaveBeenCalledWith("rep_1");
  });

  it("avec un historique : la suppression est expliquée, jamais proposée ; la désactivation reste possible", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getPortfolio.mockResolvedValue({ prospects: [], truncated: false });
    const html = await renderDetail();
    const content = text(html);
    expect(content).toContain("Suppression impossible.");
    expect(content).toContain("Ce commercial a un historique : désactivez-le ou réaffectez ses dossiers.");
    expect(content).toContain("8 dossiers, 3 commissions, 1 facture, 2 tâches");
    expect(content).not.toContain("Supprimer définitivement");
    const buttons = [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => text(match[1]).trim());
    expect(buttons).toContain("Désactiver");
  });

  it("sans aucun historique : la suppression définitive est proposée", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf({ footprint: { prospects: 0, commissions: 0, invoices: 0, tasks: 0 }, deletionRefusal: null, stats: { prospects: 0, openProspects: 0, contractsSent: 0, contractsSigned: 0, activated: 0, lost: 0, conversionRate: 0, commissionEarnedCents: 0, commissionPendingCents: 0, commissionPaidCents: 0 } }));
    mocks.getPortfolio.mockResolvedValue({ prospects: [], truncated: false });
    const html = await renderDetail();
    expect(text(html)).not.toContain("Suppression impossible");
    expect([...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => text(match[1]).trim())).toContain("Supprimer définitivement");
  });

  it("un compte désactivé : l'avertissement dit combien de dossiers ouverts restent à son nom ; « Réactiver » remplace « Désactiver »", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf({}, { isActive: false }));
    mocks.getPortfolio.mockResolvedValue({ prospects: [], truncated: false });
    const html = await renderDetail();
    const content = text(html);
    expect(content).toContain("Ce compte est désactivé");
    expect(content).toContain("Ses 5 dossiers ouverts restent à son nom : réaffectez-les depuis l'onglet « Portefeuille »");
    const buttons = [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => text(match[1]).trim());
    expect(buttons).toContain("Réactiver");
    expect(buttons).not.toContain("Désactiver");
    // Un compte désactivé ne reçoit plus d'invitation.
    expect(buttons).not.toContain("Renvoyer l'invitation");
  });

  it("n'offre aucun lien vers la console, l'extranet ni une officine, sur aucun onglet", async () => {
    mocks.getTeamMember.mockResolvedValue(overviewOf());
    mocks.getPortfolio.mockResolvedValue({ prospects: [{ id: "p1", name: "Pharmacie du Port", city: "Nantes", status: "PROSPECT", nextActionAt: null, nextActionLabel: null, lastContactAt: null, monthlyPriceCents: null, blocked: false }], truncated: false });
    mocks.getActivity.mockResolvedValue({ since: new Date(), events: [], tasksDone: 0, overdueTasks: [], demosDone: 0, demosUpcoming: 0 });
    mocks.getMoney.mockResolvedValue({ commissions: [], commissionsTruncated: false, invoices: [], invoicesTruncated: false });
    mocks.challengesOfRep.mockResolvedValue({ running: [], upcoming: [], ended: [] });
    for (const onglet of [undefined, "activite", "argent", "challenges"]) {
      for (const href of hrefs(await renderDetail("rep_1", onglet ? { onglet } : {}))) expect(href.startsWith("/directeur"), `${onglet}: ${href}`).toBe(true);
    }
  });
});
