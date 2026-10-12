import { describe, expect, it } from "vitest";
import { nextLookIndex, personRobot, personRobotLook, robotLook, ROBOT_LOOK_COUNT } from "../counter-look";

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
});

describe("un robot par personne (1 robot pour 1 espace)", () => {
  it("toujours le même pour une même personne, entre 0 et 19, sans rien enregistrer", () => {
    const id = "cmg4x2k7e0003l7085y1q9z8a";
    expect(personRobotLook(id)).toBe(personRobotLook(id));
    for (const userId of ["", "a", "lea", "cm0000000000000000000000", "é-ü-日本"]) {
      const look = personRobotLook(userId);
      expect(Number.isInteger(look)).toBe(true);
      expect(look).toBeGreaterThanOrEqual(0);
      expect(look).toBeLessThan(ROBOT_LOOK_COUNT);
    }
    // Valeur figée : le robot d'une personne ne change pas d'une version à l'autre (FNV-1a 32 bits, modulo 20).
    expect(personRobotLook("lea")).toBe(9);
  });

  it("les 20 robots servent : des identifiants proches tombent sur des robots différents", () => {
    const looks = new Set(Array.from({ length: 400 }, (_, i) => personRobotLook(`cmg4x2k7e${String(i).padStart(4, "0")}l7085y1q9z8a`)));
    expect(looks.size).toBe(ROBOT_LOOK_COUNT);
  });

  it("ce que l'écran affiche : l'apparence et le prénom du robot, jamais un nom de comptoir", () => {
    const robot = personRobot("lea");
    expect(robot).toEqual({ look: 9, caption: robotLook(9).name });
    expect(robot.caption).not.toMatch(/comptoir/i);
  });
});
