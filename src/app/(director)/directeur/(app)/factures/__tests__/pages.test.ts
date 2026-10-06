import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les trois écrans des factures du directeur (liste, saisie, fiche), rendus côté
 * serveur sans navigateur ni base : le service est remplacé. On vérifie ce que
 * les pages décident elles-mêmes — qui entre, les filtres, et surtout quels
 * gestes l'état de la facture permet d'afficher.
 */

const mocks = vi.hoisted(() => ({
  requireDirectorSession: vi.fn(),
  service: { listDirectorInvoices: vi.fn(), listInvoiceableCommissions: vi.fn(), listRepOptions: vi.fn(), getDirectorInvoice: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/director-money", () => ({ createInvoiceAction: vi.fn(), invoiceGestureAction: vi.fn(), deleteInvoiceAction: vi.fn() }));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales/director-money", () => mocks.service);

const list = await import("../page");
const create = await import("../nouvelle/page");
const detail = await import("../[id]/page");

type Params = Record<string, string | string[] | undefined>;
const renderList = async (params: Params = {}) => renderToStaticMarkup(await list.default({ searchParams: Promise.resolve(params) }));
const renderCreate = async (params: Params = {}) => renderToStaticMarkup(await create.default({ searchParams: Promise.resolve(params) }));
const renderDetail = async (id = "inv_1") => renderToStaticMarkup(await detail.default({ params: Promise.resolve({ id }) }));

const ZERO = { count: 0, cents: 0 };
const REPS = [
  { id: "rep_1", name: "Marie Dupont", isActive: true },
  { id: "rep_2", name: "Paul Martin", isActive: false },
];
const listing = (overrides: Record<string, unknown> = {}) => ({
  rows: [{ id: "inv_1", number: "FA-014", amountCents: 75_000, issuedAt: new Date("2026-10-01T12:00:00Z"), periodLabel: "Septembre 2026", status: "RECEIVED", hasFile: true, commissionCount: 2, rep: { id: "rep_1", name: "Marie Dupont" } }],
  byStatus: { RECEIVED: { count: 1, cents: 75_000 }, APPROVED: ZERO, PAID: { count: 2, cents: 120_000 }, REJECTED: ZERO },
  reps: REPS,
  filteredTotal: 1,
  page: 1,
  pageCount: 1,
  pageSize: 25,
  ...overrides,
});

const NOW = new Date("2026-10-06T10:00:00Z");
const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: "inv_1",
  number: "FA-014",
  amountCents: 75_000,
  issuedAt: new Date("2026-10-01T12:00:00Z"),
  periodLabel: "Septembre 2026",
  status: "RECEIVED",
  note: null,
  rejectionReason: null,
  hasFile: false,
  fileName: null,
  createdAt: NOW,
  createdByLabel: "Diane Directrice",
  approvedAt: null,
  paidAt: null,
  rejectedAt: null,
  rep: { id: "rep_1", name: "Marie Dupont" },
  commissions: [
    { id: "com_1", amountCents: 25_000, status: "EARNED", createdAt: NOW, prospectName: "Pharmacie du Parc", city: "Lyon" },
    { id: "com_2", amountCents: 50_000, status: "EARNED", createdAt: NOW, prospectName: "Pharmacie de la Gare", city: null },
  ],
  commissionsCents: 75_000,
  gap: { kind: "MATCH", differenceCents: 0, message: "Le montant de la facture (750,00 €) correspond aux commissions rattachées." },
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue({ director: { id: "dir_1" } });
  mocks.service.listDirectorInvoices.mockResolvedValue(listing());
  mocks.service.listRepOptions.mockResolvedValue(REPS);
  mocks.service.listInvoiceableCommissions.mockResolvedValue([{ id: "com_1", salesRepId: "rep_1", amountCents: 25_000, status: "EARNED", createdAt: NOW, prospectName: "Pharmacie du Parc", city: "Lyon" }]);
  mocks.service.getDirectorInvoice.mockResolvedValue(invoice());
});

describe("l'accès", () => {
  it("sans session de directeur, aucun écran ne lit quoi que ce soit", async () => {
    const redirected = new Error("NEXT_REDIRECT /directeur/connexion");
    mocks.requireDirectorSession.mockRejectedValue(redirected);
    await expect(renderList()).rejects.toBe(redirected);
    await expect(renderCreate()).rejects.toBe(redirected);
    await expect(renderDetail()).rejects.toBe(redirected);
    for (const fn of Object.values(mocks.service)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("la liste", () => {
  it("part au service avec les filtres valides, ignore les inventés", async () => {
    await renderList({ commercial: "rep_1", statut: "APPROVED", page: "3" });
    expect(mocks.service.listDirectorInvoices).toHaveBeenCalledWith({ salesRepId: "rep_1", status: "APPROVED", page: 3 });
    await renderList({ statut: "HACK", page: "x" });
    expect(mocks.service.listDirectorInvoices).toHaveBeenLastCalledWith({ salesRepId: null, status: null, page: 1 });
  });

  it("les trois totaux, la facture, son commercial et le chemin pour en enregistrer une", async () => {
    const html = await renderList();
    expect(html).toContain("À valider");
    expect(html).toContain("À payer");
    expect(html).toContain("Payées");
    expect(html).toMatch(/750,00\s€/);
    expect(html).toMatch(/1\s?200,00\s€/);
    expect(html).toContain("FA-014");
    expect(html).toContain("Marie Dupont");
    expect(html).toContain('href="/directeur/factures/inv_1"');
    expect(html).toContain('href="/directeur/factures/nouvelle"');
  });

  it("aucune facture : on le dit et on propose d'en enregistrer une ; filtres sans résultat : on propose de tout revoir", async () => {
    mocks.service.listDirectorInvoices.mockResolvedValue(listing({ rows: [], filteredTotal: 0, byStatus: { RECEIVED: ZERO, APPROVED: ZERO, PAID: ZERO, REJECTED: ZERO } }));
    const none = await renderList();
    expect(none).toContain("Aucune facture pour l&#x27;instant");
    expect(none).not.toContain("FA-014");
    const filtered = await renderList({ statut: "REJECTED" });
    expect(filtered).toContain("Aucune facture ne correspond");
    expect(filtered).toContain('href="/directeur/factures"');
  });
});

describe("la saisie", () => {
  it("le formulaire propose les commerciaux, et celui de l'adresse est choisi d'avance", async () => {
    const html = await renderCreate({ commercial: "rep_1" });
    expect(html).toContain("Enregistrer une facture");
    expect(html).toContain("Marie Dupont");
    expect(html).toContain("Paul Martin (inactif)");
    expect(html).toMatch(/<option value="rep_1" selected/);
    expect(html).toContain("Facture en PDF");
  });

  it("un commercial inconnu dans l'adresse n'est pas choisi d'avance", async () => {
    const html = await renderCreate({ commercial: "rep_inconnu" });
    expect(html).not.toMatch(/<option value="rep_inconnu"/);
    expect(html).not.toMatch(/<option value="rep_1" selected/);
  });

  it("sans aucun commercial : pas de formulaire, un chemin pour en ajouter un", async () => {
    mocks.service.listRepOptions.mockResolvedValue([]);
    const html = await renderCreate();
    expect(html).toContain("Aucun commercial pour l&#x27;instant");
    expect(html).toContain('href="/directeur/commerciaux/nouveau"');
    expect(html).not.toContain("Numéro de la facture");
  });
});

describe("la fiche", () => {
  it("une facture inconnue : introuvable", async () => {
    mocks.service.getDirectorInvoice.mockResolvedValue(null);
    await expect(renderDetail("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("reçue : valider ou refuser, supprimer ; jamais payer avant de valider", async () => {
    const html = await renderDetail();
    expect(html).toMatch(/>Valider la facture</);
    expect(html).toMatch(/>Refuser</);
    expect(html).toMatch(/>Supprimer</);
    expect(html).not.toContain("Marquer payée");
    expect(html).toContain("Le montant correspond");
    expect(html).toContain("Pharmacie du Parc");
    expect(html).toContain("Pharmacie de la Gare");
  });

  it("validée : payer ou refuser, mais ni valider de nouveau ni supprimer", async () => {
    mocks.service.getDirectorInvoice.mockResolvedValue(invoice({ status: "APPROVED", approvedAt: NOW }));
    const html = await renderDetail();
    expect(html).toMatch(/>Marquer payée</);
    expect(html).toMatch(/>Refuser</);
    expect(html).not.toMatch(/>Valider la facture</);
    expect(html).not.toMatch(/>Supprimer</);
  });

  it("payée : plus aucun geste", async () => {
    mocks.service.getDirectorInvoice.mockResolvedValue(invoice({ status: "PAID", approvedAt: NOW, paidAt: NOW }));
    const html = await renderDetail();
    expect(html).not.toContain("Que faire de cette facture");
    expect(html).not.toMatch(/>Marquer payée</);
    expect(html).not.toMatch(/>Refuser</);
    expect(html).not.toMatch(/>Supprimer</);
  });

  it("refusée : le motif en clair, les commissions libérées, suppression possible, aucun autre geste", async () => {
    mocks.service.getDirectorInvoice.mockResolvedValue(invoice({ status: "REJECTED", rejectionReason: "Montant différent des commissions", rejectedAt: NOW, commissions: [], commissionsCents: 0, gap: { kind: "NO_COMMISSION", differenceCents: 75_000, message: "Aucune commission n'est rattachée à cette facture : son montant n'est pas vérifié." } }));
    const html = await renderDetail();
    expect(html).toContain("Facture refusée");
    expect(html).toContain("Montant différent des commissions");
    expect(html).toContain("libérées au moment du refus");
    expect(html).toMatch(/>Supprimer</);
    expect(html).not.toMatch(/>Valider la facture</);
    expect(html).not.toMatch(/>Marquer payée</);
  });

  it("un écart de montant est dit en clair, sans bloquer le geste", async () => {
    mocks.service.getDirectorInvoice.mockResolvedValue(invoice({ amountCents: 80_000, gap: { kind: "HIGHER", differenceCents: 5_000, message: "La facture (800,00 €) dépasse de 50,00 € le total des commissions rattachées (750,00 €). Vérifiez avant de la valider." } }));
    const html = await renderDetail();
    expect(html).toContain("Écart de montant");
    expect(html).toContain("dépasse de 50,00 €");
    expect(html).toMatch(/>Valider la facture</);
  });

  it("le fichier : lien de téléchargement par la route du directeur seulement s'il existe", async () => {
    const without = await renderDetail();
    expect(without).toContain("Aucun fichier joint");
    expect(without).not.toContain("/api/directeur/factures/inv_1/fichier");
    mocks.service.getDirectorInvoice.mockResolvedValue(invoice({ hasFile: true, fileName: "Facture Marie.pdf" }));
    const html = await renderDetail();
    expect(html).toContain('href="/api/directeur/factures/inv_1/fichier"');
    expect(html).toContain("Télécharger le PDF");
  });
});
