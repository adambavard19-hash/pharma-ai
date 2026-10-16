import { describe, expect, it } from "vitest";
import { boxExpiry, parseExpiry } from "../box-expiry";

describe("la péremption de la boîte bipée", () => {
  it("n'accepte qu'une vraie date du calendrier", () => {
    expect(parseExpiry("2027-03-31")?.toISOString()).toBe("2027-03-31T00:00:00.000Z");
    expect(parseExpiry("2027-02-30")).toBeNull();
    expect(parseExpiry("27-03-31")).toBeNull();
    expect(parseExpiry(20270331)).toBeNull();
    expect(parseExpiry(undefined)).toBeNull();
  });

  it("périmée la veille, bonne le jour même, « bientôt » dans les 30 jours, rien au-delà", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    expect(boxExpiry(new Date("2026-10-14T00:00:00Z"), now)).toEqual({ on: "2026-10-14", state: "expired" });
    expect(boxExpiry(new Date("2026-10-15T00:00:00Z"), now)).toEqual({ on: "2026-10-15", state: "soon" });
    expect(boxExpiry(new Date("2026-11-14T00:00:00Z"), now)).toEqual({ on: "2026-11-14", state: "soon" });
    expect(boxExpiry(new Date("2026-11-15T00:00:00Z"), now)).toBeNull();
    expect(boxExpiry(null, now)).toBeNull();
  });

  it("compte les jours à Paris : à 23 h 30 à Paris le 15, on est déjà le 15 (pas le 14 de Londres)", () => {
    expect(boxExpiry(new Date("2026-10-15T00:00:00Z"), new Date("2026-10-15T21:30:00Z"))?.state).toBe("soon");
    // 00 h 30 à Paris le 16 (22 h 30 UTC le 15) : la boîte du 15 est périmée.
    expect(boxExpiry(new Date("2026-10-15T00:00:00Z"), new Date("2026-10-15T22:30:00Z"))?.state).toBe("expired");
  });
});
