import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";

/**
 * Le lien navigateur ↔ poste, côté serveur : un jeton à usage unique et de courte durée dont seule l'empreinte est
 * gardée ; un cookie signé qu'on ne peut ni fabriquer ni détourner vers une autre pharmacie ; et, à chaque page, le poste
 * lié qui revient à la personne connectée — seulement dans SA pharmacie, seulement s'il n'est pas retiré.
 */

const SECRET = "s".repeat(48);
const m = vi.hoisted(() => ({ findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), audit: vi.fn(), take: vi.fn(), cookie: { value: undefined as string | undefined } }));

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getEnv: () => ({ AUTH_SESSION_SECRET: SECRET }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "pharma_poste" && m.cookie.value !== undefined ? { name, value: m.cookie.value } : undefined) }) }));
vi.mock("@/server/db/client", () => ({ prisma: { counterPost: { findUnique: m.findUnique, findFirst: m.findFirst, updateMany: m.updateMany } } }));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));
vi.mock("@/server/services/comptoirs", () => ({ takeComptoirOnThisPc: m.take }));

const { issuePostLink, consumePostLink, signPostLinkCookie, readPostLinkCookie, thisPcComptoir, leaveThisPcComptoir, NOT_LINKED } = await import("../post-link");

const NOW = new Date("2026-10-13T09:00:00Z");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const LINK = { postId: "cmpost1aaaaaaaaaaaaaaaaaaa", pharmacyId: "cmpharma1aaaaaaaaaaaaaaaa" };
const POST = { pharmacyId: LINK.pharmacyId, revokedAt: null, pairedAt: new Date("2026-10-01T08:00:00Z"), assignedUserId: "hugo", robotShownAt: new Date(Date.now() - 30_000) };

beforeEach(() => {
  vi.resetAllMocks();
  m.cookie.value = undefined;
  m.audit.mockResolvedValue(undefined);
  m.take.mockResolvedValue({ changed: true });
});

describe("le lien à usage unique", () => {
  it("le poste reçoit un jeton aléatoire de 256 bits ; la base n'en garde que l'empreinte, 10 minutes, poste relié et non retiré", async () => {
    m.updateMany.mockResolvedValue({ count: 1 });
    const link = await issuePostLink("post_1", NOW);
    expect(link?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(link?.expiresAt).toEqual(new Date(NOW.getTime() + 10 * 60_000));
    const { where, data } = m.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "post_1", revokedAt: null, pairedAt: { not: null } });
    expect(data.linkTokenHash).toBe(sha(link!.token));
    expect(JSON.stringify(data)).not.toContain(link!.token);
    // Deux demandes : deux jetons différents (le second remplace le premier en base).
    const other = await issuePostLink("post_1", NOW);
    expect(other?.token).not.toBe(link?.token);
  });

  it("poste retiré, pas encore relié ou inconnu : pas de lien", async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    expect(await issuePostLink("post_retire", NOW)).toBeNull();
  });

  it("s'ouvre une fois : brûlé avant tout, puis plus rien (usage unique)", async () => {
    const token = "A".repeat(43);
    m.findUnique.mockResolvedValueOnce({ id: LINK.postId, pharmacyId: LINK.pharmacyId, revokedAt: null, pairedAt: POST.pairedAt, linkExpiresAt: new Date(NOW.getTime() + 60_000) }).mockResolvedValueOnce(null);
    m.updateMany.mockResolvedValue({ count: 1 });
    expect(await consumePostLink(token, NOW)).toEqual(LINK);
    expect(m.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { linkTokenHash: sha(token) } }));
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: LINK.postId, linkTokenHash: sha(token) }, data: { linkTokenHash: null, linkExpiresAt: null } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "counter_post.linked", entityId: LINK.postId, pharmacyId: LINK.pharmacyId }));
    // Second passage du même lien : l'empreinte n'est plus en base.
    expect(await consumePostLink(token, NOW)).toBeNull();
  });

  it("deux ouvertures simultanées : seule celle qui l'efface gagne", async () => {
    m.findUnique.mockResolvedValue({ id: LINK.postId, pharmacyId: LINK.pharmacyId, revokedAt: null, pairedAt: POST.pairedAt, linkExpiresAt: new Date(NOW.getTime() + 60_000) });
    m.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.all([consumePostLink("B".repeat(43), NOW), consumePostLink("B".repeat(43), NOW)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("expiré (plus de 10 minutes) ou poste retiré entre-temps : refusé, mais brûlé quand même", async () => {
    m.updateMany.mockResolvedValue({ count: 1 });
    m.findUnique.mockResolvedValue({ id: LINK.postId, pharmacyId: LINK.pharmacyId, revokedAt: null, pairedAt: POST.pairedAt, linkExpiresAt: new Date(NOW.getTime() - 1) });
    expect(await consumePostLink("C".repeat(43), NOW)).toBeNull();
    m.findUnique.mockResolvedValue({ id: LINK.postId, pharmacyId: LINK.pharmacyId, revokedAt: new Date("2026-10-12T00:00:00Z"), pairedAt: POST.pairedAt, linkExpiresAt: new Date(NOW.getTime() + 60_000) });
    expect(await consumePostLink("C".repeat(43), NOW)).toBeNull();
    expect(m.updateMany).toHaveBeenCalledTimes(2);
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("un jeton mal formé (absent, trop court, caractères piégés) ne touche même pas la base", async () => {
    for (const bad of [null, undefined, "", "abc", "A".repeat(43) + "&x=1", "A".repeat(42) + "'", ["A".repeat(43)], "A".repeat(200)]) expect(await consumePostLink(bad, NOW)).toBeNull();
    expect(m.findUnique).not.toHaveBeenCalled();
  });
});

describe("le cookie du poste", () => {
  it("se relit tel qu'il a été signé : le poste et sa pharmacie", () => {
    const value = signPostLinkCookie(LINK);
    expect(value).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(readPostLinkCookie(value)).toEqual(LINK);
  });

  it("falsifié — autre poste, autre pharmacie, signature d'un autre secret, abîmé — il ne vaut rien", () => {
    const value = signPostLinkCookie(LINK);
    const [version, , , signature] = value.split(".");
    expect(readPostLinkCookie(`${version}.cmautreposteaaaaaaaaaaaaa.${LINK.pharmacyId}.${signature}`)).toBeNull();
    expect(readPostLinkCookie(`${version}.${LINK.postId}.cmautrepharmaaaaaaaaaaaa.${signature}`)).toBeNull();
    const forged = createHmac("sha256", "un-autre-secret").update(`poste-lie:v1.${LINK.postId}.${LINK.pharmacyId}`).digest("base64url");
    expect(readPostLinkCookie(`v1.${LINK.postId}.${LINK.pharmacyId}.${forged}`)).toBeNull();
    for (const bad of [undefined, null, "", "v1", `v2.${LINK.postId}.${LINK.pharmacyId}.${signature}`, `${value}.x`, value.slice(0, -1)]) expect(readPostLinkCookie(bad)).toBeNull();
  });
});

describe("à chaque page de l'espace : le PC du comptoir", () => {
  it("sans cookie (PC du bureau, Mac, téléphone) : rien, et aucune requête", async () => {
    expect(await thisPcComptoir(LINK.pharmacyId, "lea", true)).toEqual(NOT_LINKED);
    expect(m.findFirst).not.toHaveBeenCalled();
  });

  it("cookie d'une AUTRE pharmacie que la session, ou falsifié : ignoré, aucune requête, rien n'est pris", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    expect(await thisPcComptoir("cmautrepharmaaaaaaaaaaaa", "lea", true)).toEqual(NOT_LINKED);
    m.cookie.value = `v1.${LINK.postId}.${LINK.pharmacyId}.${"A".repeat(43)}`;
    expect(await thisPcComptoir(LINK.pharmacyId, "lea", true)).toEqual(NOT_LINKED);
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.take).not.toHaveBeenCalled();
  });

  it("poste lié de SA pharmacie : il revient à la personne connectée, sans clic ; le robot du logiciel y vit", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    m.findFirst.mockResolvedValue(POST);
    expect(await thisPcComptoir(LINK.pharmacyId, "lea", true)).toEqual({ postId: LINK.postId, robotOnPost: true });
    expect(m.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: LINK.postId, pharmacyId: LINK.pharmacyId } }));
    expect(m.take).toHaveBeenCalledWith({ pharmacyId: LINK.pharmacyId, userId: "lea" }, LINK.postId);
  });

  it("déjà le sien : aucune écriture (une seule lecture par page)", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    m.findFirst.mockResolvedValue({ ...POST, assignedUserId: "lea" });
    await thisPcComptoir(LINK.pharmacyId, "lea", true);
    expect(m.take).not.toHaveBeenCalled();
  });

  it("quelqu'un qui ne prend pas les ventes (consultation) ne prend pas le comptoir ; le robot reste celui du logiciel", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    m.findFirst.mockResolvedValue(POST);
    expect(await thisPcComptoir(LINK.pharmacyId, "visiteur", false)).toEqual({ postId: LINK.postId, robotOnPost: true });
    expect(m.take).not.toHaveBeenCalled();
  });

  it("poste retiré (ou disparu) : le cookie ne vaut plus rien — rien n'est pris, l'espace garde son robot", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    m.findFirst.mockResolvedValue({ ...POST, revokedAt: new Date("2026-10-12T00:00:00Z") });
    expect(await thisPcComptoir(LINK.pharmacyId, "lea", true)).toEqual(NOT_LINKED);
    m.findFirst.mockResolvedValue(null);
    expect(await thisPcComptoir(LINK.pharmacyId, "lea", true)).toEqual(NOT_LINKED);
    expect(m.take).not.toHaveBeenCalled();
  });

  it("poste lié qui ne dessine pas le robot (ancienne fenêtre, éteint) : le comptoir est pris, l'espace garde son robot", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    m.findFirst.mockResolvedValue({ ...POST, robotShownAt: null });
    expect(await thisPcComptoir(LINK.pharmacyId, "lea", true)).toEqual({ postId: LINK.postId, robotOnPost: false });
    expect(m.take).toHaveBeenCalledTimes(1);
  });

  it("base indisponible : pas de lien, la page ne casse pas", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    m.findFirst.mockRejectedValue(new Error("base indisponible"));
    expect(await thisPcComptoir(LINK.pharmacyId, "lea", true)).toEqual(NOT_LINKED);
  });
});

describe("se déconnecter sur le PC d'un comptoir", () => {
  it("libère CE poste, seulement s'il est à la personne, seulement dans sa pharmacie, et garde la trace", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    m.updateMany.mockResolvedValue({ count: 1 });
    await leaveThisPcComptoir(LINK.pharmacyId, "lea");
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: LINK.postId, pharmacyId: LINK.pharmacyId, assignedUserId: "lea" }, data: { assignedUserId: null } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "counter_post.released", entityType: "CounterPost", entityId: LINK.postId, pharmacyId: LINK.pharmacyId, userId: "lea", metadata: { via: "deconnexion" } }));
  });

  it("le poste n'était pas (ou plus) à elle : rien n'est libéré, aucune trace", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    m.updateMany.mockResolvedValue({ count: 0 });
    await leaveThisPcComptoir(LINK.pharmacyId, "lea");
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("sans cookie (Mac, téléphone), cookie d'une autre pharmacie ou falsifié : aucune requête", async () => {
    await leaveThisPcComptoir(LINK.pharmacyId, "lea");
    m.cookie.value = signPostLinkCookie(LINK);
    await leaveThisPcComptoir("cmpharmaautreaaaaaaaaaaaa", "lea");
    m.cookie.value = `${signPostLinkCookie(LINK).slice(0, -2)}xx`;
    await leaveThisPcComptoir(LINK.pharmacyId, "lea");
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("base indisponible : la déconnexion passe quand même", async () => {
    m.cookie.value = signPostLinkCookie(LINK);
    m.updateMany.mockRejectedValue(new Error("base indisponible"));
    await expect(leaveThisPcComptoir(LINK.pharmacyId, "lea")).resolves.toBeUndefined();
  });
});
