/**
 * DNA Ink — scene settings.
 *
 * Ported verbatim from the `dna-ink.html` reference sketch (the values the
 * in-browser control panel produced). This module is the single source of truth
 * for the look: every number below is fed to a shader uniform in `scene.ts`, so
 * tuning the scene means editing this file — never the render code.
 *
 * Amethyst / violet jewel palette on white paper. A rotating DNA double helix
 * continuously sheds ink-in-water plumes: every ink point is born on the strand,
 * then advected outward by an evolving simplex-noise flow, growing and fading
 * like dye diffusing through water.
 *
 * Adapté de Dantora (github : projet « dantora », domaine public — licence Unlicense,
 * copie autorisée) : src/lib/scene/dna-ink/config.ts. Recopié tel quel ; seuls changent
 * cet en-tête..
 */

/** `#rrggbb` — the only literal form the scene shaders accept. */
export type HexColor = `#${string}`;

export interface DnaInkConfig {
  /** Clear colour of the water/paper. */
  bgColor: HexColor;
  /** Inactive on a white background — kept so the flame composite can be revived. */
  flameColor: HexColor;
  /** Inactive on a white background. */
  flameColor2: HexColor;
  /** Flame mix amount. `0` disables the flame composite entirely. */
  flameAmt: number;

  /** Faint suspended sediment drifting with the camera (multiply-blended). */
  atmoColor: HexColor;
  atmoCount: number;
  atmoSize: number;
  atmoSpeed: number;

  /** Strand core — saturated violet. */
  helixColorA: HexColor;
  /** Strand base — deep violet. */
  helixColorB: HexColor;
  /** Ink at birth. */
  inkCore: HexColor;
  /** Ink mid-life. */
  inkMid: HexColor;
  /** Ink far edge — pale lavender, fades into the white. */
  inkEdge: HexColor;

  /** Strand + rung point count. Changing it rebuilds the geometry. */
  helixCount: number;
  /** Ink plume point count. Changing it rebuilds the geometry. */
  inkCount: number;

  /** Camera distance — frames the whole strand. */
  camDist: number;
  helixSize: number;
  inkSize: number;
  brightness: number;
  helixOpacity: number;
  inkOpacity: number;
  /** How much an ink point swells over its life. */
  inkGrow: number;

  /** Helix coil radius. */
  radius: number;
  /** Half-height of the strand. */
  height: number;
  /** Coils per world unit. */
  twist: number;
  /** Strand jitter thickness. */
  strandThick: number;
  /** Slow breathing sway of the whole helix. */
  wave: number;

  /** Helix rotation speed (rad/s). */
  spin: number;
  /** Lean of the helix (z tilt, radians). */
  tilt: number;

  /** Ink life-cycle speed (cycles/sec). */
  emitRate: number;
  /** Radial diffusion distance. */
  spread: number;
  /** Vertical drift of the ink. */
  rise: number;
  /** Noise-driven swirl amount. */
  turbulence: number;
  /** Spatial scale of the flow field. */
  noiseFreq: number;
  /** How fast the flow field morphs. */
  noiseEvolve: number;

  /** Mouse camera parallax. */
  parallax: number;

  /** World radius the cursor deforms within. */
  pointerRadius: number;
  /** How hard points are pushed away from the cursor. */
  pointerStrength: number;

  /**
   * Upper bound on `devicePixelRatio`.
   *
   * Not in the original sketch, which rendered at the raw DPR. A 3× phone
   * renders 9× the fragments for ~47k additive point sprites, which is the
   * difference between 60 fps and a slideshow — so the port clamps it.
   * Raise to `3` to reproduce the sketch exactly on a high-DPI display.
   */
  maxPixelRatio: number;
}

export const DNA_INK_CONFIG: DnaInkConfig = {
  bgColor: "#eff4f2",
  flameColor: "#246f65",
  flameColor2: "#57a298",
  flameAmt: 0.12,
  atmoColor: "#247063",
  atmoCount: 1500,
  atmoSize: 0,
  atmoSpeed: 0.6,

  helixColorA: "#247061",
  helixColorB: "#4ca98a",
  inkCore: "#81a297",
  inkMid: "#f7fec3",
  inkEdge: "#246f65",

  helixCount: 40000,
  inkCount: 160000,

  camDist: 12,
  helixSize: 1,
  inkSize: 6,
  brightness: 0.4,
  helixOpacity: 1.54,
  inkOpacity: 0.86,
  inkGrow: 1.8,

  radius: 1.75,
  height: 6.8,
  twist: 0.65,
  strandThick: 0.39,
  wave: 0.5,

  // 0 = the helix holds one fixed pose, which is what the design calls for.
  // Raise it (the sketch used 0.34) to bring the slow rotation back.
  spin: 0,
  tilt: -0.34,

  emitRate: 0.19,
  spread: 0.6,
  rise: -0.2,
  turbulence: 1.6,
  noiseFreq: 1.05,
  noiseEvolve: 0.1,

  parallax: 3,

  pointerRadius: 5,
  pointerStrength: 1.55,

  maxPixelRatio: 1.5,
};
