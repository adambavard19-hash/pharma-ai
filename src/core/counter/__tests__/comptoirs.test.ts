import { describe, expect, it } from "vitest";
import { comptoirName, comptoirTitle, noComptoirMessage, parseComptoirName, resolveMyComptoirs, type ComptoirPost } from "../comptoirs";

const post = (id: string, assignedUserId: string | null, label: string | null = `Comptoir ${id}`): ComptoirPost => ({ id, label, hostname: `PC-${id}`, assignedUserId });

describe("à qui appartient un comptoir", () => {
  it("un comptoir attribué à quelqu'un est le sien, et seulement le sien", () => {
    const posts = [post("1", "lea"), post("2", "marc"), post("3", "lea")];
    expect(resolveMyComptoirs(posts, "lea")).toEqual({ postIds: ["1", "3"], mode: "MINE" });
    expect(resolveMyComptoirs(posts, "marc")).toEqual({ postIds: ["2"], mode: "MINE" });
  });

  it("une pharmacie qui n'a qu'un comptoir n'a rien à attribuer : il est à tout le monde", () => {
    expect(resolveMyComptoirs([post("1", null)], "n-importe-qui")).toEqual({ postIds: ["1"], mode: "ONLY_ONE" });
    // Même attribué à un autre, c'est le seul comptoir : personne n'est laissé sans écran.
    expect(resolveMyComptoirs([post("1", "lea")], "marc")).toEqual({ postIds: ["1"], mode: "ONLY_ONE" });
  });

  it("plusieurs comptoirs et aucun pour moi : je n'en vois aucun (jamais ceux des autres)", () => {
    const posts = [post("1", "lea"), post("2", null), post("3", "marc")];
    expect(resolveMyComptoirs(posts, "paul")).toEqual({ postIds: [], mode: "NONE" });
  });

  it("une pharmacie neuve sans comptoir : rien à voir, sans erreur", () => {
    expect(resolveMyComptoirs([], "lea")).toEqual({ postIds: [], mode: "NONE" });
  });
});

describe("le nom d'un comptoir", () => {
  it("le nom du titulaire, à défaut le nom de la machine", () => {
    expect(comptoirName({ label: "Caisse arrière", hostname: "PC-9" })).toBe("Caisse arrière");
    expect(comptoirName({ label: "  ", hostname: "PC-9" })).toBe("PC-9");
    expect(comptoirName({ label: null, hostname: "" })).toBe("Comptoir");
  });
  it("dit à qui il est, ou qu'il n'est à personne", () => {
    expect(comptoirTitle({ label: "Comptoir 2", hostname: "PC-2" }, "Léa Martin")).toBe("Comptoir 2 · Léa Martin");
    expect(comptoirTitle({ label: "Comptoir 2", hostname: "PC-2" }, null)).toBe("Comptoir 2 · non attribué");
  });
  it("accepte un nom net, refuse trop court ou trop long", () => {
    expect(parseComptoirName("  Caisse   1 ")).toEqual({ ok: true, value: "Caisse 1" });
    expect(parseComptoirName("a").ok).toBe(false);
    expect(parseComptoirName("x".repeat(41)).ok).toBe(false);
    expect(parseComptoirName(null).ok).toBe(false);
  });
  it("explique, selon qui lit, pourquoi aucune vente n'est visible", () => {
    expect(noComptoirMessage("MINE", true)).toBeNull();
    expect(noComptoirMessage("NONE", true)).toContain("Mes connexions");
    expect(noComptoirMessage("NONE", false)).toContain("titulaire");
  });
});
