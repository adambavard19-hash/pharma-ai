import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * « Mes associations » ouvert à l'équipe (consigne du fondateur du 13 oct. 2026) : la page se lit avec ASSOCIATIONS_VIEW,
 * toute écriture (création, phrase, suspension, suppression) et les recherches qui la servent exigent ASSOCIATIONS_MANAGE
 * — une permission à part, qui n'ouvre pas les règles de conseil de l'officine.
 */

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), getSession: vi.fn(), listAssociations: vi.fn(), service: { createAssociationGrid: vi.fn(), updateAssociation: vi.fn(), deleteAssociation: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission, getSession: mocks.getSession }));
vi.mock("@/server/services/product-associations", () => ({ listAssociations: mocks.listAssociations, ...mocks.service }));
vi.mock("@/server/services/stock-search", () => ({ searchAssociationTriggers: vi.fn(), searchAssociationAdvice: vi.fn() }));
vi.mock("@/server/services/drug-identification", () => ({ searchSpecialties: vi.fn(async () => []) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const page = await import("../page");
const actions = await import("@/server/actions/associations");
const routes = [await import("@/app/api/associations/declencheurs/route"), await import("@/app/api/associations/conseils/route"), await import("@/app/api/medicaments/specialites/route")];

const scope = { pharmacyId: "ph_a", organizationId: "org_1", userId: "user_a" };
const ROW = {
  id: "as_1",
  trigger: { kind: "PRODUCT", id: "p1", name: "Spray nasal", brand: null, quantity: 3, deleted: false },
  advice: { kind: "PRODUCT", id: "p2", name: "Olioseptil Bronche", brand: null, quantity: 5, deleted: false },
  sentence: "À prendre le soir",
  isActive: true,
  createdBy: "Titulaire",
  createdAt: new Date("2026-10-10T08:00:00Z"),
};
const render = async () => renderToStaticMarkup((await page.default()) as React.ReactElement);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAssociations.mockResolvedValue([ROW]);
});

describe("la page", () => {
  it("s'ouvre avec ASSOCIATIONS_VIEW (toute l'équipe), avant toute lecture", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("NEXT_FORBIDDEN"));
    await expect(render()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(mocks.requirePermission).toHaveBeenCalledWith("associations:view");
    expect(mocks.listAssociations).not.toHaveBeenCalled();
  });

  it("qui peut écrire (titulaire, pharmacien, préparateur) a le formulaire, la suppression et la phrase", async () => {
    mocks.requirePermission.mockResolvedValue({ scope, permissions: new Set(["associations:view", "associations:manage"]) });
    const html = await render();
    expect(mocks.listAssociations).toHaveBeenCalledWith(scope);
    expect(html).toContain("Olioseptil Bronche");
    expect(html).toContain("Supprimer l&#x27;association");
    expect(html).toContain("Créer une association");
    expect(html).not.toContain("Lecture seule");
  });

  it("qui ne peut que lire (étudiant, consultation) voit les associations, sans aucun bouton d'écriture", async () => {
    mocks.requirePermission.mockResolvedValue({ scope, permissions: new Set(["associations:view"]) });
    const html = await render();
    expect(html).toContain("Olioseptil Bronche");
    expect(html).toContain("Lecture seule");
    expect(html).not.toContain("Supprimer l&#x27;association");
    expect(html).not.toContain("Créer une association");
    expect(html).not.toContain("Modifier");
  });
});

describe("les actions et les recherches", () => {
  it("créer, modifier, supprimer exigent ASSOCIATIONS_MANAGE, et rien n'est écrit sans", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("NEXT_FORBIDDEN"));
    await expect(actions.createAssociationsAction({ triggers: [{ kind: "PRODUCT", id: "p1" }], advice: [{ kind: "PRODUCT", id: "p2" }] })).rejects.toThrow("NEXT_FORBIDDEN");
    await expect(actions.updateAssociationAction({ associationId: "as_1", isActive: false })).rejects.toThrow("NEXT_FORBIDDEN");
    await expect(actions.deleteAssociationAction("as_1")).rejects.toThrow("NEXT_FORBIDDEN");
    expect(mocks.requirePermission.mock.calls.map((call) => call[0])).toEqual(["associations:manage", "associations:manage", "associations:manage"]);
    expect(mocks.service.createAssociationGrid).not.toHaveBeenCalled();
    expect(mocks.service.updateAssociation).not.toHaveBeenCalled();
    expect(mocks.service.deleteAssociation).not.toHaveBeenCalled();
  });

  it("les trois recherches de l'écran refusent qui ne peut que lire (403), et ne refusent pas qui peut écrire", async () => {
    mocks.getSession.mockResolvedValue({ scope, permissions: new Set(["associations:view", "recommendation:rules:manage"]) });
    for (const route of routes) expect((await route.GET(new Request("http://x/?q="))).status).toBe(403);
    mocks.getSession.mockResolvedValue({ scope, permissions: new Set(["associations:view", "associations:manage"]) });
    for (const route of routes) expect((await route.GET(new Request("http://x/?q="))).status).not.toBe(403);
  });
});
