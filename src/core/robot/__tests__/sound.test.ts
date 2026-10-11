import { describe, expect, it } from "vitest";
import { parseSoundPreference, ROBOT_SOUNDS, SOUND_DEFAULT_ON, SOUND_VOLUME, soundDuration, soundFor, soundIsOn, soundStorageKey } from "../sound";

describe("les sons du robot", () => {
  it("partout allumés par défaut, le comptoir compris (demande du fondateur, 11 oct. 2026)", () => {
    expect(SOUND_DEFAULT_ON.counter).toBe(true);
    expect(soundIsOn({ context: "counter", stored: null, globalMute: false })).toBe(true);
    expect(soundIsOn({ context: "counter", stored: false, globalMute: false })).toBe(false);
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

  it("jamais de son pour une mise en garde, nulle part", () => {
    for (const where of ["counter", "site", "mobile"] as const) expect(soundFor(where, { mood: "concerned" })).toBeNull();
  });

  it("au comptoir, seuls les sons amicaux : bonjour, gloussement, blip du bip, joie, fête", () => {
    expect(soundFor("counter", { burst: "wave" })).toBe("greet");
    expect(soundFor("counter", { burst: "giggle" })).toBe("giggle");
    expect(soundFor("counter", { mood: "curious" })).toBe("curious");
    expect(soundFor("counter", { burst: "party" })).toBe("celebrate");
    expect(soundFor("counter", { mood: "thinking" })).toBeNull();
    expect(soundFor("site", { mood: "thinking" })).toBe("thinking");
    expect(soundFor("counter", { burst: "jump" })).toBe("happy");
    expect(soundFor("mobile", { burst: "party" })).toBe("celebrate");
    expect(soundFor("mobile", { mood: "idle" })).toBeNull();
  });

  it("des sons courts et un volume bas, plus bas au comptoir", () => {
    for (const sound of ROBOT_SOUNDS) expect(soundDuration(sound)).toBeLessThan(0.4);
    expect(SOUND_VOLUME.site).toBeLessThanOrEqual(0.3);
    expect(SOUND_VOLUME.counter).toBeLessThanOrEqual(0.15);
    expect(SOUND_VOLUME.counter).toBeLessThan(SOUND_VOLUME.mobile);
  });
});
