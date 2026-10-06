import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ demo: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ isDemoMode: () => env.demo }));

const { activityScope, recordIsDemo } = await import("../demo-scope");

beforeEach(() => {
  env.demo = false;
});

describe("l'activité visible", () => {
  it("une vraie officine ne voit jamais d'activité de démonstration", () => {
    expect(activityScope()).toEqual({ isDemo: false });
    expect(activityScope({ isDemo: false })).toEqual({ isDemo: false });
    expect(activityScope({})).toEqual({ isDemo: false });
  });

  it("l'officine de démonstration voit la sienne (et seulement la sienne : chaque requête filtre aussi son officine)", () => {
    expect(activityScope({ isDemo: true })).toEqual({});
  });

  it("l'environnement de démonstration voit tout, comme avant", () => {
    env.demo = true;
    expect(activityScope()).toEqual({});
  });
});

describe("ce qu'une écriture porte", () => {
  it("l'officine de démonstration marque tout ce qu'elle écrit comme démonstration", () => {
    expect(recordIsDemo(true)).toBe(true);
    expect(recordIsDemo(false)).toBe(false);
  });
});
