import { describe, expect, it } from "vitest";
import { isPostLinkToken, parsePostLinkCookie, POST_LINK_COOKIE_MAX_AGE_S, POST_LINK_TTL_MS, postLinkPayload, releasedOnTake, shouldTakeLinkedPost } from "../post-link";

/** Les règles du lien navigateur ↔ poste : la forme des jetons et du cookie, et quand le poste lié revient à la personne. */

const LINK = { postId: "post_1", pharmacyId: "ph_port" };
const POST = { pharmacyId: "ph_port", revokedAt: null, pairedAt: new Date("2026-10-01T08:00:00Z"), assignedUserId: "hugo" };
const take = (over: Partial<Parameters<typeof shouldTakeLinkedPost>[0]> = {}) => shouldTakeLinkedPost({ sessionPharmacyId: "ph_port", userId: "lea", canTakeSales: true, link: LINK, post: POST, ...over });

describe("le lien et le cookie", () => {
  it("un lien vit 10 minutes au plus ; le cookie, longtemps (le plafond des navigateurs)", () => {
    expect(POST_LINK_TTL_MS).toBeLessThanOrEqual(10 * 60_000);
    expect(POST_LINK_COOKIE_MAX_AGE_S).toBe(400 * 24 * 3600);
  });

  it("un jeton : seulement les caractères d'un jeton émis (rien qui puisse casser une adresse ou une commande)", () => {
    expect(isPostLinkToken("A".repeat(43))).toBe(true);
    expect(isPostLinkToken("aZ09_-".repeat(8))).toBe(true);
    for (const bad of ["", "A".repeat(39), "A".repeat(65), "A".repeat(42) + "&", "A".repeat(42) + " ", "A".repeat(42) + "\"", null, 42]) expect(isPostLinkToken(bad)).toBe(false);
  });

  it("le cookie porte la version, le poste, la pharmacie et une signature ; toute autre forme est rejetée", () => {
    expect(postLinkPayload(LINK)).toBe("v1.post_1.ph_port");
    expect(postLinkPayload({ postId: "a.b", pharmacyId: "ph" })).toBeNull();
    const sig = "S".repeat(43);
    expect(parsePostLinkCookie(`v1.post_1.ph_port.${sig}`)).toEqual({ ...LINK, payload: "v1.post_1.ph_port", signature: sig });
    for (const bad of [`v2.post_1.ph_port.${sig}`, `v1.post_1.ph_port`, `v1.post_1.ph_port.${sig}.x`, `v1.post 1.ph_port.${sig}`, `v1.post_1.ph_port.${sig.slice(1)}`, "", null, undefined, "x".repeat(400)]) expect(parsePostLinkCookie(bad)).toBeNull();
  });
});

describe("le poste lié revient-il à la personne connectée ?", () => {
  it("oui : poste de la pharmacie de la session, relié, non retiré, pas encore à elle", () => {
    expect(take()).toBe(true);
    expect(take({ post: { ...POST, assignedUserId: null } })).toBe(true);
  });

  it("non, et rien n'est écrit : déjà à elle (idempotent)", () => {
    expect(take({ post: { ...POST, assignedUserId: "lea" } })).toBe(false);
  });

  it("non : lien ou poste d'une autre pharmacie, poste retiré ou pas relié, pas de lien, pas de poste", () => {
    expect(take({ link: { postId: "post_1", pharmacyId: "ph_gare" } })).toBe(false);
    expect(take({ post: { ...POST, pharmacyId: "ph_gare" } })).toBe(false);
    expect(take({ sessionPharmacyId: "ph_gare" })).toBe(false);
    expect(take({ post: { ...POST, revokedAt: new Date() } })).toBe(false);
    expect(take({ post: { ...POST, pairedAt: null } })).toBe(false);
    expect(take({ link: null })).toBe(false);
    expect(take({ post: null })).toBe(false);
  });

  it("non : quelqu'un qui ne prend pas les ventes (consultation)", () => {
    expect(take({ canTakeSales: false })).toBe(false);
  });
});

describe("prendre le comptoir de ce PC : ce qu'on libère ailleurs", () => {
  const traces = new Map<string, { action: string; userId: string | null } | null>([
    ["pc2", { action: "counter_post.taken", userId: "adam" }],
    ["secours", { action: "counter_post.assigned", userId: "titulaire" }],
    ["ancien", { action: "counter_post.claimed", userId: "adam" }],
    ["sans-trace", null],
    ["pris-par-lea", { action: "counter_post.taken", userId: "lea" }],
  ]);

  it("garde le comptoir qu'elle a pris elle-même sur un autre PC lié (sa session y est ouverte) : pas de bascule", () => {
    expect(releasedOnTake(["pc2"], traces, "adam")).toEqual([]);
  });

  it("libère une attribution de secours, l'ancienne « Je travaille ici », ou un comptoir sans trace : elle n'y est plus", () => {
    expect(releasedOnTake(["secours", "ancien", "sans-trace", "inconnu"], traces, "adam")).toEqual(["secours", "ancien", "sans-trace", "inconnu"]);
  });

  it("une trace « pris sur ce PC » d'une AUTRE personne ne retient rien pour elle", () => {
    expect(releasedOnTake(["pris-par-lea", "pc2"], traces, "adam")).toEqual(["pris-par-lea"]);
  });
});
