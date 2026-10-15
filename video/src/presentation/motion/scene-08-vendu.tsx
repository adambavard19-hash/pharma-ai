import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, staticFile } from "remotion";
import { evolvePath, getLength, getPointAtLength, getTangentAtLength } from "@remotion/paths";
import { noise2D } from "@remotion/noise";
import { Check, ScanBarcode, Send, Star, X } from "lucide-react";
import { Mascot, type Track } from "../mascot";
import {
  Backdrop,
  Camera,
  DotGrid,
  Dust,
  EXIT,
  F,
  GOLD_METAL,
  IN_OUT,
  JAKARTA,
  LINEAR,
  MONO,
  MotionBlur,
  Odometer,
  POP,
  PB,
  SNAP,
  Sparks,
  Spot,
  WHIP,
  Word,
  clamp01,
  cue,
  glassStyle,
  hash,
  keys,
  label,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  tween,
  wobble,
  type Cue,
} from "./kit";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S8 · VENDU ! — voix P10 (« Vous le proposez… et hop, vendu ! ») et P11 (« Le patient le souhaite ? Son bilan part
 * par e-mail. »). Fenêtre : P10.start − 0,15 → P12.start.
 *
 *   ENTRÉE      la scène arrive de la droite en fouet (10 images WHIP, flou de mouvement, couches en parallaxe).
 *   PROPOSEZ    mot en contour AU-DESSUS du panneau (jamais coupé par la carte), qui dérive, vague de lettres continue ;
 *               le curseur (le pharmacien) entre en courbe avec sa traînée, s'aimante sur « ✓ Vendu » (deux dépassements) ;
 *               le bouton respire (1 → 1,05 à 2 Hz, anneaux) ; le robot se penche, montre le bouton (arc pointillé), clin d'œil.
 *   HOP         clic : curseur écrasé, bouton .94 → 1,08 → 1, onde de choc et ondulation.
 *   VENDU       temps d'arrêt de 2 images, ombre du tampon qui arrive, tampon « VENDU ! » (encre texturée, −8°,
 *               1,6 → 1 en 6 images), éclaboussures, secousse de 12 px, vague dans la grille ; carte verte + coche ;
 *               12 pièces « € » qui jaillissent et rebondissent ; « Conseils vendus » passe à 1 AU TAMPON (+1 qui monte).
 *   P11         le panneau remonte (.8) et recule (assombri, flou) ; l'enveloppe (×1,5, sous la carte, flottante) se
 *               déplie en 0,5 s (3 plis en rotateX) ; « Envoyer le bilan » pulse (anneaux) ; le curseur clique dessus ;
 *               la feuille du bilan sort de l'enveloppe et s'écrit (3 lignes tapées, chaque coche claque : anneau +
 *               étincelles) pendant que la caméra pousse vers elle, jusqu'à « Son bilan », puis glisse dedans ; le rabat se
 *               ferme, cachet menthe ; l'enveloppe se replie en avion (3 étapes), décolle sur « part », fait un looping
 *               au-dessus du robot et sort en haut à droite sur une traînée pointillée ; toast « Envoyé ✓ » après « e-mail ».
 *   SORTIE      la traînée devient pleine et se rassemble en un trait : le soulignement du grand bouton
 *               « Vente terminée », apparu à la place des boutons. Relais à S9 : panneau (1240, 470) échelle 1,
 *               bouton « Vente terminée », robot en place.
 * ======================================================================== */

const MINT = PB.mint;
const MINT2 = PB.mint2;
const INK = PB.ink;
const STOCK = PB.stock;

// ---- Géométrie (px du cadre 1920×1080) ------------------------------------------------------------------------
const ROBOT = { cx: 440, feet: 960, size: 420 };
const PANEL = { cx: 1240, cy: 470, w: 980, h: 520 };
const CARD = { x: 30, y: 66, w: 920, h: 284 };
const BTN = { w: 300, h: 76, gap: 24 };
const ROW_Y = PANEL.h - 70 - BTN.h; // 374 (local au panneau)
const VENDU_X = (PANEL.w - (2 * BTN.w + BTN.gap)) / 2; // 178
const NON_X = VENDU_X + BTN.w + BTN.gap; // 502
const FINAL_BTN = { x: (PANEL.w - 480) / 2, y: ROW_Y - 6, w: 480, h: 88 };
/** Centre de « ✓ Vendu » à l'écran, panneau au repos. */
const VENDU_C = { x: PANEL.cx - PANEL.w / 2 + VENDU_X + BTN.w / 2, y: PANEL.cy - PANEL.h / 2 + ROW_Y + BTN.h / 2 };
/** Le panneau remonté pendant P11 (laisse la place à l'enveloppe, sous la carte). */
const PANEL_UP = { cy: 352, s: 0.8 };
/** L'enveloppe : dessinée en 300 × 190, affichée à ×1,5, centrée sous la carte ; bas ≤ 860 (bande des sous-titres). */
const ENV = { cx: PANEL.cx, cy: 708, w: 300, h: 190 };
const ENV_S = 1.5;
const ENV_BOB = (t: number) => wobble(t, 11, 6, 2.2); // flottement ±6 px (~1,7 s)
const SEND_BTN = { cx: ENV.cx + (ENV.w * ENV_S) / 2 + 60 + 150, cy: ENV.cy, w: 300, h: 64 };
const COUNTER = { right: 80, top: 96, w: 330, h: 56 };
const COUNTER_DIGITS = { x: 1920 - COUNTER.right - 46, y: COUNTER.top + COUNTER.h / 2 };
const STAMP = { cx: 1010, cy: 500, rot: -8, w: 1180, h: 380 };
const UNDERLINE = { x0: 1000, x1: 1480, y: 690 };
const TOAST = { cx: 960, cy: 84, w: 250, h: 56 }; // haut à 56 px : jamais coupé par le cadre
const FLOOR = 900; // rebond des pièces, au-dessus de la bande des sous-titres
/** « PROPOSEZ » : au-dessus du panneau, décalé à gauche du compteur (qui est en haut à droite). */
const PROPOSE = { x: 940, y: 106, size: 208, drift: 60 }; // lettres ≈ 33 → 200 px : marge en haut, 10 px au-dessus du panneau
const STAMP_EASE = Easing.bezier(0.2, 0, 0.2, 1);
/** Un pli d'origami : démarre franc, dépasse un peu le plat, se pose. */
const FOLD_EASE = Easing.bezier(0.4, 0, 0.25, 1.22);

// ---- Les ancrages (voix mesurée) ----------------------------------------------------------------------------------
function anchorsOf(time: Time) {
  const W0 = time.win.S8.start;
  const W1 = time.win.S8.end;
  const P10 = time.A("P10", 0);
  const P10b = time.A("P10", 1);
  const HOP = P10b + 0.02; // « et hop »
  const VENDU = time.marks.vendu; // « vendu »
  const P11 = time.A("P11", 0);
  const BILAN = time.A("P11", 1);
  const MAIL = time.A("P11", 2);
  const P11Z = time.Z("P11");
  const CUR0 = P10 + 0.15; // le curseur entre
  const CUR1 = CUR0 + 0.6; // il se pose sur « ✓ Vendu »
  const LAND = VENDU + 6 * F; // le tampon touche
  const STAMP_OUT = LAND + 0.6;
  const COUNT = VENDU + 0.1; // « Conseils vendus » passe à 1, avec la secousse du tampon
  const UP = P11; // le panneau remonte
  const ENVT = P11 + 0.1; // l'enveloppe se déplie (0,5 s, 3 plis)
  const UNFOLD = 0.5;
  const SEND = P11 + 0.46; // « le souhaite » : bouton « Envoyer le bilan »
  const CLICK2 = SEND + 0.35; // le pharmacien clique « Envoyer le bilan »
  const CUR2 = CLICK2 - 0.42; // le curseur part de sa position de repos
  const SHEET = CLICK2 + 0.02; // la feuille sort de l'enveloppe et s'écrit (3 lignes) jusqu'à « Son bilan »
  const DOWN = Math.max(BILAN, SHEET + 0.62); // la feuille glisse dans l'enveloppe (sur « bilan »)
  const FLAP = DOWN + 12 * F; // le rabat se ferme
  const MORPH = Math.max(FLAP + 12 * F, MAIL - 0.2); // enveloppe → avion
  const TAKEOFF = MORPH + 10 * F; // « part »
  // Le tintement et le toast juste APRÈS « e-mail » (la voix s'éteint à 3,06 s du fichier, −40 dB ; Z = 3,16 s).
  const TOASTT = Math.max(MAIL + 0.45, P11Z - 0.06);
  const EXIT_T = P11Z - 0.16; // traînée → soulignement, boutons → « Vente terminée »
  return { W0, W1, P10, P10b, HOP, VENDU, P11, BILAN, MAIL, P11Z, CUR0, CUR1, LAND, STAMP_OUT, COUNT, UP, ENVT, UNFOLD, SEND, CLICK2, CUR2, SHEET, DOWN, FLAP, MORPH, TAKEOFF, TOASTT, EXIT_T };
}
type Anchors = ReturnType<typeof anchorsOf>;

// ---- Petites aides ------------------------------------------------------------------------------------------------
type Pt = [number, number];
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt => {
  const v = 1 - u;
  return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
};
const qbez = (p0: Pt, p1: Pt, p2: Pt, u: number): Pt => {
  const v = 1 - u;
  return [v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1]];
};
const mixPt = (a: Pt, b: Pt, k: number): Pt => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
/** L'aimant : 0 → 1 avec DEUX dépassements visibles (+47 %, puis +10 %), amorti en ~0,6 s. */
const magnet = (t: number, at: number) => (t < at ? 0 : 1 - Math.exp(-4.5 * (t - at)) * Math.cos(2 * Math.PI * 3 * (t - at)));
function mixHex(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, clamp01(k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
const poly = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
/** Le temps du monde : 2 images d'arrêt juste avant « vendu » (le temps suspendu avant le tampon). */
const worldTime = (t: number, a: Anchors) => (t >= a.VENDU - 2 * F && t < a.VENDU ? a.VENDU - 2 * F : t);

// ---- Le vol de l'avion : tracé, longueurs, échantillons (constants, calculés une fois) -----------------------------
const LOOP = { cx: 680, cy: 360, r: 130 };
const KL = 0.5523 * LOOP.r;
const RX = LOOP.cx + LOOP.r;
const APPROACH = `M ${ENV.cx} ${ENV.cy} C 1080 700, ${RX} 560, ${RX} ${LOOP.cy}`;
const LOOP_D =
  `C ${RX} ${LOOP.cy - KL}, ${LOOP.cx + KL} ${LOOP.cy - LOOP.r}, ${LOOP.cx} ${LOOP.cy - LOOP.r} ` +
  `C ${LOOP.cx - KL} ${LOOP.cy - LOOP.r}, ${LOOP.cx - LOOP.r} ${LOOP.cy - KL}, ${LOOP.cx - LOOP.r} ${LOOP.cy} ` +
  `C ${LOOP.cx - LOOP.r} ${LOOP.cy + KL}, ${LOOP.cx - KL} ${LOOP.cy + LOOP.r}, ${LOOP.cx} ${LOOP.cy + LOOP.r} ` +
  `C ${LOOP.cx + KL} ${LOOP.cy + LOOP.r}, ${RX} ${LOOP.cy + KL}, ${RX} ${LOOP.cy}`;
const EXIT_D = `C ${RX} 110, 1300 110, 2350 230`;
const FLIGHT = `${APPROACH} ${LOOP_D} ${EXIT_D}`;
type Sample = { s: number; x: number; y: number; a: number };
let FLIGHT_CACHE: { L1: number; L2: number; L3: number; samples: Sample[] } | null = null;
function flight() {
  if (FLIGHT_CACHE) return FLIGHT_CACHE;
  const L1 = getLength(APPROACH);
  const L2 = L1 + getLength(`M ${RX} ${LOOP.cy} ${LOOP_D}`);
  const L3 = getLength(FLIGHT);
  const N = 320;
  const samples: Sample[] = [];
  for (let i = 0; i < N; i++) {
    const s = (i / (N - 1)) * L3;
    const p = getPointAtLength(FLIGHT, s) ?? { x: ENV.cx, y: ENV.cy };
    const tg = getTangentAtLength(FLIGHT, s) ?? { x: 1, y: 0 };
    samples.push({ s, x: p.x, y: p.y, a: (Math.atan2(tg.y, tg.x) * 180) / Math.PI });
  }
  FLIGHT_CACHE = { L1, L2, L3, samples };
  return FLIGHT_CACHE;
}
function sampleAt(s: number): Sample {
  const { L3, samples } = flight();
  const f = clamp01(s / L3) * (samples.length - 1);
  const i = Math.min(samples.length - 2, Math.floor(f));
  const k = f - i;
  const A = samples[i];
  const B = samples[i + 1];
  let da = B.a - A.a;
  if (da > 180) da -= 360;
  if (da < -180) da += 360;
  return { s, x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k), a: A.a + da * k };
}
const TA = 0.3; // décollage → entrée du looping
const TLOOP = 0.42; // le looping
const TE = 0.38; // sortie (accélère)
/** Longueur d'arc parcourue `dt` secondes après le décollage (vitesse continue au looping, accélération en sortie). */
function arcAt(dt: number) {
  const { L1, L2, L3 } = flight();
  if (dt <= 0) return 0;
  if (dt < TA) {
    const u = dt / TA;
    return L1 * (0.85 * u + 0.15 * u * u);
  }
  if (dt < TA + TLOOP) return L1 + (L2 - L1) * ((dt - TA) / TLOOP);
  const tau = dt - TA - TLOOP;
  const v0 = (L2 - L1) / TLOOP;
  const acc = (2 * (L3 - L2 - v0 * TE)) / (TE * TE);
  return Math.min(L3, L2 + v0 * tau + 0.5 * acc * tau * tau);
}

// ---- Les pièces : physique analytique avec un rebond (partagée avec les effets sonores) ----------------------------
type CoinSpec = { x0: number; y0: number; vx: number; vy: number; hit: number; spin: number; delay: number };
const G_COIN = 3200;
function coinSpecs(a: Anchors): CoinSpec[] {
  return Array.from({ length: 12 }, (_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const vx = side * (150 + 300 * hash("S8coin-vx", i));
    const vy = -(820 + 330 * hash("S8coin-vy", i));
    const x0 = PANEL.cx + (hash("S8coin-x", i) - 0.5) * 360;
    const y0 = PANEL.cy - PANEL.h / 2 + CARD.y + 6;
    const delay = hash("S8coin-d", i) * 0.06;
    const hit = (-vy + Math.sqrt(vy * vy + 2 * G_COIN * (FLOOR - y0))) / G_COIN;
    return { x0, y0, vx, vy, hit: a.LAND + delay + hit, spin: 12 + 10 * hash("S8coin-s", i), delay };
  });
}

// ---- Le robot : sa piste (humeurs et regards calés sur la voix) --------------------------------------------------
function hostTrack(a: Anchors): Track {
  const flightLook = a.TAKEOFF + TA; // entrée du looping
  return {
    id: `S8-host-v2-${Math.round(a.VENDU * 1000)}-${Math.round(a.MAIL * 1000)}`,
    seed: 808,
    until: a.W1 + 0.4,
    events: [
      { t: 0, kind: "mood", mood: "idle" },
      { t: a.W0 + 0.05, kind: "glance", x: 0.55, y: 0.1, dur: 0.4 },
      { t: a.CUR0 + 0.1, kind: "glance", x: 0.85, y: 0.45, dur: 0.5 },
      { t: a.CUR1 - 0.12, kind: "mood", mood: "curious" },
      { t: a.CUR1 - 0.1, kind: "hover", on: true },
      { t: a.CUR1 - 0.05, kind: "glance", x: 1, y: 0.2, dur: 0.2 },
      { t: a.CUR1 + 0.08, kind: "emote", emote: "wink", dur: 0.42 },
      { t: a.CUR1 + 0.16, kind: "glance", x: 0.85, y: 0.3, dur: Math.max(0.1, a.HOP - a.CUR1 + 0.05) },
      { t: a.HOP, kind: "squash" },
      { t: a.HOP + 0.05, kind: "hover", on: false },
      { t: a.VENDU, kind: "mood", mood: "happy" },
      { t: a.VENDU + 0.02, kind: "emit", particle: "spark", count: 6 },
      { t: a.VENDU + 0.8, kind: "emote", emote: "proud", dur: 0.85 },
      { t: a.UP, kind: "mood", mood: "curious" },
      { t: a.UP + 0.05, kind: "glance", x: 0.8, y: 0.55, dur: 0.9 },
      { t: a.SEND + 0.05, kind: "glance", x: 0.95, y: 0.4, dur: 0.6 },
      { t: a.CUR2 + 0.2, kind: "blink" },
      { t: a.SHEET, kind: "glance", x: 0.8, y: -0.1, dur: 0.5 },
      { t: a.DOWN, kind: "glance", x: 0.8, y: 0.45, dur: 0.35 },
      { t: a.FLAP + 4 * F, kind: "blink" },
      { t: a.TAKEOFF, kind: "mood", mood: "happy" },
      { t: a.TAKEOFF + 0.1, kind: "glance", x: 0.65, y: 0.2, dur: 0.18 },
      { t: flightLook, kind: "glance", x: 0.45, y: -0.75, dur: 0.12 },
      { t: flightLook + 0.12, kind: "glance", x: 0.15, y: -1, dur: 0.12 },
      { t: flightLook + 0.24, kind: "glance", x: -0.2, y: -0.7, dur: 0.12 },
      { t: flightLook + 0.36, kind: "glance", x: 0.3, y: -0.5, dur: 0.12 },
      { t: flightLook + 0.48, kind: "glance", x: 0.85, y: -0.75, dur: 0.4 },
      { t: a.EXIT_T + 0.05, kind: "emote", emote: "wink", dur: 0.55 },
    ],
  };
}

// ---- Le curseur (c'est le pharmacien qui clique) ------------------------------------------------------------------
const TIP_VENDU: Pt = [VENDU_C.x + 14, VENDU_C.y + 10];
const REST: Pt = [1500, 820];
const TIP_SEND: Pt = [SEND_BTN.cx + 20, SEND_BTN.cy + 8];
function cursorAt(t: number, a: Anchors): { x: number; y: number; op: number } {
  if (t < a.CUR0) return { x: 1950, y: 1150, op: 0 };
  // 1. L'arc d'entrée (Bézier de la direction), les 40 derniers px AIMANTÉS : deux dépassements avant de se poser.
  const end1: Pt = [TIP_VENDU[0] + 34, TIP_VENDU[1] + 26];
  let p = bez([1950, 1150], [1700, 700], [1500, 900], end1, prog(t, a.CUR0, 0.52, SNAP));
  const mag = magnet(t, a.CUR0 + 0.44);
  p = [p[0] + (TIP_VENDU[0] - end1[0]) * mag, p[1] + (TIP_VENDU[1] - end1[1]) * mag];
  // Micro-tremblement de la main pendant le survol.
  const jit = clamp01((t - a.CUR1) / 0.2) * (1 - prog(t, a.VENDU + 0.5, 0.3));
  p = [p[0] + 1.6 * jit * noise2D("S8cur", t * 2.2, 0), p[1] + 1.6 * jit * noise2D("S8cur", 0, t * 2.2 + 3)];
  // 2. La main se détend (après le tampon).
  p = mixPt(p, REST, prog(t, a.VENDU + 0.55, 0.55, IN_OUT));
  // 3. Vers « Envoyer le bilan », aimanté.
  if (t >= a.CUR2) {
    const dur = Math.max(0.24, a.CLICK2 - a.CUR2 - 0.08);
    const end2: Pt = [TIP_SEND[0] + 22, TIP_SEND[1] + 18];
    let q = bez(REST, [REST[0] + 60, REST[1] + 40], [TIP_SEND[0] - 40, TIP_SEND[1] + 120], end2, prog(t, a.CUR2, dur, SNAP));
    const m2 = magnet(t, a.CUR2 + dur * 0.7);
    q = [q[0] + (TIP_SEND[0] - end2[0]) * m2, q[1] + (TIP_SEND[1] - end2[1]) * m2];
    p = q;
  }
  // 4. Il s'en va, en bas à droite.
  const out = prog(t, a.CLICK2 + 0.24, 0.5, EXIT);
  p = mixPt(p, [2010, 1160], out);
  return { x: p[0], y: p[1], op: clamp01((t - a.CUR0) / (3 * F)) * (1 - clamp01((out - 0.7) / 0.3)) };
}

function Pointer({ x, y, scale = 1, opacity = 1, ghost = false }: { x: number; y: number; scale?: number; opacity?: number; ghost?: boolean }) {
  // Pointe en (6, 4) du viewBox 32 → (12, 8) px.
  return (
    <svg
      width={64}
      height={64}
      viewBox="0 0 32 32"
      style={{ position: "absolute", left: x - 12, top: y - 8, overflow: "visible", opacity, transform: `scale(${scale})`, transformOrigin: "12px 8px", filter: ghost ? undefined : "drop-shadow(0 8px 12px rgba(0,0,0,.5))" }}
    >
      <path
        d="M 6 4 L 6 26 Q 6 28.2 7.7 26.8 L 12.4 22.6 L 16.4 30.6 Q 17.2 31.9 18.6 31.2 L 21.1 30 Q 22.4 29.2 21.7 27.9 L 17.8 20.3 L 24.4 19.9 Q 26.6 19.7 25 18.2 Z"
        fill={ghost ? rgba(MINT2, 0.6) : "#FFFFFF"}
        stroke={MINT}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CursorLayer({ t, a }: { t: number; a: Anchors }) {
  const c = cursorAt(t, a);
  if (c.op <= 0) return null;
  const press = 1 - 0.15 * pulse(t, a.HOP, 2 * F, 2 * F, 4 * F) - 0.15 * pulse(t, a.CLICK2, 2 * F, 2 * F, 4 * F);
  const ghosts = [1, 2, 3, 4, 5, 6].map((j) => {
    const g = cursorAt(t - j * 2 * F, a);
    const prev = cursorAt(t - j * 2 * F - F, a);
    const speed = Math.hypot(g.x - prev.x, g.y - prev.y) * 60;
    const op = lerp(0.5, 0.08, (j - 1) / 5) * clamp01(speed / 900) * g.op;
    return op > 0.01 ? <Pointer key={j} x={g.x} y={g.y} opacity={op} ghost /> : null;
  });
  return (
    <>
      {ghosts.reverse()}
      <Pointer x={c.x} y={c.y} scale={press} opacity={c.op} />
    </>
  );
}

// ---- Le panneau : position, carte, boutons -------------------------------------------------------------------------
function panelState(t: number, a: Anchors) {
  const up = prog(t, a.UP, 0.35, SNAP) * (1 - prog(t, a.EXIT_T + 8 * F, 0.26, SNAP));
  const calm = 1 - prog(t, a.W1 - 0.35, 0.3, IN_OUT);
  // Profondeur de champ : le panneau recule dès que l'enveloppe arrive (son rabat ouvert passe DEVANT les boutons),
  // puis franchement pendant que la feuille du bilan s'écrit.
  const dim = Math.max(0.6 * prog(t, a.ENVT + 0.1, 12 * F, IN_OUT), prog(t, a.SHEET, 8 * F, IN_OUT)) * (1 - prog(t, a.FLAP, 10 * F, IN_OUT));
  return { cx: PANEL.cx, cy: lerp(PANEL.cy, PANEL_UP.cy, up) + wobble(t, 4, 3) * calm, s: lerp(1, PANEL_UP.s, up), dim };
}

function ProductCard({ t, a }: { t: number; a: Anchors }) {
  const sold = prog(t, a.LAND, 10 * F, SNAP);
  const wash = prog(t, a.LAND, 18 * F, IN_OUT);
  const badge = prog(t, a.LAND + 2 * F, 12 * F, POP);
  const check = evolvePath(prog(t, a.LAND + 4 * F, 10 * F, SNAP), "M 23 39 L 34 50 L 54 28");
  const stockPulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.2);
  const shine = ((t - a.W0) * 0.55) % 1;
  return (
    <div
      style={{
        position: "absolute",
        left: CARD.x,
        top: CARD.y,
        width: CARD.w,
        height: CARD.h,
        borderRadius: 24,
        background: "#FFFFFF",
        boxShadow: `0 0 0 ${3 * sold}px ${STOCK}, 0 0 ${48 * sold}px ${rgba(STOCK, 0.5 * sold)}, 0 30px 80px rgba(0,0,0,.45)`,
      }}
    >
      <div style={{ position: "absolute", inset: 0, borderRadius: 24, overflow: "hidden" }}>
        {/* La carte passe au vert : un lavis qui balaie de gauche à droite. */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${rgba(STOCK, 0.12)}, ${rgba(STOCK, 0.05)})`, clipPath: `inset(0 ${100 - 100 * wash}% 0 0)` }} />
        {/* Reflet qui traverse (vie permanente). */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(105deg, transparent ${shine * 180 - 40}%, rgba(255,255,255,.7) ${shine * 180 - 30}%, transparent ${shine * 180 - 20}%)`, mixBlendMode: "soft-light" }} />
      </div>
      <div style={{ position: "absolute", left: 32, top: 42, width: 200, height: 200, borderRadius: 20, background: "linear-gradient(160deg, #F4F8FA, #E6EEF2)", overflow: "hidden" }}>
        <Img src={staticFile("produits/boites/ultra-levure-200-mg.webp")} style={{ width: "100%", height: "100%", objectFit: "contain", transform: `translateY(${wobble(t, 9, 2)}px) rotate(${wobble(t, 5, 1.2)}deg)` }} />
      </div>
      <div style={{ position: "absolute", left: 262, top: 46, fontFamily: JAKARTA, fontWeight: 800, fontSize: 38, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap" }}>Ultra-Levure 200 mg</div>
      <div style={{ position: "absolute", right: 40, top: 48, fontFamily: MONO, fontWeight: 700, fontSize: 40, color: INK, fontVariantNumeric: "tabular-nums" }}>8,90 €</div>
      <div style={{ position: "absolute", left: 262, top: 106, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderRadius: 999, background: rgba(STOCK, 0.12), color: "#1B794A", fontFamily: JAKARTA, fontWeight: 600, fontSize: 18 }}>
          <span style={{ width: 9, height: 9, borderRadius: 9, background: STOCK, boxShadow: `0 0 0 ${3 + 4 * stockPulse}px ${rgba(STOCK, 0.18 * (1 - stockPulse))}` }} />
          En stock
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 999, background: GOLD_METAL, color: INK, fontFamily: JAKARTA, fontWeight: 800, fontSize: 17, boxShadow: `0 4px 14px ${rgba(PB.gold, 0.35)}` }}>
          <Star size={16} fill={INK} strokeWidth={0} />
          Challenge
        </div>
      </div>
      <div style={{ position: "absolute", left: 262, top: 164, width: 620, fontFamily: JAKARTA, fontWeight: 600, fontSize: 25, lineHeight: 1.32, color: "#2A333D" }}>
        Antibiotique : la flore intestinale peut être perturbée
      </div>
      {/* La coche verte, en haut à droite. */}
      {badge > 0 && (
        <div style={{ position: "absolute", left: CARD.w - 42, top: -36, width: 76, height: 76, transform: `scale(${badge})` }}>
          <svg width={76} height={76} viewBox="0 0 76 76" style={{ overflow: "visible", filter: `drop-shadow(0 8px 18px ${rgba(STOCK, 0.55)})` }}>
            <circle cx={38} cy={38} r={34} fill="#FFFFFF" stroke={STOCK} strokeWidth={4} />
            <path d="M 23 39 L 34 50 L 54 28" fill="none" stroke={STOCK} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={check.strokeDasharray} strokeDashoffset={check.strokeDashoffset} />
          </svg>
        </div>
      )}
    </div>
  );
}

function Buttons({ t, a }: { t: number; a: Anchors }) {
  const hover = prog(t, a.CUR1 - 0.08, 8 * F, SNAP) * (1 - prog(t, a.UP, 0.3));
  const press = keys(t, [
    [a.HOP, 1],
    [a.HOP + 4 * F, 0.94],
    [a.HOP + 10 * F, 1.08, SNAP],
    [a.HOP + 20 * F, 1, IN_OUT],
  ]);
  const m = prog(t, a.EXIT_T + 8 * F, 16 * F, SNAP); // → « Vente terminée »
  const swap = prog(t, a.EXIT_T + 10 * F, 12 * F, SNAP);
  const sold = prog(t, a.LAND, 8 * F, SNAP);
  const sweep = t < a.LAND ? prog(t, a.CUR1 + 0.04, 0.36, IN_OUT) : prog(t, a.LAND + 2 * F, 16 * F, IN_OUT);
  const x = lerp(VENDU_X, FINAL_BTN.x, m);
  const y = lerp(ROW_Y, FINAL_BTN.y, m);
  const w = lerp(BTN.w, FINAL_BTN.w, m);
  const h = lerp(BTN.h, FINAL_BTN.h, m);
  // Dès que le curseur se pose : le bouton RESPIRE (1 → 1,05 à 2 Hz) et lâche des anneaux, jusqu'au clic.
  const breath = t >= a.CUR1 ? 0.025 * (1 - Math.cos(2 * Math.PI * 2 * (t - a.CUR1))) * (1 - prog(t, a.HOP, 4 * F)) : 0;
  const sc = (1 + 0.02 * hover + breath) * press;
  const rings = [0, 1, 2].map((k) => a.CUR1 + k * 0.25).filter((at) => at < a.HOP - 0.05);
  const ripple = prog(t, a.HOP, 18 * F, SNAP);
  const non = prog(t, a.HOP, 8 * F, SNAP);
  const collapse = prog(t, a.EXIT_T + 6 * F, 8 * F, SNAP);
  const finalPulse = 1 + 0.025 * pulse(t, a.EXIT_T + 22 * F, 3 * F, 0, 8 * F);
  return (
    <>
      {/* ✕ Non vendu */}
      {collapse < 1 && (
        <div
          style={{
            position: "absolute",
            left: NON_X,
            top: ROW_Y,
            width: BTN.w,
            height: BTN.h,
            borderRadius: 999,
            border: "2px solid rgba(255,255,255,.3)",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            color: "rgba(255,255,255,.8)",
            fontFamily: JAKARTA,
            fontWeight: 700,
            fontSize: 28,
            opacity: (1 - 0.55 * non) * (1 - collapse),
            transform: `scale(${(1 - 0.03 * non) * (1 - collapse)}, ${1 - 0.03 * non})`,
            transformOrigin: "0% 50%",
          }}
        >
          <X size={26} strokeWidth={3} />
          Non vendu
        </div>
      )}
      {/* Les anneaux de la respiration (derrière le bouton). */}
      {rings.map((at) => {
        const k = prog(t, at, 0.5, SNAP);
        if (t < at || k >= 1) return null;
        const g = 46 * k;
        return <div key={at} style={{ position: "absolute", left: VENDU_X - g, top: ROW_Y - g, width: BTN.w + 2 * g, height: BTN.h + 2 * g, borderRadius: 999, border: `${3 * (1 - 0.5 * k)}px solid ${rgba(MINT2, 0.85 * (1 - k))}`, boxShadow: `0 0 22px ${rgba(MINT, 0.4 * (1 - k))}` }} />;
      })}
      {/* ✓ Vendu → Vente terminée */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: 999,
          transform: `translate(${4 * hover}px, ${3 * hover}px) scale(${sc * finalPulse})`,
          boxShadow: `0 0 ${40 * hover + 30 * sold * (1 - m)}px ${rgba(MINT, 0.6 * Math.max(hover, 0.6 * sold) * (1 - m))}, 0 14px 30px rgba(0,0,0,.35)`,
          overflow: "hidden",
          background: MINT,
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${PB.teal2}, ${PB.teal})`, opacity: m }} />
        {ripple > 0 && ripple < 1 && (
          <div style={{ position: "absolute", left: TIP_VENDU[0] - (VENDU_C.x - BTN.w / 2) - 170 * ripple * 2, top: TIP_VENDU[1] - (VENDU_C.y - BTN.h / 2) - 170 * ripple * 2, width: 340 * ripple * 2, height: 340 * ripple * 2, borderRadius: "50%", background: `rgba(255,255,255,${0.5 * (1 - ripple)})` }} />
        )}
        {sweep > 0 && sweep < 1 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(105deg, transparent ${sweep * 160 - 40}%, rgba(255,255,255,.75) ${sweep * 160 - 25}%, transparent ${sweep * 160 - 10}%)` }} />}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: INK, fontFamily: JAKARTA, fontWeight: 800, fontSize: 28, transform: `translateY(${-110 * swap}%)` }}>
          <Check size={28} strokeWidth={3.6} style={{ transform: `scale(${1 + 0.35 * pulse(t, a.LAND, 3 * F, 0, 12 * F)})` }} />
          Vendu
        </div>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 32, letterSpacing: "-0.01em", transform: `translateY(${110 * (1 - swap)}%)` }}>Vente terminée</div>
      </div>
    </>
  );
}

function Panel({ t, a }: { t: number; a: Anchors }) {
  const p = panelState(t, a);
  const sheen = ((t - a.W0) * 0.32 + 0.2) % 1;
  return (
    <div style={{ position: "absolute", left: p.cx - PANEL.w / 2, top: p.cy - PANEL.h / 2, width: PANEL.w, height: PANEL.h, transform: `scale(${p.s})`, transformOrigin: "50% 50%", filter: p.dim > 0.01 ? `brightness(${1 - 0.42 * p.dim}) blur(${2.5 * p.dim}px)` : undefined }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 32,
          ...glassStyle("dark", 0.6 + 0.4 * pulse(t, a.LAND, 3 * F, 0.2, 0.5)),
          background: "linear-gradient(160deg, rgba(22,32,41,.94), rgba(11,15,20,.94))",
          border: `1.5px solid ${rgba(MINT, 0.35)}`,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,.10), transparent 40%)" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(110deg, transparent ${sheen * 160 - 40}%, rgba(255,255,255,.07) ${sheen * 160 - 25}%, transparent ${sheen * 160 - 10}%)` }} />
      </div>
      {/* En-tête : le conseil et la boîte scannée. */}
      <div style={{ position: "absolute", left: 34, top: 22, display: "flex", alignItems: "center", gap: 10, ...label(18), color: rgba(MINT2, 0.9) }}>
        <span style={{ width: 10, height: 10, borderRadius: 10, background: MINT, boxShadow: `0 0 ${8 + 8 * Math.sin(t * 6)}px ${MINT}` }} />
        Conseil
      </div>
      <div style={{ position: "absolute", right: 34, top: 16, display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 14px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.82)", fontFamily: JAKARTA, fontWeight: 600, fontSize: 18 }}>
        <ScanBarcode size={18} color={MINT2} strokeWidth={2.4} />
        Doxycycline 100 mg
      </div>
      <ProductCard t={t} a={a} />
      <Buttons t={t} a={a} />
    </div>
  );
}

// ---- Le tampon « VENDU ! » --------------------------------------------------------------------------------------------
function Stamp({ t, a }: { t: number; a: Anchors }) {
  if (t < a.VENDU - 5 * F || t > a.STAMP_OUT + 7 * F) return null;
  const incoming = clamp01((t - (a.VENDU - 5 * F)) / (5 * F));
  const slam = prog(t, a.VENDU, 6 * F, STAMP_EASE);
  const settle = keys(t, [
    [a.LAND, 1],
    [a.LAND + 2 * F, 0.97],
    [a.LAND + 7 * F, 1, POP],
  ]);
  // Sortie COURTE (6 images) : le tampon se soulève (×1,08) et se floute — pas de long fondu boueux sur la carte.
  const out = prog(t, a.STAMP_OUT, 6 * F, IN_OUT);
  const scale = (t < a.VENDU ? 1.6 : lerp(1.6, 1, slam)) * settle * (1 + 0.08 * out);
  const op = (t < a.VENDU ? 0 : clamp01((t - a.VENDU) / (2 * F))) * (1 - out);
  const hold = clamp01((t - a.LAND) / 0.6);
  // Ombre du tampon qui arrive (avant le contact), puis ombre portée.
  const shadowScale = t < a.VENDU ? lerp(1.5, 1.15, incoming) : lerp(1.15, 1.02, slam);
  const shadowOp = (t < a.VENDU ? 0.45 * incoming : lerp(0.45, 0.3, slam)) * (1 - out);
  return (
    <div style={{ position: "absolute", left: STAMP.cx, top: STAMP.cy, width: 0, height: 0 }}>
      <div style={{ position: "absolute", left: -STAMP.w / 2, top: -STAMP.h / 2 + 24, width: STAMP.w, height: STAMP.h, borderRadius: 48, background: "rgba(0,0,0,.9)", filter: "blur(30px)", opacity: shadowOp, transform: `rotate(${STAMP.rot}deg) scale(${shadowScale})` }} />
      <div style={{ position: "absolute", left: -STAMP.w / 2, top: -STAMP.h / 2, width: STAMP.w, height: STAMP.h, opacity: op, transform: `rotate(${STAMP.rot + 1.5 * (1 - slam)}deg) scale(${scale})`, filter: `${out > 0 ? `blur(${(7 * out).toFixed(2)}px) ` : ""}drop-shadow(0 0 18px ${rgba(MINT, 0.75)}) drop-shadow(0 0 60px ${rgba(MINT, 0.35)})` }}>
        <svg width={STAMP.w} height={STAMP.h} viewBox={`0 0 ${STAMP.w} ${STAMP.h}`} style={{ overflow: "visible" }}>
          <defs>
            <filter id="s8-ink" x="-4%" y="-8%" width="108%" height="116%">
              <feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves={2} seed={8} result="warp" />
              <feDisplacementMap in="SourceGraphic" in2="warp" scale={7} xChannelSelector="R" yChannelSelector="G" result="rough" />
              <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves={3} seed={3} result="grain" />
              <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -14 0 0 0 9.5" result="holes" />
              <feComposite in="rough" in2="holes" operator="in" />
            </filter>
            <linearGradient id="s8-ink-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={MINT2} />
              <stop offset="1" stopColor={MINT} />
            </linearGradient>
          </defs>
          {/* Plaque d'encre sombre : le tampon reste lisible sur la carte blanche comme sur le fond. */}
          <rect x={20} y={20} width={STAMP.w - 40} height={STAMP.h - 40} rx={44} fill="rgba(8,14,18,.86)" />
          <g filter="url(#s8-ink)">
            <rect x={20} y={20} width={STAMP.w - 40} height={STAMP.h - 40} rx={44} fill="none" stroke={MINT} strokeWidth={10} />
            <rect x={40} y={40} width={STAMP.w - 80} height={STAMP.h - 80} rx={30} fill="none" stroke={MINT} strokeWidth={3} opacity={0.7} />
            <text x={STAMP.w / 2} y={STAMP.h / 2 + 86} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={240} letterSpacing={-6} fill="url(#s8-ink-fill)">
              VENDU !
            </text>
          </g>
        </svg>
        {/* Reflet qui balaie l'encre fraîche. */}
        <div style={{ position: "absolute", inset: 20, borderRadius: 44, overflow: "hidden", mixBlendMode: "screen" }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, transparent ${hold * 150 - 30}%, rgba(255,255,255,.22) ${hold * 150 - 18}%, transparent ${hold * 150 - 6}%)` }} />
        </div>
      </div>
      <Splatter t={t} a={a} out={out} />
    </div>
  );
}

function Splatter({ t, a, out }: { t: number; a: Anchors; out: number }) {
  if (t < a.LAND - F) return null;
  const k = prog(t, a.LAND - F, 10 * F, SNAP);
  const rot = (STAMP.rot * Math.PI) / 180;
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const ang = (i / 14) * Math.PI * 2 + hash("S8splat", i) * 0.35;
        // Départ sur le bord du tampon (ellipse), projeté radialement jusqu'à 260 px.
        const ex = Math.cos(ang) * (STAMP.w / 2 - 40);
        const ey = Math.sin(ang) * (STAMP.h / 2 - 30);
        const dist = (90 + 170 * hash("S8splat-d", i)) * k;
        const lx = ex + Math.cos(ang) * dist;
        const ly = ey + Math.sin(ang) * dist;
        const x = lx * Math.cos(rot) - ly * Math.sin(rot);
        const y = lx * Math.sin(rot) + ly * Math.cos(rot);
        const r = 4 + 10 * hash("S8splat-r", i);
        const stretch = 1 + 2.4 * (1 - k);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - r * stretch,
              top: y - r,
              width: 2 * r * stretch,
              height: 2 * r,
              borderRadius: 999,
              background: MINT,
              boxShadow: `0 0 12px ${rgba(MINT, 0.7)}`,
              transform: `rotate(${(ang + rot) * (180 / Math.PI)}deg)`,
              opacity: (1 - out) * (k > 0 ? 1 : 0),
            }}
          />
        );
      })}
    </>
  );
}

// ---- Les pièces « € » --------------------------------------------------------------------------------------------------
function EuroCoins({ t, a }: { t: number; a: Anchors }) {
  if (t < a.LAND || t > a.LAND + 1.3) return null;
  return (
    <>
      {coinSpecs(a).map((c, i) => {
        const u = t - a.LAND - c.delay;
        if (u < 0) return null;
        const t1 = c.hit - a.LAND - c.delay;
        let x: number;
        let y: number;
        if (u < t1) {
          x = c.x0 + c.vx * u;
          y = c.y0 + c.vy * u + 0.5 * G_COIN * u * u;
        } else {
          const v1 = c.vy + G_COIN * t1;
          const vb = -0.3 * v1;
          const ub = u - t1;
          x = c.x0 + c.vx * t1 + c.vx * 0.6 * ub;
          y = Math.min(FLOOR, FLOOR + vb * ub + 0.5 * G_COIN * ub * ub);
        }
        const flip = Math.cos(u * c.spin);
        const fade = 1 - clamp01((u - 0.85) / 0.3);
        const s = 36;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - s / 2,
              top: y - s / 2,
              width: s,
              height: s,
              borderRadius: "50%",
              background: `radial-gradient(circle at 34% 30%, #FFF4CF, ${PB.goldHi} 30%, ${PB.gold} 62%, ${PB.goldLo})`,
              border: `2px solid ${PB.goldLo}`,
              boxSizing: "border-box",
              transform: `scaleX(${Math.max(0.1, Math.abs(flip))}) rotate(${(u * 160 * (i % 2 ? 1 : -1)).toFixed(1)}deg)`,
              opacity: fade,
              boxShadow: "0 8px 16px rgba(0,0,0,.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: JAKARTA,
              fontWeight: 700,
              fontSize: 18,
              color: "#7A4A00",
            }}
          >
            {flip > 0 ? "€" : ""}
          </div>
        );
      })}
    </>
  );
}

// ---- « +1 » et le compteur « Conseils vendus » -------------------------------------------------------------------
/** Le « +1 » : il jaillit sous le compteur AU TAMPON et monte s'y fondre (cause → effet immédiat). */
function PlusOne({ t, a }: { t: number; a: Anchors }) {
  const u = t - a.COUNT;
  if (u < 0 || u > 0.75) return null;
  const k = prog(t, a.COUNT, 0.75, SNAP);
  const sc = keys(u, [
    [0, 0.4],
    [0.12, 1.3, POP],
    [0.3, 1, IN_OUT],
  ]);
  const op = clamp01(u / (2 * F)) * (1 - clamp01((u - 0.45) / 0.3));
  return (
    <div style={{ position: "absolute", left: COUNTER_DIGITS.x, top: COUNTER_DIGITS.y + 92 - 58 * k, transform: `translate(-50%, -50%) scale(${sc}) rotate(${-8 * (1 - k)}deg)`, fontFamily: JAKARTA, fontWeight: 800, fontSize: 36, color: MINT2, opacity: op, textShadow: `0 0 16px ${rgba(MINT, 0.9)}, 0 4px 10px rgba(0,0,0,.4)`, whiteSpace: "nowrap" }}>
      +1
    </div>
  );
}

function Counter({ t, a }: { t: number; a: Anchors }) {
  const enter = prog(t, a.W0 + 0.22, 0.4, SNAP);
  const leave = prog(t, a.TAKEOFF + 0.42, 0.25, EXIT);
  if (enter <= 0 || leave >= 1) return null;
  const bump = 1 + 0.14 * pulse(t, a.COUNT, 3 * F, 0, 14 * F);
  const glow = pulse(t, a.COUNT, 3 * F, 0.1, 0.5);
  const ring = prog(t, a.COUNT, 0.45, SNAP);
  return (
    <div
      style={{
        position: "absolute",
        right: COUNTER.right,
        top: COUNTER.top,
        width: COUNTER.w,
        height: COUNTER.h,
        borderRadius: 999,
        ...glassStyle("dark", 0.3 + glow),
        border: `1.5px solid ${rgba(MINT, 0.35 + 0.5 * glow)}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 22px 0 26px",
        boxSizing: "border-box",
        opacity: enter * (1 - leave),
        transform: `translate(${(1 - enter) * 80}px, ${-30 * leave}px) scale(${bump})`,
      }}
    >
      <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 20, color: "rgba(255,255,255,.78)" }}>Conseils vendus</span>
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 44 }}>
        {ring > 0 && ring < 1 && <span style={{ position: "absolute", left: "50%", top: "50%", width: 120 * ring, height: 120 * ring, marginLeft: -60 * ring, marginTop: -60 * ring, borderRadius: "50%", border: `3px solid ${rgba(MINT2, 1 - ring)}` }} />}
        <Odometer t={t} value={(tt) => tween(tt, a.COUNT, 0.3, 0, 1, SNAP)} digits={1} size={32} color={glow > 0.05 ? MINT2 : "#FFFFFF"} />
      </span>
    </div>
  );
}

// ---- L'enveloppe origami --------------------------------------------------------------------------------------------
const FLAP_D = "M 2 4 L 150 110 L 298 4 Z";
function ClosedEnvelope() {
  return (
    <svg width={ENV.w} height={ENV.h} viewBox={`0 0 ${ENV.w} ${ENV.h}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <defs>
        <linearGradient id="s8-env" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E7EFF2" />
        </linearGradient>
      </defs>
      <rect x={1} y={1} width={ENV.w - 2} height={ENV.h - 2} rx={14} fill="url(#s8-env)" stroke="#C9D6DB" strokeWidth={2} />
      <path d="M 8 184 L 134 98 M 292 184 L 166 98" stroke="#D3DDE1" strokeWidth={2} />
      <path d={FLAP_D} fill="#F4F8F9" stroke="#C9D6DB" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/** Une bande de l'enveloppe fermée (pli `i` : 0 haut, 1 milieu, 2 bas), dépliée en rotateX autour de sa charnière. */
const BAND_H = ENV.h / 3;
function Band({ i, ang }: { i: number; ang: number }) {
  const back = Math.abs(ang) > 90; // on voit le dos du papier
  const sin = Math.abs(Math.sin((ang * Math.PI) / 180));
  const shade = 0.34 * sin;
  // Le pli : une ombre le long de la charnière tant que la bande n'est pas à plat.
  const crease = i === 1 ? 0 : 0.5 * Math.min(1, Math.abs(ang) / 40);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: i * BAND_H,
        width: ENV.w,
        height: BAND_H + 0.5,
        overflow: "hidden",
        borderRadius: i === 0 ? "14px 14px 0 0" : i === 2 ? "0 0 14px 14px" : 0,
        transformOrigin: i === 0 ? "50% 100%" : i === 2 ? "50% 0%" : "50% 50%",
        // Perspective forte (bande de 300 px) : le pli se lit en trapèze, pas comme un rectangle qui grandit.
        transform: `perspective(${i === 1 ? 340 : 300}px) rotateX(${ang.toFixed(2)}deg)`,
        boxShadow: back ? undefined : `0 ${(8 * sin).toFixed(1)}px ${(18 * sin).toFixed(1)}px rgba(0,0,0,${(0.35 * sin).toFixed(3)})`,
      }}
    >
      {back ? (
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, #CFE4E5, #B7D3D6)`, border: "2px solid #A9C6CB", boxSizing: "border-box", borderRadius: "inherit" }}>
          {/* Le dos du papier : un filet menthe, pour qu'on voie bien la feuille se retourner. */}
          <div style={{ position: "absolute", left: 18, right: 18, top: "50%", height: 6, marginTop: -3, borderRadius: 6, background: rgba(MINT, 0.55) }} />
        </div>
      ) : (
        <div style={{ position: "absolute", left: 0, top: -i * BAND_H, width: ENV.w, height: ENV.h }}>
          <ClosedEnvelope />
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, background: `rgba(11,15,20,${shade.toFixed(3)})` }} />
      {crease > 0.01 && (
        <div style={{ position: "absolute", left: 0, right: 0, height: 14, [i === 0 ? "bottom" : "top"]: 0, background: `linear-gradient(${i === 0 ? "0deg" : "180deg"}, rgba(11,15,20,${crease.toFixed(3)}), transparent)` }} />
      )}
    </div>
  );
}

function Envelope({ t, a }: { t: number; a: Anchors }) {
  if (t < a.ENVT || t >= a.MORPH) return null;
  const T0 = a.ENVT;
  const pop = prog(t, T0, 10 * F, POP);
  // Le dépliage : 0,5 s, trois plis en rotateX (perspective), 0,12 s d'écart — le milieu s'ouvre, puis le haut, puis le bas.
  const FOLD = a.UNFOLD - 2 * 0.12;
  const f0 = prog(t, T0, FOLD, FOLD_EASE);
  const f1 = prog(t, T0 + 0.12, FOLD, FOLD_EASE);
  const f2 = prog(t, T0 + 0.24, FOLD, FOLD_EASE);
  const split = t < T0 + a.UNFOLD;
  const fo = prog(t, T0 + a.UNFOLD, 7 * F, SNAP); // puis le rabat s'ouvre
  let flapS = 1 - 2 * fo;
  if (t >= a.FLAP) flapS = lerp(-1, 1, prog(t, a.FLAP, 6 * F, POP));
  const bob = ENV_BOB(t);
  const sealK = prog(t, a.FLAP + 5 * F, 10 * F, POP);
  // Toute l'enveloppe arrive inclinée en 3D (vue de trois quarts) et se redresse pendant qu'elle se déplie.
  const tilt = 1 - prog(t, T0, a.UNFOLD + 0.12, IN_OUT);
  const box: CSSProperties = {
    position: "absolute",
    left: ENV.cx - ENV.w / 2,
    top: ENV.cy - ENV.h / 2 + bob,
    width: ENV.w,
    height: ENV.h,
    transform: `perspective(1200px) rotateY(${(-24 * tilt).toFixed(2)}deg) rotateX(${(22 * tilt).toFixed(2)}deg) scale(${(ENV_S * lerp(0.55, 1, pop)).toFixed(4)}) rotate(${(wobble(t, 3, 1.2) - 6 * tilt).toFixed(3)}deg)`,
    opacity: clamp01((t - a.ENVT) / (3 * F)),
  };
  // La feuille (unités de l'enveloppe) : elle sort de la poche (y 40 → −150), s'écrit, puis redescend (→ 24).
  const sheetIn = t >= a.SHEET;
  const sheetY = lerp(lerp(40, -150, prog(t, a.SHEET, 12 * F, POP)), 24, prog(t, a.DOWN, 12 * F, SNAP));
  const SH_W = 196;
  return (
    <>
      <div style={{ position: "absolute", left: ENV.cx - 200, top: ENV.cy + (ENV.h * ENV_S) / 2 - 16 + bob * 0.3, width: 400, height: 34, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(0,0,0,.42), transparent)", opacity: pop * (1 - 0.4 * clamp01(bob / 6)) }} />
      <div style={box}>
        {split ? (
          <>
            <Band i={1} ang={-72 * (1 - f0)} />
            <Band i={0} ang={-180 * (1 - f1)} />
            <Band i={2} ang={180 * (1 - f2)} />
          </>
        ) : (
          <>
            {flapS < 0 && <Flap s={flapS} />}
            <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(180deg, #CBD8DE, #DCE6EA)", border: "2px solid #C9D6DB", boxSizing: "border-box" }} />
            {sheetIn && (
              <div style={{ position: "absolute", left: -60, top: -440, width: ENV.w + 120, height: 440 + ENV.h - 2, overflow: "hidden" }}>
                <Sheet t={t} a={a} style={{ left: 60 + (ENV.w - SH_W) / 2, top: 440 + sheetY }} />
              </div>
            )}
            <svg width={ENV.w} height={ENV.h} viewBox={`0 0 ${ENV.w} ${ENV.h}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
              <defs>
                <linearGradient id="s8-pocket" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FFFFFF" />
                  <stop offset="1" stopColor="#E7EFF2" />
                </linearGradient>
              </defs>
              <path d="M 1 4 L 150 112 L 299 4 L 299 175 Q 299 189 285 189 L 15 189 Q 1 189 1 175 Z" fill="url(#s8-pocket)" stroke="#C9D6DB" strokeWidth={2} strokeLinejoin="round" />
              <path d="M 8 184 L 134 100 M 292 184 L 166 100" stroke="#D3DDE1" strokeWidth={2} />
            </svg>
            {flapS >= 0 && <Flap s={flapS} />}
            {sealK > 0 && (
              <div style={{ position: "absolute", left: 150 - 15, top: 108 - 15, width: 30, height: 30, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, ${MINT2}, ${MINT} 55%, ${PB.teal2})`, boxShadow: `0 0 16px ${rgba(MINT, 0.8)}`, transform: `scale(${sealK})` }} />
            )}
          </>
        )}
      </div>
      {sealK > 0 && sealK < 1.2 && <RingAt t={t} at={a.FLAP + 5 * F} x={ENV.cx} y={ENV.cy + (108 - ENV.h / 2) * ENV_S + bob} max={210} life={0.35} />}
      {/* Chaque pli qui se pose claque : petites étincelles aux coins de la charnière. */}
      {[
        { at: T0 + 0.12 + FOLD * 0.8, y: ENV.cy - (ENV.h * ENV_S) / 2, ang: [-145, -35] },
        { at: T0 + 0.24 + FOLD * 0.8, y: ENV.cy + (ENV.h * ENV_S) / 2, ang: [-158, -22] }, // vers les côtés et un peu vers le haut : rien dans la bande des sous-titres
      ].map((s, k) =>
        [0, 1].map((side) => (
          <Sparks key={`${k}${side}`} t={t} at={s.at} x={ENV.cx + (side ? 1 : -1) * (ENV.w * ENV_S) * 0.5} y={s.y + bob} count={5} speed={420} spread={30} angle={s.ang[side]} seed={`S8fold${k}${side}`} color={MINT2} len={16} life={0.32} width={2.5} />
        )),
      )}
    </>
  );
}

function Flap({ s }: { s: number }) {
  return (
    <svg width={ENV.w} height={ENV.h} viewBox={`0 0 ${ENV.w} ${ENV.h}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", transform: `scaleY(${s})`, transformOrigin: "50% 4px" }}>
      <path d={FLAP_D} fill={s < 0 ? "#E4ECEF" : "#F6F9FA"} stroke="#C9D6DB" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/** La feuille du bilan (unités de l'enveloppe, affichée ×1,5) : trois lignes TAPÉES, chacune cochée, entre le clic et « bilan ». */
const SHEET_ROWS = ["Doxycycline 100 mg", "Ultra-Levure 200 mg", "Conseils pratiques"];
/** Minutage des lignes : début de la frappe, durée d'une ligne, instant de la coche de la ligne i. */
function sheetTiming(a: Anchors) {
  const t0 = a.SHEET + 0.1;
  const slot = Math.max(0.12, (a.DOWN - 0.04 - t0) / 3);
  return { t0, slot, tick: (i: number) => t0 + i * slot + slot * 0.82 };
}
/** Position À L'ÉCRAN de la coche de la ligne i (feuille sortie : y −150 en unités de l'enveloppe, ×1,5 autour de son centre). */
const TICK_X = [163, 168, 155]; // fin du texte + coche, en px de la feuille (13 px gras)
const tickAt = (i: number, t: number): Pt => [ENV.cx + (52 + TICK_X[i] - ENV.w / 2) * ENV_S, ENV.cy + ENV_BOB(t) + (-80 + 30 * i - ENV.h / 2) * ENV_S];
function Sheet({ t, a, style }: { t: number; a: Anchors; style: CSSProperties }) {
  const pop = prog(t, a.SHEET, 10 * F, POP);
  const { t0, slot } = sheetTiming(a);
  const typed = (i: number) => clamp01((t - (t0 + i * slot)) / (slot * 0.82));
  const active = SHEET_ROWS.findIndex((_, i) => typed(i) < 1);
  const sway = 1 - prog(t, a.DOWN, 6 * F); // elle flotte, puis se range droit dans la poche
  return (
    <div
      style={{
        position: "absolute",
        width: 196,
        height: 232,
        borderRadius: 12,
        background: "#FFFFFF",
        boxShadow: "0 14px 34px rgba(0,0,0,.4)",
        transform: `translateY(${(wobble(t, 5, 5, 3.6) * sway).toFixed(2)}px) scale(${lerp(0.82, 1, pop)}) rotate(${((1 - pop) * -4 + wobble(t, 7, 2.2, 3.2) * sway).toFixed(3)}deg)`,
        transformOrigin: "50% 100%",
        opacity: clamp01((t - a.SHEET) / (3 * F)),
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: 6, background: `linear-gradient(90deg, ${PB.teal2}, ${MINT})` }} />
      <div style={{ position: "absolute", left: 16, top: 18, fontFamily: JAKARTA, fontWeight: 800, fontSize: 21, color: INK, letterSpacing: "-0.02em" }}>Bilan</div>
      <div style={{ position: "absolute", right: 16, top: 25, width: 34, height: 7, borderRadius: 4, background: "#E6ECEF" }} />
      {SHEET_ROWS.map((txt, i) => {
        const k = typed(i);
        const n = Math.round(k * txt.length);
        const tick = prog(t, t0 + i * slot + slot * 0.82, 8 * F, POP);
        return (
          <div key={txt} style={{ position: "absolute", left: 16, top: 60 + i * 30, display: "flex", alignItems: "center", gap: 6, height: 20 }}>
            <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 13, color: INK, whiteSpace: "pre" }}>{txt.slice(0, n)}</span>
            {i === active && k > 0 && <span style={{ width: 2, height: 15, borderRadius: 1, background: MINT, opacity: Math.floor(t * 12) % 2 === 0 ? 1 : 0.35 }} />}
            {tick > 0 && (
              <span style={{ display: "inline-flex", width: 17, height: 17, borderRadius: 17, background: rgba(MINT, 0.2), alignItems: "center", justifyContent: "center", transform: `scale(${tick})` }}>
                <Check size={12} color="#12A08A" strokeWidth={3.8} />
              </span>
            )}
          </div>
        );
      })}
      {[158, 174, 190].map((y, i) => (
        <div key={y} style={{ position: "absolute", left: 16, top: y, width: [150, 118, 136][i], height: 7, borderRadius: 4, background: "#EDF2F4", transform: `scaleX(${prog(t, t0 + 2.4 * slot + i * 0.05, 0.18, SNAP)})`, transformOrigin: "0 50%" }} />
      ))}
    </div>
  );
}

// ---- « Envoyer le bilan » -------------------------------------------------------------------------------------------
function SendButton({ t, a }: { t: number; a: Anchors }) {
  if (t < a.SEND) return null;
  const pop = prog(t, a.SEND, 12 * F, POP);
  const gone = prog(t, a.MORPH - 4 * F, 10 * F, EXIT);
  if (gone >= 1) return null;
  const beat = t < a.CLICK2 ? 1 + 0.02 + 0.02 * Math.sin((t - a.SEND) * Math.PI * 4 - Math.PI / 2) : 1;
  const hover = prog(t, a.CLICK2 - 0.2, 8 * F, SNAP);
  const press = keys(t, [
    [a.CLICK2, 1],
    [a.CLICK2 + 4 * F, 0.94],
    [a.CLICK2 + 10 * F, 1.06, SNAP],
    [a.CLICK2 + 18 * F, 1, IN_OUT],
  ]);
  const sent = prog(t, a.CLICK2 + 3 * F, 10 * F, SNAP);
  const spin = (t - a.CLICK2) * 540;
  // Anneaux de pulsation (forme du bouton) jusqu'au clic.
  const rings = [0.06, 0.2, 0.34].map((d) => a.SEND + d).filter((at) => at < a.CLICK2);
  return (
    <>
      {rings.map((at) => {
        const k = prog(t, at, 0.42, SNAP);
        if (t < at || k >= 1) return null;
        const g = 34 * k;
        return <div key={at} style={{ position: "absolute", left: SEND_BTN.cx - SEND_BTN.w / 2 - g, top: SEND_BTN.cy - SEND_BTN.h / 2 - g, width: SEND_BTN.w + 2 * g, height: SEND_BTN.h + 2 * g, borderRadius: 999, border: `${3 * (1 - 0.5 * k)}px solid ${rgba(MINT2, 0.8 * (1 - k))}`, boxShadow: `0 0 20px ${rgba(MINT, 0.35 * (1 - k))}` }} />;
      })}
    <div
      style={{
        position: "absolute",
        left: SEND_BTN.cx - SEND_BTN.w / 2,
        top: SEND_BTN.cy - SEND_BTN.h / 2,
        width: SEND_BTN.w,
        height: SEND_BTN.h,
        borderRadius: 999,
        background: `linear-gradient(135deg, ${PB.teal2}, ${PB.teal})`,
        border: `1.5px solid ${rgba(MINT, 0.45 + 0.4 * hover)}`,
        boxShadow: `0 0 ${26 + 30 * hover}px ${rgba(MINT, 0.25 + 0.35 * hover)}, 0 14px 30px rgba(0,0,0,.4)`,
        transform: `scale(${lerp(0.6, 1, pop) * beat * press * (1 - gone)}, ${lerp(0.6, 1, pop) * beat * press})`,
        opacity: clamp01((t - a.SEND) / (4 * F)) * (1 - gone),
        overflow: "hidden",
        color: "#FFFFFF",
        fontFamily: JAKARTA,
        fontWeight: 700,
        fontSize: 24,
      }}
    >
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transform: `translateY(${-110 * sent}%)` }}>
        <Send size={22} strokeWidth={2.6} />
        Envoyer le bilan
      </div>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, transform: `translateY(${110 * (1 - sent)}%)` }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", border: "3px solid rgba(255,255,255,.25)", borderTopColor: MINT2, transform: `rotate(${spin}deg)` }} />
        Envoi…
      </div>
    </div>
    </>
  );
}

// ---- L'avion de papier : morphing en 3 étapes, puis le vol ------------------------------------------------------
const BODY_A: Pt[] = [[150, -95], [0, -95], [-150, -95], [-150, 95], [150, 95]];
const BODY_B: Pt[] = [[150, 0], [40, -80], [-150, -80], [-150, 80], [40, 80]];
const BODY_C: Pt[] = [[130, 0], [-100, -75], [-60, -6], [-95, 48], [20, 12]];
const FLAP_A: Pt[] = [[-148, -91], [148, -91], [0, 15]];
const FLAP_B: Pt[] = [[40, -80], [150, 0], [40, 80]];
const FLAP_C: Pt[] = [[130, 0], [-100, -75], [-60, -6]];
const PLANE_SCALE = 0.58;

function planeShape(t: number, a: Anchors) {
  const kAB = prog(t, a.MORPH, 6 * F, SNAP);
  const kBC = prog(t, a.MORPH + 6 * F, 6 * F, SNAP);
  const pick = (A: Pt[], B: Pt[], C: Pt[]) => A.map((_, i) => (kBC > 0 ? mixPt(B[i], C[i], kBC) : mixPt(A[i], B[i], kAB)));
  return { body: pick(BODY_A, BODY_B, BODY_C), flap: pick(FLAP_A, FLAP_B, FLAP_C), k: (kAB + kBC) / 2 };
}

function PaperPlane({ t, a, x, y, angle, scale, opacity = 1, ghost = false }: { t: number; a: Anchors; x: number; y: number; angle: number; scale: number; opacity?: number; ghost?: boolean }) {
  const { body, flap, k } = planeShape(t, a);
  const seal = 1 - prog(t, a.MORPH, 5 * F, SNAP);
  return (
    <svg
      width={340}
      height={240}
      viewBox="-170 -120 340 240"
      style={{ position: "absolute", left: x - 170, top: y - 120, overflow: "visible", opacity, transform: `rotate(${angle}deg) scale(${scale})`, filter: ghost ? undefined : `drop-shadow(0 10px 16px rgba(0,0,0,.45)) drop-shadow(0 0 14px ${rgba(MINT, 0.45 * k)})` }}
    >
      <path d={poly(body)} fill={ghost ? rgba(MINT2, 0.5) : mixHex("#F2F7F9", "#CFE0E6", k)} stroke={ghost ? "none" : "#B9CBD2"} strokeWidth={2.5} strokeLinejoin="round" />
      <path d={poly(flap)} fill={ghost ? rgba(MINT2, 0.35) : mixHex("#F6F9FA", "#FFFFFF", k)} stroke={ghost ? "none" : "#B9CBD2"} strokeWidth={2.5} strokeLinejoin="round" />
      {!ghost && seal > 0 && <circle cx={0} cy={14} r={15 * seal} fill={MINT} />}
    </svg>
  );
}

function planePose(t: number, a: Anchors) {
  const start = sampleAt(0);
  const dt = t - a.TAKEOFF;
  const scale = lerp(ENV_S, PLANE_SCALE, prog(t, a.MORPH, 14 * F, IN_OUT));
  if (dt < 0) {
    // Anticipation : il recule un peu dans l'axe, puis part.
    const back = 18 * pulse(t, a.TAKEOFF - 6 * F, 5 * F, 0, F);
    const rad = (start.a * Math.PI) / 180;
    const bob = ENV_BOB(t);
    return { x: ENV.cx - Math.cos(rad) * back, y: ENV.cy + bob - Math.sin(rad) * back, angle: lerp(0, start.a, prog(t, a.MORPH + 3 * F, 10 * F, IN_OUT)), scale };
  }
  const s = sampleAt(arcAt(dt));
  return { x: s.x, y: s.y, angle: s.a, scale };
}

function PlaneLayer({ t, a }: { t: number; a: Anchors }) {
  if (t < a.MORPH) return null;
  const p = planePose(t, a);
  if (p.x > 2150 || p.y < -200) return null;
  const ghosts =
    t > a.TAKEOFF
      ? [1, 2, 3, 4, 5].map((j) => {
          const g = planePose(t - j * F, a);
          if (t - j * F < a.TAKEOFF) return null;
          return <PaperPlane key={j} t={t} a={a} x={g.x} y={g.y} angle={g.angle} scale={g.scale * (1 - 0.06 * j)} opacity={0.22 * (1 - j / 6)} ghost />;
        })
      : [];
  return (
    <>
      {ghosts.reverse()}
      <PaperPlane t={t} a={a} x={p.x} y={p.y} angle={p.angle} scale={p.scale} />
    </>
  );
}

/** La traînée pointillée derrière l'avion, qui devient pleine puis se rassemble en soulignement. */
function Trail({ t, a }: { t: number; a: Anchors }) {
  if (t < a.TAKEOFF) return null;
  const freezeAt = a.EXIT_T + 8 * F;
  const len = arcAt(Math.min(t, freezeAt) - a.TAKEOFF);
  if (len < 4) return null;
  const { samples } = flight();
  const pts: { x: number; y: number; s: number }[] = [];
  for (const sm of samples) {
    if (sm.s >= len) break;
    pts.push({ x: sm.x, y: sm.y, s: sm.s });
  }
  const end = sampleAt(len);
  pts.push({ x: end.x, y: end.y, s: len });
  const solid = prog(t, a.EXIT_T, 8 * F, SNAP);
  const gather = prog(t, a.EXIT_T + 6 * F, 17 * F, LINEAR);
  const toPath = (ps: { x: number; y: number }[]) => ps.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  // L'approche et le looping se DISSOLVENT sur place (tirets qui s'effacent) ; seule la sortie — le long trait du haut —
  // tombe d'un bloc sur le soulignement, en se pelant de gauche à droite : un trait propre qui descend, pas un gribouillis.
  const { L2 } = flight();
  const loopPts = pts.filter((p) => p.s <= L2 + 1);
  const exitPts = pts.filter((p) => p.s >= L2 - 1);
  const loopOp = 1 - prog(t, a.EXIT_T, 9 * F, IN_OUT);
  const exitLen = Math.max(1, len - L2);
  const moved = exitPts.map((p) => {
    const u = clamp01((p.s - L2) / exitLen);
    const k = SNAP(clamp01((t - (a.EXIT_T + 4 * F + u * 5 * F)) / (12 * F)));
    return { x: lerp(p.x, lerp(UNDERLINE.x0, UNDERLINE.x1, u), k), y: lerp(p.y, UNDERLINE.y, k) };
  });
  const width = lerp(3, 6, gather);
  const dash = solid >= 1 ? undefined : `${2 + 30 * solid} ${12 * (1 - solid)}`;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", filter: `drop-shadow(0 0 8px ${rgba(MINT, 0.8)})` }}>
      {loopOp > 0.01 && loopPts.length > 1 && <path d={toPath(loopPts)} fill="none" stroke={MINT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${(2 * loopOp).toFixed(2)} 12`} opacity={loopOp} />}
      {exitPts.length > 1 && <path d={toPath(moved)} fill="none" stroke={MINT} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />}
    </svg>
  );
}

function Toast({ t, a }: { t: number; a: Anchors }) {
  if (t < a.TOASTT) return null;
  // Arrive vite (ressort raide) ; sort par fondu + échelle .9, SANS translation : jamais coupé par le haut du cadre.
  const k = ressort(t, a.TOASTT, { stiffness: 380 });
  const outAt = Math.max(a.TOASTT + 0.16, a.W1 - 8 * F);
  const out = prog(t, outAt, Math.max(F, Math.min(7 * F, a.W1 - F - outAt)), IN_OUT);
  const y = lerp(TOAST.cy - 12, TOAST.cy, k); // haut ≥ 44 px, même au dépassement du ressort
  const tick = prog(t, a.TOASTT + 0.05, 8 * F, POP);
  return (
    <div
      style={{
        position: "absolute",
        left: TOAST.cx - TOAST.w / 2,
        top: y - TOAST.h / 2,
        width: TOAST.w,
        height: TOAST.h,
        borderRadius: 999,
        background: "#FFFFFF",
        boxShadow: `0 16px 40px rgba(0,0,0,.4), 0 0 0 ${2 + 6 * pulse(t, a.TOASTT + 0.05, 3 * F, 0, 0.3)}px ${rgba(MINT, 0.35)}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        fontFamily: JAKARTA,
        fontWeight: 700,
        fontSize: 24,
        color: INK,
        opacity: clamp01((t - a.TOASTT) / (3 * F)) * (1 - out),
        transform: `scale(${(lerp(0.72, 1, k) * (1 - 0.1 * out)).toFixed(4)}) rotate(${(1 - k) * -4}deg)`,
      }}
    >
      <span style={{ display: "inline-flex", width: 30, height: 30, borderRadius: 30, background: MINT, alignItems: "center", justifyContent: "center", transform: `scale(${tick})` }}>
        <Check size={19} color={INK} strokeWidth={3.6} />
      </span>
      Envoyé
    </div>
  );
}

// ---- Petits gadgets ---------------------------------------------------------------------------------------------------
/** Le robot MONTRE le bouton : un arc pointillé qui court de sa main au « ✓ Vendu », avec une flèche, jusqu'au clic. */
const ARC: [Pt, Pt, Pt] = [
  [ROBOT.cx + 190, ROBOT.feet - 250],
  [ROBOT.cx + 330, ROBOT.feet - 470],
  [VENDU_C.x - BTN.w / 2 - 34, VENDU_C.y + 6],
];
function PointArc({ t, a }: { t: number; a: Anchors }) {
  const grow = prog(t, a.CUR1 - 0.04, 12 * F, SNAP);
  const fade = 1 - prog(t, a.HOP, 6 * F, IN_OUT);
  if (grow <= 0 || fade <= 0) return null;
  const N = 28;
  const pts = Array.from({ length: N + 1 }, (_, i) => qbez(ARC[0], ARC[1], ARC[2], (i / N) * grow));
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [ex, ey] = pts[N];
  const [px, py] = pts[N - 1];
  const ang = (Math.atan2(ey - py, ex - px) * 180) / Math.PI;
  const nudge = 6 * Math.sin(2 * Math.PI * 2 * (t - a.CUR1)); // la flèche « tape » au rythme du bouton
  const rad = (ang * Math.PI) / 180;
  const hx = ex + Math.cos(rad) * nudge;
  const hy = ey + Math.sin(rad) * nudge;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: fade, filter: `drop-shadow(0 0 8px ${rgba(MINT, 0.7)})` }}>
      <path d={d} fill="none" stroke={MINT2} strokeWidth={4} strokeLinecap="round" strokeDasharray="2 14" strokeDashoffset={-(t - a.W0) * 90} />
      <path d="M -16 -11 L 2 0 L -16 11" fill="none" stroke={MINT2} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${ang.toFixed(1)})`} opacity={clamp01((grow - 0.6) / 0.4)} />
    </svg>
  );
}

function RingAt({ t, at, x, y, max, life = 0.2, width = 3, color = MINT }: { t: number; at: number; x: number; y: number; max: number; life?: number; width?: number; color?: string }) {
  const k = prog(t, at, life, SNAP);
  if (t < at || k >= 1) return null;
  const r = max * k;
  return <div style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", border: `${width * (1 - 0.5 * k)}px solid ${color}`, opacity: 1 - k, boxShadow: `0 0 18px ${rgba(color, 0.5 * (1 - k))}` }} />;
}

function Layer({ x = 0, children, style }: { x?: number; children: ReactNode; style?: CSSProperties }) {
  return <AbsoluteFill style={{ transform: x ? `translateX(${x.toFixed(2)}px)` : undefined, ...style }}>{children}</AbsoluteFill>;
}

// ---- La scène -----------------------------------------------------------------------------------------------------------
function World({ t: tFilm, a }: { t: number; a: Anchors }) {
  const t = worldTime(tFilm, a);
  const E = 1920 * (1 - prog(t, a.W0, 10 * F, WHIP)); // entrée en fouet
  const punch = 0.028 * pulse(t, a.LAND, 2 * F, 0, 0.55);
  const zoom =
    keys(t, [
      [a.W0, 1],
      [a.CUR0, 1],
      [a.HOP - 0.05, 1.03, IN_OUT],
      [a.UP, 1.03],
      [a.UP + 0.55, 1.0, IN_OUT],
      [a.CLICK2, 1.0],
      [a.DOWN, 1.05, IN_OUT], // poussée vers la feuille qui s'écrit
      [a.MORPH + 6 * F, 1.022, IN_OUT],
      [a.EXIT_T, 1.022],
      [a.W1 - 0.04, 1, IN_OUT],
    ]) + punch;
  const pan = (to: number) => keys(t, [[a.CLICK2, 0], [a.DOWN, to, IN_OUT], [a.MORPH + 6 * F, 0, IN_OUT]]);
  const cam = { zoom, x: pan(-22), y: pan(-16), origin: [1100, 600] as [number, number], shakes: [{ at: a.HOP, amp: 3, frames: 8 }, { at: a.LAND, amp: 12, frames: 10 }] };
  const track = hostTrack(a);
  const robotIn = prog(t, a.W0 + 2 * F, 12 * F, SNAP);
  const robotSquash = 1 - 0.05 * pulse(t, a.VENDU - 5 * F, 5 * F, 0, 6 * F);
  // Il se penche vers le bouton pendant que le curseur hésite, puis se redresse au clic (rebond).
  const lean = prog(t, a.CUR1 - 0.14, 12 * F, SNAP) * (1 - prog(t, a.HOP + 0.04, 14 * F, POP));
  // La lumière du panneau respire avec le bouton (2 Hz) ; un halo menthe porte la feuille pendant qu'elle s'écrit.
  const hoverBreath = t >= a.CUR1 ? (0.5 - 0.5 * Math.cos(2 * Math.PI * 2 * (t - a.CUR1))) * (1 - prog(t, a.HOP, 6 * F)) : 0;
  const sheetGlow = 0.2 * prog(t, a.SHEET, 10 * F, SNAP) * (1 - prog(t, a.MORPH, 12 * F, IN_OUT)) * (0.75 + 0.25 * Math.sin((t - a.SHEET) * Math.PI * 2 * 1.5));
  const dim = pulse(t, a.VENDU - 3 * F, 3 * F, 0, 8 * F);
  const flash = pulse(t, a.LAND, F, F, 6 * F);
  return (
    <>
      {/* Couche lointaine (parallaxe .3) : le mot géant en contour, le point d'interrogation. */}
      <Layer x={E * 0.55}>
        <Camera t={t} {...cam} depth={0.3}>
          {/* AU-DESSUS du panneau (bas des lettres ≈ 200 < haut du panneau 210) : jamais coupé par la carte. */}
          <Word
            t={t}
            at={a.W0 + 0.06}
            text="PROPOSEZ"
            x={PROPOSE.x - PROPOSE.drift * (t - a.W0)}
            y={PROPOSE.y}
            size={PROPOSE.size}
            outline={{ width: 3, color: rgba(MINT, 0.6) }}
            enter="rise"
            stagger={2}
            exit="slice"
            exitAt={a.LAND - F}
            dir={1}
            letterStyle={(i) => {
              // Vague de lettres CONTINUE (1,6 Hz) + reflet qui court ; plus fort quand la voix dit « proposez ».
              const rise = prog(t, a.W0 + 0.06 + i * 2 * F, 18 * F, SNAP);
              const ph = 2 * Math.PI * (1.6 * (t - a.W0) - i * 0.11);
              const wave = -8 * Math.sin(ph) * rise;
              const said = pulse(t, a.P10 + 0.42 + i * 0.045, 0.08, 0.12, 0.35);
              const h = Math.max(said, 0.55 * Math.pow(0.5 + 0.5 * Math.sin(ph + Math.PI / 2), 4));
              return {
                transform: `translateY(${((1 - rise) * 110).toFixed(2)}%) translateY(${wave.toFixed(2)}px) scale(${(1 + 0.06 * said).toFixed(4)})`,
                WebkitTextStroke: `${(3 + 1.5 * h).toFixed(2)}px ${rgba(MINT2, 0.6 + 0.35 * h)}`,
                filter: h > 0.02 ? `drop-shadow(0 0 ${(16 * h).toFixed(1)}px ${rgba(MINT, 0.75 * h)})` : undefined,
              };
            }}
          />
          <Word t={t} at={a.P11 + 0.3} text="?" x={640 - 18 * (t - a.P11)} y={300} size={460} outline={{ width: 2, color: rgba(MINT, 0.3) }} enter="rise" exit="slice" exitAt={a.BILAN - 0.1} dir={-1} />
        </Camera>
      </Layer>
      <AbsoluteFill style={{ background: `rgba(0,0,0,${0.28 * dim})` }} />
      {/* Le monde (parallaxe 1). */}
      <Layer x={E}>
        <Camera t={t} {...cam}>
          <Spot x={PANEL.cx} y={PANEL.cy} r={620} color={MINT} alpha={0.08 + 0.18 * pulse(t, a.LAND, 3 * F, 0.15, 0.6) + 0.1 * hoverBreath} />
          <Spot x={ENV.cx} y={ENV.cy - 150} r={460} color={MINT} alpha={sheetGlow} />
          <Spot x={ROBOT.cx} y={ROBOT.feet - 120} r={330} color={PB.teal} alpha={0.35} />
          {/* Le robot hôte. */}
          <div
            style={{
              position: "absolute",
              left: ROBOT.cx - ROBOT.size / 2,
              top: ROBOT.feet - ROBOT.size * 0.92,
              transformOrigin: "50% 100%",
              transform: `translateX(${((1 - robotIn) * 120 + 14 * lean).toFixed(2)}px) rotate(${(7 * lean).toFixed(3)}deg) scale(${robotSquash * (2 - robotSquash)}, ${robotSquash})`,
            }}
          >
            <Mascot track={track} t={t} size={ROBOT.size} />
          </div>
          <Panel t={t} a={a} />
          <PointArc t={t} a={a} />
          <Envelope t={t} a={a} />
          <SendButton t={t} a={a} />
          <Trail t={t} a={a} />
          <PlaneLayer t={t} a={a} />
          {/* Clic sur « ✓ Vendu » : onde de choc ; « Vendu » : étincelles. */}
          <RingAt t={t} at={a.HOP} x={TIP_VENDU[0]} y={TIP_VENDU[1]} max={240} life={12 * F} />
          <RingAt t={t} at={a.CLICK2} x={TIP_SEND[0]} y={TIP_SEND[1]} max={180} life={12 * F} />
          {SHEET_ROWS.map((_, i) => {
            const at = sheetTiming(a).tick(i);
            const [x, y] = tickAt(i, t);
            return (
              <div key={`tick${i}`}>
                {/* Sarcelle foncée : lisible sur la feuille blanche (le menthe clair y disparaît). */}
                <RingAt t={t} at={at} x={x} y={y} max={52} life={0.28} width={4} color="#12A08A" />
                <Sparks t={t} at={at} x={x} y={y} count={9} speed={520} spread={150} angle={-50} seed={`S8tick${i}`} color="#12A08A" len={18} life={0.32} width={3} />
              </div>
            );
          })}
          <Sparks t={t} at={a.LAND} x={VENDU_C.x} y={VENDU_C.y - 20} count={22} speed={1100} spread={80} seed="S8sp" color={MINT2} />
          <Sparks t={t} at={a.TAKEOFF} x={ENV.cx} y={ENV.cy} count={14} speed={700} spread={60} angle={30} seed="S8sp2" color="#FFFFFF" len={18} />
          <Stamp t={t} a={a} />
          <CursorLayer t={t} a={a} />
        </Camera>
      </Layer>
      {/* Avant-plan (parallaxe 1,6) : pièces, +1, bokeh. */}
      <Layer x={E * 1.3}>
        <Camera t={t} {...cam} depth={1.6}>
          <Dust t={t} count={22} seed="S8bokeh" color={MINT2} size={[3, 7]} alpha={0.16} speed={0.05} />
        </Camera>
        <Camera t={t} {...cam}>
          <EuroCoins t={t} a={a} />
        </Camera>
      </Layer>
      {/* HUD : le compteur (parallaxe .3), le toast. */}
      <Layer x={E * 1.1}>
        <Camera t={t} {...cam} depth={0.3}>
          <Counter t={t} a={a} />
          <PlusOne t={t} a={a} />
          <Toast t={t} a={a} />
        </Camera>
      </Layer>
      <AbsoluteFill style={{ background: `rgba(220,255,248,${0.14 * flash})`, pointerEvents: "none" }} />
    </>
  );
}

export function Scene08({ t, time }: SceneProps) {
  const a = anchorsOf(time);
  const blur = (t >= a.W0 && t < a.W0 + 12 * F) || (t >= a.VENDU - F && t < a.LAND + 4 * F);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Backdrop t={t} kind="brand" halo={1 + 0.35 * pulse(t, a.LAND, 3 * F, 0.2, 0.8)} />
      <DotGrid t={t} opacity={time.look(t).dots} wave={{ at: a.LAND, x: STAMP.cx, y: STAMP.cy, speed: 1800 }} />
      <MotionBlur on={blur} samples={8} shutter={180}>
        {(tt) => <World t={tt} a={a} />}
      </MotionBlur>
    </AbsoluteFill>
  );
}

/** Les effets sonores de la scène (secondes du film). */
export const cues: SceneCues = (time) => {
  const a = anchorsOf(time);
  const bounces = coinSpecs(a)
    .map((c) => c.hit)
    .sort((x, y) => x - y);
  const out: Cue[] = [
    cue("whoosh_fast", a.W0, 0.5),
    cue("whoosh_fast", a.CUR0, 0.3, 1.2),
    cue("ui_click", a.HOP, 0.7),
    cue("stamp_slam", a.LAND - F, 0.95),
    cue("cash_register", a.LAND + 0.03, 0.8),
    cue("coin_flip", bounces[0], 0.3, 1.3),
    cue("coin_flip", bounces[5], 0.3, 1.3),
    cue("coin_flip", bounces[10], 0.3, 1.3),
    cue("card_unfold", a.ENVT, 0.4, 1.3), // les 3 plis (0,5 s)
    cue("paper_fold", a.ENVT + a.UNFOLD, 0.2, 1.3), // le rabat s'ouvre
    cue("ui_pop", a.SEND, 0.25, 1.2),
    cue("ui_click", a.CLICK2, 0.5),
    cue("paper_fold", a.DOWN, 0.3, 1.2),
    cue("ui_pop", a.FLAP + 5 * F, 0.3, 0.9),
    // L'avion se tait avant « Vente terminée » (P12) : coupé à P12 − 0,05 avec un fondu de 0,15 s.
    { ...cue("paper_plane", a.MORPH, 0.6), until: time.A("P12") - 0.05, fade: 0.15 } as Cue,
    { ...cue("mail_chime", a.TOASTT, 0.45), until: time.A("P12") + 0.05, fade: 0.22 } as Cue, // juste après « e-mail », éteint avant « Vente »
    cue("whoosh_fast", a.EXIT_T + 0.06, 0.3, 0.7), // la traînée se rassemble (après « e-mail »)
  ];
  return out;
};
