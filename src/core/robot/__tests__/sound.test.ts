import { describe, expect, it } from "vitest";
import { parseSoundPreference, ROBOT_SOUNDS, SOUND_DEFAULT_ON, SOUND_VOLUME, soundDuration, soundFor, soundIsOn, soundStorageKey } from "../sound";

describe("les sons du robot", () => {
  it("le comptoir part muet ; le site et le mobile sonnent par défaut", () => {
    expect(SOUND_DEFAULT_ON.counter).toBe(false);
    expect(soundIsOn({ context: "counter", stored: null, globalMute: false })).toBe(false);
    expect(soundIsOn({ context: "site", stored: null, globalMute: false })).toBe(true);
    expect(soundIsOn({ context: "mobile", stored: null, globalMute: false })).toBe(true);
  });

  it("le choix de la personne l'emporte sur le défaut, et le « tout couper » sur tout", () => {
    expect(soundIsOn({ context: "counter", stored: true, globalMute: false })).toBe(true);
    expect(soundIsOn({ context: "site", stored: false, globalMute: false })).toBe(false);
    expect(soundIsOn({ context: "counter", stored: true, globalMute: true })).toBe(false);
  });

  it("lit le stockage sans se tromper sur une valeur inconnue", () => {
    expect(parseSoundPreference("on")).toBe(true);
    expect(parseSoundPreference("off")).toBe(false);
    expect(parseSoundPreference("oui")).toBeNull();
    expect(parseSoundPreference(null)).toBeNull();
    expect(soundStorageKey("counter")).not.toBe(soundStorageKey("site"));
  });

  it("jamais de son pour une mise en garde au comptoir", () => {
    expect(soundFor("counter", { mood: "concerned" })).toBeNull();
    expect(soundFor("site", { mood: "concerned" })).toBe("concerned");
    expect(soundFor("counter", { burst: "jump" })).toBe("happy");
    expect(soundFor("mobile", { burst: "party" })).toBe("celebrate");
    expect(soundFor("mobile", { mood: "idle" })).toBeNull();
  });

  it("des sons courts et un volume bas, plus bas au comptoir", () => {
    for (const sound of ROBOT_SOUNDS) expect(soundDuration(sound)).toBeLessThan(0.4);
    expect(SOUND_VOLUME.site).toBeLessThanOrEqual(0.25);
    expect(SOUND_VOLUME.counter).toBeLessThan(SOUND_VOLUME.site);
  });
});
