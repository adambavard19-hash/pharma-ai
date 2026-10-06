import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La page « Mes commissions » de l'extranet, avec son bloc « Mes factures » en
 * lecture seule : le commercial de la session, et personne d'autre, numéro,
 * date, montant et statut, rien de plus.
 */

const mocks = vi.hoisted(() => ({ requireSalesSession: vi.fn(), listCommissionsFor: vi.fn(), listInvoicesFor: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/sales-session", () => ({ requireSalesSession: mocks.requireSalesSession }));
vi.mock("@/server/services/sales/commissions", () => ({ listCommissionsFor: mocks.listCommissionsFor, listInvoicesFor: mocks.listInvoicesFor }));

const page = await import("../page");

const render = async () => renderToStaticMarkup(await page.default());

const NO_COMMISSIONS = { rows: [], thisMonthCents: 0, earnedCents: 0, pendingCents: 0, paidCents: 0, yearCents: 0 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSalesSession.mockResolvedValue({ rep: { id: "rep_1", fullName: "Marie Dupont" } });
  mocks.listCommissionsFor.mockResolvedValue(NO_COMMISSIONS);
  mocks.listInvoicesFor.mockResolvedValue([]);
});

describe("Mes factures", () => {
  it("sans session de commercial, rien n'est lu", async () => {
    const redirected = new Error("NEXT_REDIRECT /extranet/connexion");
    mocks.requireSalesSession.mockRejectedValue(redirected);
    await expect(render()).rejects.toBe(redirected);
    expect(mocks.listInvoicesFor).not.toHaveBeenCalled();
    expect(mocks.listCommissionsFor).not.toHaveBeenCalled();
  });

  it("ne lit que les factures du commercial de la session", async () => {
    await render();
    expect(mocks.listInvoicesFor).toHaveBeenCalledWith("rep_1");
    expect(mocks.listCommissionsFor).toHaveBeenCalledWith("rep_1");
  });

  it("aucune facture : on le dit, sans rien inventer", async () => {
    const html = await render();
    expect(html).toContain("Mes factures");
    expect(html).toContain("Aucune facture enregistrée pour l&#x27;instant");
  });

  it("numéro, date, montant et statut de chaque facture, et rien d'autre", async () => {
    mocks.listInvoicesFor.mockResolvedValue([
      { id: "inv_1", number: "FA-014", issuedAt: new Date("2026-10-01T12:00:00Z"), amountCents: 75_000, status: "APPROVED" },
      { id: "inv_2", number: "FA-013", issuedAt: new Date("2026-09-02T12:00:00Z"), amountCents: 30_000, status: "PAID" },
      { id: "inv_3", number: "FA-012", issuedAt: new Date("2026-08-01T12:00:00Z"), amountCents: 10_000, status: "REJECTED" },
    ]);
    const html = await render();
    expect(html).toContain("FA-014");
    expect(html).toContain("01/10/2026");
    expect(html).toMatch(/750,00\s€/);
    expect(html).toContain("Validée");
    expect(html).toContain("Payée");
    expect(html).toContain("Refusée");
    // Pas de lien vers une fiche ni de fichier : le commercial lit, il ne touche à rien.
    expect(html).not.toContain("/directeur");
    expect(html).not.toContain("/api/");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });
});
