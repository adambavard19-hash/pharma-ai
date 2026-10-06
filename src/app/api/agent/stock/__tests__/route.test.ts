import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ce que le petit facteur du serveur (ou un poste de caisse) envoie passe par
 * le moteur des dépôts. La réponse faite à l'agent ne change pas ; seul un
 * fichier en attente de l'équipe ajoute `held`. Base, moteur et suite
 * différée sont simulés.
 */

const mocks = vi.hoisted(() => ({
  authenticateAgent: vi.fn(),
  receive: vi.fn(),
  continueAfter: vi.fn(),
  after: vi.fn(),
  connectionUpdate: vi.fn(),
  postUpdate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mocks.after };
});
vi.mock("@/server/db/client", () => ({ prisma: { stockConnection: { update: mocks.connectionUpdate }, counterPost: { update: mocks.postUpdate } } }));
vi.mock("@/server/services/stock-sync", () => ({ AGENT_FILE_MAX_BYTES: 25 * 1024 * 1024, authenticateAgent: mocks.authenticateAgent }));
vi.mock("@/server/services/stock-deposits", () => ({ receiveStockDeposit: mocks.receive, continueAfterStockDeposit: mocks.continueAfter }));

const route = await import("../route");

const SERVER = { connectionId: "conn_1", postId: null, scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "u_owner" }, pharmacyIsDemo: false };
const POST = { ...SERVER, connectionId: null, postId: "post_1" };

const view = (extra: Record<string, unknown> = {}) => ({
  id: "dep_1",
  pharmacyId: "ph_1",
  fileName: "stock.csv",
  fileSize: 100,
  status: "APPLIED",
  source: "AGENT",
  lines: 4235,
  created: 12,
  updated: 4223,
  invalid: 3,
  zeroed: 30,
  knownLines: 4200,
  message: null,
  receivedAt: new Date(),
  appliedAt: new Date(),
  decidedAt: null,
  hasFile: true,
  stalled: false,
  ...extra,
});

function request(options: { auth?: string | null; file?: File | null } = {}) {
  const { auth = "Bearer cle-de-l-agent-0123456789", file = new File(["cip;qte\n1;2"], "stock.csv") } = options;
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost/api/agent/stock", { method: "POST", headers: auth ? { authorization: auth } : {}, body: form });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.authenticateAgent.mockResolvedValue(SERVER);
  mocks.receive.mockResolvedValue({ ok: true, deposit: view(), duplicate: false });
  mocks.connectionUpdate.mockResolvedValue({});
  mocks.postUpdate.mockResolvedValue({});
});

describe("POST /api/agent/stock : l'accès", () => {
  it("clé inconnue ou révoquée : 401, rien n'est lu", async () => {
    mocks.authenticateAgent.mockResolvedValue(null);
    const response = await route.POST(request({ auth: "Bearer faux" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Clé d'agent inconnue ou révoquée." });
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("aucun fichier : 400 ; trop volumineux : 413", async () => {
    expect((await route.POST(request({ file: null }))).status).toBe(400);
    expect((await route.POST(request({ file: new File([], "stock.csv") }))).status).toBe(400);
    // Un fichier de 26 Mo sans l'allouer : seule sa taille annoncée compte ici.
    const huge = new File(["x"], "stock.csv");
    Object.defineProperty(huge, "size", { value: 26 * 1024 * 1024 });
    const form = { get: () => huge };
    const spy = vi.spyOn(Request.prototype, "formData").mockResolvedValueOnce(form as unknown as FormData);
    const response = await route.POST(request());
    spy.mockRestore();
    expect(response.status).toBe(413);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
});

describe("POST /api/agent/stock : le mémo du dossier d'export n'est pas un stock", () => {
  const MEMO = { ok: true, lines: 0, created: 0, updated: 0, invalid: 0, ignored: true };

  it("LISEZMOI.txt : 200 « ignoré », aucun dépôt, aucune notification, rien d'écrit sur la liaison — l'agent le mémorise et ne le renvoie plus", async () => {
    const response = await route.POST(request({ file: new File(["Dossier PharmaBoost : déposez ici l'édition de votre stock."], "LISEZMOI.txt") }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(MEMO);
    expect(mocks.receive).not.toHaveBeenCalled();
    expect(mocks.connectionUpdate).not.toHaveBeenCalled();
    expect(mocks.postUpdate).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("quelle que soit la casse, l'extension ou le chemin envoyé par un poste Windows", async () => {
    for (const name of ["lisezmoi.txt", "LisezMoi.TXT", "LISEZMOI.md", "LISEZMOI", "C:\\PharmaBoost\\Export\\LISEZMOI.txt", "/srv/export/LISEZMOI.txt"]) {
      const response = await route.POST(request({ file: new File(["x"], name) }));
      expect(await response.json(), name).toEqual(MEMO);
    }
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("un poste de caisse qui l'envoie : de même, son suivi n'est pas touché", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST);
    expect(await (await route.POST(request({ file: new File(["x"], "LISEZMOI.txt") }))).json()).toEqual(MEMO);
    expect(mocks.postUpdate).not.toHaveBeenCalled();
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("un vrai export dont le nom contient « lisezmoi » ailleurs qu'au début reste un stock", async () => {
    await route.POST(request({ file: new File(["cip;qte\n1;2"], "export-lisezmoi.csv") }));
    expect(mocks.receive).toHaveBeenCalledTimes(1);
  });

  it("sans clé d'agent valable, même le mémo reçoit 401", async () => {
    mocks.authenticateAgent.mockResolvedValue(null);
    expect((await route.POST(request({ auth: "Bearer faux", file: new File(["x"], "LISEZMOI.txt") }))).status).toBe(401);
  });
});

describe("POST /api/agent/stock : l'export appliqué", () => {
  it("passe par le moteur des dépôts, au nom de l'officine de la clé, source « AGENT »", async () => {
    await route.POST(request());
    expect(mocks.receive).toHaveBeenCalledTimes(1);
    const call = mocks.receive.mock.calls[0][0];
    expect(call).toMatchObject({ scope: SERVER.scope, pharmacyIsDemo: false, fileName: "stock.csv", source: "AGENT" });
    expect(new TextDecoder().decode(call.bytes)).toBe("cip;qte\n1;2");
  });

  it("réponse inchangée pour l'agent : { ok, lines, created, updated, invalid }", async () => {
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, lines: 4235, created: 12, updated: 4223, invalid: 3 });
  });

  it("la liaison du serveur garde la date, le nombre de lignes et efface l'erreur d'avant", async () => {
    await route.POST(request());
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({
      where: { id: "conn_1" },
      data: { lastSeenAt: expect.any(Date), lastSyncAt: expect.any(Date), lastSyncLines: 4235, lastError: null, status: "CONNECTED" },
    });
    expect(mocks.postUpdate).not.toHaveBeenCalled();
  });

  it("un poste de caisse qui envoie l'export garde son suivi", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST);
    await route.POST(request());
    expect(mocks.postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { lastExportError: null, lastExportAt: expect.any(Date) } });
    expect(mocks.connectionUpdate).not.toHaveBeenCalled();
  });

  it("les produits nouveaux sont compris après la réponse", async () => {
    await route.POST(request());
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.continueAfter).toHaveBeenCalledWith(SERVER.scope);
  });

  it("un double envoi ne relance rien après la réponse", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view(), duplicate: true });
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("un doublon d'un dépôt encore en lecture (aucune ligne connue) n'écrit ni date de synchronisation ni « 0 ligne » sur la liaison", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ status: "RECEIVED", lines: null, created: null, updated: null, invalid: null, appliedAt: null }), duplicate: true });
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    const { data } = mocks.connectionUpdate.mock.calls[0][0];
    expect(data).toEqual({ lastSeenAt: expect.any(Date), lastError: null, status: "CONNECTED" });
    expect(data).not.toHaveProperty("lastSyncAt");
    expect(data).not.toHaveProperty("lastSyncLines");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("de même pour un poste de caisse : pas de date d'export pour un doublon sans résultat", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST);
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ status: "RECEIVED", lines: null, appliedAt: null }), duplicate: true });
    await route.POST(request());
    expect(mocks.postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { lastExportError: null } });
  });

  it("un doublon d'un dépôt déjà appliqué, lui, garde sa date et son nombre de lignes", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view(), duplicate: true });
    await route.POST(request());
    expect(mocks.connectionUpdate.mock.calls[0][0].data).toMatchObject({ lastSyncAt: expect.any(Date), lastSyncLines: 4235 });
  });
});

describe("POST /api/agent/stock : le fichier retenu par le garde-fou", () => {
  beforeEach(() => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ status: "HELD", lines: 120, created: null, updated: null, invalid: 3, appliedAt: null }), duplicate: false });
  });

  it("200 avec held: true — l'agent ne le reçoit pas comme une erreur", async () => {
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, held: true, lines: 120, created: 0, updated: 0, invalid: 0 });
  });

  it("l'erreur d'avant est effacée (l'équipe tranche), mais le stock n'est pas daté : il n'a pas bougé", async () => {
    await route.POST(request());
    const { data } = mocks.connectionUpdate.mock.calls[0][0];
    expect(data).toEqual({ lastSeenAt: expect.any(Date), lastError: null, status: "CONNECTED" });
    expect(data).not.toHaveProperty("lastSyncAt");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("un poste de caisse : l'erreur est effacée, pas de date d'export", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST);
    await route.POST(request());
    expect(mocks.postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { lastExportError: null } });
  });
});

describe("POST /api/agent/stock : ce qui échoue", () => {
  it("fichier illisible : 422 avec l'erreur, visible sur la liaison", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ status: "FAILED", message: "Colonnes non reconnues : Quantité." }), duplicate: false });
    const response = await route.POST(request());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ ok: false, error: "Colonnes non reconnues : Quantité." });
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({ where: { id: "conn_1" }, data: { lastError: "Colonnes non reconnues : Quantité.", status: "ERROR" } });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("fichier refusé par le moteur (format, limite, stockage) : 422 aussi", async () => {
    mocks.receive.mockResolvedValue({ ok: false, error: "Le stockage des fichiers est indisponible pour l'instant." });
    const response = await route.POST(request());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ ok: false, error: "Le stockage des fichiers est indisponible pour l'instant." });
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({ where: { id: "conn_1" }, data: { lastError: "Le stockage des fichiers est indisponible pour l'instant.", status: "ERROR" } });
  });

  it("l'erreur d'un poste de caisse s'écrit sur le poste, pas sur la liaison", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST);
    mocks.receive.mockResolvedValue({ ok: false, error: "Le fichier est vide." });
    await route.POST(request());
    expect(mocks.postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { lastExportError: "Le fichier est vide." } });
    expect(mocks.connectionUpdate).not.toHaveBeenCalled();
  });

  it("une exception du moteur reste une réponse 422 pour l'agent, avec un message fixe : le détail technique reste dans les journaux", async () => {
    const technical = "Invalid `prisma.stockDeposit.findFirst()` invocation: Can't reach database server at `ep-cool-sun-123.us-east-1.aws.neon.tech:5432`";
    mocks.receive.mockRejectedValue(new Error(technical));
    const response = await route.POST(request());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ ok: false, error: "Synchronisation impossible : réessayez dans quelques minutes." });
    // Ce que le titulaire lit sur sa page Connexion : pas l'hôte de la base.
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({ where: { id: "conn_1" }, data: { lastError: "Synchronisation impossible : réessayez dans quelques minutes.", status: "ERROR" } });
    expect(JSON.stringify([mocks.connectionUpdate.mock.calls, response.status])).not.toContain("neon.tech");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("neon.tech"));
  });

  it("l'exception d'un poste de caisse : même message fixe, écrit sur le poste", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST);
    mocks.receive.mockRejectedValue(new Error("Can't reach database server at ep-xyz"));
    const response = await route.POST(request());
    expect(await response.json()).toEqual({ ok: false, error: "Synchronisation impossible : réessayez dans quelques minutes." });
    expect(mocks.postUpdate).toHaveBeenCalledWith({ where: { id: "post_1" }, data: { lastExportError: "Synchronisation impossible : réessayez dans quelques minutes." } });
  });

  it("un échec sans message : le même message fixe", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ status: "FAILED", message: null }), duplicate: false });
    const response = await route.POST(request());
    expect(await response.json()).toEqual({ ok: false, error: "Synchronisation impossible : réessayez dans quelques minutes." });
  });

  it("un export déjà refusé et renvoyé par l'agent (doublon en échec) : 422 avec le message d'origine, l'agent reste informé", async () => {
    mocks.receive.mockResolvedValue({ ok: true, deposit: view({ status: "FAILED", message: "Colonnes non reconnues : Quantité." }), duplicate: true });
    const response = await route.POST(request());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ ok: false, error: "Colonnes non reconnues : Quantité." });
    expect(mocks.connectionUpdate).toHaveBeenCalledWith({ where: { id: "conn_1" }, data: { lastError: "Colonnes non reconnues : Quantité.", status: "ERROR" } });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
