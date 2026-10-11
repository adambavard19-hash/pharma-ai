import { describe, expect, it } from "vitest";
import { BURST_MS, burstForMood, countWarnings, dashboardMood, gazeToward, POKE_IDLE, POKE_WINDOW_MS, pokeReducer, POKES_TO_DIZZY, saleMood, type PokeState } from "../mascot";

const poke = (state: PokeState, now: number) => pokeReducer(state, { type: "poke", now });

describe("le robot qu'on touche", () => {
  it("glousse à un toucher, puis revient au calme", () => {
    const giggling = poke(POKE_IDLE, 1000);
    expect(giggling.burst).toBe("giggle");
    expect(giggling.until).toBe(1000 + BURST_MS.giggle);
    expect(pokeReducer(giggling, { type: "tick", now: 1000 + BURST_MS.giggle }).burst).toBeNull();
  });

  it("a le tournis après quatre touchers rapprochés, s'en remet, et le compte repart de zéro", () => {
    let state = POKE_IDLE;
    for (let i = 0; i < POKES_TO_DIZZY; i += 1) state = poke(state, 1000 + i * 200);
    expect(state.burst).toBe("dizzy");
    // Insister pendant le tournis ne le prolonge pas.
    expect(poke(state, 1900)).toBe(state);
    const recovered = pokeReducer(state, { type: "tick", now: state.until });
    expect(recovered).toEqual({ taps: [], burst: null, until: 0 });
    expect(poke(recovered, state.until + 10).burst).toBe("giggle");
  });

  it("des touchers espacés ne donnent jamais le tournis", () => {
    let state = POKE_IDLE;
    for (let i = 0; i < 10; i += 1) state = poke(state, i * (POKE_WINDOW_MS / 2 + 10));
    expect(state.burst).toBe("giggle");
  });
});

describe("le regard", () => {
  it("reste au centre quand le pointeur est sur lui, et ne sort jamais de l'écran", () => {
    expect(gazeToward(0, 0)).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    const far = gazeToward(100000, -100000, 4.5);
    expect(Math.abs(far.x)).toBeLessThanOrEqual(4.5);
    expect(Math.abs(far.y)).toBeLessThanOrEqual(4.5 * 0.75);
    expect(far.x).toBeGreaterThan(0);
    expect(far.y).toBeLessThan(0);
    expect(far.scaleX).toBeLessThan(1);
  });

  it("va plus loin quand le pointeur s'éloigne", () => {
    expect(gazeToward(400, 0).x).toBeGreaterThan(gazeToward(40, 0).x);
  });
});

describe("l'humeur au comptoir", () => {
  const base = { analysing: false, editing: false, fromScan: true, warnings: 0, accepted: 0, finished: false };
  it("curieux au bip, pensif pendant l'analyse", () => {
    expect(saleMood({ ...base, editing: true })).toBe("curious");
    expect(saleMood({ ...base, editing: true, fromScan: false })).toBe("idle");
    expect(saleMood({ ...base, analysing: true, editing: true })).toBe("thinking");
  });
  it("sérieux devant une mise en garde, même si un conseil est vendu", () => {
    expect(saleMood({ ...base, warnings: 1, accepted: 2 })).toBe("concerned");
  });
  it("content quand un conseil est accepté ou la vente terminée", () => {
    expect(saleMood({ ...base, accepted: 1 })).toBe("happy");
    expect(saleMood({ ...base, finished: true })).toBe("happy");
    expect(saleMood(base)).toBe("idle");
  });
  it("ne compte ni l'information ni ce qui est acquitté", () => {
    expect(countWarnings([{ severity: "INFO", acknowledged: false }, { severity: "WARNING", acknowledged: true }, { severity: "BLOCKING", acknowledged: false }])).toBe(1);
  });
  it("sur Nouvelle vente : l'analyse avant le bip, le bip avant la joie", () => {
    expect(dashboardMood({ saleStatuses: ["NEEDS_VERIFICATION", "ANALYZING"], acceptedRose: true })).toBe("thinking");
    expect(dashboardMood({ saleStatuses: ["NEEDS_VERIFICATION"], acceptedRose: true })).toBe("curious");
    expect(dashboardMood({ saleStatuses: [], acceptedRose: true })).toBe("happy");
    expect(dashboardMood({ saleStatuses: ["ANALYZED"], acceptedRose: false })).toBe("idle");
  });
  it("seules la joie et la fête font bouger le corps", () => {
    expect(burstForMood("happy")).toBe("jump");
    expect(burstForMood("celebrate")).toBe("party");
    expect(burstForMood("concerned")).toBeNull();
  });
});
