import { describe, expect, it } from "vitest";
import { formatSeconds, nudgeChoiceSchema, nudgeDetailsSchema, readNudgeStore } from "../site-nudge";

describe("la bulle du site", () => {
  it("relit un réglage vide ou abîmé sans planter", () => {
    expect(readNudgeStore(null)).toEqual({ shown: 0, closed: 0, items: [] });
    expect(readNudgeStore({ shown: "3", items: [null, { id: "a" }] })).toMatchObject({ shown: 3, closed: 0, items: [{ id: "a" }] });
  });

  it("n'accepte qu'un profil connu et des pages courtes", () => {
    expect(nudgeChoiceSchema.safeParse({ profile: "PHARMACIEN", trigger: "TARIF", seconds: 95, pages: ["/", "/pourquoi"] }).success).toBe(true);
    expect(nudgeChoiceSchema.safeParse({ profile: "ESPION", trigger: "TARIF", seconds: 95, pages: [] }).success).toBe(false);
  });

  it("laisse les coordonnées facultatives, mais refuse une adresse ou un numéro faux", () => {
    const id = "a".repeat(24);
    expect(nudgeDetailsSchema.safeParse({ id }).success).toBe(true);
    expect(nudgeDetailsSchema.safeParse({ id, email: "pas-une-adresse" }).success).toBe(false);
    expect(nudgeDetailsSchema.safeParse({ id, phone: "06 12 34 56 78" }).success).toBe(true);
    expect(nudgeDetailsSchema.safeParse({ id: "../autre" }).success).toBe(false);
  });

  it("dit le temps passé en clair", () => {
    expect(formatSeconds(42)).toBe("42 s");
    expect(formatSeconds(130)).toBe("2 min 10");
    expect(formatSeconds(180)).toBe("3 min");
  });
});
