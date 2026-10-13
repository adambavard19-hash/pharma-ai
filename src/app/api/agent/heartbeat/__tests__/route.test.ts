import { beforeEach, describe, expect, it, vi } from "vitest";
import { personRobotLook } from "@/core/robot/counter-look";

/**
 * Le signe de vie d'un poste de caisse : s'il DESSINE le robot (l'île, la bannière), l'instant est noté — le navigateur
 * lié à ce poste n'en dessine pas un second ; sinon (ancienne fenêtre, notification seule, ancien agent) il est effacé.
 * Le robot renvoyé à la bannière est celui de la PERSONNE connectée à ce poste, à défaut celui de la marque. Le signe de
 * vie du serveur de stock, lui, ne change pas.
 */

const mocks = vi.hoisted(() => ({ authenticateAgent: vi.fn(), recordHeartbeat: vi.fn(), postUpdate: vi.fn(), connectionFind: vi.fn(), userFind: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/services/stock-sync", () => ({ authenticateAgent: mocks.authenticateAgent, recordHeartbeat: mocks.recordHeartbeat }));
vi.mock("@/server/db/client", () => ({ prisma: { user: { findUnique: mocks.userFind }, counterPost: { update: mocks.postUpdate }, stockConnection: { findUniqueOrThrow: mocks.connectionFind } } }));

const route = await import("../route");

const POST_AGENT = { connectionId: null, postId: "post_1", scope: { pharmacyId: "ph_port", organizationId: "org_1", userId: "u_1" }, pharmacyIsDemo: false, intervalSeconds: 300, exportPath: null, scansPath: null };
const SERVER_AGENT = { ...POST_AGENT, connectionId: "conn_1", postId: null };

const BODY = { version: "0.10.2", hostname: "POSTE5", notice: null, fenetre: "ile" };
const beat = (body: Record<string, unknown> = BODY) =>
  route.POST(new Request("http://localhost/api/agent/heartbeat", { method: "POST", headers: { authorization: "Bearer cle-du-poste-0123456789", "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.postUpdate.mockResolvedValue({ exportPath: null, syncRequestedAt: null, assignedUserId: "lea" });
  mocks.connectionFind.mockResolvedValue({ intervalSeconds: 300, exportPath: "D:\\export", scansPath: null });
  mocks.userFind.mockResolvedValue({ firstName: "Léa" });
});

describe("POST /api/agent/heartbeat — poste de caisse", () => {
  it("renvoie le PRÉNOM seul de la personne attribuée au poste (le bonjour du robot), jamais le nom de famille", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    const json = await (await beat()).json();
    expect(json.firstName).toBe("Léa");
    expect(mocks.userFind).toHaveBeenCalledWith({ where: { id: "lea" }, select: { firstName: true } });
    expect(JSON.stringify(json)).not.toMatch(/lastName/);
  });

  it("personne au poste, ou lecture du prénom en échec : prénom vide, le signe de vie passe", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    mocks.userFind.mockRejectedValueOnce(new Error("base lente"));
    const failed = await beat();
    expect(failed.status).toBe(200);
    expect((await failed.json()).firstName).toBe("");
    mocks.postUpdate.mockResolvedValue({ exportPath: null, syncRequestedAt: null, assignedUserId: null });
    expect((await (await beat()).json()).firstName).toBe("");
    expect(mocks.userFind).toHaveBeenCalledTimes(1);
  });

  it("poste dans l'île : note l'instant où il dessine le robot ; renvoie le robot de la personne connectée", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    const response = await beat();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, robotLook: personRobotLook("lea") });
    const { where, data, select } = mocks.postUpdate.mock.calls[0][0];
    expect(where).toEqual({ id: "post_1" });
    expect(data.robotShownAt).toBeInstanceOf(Date);
    expect(data.robotShownAt).toEqual(data.lastSeenAt);
    expect(data).toMatchObject({ version: "0.10.2", hostname: "POSTE5", lastExportError: null });
    expect(select).toMatchObject({ assignedUserId: true });
  });

  it("la bannière dessine aussi le robot", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    await beat({ ...BODY, fenetre: "banniere" });
    expect(mocks.postUpdate.mock.calls[0][0].data.robotShownAt).toBeInstanceOf(Date);
  });

  it("poste sans robot — ancienne fenêtre, notification seule, rien, ancien agent muet, valeur piégée : effacé (null), le signe de vie passe", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    const bodies = [{ ...BODY, fenetre: "classique" }, { ...BODY, fenetre: "notification" }, { ...BODY, fenetre: "aucune" }, { version: "0.10.1", hostname: "POSTE5", notice: null }, { ...BODY, fenetre: ["ile"] }, { ...BODY, fenetre: "ILE" }];
    for (const body of bodies) await beat(body);
    expect(mocks.postUpdate).toHaveBeenCalledTimes(bodies.length);
    for (const [call] of mocks.postUpdate.mock.calls) {
      // Écrit à null (et non omis) : un poste retombé de l'île sur l'ancienne fenêtre en pleine journée cesse aussitôt de compter.
      expect(call.data).toHaveProperty("robotShownAt", null);
      expect(call.data.lastSeenAt).toBeInstanceOf(Date);
    }
  });

  it("personne n'est connectée à ce poste : le robot de la marque (null), plus jamais le robot du comptoir", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    mocks.postUpdate.mockResolvedValue({ exportPath: null, syncRequestedAt: null, assignedUserId: null });
    expect(await (await beat()).json()).toMatchObject({ ok: true, robotLook: null });
  });

  it("la colonne ne s'écrit pas (code en ligne avant la migration) : le signe de vie passe quand même, sans elle", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    mocks.postUpdate.mockRejectedValueOnce(new Error("The column `robotShownAt` does not exist in the current database."));
    const response = await beat();
    expect(response.status).toBe(200);
    expect(mocks.postUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.postUpdate.mock.calls[1][0].data).not.toHaveProperty("robotShownAt");
    expect(mocks.postUpdate.mock.calls[1][0].data.lastSeenAt).toBeInstanceOf(Date);
  });

  it("une vraie panne (base indisponible) n'est pas maquillée en signe de vie", async () => {
    mocks.authenticateAgent.mockResolvedValue(POST_AGENT);
    mocks.postUpdate.mockRejectedValue(new Error("connexion refusée"));
    await expect(beat()).rejects.toThrow("connexion refusée");
  });

  it("clé inconnue : 401, rien n'est écrit", async () => {
    mocks.authenticateAgent.mockResolvedValue(null);
    const response = await beat();
    expect(response.status).toBe(401);
    expect(mocks.postUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/agent/heartbeat — serveur de stock", () => {
  it("inchangé : ni robot ni comptoir", async () => {
    mocks.authenticateAgent.mockResolvedValue(SERVER_AGENT);
    const response = await beat();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, intervalSeconds: 300, exportPath: "D:\\export", scansPath: null });
    expect(mocks.recordHeartbeat).toHaveBeenCalledWith(SERVER_AGENT, { version: "0.10.2", hostname: "POSTE5", notice: null });
    expect(mocks.postUpdate).not.toHaveBeenCalled();
  });
});
