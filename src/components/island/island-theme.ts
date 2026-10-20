/** Chaque couleur devient « var(--isl-<nom>, <couleur>) » : un parent peut la changer, sinon elle reste la même. */
export function islandTheme<T extends Record<string, string | number>>(colors: T): { [K in keyof T]: T[K] extends string ? string : T[K] } {
  return Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, typeof value === "string" ? `var(--isl-${key}, ${value})` : value])) as never;
}

/**
 * L'habit de la bannière choisi par le fondateur le 19 oct. 2026 (essai « C — Vert PharmaBoost » de /robot-apercu/styles) : vert
 * profond et jaune citron, comme le site et Instagram, texte plus gras. Le soir même, la carte où se lit le texte passe en crème
 * (essai « 2 · Carte crème » de /robot-apercu/fonds).
 */
export const PHARMABOOST_GREEN = {
  bg: "#0E3B33",
  accent: "#E8FF9C",
  glow: "#E8FF9C",
  panel: "#FFF8EC",
  ink: "#0F2F2A",
  inkSoft: "#4D6B64",
  line: "#EEDFC4",
  cell: "#F6EBD6",
  pick: "#247061",
  pickLine: "#B9CFC6",
  number: "rgba(36,112,97,0.14)",
  numberFg: "#247061",
  then: "rgba(232,255,156,0.55)",
  soldBg: "#247061",
  soldFg: "#FFFFFF",
  challengeBg: "#E8FF9C",
  challengeFg: "#3D4F00",
};
