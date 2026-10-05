import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La page de fin de vente en mode sans patient : elle dit au poste de remise si
 * l'e-mail du plan propose l'abonnement aux nouveautés. Même règle que le lien
 * lui-même (`newsOptInUrlFor`) : fonction active, et jamais une officine de
 * démonstration. Le poste de remise est remplacé par un double qui note ses
 * propriétés.
 */

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  prescriptionFind: vi.fn(),
  sealedCount: vi.fn(),
  pharmacyFind: vi.fn(),
  patientDataEnabled: vi.fn(),
  workspaceProps: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/db/client", () => ({ prisma: { prescription: { findUnique: mocks.prescriptionFind }, sealedDocument: { count: mocks.sealedCount }, pharmacy: { findUnique: mocks.pharmacyFind } } }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/services/documents", () => ({ buildDocumentUrl: vi.fn() }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ info: { capability: "LIVE", label: "Messagerie", description: "" } }) }));
vi.mock("@/server/public-url", () => ({ resolvePublicBaseUrl: () => ({ reach: "PUBLIC" }) }));
vi.mock("@/config/env", () => ({ patientDataEnabled: mocks.patientDataEnabled }));
vi.mock("../document-workspace", () => ({ DocumentWorkspace: () => null }));
vi.mock("../follow-up-panel", () => ({ FollowUpPanel: () => null }));
vi.mock("../sealed-workspace", () => ({
  SealedWorkspace: (props: Record<string, unknown>) => {
    mocks.workspaceProps.push(props);
    return null;
  },
}));

const page = await import("../page");

const render = async () => renderToStaticMarkup((await page.default({ params: Promise.resolve({ id: "rx_1" }) })) as React.ReactElement);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspaceProps.length = 0;
  mocks.patientDataEnabled.mockReturnValue(false);
  mocks.requirePermission.mockResolvedValue({ scope: { pharmacyId: "ph_a" }, permissions: new Set(["document:send", "sale:create"]) });
  mocks.prescriptionFind.mockResolvedValue({ id: "rx_1", pharmacyId: "ph_a", reference: "ORD-1", patient: null, recommendations: [], lines: [], documents: [], sales: [] });
  mocks.sealedCount.mockResolvedValue(0);
  mocks.pharmacyFind.mockResolvedValue({ patientNewsEnabled: true, isDemo: false });
});

describe("le poste de remise sait si l'abonnement aux nouveautés est proposé", () => {
  it("proposé : la fonction est active sur une officine réelle", async () => {
    await render();
    expect(mocks.workspaceProps).toHaveLength(1);
    expect(mocks.workspaceProps[0].newsOptInOffered).toBe(true);
  });

  it("pas proposé quand le titulaire a coupé la fonction", async () => {
    mocks.pharmacyFind.mockResolvedValue({ patientNewsEnabled: false, isDemo: false });
    await render();
    expect(mocks.workspaceProps[0].newsOptInOffered).toBe(false);
  });

  it("pas proposé pour une officine de démonstration : le lien n'est pas dans le message, la mention ne doit pas le dire", async () => {
    mocks.pharmacyFind.mockResolvedValue({ patientNewsEnabled: true, isDemo: true });
    await render();
    expect(mocks.workspaceProps[0].newsOptInOffered).toBe(false);
  });

  it("pas proposé quand l'officine est introuvable : jamais une promesse sans certitude", async () => {
    mocks.pharmacyFind.mockResolvedValue(null);
    await render();
    expect(mocks.workspaceProps[0].newsOptInOffered).toBe(false);
  });

  it("lit l'officine de la SESSION, jamais celle de l'adresse", async () => {
    await render();
    expect(mocks.pharmacyFind).toHaveBeenCalledWith({ where: { id: "ph_a" }, select: { patientNewsEnabled: true, isDemo: true } });
  });

  it("une ordonnance d'une autre officine reste introuvable, avant toute lecture des réglages", async () => {
    mocks.prescriptionFind.mockResolvedValue({ id: "rx_1", pharmacyId: "ph_autre", reference: "ORD-1" });
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.pharmacyFind).not.toHaveBeenCalled();
  });
});
