import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les écrans « Candidatures » du directeur, rendus côté serveur sans navigateur
 * ni base : la liste et la fiche, services simulés. Même fonctionnement que la
 * console, avec la session du directeur et des liens qui restent dans son espace.
 */

const mocks = vi.hoisted(() => ({
  requireDirectorSession: vi.fn(),
  listSalesApplications: vi.fn(),
  getSalesApplication: vi.fn(),
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
vi.mock("@/components/ui/modal", () => ({ Modal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? createElement("div", null, children) : null) }));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales-applications/admin", () => ({ listSalesApplications: mocks.listSalesApplications, getSalesApplication: mocks.getSalesApplication }));
vi.mock("@/server/services/standard-commission", () => ({ getStandardCommissionCents: mocks.getStandardCommissionCents }));
vi.mock("@/server/actions/director-applications", () => ({ moveApplicationAction: vi.fn(), addApplicationNoteAction: vi.fn(), convertApplicationAction: vi.fn() }));

const list = await import("../page");
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
const renderDetail = async (id = "app_1") => renderToStaticMarkup((await detail.default({ params: Promise.resolve({ id }) })) as never);

const COUNTS = { NEW: 2, TO_CONTACT: 1, INTERVIEW: 0, ACCEPTED: 1, REFUSED: 0 };
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "app_1",
  createdAt: new Date("2026-10-04T09:00:00Z"),
  firstName: "Marie",
  lastName: "Dupont",
  email: "marie@exemple.fr",
  city: "Lyon",
  zone: "Rhône",
  status: "NEW",
  hasCv: true,
  converted: false,
  ...overrides,
});
const listOf = (overrides: Record<string, unknown> = {}) => ({ rows: [row(), row({ id: "app_2", firstName: "Paul", lastName: "Martin", hasCv: false })], counts: COUNTS, total: 4, grandTotal: 4, filteredTotal: 2, page: 1, pageCount: 1, pageSize: 25, ...overrides });

const detailOf = (overrides: Record<string, unknown> = {}) => ({
  id: "app_1",
  status: "NEW",
  firstName: "Marie",
  lastName: "Dupont",
  email: "marie@exemple.fr",
  phone: "06 12 34 56 78",
  city: "Lyon",
  salesExperience: "Dix ans de vente en grande distribution.",
  healthExperience: null,
  currentStatus: "FREELANCE",
  zone: "Rhône et Isère",
  message: "Je veux développer PharmaBoost.",
  consentAt: new Date("2026-10-04T09:00:00Z"),
  acknowledgedAt: new Date("2026-10-04T09:00:05Z"),
  createdAt: new Date("2026-10-04T09:00:00Z"),
  cv: { fileName: "cv-marie.pdf", sizeBytes: 412_000 },
  salesRep: null,
  timeline: [
    { id: "e1", at: new Date("2026-10-04T09:00:00Z"), kind: "dossier", title: "Candidature reçue depuis le site", tone: "info" },
    { id: "e2", at: new Date("2026-10-05T09:00:00Z"), kind: "note", title: "Note interne", detail: "Appelée : motivée.", actor: "Diane Directrice" },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue({ director: { id: "dir_1" } });
  mocks.getStandardCommissionCents.mockResolvedValue(25000);
});

describe("la liste", () => {
  it("passe d'abord par la session du directeur", async () => {
    mocks.requireDirectorSession.mockRejectedValue(new Error("NEXT_REDIRECT /directeur/connexion"));
    await expect(renderList()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.listSalesApplications).not.toHaveBeenCalled();
  });

  it("montre les candidatures, les compteurs réels par statut et la recherche, avec des liens dans l'espace du directeur", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf());
    const html = await renderList();
    const content = text(html);
    expect(mocks.listSalesApplications).toHaveBeenCalledWith({ status: null, q: "", page: 1 });
    expect(content).toContain("Candidatures");
    expect(content).toContain("Marie Dupont");
    expect(content).toContain("marie@exemple.fr");
    expect(content).toContain("Rhône");
    expect(content).toMatch(/Toutes\s*4/);
    expect(content).toMatch(/Nouvelle\s*2/);
    expect(content).toMatch(/À contacter\s*1/);
    expect(content).toMatch(/Acceptée\s*1/);
    expect(hrefs(html)).toContain("/directeur/candidatures/app_1");
    expect(html).toContain('type="search"');
    for (const href of hrefs(html)) expect(href.startsWith("/directeur"), href).toBe(true);
  });

  it("le statut et la recherche de l'adresse sont transmis au service", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf({ rows: [row({ status: "INTERVIEW" })], filteredTotal: 1 }));
    const html = await renderList({ statut: "entretien", q: "  dupont lyon  ", page: "1" });
    expect(mocks.listSalesApplications).toHaveBeenCalledWith({ status: "INTERVIEW", q: "dupont lyon", page: 1 });
    expect(html).toContain('name="statut" value="entretien"');
  });

  it("pagine avec des liens qui restent dans l'espace du directeur", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf({ page: 2, pageCount: 3, filteredTotal: 60 }));
    const html = await renderList({ page: "2", q: "lyon" });
    expect(text(html)).toContain("Page 2 sur 3 · 60 candidatures");
    expect(hrefs(html)).toContain("/directeur/candidatures?q=lyon");
    expect(hrefs(html)).toContain("/directeur/candidatures?q=lyon&page=3");
  });

  it("états vides honnêtes : aucune candidature reçue, ou aucune qui corresponde", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf({ rows: [], counts: { NEW: 0, TO_CONTACT: 0, INTERVIEW: 0, ACCEPTED: 0, REFUSED: 0 }, total: 0, grandTotal: 0, filteredTotal: 0 }));
    expect(text(await renderList())).toContain("Aucune candidature reçue");

    mocks.listSalesApplications.mockResolvedValue(listOf({ rows: [], filteredTotal: 0 }));
    const content = text(await renderList({ q: "zzz" }));
    expect(content).toContain("Aucune candidature ne correspond");
    expect(content).toContain("« zzz »");
    expect(content).not.toContain("Aucune candidature reçue");
  });
});

describe("la fiche", () => {
  it("passe d'abord par la session du directeur, puis 404 si la candidature n'existe pas", async () => {
    mocks.requireDirectorSession.mockRejectedValueOnce(new Error("NEXT_REDIRECT /directeur/connexion"));
    await expect(renderDetail()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getSalesApplication).not.toHaveBeenCalled();

    mocks.getSalesApplication.mockResolvedValue(null);
    await expect(renderDetail("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("montre l'identité, l'expérience, le message, le CV (route du directeur), le consentement et l'historique", async () => {
    mocks.getSalesApplication.mockResolvedValue(detailOf());
    const html = await renderDetail();
    const content = text(html);
    // Le lien vers le commercial créé mène à l'espace du directeur, pas à la console.
    expect(mocks.getSalesApplication).toHaveBeenCalledWith("app_1", { repBasePath: "/directeur/commerciaux" });
    expect(content).toContain("Marie Dupont");
    expect(content).toContain("06 12 34 56 78");
    expect(content).toContain("Indépendant(e) ou auto-entrepreneur");
    expect(content).toContain("Dix ans de vente en grande distribution.");
    expect(content).toContain("Non précisée");
    expect(content).toContain("Je veux développer PharmaBoost.");
    expect(content).toContain("cv-marie.pdf");
    expect(content).toContain("402 Ko");
    expect(hrefs(html)).toContain("/api/directeur/candidatures/app_1/cv");
    expect(content).toContain("Consentement donné le");
    expect(content).toContain("Candidature reçue depuis le site");
    expect(content).toContain("Appelée : motivée.");
    expect(content).toContain("par Diane Directrice");
    expect(html).toContain("Ajouter la note");
    expect(html).not.toContain("/api/admin/");
    expect(html).not.toContain("/admin/");
  });

  it("propose les autres statuts (pas le statut actuel) ; « Refuser » ne part pas sans confirmation", async () => {
    mocks.getSalesApplication.mockResolvedValue(detailOf({ status: "TO_CONTACT" }));
    const html = await renderDetail();
    const buttons = [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => text(match[1]).trim());
    expect(buttons).toEqual(expect.arrayContaining(["Remettre en « Nouvelle »", "Entretien", "Accepter", "Refuser"]));
    expect(buttons).not.toContain("À contacter");
    expect(text(html)).toContain("Statut actuel : À contacter");
  });

  it("sans CV : « Aucun CV déposé », aucun lien de téléchargement", async () => {
    mocks.getSalesApplication.mockResolvedValue(detailOf({ cv: null }));
    const html = await renderDetail();
    expect(text(html)).toContain("Aucun CV déposé");
    expect(html).not.toContain("/cv");
  });

  it("acceptée et pas encore convertie : « Transformer en commercial » avec la commission standard", async () => {
    mocks.getSalesApplication.mockResolvedValue(detailOf({ status: "ACCEPTED" }));
    mocks.getStandardCommissionCents.mockResolvedValue(30000);
    const content = text(await renderDetail());
    expect(content).toContain("Transformer en commercial");
    expect(content).toMatch(/commission est fixe : 300 € par pharmacie activée/);
    expect(content).toContain("Vous pourrez la modifier depuis sa fiche");
    expect(content).toContain("Envoyer l'invitation par e-mail");
  });

  it("pas encore acceptée : la transformation est expliquée, pas proposée ; la commission n'est même pas lue", async () => {
    for (const statusKey of ["NEW", "TO_CONTACT", "INTERVIEW", "REFUSED"]) {
      mocks.getSalesApplication.mockResolvedValue(detailOf({ status: statusKey }));
      const content = text(await renderDetail());
      expect(content).not.toContain("Créer le commercial");
      expect(content).toContain("proposée une fois la candidature acceptée");
    }
    expect(mocks.getStandardCommissionCents).not.toHaveBeenCalled();
  });

  it("déjà convertie : lien vers la fiche du commercial dans l'espace du directeur, statut figé", async () => {
    mocks.getSalesApplication.mockResolvedValue(detailOf({ status: "ACCEPTED", salesRep: { id: "rep_1", name: "Marie Dupont", isActive: true } }));
    const html = await renderDetail();
    const content = text(html);
    expect(hrefs(html)).toContain("/directeur/commerciaux/rep_1");
    expect(content).toContain("est devenue un commercial");
    expect(content).toContain("son statut ne change plus");
    expect(content).not.toContain("Envoyer l'invitation par e-mail");
    expect(mocks.getStandardCommissionCents).not.toHaveBeenCalled();
  });
});
