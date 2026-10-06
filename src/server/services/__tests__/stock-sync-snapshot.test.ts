import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `applyAgentSnapshot` : l'export de stock lu directement (sans le moteur des
 * dépôts). La route de l'agent n'y passe plus, mais la fonction reste exportée
 * et son comportement ne change pas : une piste incertaine devient un produit,
 * une erreur est visible sur la liaison, un poste de caisse garde son suivi.
 */

const mocks = vi.hoisted(() => ({
  analyse: vi.fn(),
  commit: vi.fn(),
  connectionUpdate: vi.fn(),
  postUpdate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { stockConnection: { update: mocks.connectionUpdate }, counterPost: { update: mocks.postUpdate } } }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("../notifications", () => ({ createNotification: vi.fn() }));
vi.mock("../stock-import", () => ({ analyseStockImport: mocks.analyse, commitStockImport: mocks.commit }));

const { applyAgentSnapshot } = await import("../stock-sync");

const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" };
const SERVER = { connectionId: "conn_1", postId: null, scope: SCOPE, pharmacyIsDemo: false, intervalSeconds: 300, exportPath: null, scansPath: null };
const POST = { ...SERVER, connectionId: null, postId: "post_1" };
const BYTES = new TextEncoder().encode("cip;qte\n1;2");

const preview = (extra: Record<string, unknown> = {}) => ({
  jobId: "job_1",
  missing: [],
  rows: [
    { line: 1, status: "MEDICAMENT" },
    { line: 2, status: "A_VERIFIER" },
    { line: 3, status: "NON_RECONNU" },
  ],
  summary: { detected: 3 },
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.analyse.mockResolvedValue(preview());
  mocks.commit.mockResolvedValue({ jobId: "job_1", drugsUpserted: 1, productsUpdated: 0, productsCreated: 2, ignored: 0, invalid: 0, zeroed: 0, classification: null });
  mocks.connectionUpdate.mockResolvedValue({});
  mocks.postUpdate.mockResolvedValue({});
});

describe("applyAgentSnapshot", () => {
  it("analyse puis écrit sans intervention : une piste incertaine devient un produit, le reste inconnu est créé", async () => {
    const result = await applyAgentSnapshot(SERVER, "stock.csv", BYTES);

    expect(result).toEqual({ ok: true, lines: 3, created: 2, updated: 1, invalid: 0 });
    expect(mocks.analyse).toHaveBeenCalledWith({ scope: SCOPE, fileName: "[agent] stock.csv", bytes: BYTES });
    expect(mocks.commit).toHaveBeenCalledWith({ scope: SCOPE, pharmacyIsDemo: false, jobId: "job_1", decisions: { "2": { kind: "CREER_PRODUIT" } }, createUnknownByDefault: true });
    // Ce chemin-là ne remet rien à zéro : c'est le moteur des dépôts qui le fait.
    expect(mocks.commit.mock.calls[0][0]).not.toHaveProperty("zeroAbsent");
  });

  it("la liaison du serveur garde la date et le nombre de lignes, et l'erreur d'avant s'efface", async () => {
    await applyAgentSnapshot(SERVER, "stock.csv", BYTES);
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({
      where: { id: "conn_1" },
      data: { lastSyncAt: expect.any(Date), lastSeenAt: expect.any(Date), lastSyncLines: 3, lastError: null, status: "CONNECTED" },
    });
  });

  it("un poste de caisse qui envoie l'export garde son suivi sur le poste, pas sur la liaison", async () => {
    await applyAgentSnapshot(POST, "stock.csv", BYTES);
    expect(mocks.postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { lastExportAt: expect.any(Date), lastExportError: null } });
    expect(mocks.connectionUpdate).not.toHaveBeenCalled();
  });

  it("colonnes non reconnues : refus, rien n'est écrit, l'erreur est visible sur la liaison", async () => {
    mocks.analyse.mockResolvedValue(preview({ missing: ["quantity"] }));
    const result = await applyAgentSnapshot(SERVER, "stock.csv", BYTES);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Colonnes non reconnues") });
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({ where: { id: "conn_1" }, data: { lastError: expect.stringContaining("Colonnes non reconnues"), status: "ERROR" } });
  });

  it("une exception devient un refus lisible, sur le poste quand c'est un poste", async () => {
    mocks.commit.mockRejectedValue(new Error("Ligne 4 : produit introuvable dans cette officine."));
    expect(await applyAgentSnapshot(POST, "stock.csv", BYTES)).toEqual({ ok: false, error: "Ligne 4 : produit introuvable dans cette officine." });
    expect(mocks.postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { lastExportError: "Ligne 4 : produit introuvable dans cette officine." } });
  });
});
