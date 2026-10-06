import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La page « Commissions » du directeur, rendue côté serveur sans navigateur ni
 * base : le service est remplacé. On vérifie ce que la page décide elle-même —
 * qui entre, quels filtres partent au service, ce qui s'affiche et ce qui
 * reste caché (un geste n'est jamais proposé sur ce qu'il ne peut pas faire).
 */

const mocks = vi.hoisted(() => ({
  requireDirectorSession: vi.fn(),
  listDirectorCommissions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/director-money", () => ({ commissionGestureAction: vi.fn(), commissionNoteAction: vi.fn() }));
vi.mock("@/server/auth/director-session", () => ({ requireDirectorSession: mocks.requireDirectorSession }));
vi.mock("@/server/services/sales/director-money", () => ({ listDirectorCommissions: mocks.listDirectorCommissions }));

const page = await import("../page");

type Params = Record<string, string | string[] | undefined>;
const render = async (params: Params = {}) => renderToStaticMarkup(await page.default({ searchParams: Promise.resolve(params) }));

const ZERO = { count: 0, cents: 0 };
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "com_1",
  amountCents: 25_000,
  status: "EARNED",
  createdAt: new Date("2026-10-02T09:00:00Z"),
  dueAt: null,
  paidAt: null,
  note: null,
  prospect: { id: "pro_1", name: "Pharmacie du Parc", city: "Lyon" },
  rep: { id: "rep_1", name: "Marie Dupont" },
  invoice: null,
  ...overrides,
});
const result = (overrides: Record<string, unknown> = {}) => ({
  rows: [row()],
  byStatus: { FORECAST: ZERO, EARNED: { count: 1, cents: 25_000 }, PAYABLE: ZERO, PAID: ZERO, CANCELLED: ZERO },
  byRep: [{ salesRepId: "rep_1", name: "Marie Dupont", count: 1, earnedCents: 25_000, payableCents: 0, paidCents: 0, totalCents: 25_000 }],
  reps: [{ id: "rep_1", name: "Marie Dupont", isActive: true }],
  filteredTotal: 1,
  page: 1,
  pageCount: 1,
  pageSize: 50,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireDirectorSession.mockResolvedValue({ director: { id: "dir_1" } });
  mocks.listDirectorCommissions.mockResolvedValue(result());
});

describe("l'accès", () => {
  it("sans session de directeur, la page s'arrête avant de lire quoi que ce soit", async () => {
    const redirected = new Error("NEXT_REDIRECT /directeur/connexion");
    mocks.requireDirectorSession.mockRejectedValue(redirected);
    await expect(render()).rejects.toBe(redirected);
    expect(mocks.listDirectorCommissions).not.toHaveBeenCalled();
  });
});

describe("les filtres de l'adresse", () => {
  it("part au service tels quels quand ils sont valides", async () => {
    await render({ commercial: "rep_1", statut: "EARNED", mois: "2026-10", page: "2" });
    expect(mocks.listDirectorCommissions).toHaveBeenCalledWith({ salesRepId: "rep_1", status: "EARNED", month: "2026-10", page: 2 });
  });

  it("ignore un statut ou un mois inventé, et une page illisible", async () => {
    await render({ statut: "HACK", mois: "2026-13", page: "abc" });
    expect(mocks.listDirectorCommissions).toHaveBeenCalledWith({ salesRepId: null, status: null, month: null, page: 1 });
  });
});

describe("ce qui s'affiche", () => {
  it("les totaux par statut, chaque total menant au filtre correspondant", async () => {
    const html = await render();
    expect(html).toContain("Prévisionnelles");
    expect(html).toContain("Acquises");
    expect(html).toContain("À payer");
    expect(html).toContain("Payées");
    expect(html).toContain("Annulées");
    expect(html).toMatch(/250,00\s€/);
    expect(html).toContain('href="/directeur/commissions?statut=EARNED"');
  });

  it("une commission : officine, ville, commercial, montant, et les gestes de son statut", async () => {
    const html = await render();
    expect(html).toContain("Pharmacie du Parc");
    expect(html).toContain("Lyon");
    expect(html).toContain("Marie Dupont");
    expect(html).toMatch(/>Valider</);
    expect(html).toMatch(/>Annuler</);
    expect(html).not.toContain("Marquer payée");
    expect(html).toContain("Par commercial");
  });

  it("à payer : « Marquer payée » à la place de « Valider »", async () => {
    mocks.listDirectorCommissions.mockResolvedValue(result({ rows: [row({ status: "PAYABLE" })] }));
    const html = await render();
    expect(html).toContain("Marquer payée");
    expect(html).not.toMatch(/>Valider</);
  });

  it("payée ou annulée : aucun geste de statut, seulement la note", async () => {
    mocks.listDirectorCommissions.mockResolvedValue(result({ rows: [row({ status: "PAID", paidAt: new Date("2026-10-04T10:00:00Z") }), row({ id: "com_2", status: "CANCELLED" })] }));
    const html = await render();
    expect(html).not.toContain("Marquer payée");
    expect(html).not.toMatch(/>Valider</);
    expect(html).not.toMatch(/>Annuler</);
    expect(html).toContain("Modifier la note de la commission Pharmacie du Parc");
  });

  it("une commission réclamée par une facture se règle par la facture : aucun geste, le lien vers la facture", async () => {
    mocks.listDirectorCommissions.mockResolvedValue(result({ rows: [row({ invoice: { id: "inv_1", number: "FA-014", status: "RECEIVED" } })] }));
    const html = await render();
    expect(html).toContain('href="/directeur/factures/inv_1"');
    expect(html).toContain("FA-014");
    expect(html).not.toMatch(/>Valider</);
    expect(html).not.toMatch(/>Annuler</);
  });

  it("filtrée sur un commercial : pas de tableau « par commercial », un retour vers toute l'équipe", async () => {
    const html = await render({ commercial: "rep_1" });
    expect(html).not.toContain("Par commercial");
    expect(html).toContain("voir toute l&#x27;équipe");
  });
});

describe("les états vides", () => {
  const empty = result({ rows: [], byRep: [], filteredTotal: 0, byStatus: { FORECAST: ZERO, EARNED: ZERO, PAYABLE: ZERO, PAID: ZERO, CANCELLED: ZERO } });

  it("aucune commission du tout : on le dit, sans rien inventer", async () => {
    mocks.listDirectorCommissions.mockResolvedValue(empty);
    const html = await render();
    expect(html).toContain("Aucune commission pour l&#x27;instant");
    expect(html).not.toContain("Marie Dupont</a>");
    expect(html).not.toContain("Par commercial");
  });

  it("aucune commission pour ces filtres : on propose de tout revoir", async () => {
    mocks.listDirectorCommissions.mockResolvedValue(empty);
    const html = await render({ statut: "PAID" });
    expect(html).toContain("Aucune commission ne correspond");
    expect(html).toContain('href="/directeur/commissions"');
  });
});
