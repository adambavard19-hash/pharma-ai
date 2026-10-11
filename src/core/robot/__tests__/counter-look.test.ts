import { describe, expect, it } from "vitest";
import { nextLookIndex, robotLook, robotLookCaption, ROBOT_LOOK_COUNT } from "../counter-look";

describe("un robot par comptoir", () => {
  it("20 apparences toutes différentes (accessoire + couleur), avec 20 prénoms différents", () => {
    const looks = Array.from({ length: ROBOT_LOOK_COUNT }, (_, i) => robotLook(i));
    expect(new Set(looks.map((look) => `${look.accessory}/${look.palette.name}`)).size).toBe(20);
    expect(new Set(looks.map((look) => look.name)).size).toBe(20);
  });

  it("deux comptoirs qui se suivent n'ont ni la même couleur ni le même accessoire", () => {
    for (let i = 0; i < ROBOT_LOOK_COUNT; i += 1) {
      const a = robotLook(i);
      const b = robotLook(i + 1);
      expect(a.accessory).not.toBe(b.accessory);
      expect(a.palette.name).not.toBe(b.palette.name);
    }
  });

  it("un index hors bornes reprend au début", () => {
    expect(robotLook(20).index).toBe(0);
    expect(robotLook(-1).index).toBe(19);
  });

  it("donne le premier robot libre, puis le moins utilisé au-delà de 20 comptoirs", () => {
    expect(nextLookIndex([])).toBe(0);
    expect(nextLookIndex([0, 1, 3, null])).toBe(2);
    const all = Array.from({ length: 20 }, (_, i) => i);
    expect(nextLookIndex(all)).toBe(0);
    expect(nextLookIndex([...all, 0, 1])).toBe(2);
  });

  it("légende sous le robot", () => {
    expect(robotLookCaption(0, "Comptoir 2")).toBe("Bip · Comptoir 2");
  });
});
