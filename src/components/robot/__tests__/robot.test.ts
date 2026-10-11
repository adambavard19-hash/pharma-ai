import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ROBOT_MOODS } from "@/core/robot/mascot";
import { faceFor, Robot } from "../robot";
import { robotCss } from "../robot-css";

const render = (props: Parameters<typeof Robot>[0]) => renderToStaticMarkup(createElement(Robot, props));

describe("le robot, rendu serveur", () => {
  it.each(ROBOT_MOODS)("dessine l'humeur « %s »", (mood) => {
    const html = render({ mood, size: 80 });
    expect(html).toContain(`data-mood="${mood}"`);
    expect(html).toContain(`data-face="${faceFor(mood, null, false)}"`);
    expect(html).toContain("rbt-eo");
    expect(html).toContain('aria-hidden="true"');
  });

  it("est décoratif par défaut, lisible avec un label", () => {
    const html = render({ label: "Le robot PharmaBoost" });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Le robot PharmaBoost"');
    expect(html).not.toContain("aria-hidden");
  });

  it("s'immobilise quand on le demande, et la feuille de style suit le réglage du système", () => {
    expect(render({ mood: "celebrate", motion: "reduce" })).toContain('data-motion="reduce"');
    const css = robotCss();
    expect(css).toContain("@media (prefers-reduced-motion:reduce)");
    expect(css).toContain(".rbt[data-motion=reduce] *{animation:none!important");
  });

  it("se simplifie en dessous de 32 px, flotte avec son ombre quand demandé", () => {
    expect(render({ size: 24 })).toContain('data-tiny=""');
    expect(render({ size: 48 })).not.toContain('data-tiny=""');
    expect(render({ floating: true })).toContain('class="rbt-shadow"');
    expect(render({})).not.toContain('class="rbt-shadow"');
  });

  it("deux robots sur la même page n'emmêlent pas leurs dégradés", () => {
    const html = renderToStaticMarkup(createElement("div", null, createElement(Robot, { key: 1 }), createElement(Robot, { key: 2 })));
    const ids = [...html.matchAll(/id="([^"]+-shell)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(2);
  });

  it("l'expression : le geste l'emporte sur l'humeur, le sommeil seulement au repos", () => {
    expect(faceFor("concerned", "dizzy", false)).toBe("dizzy");
    expect(faceFor("idle", "giggle", false)).toBe("happy");
    expect(faceFor("celebrate", null, false)).toBe("happy");
    expect(faceFor("idle", null, true)).toBe("sleepy");
    expect(faceFor("concerned", null, true)).toBe("concerned");
  });
});
