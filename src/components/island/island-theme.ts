/** Chaque couleur devient « var(--isl-<nom>, <couleur>) » : un parent peut la changer, sinon elle reste la même. */
export function islandTheme<T extends Record<string, string | number>>(colors: T): { [K in keyof T]: T[K] extends string ? string : T[K] } {
  return Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, typeof value === "string" ? `var(--isl-${key}, ${value})` : value])) as never;
}

/**
 * L'habit de la bannière choisi par le fondateur le 19 oct. 2026 (essai « C — Vert PharmaBoost » de /robot-apercu/styles) : vert
 * profond et jaune citron, comme le site et Instagram, texte plus gras.
 */
export const PHARMABOOST_GREEN = {
  bg: "#0F2F2A",
  accent: "#E8FF9C",
  glow: "#E8FF9C",
  panel: "#F4F8F6",
  ink: "#0F2F2A",
  inkSoft: "#4D6B64",
  line: "#DCE7E2",
  cell: "#E9F1EE",
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

/**
 * La carte de la bannière « mix » en sombre (essai « 9 · Tout sombre » de /robot-apercu/fonds, choisi par le fondateur le 19 oct.
 * 2026) : carte vert foncé, texte blanc ; `raised` est la surface qui ressort (onglet choisi, réponses, phrase à dire).
 */
export const MIX_DARK = {
  panel: "#12403A",
  cell: "#1B5249",
  raised: "#0F2F2A",
  ink: "#F2FFF9",
  inkSoft: "#BFD9D0",
  line: "rgba(255,255,255,0.14)",
  pickLine: "rgba(255,255,255,0.28)",
  numberFg: "#9BE7C4",
  dateBg: "rgba(255,120,110,0.18)",
  dateFg: "#FFB4AC",
  lowFg: "#FFC46B",
  outFg: "#FF9A9A",
};
