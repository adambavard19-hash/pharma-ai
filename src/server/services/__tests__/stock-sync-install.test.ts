import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ce que le service de liaison ajoute pour l'installation en une ligne :
 * lire un code sans le consommer, trouver le serveur d'un poste, nommer
 * l'administrateur dans l'audit, et résumer l'installation d'une officine.
 * Prisma est simulé ; les empreintes (SHA-256) sont les vraies.
 */

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

const db = vi.hoisted(() => ({
  stockConnection: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  counterPost: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  pharmacy: { findUnique: vi.fn() },
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const notifications = vi.hoisted(() => ({ createNotification: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/audit/log", () => ({ recordAudit: audit.recordAudit }));
vi.mock("../notifications", () => ({ createNotification: notifications.createNotification }));
vi.mock("../stock-import", () => ({ analyseStockImport: vi.fn(), commitStockImport: vi.fn() }));

const service = await import("../stock-sync");

const NOW = new Date("2026-10-06T09:00:00.000Z");
const FUTURE = new Date("2026-10-06T10:00:00.000Z");
const PAST = new Date("2026-10-06T08:00:00.000Z");
const SCOPE = { pharmacyId: "ph_1", organizationId: "org_1", userId: "usr_owner" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ now: NOW });
  db.counterPost.create.mockResolvedValue({ id: "post_1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("peekServerPairing : un code se lit sans se consommer", () => {
  it("un code valable rend seulement le logiciel, et cherche par empreinte, jamais en clair", async () => {
    db.stockConnection.findUnique.mockResolvedValue({ lgo: "lgpi", pairingExpiresAt: FUTURE });
    expect(await service.peekServerPairing("123456")).toEqual({ lgo: "lgpi" });
    expect(db.stockConnection.findUnique).toHaveBeenCalledWith({ where: { pairingCodeHash: sha("123456") }, select: { lgo: true, pairingExpiresAt: true } });
  });

  it("ne consomme rien : aucune écriture", async () => {
    db.stockConnection.findUnique.mockResolvedValue({ lgo: "lgpi", pairingExpiresAt: FUTURE });
    await service.peekServerPairing("123456");
    expect(db.stockConnection.update).not.toHaveBeenCalled();
    expect(db.stockConnection.upsert).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it("expiré, inconnu ou déjà utilisé : null", async () => {
    db.stockConnection.findUnique.mockResolvedValueOnce({ lgo: "lgpi", pairingExpiresAt: PAST });
    expect(await service.peekServerPairing("123456")).toBeNull();
    db.stockConnection.findUnique.mockResolvedValueOnce(null);
    expect(await service.peekServerPairing("123456")).toBeNull();
    db.stockConnection.findUnique.mockResolvedValueOnce({ lgo: "lgpi", pairingExpiresAt: null });
    expect(await service.peekServerPairing("123456")).toBeNull();
  });

  it("ce qui n'a pas la forme d'un code n'atteint même pas la base", async () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 456", "123456; DROP"]) expect(await service.peekServerPairing(bad)).toBeNull();
    expect(db.stockConnection.findUnique).not.toHaveBeenCalled();
  });

  it("un logiciel inconnu de la liste devient « Autre logiciel »", async () => {
    db.stockConnection.findUnique.mockResolvedValue({ lgo: "logiciel-disparu", pairingExpiresAt: FUTURE });
    expect(await service.peekServerPairing("123456")).toEqual({ lgo: "autre" });
  });
});

describe("peekPostInstallLink : le serveur relié de l'officine", () => {
  const TOKEN = "AbCdEfGhIjKlMnOpQrSt";
  const post = (overrides: Record<string, unknown> = {}) => ({ label: "Comptoir 1", pharmacyId: "ph_1", pairingExpiresAt: FUTURE, pharmacy: { name: "Pharmacie du Port" }, ...overrides });

  it("rend le nom de machine du serveur relié", async () => {
    db.counterPost.findUnique.mockResolvedValue(post());
    db.stockConnection.findUnique.mockResolvedValue({ hostname: "SRV-PHARMA", pairedAt: PAST });
    expect(await service.peekPostInstallLink(TOKEN)).toEqual({ pharmacyName: "Pharmacie du Port", label: "Comptoir 1", serverHostname: "SRV-PHARMA" });
    expect(db.stockConnection.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph_1" } }));
  });

  it("serveur pas encore relié, ou pas de liaison du tout : pas de nom de machine", async () => {
    db.counterPost.findUnique.mockResolvedValue(post());
    db.stockConnection.findUnique.mockResolvedValueOnce({ hostname: null, pairedAt: null });
    expect((await service.peekPostInstallLink(TOKEN))?.serverHostname).toBeNull();
    db.stockConnection.findUnique.mockResolvedValueOnce(null);
    expect((await service.peekPostInstallLink(TOKEN))?.serverHostname).toBeNull();
  });

  it("un nom de machine douteux (envoyé par l'agent) n'est jamais rendu", async () => {
    db.counterPost.findUnique.mockResolvedValue(post());
    db.stockConnection.findUnique.mockResolvedValue({ hostname: "SRV; Remove-Item C:\\", pairedAt: PAST });
    expect((await service.peekPostInstallLink(TOKEN))?.serverHostname).toBeNull();
  });

  it("lien expiré, inconnu ou mal formé : null, et le serveur n'est pas interrogé", async () => {
    db.counterPost.findUnique.mockResolvedValueOnce(post({ pairingExpiresAt: PAST }));
    expect(await service.peekPostInstallLink(TOKEN)).toBeNull();
    db.counterPost.findUnique.mockResolvedValueOnce(null);
    expect(await service.peekPostInstallLink(TOKEN)).toBeNull();
    expect(await service.peekPostInstallLink("court")).toBeNull();
    expect(db.stockConnection.findUnique).not.toHaveBeenCalled();
  });
});

describe("resolveInstallTarget : l'officine de la console", () => {
  const pharmacy = (overrides: Record<string, unknown> = {}) => ({
    id: "ph_1", name: "Pharmacie du Port", organizationId: "org_1", isActive: true,
    memberships: [{ userId: "usr_owner" }], stockConnection: { lgo: "lgpi" }, ...overrides,
  });

  it("rend la portée du titulaire actif et le logiciel connu", async () => {
    db.pharmacy.findUnique.mockResolvedValue(pharmacy());
    expect(await service.resolveInstallTarget("ph_1")).toEqual({ ok: true, scope: SCOPE, pharmacyName: "Pharmacie du Port", lgo: "lgpi" });
    // Seul le titulaire actif compte, et la lecture se borne à cette officine.
    expect(db.pharmacy.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ph_1" } }));
    const select = db.pharmacy.findUnique.mock.calls[0][0].select;
    expect(select.memberships.where).toEqual({ role: "OWNER", isActive: true });
  });

  it("introuvable, suspendue, sans titulaire actif : un motif précis", async () => {
    db.pharmacy.findUnique.mockResolvedValueOnce(null);
    expect(await service.resolveInstallTarget("x")).toEqual({ ok: false, reason: "NOT_FOUND" });
    db.pharmacy.findUnique.mockResolvedValueOnce(pharmacy({ isActive: false }));
    expect(await service.resolveInstallTarget("ph_1")).toEqual({ ok: false, reason: "SUSPENDED" });
    db.pharmacy.findUnique.mockResolvedValueOnce(pharmacy({ memberships: [] }));
    expect(await service.resolveInstallTarget("ph_1")).toEqual({ ok: false, reason: "NO_OWNER" });
  });

  it("sans liaison, ou avec un logiciel inconnu : lgo null", async () => {
    db.pharmacy.findUnique.mockResolvedValueOnce(pharmacy({ stockConnection: null }));
    expect(await service.resolveInstallTarget("ph_1")).toMatchObject({ ok: true, lgo: null });
    db.pharmacy.findUnique.mockResolvedValueOnce(pharmacy({ stockConnection: { lgo: "disparu" } }));
    expect(await service.resolveInstallTarget("ph_1")).toMatchObject({ ok: true, lgo: null });
  });
});

describe("l'audit nomme celui qui a émis le code, jamais le code", () => {
  it("par la console : l'administrateur, pas le titulaire", async () => {
    const pairing = await service.createPairing(SCOPE, "lgpi", { platformAdminId: "adm_1" });
    expect(pairing.code).toMatch(/^\d{6}$/);
    const call = audit.recordAudit.mock.calls[0][0];
    expect(call).toMatchObject({ action: "stock.connection_pairing_issued", pharmacyId: "ph_1", platformAdminId: "adm_1", userId: null, metadata: { lgo: "lgpi", by: "console" } });
    expect(JSON.stringify(call)).not.toContain(pairing.code);
    // Seule l'empreinte est gardée.
    expect(db.stockConnection.upsert.mock.calls[0][0].create.pairingCodeHash).toBe(sha(pairing.code));
  });

  it("par le titulaire, comme avant : son identifiant, pas d'administrateur", async () => {
    await service.createPairing(SCOPE, "lgpi");
    const call = audit.recordAudit.mock.calls[0][0];
    expect(call.userId).toBe("usr_owner");
    expect(call.platformAdminId).toBeUndefined();
    expect(call.metadata).toEqual({ lgo: "lgpi" });
  });

  it("le lien d'un poste : même règle, et le jeton n'est écrit nulle part", async () => {
    const link = await service.createPostInstallLink(SCOPE, "Comptoir 1", { platformAdminId: "adm_1" });
    const call = audit.recordAudit.mock.calls[0][0];
    expect(call).toMatchObject({ action: "stock.post_pairing_created", platformAdminId: "adm_1", userId: null, metadata: { label: "Comptoir 1", kind: "install-link", by: "console" } });
    expect(JSON.stringify(call)).not.toContain(link.token);
    expect(db.counterPost.create.mock.calls[0][0].data.pairingCodeHash).toBe(sha(link.token));
    expect(link.postId).toBe("post_1");

    await service.createPostInstallLink(SCOPE, null);
    expect(audit.recordAudit.mock.calls[1][0].userId).toBe("usr_owner");
  });
});

describe("pharmacyInstallState : l'état de l'installation", () => {
  it("serveur relié, postes, dernier stock : des états, jamais un code", async () => {
    db.stockConnection.findUnique.mockResolvedValue({ lgo: "lgpi", status: "CONNECTED", hostname: "SRV-PHARMA", pairedAt: PAST, lastSeenAt: NOW, pairingExpiresAt: null });
    db.counterPost.findMany.mockResolvedValue([
      { id: "p1", label: "Comptoir 1", hostname: "POSTE1", pairedAt: PAST, lastSeenAt: NOW, pairingExpiresAt: null },
      { id: "p2", label: "Comptoir 2", hostname: "", pairedAt: null, lastSeenAt: null, pairingExpiresAt: FUTURE },
      { id: "p3", label: null, hostname: "", pairedAt: null, lastSeenAt: null, pairingExpiresAt: PAST },
    ]);
    db.pharmacy.findUnique.mockResolvedValue({ stockSyncedAt: PAST });

    const state = await service.pharmacyInstallState("ph_1", NOW);

    expect(state.server).toEqual({ lgo: "lgpi", lgoLabel: "LGPI", hostname: "SRV-PHARMA", linked: true, pairedAt: PAST, lastSeenAt: NOW, codeValidUntil: null });
    expect(state.posts).toEqual([
      { id: "p1", label: "Comptoir 1", hostname: "POSTE1", linked: true, pairedAt: PAST, lastSeenAt: NOW, linkValidUntil: null },
      { id: "p2", label: "Comptoir 2", hostname: "", linked: false, pairedAt: null, lastSeenAt: null, linkValidUntil: FUTURE },
      { id: "p3", label: null, hostname: "", linked: false, pairedAt: null, lastSeenAt: null, linkValidUntil: null },
    ]);
    expect(state.stockSyncedAt).toEqual(PAST);
    // Postes retirés exclus, officine bornée : rien d'une autre officine.
    expect(db.counterPost.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph_1", revokedAt: null } }));
    expect(db.stockConnection.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph_1" } }));
    expect(JSON.stringify(state)).not.toMatch(/Hash/);
  });

  it("un code émis et pas encore utilisé : valable jusqu'à quand ; périmé, il n'est plus montré", async () => {
    db.counterPost.findMany.mockResolvedValue([]);
    db.pharmacy.findUnique.mockResolvedValue({ stockSyncedAt: null });
    db.stockConnection.findUnique.mockResolvedValueOnce({ lgo: "autre", status: "PENDING", hostname: null, pairedAt: null, lastSeenAt: null, pairingExpiresAt: FUTURE });
    expect((await service.pharmacyInstallState("ph_1", NOW)).server).toMatchObject({ linked: false, codeValidUntil: FUTURE });
    db.stockConnection.findUnique.mockResolvedValueOnce({ lgo: "autre", status: "PENDING", hostname: null, pairedAt: null, lastSeenAt: null, pairingExpiresAt: PAST });
    expect((await service.pharmacyInstallState("ph_1", NOW)).server).toMatchObject({ linked: false, codeValidUntil: null });
  });

  it("un serveur déconnecté n'est plus « relié », même s'il l'a été", async () => {
    db.counterPost.findMany.mockResolvedValue([]);
    db.pharmacy.findUnique.mockResolvedValue({ stockSyncedAt: null });
    db.stockConnection.findUnique.mockResolvedValue({ lgo: "lgpi", status: "DISCONNECTED", hostname: "SRV", pairedAt: PAST, lastSeenAt: PAST, pairingExpiresAt: null });
    expect((await service.pharmacyInstallState("ph_1", NOW)).server).toMatchObject({ linked: false, pairedAt: PAST });
  });

  it("officine sans liaison, sans poste, sans stock", async () => {
    db.stockConnection.findUnique.mockResolvedValue(null);
    db.counterPost.findMany.mockResolvedValue([]);
    db.pharmacy.findUnique.mockResolvedValue(null);
    expect(await service.pharmacyInstallState("ph_1", NOW)).toEqual({ server: null, posts: [], stockSyncedAt: null });
  });
});

describe("pairAgent : ce que lit le titulaire quand l'installation sous AnyDesk se termine", () => {
  const connection = (overrides: Record<string, unknown> = {}) => ({ id: "conn_1", pharmacyId: "ph_1", lgo: "lgpi", exportPath: null, scansPath: null, intervalSeconds: 300, pairingExpiresAt: FUTURE, pharmacy: { name: "Pharmacie du Port" }, ...overrides });

  it("le dossier est prêt : il lui reste à y enregistrer son édition, et la notification mène à « Mettre à jour mon stock »", async () => {
    db.stockConnection.findUnique.mockResolvedValue(connection());
    const result = await service.pairAgent({ code: "123456", hostname: "SRV-PHARMA", version: "0.4.0" });

    expect(result).toMatchObject({ ok: true, pharmacyName: "Pharmacie du Port", intervalSeconds: 300 });
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    const notification = notifications.createNotification.mock.calls[0][0];
    expect(notification).toMatchObject({
      pharmacyId: "ph_1",
      userId: null,
      type: "IMPORT_COMPLETED",
      severity: "SUCCESS",
      title: "Dossier PharmaBoost prêt",
      body: "Le dossier PharmaBoost est prêt sur votre serveur. Enregistrez-y l'édition de votre stock pour le mettre à jour.",
      linkUrl: "/stock/mise-a-jour",
    });
  });

  it("aucun jargon, et aucune promesse de synchronisation automatique : rien ne part tant que le titulaire n'a rien enregistré", async () => {
    db.stockConnection.findUnique.mockResolvedValue(connection({ lgo: "winpharma" }));
    await service.pairAgent({ code: "123456", hostname: "SRV-PHARMA" });
    const { title, body } = notifications.createNotification.mock.calls[0][0];
    expect(`${title} ${body}`).not.toMatch(/agent|appair|synchronis|automatique|connect\b/i);
    // Le titre ne dépend plus du logiciel ni du nom de la machine.
    expect(`${title} ${body}`).not.toMatch(/Winpharma|SRV-PHARMA/);
  });

  it("un code refusé (inconnu, expiré) ne notifie personne", async () => {
    db.stockConnection.findUnique.mockResolvedValueOnce(null);
    expect(await service.pairAgent({ code: "123456" })).toMatchObject({ ok: false });
    db.stockConnection.findUnique.mockResolvedValueOnce(connection({ pairingExpiresAt: PAST }));
    expect(await service.pairAgent({ code: "123456" })).toMatchObject({ ok: false });
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});
