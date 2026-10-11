import { describe, expect, it } from "vitest";
import { danceTransform, Ease, eyeForFace, FACE_CONFIG, pointerToLook, RobotMotion } from "../motion";

/** Un hasard fixe : les tests ne dépendent pas du tirage. */
const seeded = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

/** Fait vivre le robot `seconds` secondes, image par image (60 i/s). */
function run(robot: RobotMotion, from: number, seconds: number): number {
  let now = from;
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    now += 1 / 60;
    robot.update(1 / 60, now);
  }
  return now;
}

describe("le moteur de mouvement du robot", () => {
  it("les courbes partent de 0 et arrivent à 1 ; « back » dépasse un peu avant d'arriver", () => {
    for (const ease of Object.values(Ease)) {
      expect(ease(0)).toBeCloseTo(0, 5);
      expect(ease(1)).toBeCloseTo(1, 5);
    }
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(Ease.back))).toBeGreaterThan(1);
  });

  it("chaque humeur a ses yeux ; une mise en garde n'a ni petite vie, ni yeux festifs", () => {
    expect(eyeForFace("happy")).toBe("happy");
    expect(eyeForFace("sleepy")).toBe("closed");
    expect(eyeForFace("dizzy")).toBe("spiral");
    expect(eyeForFace("concerned")).toBe("flat");
    expect(FACE_CONFIG.concerned.idleLife).toBe(false);
  });

  it("cligne des yeux tout seul, et rouvre les yeux", () => {
    const robot = new RobotMotion({ random: seeded([0.5]), now: 0 });
    let closed = false;
    let now = 0;
    for (let i = 0; i < 60 * 6; i += 1) {
      now += 1 / 60;
      robot.update(1 / 60, now);
      if (robot.pose().open < 0.3) closed = true;
    }
    expect(closed).toBe(true);
    now = run(robot, now, 0.4);
    expect(robot.pose().open).toBeGreaterThan(0.9);
  });

  it("touché : il s'écrase et rit ; une deuxième fois, il est agacé ; trois fois vite, la tête lui tourne", () => {
    const robot = new RobotMotion({ random: seeded([0.5]), now: 0 });
    run(robot, 0, 0.5);
    expect(robot.poke()).toBe("giggle");
    let now = run(robot, 0.5, 0.05);
    expect(robot.pose().sy).toBeLessThan(0.95);
    expect(robot.pose().eye).toBe("happy");
    now = run(robot, now, 0.3);
    expect(robot.poke()).toBe("annoyed");
    now = run(robot, now, 0.05);
    expect(robot.pose().eye).toBe("line");
    expect(robot.poke()).toBe("dizzy");
    now = run(robot, now, 0.5);
    expect(robot.pose().eye).toBe("spiral");
    expect(robot.pose().roll).toBeGreaterThan(0);
    // Pendant le tournis, on ne l'enfonce pas davantage.
    expect(robot.poke()).toBeNull();
    run(robot, now, 2.5);
    expect(robot.pose().eye).toBe("pill");
    expect(robot.pose().roll).toBe(0);
  });

  it("de joie, il saute et des étoiles s'envolent ; à la fête, il danse et fait une roulade", () => {
    const robot = new RobotMotion({ random: seeded([0.3, 0.7]), now: 0 });
    robot.setFace("happy");
    robot.play("jump");
    run(robot, 0, 0.2);
    expect(robot.pose().oy).toBeLessThan(-5);
    expect(robot.pose().particles.some((particle) => particle.kind === "star")).toBe(true);
    robot.setFace("celebrate");
    robot.play("party");
    run(robot, 0.2, 0.6);
    const pose = robot.pose();
    expect(pose.roll).toBeGreaterThan(0);
    expect(Math.abs(pose.oy) + Math.abs(pose.ox)).toBeGreaterThan(0.5);
  });

  it("une mise en garde : sérieux, sans saut, sans fête, sans particule, sans clin d'œil", () => {
    const robot = new RobotMotion({ random: seeded([0.5]), now: 0 });
    robot.setFace("concerned");
    robot.play("jump");
    robot.play("party");
    robot.emote("love");
    robot.emote("wink");
    robot.emit("heart", 3);
    run(robot, 0, 1);
    const pose = robot.pose();
    expect(pose.particles).toHaveLength(0);
    expect(pose.eye).toBe("flat");
    expect(pose.roll).toBe(0);
    expect(pose.oy).toBeGreaterThan(-1);
  });

  it("le coucou : la main se lève puis redescend, les yeux rient", () => {
    const robot = new RobotMotion({ random: seeded([0.5]), now: 0 });
    robot.play("wave");
    run(robot, 0, 0.9);
    expect(robot.pose().hand).toBeGreaterThan(0.9);
    expect(robot.pose().eye).toBe("happy");
    run(robot, 0.9, 1.5);
    expect(robot.pose().hand).toBeLessThan(0.05);
  });

  it("au repos, il ne reste pas figé : il jette des coups d'œil, sautille, fait des clins d'œil", () => {
    const robot = new RobotMotion({ random: seeded([0.1, 0.4, 0.2, 0.55, 0.9, 0.6, 0.3]), now: 0 });
    let moved = false;
    let now = 0;
    for (let i = 0; i < 60 * 20; i += 1) {
      now += 1 / 60;
      robot.update(1 / 60, now);
      const pose = robot.pose();
      if (Math.abs(pose.yaw) > 0.2 || pose.oy < -2 || pose.eye === "wink") moved = true;
    }
    expect(moved).toBe(true);
  });

  it("endormi : les yeux fermés et des « z » qui montent", () => {
    const robot = new RobotMotion({ random: seeded([0.5]), now: 0 });
    robot.setFace("sleepy");
    run(robot, 0, 3);
    const pose = robot.pose();
    expect(pose.eye).toBe("closed");
    expect(pose.open).toBeLessThan(0.1);
    expect(pose.particles.some((particle) => particle.kind === "z")).toBe(true);
  });

  it("suit le pointeur, borné ; le survol agrandit les yeux", () => {
    const robot = new RobotMotion({ random: seeded([0.5]), now: 0 });
    robot.lookAt(pointerToLook(5000, 0, 80));
    robot.hover(true);
    run(robot, 0, 1);
    expect(robot.pose().yaw).toBeGreaterThan(0.5);
    expect(robot.pose().yaw).toBeLessThanOrEqual(1);
    expect(robot.pose().eyeScale).toBeGreaterThan(1.1);
  });

  it("la danse s'annule à niveau 0", () => {
    expect(danceTransform(1.234, 0)).toEqual({ dx: 0, dy: -0, rotate: 0, sx: 1, sy: 1 });
  });
});
