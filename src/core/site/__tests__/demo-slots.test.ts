import { describe, expect, it } from "vitest";
import { demoSlots, formatDemoSlot, isBookableDemoSlot } from "../demo-slots";

// Vendredi 16 octobre 2026, 15 h 10 à Paris (heure d'été, UTC+2).
const now = new Date("2026-10-16T13:10:00Z");

describe("créneaux de démonstration", () => {
  it("propose dix jours ouvrés, sans week-end, au plus tôt deux heures après", () => {
    const days = demoSlots(now);
    expect(days).toHaveLength(10);
    expect(days.some((d) => /^(Samedi|Dimanche)/.test(d.label))).toBe(false);
    expect(days[0].label).toBe("Vendredi 16 octobre");
    expect(days[0].slots.map((s) => s.time)).toEqual(["17 h 30", "18 h", "18 h 30"]);
    expect(days[1].label).toBe("Lundi 19 octobre");
    expect(days[1].slots[0]).toEqual({ at: "2026-10-19T07:00:00.000Z", time: "9 h" });
  });

  it("garde l'heure de Paris après le passage à l'heure d'hiver", () => {
    const monday = demoSlots(now).find((d) => d.date === "2026-10-26");
    expect(monday?.slots[0].at).toBe("2026-10-26T08:00:00.000Z");
    expect(formatDemoSlot(new Date("2026-10-26T08:30:00Z"))).toBe("Lundi 26 octobre à 9 h 30");
  });

  it("ne repropose pas un créneau déjà réservé et refuse un créneau hors grille", () => {
    const taken = new Date("2026-10-19T07:00:00Z");
    expect(isBookableDemoSlot(taken, now)).toBe(true);
    expect(isBookableDemoSlot(taken, now, [taken])).toBe(false);
    expect(isBookableDemoSlot(new Date("2026-10-19T07:10:00Z"), now)).toBe(false);
    expect(isBookableDemoSlot(new Date("2026-10-17T07:00:00Z"), now)).toBe(false);
  });
});
