import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing } from "remotion";
import { noise2D } from "@remotion/noise";
import { BURST_MS } from "../../../../src/core/robot/mascot";
import { Mascot, simulate, type Track, type TrackFrame } from "../mascot";
import { ACT1, Camera, DotGrid, EXIT, F, IN_OUT, INK, LINEAR, PB, POP, SNAP, clamp01, cue, hash, keys, lerp, prog, pulse, rgba, rnd, wobble } from "./kit";
import type { Fx } from "./sound";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S4 · L'éveil — voix P5 « Et si quelqu'un / y pensait… / pour vous ? ». Fenêtre : P5.start − 0,1 → DROP.
 *
 *   seg(P5,1)  le pixel menthe laissé par S3 se scinde en deux yeux (POP), qui s'ouvrent, font la mise au point
 *              (flou 8 → 0) et s'allument avec un halo ; éclair anamorphique ; poussée caméra continue 1 → 1,25 sur
 *              les yeux (pivot entre les yeux) ; clignement.
 *   seg(P5,2)  regard à gauche puis à droite (humeur « thinking », points de réflexion) ; les anneaux des écouteurs
 *              s'allument, un balayage de lumière (masque au bord adouci + liseré blanc + halo menthe sur le front)
 *              révèle le casque et la blouse pendant que la caméra recule (1,26 → 1,04) ; 120 étincelles menthe
 *              convergent en spirale vers le robot.
 *   seg(P5,3)  sourire, coucou (index levé), micro-poussée 1 → 1,04 ; anneau de pulsation qui rallume derrière lui
 *              le monde gris de l'acte 1 (comptoir, tapis, file) à 35 %, et une vague de points.
 *   P5.end → DROP  anticipation : le robot inspire (s'étire, regarde vers le haut), le cadre se contracte
 *              (1,06 → 0,86, EXIT), la vignette se ferme (0,3 → 0,6), des traits d'aspiration convergent ; l'index
 *              retombe juste avant les 0,12 s de silence ; sur les 0,25 dernières secondes le robot s'écrase
 *              (scaleY 0,82, scaleX 1,1, pivot aux pieds) et tremble, chargé — la chute (S5) le libère.
 *
 * RELAIS au DROP (pour S5) : monde gris à 35 % derrière le robot (composant exporté <GreyWorld/>), robot centré,
 * size 520, yeux de visière en (960, 520).
 * ======================================================================== */

// ---- Géométrie du robot (mesurée dans le SVG de mascot.tsx) ---------------------------------------------------
// Buste dès 48 px : la tête est dans un groupe translate(10 −9) scale(.8) ; viewBox « 0 −4 100 92 ».
// Les yeux (tête : cx 38 / 62, cy 42) tombent en viewBox à (40,4 / 59,6 ; 24,6) : écartement 19,2 u ≈ 100 px à 520 px.
const SIZE = 520;
const H = Math.round(SIZE * 0.92);
const U = H / 92; // px par unité de viewBox (preserveAspectRatio meet : la hauteur commande)
const PAD_X = (SIZE - 100 * U) / 2;
const EYE_Y = 520;
const M_LEFT = 960 - SIZE / 2;
const M_TOP = EYE_Y - (24.6 + 4) * U;
const FEET_Y = M_TOP + 92 * U;
/** Centre du robot (pulsation, spirale). */
const CX = 960;
const CY = 590;
/** Le cadre des calques masqués (plus grand que le robot : la main du coucou et les particules débordent). */
const WRAP = { x: M_LEFT - 190, y: M_TOP - 110, w: 900, h: 720 };
const MX = 190;
const MY = 110;

type Pose = ReturnType<typeof simulate>[number]["pose"];

/** Poussée sur les yeux : presque linéaire (continue), qui s'arrondit à l'arrivée. */
const PUSH = Easing.bezier(0.3, 0.12, 0.55, 1);
/** L'écrasement : part vite, se pose net. */
const SQUASH = Easing.bezier(0.45, 0, 0.2, 1);

function rotAbout(x: number, y: number, cx: number, cy: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

/** Un point du viewBox du robot (avant sa pose) → l'écran, en appliquant la pose du moteur (mêmes transformations que le SVG). */
function toScreen(p: Pose, vx: number, vy: number): [number, number] {
  let x = 50 + (vx - 50) * p.sx;
  let y = 84 + (vy - 84) * p.sy;
  [x, y] = rotAbout(x, y, 50, 46, p.roll);
  [x, y] = rotAbout(x, y, 50, 84, p.tilt);
  x += p.ox;
  y += p.oy;
  return [M_LEFT + PAD_X + x * U, M_TOP + (y + 4) * U];
}
const head = (hx: number, hy: number): [number, number] => [10 + 0.8 * hx, -9 + 0.8 * hy];
const eyeAt = (p: Pose, side: -1 | 1) => toScreen(p, ...head((side < 0 ? 38 : 62) + p.yaw * 5, 42 + p.pitch * 3.6));
const earAt = (p: Pose, side: -1 | 1) => toScreen(p, ...head(side < 0 ? 10 : 90, 45));
/** Taille d'un œil « pilule » à l'écran (rx 4,8 / ry 6,4 dans la tête). */
const EYE_W = 2 * 4.8 * 0.8 * U;
const EYE_H = 2 * 6.4 * 0.8 * U;

// ---- Les instants de la scène -------------------------------------------------------------------------------
function beats(time: SceneProps["time"]) {
  const A1 = time.seg(5, 1);
  const A2 = time.seg(5, 2);
  const A3 = time.seg(5, 3);
  const E = time.Z("P5");
  const D = time.DROP;
  const split = A1 + 3 * F; // le pixel s'étire 3 images, puis se scinde
  const open = A1 + 10 * F; // les yeux s'ouvrent
  const xf = A1 + 20 * F; // fondu des yeux dessinés vers ceux du robot
  const blink = Math.min(A1 + 0.5, A2 - 0.1);
  const sweep = A2 + 0.22; // balayage de lumière (0,5 s), anneaux des écouteurs 4 images avant
  const ring = A3 + 0.03; // anneau de pulsation
  const wave = A3 - 0.1; // le coucou (la main est en l'air 0,53 s plus tard)
  const crouch = D - 0.45; // l'onde inversée et le halo qui monte avant la chute
  const squash = D - 0.25; // le robot s'écrase (0,25 dernières secondes)
  const silence = D - 0.12; // les 0,12 s de silence avant la chute
  const handDown = silence - 0.22; // l'index retombe (0,18 s) juste avant le silence
  return { A1, A2, A3, E, D, split, open, xf, blink, sweep, ring, wave, crouch, squash, silence, handDown };
}
type Beats = ReturnType<typeof beats>;

function robotTrack(b: Beats): Track {
  return {
    id: `S4-eveil-v2-${b.A1.toFixed(3)}-${b.D.toFixed(3)}`,
    seed: 4104,
    until: b.D + 0.3,
    events: [
      { t: b.blink, kind: "blink" },
      { t: b.A2, kind: "glance", x: -0.85, y: 0.05, dur: 0.24 },
      { t: b.A2 + 0.24, kind: "mood", mood: "thinking" },
      { t: b.A2 + 0.24, kind: "glance", x: 0.9, y: -0.1, dur: 0.4 },
      // Le coucou (visage heureux, sourire) : le moteur lève la main 0,25 s après — l'index est en l'air sur « vous ».
      // L'humeur repasse à « idle » (sinon « thinking » revient, avec ses points, juste avant la chute).
      { t: b.wave, kind: "mood", mood: "idle" },
      { t: b.wave, kind: "burst", burst: "wave" },
      // L'inspiration : il lève les yeux vers le haut pendant que tout se contracte, puis revient au centre.
      { t: b.E + 0.08, kind: "glance", x: -0.12, y: -0.45, dur: Math.max(0.2, b.squash - b.E - 0.2) },
    ],
  };
}

/**
 * Retouches des poses calculées par le moteur (la piste est en cache dans mascot.tsx : on retouche UNE fois le
 * tableau partagé, que <Mascot> relit ensuite) :
 *   - l'index retombe entre handDown et handDown + 0,18 s (le coucou du moteur le garderait levé jusqu'après la chute) ;
 *   - le visage reste heureux (yeux rieurs, sourire) jusqu'à la chute, au lieu de redevenir neutre à la fin du coucou.
 */
const TUNED = new WeakSet<TrackFrame[]>();
function tuneFrames(frames: TrackFrame[], b: Beats) {
  if (TUNED.has(frames)) return;
  TUNED.add(frames);
  const waveEnd = Math.round((b.wave + BURST_MS.wave / 1000) * 60) - 1;
  const happy = frames[Math.max(0, Math.min(frames.length - 1, waveEnd))];
  for (let i = 0; i < frames.length; i++) {
    const t = i / 60;
    const f = frames[i];
    if (t >= b.handDown) {
      const k = 1 - IN_OUT(clamp01((t - b.handDown) / 0.18));
      f.pose.hand *= k;
      f.pose.handSwing *= k;
    }
    if (i > waveEnd && happy) {
      f.face = happy.face;
      f.pose.eye = happy.pose.eye;
    }
  }
}

// ---- Petits outils ------------------------------------------------------------------------------------------
/** Battement de cœur (« poum-poum ») toutes les `period` secondes : 0 → 1. */
function heartbeat(t: number, t0: number, period = 0.84) {
  if (t < t0) return 0;
  const ph = (t - t0) % period;
  const bump = (c: number, w: number) => Math.exp(-(((ph - c) / w) ** 2));
  return Math.min(1, bump(0.05, 0.045) + 0.6 * bump(0.22, 0.05));
}

const abs = (left: number, top: number, extra?: CSSProperties): CSSProperties => ({ position: "absolute", left, top, ...extra });

function Masked({ mask, children, style }: { mask?: string; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", left: WRAP.x, top: WRAP.y, width: WRAP.w, height: WRAP.h, maskImage: mask, WebkitMaskImage: mask, ...style }}>{children}</div>;
}

/** Le bas de la blouse se fond dans le noir (le buste « sort » de l'ombre). */
const BOTTOM_FADE = `linear-gradient(180deg, #000 0px, #000 ${(MY + 74 * U).toFixed(1)}px, transparent ${(MY + 91 * U).toFixed(1)}px)`;

// ---- LE MONDE GRIS DE L'ACTE 1 (comptoir, tapis, file) — exporté pour S5 (les éclats) -------------------------
const SIL_GRAD = `linear-gradient(180deg, ${ACT1.g3}, #5D6773)`;

function Silhouette({ x, y, s, t, i }: { x: number; y: number; s: number; t: number; i: number }) {
  const bob = Math.sin(t * 5.2 + i * 1.7) * 2.5 * s;
  return (
    <div style={abs(x - 45 * s, y + bob, { width: 90 * s, height: 300 * s })}>
      <div style={abs(15 * s, 0, { width: 60 * s, height: 60 * s, borderRadius: "50%", background: ACT1.g3 })} />
      <div style={abs(0, 70 * s, { width: 90 * s, height: 230 * s, borderRadius: `${45 * s}px ${45 * s}px 12px 12px`, background: SIL_GRAD })} />
    </div>
  );
}

/** L'image grise : étagères, croix éteinte, file d'attente, caisse, tapis et comptoir. Composition 1920×1080, sans fond transparent. */
export function GreyWorld({ t = 0 }: { t?: number }) {
  const shelves = [176, 318, 460];
  return (
    <AbsoluteFill style={{ background: ACT1.ink, overflow: "hidden" }}>
      {/* le mur du fond */}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, #10151B 0%, ${ACT1.ink} 70%)` }} />
      {shelves.map((y, row) => {
        const items: ReactNode[] = [];
        let x = 30 + row * 22;
        let k = 0;
        while (x < 1900) {
          const w = rnd("S4-shelf-w", row * 97 + k, 36, 92);
          const h = rnd("S4-shelf-h", row * 97 + k, 46, 92);
          const tone = [ACT1.g1, ACT1.g2, "#222A33", "#3A444F"][Math.floor(hash("S4-shelf-c", row * 97 + k) * 4)];
          items.push(<div key={k} style={abs(x, y - h, { width: w, height: h, borderRadius: 6, background: tone, boxShadow: `inset 0 3px 0 ${rgba(ACT1.g4, 0.08)}` })} />);
          x += w + rnd("S4-shelf-gap", row * 97 + k, 6, 26);
          k++;
        }
        return (
          <div key={row}>
            {items}
            <div style={abs(0, y, { width: 1920, height: 12, background: ACT1.g2, boxShadow: "0 10px 24px rgba(0,0,0,.5)" })} />
          </div>
        );
      })}
      {/* la croix de pharmacie éteinte */}
      <div style={abs(196, 548, { width: 120, height: 120 })}>
        <div style={abs(40, 0, { width: 40, height: 120, borderRadius: 6, background: ACT1.g2 })} />
        <div style={abs(0, 40, { width: 120, height: 40, borderRadius: 6, background: ACT1.g2 })} />
      </div>
      {/* la file d'attente, de l'autre côté du comptoir */}
      {[
        [1330, 1],
        [1462, 0.93],
        [1580, 0.87],
        [1686, 0.81],
        [1782, 0.76],
        [1868, 0.72],
      ].map(([x, s], i) => (
        <Silhouette key={i} x={x} y={430 + (1 - s) * 120} s={s} t={t} i={i} />
      ))}
      {/* l'écran de caisse */}
      <div style={abs(400, 496, { width: 220, height: 136, borderRadius: 12, background: ACT1.g2, border: `3px solid #3A444F` })}>
        {[0, 1, 2, 3].map((k) => (
          <div key={k} style={abs(18, 20 + k * 26, { width: [150, 110, 168, 80][k], height: 10, borderRadius: 5, background: rgba(ACT1.g4, 0.16) })} />
        ))}
      </div>
      <div style={abs(496, 632, { width: 28, height: 26, background: "#3A444F" })} />
      {/* le comptoir */}
      <div style={abs(0, 654, { width: 1920, height: 30, background: `linear-gradient(180deg, #4A5562, ${ACT1.g2})`, boxShadow: `0 -1px 0 ${rgba(ACT1.g4, 0.35)}` })} />
      <div style={abs(0, 684, { width: 1920, height: 396, background: `linear-gradient(180deg, ${ACT1.g1}, #101419)` })} />
      {/* le tapis et ses boîtes */}
      <div style={abs(40, 622, { width: 330, height: 32, borderRadius: 16, background: ACT1.g1, border: `2px solid ${ACT1.g2}`, overflow: "hidden" })}>
        {Array.from({ length: 14 }, (_, k) => (
          <div key={k} style={abs(((k * 28 + t * 60) % 392) - 30, 0, { width: 3, height: 32, background: rgba(ACT1.g4, 0.1) })} />
        ))}
      </div>
      {[
        [70, 96, 62, ACT1.g3],
        [180, 74, 48, "#6B7584"],
        [268, 84, 70, "#5D6773"],
      ].map(([x, w, h, c], k) => (
        <div key={k} style={abs((x as number) + ((t * 60) % 40) * 0, 622 - (h as number), { width: w as number, height: h as number, borderRadius: 8, background: c as string, boxShadow: `inset 0 -10px 0 ${rgba("#000", 0.12)}` })}>
          <div style={abs(12, 14, { width: (w as number) - 24, height: 8, borderRadius: 4, background: rgba(ACT1.ink, 0.25) })} />
        </div>
      ))}
    </AbsoluteFill>
  );
}

// ---- Les yeux du début : le pixel qui se scinde ---------------------------------------------------------------
function SplitEyes({ t, b, pose }: { t: number; b: Beats; pose: Pose }) {
  const fade = 1 - prog(t, b.xf, 6 * F, LINEAR);
  if (fade <= 0) return null;
  const stretch = prog(t, b.A1, 3 * F, SNAP); // le pixel s'étire avant de se scinder
  const apart = prog(t, b.split, 10 * F, POP); // les deux moitiés s'écartent (dépassement)
  const speed = t > b.split && t < b.split + 7 * F ? 1 - (t - b.split) / (7 * F) : 0;
  const opening = prog(t, b.open, 10 * F, POP);
  const blur = lerp(8, 0, prog(t, b.split, 12 * F, SNAP));
  const hl = prog(t, b.open + 6 * F, 5 * F, SNAP);
  const out: ReactNode[] = [];
  ([-1, 1] as const).forEach((side) => {
    const [tx, ty] = eyeAt(pose, side);
    const x = lerp(CX + side * 4 * stretch, tx, apart);
    const y = lerp(EYE_Y, ty, apart);
    const w = lerp(8 + 10 * stretch + 22 * speed, EYE_W, opening);
    const h = lerp(8 - 3 * stretch, EYE_H, opening);
    out.push(
      <div key={side} style={abs(x - w / 2, y - h / 2, { width: w, height: h, borderRadius: "50%", background: PB.mint2, filter: `blur(${blur.toFixed(2)}px) drop-shadow(0 0 18px ${rgba(PB.mint, 0.9)}) drop-shadow(0 0 60px ${rgba(PB.mint, 0.4)})` })}>
        <div style={abs(w / 2 - 6.2 * opening - 7, h / 2 - 10.8 * opening - 7, { width: 14, height: 14, borderRadius: "50%", background: "#fff", opacity: 0.85 * hl })} />
      </div>,
    );
  });
  // Le filament qui relie les deux moitiés au moment de la scission.
  const fil = t >= b.split && t < b.split + 9 * F ? 1 - (t - b.split) / (9 * F) : 0;
  const [lx] = eyeAt(pose, -1);
  const [rx] = eyeAt(pose, 1);
  const half = lerp(4, (rx - lx) / 2, apart);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: fade }}>
      {fil > 0 && <div style={abs(CX - half, EYE_Y - 1, { width: half * 2, height: 2, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${PB.mint2}, transparent)`, opacity: fil, boxShadow: `0 0 12px ${PB.mint}` })} />}
      {out}
    </div>
  );
}

/** Le halo des yeux (fusion « screen ») : suit les yeux du robot ; respire et bat. */
function EyeGlow({ t, b, pose, power }: { t: number; b: Beats; pose: Pose; power: number }) {
  if (power <= 0) return null;
  const sharp = prog(t, b.split, 12 * F, SNAP);
  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen", pointerEvents: "none" }}>
      {([-1, 1] as const).map((side) => {
        const [x, y] = eyeAt(pose, side);
        const w = 86 - 20 * sharp;
        const h = 104 - 24 * sharp;
        return <div key={side} style={abs(x - w / 2, y - h / 2, { width: w, height: h, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(PB.mint2, 0.55 * power)}, transparent)`, filter: "blur(6px)" })} />;
      })}
      <div style={abs(CX - 230, EYE_Y - 120, { width: 460, height: 240, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(PB.mint, 0.22 * power)}, transparent)` })} />
    </div>
  );
}

/** Éclair anamorphique horizontal à l'ouverture des yeux. */
function Flare({ t, at, y, strength = 1 }: { t: number; at: number; y: number; strength?: number }) {
  const k = pulse(t, at, 4 * F, 0, 0.6) * strength;
  if (k <= 0) return null;
  const w = 1700 * (0.7 + 0.3 * prog(t, at, 0.5, SNAP));
  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen", pointerEvents: "none" }}>
      <div style={abs(CX - w / 2, y - 16, { width: w, height: 32, background: `linear-gradient(90deg, transparent, ${rgba(PB.mint, 0.35 * k)} 30%, ${rgba(PB.mint2, 0.6 * k)} 50%, ${rgba(PB.mint, 0.35 * k)} 70%, transparent)`, filter: "blur(10px)" })} />
      <div style={abs(CX - w * 0.45, y - 1, { width: w * 0.9, height: 2, background: `linear-gradient(90deg, transparent, ${rgba("#FFFFFF", 0.9 * k)} 50%, transparent)` })} />
    </div>
  );
}

/** Les anneaux turquoise des écouteurs, qui s'allument juste avant le balayage. */
function EarRings({ t, b, pose }: { t: number; b: Beats; pose: Pose }) {
  const on = b.sweep - 4 * F;
  if (t < on) return null;
  const pop = prog(t, on, 10 * F, POP);
  const fl = pulse(t, on, 3 * F, 2 * F, 0.5);
  const breathe = 0.35 + 0.12 * Math.sin((t - on) * 7);
  const level = Math.max(fl, breathe);
  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen", pointerEvents: "none" }}>
      {([-1, 1] as const).map((side) => {
        const [x, y] = earAt(pose, side);
        const r = 29 * (0.6 + 0.4 * pop);
        return (
          <div key={side}>
            <div style={abs(x - r * 2.6, y - r * 2.6, { width: r * 5.2, height: r * 5.2, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(PB.mint, 0.5 * level)}, transparent)` })} />
            <div style={abs(x - r, y - r, { width: r * 2, height: r * 2, borderRadius: "50%", border: `5px solid ${rgba(PB.mint2, 0.95 * level + 0.05)}`, boxShadow: `0 0 18px ${rgba(PB.mint, 0.9 * level)}, inset 0 0 12px ${rgba(PB.mint, 0.6 * level)}`, boxSizing: "border-box" })} />
          </div>
        );
      })}
    </div>
  );
}

/** 120 étincelles qui convergent en spirale (rayon 900 → 40, +2π, accélération) ; chacune s'éteint en arrivant.
 *  Traîne = le chemin parcouru pendant les 2,5 dernières images : points lents au départ, traits filants à l'arrivée. */
function SpiralSparks({ t, at, dur }: { t: number; at: number; dur: number }) {
  if (t < at || t > at + dur + 0.05) return null;
  const N = 120;
  const tails: ReactNode[] = [];
  const heads: ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const delay = hash("S4-spiral-d", i) * dur * 0.4;
    const life = dur - delay - hash("S4-spiral-u", i) * dur * 0.12;
    const uAt = (tt: number) => (tt - at - delay) / life;
    const u = uAt(t);
    if (u <= 0 || u >= 1) continue;
    const r0 = 900 * (0.6 + 0.55 * hash("S4-spiral-r", i));
    const a0 = hash("S4-spiral-a", i) * Math.PI * 2;
    const pos = (uu: number) => {
      const e = Math.pow(clamp01(uu), 2.2);
      const r = lerp(r0, 40, e);
      const a = a0 + Math.PI * 2 * e;
      return [CX + Math.cos(a) * r, CY - 40 + Math.sin(a) * r * 0.82, r] as const;
    };
    const [x1, y1, r1] = pos(u);
    const w = 2 + hash("S4-spiral-w", i) * 3;
    const op = Math.min(1, u / 0.1) * clamp01((r1 - 70) / 160);
    if (op <= 0) continue;
    const white = i % 6 === 0;
    // Traîne courbe et effilée : 4 tronçons le long de la spirale (1,6 image de trajet).
    let prev: readonly [number, number, number] = [x1, y1, r1];
    for (let j = 1; j <= 4; j++) {
      const p = pos(uAt(t - (j * 1.6 * F) / 4));
      tails.push(<line key={`${i}-${j}`} x1={prev[0].toFixed(1)} y1={prev[1].toFixed(1)} x2={p[0].toFixed(1)} y2={p[1].toFixed(1)} stroke={white ? "#FFFFFF" : PB.mint2} strokeWidth={(w * (1 - j * 0.2)).toFixed(2)} strokeLinecap="round" opacity={(op * (0.8 - j * 0.17)).toFixed(3)} />);
      prev = p;
    }
    heads.push(<circle key={i} cx={x1.toFixed(1)} cy={y1.toFixed(1)} r={(w / 2 + 0.6).toFixed(2)} fill={white ? "#FFFFFF" : "#BFFFF2"} opacity={op.toFixed(3)} />);
  }
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, overflow: "visible", filter: `drop-shadow(0 0 5px ${rgba(PB.mint, 0.95)})` }}>
      {tails}
      {heads}
    </svg>
  );
}

/** Traits d'aspiration : tout est tiré vers le robot avant la chute (traînée = 3 images de trajet), 3 px à 50 %. */
function Suction({ t, from, to }: { t: number; from: number; to: number }) {
  if (t < from || t > to) return null;
  const N = 84;
  const span = to - from;
  const lines: ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const delay = hash("S4-suck-d", i) * span * 0.5;
    const life = span - delay;
    const uAt = (tt: number) => clamp01((tt - from - delay) / life);
    const u = uAt(t);
    if (u <= 0 || u >= 1) continue;
    const a = hash("S4-suck-a", i) * Math.PI * 2;
    const R0 = 1150 + 250 * hash("S4-suck-r", i);
    const r = (uu: number) => lerp(R0, 230, Math.pow(uu, 2.4));
    const r1 = r(u);
    const r0 = r(uAt(t - 3 * F)) + 24;
    const op = Math.min(1, u / 0.12) * (1 - clamp01((u - 0.82) / 0.18));
    const mint = i % 3 === 0;
    lines.push(<line key={i} x1={(CX + Math.cos(a) * r0).toFixed(1)} y1={(CY + Math.sin(a) * r0 * 0.9).toFixed(1)} x2={(CX + Math.cos(a) * r1).toFixed(1)} y2={(CY + Math.sin(a) * r1 * 0.9).toFixed(1)} stroke={mint ? PB.mint2 : "#FFFFFF"} strokeWidth={3} strokeLinecap="round" opacity={(op * 0.5).toFixed(3)} />);
  }
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {lines}
    </svg>
  );
}

/** Onde inversée : un anneau qui se resserre sur le robot pendant la contraction (l'onde de choc de S5 repartira d'ici). */
function Implode({ t, from, to }: { t: number; from: number; to: number }) {
  if (t < from || t >= to) return null;
  return (
    <>
      {[0, 0.09].map((d, j) => {
        const k = prog(t, from + d, to - from - d, (x) => Math.pow(x, 2.2));
        if (k <= 0) return null;
        const r = lerp(1150, 250, k);
        const a = Math.min(1, k * 3) * (j ? 0.35 : 0.6);
        return <div key={j} style={abs(CX - r, CY - r * 0.92, { width: r * 2, height: r * 1.84, borderRadius: "50%", border: `${j ? 2 : 3}px solid ${rgba(PB.mint2, a)}`, boxShadow: `0 0 30px ${rgba(PB.mint, a * 0.6)}`, boxSizing: "border-box" })} />;
      })}
    </>
  );
}

/** Bokeh d'avant-plan (couche 1,6×, floue). */
function Bokeh({ t, alpha }: { t: number; alpha: number }) {
  if (alpha <= 0) return null;
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const s = rnd("S4-bokeh-s", i, 14, 46);
        const x = (noise2D("S4-bokeh-x", i * 0.73, t * 0.08) * 0.5 + 0.5) * 1920;
        const y = (noise2D("S4-bokeh-y", i * 0.41, t * 0.08) * 0.5 + 0.5) * 860;
        const a = alpha * rnd("S4-bokeh-a", i, 0.05, 0.16) * (0.7 + 0.3 * Math.sin(t * 2 + i));
        return <div key={i} style={abs(x - s / 2, y - s / 2, { width: s, height: s, borderRadius: "50%", background: i % 3 === 0 ? rgba("#FFFFFF", a) : rgba(PB.mint2, a * 1.3) })} />;
      })}
    </>
  );
}

/** Poussière en suspension, éclairée par les yeux puis par le robot ; aspirée vers lui avant la chute. */
function Motes({ t, alpha, pull }: { t: number; alpha: number; pull: number }) {
  if (alpha <= 0) return null;
  return (
    <>
      {Array.from({ length: 46 }, (_, i) => {
        let x = (noise2D("S4-mote-x", i * 0.37, t * 0.07) * 0.5 + 0.5) * 1500 + 210;
        let y = (noise2D("S4-mote-y", i * 0.61, t * 0.07) * 0.5 + 0.5) * 760 + 120;
        x = CX + (x - CX) * (1 - 0.55 * pull);
        y = CY + (y - CY) * (1 - 0.55 * pull);
        const d = Math.hypot(x - CX, (y - EYE_Y) * 1.4);
        const lit = clamp01(1.25 - d / 620);
        const s = rnd("S4-mote-s", i, 2, 4.4);
        const tw = 0.6 + 0.4 * Math.sin(t * (1.5 + hash("S4-mote-t", i) * 2.5) + i);
        return <div key={i} style={abs(x - s / 2, y - s / 2, { width: s, height: s, borderRadius: "50%", background: i % 4 === 0 ? PB.mint2 : "#FFFFFF", opacity: alpha * lit * tw * 0.7 })} />;
      })}
    </>
  );
}

/** Éclat en étoile à quatre branches (reflet sur la visière au sourire). */
function Glint({ t, at, x, y, size = 46 }: { t: number; at: number; x: number; y: number; size?: number }) {
  const k = pulse(t, at, 7 * F, 2 * F, 0.32);
  if (k <= 0) return null;
  const rot = 90 * prog(t, at, 0.5, SNAP);
  const s = size * (0.3 + 0.9 * k);
  return (
    <svg width={s} height={s} viewBox="-10 -10 20 20" style={{ position: "absolute", left: x - s / 2, top: y - s / 2, transform: `rotate(${rot}deg)`, opacity: k, filter: `drop-shadow(0 0 6px ${rgba(PB.mint2, 0.9)})`, overflow: "visible" }}>
      <path d="M 0 -10 C 0.8 -2 2 -0.8 10 0 C 2 0.8 0.8 2 0 10 C -0.8 2 -2 0.8 -10 0 C -2 -0.8 -0.8 -2 0 -10 Z" fill="#FFFFFF" />
    </svg>
  );
}

/** Petits arcs du coucou, à côté de la main levée. */
function WaveArcs({ t, pose }: { t: number; pose: Pose }) {
  if (pose.hand < 0.5) return null;
  const [hx, hy] = toScreen(pose, 89, 34);
  const k = clamp01((pose.hand - 0.5) / 0.5);
  return (
    <svg width={160} height={160} viewBox="0 0 160 160" style={{ position: "absolute", left: hx + 10, top: hy - 110, overflow: "visible", opacity: k, filter: `drop-shadow(0 0 6px ${rgba(PB.mint, 0.7)})` }}>
      {[0, 1].map((j) => {
        const ph = (t * 2.2 + j * 0.5) % 1;
        const r = 26 + j * 22 + ph * 8;
        return <path key={j} d={`M ${20 + Math.cos(-1.1) * r} ${120 + Math.sin(-1.1) * r} A ${r} ${r} 0 0 1 ${20 + Math.cos(0.1) * r} ${120 + Math.sin(0.1) * r}`} stroke={PB.mint2} strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.9 - ph * 0.5} />;
      })}
    </svg>
  );
}

// ---- LA SCÈNE ---------------------------------------------------------------------------------------------------
export function Scene04({ t, time }: SceneProps) {
  const b = beats(time);
  const track = robotTrack(b);
  const frames = simulate(track);
  tuneFrames(frames, b);
  const pose = frames[Math.max(0, Math.min(frames.length - 1, Math.round(t * 60)))].pose;

  // Caméra (pivot entre les yeux) : poussée continue 1 → 1,25 sur les yeux pendant seg(P5,1), qui s'arrondit au début
  // du balayage ; recul pendant la révélation (1,26 → 1,04) ; lente poussée jusqu'à la fin de P5 (1,06) ; puis
  // contraction vers le robot jusqu'à la chute (1,06 → 0,86, EXIT : de plus en plus vite).
  const zoom = keys(t, [
    [b.A1, 1],
    [b.A2 + 0.12, 1.26, PUSH],
    [b.A3, 1.04, IN_OUT],
    [b.E, 1.06, LINEAR],
    [b.D, 0.86, EXIT],
  ]);
  const cam = { zoom, origin: [CX, EYE_Y] as [number, number], shakes: [{ at: b.ring, amp: 5, frames: 12 }] };

  // Le pixel du relais (S3), avant la scission.
  const pixel = t < b.split;

  // Le balayage de lumière : bord de 0 → 1 sur 0,5 s ; luminosité .3 → 1. Bord ADOUCI (lumière, pas volet) : le corps
  // apparaît sur ~150 px en dégradé (paliers adoucis), le liseré blanc s'éteint en douceur devant, un halo menthe éclaire le front.
  const sw = prog(t, b.sweep, 0.5, IN_OUT);
  const revealed = t >= b.sweep;
  const edge = lerp(MX - 60, MX + SIZE + 300, sw);
  const bright = lerp(0.3, 1, prog(t, b.sweep + 0.08, 0.55, SNAP));
  const px = (d: number) => `${(edge + d).toFixed(1)}px`;
  // Devant la lumière, le robot n'est pas noir mais dans l'ombre (10 %) : le balayage l'ÉCLAIRE au lieu de le découper.
  const shade = (0.1 * prog(t, b.sweep, 0.12, LINEAR)).toFixed(3);
  const bodyMask = sw >= 1 ? undefined : `linear-gradient(90deg, #000 0px, #000 ${px(-250)}, rgba(0,0,0,.8) ${px(-196)}, rgba(0,0,0,.55) ${px(-140)}, rgba(0,0,0,.32) ${px(-88)}, rgba(0,0,0,.18) ${px(-40)}, rgba(0,0,0,${shade}) ${px(10)}, rgba(0,0,0,${shade}) 100%)`;
  const rimMask = `linear-gradient(90deg, transparent ${px(-250)}, rgba(0,0,0,.22) ${px(-170)}, rgba(0,0,0,.7) ${px(-110)}, #000 ${px(-80)}, rgba(0,0,0,.6) ${px(-55)}, rgba(0,0,0,.25) ${px(-28)}, rgba(0,0,0,.06) ${px(-6)}, transparent ${px(16)})`;
  const rimOn = sw > 0 && sw < 1 ? Math.min(1, sw * 6, (1 - sw) * 6) : 0;

  // Les yeux du robot (visière seule, masque ovale) après le fondu ; tout le robot une fois balayé.
  const eyesOp = prog(t, b.xf, 6 * F, LINEAR);
  const visorMask = `radial-gradient(ellipse 122px 46px at ${(MX + PAD_X + 50 * U).toFixed(1)}px ${(MY + 28 * U).toFixed(1)}px, #000 68%, transparent 100%)`;

  // Le robot (pivot aux pieds) : micro-poussée sur « vous » (1 → 1,04) ; après P5 il INSPIRE (s'étire : 0,985 × 1,035) ;
  // sur les 0,25 dernières secondes il s'ÉCRASE (1,1 × 0,82), puis tremble, chargé, jusqu'à la chute ; flottement.
  const push = lerp(1, 1.04, prog(t, b.A3, 0.4, POP));
  const squat = prog(t, b.crouch, b.D - b.crouch, IN_OUT);
  const sx = keys(t, [
    [b.E, 1],
    [b.squash, 0.985, IN_OUT],
    [b.D - 0.07, 1.1, SQUASH],
  ]);
  const sy = keys(t, [
    [b.E, 1],
    [b.squash, 1.035, IN_OUT],
    [b.D - 0.07, 0.82, SQUASH],
  ]);
  const charged = prog(t, b.D - 0.13, 0.05, LINEAR);
  const trembleX = charged * 3.2 * noise2D("S4-tremble-x", t * 38, 0);
  const trembleY = charged * 1.6 * noise2D("S4-tremble-y", 0, t * 38);
  const floatY = wobble(t, 4, 3, 1.4) * prog(t, b.sweep, 0.6, LINEAR) * (1 - prog(t, b.squash, 0.1, LINEAR));
  const robotTransform = `translate(${trembleX.toFixed(2)}px, ${(floatY + trembleY).toFixed(2)}px) scale(${(push * sx).toFixed(4)}, ${(push * sy).toFixed(4)})`;

  // La vignette se ferme pendant l'anticipation : avec celle de l'orchestrateur (0,3), ≈ 0,6 aux coins à la chute.
  const iris = 0.43 * prog(t, b.E, b.D - b.E, IN_OUT);

  // Lumière : halo des yeux, halo du robot (qui bat comme un cœur), étincelles arrivées.
  const glowPower = prog(t, b.split, 8 * F, SNAP) * (1 - 0.35 * prog(t, b.sweep + 0.3, 0.4, SNAP)) + 0.25 * heartbeat(t, b.A1 + 0.1) * prog(t, b.split, 0.3) + 0.45 * prog(t, b.crouch, b.D - b.crouch, LINEAR);
  const charge = prog(t, b.A2 + 0.45, 0.4, SNAP);
  const haloA = (0.05 * prog(t, b.split, 0.4, SNAP) + 0.1 * prog(t, b.sweep, 0.5, SNAP) + 0.06 * charge + 0.1 * squat) * (0.75 + 0.45 * heartbeat(t, b.A1 + 0.1));

  // L'anneau de pulsation et le monde gris qu'il rallume (35 %, front d'onde plus lumineux).
  const ringK = prog(t, b.ring, 30 * F, SNAP);
  const ringR = 800 * ringK + 520 * prog(t, b.ring + 0.45, 0.7, SNAP);
  const front = 1 - prog(t, b.ring + 0.25, 0.4, LINEAR);
  const worldMask =
    t < b.ring
      ? "linear-gradient(transparent, transparent)"
      : `radial-gradient(circle at ${CX}px ${CY}px, rgba(0,0,0,.35) 0px, rgba(0,0,0,.35) ${Math.max(0, ringR - 140).toFixed(1)}px, rgba(0,0,0,${(0.35 + 0.45 * front).toFixed(3)}) ${Math.max(0, ringR - 14).toFixed(1)}px, transparent ${(ringR + 30).toFixed(1)}px)`;

  const pull = prog(t, b.E, b.D - b.E, EXIT);
  const motesA = prog(t, b.split, 0.3, SNAP);
  // Le bokeh d'avant-plan entre dès l'ouverture des yeux (à 55 %) : sa parallaxe (1,6×) rend la poussée sensible sur le noir.
  const bokehA = Math.max(0.55 * prog(t, b.split, 0.5, SNAP), prog(t, b.sweep + 0.2, 0.5, SNAP));
  const glintPos = toScreen(pose, ...head(30, 30));

  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      {/* Le monde gris (couche lointaine 0,6×, floue de 2 px), révélé par la pulsation, et sa grille de points. */}
      <AbsoluteFill style={{ maskImage: worldMask, WebkitMaskImage: worldMask }}>
        <Camera t={t} {...cam} depth={0.6} blur={2}>
          <AbsoluteFill style={{ transform: "scale(1.08)", transformOrigin: "960px 540px" }}>
            <GreyWorld t={t} />
          </AbsoluteFill>
        </Camera>
      </AbsoluteFill>
      {t >= b.ring && <DotGrid t={t} opacity={time.look(t).dots * prog(t, b.ring, 0.5, LINEAR)} wave={{ at: b.ring, x: CX, y: CY, speed: 2000, width: 180, strength: 0.4 }} />}

      <Camera t={t} {...cam}>
        {/* Le halo du robot. */}
        <div style={abs(CX - 560, CY - 520, { width: 1120, height: 1040, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(PB.mint, haloA)}, ${rgba(PB.teal, haloA * 0.5)} 55%, transparent)` })} />
        <Motes t={t} alpha={motesA} pull={pull} />

        {/* L'anneau de pulsation (et son écho). */}
        {[0, 5 * F].map((d, j) => {
          const k = prog(t, b.ring + d, 30 * F, SNAP);
          if (t < b.ring + d || k >= 1) return null;
          const r = 800 * k;
          return <div key={j} style={abs(CX - r, CY - r, { width: r * 2, height: r * 2, borderRadius: "50%", border: `${j ? 2 : 3}px solid ${rgba(PB.mint, (1 - k) * (j ? 0.5 : 1))}`, boxShadow: j ? undefined : `0 0 24px ${rgba(PB.mint, 0.5 * (1 - k))}, inset 0 0 24px ${rgba(PB.mint, 0.35 * (1 - k))}`, boxSizing: "border-box" })} />;
        })}

        {/* Les étincelles qui convergent (derrière le robot : elles « entrent » en lui), l'onde inversée avant la chute. */}
        <SpiralSparks t={t} at={b.A2} dur={Math.min(0.8, b.A3 - b.A2 - 0.02)} />
        <Implode t={t} from={b.crouch} to={b.D} />

        {/* LE ROBOT (et tout ce qui lui est attaché : yeux, anneaux, reflets), pivot aux pieds. */}
        <AbsoluteFill style={{ transformOrigin: `${CX}px ${FEET_Y.toFixed(1)}px`, transform: robotTransform }}>
          {revealed && (
            <Masked mask={bodyMask} style={{ filter: `brightness(${bright.toFixed(3)})` }}>
              <div style={{ position: "absolute", inset: 0, maskImage: BOTTOM_FADE, WebkitMaskImage: BOTTOM_FADE }}>
                <Mascot track={track} t={t} size={SIZE} look={null} style={abs(MX, MY)} />
              </div>
            </Masked>
          )}
          {eyesOp > 0 && sw < 1 && (
            <Masked mask={visorMask} style={{ opacity: eyesOp }}>
              <Mascot track={track} t={t} size={SIZE} look={null} style={abs(MX, MY)} />
            </Masked>
          )}
          {rimOn > 0 && (
            <Masked mask={rimMask} style={{ opacity: 0.6 * rimOn, mixBlendMode: "screen" }}>
              <div style={{ position: "absolute", inset: 0, maskImage: BOTTOM_FADE, WebkitMaskImage: BOTTOM_FADE, filter: `brightness(0) invert(1) drop-shadow(0 0 10px ${rgba(PB.mint, 0.9)})` }}>
                <Mascot track={track} t={t} size={SIZE} look={null} style={abs(MX, MY)} />
              </div>
            </Masked>
          )}
          {/* Le halo menthe qui porte le front du balayage (ellipse haute, sans bords). */}
          {rimOn > 0 && (
            <div style={abs(WRAP.x + edge - 70 - 210, M_TOP - 190, { width: 420, height: 860, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(PB.mint2, 0.34 * rimOn)}, ${rgba(PB.mint, 0.14 * rimOn)} 50%, transparent)`, mixBlendMode: "screen", pointerEvents: "none" })} />
          )}

          <EarRings t={t} b={b} pose={pose} />
          {pixel && t >= b.A1 - 0.2 && <div style={abs(CX - 4, EYE_Y - 4, { width: 8, height: 8, background: PB.mint, boxShadow: `0 0 24px ${PB.mint}` })} />}
          {!pixel && <SplitEyes t={t} b={b} pose={pose} />}
          <EyeGlow t={t} b={b} pose={pose} power={glowPower} />
          <Glint t={t} at={b.A3 + 0.06} x={glintPos[0]} y={glintPos[1]} size={54} />
          <WaveArcs t={t} pose={pose} />
        </AbsoluteFill>

        {/* L'aspiration avant la chute (dès la fin de P5). */}
        <Suction t={t} from={b.E + 0.1} to={b.D} />
      </Camera>

      {/* L'éclair anamorphique à l'ouverture des yeux (écran). */}
      <Flare t={t} at={b.open} y={EYE_Y} />

      {/* Avant-plan : bokeh (1,6×, flou 3 px). */}
      <Camera t={t} {...cam} depth={1.6} blur={3}>
        <Bokeh t={t} alpha={bokehA} />
      </Camera>

      {/* La vignette qui se ferme avant la chute. */}
      {iris > 0 && <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(ellipse 75% 75% at 50% 48%, transparent 42%, rgba(0,0,0,${iris.toFixed(3)}) 100%)` }} />}
    </AbsoluteFill>
  );
}

/** Les effets sonores de la scène (secondes du film) : cue("nom", temps, gain, vitesse). */
export const cues: SceneCues = (time) => {
  const b = beats(time);
  const riser = riserCue(time);
  return [
    // Nappe sombre et chaude + battement de cœur (3,5 s) ; la direction veut un fondu de sortie de 0,2 s finissant à DROP − 0,12.
    cue("awakening_pad", time.win.S4.start, 0.6),
    // Démarrage du robot (gazouillis montants) sur « quelqu'un », quand le pixel se scinde — à 0,35 : ses gazouillis
    // tombent dans la bande de la parole et couvraient la question chuchotée « Et si quelqu'un ».
    cue("robot_boot", b.A1 + 0.05, 0.35),
    // Scintillement sur le sourire (et le reflet de la visière).
    cue("sparkle_shimmer", b.A3, 0.4),
    riser,
  ];
};

/**
 * Montée inversée (2,0 s) qui aspire : elle finit à DROP − 0,06 (la voix occupe de toute façon le « silence » de la
 * contraction : « Voici » est dit dessous). Après P5, sous « Voici », elle n'est baissée qu'à × 0,75 (au lieu de × 0,4) :
 * sa crête ne s'affaisse plus avant l'explosion ; « Voici » reste nettement au-dessus.
 */
function riserCue(time: SceneProps["time"]): Fx {
  const b = beats(time);
  const end = b.D - 0.06;
  return { ...cue("reverse_riser", end - 2.0, 0.8), preDrop: b.D - end, duck: 0.75, duckFrom: b.E + 0.3 };
}
