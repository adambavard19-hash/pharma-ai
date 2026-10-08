import { describe, expect, it } from "vitest";
import { SETTLE_MS, hasSettled } from "../settle";

describe("l'attente avant d'analyser une vente bipée", () => {
  const at = new Date("2026-10-08T15:21:00.000Z");
  const after = (ms: number) => new Date(at.getTime() + ms);

  it("est courte : le conseil doit arriver pendant que le client est encore au comptoir", () => {
    expect(SETTLE_MS).toBeLessThanOrEqual(3_000);
  });

  it("laisse passer une autre boîte du même client, puis analyse", () => {
    expect(hasSettled(at, after(SETTLE_MS - 1))).toBe(false);
    expect(hasSettled(at, after(SETTLE_MS))).toBe(true);
    expect(hasSettled(at, after(60_000))).toBe(true);
  });

  it("accepte un autre délai", () => {
    expect(hasSettled(at, after(1_000), 500)).toBe(true);
    expect(hasSettled(at, after(1_000), 2_000)).toBe(false);
  });
});
