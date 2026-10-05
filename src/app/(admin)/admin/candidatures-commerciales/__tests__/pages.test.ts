import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les écrans de la console « Candidatures commerciales », rendus côté serveur
 * sans navigateur ni base (aucune session console n'est disponible pour les
 * voir en direct) : la liste et la fiche, services simulés. On lit le texte
 * rendu, pas le balisage.
 */

const mocks = vi.hoisted(() => ({
  requirePlatformSession: vi.fn(),
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
// La fenêtre de confirmation s'ouvre à la demande : seul son bouton d'ouverture compte ici.
vi.mock("@/components/ui/modal", () => ({ Modal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? createElement("div", null, children) : null) }));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/services/sales-applications/admin", () => ({ listSalesApplications: mocks.listSalesApplications, getSalesApplication: mocks.getSalesApplication }));
vi.mock("@/server/services/standard-commission", () => ({ getStandardCommissionCents: mocks.getStandardCommissionCents }));
vi.mock("@/server/actions/admin-sales-applications", () => ({ moveSalesApplicationAction: vi.fn(), addSalesApplicationNoteAction: vi.fn(), convertSalesApplicationAction: vi.fn() }));

const list = await import("../page");
const detail = await import("../[id]/page");
const status = await import("../_components/status");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

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
    { id: "e2", at: new Date("2026-10-05T09:00:00Z"), kind: "note", title: "Note interne", detail: "Appelée : motivée.", actor: "Alice Admin" },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
  mocks.getStandardCommissionCents.mockResolvedValue(25000);
});

describe("la liste", () => {
  it("passe d'abord par la session console", async () => {
    mocks.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT /admin-connexion"));
    await expect(renderList()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.listSalesApplications).not.toHaveBeenCalled();
  });

  it("montre les candidatures, les compteurs réels par statut et la recherche", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf());
    const html = await renderList();
    const content = text(html);
    expect(mocks.listSalesApplications).toHaveBeenCalledWith({ status: null, q: "", page: 1 });
    expect(content).toContain("Candidatures commerciales");
    expect(content).toContain("Marie Dupont");
    expect(content).toContain("marie@exemple.fr");
    expect(content).toContain("Lyon");
    expect(content).toContain("Rhône");
    expect(content).toMatch(/Toutes\s*4/);
    expect(content).toMatch(/Nouvelle\s*2/);
    expect(content).toMatch(/À contacter\s*1/);
    expect(content).toMatch(/Entretien\s*0/);
    expect(content).toMatch(/Acceptée\s*1/);
    expect(content).toMatch(/Refusée\s*0/);
    expect(html).toContain('href="/admin/candidatures-commerciales/app_1"');
    expect(html).toContain('type="search"');
    expect(html).not.toContain("Page 1 sur"); // une seule page : pas de pagination
  });

  it("le statut et la recherche de l'adresse sont transmis au service, et conservés dans les liens", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf({ rows: [row({ status: "INTERVIEW" })], filteredTotal: 1 }));
    const html = await renderList({ statut: "entretien", q: "  dupont lyon  ", page: "1" });
    expect(mocks.listSalesApplications).toHaveBeenCalledWith({ status: "INTERVIEW", q: "dupont lyon", page: 1 });
    // Le filtre de statut garde la recherche ; la recherche garde le statut.
    expect(html).toContain("q=dupont+lyon&amp;statut=acceptee");
    expect(html).toContain('name="statut" value="entretien"');
  });

  it("un statut inconnu dans l'adresse ne filtre rien", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf());
    await renderList({ statut: "n-importe-quoi", page: "abc" });
    expect(mocks.listSalesApplications).toHaveBeenCalledWith({ status: null, q: "", page: 1 });
  });

  it("pagine avec les liens précédente / suivante", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf({ page: 2, pageCount: 3, filteredTotal: 60 }));
    const html = await renderList({ page: "2", q: "lyon" });
    expect(text(html)).toContain("Page 2 sur 3 · 60 candidatures");
    expect(html).toContain('href="/admin/candidatures-commerciales?q=lyon"'); // page 1 : pas de paramètre
    expect(html).toContain('href="/admin/candidatures-commerciales?q=lyon&amp;page=3"');
  });

  it("état vide honnête : aucune candidature reçue", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf({ rows: [], counts: { NEW: 0, TO_CONTACT: 0, INTERVIEW: 0, ACCEPTED: 0, REFUSED: 0 }, total: 0, grandTotal: 0, filteredTotal: 0 }));
    const content = text(await renderList());
    expect(content).toContain("Aucune candidature reçue");
    expect(content).toContain("Devenir commercial");
    expect(content).not.toContain("Marie");
  });

  it("état vide d'un filtre : on dit ce qui ne correspond pas, sans prétendre qu'il n'y a rien", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf({ rows: [], filteredTotal: 0 }));
    const bySearch = text(await renderList({ q: "zzz" }));
    expect(bySearch).toContain("Aucune candidature ne correspond");
    expect(bySearch).toContain("« zzz »");
    const byStatus = text(await renderList({ statut: "refusee" }));
    expect(byStatus).toContain("Aucune candidature ne correspond");
    expect(byStatus).toContain("« Refusée »");
    expect(byStatus).not.toContain("Aucune candidature reçue");
  });

  it("une candidature convertie le dit", async () => {
    mocks.listSalesApplications.mockResolvedValue(listOf({ rows: [row({ status: "ACCEPTED", converted: true })] }));
    expect(text(await renderList())).toContain("Commercial créé");
  });
});

describe("les paramètres d'adresse des statuts", () => {
  it("aller-retour pour chaque statut, valeur inconnue sans effet", () => {
    for (const value of ["NEW", "TO_CONTACT", "INTERVIEW", "ACCEPTED", "REFUSED"] as const) {
      expect(status.statusFromParam(status.statusParam(value))).toBe(value);
    }
    expect(status.statusFromParam("NEW")).toBeNull();
    expect(status.statusFromParam(undefined)).toBeNull();
    expect(status.statusFromParam("")).toBeNull();
  });
});

describe("la fiche", () => {
  it("passe d'abord par la session console, puis 404 si la candidature n'existe pas", async () => {
    mocks.requirePlatformSession.mockRejectedValueOnce(new Error("NEXT_REDIRECT /admin-connexion"));
    await expect(renderDetail()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getSalesApplication).not.toHaveBeenCalled();

    mocks.getSalesApplication.mockResolvedValue(null);
    await expect(renderDetail("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("montre l'identité, l'expérience, le message, le CV téléchargeable, le consentement et l'historique", async () => {
    mocks.getSalesApplication.mockResolvedValue(detailOf());
    const html = await renderDetail();
    const content = text(html);
    expect(mocks.getSalesApplication).toHaveBeenCalledWith("app_1");
    expect(content).toContain("Marie Dupont");
    expect(content).toContain("marie@exemple.fr");
    expect(content).toContain("06 12 34 56 78");
    expect(content).toContain("Lyon");
    expect(content).toContain("Rhône et Isère");
    expect(content).toContain("Indépendant(e) ou auto-entrepreneur");
    expect(content).toContain("Dix ans de vente en grande distribution.");
    expect(content).toContain("Non précisée");
    expect(content).toContain("Je veux développer PharmaBoost.");
    expect(content).toContain("cv-marie.pdf");
    expect(content).toContain("402 Ko");
    expect(html).toContain('href="/api/admin/candidatures-commerciales/app_1/cv"');
    expect(content).toContain("Consentement donné le");
    expect(content).toContain("Accusé de réception Envoyé le");
    expect(content).toContain("Candidature reçue depuis le site");
    expect(content).toContain("Appelée : motivée.");
    expect(content).toContain("par Alice Admin");
    expect(html).toContain("Ajouter la note");
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
    expect(html).not.toContain("/api/admin/candidatures-commerciales/app_1/cv");
  });

  it("acceptée et pas encore convertie : « Transformer en commercial » avec la commission lue dans la console", async () => {
    mocks.getSalesApplication.mockResolvedValue(detailOf({ status: "ACCEPTED" }));
    mocks.getStandardCommissionCents.mockResolvedValue(30000);
    const content = text(await renderDetail());
    expect(content).toContain("Transformer en commercial");
    expect(content).toMatch(/commission est fixe : 300 € par pharmacie activée/);
    expect(content).toContain("Envoyer l'invitation par e-mail");
  });

  it("pas encore acceptée : la transformation est expliquée, pas proposée ; la commission n'est même pas lue", async () => {
    for (const statusKey of ["NEW", "TO_CONTACT", "INTERVIEW", "REFUSED"]) {
      mocks.getSalesApplication.mockResolvedValue(detailOf({ status: statusKey }));
      const content = text(await renderDetail());
      expect(content).not.toContain("Créer le commercial");
      expect(content).not.toContain("Envoyer l'invitation par e-mail");
      expect(content).toContain("proposée une fois la candidature acceptée");
    }
    expect(mocks.getStandardCommissionCents).not.toHaveBeenCalled();
  });

  it("déjà convertie : lien vers le commercial, statut figé, plus de bouton de création", async () => {
    mocks.getSalesApplication.mockResolvedValue(detailOf({ status: "ACCEPTED", salesRep: { id: "rep_1", name: "Marie Dupont", isActive: true } }));
    const html = await renderDetail();
    const content = text(html);
    expect(html).toContain('href="/admin/commerciaux/rep_1"');
    expect(content).toContain("est devenue un commercial");
    expect(content).toContain("son statut ne change plus");
    expect(content).not.toContain("Envoyer l'invitation par e-mail");
    expect(content).not.toContain("Accepter");
    expect(mocks.getStandardCommissionCents).not.toHaveBeenCalled();
  });
});
