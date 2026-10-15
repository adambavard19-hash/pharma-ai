import { useId, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, interpolateColors } from "remotion";
import { noise2D } from "@remotion/noise";
import { Droplet, Pill, Sun } from "lucide-react";
import {
  ACT1,
  Camera,
  DotGrid,
  EXIT,
  F,
  INK,
  JAKARTA,
  MotionBlur,
  POP,
  Ring,
  SNAP,
  Spot,
  clamp01,
  cue,
  digits,
  hash,
  keys,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  rnd,
  squash,
  wobble,
  type Shake,
} from "./kit";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S2 · Le trou de mémoire — voix P3 « Et le bon conseil ? Pas le temps d'y penser. »
 * Fenêtre : time.win.S2 (P3.start − 0,05 → P4.start).
 *
 *   relais d'entrée   barre #C9D1DA 600×24 à (960, 540) (sortie de S1)
 *   seg(P3,1) − 0,05  la barre bondit et se gonfle en bulle (morphing paramétrique à ressorts, queue + 2 ronds de pensée),
 *                     onde grise ; « … » qui réfléchit ; 3 pastilles (gélule, soleil, goutte) jaillissent et orbitent en
 *                     ellipse avec profondeur (échelle, flou, opacité)
 *   « conseil »       CONSEIL s'écrit lettre par lettre en menthe : chaque lettre tombe, se pose et fait un POP 1,15 → 1
 *                     (flash, halo, 3 éclats menthe) ; la bulle encaisse la frappe en gelée (scaleX/scaleY ±4 %) ;
 *                     puis « ? » gris qui se balance ; reflet qui traverse la bulle, lueur menthe intérieure
 *   A(P3,1) − 0,3     (fin de « conseil ? ») le minuteur 00:03 claque au-dessus de la bulle et l'anneau corail (18 px)
 *     → A(P3,2) + 0,1 épouse la bulle, part de 9 h dans le sens horaire et ACCÉLÈRE ; mèche incandescente + étincelles ;
 *                     chaque lettre survolée (pendant « Pas le temps ») vire au gris, s'affaisse, penche ; la bulle
 *                     frissonne de plus en plus ; minuteur 00:03 → 00:00 en 3 crans réguliers (chiffre qui roule, coup
 *                     de zoom, tic-tac), qui TREMBLE (3 px) sur sa dernière demi-seconde et clignote à 00:00
 *   seg(P3,3)         « d'y penser » : l'anneau se referme → GLITCH 3 images (copies rouge/cyan ±8 px, 6 bandes ±30 px) ;
 *                     les lettres tombent en briques (gravité, rotation), rebondissent sur une ligne de sol (y = 905, au-dessus
 *                     des sous-titres) qui ploie, puis s'effritent ; les pastilles s'éteignent une à une
 *   seg(P3,3) + ~0,5  la bulle se rétracte (aspiration EXIT) en un point qui glisse à (960, 540) ; à ~ +0,68 elle éclate en
 *                     8 gouttelettes + onde
 *   relais de sortie  point #8A94A3 de 28 px à (960, 540) qui respire (1 ↔ 1,05)
 *
 * Les temps de la direction (3,1 s) sont compressés dans la voix réelle (2,41 s) : « Pas le temps » ne dure que 0,23 s
 * dans la voix, l'anneau part donc dès la fin de « conseil ? » (A(P3,1) − 0,3) et se referme 0,1 s après le début de
 * « d'y penser » (≈ 0,63 s de chrono lisible) ; la gravité est plus forte pour que les lettres aient rebondi et disparu
 * avant P4.
 * ======================================================================== */

// ─── Géométrie ────────────────────────────────────────────────────────────────
const CX = 960;
const CY = 470;
const BUB = { w: 860, h: 420, r: 200 };
const BAR = { w: 600, h: 24, r: 12, cy: 540 };
const POINT = { x: 960, y: 540, d: 28 };
/** Ligne de sol (monde) : avec le zoom de la caméra, les lettres posées restent au-dessus de la bande des sous-titres. */
const FLOOR = 858;
const FONT_PX = 140;
/** Décalage vertical de la boîte de texte pour que les capitales soient centrées optiquement sur CY. */
const CAP_DY = -4;
const CAP_HALF = 50;

/** Les glyphes : chasse estimée (em) de Plus Jakarta Sans 800, approche −0,045 em. Le « ? » est gris (seule la menthe dit CONSEIL). */
const GLYPHS: { ch: string; w: number; q?: boolean }[] = [
  { ch: "C", w: 0.72 },
  { ch: "O", w: 0.8 },
  { ch: "N", w: 0.77 },
  { ch: "S", w: 0.65 },
  { ch: "E", w: 0.61 },
  { ch: "I", w: 0.36 },
  { ch: "L", w: 0.59 },
  { ch: "?", w: 0.58, q: true },
];
const TRACK = -0.045;
/** Durée de la chute d'une lettre jusqu'à sa pose. */
const LAND = 4 * F;
const Q_GAP = 0.2;
const LETTERS = (() => {
  const adv = GLYPHS.map((g) => (g.w + TRACK + (g.q ? Q_GAP : 0)) * FONT_PX);
  const total = adv.reduce((s, a) => s + a, 0);
  let x = CX - total / 2;
  return GLYPHS.map((g, i) => {
    const left = x + (g.q ? Q_GAP * FONT_PX : 0);
    const w = (g.w + TRACK) * FONT_PX;
    x += adv[i];
    return { ...g, i, x: left + w / 2, w };
  });
})();

// ─── L'anneau du chrono : rectangle arrondi qui épouse la bulle, départ à 9 h, sens horaire ──────────────────
const RP = 26;
const RW = BUB.w / 2 + RP;
const RH = BUB.h / 2 + RP;
const RR = BUB.r + RP;
const RING_D = [
  `M ${CX - RW} ${CY}`,
  `V ${CY - RH + RR}`,
  `A ${RR} ${RR} 0 0 1 ${CX - RW + RR} ${CY - RH}`,
  `H ${CX + RW - RR}`,
  `A ${RR} ${RR} 0 0 1 ${CX + RW} ${CY - RH + RR}`,
  `V ${CY + RH - RR}`,
  `A ${RR} ${RR} 0 0 1 ${CX + RW - RR} ${CY + RH}`,
  `H ${CX - RW + RR}`,
  `A ${RR} ${RR} 0 0 1 ${CX - RW} ${CY + RH - RR}`,
  "Z",
].join(" ");
type Seg = { kind: "line"; a: [number, number]; b: [number, number]; len: number } | { kind: "arc"; c: [number, number]; a0: number; a1: number; len: number };
const RING_SEGS: Seg[] = (() => {
  const line = (a: [number, number], b: [number, number]): Seg => ({ kind: "line", a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  const arc = (c: [number, number], a0: number, a1: number): Seg => ({ kind: "arc", c, a0, a1, len: (Math.abs(a1 - a0) * Math.PI * RR) / 180 });
  const L = CX - RW, R = CX + RW, T = CY - RH, B = CY + RH;
  return [
    line([L, CY], [L, T + RR]),
    arc([L + RR, T + RR], 180, 270),
    line([L + RR, T], [R - RR, T]),
    arc([R - RR, T + RR], 270, 360),
    line([R, T + RR], [R, B - RR]),
    arc([R - RR, B - RR], 0, 90),
    line([R - RR, B], [L + RR, B]),
    arc([L + RR, B - RR], 90, 180),
    line([L, B - RR], [L, CY]),
  ];
})();
const RING_LEN = RING_SEGS.reduce((s, g) => s + g.len, 0);

/** Point et tangente de l'anneau à la fraction p (0..1) de sa longueur. */
function ringPoint(p: number): { x: number; y: number; nx: number; ny: number } {
  let s = clamp01(p) * RING_LEN;
  for (const g of RING_SEGS) {
    if (s <= g.len || g === RING_SEGS[RING_SEGS.length - 1]) {
      const k = g.len > 0 ? Math.min(1, s / g.len) : 0;
      if (g.kind === "line") {
        const dx = (g.b[0] - g.a[0]) / (g.len || 1);
        const dy = (g.b[1] - g.a[1]) / (g.len || 1);
        // normale extérieure (sens horaire, y vers le bas) : (dy, −dx)
        return { x: lerp(g.a[0], g.b[0], k), y: lerp(g.a[1], g.b[1], k), nx: dy, ny: -dx };
      }
      const ang = ((g.a0 + (g.a1 - g.a0) * k) * Math.PI) / 180;
      return { x: g.c[0] + RR * Math.cos(ang), y: g.c[1] + RR * Math.sin(ang), nx: Math.cos(ang), ny: Math.sin(ang) };
    }
    s -= g.len;
  }
  return { x: CX - RW, y: CY, nx: -1, ny: 0 };
}

/** La fraction de l'anneau où la mèche passe au-dessus de x (moitié haute, x croissant). */
function ringFracAtX(x: number) {
  let lo = 0;
  let hi = 0.5;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (ringPoint(m).x < x) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
const LETTER_FRAC = LETTERS.map((l) => ringFracAtX(l.x));

/** Le chrono ACCÉLÈRE : progression de l'anneau en fonction du temps normalisé u. Départ lent (le temps de lire 00:03),
 *  les lettres sont dévorées vers u ≈ 0,35 → 0,64 (pendant « Pas le temps »), puis coup de fouet jusqu'à la fermeture. */
const ringEase = (u: number) => 0.18 * u + 0.82 * Math.pow(u, 2.5);
function ringEaseInv(p: number) {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (ringEase(m) < p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// ─── Les temps de la scène (tout dérive des ancrages de la voix) ─────────────────────────────────────────────
function beats(time: Time) {
  const a0 = time.A("P3", 0);
  const a1 = time.A("P3", 1);
  const a2 = time.A("P3", 2);
  const end = time.win.S2.end;
  const m0 = time.win.S2.start; // = seg(P3,1) − 0,05 : la barre se gonfle
  const word = a0 + 0.34; // « con-seil » (la voix mesurée dit « con- » vers P3.start + 0,45)
  const qmark = Math.min(a1 - 0.32, word + 0.36); // après le L (dernière lettre à word + 18 images)
  // Le chrono part à la fin de « conseil ? » et se referme juste après le début de « d'y penser ».
  const ring = Math.max(a1 - 0.3, qmark + 2 * F);
  const ringEnd = Math.max(ring + 0.45, a2 + 0.1);
  const glitch = ringEnd;
  const fall = glitch + 3 * F;
  const pop = Math.min(glitch + 0.68, end - 0.17);
  const retract = pop - 0.18;
  const eaten = LETTER_FRAC.map((p) => ring + ringEaseInv(p) * (ringEnd - ring));
  const steps = [1, 2, 3].map((k) => ring + ((ringEnd - ring) * k) / 3);
  const timerIn = ring - 10 * F;
  /** Les instants où chaque lettre se pose (fin de sa chute de 4 images) : POP de la lettre, coup de gelée de la bulle. */
  const lands = LETTERS.map((l) => (l.q ? qmark : word + l.i * 3 * F) + LAND);
  return { a0, a1, a2, end, m0, word, qmark, ring, ringEnd, glitch, fall, pop, retract, eaten, steps, timerIn, lands };
}
type Beats = ReturnType<typeof beats>;

/** La bulle encaisse la frappe comme une gelée : scaleX/scaleY en opposition, ±4 %, vivante pendant toute la frappe
 *  (un coup par lettre posée), puis amortie. Partagée par la bulle, l'anneau et la position des lettres. */
function jelly(t: number, b: Beats): { sx: number; sy: number } {
  const first = b.lands[0];
  const last = Math.max(...b.lands);
  if (t < first) return { sx: 1, sy: 1 };
  const env = (t < last ? 1 : Math.exp(-(t - last) * 8)) * clamp01((t - first) / (2 * F) + 0.3);
  if (env < 0.003) return { sx: 1, sy: 1 };
  // Oscillation de fond (5,5 Hz) + petit écrasement à chaque lettre posée.
  let kick = 0;
  for (const at of b.lands) {
    const u = t - at;
    if (u >= 0 && u < 0.25) kick += Math.exp(-u * 18) * Math.cos(u * 34);
  }
  const k = Math.max(-1, Math.min(1, 0.7 * Math.sin(2 * Math.PI * 5.5 * (t - first)) + 0.45 * kick));
  return { sx: 1 + 0.04 * env * k, sy: 1 - 0.04 * env * k };
}

// ─── Les lettres qui tombent en briques ─────────────────────────────────────────────────────────────────────
const G = 5000;
const REST = 0.35;
const SAG = 14;

function fallSpec(i: number, b: Beats) {
  const l = LETTERS[i];
  // Les briques s'écartent du centre (proportionnellement à leur position) pour ne pas s'empiler.
  const side = l.x < CX ? -1 : 1;
  const vx = (l.x - CX) * 0.95 + side * rnd("S2-vx", i, 20, 70);
  const vy = -rnd("S2-vy", i, 160, 360);
  const w = (hash("S2-ws", i) < 0.5 ? -1 : 1) * rnd("S2-w", i, 70, 230);
  const rel = b.fall + Math.floor(hash("S2-rel", i) * 3) * F;
  const D = FLOOR - (CY + CAP_HALF + SAG);
  const u1 = (-vy + Math.sqrt(vy * vy + 2 * G * D)) / G;
  const v1 = vy + G * u1;
  const vy2 = -REST * v1;
  const u2 = u1 + (2 * -vy2) / G;
  const crumble = Math.min(rel + u2, b.end - 0.2);
  // Les briques retombent à plat : pendant le rebond, la rotation rejoint le multiple de 90° le plus proche.
  const tilt = (hash("S2-tilt", i) < 0.5 ? -1 : 1) * 6;
  const rot1 = w * u1;
  const flat = Math.round((tilt + rot1) / 90) * 90 - tilt;
  return { vx, vy, w, rel, D, u1, vy2, u2, imp1: rel + u1, crumble, rot1, flat };
}

function fallAt(i: number, t: number, b: Beats) {
  const s = fallSpec(i, b);
  const u = t - s.rel;
  if (u <= 0) return { x: 0, y: 0, rot: 0, s };
  if (t < s.imp1) return { x: s.vx * u, y: s.vy * u + 0.5 * G * u * u, rot: s.w * u, s };
  const uu = Math.min(u - s.u1, s.crumble - s.imp1);
  const y = s.D + s.vy2 * uu + 0.5 * G * uu * uu;
  const air = Math.max(1e-3, s.u2 - s.u1);
  return { x: s.vx * s.u1 + 0.6 * s.vx * uu, y: Math.min(s.D, y), rot: lerp(s.rot1, s.flat, SNAP(clamp01(uu / air))), s };
}

// ─── La bulle : un seul tracé paramétrique (barre → bulle → point) ────────────────────────────────────────
function bubblePath(cx: number, cy: number, w: number, h: number, r: number, tail: number) {
  const L = cx - w / 2;
  const R = cx + w / 2;
  const T = cy - h / 2;
  const B = cy + h / 2;
  const rr = Math.max(0, Math.min(r, h / 2, w / 2));
  const sL = L + rr;
  const sR = R - rr;
  const span = Math.max(0, sR - sL);
  const bL = sL + span * 0.07;
  const bR = Math.min(sR, bL + 96 * clamp01(tail * 1.4));
  const mid = (bL + bR) / 2;
  const tx = mid - 112 * tail;
  const ty = B + 90 * tail;
  const f = (n: number) => n.toFixed(2);
  return [
    `M ${f(cx)} ${f(T)}`,
    `H ${f(sR)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(R)} ${f(T + rr)}`,
    `V ${f(B - rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(sR)} ${f(B)}`,
    `H ${f(bR)}`,
    `Q ${f(bR - 24 * tail)} ${f(B + 44 * tail)} ${f(tx)} ${f(ty)}`,
    `Q ${f(bL + 6 * tail)} ${f(B + 30 * tail)} ${f(bL)} ${f(B)}`,
    `H ${f(sL)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(L)} ${f(B - rr)}`,
    `V ${f(T + rr)}`,
    `A ${f(rr)} ${f(rr)} 0 0 1 ${f(sL)} ${f(T)}`,
    "Z",
  ].join(" ");
}

function bubbleState(t: number, b: Beats) {
  // Gonflement : la largeur part la première, la hauteur suit avec plus de dépassement (gelée).
  const kW = ressort(t, b.m0, { damping: 13, stiffness: 230, mass: 0.6 });
  const kH = ressort(t, b.m0 + 2 * F, { damping: 10, stiffness: 190, mass: 0.6 });
  let w = lerp(BAR.w, BUB.w, kW) * (1 - 0.05 * Math.sin(Math.PI * clamp01(kH)) * (1 - clamp01(kW)));
  let h = lerp(BAR.h, BUB.h, kH);
  let cy = lerp(BAR.cy, CY, kH);
  let r = lerp(BAR.r, BUB.r, clamp01(kH));
  let tail = prog(t, b.m0 + 8 * F, 14 * F, POP);
  const kFill = prog(t, b.m0 + 4 * F, 12 * F, SNAP);
  let fill = interpolateColors(kFill, [0, 1], [ACT1.g4, ACT1.g1]);
  let strokeA = 1;
  // Vie : respiration et flottement ; gelée pendant la frappe ; frisson croissant pendant le chrono.
  const breathe = 1 + 0.008 * Math.sin(t * Math.PI * 2 * 0.9);
  cy += wobble(t, 3, 3, 1.4) * clamp01(kH);
  const jl = jelly(t, b);
  const tense = t >= b.ring && t < b.glitch ? 3 * clamp01((t - b.ring) / (b.ringEnd - b.ring)) : 0;
  const step = Math.floor(t * 60);
  const tx = tense * (hash("S2-trx", step) * 2 - 1);
  cy += tense * (hash("S2-try", step) * 2 - 1);
  // Anticipation avant l'aspiration : la bulle gonfle de 4 %.
  const ant = keys(t, [[b.retract - 7 * F, 0], [b.retract, 0.045, SNAP]]);
  // Aspiration : la bulle se rétracte en un point qui glisse à (960, 540).
  const k = prog(t, b.retract, 10 * F, EXIT);
  if (t >= b.retract) {
    w = lerp(w * (1 + ant), POINT.d, k);
    h = lerp(h * (1 + ant), POINT.d, k);
    cy = lerp(cy, POINT.y, k);
    r = lerp(r, POINT.d / 2, k);
    tail *= 1 - prog(t, b.retract, 5 * F, SNAP);
    fill = interpolateColors(k, [0, 1], [ACT1.g1, ACT1.g3]);
    strokeA = 1 - k;
  } else {
    w *= 1 + ant;
    h *= 1 + ant;
  }
  return { cx: CX + tx, cy, w: w * breathe * jl.sx, h: h * breathe * jl.sy, r, tail, fill, strokeA, kH, k, jl, tx };
}

// ─── Composants ───────────────────────────────────────────────────────────────────────────────────────────

/** La bulle, l'anneau du chrono, les ronds de pensée et le « … ». */
function Bubble({ t, b, lit }: { t: number; b: Beats; lit: number }) {
  // Identifiants uniques : le flou de mouvement dessine plusieurs bulles à la fois.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (t >= b.retract + 10 * F) return null;
  const s = bubbleState(t, b);
  const d = bubblePath(s.cx, s.cy, s.w, s.h, s.r, s.tail);
  // Reflet qui traverse la bulle juste après CONSEIL.
  const sheenU = clamp01((t - (b.word + 0.22)) / 0.55);
  const sheenX = lerp(CX - BUB.w / 2 - 260, CX + BUB.w / 2 + 120, SNAP(sheenU));
  // Anneau.
  const u = clamp01((t - b.ring) / (b.ringEnd - b.ring));
  const p = t < b.ring ? 0 : ringEase(u);
  const trackA = prog(t, b.ring - 5 * F, 5 * F, SNAP) * (1 - prog(t, b.glitch, 8 * F, SNAP));
  const flash = t >= b.ringEnd && t < b.ringEnd + 2 * F;
  const shockK = prog(t, b.ringEnd + 2 * F, 12 * F, SNAP);
  const ringA = 1 - shockK;
  const ringScale = 1 + 0.07 * shockK;
  const tip = ringPoint(p);
  // Ronds de pensée.
  const c1 = prog(t, b.m0 + 15 * F, 12 * F, POP) * (1 - prog(t, b.retract - 2 * F, 5 * F, SNAP));
  const c2 = prog(t, b.m0 + 19 * F, 12 * F, POP) * (1 - prog(t, b.retract - 4 * F, 5 * F, SNAP));
  const tipX = lerp(810, 700, s.tail);
  const tipY = s.cy + s.h / 2 + 90 * s.tail;
  // « … » qui réfléchit, avant le mot.
  const dotsIn = prog(t, b.m0 + 12 * F, 10 * F, POP);
  const dotsOut = prog(t, b.word - 2 * F, 6 * F, SNAP);
  const dotsK = dotsIn * (1 - dotsOut);
  const stroke = interpolateColors(prog(t, b.m0 + 4 * F, 14 * F, SNAP), [0, 1], [ACT1.g4, "#3A4552"]);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible", filter: s.k > 0 && s.k < 1 ? `blur(${(7 * Math.sin(Math.PI * s.k)).toFixed(2)}px)` : undefined }}>
      <defs>
        <clipPath id={`s2clip${uid}`}>
          <path d={d} />
        </clipPath>
        <linearGradient id={`s2shade${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.06} />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="1" stopColor="#000000" stopOpacity={0.22} />
        </linearGradient>
        <radialGradient id={`s2mint${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={ACT1.mint} stopOpacity={0.2} />
          <stop offset="1" stopColor={ACT1.mint} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`s2sheen${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.09} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Ronds de pensée, derrière la queue. */}
      {c2 > 0 && <circle cx={tipX - 46} cy={tipY + 52} r={10 * c2} fill={ACT1.g1} stroke="#3A4552" strokeWidth={3} />}
      {c1 > 0 && <circle cx={tipX - 22} cy={tipY + 22} r={16 * c1} fill={ACT1.g1} stroke="#3A4552" strokeWidth={3} />}
      {/* Ombre portée longue, puis la bulle. */}
      <path d={d} fill="#000" opacity={0.45 * s.kH * s.strokeA} style={{ filter: "blur(30px)" }} transform="translate(0 30)" />
      <path d={d} fill={s.fill} />
      <g clipPath={`url(#s2clip${uid})`} opacity={s.strokeA}>
        <rect x={0} y={0} width={1920} height={1080} fill={`url(#s2shade${uid})`} />
        {lit > 0.001 && <ellipse cx={CX} cy={CY} rx={480} ry={260} fill={`url(#s2mint${uid})`} opacity={lit} />}
        {sheenU > 0 && sheenU < 1 && <rect x={sheenX} y={0} width={220} height={1080} fill={`url(#s2sheen${uid})`} transform={`skewX(-18)`} style={{ transformOrigin: `${sheenX}px ${CY}px` }} />}
      </g>
      <path d={d} fill="none" stroke={stroke} strokeWidth={3} opacity={s.strokeA} />
      {/* « … » */}
      {dotsK > 0.001 &&
        [0, 1, 2].map((j) => {
          const hop = Math.max(0, Math.sin((t - b.m0) * Math.PI * 2 * 2.4 - j * 0.9)) * 14;
          return <circle key={j} cx={CX + (j - 1) * 44} cy={CY - hop} r={11 * dotsK} fill={ACT1.g3} opacity={0.5 + 0.5 * (hop / 14)} />;
        })}
      {/* Anneau du chrono : piste, trait corail, mèche — il suit la gelée et le frisson de la bulle. */}
      <g transform={`translate(${(CX + s.tx).toFixed(2)} ${CY}) scale(${s.jl.sx.toFixed(4)} ${s.jl.sy.toFixed(4)}) translate(${-CX} ${-CY})`}>
      {trackA > 0.001 && <path d={RING_D} fill="none" stroke={ACT1.g2} strokeWidth={6} opacity={0.55 * trackA} />}
      {p > 0.002 && ringA > 0.001 && (
        <g style={{ transformOrigin: `${CX}px ${CY}px`, transform: `scale(${ringScale})` }} opacity={ringA}>
          <path
            d={RING_D}
            pathLength={1}
            fill="none"
            stroke={flash ? "#FFFFFF" : ACT1.coral}
            strokeWidth={18}
            strokeLinecap="round"
            strokeDasharray={`${p} 2`}
            style={{ filter: `drop-shadow(0 0 14px ${rgba(ACT1.coral, 0.75)}) drop-shadow(0 0 40px ${rgba(ACT1.coral, 0.35)})` }}
          />
        </g>
      )}
      {p > 0.002 && t < b.ringEnd && (
        <g>
          {[5, 4, 3, 2, 1].map((k) => {
            const pp = ringEase(clamp01((t - k * 0.014 - b.ring) / (b.ringEnd - b.ring)));
            const q = ringPoint(pp);
            return <circle key={k} cx={q.x} cy={q.y} r={9 - k * 1.2} fill={ACT1.coral} opacity={0.5 - k * 0.08} />;
          })}
          <circle cx={tip.x} cy={tip.y} r={10} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 10px ${ACT1.coral}) drop-shadow(0 0 26px ${rgba(ACT1.coral, 0.8)})` }} />
        </g>
      )}
      <FuseSparks t={t} b={b} />
      </g>
    </svg>
  );
}

/** Étincelles éjectées par la mèche de l'anneau (nées toutes les 0,02 s, vie 0,26 s). */
function FuseSparks({ t, b }: { t: number; b: Beats }) {
  if (t < b.ring || t > b.ringEnd + 0.3) return null;
  const out: ReactNode[] = [];
  const n = Math.floor((b.ringEnd - b.ring) / 0.02);
  for (let k = 0; k <= n; k++) {
    const born = b.ring + k * 0.02;
    const u = t - born;
    if (u < 0 || u > 0.26) continue;
    const q = ringPoint(ringEase(clamp01((born - b.ring) / (b.ringEnd - b.ring))));
    const sp = rnd("S2-fs", k, 260, 620);
    const jit = rnd("S2-fj", k, -0.9, 0.9);
    const ang = Math.atan2(q.ny, q.nx) + jit;
    const x = q.x + Math.cos(ang) * sp * u;
    const y = q.y + Math.sin(ang) * sp * u + 900 * u * u;
    const len = 14 * (1 - u / 0.26);
    out.push(<line key={k} x1={x} y1={y} x2={x - Math.cos(ang) * len} y2={y - Math.sin(ang) * len} stroke={k % 3 === 0 ? "#FFFFFF" : ACT1.coral} strokeWidth={3} strokeLinecap="round" opacity={1 - u / 0.26} />);
  }
  return <g>{out}</g>;
}

/** CONSEIL ? — apparition lettre à lettre, dévoration par l'anneau, chute en briques et effritement. */
function Letters({ t, b }: { t: number; b: Beats }) {
  const jl = jelly(t, b);
  return (
    <>
      {LETTERS.map((l) => {
        const appear = l.q ? b.qmark : b.word + l.i * 3 * F;
        if (t < appear) return null;
        // Frappe : la lettre tombe (4 images, 0,35 → 1,15) et se pose avec un POP 1,15 → 1 amorti.
        const land = b.lands[l.i];
        const uL = t - land;
        const scaleIn = uL < 0 ? lerp(0.35, 1.15, SNAP(clamp01((t - appear) / LAND))) : 1 + 0.15 * Math.exp(-uL * 10) * Math.cos(uL * 24);
        const yIn = uL < 0 ? -46 * (1 - clamp01((t - appear) / LAND)) : 7 * Math.exp(-uL * 16) * Math.sin(uL * 30);
        const opIn = clamp01((t - appear) / (2 * F));
        const flashIn = 1 - prog(t, land, 8 * F, SNAP);
        // Vie : flottement et balancement du « ? ».
        const fl = wobble(t, l.i + 2, 3, 2.1);
        const qSwing = l.q ? 9 * Math.sin((t - appear) * 7) * Math.exp(-(t - appear) * 1.2) + 4 * Math.sin(t * 3) : 0;
        // Dévorée par l'anneau.
        const ke = prog(t, b.eaten[l.i], 6 * F, SNAP);
        const color = l.q ? interpolateColors(ke, [0, 1], [ACT1.g3, "#5D6773"]) : interpolateColors(ke, [0, 1], [ACT1.mint, ACT1.g3]);
        const sag = SAG * ke;
        const tilt = (hash("S2-tilt", l.i) < 0.5 ? -1 : 1) * 6 * ke;
        const glowA = l.q ? 0 : 1 - ke;
        // Chute.
        const f = fallAt(l.i, t, b);
        const sq = squash(t, f.s.imp1, 6 * F);
        const crumbleK = prog(t, f.s.crumble, 4 * F, SNAP);
        if (crumbleK >= 1) return null;
        const falling = t >= f.s.rel;
        const alpha = opIn * (1 - 0.3 * ke + 0.3 * ke * prog(t, f.s.rel, 6 * F, SNAP)) * (1 - crumbleK);
        const glow =
          glowA > 0.01
            ? `drop-shadow(0 0 24px ${rgba(ACT1.mint, 0.6 * glowA)}) drop-shadow(0 0 60px ${rgba(ACT1.mint, 0.3 * glowA)})${flashIn > 0.01 ? ` brightness(${1 + 1.2 * flashIn})` : ""}`
            : undefined;
        const style: CSSProperties = {
          position: "absolute",
          left: l.x - 80,
          top: CY - FONT_PX / 2 + CAP_DY,
          width: 160,
          height: FONT_PX,
          textAlign: "center",
          fontFamily: JAKARTA,
          fontWeight: 800,
          fontSize: FONT_PX,
          lineHeight: 1,
          letterSpacing: 0,
          color,
          opacity: alpha,
          filter: glow,
          transformOrigin: "50% 50%",
          transform: [
            `translate(${f.x + (l.x - CX) * (jl.sx - 1)}px, ${(falling ? 0 : fl) + yIn + sag + f.y}px)`,
            `scale(${scaleIn * sq.sx * (1 + 0.4 * crumbleK)}, ${scaleIn * sq.sy * (1 - 0.6 * crumbleK)})`,
            `rotate(${tilt + f.rot + qSwing}deg)`,
          ].join(" "),
        };
        return (
          <div key={l.i} style={style}>
            {l.ch}
          </div>
        );
      })}
      <Chips t={t} b={b} />
      <LandSparks t={t} b={b} />
    </>
  );
}

/** Trois éclats menthe sous chaque lettre qui se pose (le « ? » : gris). */
function LandSparks({ t, b }: { t: number; b: Beats }) {
  const out: ReactNode[] = [];
  LETTERS.forEach((l) => {
    const u = t - b.lands[l.i];
    if (u < 0 || u > 0.22) return;
    const k = u / 0.22;
    for (let j = 0; j < 4; j++) {
      const id = l.i * 10 + j;
      const ang = ((j < 2 ? 180 + 25 + j * 30 : -25 - (j - 2) * 30) + rnd("S2-la", id, -10, 10)) * (Math.PI / 180);
      const d = 18 + 70 * SNAP(k);
      const len = 16 * (1 - k);
      const x = l.x + Math.cos(ang) * (l.w * 0.45 + d);
      const y = CY + CAP_HALF + 6 + Math.sin(ang) * d * 0.5;
      out.push(
        <div
          key={id}
          style={{ position: "absolute", left: x - len / 2, top: y - 1.5, width: len, height: 3, borderRadius: 3, background: l.q ? ACT1.g3 : ACT1.mint, opacity: (1 - k) * 0.9, transform: `rotate(${(ang * 180) / Math.PI}deg)`, boxShadow: l.q ? undefined : `0 0 8px ${rgba(ACT1.mint, 0.7)}` }}
        />,
      );
    }
  });
  return <>{out}</>;
}

const CHIP_LIFE = 0.16;

/** Les éclats de brique quand une lettre s'effrite. */
function Chips({ t, b }: { t: number; b: Beats }) {
  const out: ReactNode[] = [];
  LETTERS.forEach((l) => {
    const f = fallAt(l.i, b.end, b);
    const at = f.s.crumble;
    const u = t - at;
    if (u < 0 || u > CHIP_LIFE) return;
    const x0 = l.x + f.x;
    const y0 = FLOOR - 30;
    for (let k = 0; k < 6; k++) {
      const id = l.i * 10 + k;
      const vx = rnd("S2-cx", id, -420, 420);
      const vy = -rnd("S2-cy", id, 260, 720);
      const s = rnd("S2-cs", id, 7, 15);
      const x = x0 + vx * u;
      const y = y0 + vy * u + 0.5 * 3600 * u * u;
      out.push(
        <div
          key={id}
          style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s * 0.8, borderRadius: 2, background: l.q ? "#5D6773" : ACT1.g3, opacity: 1 - u / CHIP_LIFE, transform: `rotate(${vx * u * 2}deg)` }}
        />,
      );
    }
  });
  return <>{out}</>;
}

/** La ligne de sol (au-dessus de la bande des sous-titres), qui ploie sous chaque impact. */
function Floor({ t, b }: { t: number; b: Beats }) {
  const kIn = prog(t, b.glitch + 0.06, 12 * F, SNAP);
  const kOut = prog(t, b.pop, 9 * F, EXIT);
  if (kIn <= 0 || kOut >= 1) return null;
  const half = 590 * kIn * (1 - kOut);
  const specs = LETTERS.map((l) => ({ l, f: fallAt(l.i, b.end, b) }));
  const pts: string[] = [];
  const N = 64;
  for (let k = 0; k <= N; k++) {
    const x = CX - half + (2 * half * k) / N;
    let y = FLOOR;
    for (const { l, f } of specs) {
      for (const [at, amp, xx] of [
        [f.s.imp1, 16, l.x + f.s.vx * f.s.u1],
        [f.s.crumble, 7, l.x + f.x],
      ] as [number, number, number][]) {
        const u = t - at;
        if (u < 0 || u > 0.5) continue;
        y += amp * Math.exp(-(((x - xx) / 80) ** 2)) * Math.exp(-7 * u) * Math.cos(26 * u);
      }
    }
    pts.push(`${k === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="s2-floor" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={ACT1.g3} stopOpacity={0} />
          <stop offset="0.2" stopColor={ACT1.g3} stopOpacity={0.55} />
          <stop offset="0.8" stopColor={ACT1.g3} stopOpacity={0.55} />
          <stop offset="1" stopColor={ACT1.g3} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={pts.join(" ")} fill="none" stroke="url(#s2-floor)" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

const ICONS = [
  { Icon: Pill, a0: 90 },
  { Icon: Sun, a0: 210 },
  { Icon: Droplet, a0: 330 },
];
const ORBIT = { rx: 600, ry: 330, speed: 24 };

/** Trois pastilles (gélule, soleil, goutte) qui jaillissent de la bulle et orbitent en ellipse, avec profondeur. */
function Orbit({ t, b, front }: { t: number; b: Beats; front: boolean }) {
  return (
    <>
      {ICONS.map(({ Icon, a0 }, j) => {
        const born = b.m0 + 10 * F + j * 4 * F;
        if (t < born) return null;
        const theta = ((a0 + ORBIT.speed * (t - b.a1)) * Math.PI) / 180;
        const z = Math.sin(theta);
        if (front !== z >= 0) return null;
        const kOut = prog(t, born, 18 * F, SNAP);
        const kPop = prog(t, born, 14 * F, POP);
        let x = lerp(CX, CX + ORBIT.rx * Math.cos(theta), kOut);
        let y = lerp(CY, CY + ORBIT.ry * z, kOut) + wobble(t, 11 + j, 4, 2);
        // Extinction une à une, puis aspiration vers le point.
        const off = b.glitch + j * 5 * F;
        const flick = t >= off && t < off + 4 * F ? (Math.floor((t - off) * 60) % 2 === 0 ? 0.25 : 0.8) : 1;
        const dim = 1 - 0.85 * prog(t, off, 4 * F, SNAP);
        const suck = prog(t, b.retract + j * F, 10 * F, EXIT);
        x = lerp(x, POINT.x, suck);
        y = lerp(y, POINT.y, suck);
        const depth = (z + 1) / 2;
        const sc = (0.82 + 0.3 * depth) * kPop * (1 - suck);
        if (sc <= 0.01) return null;
        const S = 108;
        return (
          <div
            key={j}
            style={{
              position: "absolute",
              left: x - S / 2,
              top: y - S / 2,
              width: S,
              height: S,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, #222A33 0%, #141A21 70%)",
              border: `2px solid ${ACT1.g2}`,
              boxShadow: "0 18px 40px rgba(0,0,0,.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${sc}) rotate(${wobble(t, 21 + j, 6, 1.6)}deg)`,
              opacity: (0.55 + 0.45 * depth) * dim * flick,
              filter: depth < 0.5 ? `blur(${(0.5 - depth) * 3}px)` : undefined,
            }}
          >
            <Icon size={60} strokeWidth={3} color={ACT1.g3} />
          </div>
        );
      })}
    </>
  );
}

/** Minuteur corail 00:03 → 00:00 : il claque 10 images avant le chrono (le temps de lire 00:03), aiguille qui tourne, dernier
 *  chiffre qui roule à chaque cran, tremblement 3 px sur sa dernière demi-seconde, clignotement à 00:00. */
function Timer({ t, b }: { t: number; b: Beats }) {
  const appear = b.timerIn;
  if (t < appear) return null;
  const kIn = prog(t, appear, 12 * F, POP);
  const kOut = prog(t, b.retract - 2 * F, 8 * F, EXIT);
  if (kOut >= 1) return null;
  const passed = b.steps.filter((s) => t >= s);
  const n = 3 - passed.length;
  const last = passed.length ? passed[passed.length - 1] : undefined;
  const roll = last !== undefined ? prog(t, last, 5 * F, SNAP) : 1;
  const punch = last !== undefined ? 1 + 0.14 * (1 - prog(t, last, 9 * F, SNAP)) : 1;
  const blink = t >= b.ringEnd ? (Math.floor(((t - b.ringEnd) * 60) / 6) % 2 === 0 ? 1 : 0.3) : 1;
  const hand = Math.max(0, t - b.ring) * 1100;
  // Il tremble sur sa dernière demi-seconde (et un instant après 00:00), une position par image.
  const step = Math.floor(t * 60);
  const shaking = t >= b.ringEnd - 0.5 && t < b.ringEnd + 8 * F;
  const shx = shaking ? 3 * (hash("S2-tsx", step) * 2 - 1) : 0;
  const shy = shaking ? 3 * (hash("S2-tsy", step) * 2 - 1) : 0;
  const shr = shaking ? 1.5 * (hash("S2-tsr", step) * 2 - 1) : 0;
  const H = 66;
  const digit = (v: number, dy: number) => (
    <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: H, display: "flex", alignItems: "center", justifyContent: "center", transform: `translateY(${dy}%)` }}>{v}</div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: CX - 190,
        top: 152 - 48,
        width: 380,
        height: 96,
        borderRadius: 999,
        background: "rgba(26,33,41,.92)",
        border: `2px solid ${rgba(ACT1.coral, 0.45)}`,
        boxShadow: `0 20px 50px rgba(0,0,0,.5), 0 0 40px ${rgba(ACT1.coral, 0.18 * blink)}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        transform: `translate(${shx}px, ${(1 - kIn) * 26 + shy}px) rotate(${shr}deg) scale(${(0.6 + 0.4 * kIn) * punch * (1 - 0.4 * kOut)})`,
        opacity: clamp01(kIn * 1.5) * (1 - kOut),
        filter: kOut > 0 ? `blur(${kOut * 10}px)` : undefined,
      }}
    >
      <svg width={54} height={58} viewBox="0 0 48 52" style={{ opacity: blink }}>
        <rect x={19} y={2} width={10} height={7} rx={2} fill={ACT1.coral} />
        <rect x={38} y={10} width={7} height={5} rx={2} fill={ACT1.coral} transform="rotate(40 41 12)" />
        <circle cx={24} cy={30} r={18} fill="none" stroke={ACT1.coral} strokeWidth={4} />
        <line x1={24} y1={30} x2={24} y2={17} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" transform={`rotate(${hand} 24 30)`} />
        <circle cx={24} cy={30} r={3} fill="#FFFFFF" />
      </svg>
      <div style={{ ...digits(60, 600), color: ACT1.coral, display: "flex", height: H, alignItems: "center", opacity: blink, textShadow: `0 0 18px ${rgba(ACT1.coral, 0.55)}` }}>
        <span>00:0</span>
        <span style={{ position: "relative", display: "inline-block", width: "0.62em", height: H, overflow: "hidden" }}>
          {last !== undefined && roll < 1 && digit(n + 1, -100 * roll)}
          {digit(n, last !== undefined ? 100 * (1 - roll) : 0)}
        </span>
      </div>
    </div>
  );
}

/** Le point final (relais vers S3) : éclatement en 8 gouttelettes + onde, puis respiration 1 ↔ 1,05. */
function PointAndPop({ t, b }: { t: number; b: Beats }) {
  const from = b.retract + 10 * F;
  if (t < from) return null;
  const sc = t < b.pop ? 1 : keys(t, [[b.pop, 1], [b.pop + 2 * F, 0.72, SNAP], [b.pop + 6 * F, 1.28, SNAP], [b.pop + 16 * F, 1, SNAP]]);
  const breathe = 1 + 0.025 * (1 - Math.cos((t - from) * Math.PI * 2 * 1.4));
  const u = t - b.pop;
  return (
    <>
      {u >= 0 && u < 10 * F + 0.05 &&
        Array.from({ length: 8 }, (_, k) => {
          const ang = (k / 8) * Math.PI * 2 + 0.2;
          const kk = SNAP(clamp01(u / (10 * F)));
          const r = 120 * kk;
          const x = POINT.x + Math.cos(ang) * (26 + r);
          const y = POINT.y + Math.sin(ang) * (26 + r);
          const s = 15 * (1 - 0.55 * kk);
          const stretch = 1 + 0.9 * (1 - kk);
          return (
            <div
              key={k}
              style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: "50%", background: ACT1.g3, opacity: 1 - clamp01(u / (10 * F)), transform: `rotate(${(ang * 180) / Math.PI}deg) scaleX(${stretch})` }}
            />
          );
        })}
      <Ring t={t} at={b.pop} x={POINT.x} y={POINT.y} max={300} color={rgba(ACT1.g4, 0.8)} width={4} life={0.3} echo />
      <div
        style={{
          position: "absolute",
          left: POINT.x - POINT.d / 2,
          top: POINT.y - POINT.d / 2,
          width: POINT.d,
          height: POINT.d,
          borderRadius: "50%",
          background: ACT1.g3,
          boxShadow: `0 0 18px ${rgba(ACT1.g4, 0.25)}`,
          transform: `scale(${sc * breathe})`,
        }}
      />
    </>
  );
}

// ─── Glitch de la direction : copies teintées #FF0040 / #00FFF0 (écran) ±8 px + 6 bandes ±30 px ─────────────
function GlitchFx({ t, at, dur, render }: { t: number; at: number; dur: number; render: () => ReactNode }) {
  if (t < at || t >= at + dur) return <AbsoluteFill>{render()}</AbsoluteFill>;
  const step = Math.floor((t - at) * 60);
  const bands = Array.from({ length: 6 }, (_, k) => {
    const top = hash(`S2-bt${step}`, k) * 92;
    const h = 2 + hash(`S2-bh${step}`, k) * 7;
    const off = (hash(`S2-bo${step}`, k) < 0.5 ? -1 : 1) * rnd(`S2-bx${step}`, k, 12, 30);
    return { top, h, off };
  });
  const dx = 8;
  return (
    <AbsoluteFill>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="s2-rgb" x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0.25 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={dx} dy={0} result="ro" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
          <feOffset in="gb" dx={-dx} dy={0} result="gbo" />
          <feBlend in="ro" in2="gbo" mode="screen" />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: "url(#s2-rgb)" }}>
        <AbsoluteFill>{render()}</AbsoluteFill>
        {bands.map((bd, k) => (
          <AbsoluteFill key={k} style={{ clipPath: `inset(${bd.top}% 0 ${Math.max(0, 100 - bd.top - bd.h)}% 0)`, transform: `translateX(${bd.off}px)` }}>
            {render()}
          </AbsoluteFill>
        ))}
      </AbsoluteFill>
      {/* Une ligne de balayage blanche, 1 image sur 2. */}
      {step % 2 === 0 && <div style={{ position: "absolute", left: 0, right: 0, top: `${hash("S2-scan", step) * 70 + 10}%`, height: 3, background: "rgba(255,255,255,.5)" }} />}
    </AbsoluteFill>
  );
}

// ─── La scène ─────────────────────────────────────────────────────────────────────────────────────────────

export function Scene02({ t, time }: SceneProps) {
  const b = beats(time);
  const look = time.look(t);
  // La lueur menthe : allumée avec CONSEIL, éteinte lettre à lettre par l'anneau.
  const litIn = prog(t, b.word, 0.35, SNAP);
  const eatenShare = LETTERS.filter((l) => !l.q).reduce((s, l) => s + prog(t, b.eaten[l.i], 6 * F, SNAP), 0) / 7;
  const lit = litIn * (1 - eatenShare) * (1 + 0.12 * Math.sin(t * 5));

  const impacts = LETTERS.map((l) => fallSpec(l.i, b).imp1).sort((x, y) => x - y);
  const shakes: Shake[] = [
    ...b.steps.map((at) => ({ at, amp: 3, frames: 6 })),
    { at: b.glitch, amp: 12, frames: 12 },
    { at: impacts[0], amp: 6, frames: 9 },
    { at: impacts[4], amp: 4, frames: 8 },
    { at: b.pop, amp: 4, frames: 8 },
  ];
  // Caméra : lente poussée, coup de zoom à « Pas le temps », à-coup au glitch, retour à 1 pour le relais (point à 960, 540).
  const zoom =
    keys(t, [
      [b.m0, 1],
      [b.ring, 1.03, (x) => x],
      [b.ring + 6 * F, 1.05, SNAP],
      [b.glitch, 1.055, (x) => x],
      [b.glitch + 3 * F, 1.085, SNAP],
      [b.retract, 1.04, SNAP],
      [b.retract + 12 * F, 1.0, SNAP],
    ]);
  const cam = { zoom, origin: [960, 520] as [number, number], shakes };

  const world = () => (
    <AbsoluteFill style={{ background: INK }}>
      <DotGrid t={t} opacity={look.dots} />
      {/* Arrière-plan : flaque de lumière grise, poussière lointaine, grand « ? » en contour. */}
      <Camera t={t} {...cam} depth={0.3} blur={6}>
        <Spot x={CX} y={CY + 20} r={760} color={ACT1.g2} alpha={0.55} />
        <Spot x={CX} y={CY} r={560} color={ACT1.mint} alpha={0.1 * lit} />
        <BackDust t={t} />
      </Camera>
      <Camera t={t} {...cam} depth={0.6} blur={2}>
        <GiantQuestion t={t} b={b} />
      </Camera>
      {/* Le monde. */}
      <Camera t={t} {...cam}>
        <Orbit t={t} b={b} front={false} />
        <BubbleBurst t={t} b={b} />
        <Bubble t={t} b={b} lit={lit} />
        <Floor t={t} b={b} />
        <MotionBlur on={t >= b.fall && t < b.end} samples={6}>
          {(tt) => <Letters t={tt} b={b} />}
        </MotionBlur>
        <BiteSparks t={t} b={b} />
        <Orbit t={t} b={b} front />
        <Timer t={t} b={b} />
        <PointAndPop t={t} b={b} />
      </Camera>
      {/* Avant-plan : bokeh flou. */}
      <Camera t={t} {...cam} depth={1.6} blur={3}>
        <Bokeh t={t} />
      </Camera>
    </AbsoluteFill>
  );

  return (
    <AbsoluteFill style={{ background: INK }}>
      <GlitchFx t={t} at={b.glitch} dur={3 * F} render={world} />
      {/* Flash au moment où le temps est écoulé. */}
      <AbsoluteFill style={{ background: ACT1.coral, opacity: 0.1 * pulse(t, b.glitch, F, F, 4 * F), pointerEvents: "none" }} />
    </AbsoluteFill>
  );
}

/** L'onde et la gerbe grises quand la barre se gonfle en bulle : deux échos du contour qui s'élargissent, poussière éjectée. */
function BubbleBurst({ t, b }: { t: number; b: Beats }) {
  const u = t - b.m0;
  if (u < 0 || u > 0.7) return null;
  return (
    <>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {[0, 5].map((delay, k) => {
          const kk = prog(t, b.m0 + (6 + delay) * F, 0.5, SNAP);
          if (kk <= 0 || kk >= 1) return null;
          const e = 30 + 260 * kk;
          return <path key={k} d={bubblePath(CX, CY, BUB.w + 2 * e, BUB.h + 2 * e * 0.8, BUB.r + e * 0.8, 0)} fill="none" stroke={ACT1.g4} strokeWidth={3 - 2 * kk} opacity={(k ? 0.18 : 0.32) * (1 - kk)} />;
        })}
      </svg>
      {Array.from({ length: 18 }, (_, k) => {
        const ang = (k / 18) * Math.PI * 2 + hash("S2-bb", k) * 0.35;
        const kk = SNAP(clamp01((u - 6 * F) / 0.5));
        if (kk <= 0 || kk >= 1) return null;
        const r0x = BUB.w / 2;
        const r0y = BUB.h / 2;
        const d = rnd("S2-bbr", k, 60, 220) * kk;
        const x = CX + Math.cos(ang) * (r0x + d);
        const y = CY + Math.sin(ang) * (r0y + d * 0.7);
        const s = rnd("S2-bbs", k, 3, 7) * (1 - 0.5 * kk);
        return <div key={k} style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: "50%", background: ACT1.g4, opacity: 0.6 * (1 - kk) }} />;
      })}
    </>
  );
}

/** Étincelles corail au-dessus de chaque lettre que l'anneau dévore. */
function BiteSparks({ t, b }: { t: number; b: Beats }) {
  const out: ReactNode[] = [];
  LETTERS.forEach((l) => {
    const u = t - b.eaten[l.i];
    if (u < 0 || u > 0.28) return;
    for (let k = 0; k < 6; k++) {
      const id = l.i * 10 + k;
      const ang = ((-90 + rnd("S2-ba", id, -70, 70)) * Math.PI) / 180;
      const sp = rnd("S2-bs", id, 220, 520);
      const x = l.x + Math.cos(ang) * sp * u;
      const y = CY - 64 + Math.sin(ang) * sp * u + 1200 * u * u;
      const len = 16 * (1 - u / 0.28);
      out.push(
        <div
          key={id}
          style={{ position: "absolute", left: x - len, top: y - 1.5, width: len, height: 3, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${k % 2 ? ACT1.coral : "#FFFFFF"})`, transformOrigin: "100% 50%", transform: `rotate(${(ang * 180) / Math.PI}deg)`, opacity: 1 - u / 0.28 }}
        />,
      );
    }
    // Petite bouffée de cendre grise qui monte.
    for (let k = 0; k < 4; k++) {
      const id = l.i * 10 + k + 100;
      const x = l.x + rnd("S2-ax", id, -40, 40) + noise2D("S2-ash", id, t * 2) * 10;
      const y = CY - 20 - 140 * u - rnd("S2-ay", id, 0, 40);
      const s = rnd("S2-as", id, 3, 6);
      out.push(<div key={id} style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: "50%", background: ACT1.g3, opacity: 0.6 * (1 - u / 0.28) }} />);
    }
  });
  return <>{out}</>;
}

/** Poussière lointaine qui dérive (couche 0,3). */
function BackDust({ t }: { t: number }) {
  return (
    <>
      {Array.from({ length: 34 }, (_, i) => {
        const x = (noise2D("S2-dx", i * 0.37, t * 0.08) * 0.5 + 0.5) * 2100 - 90;
        const y = (noise2D("S2-dy", i * 0.61, t * 0.08) * 0.5 + 0.5) * 1000;
        const s = rnd("S2-ds", i, 2, 5);
        const tw = 0.55 + 0.45 * Math.sin(t * (1.4 + hash("S2-dt", i) * 2) + i);
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: "50%", background: ACT1.g4, opacity: 0.22 * tw }} />;
      })}
    </>
  );
}

/** Grand « ? » en contour gris qui dérive derrière la bulle (couche 0,6) et se décroche au glitch. */
function GiantQuestion({ t, b }: { t: number; b: Beats }) {
  const kIn = prog(t, b.m0 + 6 * F, 0.5, SNAP);
  const drop = t > b.glitch ? 0.5 * 2600 * (t - b.glitch) ** 2 : 0;
  const rot = -12 + 6 * Math.sin(t * 0.9) + (t > b.glitch ? (t - b.glitch) * 60 : 0);
  return (
    <div
      style={{
        position: "absolute",
        left: 1360,
        top: 120 + drop,
        fontFamily: JAKARTA,
        fontWeight: 800,
        fontSize: 760,
        lineHeight: 1,
        color: "transparent",
        WebkitTextStroke: `2px ${rgba(ACT1.g4, 0.09)}`,
        transform: `translateX(${(1 - kIn) * 120 + wobble(t, 41, 10, 0.8)}px) rotate(${rot}deg)`,
        opacity: kIn,
      }}
    >
      ?
    </div>
  );
}

/** Bokeh d'avant-plan : quelques disques flous qui passent lentement. */
function Bokeh({ t }: { t: number }) {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => {
        const x = rnd("S2-kx", i, -100, 2000) + t * rnd("S2-kv", i, -40, 40);
        const y = rnd("S2-ky", i, 60, 860) + wobble(t, 60 + i, 14, 0.6);
        const s = rnd("S2-ks", i, 40, 120);
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(ACT1.g4, 0.07)} 0%, transparent 70%)` }} />;
      })}
    </>
  );
}

/** Les effets sonores de la scène (secondes du film). */
export const cues: SceneCues = (time) => {
  const b = beats(time);
  const impacts = LETTERS.map((l) => fallSpec(l.i, b).imp1).sort((x, y) => x - y);
  return [
    cue("bubble_pop", b.m0 + 3 * F, 0.5),
    // Frappe de CONSEIL : un clic par lettre posée, de plus en plus aigu ; le « ? » fait un petit pop.
    ...LETTERS.map((l) => (l.q ? cue("ui_pop", b.lands[l.i], 0.3, 0.9) : cue("ui_click", b.lands[l.i], 0.32, 1 + 0.06 * l.i))),
    // Le minuteur claque, puis tic-tac à chaque cran (le dernier cran est le glitch).
    cue("hud_lock", b.timerIn, 0.3, 1.2),
    cue("tick_metronome", b.ring, 0.5),
    ...b.steps.slice(0, -1).map((at, k) => cue("tick_metronome", at, 0.55, 1.1 + 0.15 * k)),
    cue("stopwatch_tension", b.ring, 0.6, 1.2),
    cue("glitch_burst", b.glitch, 0.7),
    cue("box_drop", impacts[0], 0.25, 1.6),
    cue("box_drop", impacts[3], 0.25, 1.6),
    cue("box_drop", impacts[impacts.length - 1], 0.25, 1.6),
    cue("bubble_pop", b.pop, 0.5, 0.8),
  ];
};
