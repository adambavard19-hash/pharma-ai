import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * « E-mails aux patients » (consigne du fondateur du 13 oct. 2026) : le titulaire voit toute l'officine, un collaborateur
 * les bilans de SES ventes seulement — jamais ceux des collègues.
 */

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), listPatientEmails: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/patient-emails", () => ({ listPatientEmails: mocks.listPatientEmails }));

const page = await import("../page");

const scope = { pharmacyId: "ph_a", organizationId: "org_1", userId: "user_lea" };
const OWNER = { scope, permissions: new Set(["patient-emails:view", "analytics:team-performance:view"]) };
const TEAM = { scope, permissions: new Set(["patient-emails:view"]) };
const render = async () => renderToStaticMarkup((await page.default({ searchParams: Promise.resolve({}) })) as React.ReactElement);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPatientEmails.mockResolvedValue({ rows: [], total: 0, truncated: false });
});

describe("E-mails aux patients", () => {
  it("s'ouvre avec la permission de voir les bilans (que l'équipe détient), avant toute lecture", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("NEXT_FORBIDDEN"));
    await expect(render()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(mocks.requirePermission).toHaveBeenCalledWith("patient-emails:view");
    expect(mocks.listPatientEmails).not.toHaveBeenCalled();
  });

  it("le titulaire voit toute l'officine : aucun filtre par personne", async () => {
    mocks.requirePermission.mockResolvedValue(OWNER);
    await render();
    expect(mocks.listPatientEmails.mock.calls[0][0]).toBe(scope);
    expect(mocks.listPatientEmails.mock.calls[0][1]).not.toHaveProperty("handledBy");
  });

  it("un collaborateur ne voit que ses propres ventes, et la page le dit", async () => {
    mocks.requirePermission.mockResolvedValue(TEAM);
    const html = await render();
    expect(mocks.listPatientEmails.mock.calls[0][1]).toMatchObject({ handledBy: "user_lea" });
    expect(html).toContain("Ceux de vos collègues n");
  });
});
