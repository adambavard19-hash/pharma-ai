import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Le lien ouvert par le poste dans le navigateur de son PC : un jeton valable pose le cookie signé (httpOnly, SameSite=Lax,
 * Secure en ligne, longue durée) et mène à « Nouvelle vente » ; sinon rien n'est posé et l'écran dit quoi faire.
 */

const mocks = vi.hoisted(() => ({ consume: vi.fn(), sign: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/services/post-link", () => ({ consumePostLink: mocks.consume, signPostLinkCookie: mocks.sign }));

const route = await import("../route");
const open = (url: string, ip = "203.0.113.7") => route.GET(new NextRequest(url, { headers: { "x-forwarded-for": ip } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.sign.mockReturnValue("v1.post_1.ph_port.SIGNATURE");
});

describe("GET /comptoir/lier", () => {
  it("lien valable : cookie signé du poste, puis « Nouvelle vente » ; ni cache ni référent", async () => {
    mocks.consume.mockResolvedValue({ postId: "post_1", pharmacyId: "ph_port" });
    const response = await open(`https://pharmaboost.app/comptoir/lier?jeton=${"J".repeat(43)}`);
    expect(mocks.consume).toHaveBeenCalledWith("J".repeat(43));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://pharmaboost.app/vente/nouvelle");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("pharma_poste=v1.post_1.ph_port.SIGNATURE");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=34560000/);
  });

  it("lien déjà servi, expiré ou inconnu : aucun cookie, « Nouvelle vente » dit quoi faire", async () => {
    mocks.consume.mockResolvedValue(null);
    const response = await open(`https://pharmaboost.app/comptoir/lier?jeton=${"J".repeat(43)}`, "203.0.113.8");
    expect(response.headers.get("location")).toBe("https://pharmaboost.app/vente/nouvelle?lien=perime");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("une erreur de base ne casse rien : pas de cookie", async () => {
    mocks.consume.mockRejectedValue(new Error("base indisponible"));
    const response = await open(`https://pharmaboost.app/comptoir/lier?jeton=${"J".repeat(43)}`, "203.0.113.9");
    expect(response.headers.get("location")).toContain("lien=perime");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("freiné : au-delà de 20 essais par minute depuis une même adresse, plus rien n'est cherché", async () => {
    mocks.consume.mockResolvedValue(null);
    for (let i = 0; i < 20; i += 1) await open("https://pharmaboost.app/comptoir/lier?jeton=x", "198.51.100.66");
    expect(mocks.consume).toHaveBeenCalledTimes(20);
    await open("https://pharmaboost.app/comptoir/lier?jeton=x", "198.51.100.66");
    expect(mocks.consume).toHaveBeenCalledTimes(20);
  });
});
