import type { CSSProperties } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { evolvePath } from "@remotion/paths";
import { ScanBarcode, Star } from "lucide-react";
import { Mascot, simulate, type Track, type TrackEvent } from "../mascot";
import {
  Backdrop,
  Camera,
  Converge,
  DotGrid,
  Dust,
  EXIT,
  F,
  GOLD_METAL,
  IN_OUT,
  JAKARTA,
  MONO,
  MotionBlur,
  POP,
  PB,
  Ring,
  SNAP,
  Sparks,
  Spot,
  ballistic,
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
  wobble,
} from "./kit";
import type { Fx } from "./sound";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S9 · LA FÊTE — voix P12 (« Vente terminée… et le robot fait la fête ! »). Fenêtre : P12.start − 0,1 → P13.start.
 *
 *   RELAIS      l'état final de S8, redessiné à l'identique : robot (440, pieds 960, 420 px), panneau (1240, 470) avec
 *               la carte Ultra-Levure vendue, le bouton « Vente terminée » et son soulignement menthe.
 *   P12·0       « Vente terminée… » : le curseur (le pharmacien) revient et clique (seg + 0,25). Retenue de 8 images
 *               (le panneau inspire). IMPLOSION en 10 images EXIT : le panneau se rétracte en tournant, vire au doré
 *               et devient une BOULE d'or de 60 px qui vibre de plus en plus vite (6 → 20 Hz) ; anneaux et étincelles
 *               aspirés ; la salle s'assombrit ; le robot se tasse (anticipation), les yeux sur la boule.
 *   P12·1       « et le robot » : ÉCLATEMENT — flash doré, anneau, éclats d'or, vague dorée dans la grille. Le robot
 *               BONDIT au centre en grandissant (420 → 560 px), étiré en vol, salto, écrasé à l'atterrissage.
 *   P12·2       « fait la fête ! » : deux canons à confettis (gauche puis droite, 2 × 130 confettis étirés selon leur
 *               vitesse) qui tonnent 0,15 s AVANT « fait » (la détonation tombe dans la respiration ; leur pluie sonore plonge
 *               sous « fait la fête » et remonte pleine dans le silence après P12), six serpentins,
 *               BRAVO ! doré lettre par lettre (RESSORT) avec reflet, rayons dorés qui tournent, secousse. LA DANSE,
 *               calée sur la musique (time.beat, un pas par temps de 0,5 s) : balancement ±8° pivot aux pieds,
 *               petit saut entre deux temps, écrasement 0,92 sur chaque temps, geste « party » au deuxième temps.
 *               Le robot de scène garde le bas de sa blouse au-dessus de y = 900, même écrasé à l'atterrissage et caméra
 *               poussée (pieds à 866, 560 px) : la pilule des sous-titres (934 → 1010) ne touche jamais la blouse ni la tablette.
 *   RESPIRATION ralenti (dτ/dt 1 → .25 en 12 images) ; les confettis flottent puis s'aimantent sur le contour des
 *               4 tuiles de S10 (le tracé se dessine autour de chaque tuile) ; le robot rétrécit (190 px) et rejoint
 *               la tuile « Comptoir 1 ». RELAIS à S10 : contours de confettis + robot de la marque dans la tuile 1.
 * ======================================================================== */

const MINT = PB.mint;
const MINT2 = PB.mint2;
const INK = PB.ink;
const STOCK = PB.stock;
const GOLD = PB.gold;
const GOLD_HI = PB.goldHi;
const GOLD_LO = PB.goldLo;
const GOLD_PALE = "#FFE7A3";
const GOLD_WHITE = "#FFF6D6";

// ---- Géométrie (px du cadre 1920×1080) ------------------------------------------------------------------------
const ROBOT = { cx: 440, feet: 960, size: 420 };
/** Sur scène : le bas de la blouse (= « pieds » du buste) reste au-dessus de y = 900 (pilule des sous-titres : 934 → 1010),
 *  y compris l'écrasement de l'atterrissage (+25 px mesurés) et le zoom de caméra 1,035. */
const STAGE = { cx: 960, feet: 866, size: 560 };
/** Le robot de la tuile 1 de S10 : centre à tile.left + 130, pieds à tile.bottom − 24, size 190. */
const TILE_ROBOT = { cx: 354 + 130, feet: 462 - 24, size: 190 };
const PANEL = { cx: 1240, cy: 470, w: 980, h: 520 };
const CARD = { x: 30, y: 66, w: 920, h: 284 };
/** Le bouton « Vente terminée » (local au panneau) et le soulignement (écran y = 690 → local 480). */
const BTN = { x: 250, y: 368, w: 480, h: 88 };
const BTN_C = { x: PANEL.cx - PANEL.w / 2 + BTN.x + BTN.w / 2, y: PANEL.cy - PANEL.h / 2 + BTN.y + BTN.h / 2 };
const UNDER_Y = 690 - (PANEL.cy - PANEL.h / 2);
const BALL = { x: PANEL.cx, y: PANEL.cy, d: 60 };
const TIP = { x: BTN_C.x + 14, y: BTN_C.y + 10 };
/** Les 4 tuiles de S10. */
const TILES = [
  { cx: 654, cy: 297 },
  { cx: 1266, cy: 297 },
  { cx: 654, cy: 651 },
  { cx: 1266, cy: 651 },
].map((c) => ({ ...c, w: 600, h: 330, r: 28 }));
const PER_TILE = 65;
/** Les canons (cônes de fête) : pivot hors cadre, axe, longueur → bouche. */
const POPPERS = [
  { x: 60, y: 1100, ang: -60 },
  { x: 1860, y: 1100, ang: -120 },
].map((p) => ({ ...p, len: 200, mouth: { x: p.x + 200 * Math.cos((p.ang * Math.PI) / 180), y: p.y + 200 * Math.sin((p.ang * Math.PI) / 180) } }));
/** BRAVO ! remonté d'autant que le robot (et 10 % plus petit que la direction) : l'air reste entre le mot et la tête. */
const BRAVO = { cx: 960, cy: 180, size: 198 };
const RAYS = { x: 960, y: 600 };
/** Un temps de la musique (120 BPM, grille time.beat). */
const BEAT = 0.5;

// ---- Les ancrages (voix mesurée) ----------------------------------------------------------------------------------
function anchorsOf(time: Time) {
  const W0 = time.win.S9.start;
  const W1 = time.win.S9.end;
  const P12 = time.A("P12", 0); // « Vente terminée »
  const CUR0 = P12 - 0.04; // le curseur revient
  const CLICK = P12 + 0.25;
  const IMP0 = CLICK + 8 * F; // retenue de 8 images
  const IMP1 = IMP0 + 10 * F; // implosion en 10 images
  const BOOM = time.A("P12", 1); // « et le robot » : éclatement
  const LEAP = 0.45;
  const LAND = BOOM + LEAP;
  const FETE = time.A("P12", 2); // « fait la fête »
  // Les canons tonnent AVANT « fait » : la détonation (large bande) ne couvre pas le mot-clé de la fête.
  const FIRE_L = FETE - 0.15;
  const FIRE_R = FIRE_L + 0.08;
  // La danse, sur la grille de la musique : premier temps une fois l'atterrissage amorti, entrée un demi-temps avant.
  const BEAT0 = time.beat(Math.ceil((LAND + 0.22 - time.DROP) / BEAT));
  const DANCE0 = BEAT0 - BEAT / 2;
  const PARTY = BEAT0 + BEAT; // le deuxième temps : geste « party »
  const P12Z = time.Z("P12");
  const SLOW = P12Z; // ralenti
  const MAG0 = Math.min(P12Z + 0.2, W1 - 0.42); // aimantation
  const MAG_STAG = 0.15;
  const MAG_DUR = Math.max(0.2, Math.min(0.4, W1 - 4 * F - MAG0 - MAG_STAG));
  const MAG_END = MAG0 + MAG_STAG + MAG_DUR;
  const SHRINK0 = MAG0 - 0.06;
  const SHRINK1 = W1 - 7 * F;
  // L'état final de S8 (pour redessiner son relais à l'identique).
  const S8W0 = time.win.S8.start;
  const S8EXIT = time.Z("P11") - 0.1;
  return { W0, W1, P12, CUR0, CLICK, IMP0, IMP1, BOOM, LEAP, LAND, FETE, FIRE_L, FIRE_R, BEAT0, DANCE0, PARTY, P12Z, SLOW, MAG0, MAG_STAG, MAG_DUR, MAG_END, SHRINK0, SHRINK1, S8W0, S8EXIT };
}
type Anchors = ReturnType<typeof anchorsOf>;

// ---- Le temps physique (ralenti de la respiration) ----------------------------------------------------------------
const SLOW_RAMP = 12 * F;
const SLOW_MIN = 0.25;
function rate(t: number, a: Anchors) {
  return t <= a.SLOW ? 1 : 1 - (1 - SLOW_MIN) * IN_OUT(clamp01((t - a.SLOW) / SLOW_RAMP));
}
/** τ(t) : le temps des confettis, des serpentins et des rayons (dτ/dt = rate). La danse, elle, reste sur les temps réels de la musique. */
function tau(t: number, a: Anchors) {
  if (t <= a.SLOW) return t;
  const u = Math.min(t - a.SLOW, SLOW_RAMP);
  let acc = 0;
  const n = 12;
  for (let i = 0; i < n; i++) acc += rate(a.SLOW + ((i + 0.5) / n) * u, a) * (u / n);
  return a.SLOW + acc + Math.max(0, t - a.SLOW - SLOW_RAMP) * SLOW_MIN;
}

// ---- Petites aides ------------------------------------------------------------------------------------------------
type Pt = { x: number; y: number };
function mixHex(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, clamp01(k)));
  return `${ch(16)},${ch(8)},${ch(0)}`;
}
function lerpAngle(a: number, b: number, k: number) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * k;
}
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt => {
  const v = 1 - u;
  return { x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x, y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y };
};

// ---- La piste du robot --------------------------------------------------------------------------------------------
function robotTrack(a: Anchors): Track {
  const ev: TrackEvent[] = [
    { t: 0, kind: "mood", mood: "happy" },
    { t: a.CUR0 + 0.02, kind: "glance", x: 0.8, y: 0.35, dur: a.CLICK - a.CUR0 + 0.1 },
    { t: a.CLICK + 2 * F, kind: "blink" },
    { t: a.IMP0, kind: "emote", emote: "surprised", dur: Math.max(0.2, a.BOOM - a.IMP0 - 0.04) },
    { t: a.IMP0 + 0.02, kind: "glance", x: 0.95, y: -0.2, dur: Math.max(0.2, a.BOOM - a.IMP0 - 0.02) },
    { t: a.BOOM, kind: "mood", mood: "celebrate" },
    { t: a.LAND, kind: "squash" },
    { t: a.LAND + 0.02, kind: "emit", particle: "star", count: 5 },
    { t: a.FETE + 0.02, kind: "glance", x: 0, y: -0.85, dur: 0.32 },
    { t: a.FETE + 0.3, kind: "emit", particle: "heart", count: 3 },
    { t: a.PARTY, kind: "burst", burst: "party" },
    { t: a.MAG0, kind: "glance", x: -0.7, y: -0.6, dur: 0.32 },
    { t: a.SHRINK1, kind: "squash" },
    { t: a.SHRINK1 + 2 * F, kind: "blink" },
  ];
  return { id: `S9-host-${Math.round(a.BOOM * 1000)}-${Math.round(a.FETE * 1000)}-${Math.round(a.W1 * 1000)}`, seed: 909, events: ev, until: a.W1 + 0.4 };
}

// ---- La pose du robot ---------------------------------------------------------------------------------------------
/** `lean` : balancement de la danse (degrés), pivot aux pieds ; `spin` : rotation autour du centre du corps ;
 *  `dance` : 0 → 1, la danse a la main (le balancement propre du moteur est alors neutralisé, voir <Robot/>). */
type RPose = { x: number; feet: number; size: number; sx: number; sy: number; spin: number; lean: number; air: number; dance: number };

/**
 * La danse, calée sur la grille de la musique (time.beat, 120 BPM) : un pas par temps. φ = temps écoulés depuis BEAT0.
 * Sur chaque temps : penché au bout de son pas (±8°, pivot aux pieds, alterné), écrasé 0,92 ; entre deux temps : petit
 * saut, le corps repasse à la verticale en l'air.
 */
function dance(t: number, a: Anchors) {
  const phi = (t - a.BEAT0) / BEAT;
  const s = Math.cos(Math.PI * phi); // +1 sur les temps pairs, −1 sur les impairs
  const lean = 8 * Math.sign(s) * Math.pow(Math.abs(s), 0.55);
  const dx = 38 * Math.sign(s) * Math.pow(Math.abs(s), 0.7);
  const f = phi - Math.floor(phi); // 0 sur le temps → 1 juste avant le suivant
  const air = Math.sin(Math.PI * f);
  const since = f * BEAT;
  const until = (1 - f) * BEAT;
  const hit = Math.max(phi >= 0 ? Math.exp(-since / 0.07) : 0, clamp01(1 - until / (1.5 * F)) ** 2);
  return { lean, dx, hop: -30 * air, air, hit };
}

function robotPose(t: number, a: Anchors): RPose {
  // 1. Le relais, puis l'anticipation : il se tasse, tremble, prêt à bondir.
  if (t < a.BOOM) {
    const c0 = a.CLICK + 0.15;
    const crouch = prog(t, c0, Math.max(0.1, a.BOOM - c0 - 2 * F), IN_OUT);
    const trem = crouch * crouch;
    return { x: ROBOT.cx + 2.4 * trem * Math.sin(t * 95), feet: ROBOT.feet, size: ROBOT.size, sx: 1 + 0.06 * crouch, sy: 1 - 0.1 * crouch, spin: 0, lean: 0, air: 0, dance: 0 };
  }
  // 2. Le bond : arc de 0,45 s, grandit, étiré en vol, salto.
  if (t < a.LAND) {
    const u = (t - a.BOOM) / a.LEAP;
    const H = 330;
    const x = lerp(ROBOT.cx, STAGE.cx, 1 - Math.pow(1 - u, 1.5));
    const feet = lerp(ROBOT.feet, STAGE.feet, u) - H * 4 * u * (1 - u);
    const size = lerp(ROBOT.size, STAGE.size, SNAP(u));
    const vy = (STAGE.feet - ROBOT.feet) - H * 4 * (1 - 2 * u);
    const st = clamp01(Math.abs(vy) / 1400);
    const takeoff = clamp01(u / 0.12);
    const sx = lerp(1.06, 1 - 0.15 * st, takeoff);
    const sy = lerp(0.9, 1 + 0.25 * st, takeoff);
    const spin = 360 * IN_OUT(clamp01((u - 0.08) / 0.8));
    return { x, feet, size, sx, sy, spin, lean: 0, air: 4 * u * (1 - u), dance: 0 };
  }
  // 3. Sur scène : atterrissage, la danse sur les temps de la musique, puis il rétrécit et file vers la tuile 1.
  const sq = squashAt(t, a.LAND, 6 * F);
  const env = prog(t, a.DANCE0, a.BEAT0 - a.DANCE0, IN_OUT) * (1 - prog(t, a.SHRINK0, 0.14, SNAP));
  const d = dance(t, a);
  const bob = 5 * Math.sin((t - a.LAND) * 3.4) * (1 - env);
  const k = prog(t, a.SHRINK0 + 0.04, Math.max(0.1, a.SHRINK1 - a.SHRINK0 - 0.04), IN_OUT);
  const size = keys(t, [
    [a.SHRINK0, STAGE.size],
    [a.SHRINK0 + 0.08, STAGE.size * 1.04, SNAP],
    [a.SHRINK1, TILE_ROBOT.size, IN_OUT],
  ]);
  const baseX = STAGE.cx + d.dx * env;
  const baseFeet = STAGE.feet + d.hop * env + bob;
  const x = lerp(baseX, TILE_ROBOT.cx, k);
  const feet = lerp(baseFeet, TILE_ROBOT.feet, k) - 150 * Math.sin(Math.PI * k);
  const arrive = squashAt(t, a.SHRINK1, 5 * F);
  const sx = sq.sx * arrive.sx * (1 + 0.06 * d.hit * env) * (1 - 0.03 * d.air * env);
  const sy = sq.sy * arrive.sy * (1 - 0.08 * d.hit * env) * (1 + 0.04 * d.air * env);
  const spin = -10 * Math.sin(Math.PI * k);
  return { x, feet, size, sx, sy, spin, lean: d.lean * env, air: Math.max(0.6 * Math.sin(Math.PI * k), 0.35 * d.air * env), dance: env };
}

/** Écrasement d'impact (0,78 / 1,18 puis rebond), comme le kit, mais neutre avant l'impact. */
function squashAt(t: number, at: number, dur: number) {
  if (t < at) return { sx: 1, sy: 1 };
  const u = (t - at) / dur;
  if (u > 4) return { sx: 1, sy: 1 };
  const k = Math.exp(-1.6 * u) * Math.cos(Math.PI * 0.5 * u);
  return { sx: 1 + 0.18 * k, sy: 1 - 0.22 * k };
}

function Robot({ t, a, track }: { t: number; a: Anchors; track: Track }) {
  const p = robotPose(t, a);
  const H = p.size * 0.92;
  const gold = prog(t, a.BOOM, 0.2, SNAP) * (1 - prog(t, a.SHRINK0, 0.3, SNAP));
  // La pose du moteur : translate(ox, oy) · rotate(tilt @ 50,84) · rotate(roll @ 50,46) · scale (viewBox 0 −4 100 92 ;
  // 1 unité = size / 100 px). On en défait une partie, de l'extérieur, dans l'ordre inverse :
  //  - le roulis (toujours) : le geste « party » fait un tour complet sur lui-même (0,95 s) ; c'est le salto du bond qui
  //    tient ce rôle (sinon le robot repart la tête en bas) ;
  //  - pendant la danse, le balancement et le sautillement de l'humeur « celebrate » (±8,6°, ±7 unités, sur une
  //    période de 0,55 s étrangère au tempo) : mesuré, il annulait exactement le pas du premier temps (−8,6° contre
  //    +8°), le robot restait droit. La danse (balancement ±8°, saut, écrasement) est alors la seule à bouger le corps,
  //    sur les temps de la musique.
  const frames = simulate(track);
  const pose = frames[Math.max(0, Math.min(frames.length - 1, Math.round(t * 60)))].pose;
  const roll = (pose.roll * 180) / Math.PI;
  const tilt = ((pose.tilt * 180) / Math.PI) * p.dance;
  const u = p.size / 100;
  const ox = pose.ox * u * p.dance;
  const oy = pose.oy * u * p.dance;
  const fill: CSSProperties = { position: "absolute", inset: 0 };
  return (
    <div
      style={{
        position: "absolute",
        left: p.x - p.size / 2,
        top: p.feet - H,
        width: p.size,
        height: H,
        transformOrigin: "50% 100%",
        transform: `rotate(${p.lean.toFixed(2)}deg) scale(${p.sx.toFixed(4)}, ${p.sy.toFixed(4)})`,
        // Pas d'ombre portée au relais (le robot de S8 n'en a pas) : elle naît avec le bond.
        filter: t < a.BOOM ? undefined : `drop-shadow(0 24px 40px rgba(0,0,0,${(0.45 * prog(t, a.BOOM, 0.2)).toFixed(3)}))${gold > 0.01 ? ` drop-shadow(0 0 28px ${rgba(GOLD, 0.35 * gold)})` : ""}`,
      }}
    >
      <div style={{ ...fill, transformOrigin: "50% 54.35%", transform: `rotate(${(p.spin - roll).toFixed(2)}deg)` }}>
        <div style={{ ...fill, transformOrigin: "50% 95.65%", transform: tilt !== 0 ? `rotate(${(-tilt).toFixed(2)}deg)` : undefined }}>
          <div style={{ ...fill, transform: ox !== 0 || oy !== 0 ? `translate(${(-ox).toFixed(2)}px, ${(-oy).toFixed(2)}px)` : undefined }}>
            <Mascot track={track} t={t} size={p.size} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** L'ombre de contact et la flaque de lumière dorée sous le robot, sur scène. */
function StageFloor({ t, a }: { t: number; a: Anchors }) {
  if (t < a.BOOM + 0.2) return null;
  const p = robotPose(t, a);
  const on = prog(t, a.LAND - 0.12, 0.25, SNAP) * (1 - prog(t, a.SHRINK0, 0.2, SNAP));
  if (on <= 0.01) return null;
  const glow = 0.7 + 0.3 * Math.sin(t * 7) + 0.6 * pulse(t, a.LAND, 2 * F, 0, 0.4) + 0.4 * pulse(t, a.FETE, 2 * F, 0, 0.5);
  const w = p.size * 0.82 * (1 - 0.35 * p.air);
  return (
    <div style={{ position: "absolute", left: p.x - w / 2, top: STAGE.feet - 30, width: w, height: 60, opacity: on }}>
      <div style={{ position: "absolute", inset: -60, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(GOLD, 0.3 * glow)}, transparent)` }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(0,0,0,.6), rgba(0,0,0,.18) 70%, transparent)" }} />
      <div style={{ position: "absolute", inset: 4, borderRadius: "50%", border: `2px solid ${rgba(GOLD_HI, 0.45 * glow)}`, boxShadow: `0 0 26px ${rgba(GOLD, 0.45 * glow)}` }} />
    </div>
  );
}

// ---- Le curseur (c'est le pharmacien qui clique) ------------------------------------------------------------------
function cursorAt(t: number, a: Anchors): { x: number; y: number; op: number; s: number } {
  if (t < a.CUR0) return { x: 2010, y: 1160, op: 0, s: 1 };
  const end: Pt = { x: TIP.x + 16, y: TIP.y + 14 };
  let p = bez({ x: 2010, y: 1160 }, { x: 1700, y: 900 }, { x: 1420, y: 760 }, end, prog(t, a.CUR0, a.CLICK - a.CUR0 - 2 * F, SNAP));
  const mag = ressort(t, a.CLICK - 0.1);
  p = { x: p.x + (TIP.x - end.x) * mag, y: p.y + (TIP.y - end.y) * mag };
  // Aspiré avec le panneau : il tourbillonne vers la boule et disparaît.
  const suck = prog(t, a.IMP0 - 2 * F, 12 * F, EXIT);
  if (suck > 0) {
    const ang = Math.atan2(p.y - BALL.y, p.x - BALL.x) + suck * 2.4;
    const r = Math.hypot(p.x - BALL.x, p.y - BALL.y) * (1 - suck);
    p = { x: BALL.x + Math.cos(ang) * r, y: BALL.y + Math.sin(ang) * r };
  }
  return { x: p.x, y: p.y, op: clamp01((t - a.CUR0) / (3 * F)) * (1 - clamp01((suck - 0.6) / 0.4)), s: 1 - 0.85 * suck };
}

function Pointer({ x, y, scale = 1, opacity = 1, ghost = false }: { x: number; y: number; scale?: number; opacity?: number; ghost?: boolean }) {
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
  if (c.op <= 0.01) return null;
  const press = 1 - 0.15 * pulse(t, a.CLICK, 2 * F, 2 * F, 4 * F);
  const ghosts = [1, 2, 3, 4, 5, 6].map((j) => {
    const g = cursorAt(t - j * 2 * F, a);
    const prev = cursorAt(t - j * 2 * F - F, a);
    const speed = Math.hypot(g.x - prev.x, g.y - prev.y) * 60;
    const op = lerp(0.5, 0.08, (j - 1) / 5) * clamp01(speed / 900) * g.op;
    return op > 0.01 ? <Pointer key={j} x={g.x} y={g.y} scale={g.s} opacity={op} ghost /> : null;
  });
  return (
    <>
      {ghosts.reverse()}
      <Pointer x={c.x} y={c.y} scale={press * c.s} opacity={c.op} />
    </>
  );
}

// ---- Le panneau de S8 (relais), qui implose en boule d'or -----------------------------------------------------------
function ProductCard({ t, a }: { t: number; a: Anchors }) {
  const stockPulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.2);
  const shine = ((t - a.S8W0) * 0.55) % 1;
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
        boxShadow: `0 0 0 3px ${STOCK}, 0 0 48px ${rgba(STOCK, 0.5)}, 0 30px 80px rgba(0,0,0,.45)`,
      }}
    >
      <div style={{ position: "absolute", inset: 0, borderRadius: 24, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${rgba(STOCK, 0.12)}, ${rgba(STOCK, 0.05)})` }} />
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 999, background: GOLD_METAL, color: INK, fontFamily: JAKARTA, fontWeight: 800, fontSize: 17, boxShadow: `0 4px 14px ${rgba(GOLD, 0.35)}` }}>
          <Star size={16} fill={INK} strokeWidth={0} />
          Challenge
        </div>
      </div>
      <div style={{ position: "absolute", left: 262, top: 164, width: 620, fontFamily: JAKARTA, fontWeight: 600, fontSize: 25, lineHeight: 1.32, color: "#2A333D" }}>
        Antibiotique : la flore intestinale peut être perturbée
      </div>
      <div style={{ position: "absolute", left: CARD.w - 42, top: -36, width: 76, height: 76 }}>
        <svg width={76} height={76} viewBox="0 0 76 76" style={{ overflow: "visible", filter: `drop-shadow(0 8px 18px ${rgba(STOCK, 0.55)})` }}>
          <circle cx={38} cy={38} r={34} fill="#FFFFFF" stroke={STOCK} strokeWidth={4} />
          <path d="M 23 39 L 34 50 L 54 28" fill="none" stroke={STOCK} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function FinalButton({ t, a }: { t: number; a: Anchors }) {
  const hover = prog(t, a.CLICK - 0.1, 6 * F, SNAP);
  const press = keys(t, [
    [a.CLICK, 1],
    [a.CLICK + 3 * F, 0.94],
    [a.CLICK + 12 * F, 1, POP],
  ]);
  const idle = 1 + 0.02 * Math.sin((t - a.S8EXIT) * Math.PI * 4) * (1 - hover);
  const ripple = prog(t, a.CLICK, 16 * F, SNAP);
  const charge = prog(t, a.CLICK + 2 * F, 8 * F, SNAP); // la retenue : le bouton se charge de lumière
  return (
    <div
      style={{
        position: "absolute",
        left: BTN.x,
        top: BTN.y,
        width: BTN.w,
        height: BTN.h,
        borderRadius: 999,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${PB.teal2}, ${PB.teal})`,
        transform: `translate(${3 * hover}px, ${2 * hover}px) scale(${(idle * press * (1 + 0.04 * hover)).toFixed(4)})`,
        boxShadow: `0 0 ${40 * hover + 50 * charge}px ${rgba(charge > 0.05 ? GOLD : MINT, 0.6 * Math.max(hover, charge))}, 0 14px 30px rgba(0,0,0,.35)`,
      }}
    >
      {ripple > 0 && ripple < 1 && (
        <div style={{ position: "absolute", left: TIP.x - (BTN_C.x - BTN.w / 2) - 340 * ripple, top: TIP.y - (BTN_C.y - BTN.h / 2) - 340 * ripple, width: 680 * ripple, height: 680 * ripple, borderRadius: "50%", background: `rgba(255,255,255,${0.45 * (1 - ripple)})` }} />
      )}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${GOLD_HI}, ${GOLD})`, opacity: 0.85 * charge }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: charge > 0.5 ? INK : "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 32, letterSpacing: "-0.01em" }}>Vente terminée</div>
    </div>
  );
}

/** Le panneau (verre sombre, en-tête, carte, bouton, soulignement) ; `k` = avancement de l'implosion. */
function Panel({ t, a }: { t: number; a: Anchors }) {
  if (t > a.IMP1 + 2 * F) return null;
  const k = prog(t, a.IMP0, a.IMP1 - a.IMP0, EXIT);
  // La retenue : le panneau inspire (1 → 1,03) en frémissant, puis tout est aspiré.
  const inhale = prog(t, a.CLICK + 2 * F, a.IMP0 - a.CLICK - 2 * F, SNAP);
  const shiver = inhale * (1 - k) * 1.6 * Math.sin(t * 120);
  const W = lerp(PANEL.w, BALL.d, k);
  const H = lerp(PANEL.h, BALL.d, k);
  const s = lerp(1, 0.06, k);
  const rot = 150 * k;
  const contentOp = 1 - clamp01((k - 0.35) / 0.45);
  const goldOp = clamp01(k * 1.5) * 0.25 + clamp01((k - 0.25) / 0.6) * 0.75;
  const sheen = ((t - a.S8W0) * 0.32 + 0.2) % 1;
  return (
    <div
      style={{
        position: "absolute",
        left: PANEL.cx - W / 2 + shiver,
        top: PANEL.cy - H / 2,
        width: W,
        height: H,
        transform: `rotate(${rot.toFixed(2)}deg) scale(${(1 + 0.03 * inhale * (1 - k)).toFixed(4)})`,
        transformOrigin: "50% 50%",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: lerp(32, BALL.d / 2, k),
          ...glassStyle("dark", 0.6),
          background: "linear-gradient(160deg, rgba(22,32,41,.94), rgba(11,15,20,.94))",
          border: `1.5px solid ${rgba(MINT, 0.35 * (1 - k))}`,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,.10), transparent 40%)" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(110deg, transparent ${sheen * 160 - 40}%, rgba(255,255,255,.07) ${sheen * 160 - 25}%, transparent ${sheen * 160 - 10}%)` }} />
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 40% 35%, ${GOLD_WHITE}, ${GOLD_HI} 38%, ${GOLD} 75%, ${GOLD_LO})`, opacity: goldOp }} />
      </div>
      {k > 0.02 && <div style={{ position: "absolute", inset: 0, borderRadius: lerp(32, BALL.d / 2, k), boxShadow: `0 0 ${60 * k}px ${rgba(GOLD, 0.7 * k)}` }} />}
      {contentOp > 0.01 && (
        <div style={{ position: "absolute", left: W / 2 - PANEL.w / 2, top: H / 2 - PANEL.h / 2, width: PANEL.w, height: PANEL.h, transform: `scale(${s.toFixed(4)})`, opacity: contentOp, filter: k > 0.05 ? `sepia(${k}) saturate(${1 + 2 * k}) hue-rotate(${-10 * k}deg) brightness(${1 + 0.6 * k})` : undefined }}>
          <div style={{ position: "absolute", left: 34, top: 22, display: "flex", alignItems: "center", gap: 10, ...label(18), color: rgba(MINT2, 0.9) }}>
            <span style={{ width: 10, height: 10, borderRadius: 10, background: MINT, boxShadow: `0 0 ${8 + 8 * Math.sin(t * 6)}px ${MINT}` }} />
            Conseil
          </div>
          <div style={{ position: "absolute", right: 34, top: 16, display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 14px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.82)", fontFamily: JAKARTA, fontWeight: 600, fontSize: 18 }}>
            <ScanBarcode size={18} color={MINT2} strokeWidth={2.4} />
            Doxycycline 100 mg
          </div>
          <ProductCard t={t} a={a} />
          <FinalButton t={t} a={a} />
          {/* Le soulignement (la traînée de l'avion de S8). */}
          <div style={{ position: "absolute", left: BTN.x, top: UNDER_Y - 3, width: BTN.w, height: 6, borderRadius: 3, background: MINT, boxShadow: `0 0 8px ${rgba(MINT, 0.8)}`, transformOrigin: "50% 50%", transform: `scaleX(${(1 - 0.5 * prog(t, a.CLICK, 6 * F, SNAP) + 0.5 * prog(t, a.CLICK + 4 * F, 10 * F, POP)).toFixed(3)})` }} />
        </div>
      )}
    </div>
  );
}

// ---- La boule d'or ------------------------------------------------------------------------------------------------
function Ball({ t, a }: { t: number; a: Anchors }) {
  if (t < a.IMP1 - F || t > a.BOOM + 5 * F) return null;
  const D = Math.max(0.1, a.BOOM - a.IMP1);
  const ut = Math.max(0, Math.min(t, a.BOOM) - a.IMP1);
  const u = clamp01(ut / D);
  // Fréquence de 6 à 20 Hz : la phase est l'intégrale de f.
  const phase = Math.PI * 2 * (6 * ut + (7 * ut * ut) / D);
  const amp = 3 * u;
  const jx = amp * Math.sin(phase);
  const jy = amp * Math.cos(phase * 1.31);
  const swell = 1 + 0.22 * u * u + 0.07 * u * Math.sin(phase * 0.5);
  const pop = prog(t, a.BOOM, 4 * F, SNAP);
  const sc = swell * (1 + 3 * pop);
  const op = 1 - pop;
  const d = BALL.d;
  const corona = 0.35 + 0.65 * u;
  return (
    <div style={{ position: "absolute", left: BALL.x + jx, top: BALL.y + jy, width: 0, height: 0, opacity: op }}>
      {/* Halo qui respire. */}
      <div style={{ position: "absolute", left: -170, top: -170, width: 340, height: 340, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(GOLD_HI, 0.45 + 0.35 * u)}, ${rgba(GOLD, 0.12)} 55%, transparent)`, transform: `scale(${(0.8 + 0.4 * u + 0.08 * Math.sin(phase)).toFixed(3)})` }} />
      {/* Couronne : 12 rayons fins qui tournent et s'allongent avec la tension. */}
      <svg width={400} height={400} viewBox="-200 -200 400 400" style={{ position: "absolute", left: -200, top: -200, overflow: "visible", opacity: corona, transform: `rotate(${((t - a.IMP1) * (120 + 520 * u)).toFixed(1)}deg)` }}>
        {Array.from({ length: 12 }, (_, i) => {
          const ang = (i / 12) * Math.PI * 2;
          const r0 = 44 + 6 * u;
          const r1 = r0 + 18 + 70 * u * (0.6 + 0.4 * hash("S9cor", i));
          return <line key={i} x1={Math.cos(ang) * r0} y1={Math.sin(ang) * r0} x2={Math.cos(ang) * r1} y2={Math.sin(ang) * r1} stroke={i % 3 === 0 ? "#FFFFFF" : GOLD_HI} strokeWidth={2.4} strokeLinecap="round" opacity={0.5 + 0.5 * Math.sin(phase * 0.5 + i)} />;
        })}
      </svg>
      {/* Le cœur. */}
      <div
        style={{
          position: "absolute",
          left: -d / 2,
          top: -d / 2,
          width: d,
          height: d,
          borderRadius: "50%",
          background: `radial-gradient(circle at 38% 32%, ${GOLD_WHITE}, ${GOLD_HI} 38%, ${GOLD} 78%, ${GOLD_LO})`,
          boxShadow: `0 0 60px ${rgba(GOLD, 0.7)}, 0 0 ${20 + 40 * u}px ${rgba(GOLD_HI, 0.8)}, inset 0 -6px 12px ${rgba(GOLD_LO, 0.6)}`,
          transform: `scale(${sc.toFixed(4)})`,
        }}
      >
        <div style={{ position: "absolute", left: 12, top: 9, width: 18, height: 11, borderRadius: "50%", background: "rgba(255,255,255,.85)", filter: "blur(2px)", transform: "rotate(-25deg)" }} />
      </div>
    </div>
  );
}

/** Les anneaux aspirés : ils se resserrent sur la boule, de plus en plus vite. */
function SuckRings({ t, a }: { t: number; a: Anchors }) {
  const D = a.BOOM - a.IMP1;
  if (D < 0.08 || t < a.IMP1 - 0.1 || t > a.BOOM) return null;
  const N = 7;
  return (
    <>
      {Array.from({ length: N }, (_, j) => {
        const born = a.IMP1 + D * (1 - Math.pow(1 - j / N, 1.5)) - 0.08;
        const life = 0.22 - 0.1 * (j / N);
        const p = clamp01((t - born) / life);
        if (p <= 0 || p >= 1) return null;
        const r = lerp(250, 34, EXIT(p));
        return <div key={j} style={{ position: "absolute", left: BALL.x - r, top: BALL.y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", border: `${lerp(1.5, 4, p)}px solid ${rgba(GOLD_HI, 0.85 * Math.sin(Math.PI * p))}`, boxShadow: `0 0 16px ${rgba(GOLD, 0.4 * Math.sin(Math.PI * p))}` }} />;
      })}
    </>
  );
}

/** Les éclats d'or de l'éclatement. */
function GoldDebris({ t, a }: { t: number; a: Anchors }) {
  const u = t - a.BOOM;
  if (u < 0 || u > 1.3) return null;
  return (
    <>
      {Array.from({ length: 26 }, (_, i) => {
        const ang = (i / 26) * Math.PI * 2 + hash("S9deb", i) * 0.5;
        const v = 900 + 900 * hash("S9deb", i + 40);
        const p = ballistic(u, { x0: BALL.x, y0: BALL.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 300, g: 1700, drag: 1.4 });
        const s = 8 + 12 * hash("S9deb", i + 80);
        const fade = 1 - clamp01((u - 0.7) / 0.5);
        const spin = (hash("S9deb", i + 120) - 0.5) * 1600 * u;
        return <div key={i} style={{ position: "absolute", left: p.x - s / 2, top: p.y - s / 2, width: s, height: s, borderRadius: 2, background: GOLD_METAL, boxShadow: `0 0 10px ${rgba(GOLD, 0.6)}`, opacity: fade, transform: `rotate(${45 + spin}deg) scaleY(${0.4 + 0.6 * Math.abs(Math.cos(u * 14 + i))})` }} />;
      })}
    </>
  );
}

// ---- Rayons dorés ---------------------------------------------------------------------------------------------------
function Rays({ t, a }: { t: number; a: Anchors }) {
  const on = (0.55 * prog(t, a.BOOM, 0.3, SNAP) + 0.45 * prog(t, a.FETE, 0.25, SNAP)) * (1 - prog(t, a.MAG0 - 0.04, 10 * F, EXIT));
  if (on <= 0.01) return null;
  const tt = tau(t, a);
  const rot = 30 * (tt - a.BOOM);
  const grow = lerp(0.6, 1, prog(t, a.BOOM, 0.4, SNAP));
  const S = 2600;
  const mask = "radial-gradient(circle at 50% 50%, black 6%, rgba(0,0,0,.7) 22%, transparent 48%)";
  return (
    <div style={{ position: "absolute", left: RAYS.x - S / 2, top: RAYS.y - S / 2, width: S, height: S, opacity: on, transform: `scale(${grow})`, maskImage: mask, WebkitMaskImage: mask }}>
      <div style={{ position: "absolute", inset: 0, background: `repeating-conic-gradient(from ${rot.toFixed(2)}deg at 50% 50%, ${rgba(GOLD, 0.16)} 0deg 9deg, transparent 11.25deg 22.5deg)` }} />
      <div style={{ position: "absolute", inset: 0, background: `repeating-conic-gradient(from ${(-rot * 0.6 + 7).toFixed(2)}deg at 50% 50%, ${rgba(GOLD_HI, 0.07)} 0deg 4deg, transparent 6deg 45deg)` }} />
    </div>
  );
}

// ---- BRAVO ! ---------------------------------------------------------------------------------------------------------
const BRAVO_LETTERS = ["B", "R", "A", "V", "O", " ", "!"];

function Bravo({ t, a }: { t: number; a: Anchors }) {
  if (t < a.FETE) return null;
  const out = prog(t, a.MAG0 - 0.04, 10 * F, EXIT);
  if (out >= 1) return null;
  const glow = 0.5 + 0.5 * pulse(t, a.FETE + 0.25, 3 * F, 0.05, 0.5);
  return (
    <div style={{ position: "absolute", left: 0, width: 1920, top: BRAVO.cy - BRAVO.size * 0.55, height: BRAVO.size * 1.1, display: "flex", justifyContent: "center", alignItems: "center", opacity: 1 - out, transform: `scale(${lerp(1, 0.8, out)})`, transformOrigin: `${BRAVO.cx}px 50%` }}>
      {/* Lueur dorée derrière le mot. */}
      <div style={{ position: "absolute", left: BRAVO.cx - 560, top: -60, width: 1120, height: BRAVO.size * 1.1 + 120, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(GOLD, 0.28 * glow * prog(t, a.FETE, 0.3))}, transparent)` }} />
      {BRAVO_LETTERS.map((ch, i) => {
        const at = a.FETE + i * 3 * F;
        const s = ressort(t, at);
        const y = 80 * (1 - ressort(t, at, { damping: 10 }));
        const settled = prog(t, at + 0.25, 0.3, SNAP);
        const wave = 7 * Math.sin(Math.PI * 2 * 1.7 * (t - a.FETE) - i * 0.7) * settled;
        const tilt = wobble(t, i * 3 + 1, 4, 3) * settled + (1 - s) * (i % 2 ? 12 : -12);
        const b = ((t - (a.FETE + 0.32) - i * 0.035) / 0.32) * 140 - 20; // reflet qui traverse
        return (
          <span
            key={i}
            style={{
              position: "relative",
              display: "inline-block",
              fontFamily: JAKARTA,
              fontWeight: 800,
              fontSize: BRAVO.size,
              lineHeight: 1,
              letterSpacing: "-0.045em",
              padding: "0 2px",
              color: "transparent",
              backgroundImage: `linear-gradient(105deg, transparent ${b - 14}%, rgba(255,255,255,.95) ${b}%, transparent ${b + 14}%), linear-gradient(180deg, ${GOLD_PALE} 8%, ${GOLD_HI} 40%, ${GOLD} 72%, #D98A06 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextStroke: `3px ${GOLD_LO}`,
              filter: `drop-shadow(0 9px 0 #6B3D00) drop-shadow(0 0 40px ${rgba(GOLD, 0.5 * glow)})`,
              transform: `translateY(${(y + wave).toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) scale(${Math.max(0, s).toFixed(4)})`,
              transformOrigin: "50% 80%",
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
}

/** Étoiles à quatre branches qui scintillent autour de BRAVO et du robot. */
function Twinkles({ t, a }: { t: number; a: Anchors }) {
  if (t < a.FETE) return null;
  const out = 1 - prog(t, a.MAG0, 10 * F, EXIT);
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const x = i < 9 ? BRAVO.cx + (hash("S9tw", i) - 0.5) * 1180 : STAGE.cx + (hash("S9tw", i) - 0.5) * 820;
        const y = i < 9 ? BRAVO.cy + (hash("S9tw", i + 30) - 0.5) * 280 : 420 + hash("S9tw", i + 30) * 240;
        const at = a.FETE + 0.12 + hash("S9tw", i + 60) * 0.55;
        const p = clamp01((t - at) / 0.34);
        if (p <= 0 || p >= 1) return null;
        const s = Math.sin(Math.PI * p) * (18 + 16 * hash("S9tw", i + 90));
        return (
          <svg key={i} width={2 * s} height={2 * s} viewBox="-10 -10 20 20" style={{ position: "absolute", left: x - s, top: y - s, overflow: "visible", opacity: out, transform: `rotate(${90 * p}deg)`, filter: `drop-shadow(0 0 6px ${rgba(GOLD_HI, 0.9)})` }}>
            <path d="M 0 -10 Q 1.2 -1.2 10 0 Q 1.2 1.2 0 10 Q -1.2 1.2 -10 0 Q -1.2 -1.2 0 -10 Z" fill={i % 3 === 0 ? "#FFFFFF" : GOLD_PALE} />
          </svg>
        );
      })}
    </>
  );
}

// ---- Les canons à confettis -------------------------------------------------------------------------------------------
function Popper({ t, a, side }: { t: number; a: Anchors; side: 0 | 1 }) {
  const P = POPPERS[side];
  const fire = side === 0 ? a.FIRE_L : a.FIRE_R;
  const appear = ressort(t, a.FIRE_L - 0.2 + side * 0.04);
  const leave = prog(t, a.MAG0 - 0.08, 0.22, EXIT);
  if (appear <= 0.001 || leave >= 1) return null;
  const recoil = pulse(t, fire, 2 * F, 0, 10 * F);
  const back = 260 * (1 - appear) + 26 * recoil + 300 * leave;
  const rad = (P.ang * Math.PI) / 180;
  const ox = -Math.cos(rad) * back;
  const oy = -Math.sin(rad) * back;
  const flash = pulse(t, fire, F, F, 7 * F);
  const gid = `S9pop${side}`;
  return (
    <div style={{ position: "absolute", left: P.x + ox, top: P.y + oy, width: 0, height: 0, transform: `rotate(${P.ang + 90}deg) scale(${(1 + 0.08 * recoil).toFixed(3)}, ${(1 - 0.1 * recoil).toFixed(3)})` }}>
      <svg width={200} height={260} viewBox="-100 -230 200 260" style={{ position: "absolute", left: -100, top: -230, overflow: "visible", filter: "drop-shadow(0 18px 24px rgba(0,0,0,.5))" }}>
        <defs>
          <linearGradient id={`${gid}g`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={GOLD_LO} />
            <stop offset="0.35" stopColor={GOLD_HI} />
            <stop offset="0.6" stopColor={GOLD} />
            <stop offset="1" stopColor={GOLD_LO} />
          </linearGradient>
          <clipPath id={`${gid}c`}>
            <path d="M -14 0 L -62 -200 Q 0 -214 62 -200 L 14 0 Q 0 6 -14 0 Z" />
          </clipPath>
        </defs>
        <path d="M -14 0 L -62 -200 Q 0 -214 62 -200 L 14 0 Q 0 6 -14 0 Z" fill={`url(#${gid}g)`} stroke={GOLD_LO} strokeWidth={2} />
        <g clipPath={`url(#${gid}c)`}>
          {[0, 1, 2, 3, 4].map((k) => (
            <path key={k} d={`M -80 ${-30 - k * 44} L 80 ${-62 - k * 44} L 80 ${-48 - k * 44} L -80 ${-16 - k * 44} Z`} fill={rgba(MINT, 0.85)} />
          ))}
        </g>
        <ellipse cx={0} cy={-202} rx={62} ry={13} fill="#3A2200" stroke={GOLD_HI} strokeWidth={3} />
        <radialGradient id={`${gid}f`}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
          <stop offset="0.35" stopColor={GOLD_HI} stopOpacity={0.7} />
          <stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </radialGradient>
        {flash > 0.01 && <ellipse cx={0} cy={-226} rx={50 + 80 * flash} ry={36 + 70 * flash} fill={`url(#${gid}f)`} opacity={flash} />}
      </svg>
    </div>
  );
}

/** Fumée blanche à la bouche du canon. */
function Puffs({ t, a, side }: { t: number; a: Anchors; side: 0 | 1 }) {
  const P = POPPERS[side];
  const fire = side === 0 ? a.FIRE_L : a.FIRE_R;
  const u = tau(t, a) - fire;
  if (u < 0 || u > 0.9) return null;
  const rad = (P.ang * Math.PI) / 180;
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => {
        const d = 30 + 220 * (1 - Math.exp(-4 * u)) * (0.5 + 0.5 * hash(`S9pf${side}`, i));
        const spread = (hash(`S9pf${side}`, i + 9) - 0.5) * 0.9;
        const x = P.mouth.x + Math.cos(rad + spread) * d;
        const y = P.mouth.y + Math.sin(rad + spread) * d - 40 * u;
        const r = 18 + 70 * u * (0.6 + 0.4 * hash(`S9pf${side}`, i + 20));
        return <div key={i} style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: `radial-gradient(closest-side, rgba(255,246,214,${(0.22 * (1 - u / 0.9) ** 1.5).toFixed(3)}), rgba(255,246,214,0) 100%)`, filter: "blur(6px)" }} />;
      })}
    </>
  );
}

// ---- Les serpentins ----------------------------------------------------------------------------------------------------
const STREAMERS_L = [
  { d: "M 160 927 C 260 760, 330 600, 300 500 C 275 420, 200 440, 215 505 C 232 575, 340 560, 420 440 C 480 350, 540 300, 640 320", color: GOLD },
  { d: "M 160 927 C 330 840, 500 760, 590 640 C 650 560, 610 500, 560 530 C 510 560, 545 630, 640 625 C 740 620, 820 540, 880 460", color: MINT },
  { d: "M 160 927 C 200 720, 220 470, 320 330 C 390 235, 470 250, 450 315 C 430 380, 350 360, 370 290 C 390 220, 470 170, 580 175", color: GOLD_HI },
];

function Streamers({ t, a }: { t: number; a: Anchors }) {
  if (t < a.FIRE_L) return null;
  const fade = 1 - prog(t, a.MAG0 - 0.05, 12 * F, EXIT);
  if (fade <= 0) return null;
  const tt = tau(t, a);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: fade }}>
      {[0, 1].flatMap((side) =>
        STREAMERS_L.map((s, j) => {
          const fire = (side === 0 ? a.FIRE_L : a.FIRE_R) + j * 0.03;
          const e = evolvePath(prog(t, fire, 0.5, SNAP), s.d);
          const sag = 140 * Math.max(0, tt - fire - 0.35) ** 2;
          const sway = 10 * Math.sin((tt - fire) * 5 + j * 2);
          return (
            <g key={`${side}-${j}`} transform={`${side === 1 ? "translate(1920 0) scale(-1 1) " : ""}translate(${sway.toFixed(2)} ${sag.toFixed(2)})`}>
              <path d={s.d} fill="none" stroke={s.color} strokeWidth={8} strokeLinecap="round" strokeDasharray={e.strokeDasharray} strokeDashoffset={e.strokeDashoffset} style={{ filter: `drop-shadow(0 4px 6px rgba(0,0,0,.35))` }} />
              <path d={s.d} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth={2} strokeLinecap="round" strokeDasharray={e.strokeDasharray} strokeDashoffset={e.strokeDashoffset} transform="translate(-1 -1.5)" />
            </g>
          );
        }),
      )}
    </svg>
  );
}

// ---- Les confettis : physique analytique, ralenti, aimantation sur les tuiles de S10 ---------------------------------
const CONF_COLORS = [PB.mint, PB.mint2, PB.gold, PB.goldHi, "#FFFFFF", PB.teal2];
const N_SIDE = 130;
const G = 1400;
const DRAG = 0.6;

type Target = { x: number; y: number; a: number; tile: number; j: number };
type Conf = {
  side: 0 | 1;
  fire: number;
  vx: number;
  vy: number;
  spin0: number;
  spin: number;
  flipF: number;
  flipPh: number;
  swayPh: number;
  round: boolean;
  color: string;
  L: number;
  W: number;
  front: boolean;
  target: Target;
  delay: number;
  swirl: number;
};

/** Les points du contour d'une tuile (rectangle arrondi), répartis régulièrement, avec la tangente. */
function perimeter(tile: (typeof TILES)[number], n: number, ti: number): Target[] {
  const { cx, cy, w, h, r } = tile;
  const l = cx - w / 2;
  const tp = cy - h / 2;
  const rt = cx + w / 2;
  const bt = cy + h / 2;
  const sh = w - 2 * r;
  const sv = h - 2 * r;
  const arc = (Math.PI * r) / 2;
  const segs: { len: number; at: (u: number) => { x: number; y: number; a: number } }[] = [
    { len: sh, at: (u) => ({ x: l + r + sh * u, y: tp, a: 0 }) },
    { len: arc, at: (u) => { const th = -Math.PI / 2 + (u * Math.PI) / 2; return { x: rt - r + r * Math.cos(th), y: tp + r + r * Math.sin(th), a: (th * 180) / Math.PI + 90 }; } },
    { len: sv, at: (u) => ({ x: rt, y: tp + r + sv * u, a: 90 }) },
    { len: arc, at: (u) => { const th = (u * Math.PI) / 2; return { x: rt - r + r * Math.cos(th), y: bt - r + r * Math.sin(th), a: (th * 180) / Math.PI + 90 }; } },
    { len: sh, at: (u) => ({ x: rt - r - sh * u, y: bt, a: 180 }) },
    { len: arc, at: (u) => { const th = Math.PI / 2 + (u * Math.PI) / 2; return { x: l + r + r * Math.cos(th), y: bt - r + r * Math.sin(th), a: (th * 180) / Math.PI + 90 }; } },
    { len: sv, at: (u) => ({ x: l, y: bt - r - sv * u, a: 270 }) },
    { len: arc, at: (u) => { const th = Math.PI + (u * Math.PI) / 2; return { x: l + r + r * Math.cos(th), y: tp + r + r * Math.sin(th), a: (th * 180) / Math.PI + 90 }; } },
  ];
  const P = segs.reduce((s, g) => s + g.len, 0);
  const out: Target[] = [];
  for (let j = 0; j < n; j++) {
    let s = ((j + 0.5) / n) * P;
    for (const g of segs) {
      if (s <= g.len) {
        const p = g.at(s / g.len);
        out.push({ ...p, tile: ti, j });
        break;
      }
      s -= g.len;
    }
  }
  return out;
}

function confPhys(c: Conf, u: number) {
  const m = POPPERS[c.side].mouth;
  const p = ballistic(u, { x0: m.x, y0: m.y, vx: c.vx, vy: c.vy, g: G, drag: DRAG });
  return { x: p.x + 20 * Math.sin(Math.PI * 2 * 3 * u + c.swayPh) * clamp01(u * 3), y: p.y, vx: p.vx, vy: p.vy };
}

const CONF_CACHE = new Map<string, Conf[]>();

function confetti(a: Anchors): Conf[] {
  const key = `${a.FIRE_L.toFixed(4)}|${a.MAG0.toFixed(4)}|${a.SLOW.toFixed(4)}`;
  const known = CONF_CACHE.get(key);
  if (known) return known;
  const S = "S9conf";
  const base: Omit<Conf, "target" | "delay">[] = [];
  for (let i = 0; i < 2 * N_SIDE; i++) {
    const side: 0 | 1 = i < N_SIDE ? 0 : 1;
    const axis = POPPERS[side].ang;
    // Vitesses un peu sous la direction (1 800–2 600) : avec la bouche du canon 150 px au-dessus du coin, les
    // confettis plafonnaient au bord haut ; ici ils culminent au milieu du cadre et y flottent pendant le ralenti.
    const ang = ((axis + (hash(S, i) * 2 - 1) * 22) * Math.PI) / 180;
    const v = 1400 + 1000 * hash(S, i + 1000);
    const round = hash(S, i + 2000) < 0.35;
    const front = i % 3 === 0;
    const k = front ? 1.35 : 1;
    base.push({
      side,
      fire: (side === 0 ? a.FIRE_L : a.FIRE_R) + hash(S, i + 2500) * 0.05,
      vx: Math.cos(ang) * v,
      vy: Math.sin(ang) * v,
      spin0: hash(S, i + 3000) * 360,
      spin: (2 + 6 * hash(S, i + 4000)) * (hash(S, i + 4500) < 0.5 ? -1 : 1),
      flipF: 1.5 + 3 * hash(S, i + 5000),
      flipPh: hash(S, i + 5500) * Math.PI * 2,
      swayPh: hash(S, i + 6000) * Math.PI * 2,
      round,
      color: CONF_COLORS[Math.floor(hash(S, i + 7000) * CONF_COLORS.length) % CONF_COLORS.length],
      L: (round ? 10 : 18) * k,
      W: 10 * k,
      front,
      swirl: (hash(S, i + 8000) - 0.5) * 140,
    });
  }
  // Les positions au début de l'aimantation, puis l'appariement (glouton puis échanges 2 à 2) avec les points des contours.
  const pos = base.map((c) => confPhys(c as Conf, tau(a.MAG0, a) - c.fire));
  const targets = TILES.flatMap((tile, ti) => perimeter(tile, PER_TILE, ti));
  const n = base.length;
  const dist = (i: number, j: number) => Math.hypot(pos[i].x - targets[j].x, pos[i].y - targets[j].y);
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pairs.push([dist(i, j), i, j]);
  pairs.sort((p, q) => p[0] - q[0]);
  const of = new Array<number>(n).fill(-1);
  const taken = new Array<boolean>(n).fill(false);
  for (const [, i, j] of pairs) {
    if (of[i] >= 0 || taken[j]) continue;
    of[i] = j;
    taken[j] = true;
  }
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      for (let k = i + 1; k < n; k++) {
        const now = dist(i, of[i]) + dist(k, of[k]);
        const swap = dist(i, of[k]) + dist(k, of[i]);
        if (swap + 0.5 < now) {
          const tmp = of[i];
          of[i] = of[k];
          of[k] = tmp;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  const out: Conf[] = base.map((c, i) => {
    const target = targets[of[i]];
    // Le contour se dessine : chaque tuile se trace dans l'ordre de son périmètre.
    return { ...c, target, delay: a.MAG_STAG * (target.j / PER_TILE) } as Conf;
  });
  CONF_CACHE.set(key, out);
  return out;
}

function ConfettiLayer({ t, a, front }: { t: number; a: Anchors; front: boolean }) {
  if (t < a.FIRE_L) return null;
  const list = confetti(a);
  const tt = tau(t, a);
  const r = rate(t, a);
  return (
    <>
      {list.map((c, i) => {
        if (c.front !== front || t < c.fire) return null;
        const u = tt - c.fire;
        const ph = confPhys(c, u);
        const k = SNAP(clamp01((t - a.MAG0 - c.delay) / a.MAG_DUR));
        const T = c.target;
        const dx = T.x - ph.x;
        const dy = T.y - ph.y;
        const len = Math.hypot(dx, dy) || 1;
        const sw = c.swirl * Math.sin(Math.PI * k);
        const x = lerp(ph.x, T.x, k) + (-dy / len) * sw;
        const y = lerp(ph.y, T.y, k) + (dx / len) * sw;
        const sv = Math.hypot(ph.vx, ph.vy) * r;
        const velA = (Math.atan2(ph.vy, ph.vx) * 180) / Math.PI;
        const stretch = lerp(1 + sv / 1500, 1, k);
        const outerA = lerpAngle(velA, T.a, k);
        const spinA = c.spin0 + 360 * c.spin * u;
        const innerA = lerpAngle(spinA % 360, 0, k);
        const flip = lerp(Math.cos(c.flipPh + Math.PI * 2 * c.flipF * u), 1, k);
        const landT = a.MAG0 + c.delay + a.MAG_DUR * 0.8;
        const land = pulse(t, landT, 2 * F, 0, 8 * F);
        const settled = clamp01((t - landT) / 0.1);
        const shimmer = settled * 0.22 * Math.sin(Math.PI * 2 * (T.j / PER_TILE) * 3 - t * 14);
        const Lf = lerp(c.L, 16, k) * (1 + 0.5 * land);
        const Wf = lerp(c.W, 5, k);
        const radius = c.round ? lerp(c.W / 2, 2.5, k) : lerp(1.5, 2.5, k);
        const col = mixHex(c.color, k > 0.98 && land > 0.3 ? "#FFFFFF" : MINT, k);
        const alpha = lerp(1, 0.62, k) + 0.35 * land + shimmer;
        // Hors cadre et loin de l'aimantation : on ne dessine pas.
        if (k <= 0 && (x < -60 || x > 1980 || y < -80 || y > 1160)) return null;
        const style: CSSProperties = {
          position: "absolute",
          left: x - Lf / 2,
          top: y - Wf / 2,
          width: Lf,
          height: Wf,
          borderRadius: radius,
          background: `rgba(${col},${clamp01(alpha).toFixed(3)})`,
          boxShadow: settled > 0 ? `0 0 ${6 + 8 * land}px ${rgba(MINT, 0.5 * settled)}` : undefined,
          transform: `rotate(${outerA.toFixed(2)}deg) scaleX(${stretch.toFixed(3)}) rotate(${innerA.toFixed(2)}deg) scaleY(${flip.toFixed(3)})`,
        };
        return <div key={i} style={style} />;
      })}
    </>
  );
}

/** Une fois les contours posés : une comète de lumière court autour de chaque tuile (la pulsation que S10 reprend). */
function ContourGlow({ t, a }: { t: number; a: Anchors }) {
  const on = prog(t, a.MAG0 + a.MAG_STAG + a.MAG_DUR * 0.55, 0.12, SNAP);
  if (on <= 0) return null;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {TILES.map((tile, i) => (
        <g key={i}>
          <rect x={tile.cx - tile.w / 2} y={tile.cy - tile.h / 2} width={tile.w} height={tile.h} rx={tile.r} fill="none" stroke={rgba(MINT, 0.22 * on)} strokeWidth={1.5} />
          <rect
            x={tile.cx - tile.w / 2}
            y={tile.cy - tile.h / 2}
            width={tile.w}
            height={tile.h}
            rx={tile.r}
            fill="none"
            stroke={MINT2}
            strokeWidth={3}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="10 90"
            strokeDashoffset={-((t - a.MAG0) * 170 + i * 25)}
            opacity={on}
            style={{ filter: `drop-shadow(0 0 8px ${MINT})` }}
          />
        </g>
      ))}
    </svg>
  );
}

// ---- Le flash et la pénombre ------------------------------------------------------------------------------------------
function Dim({ t, a }: { t: number; a: Anchors }) {
  const k = prog(t, a.IMP0, 0.22, SNAP) * (1 - prog(t, a.BOOM, 2 * F, SNAP));
  if (k <= 0.01) return null;
  return <AbsoluteFill style={{ background: `radial-gradient(circle at ${BALL.x}px ${BALL.y}px, transparent 70px, rgba(0,0,0,.6) 560px)`, opacity: k, pointerEvents: "none" }} />;
}

function Flash({ t, a }: { t: number; a: Anchors }) {
  const k = pulse(t, a.BOOM, F, F, F) * 0.35 + pulse(t, a.FIRE_L, F, 0, 4 * F) * 0.08;
  if (k <= 0.005) return null;
  return <AbsoluteFill style={{ background: GOLD_HI, opacity: k, pointerEvents: "none" }} />;
}

// ---- La caméra ----------------------------------------------------------------------------------------------------------
function camOf(t: number, a: Anchors) {
  const zoom = keys(t, [
    [a.W0, 1],
    [a.CLICK, 1],
    [a.IMP1, 1.02, IN_OUT],
    [a.BOOM - F, 1.075, IN_OUT],
    [a.BOOM + 0.14, 0.975, SNAP],
    [a.BOOM + 0.5, 1, IN_OUT],
    [a.FIRE_L, 1],
    [a.FIRE_L + 0.1, 1.035, SNAP],
    [a.MAG0, 1.025, IN_OUT],
    [a.W1 - 4 * F, 1, IN_OUT],
  ]);
  const x = keys(t, [
    [a.IMP0, 0],
    [a.BOOM - F, -80, IN_OUT],
    [a.BOOM + 0.3, 0, SNAP],
  ]);
  const y = keys(t, [
    [a.IMP0, 0],
    [a.BOOM - F, 6, IN_OUT],
    [a.BOOM + 0.3, 0, SNAP],
  ]);
  return {
    zoom,
    x,
    y,
    origin: [960, 540] as [number, number],
    shakes: [
      { at: a.CLICK, amp: 3, frames: 8 },
      { at: a.BOOM, amp: 10, frames: 12 },
      { at: a.LAND, amp: 7, frames: 8 },
      { at: a.FIRE_L, amp: 10, frames: 12 },
      { at: a.FIRE_R, amp: 5, frames: 8 },
    ],
  };
}

// ---- La scène -----------------------------------------------------------------------------------------------------------
export function Scene09({ t, time }: SceneProps) {
  const a = anchorsOf(time);
  const track = robotTrack(a);
  const cam = camOf(t, a);
  const rp = robotPose(t, a);
  const implode = t >= a.IMP0 - F && t < a.IMP1 + 2 * F;
  const goldIn = prog(t, a.BOOM, 0.3, SNAP) * (1 - 0.5 * prog(t, a.MAG0, 0.3, SNAP));
  // Relais à S10 : pendant le chevauchement (S9 au-dessus), le fond (identique dans les deux scènes) s'efface pour
  // laisser voir les tuiles de S10 se remplir sous les contours de confettis.
  const handoff = 1 - prog(t, a.W1 - time.win.S9.overlapOut, Math.max(F, time.win.S9.overlapOut), IN_OUT);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ opacity: handoff }}>
        <Backdrop t={t} kind="brand" halo={1 + 0.5 * pulse(t, a.BOOM, 3 * F, 0.15, 0.7)} />
        <DotGrid t={t} opacity={time.look(t).dots} wave={{ at: a.BOOM, x: 1180, y: 490, speed: 1900, color: "255,210,122" }} />
      </AbsoluteFill>
      <Dim t={t} a={a} />
      <Camera t={t} {...cam}>
        {/* Les lueurs du relais (S8), puis la lumière dorée de la fête. */}
        <Spot x={PANEL.cx} y={PANEL.cy} r={620} color={MINT} alpha={0.08 * (1 - prog(t, a.IMP0, 10 * F))} />
        <Spot x={rp.x} y={rp.feet - 120} r={330} color={PB.teal} alpha={0.35 * (1 - prog(t, a.BOOM, 0.3))} />
        <Spot x={RAYS.x} y={RAYS.y} r={760} color={GOLD} alpha={0.16 * goldIn} />
        <Rays t={t} a={a} />
        <StageFloor t={t} a={a} />
        <Streamers t={t} a={a} />
        <ConfettiLayer t={t} a={a} front={false} />
        <MotionBlur on={implode} samples={8} shutter={180}>
          {(tt) => <Panel t={tt} a={a} />}
        </MotionBlur>
        <Converge t={t} at={a.IMP0} dur={0.5} x={BALL.x} y={BALL.y} count={34} seed="S9cv1" radius={560} color={GOLD_HI} size={4} />
        <Converge t={t} at={a.IMP1 + 0.06} dur={Math.max(0.15, a.BOOM - a.IMP1 - 0.06)} x={BALL.x} y={BALL.y} count={22} seed="S9cv2" radius={360} color="#FFFFFF" size={3} />
        <SuckRings t={t} a={a} />
        <Ball t={t} a={a} />
        <Ring t={t} at={a.BOOM} x={BALL.x} y={BALL.y} max={1800} color={GOLD_HI} width={6} life={16 * F} echo />
        <Sparks t={t} at={a.BOOM} x={BALL.x} y={BALL.y} count={36} seed="S9sp" speed={1700} spread={180} color={GOLD_HI} len={40} life={0.55} />
        <GoldDebris t={t} a={a} />
        <Robot t={t} a={a} track={track} />
        <Twinkles t={t} a={a} />
        <Bravo t={t} a={a} />
        <ConfettiLayer t={t} a={a} front />
        <ContourGlow t={t} a={a} />
        <Puffs t={t} a={a} side={0} />
        <Puffs t={t} a={a} side={1} />
        <Sparks t={t} at={a.FIRE_L} x={POPPERS[0].mouth.x} y={POPPERS[0].mouth.y} count={18} seed="S9spL" speed={1300} spread={22} angle={POPPERS[0].ang} color={GOLD_PALE} len={30} />
        <Sparks t={t} at={a.FIRE_R} x={POPPERS[1].mouth.x} y={POPPERS[1].mouth.y} count={18} seed="S9spR" speed={1300} spread={22} angle={POPPERS[1].ang} color={GOLD_PALE} len={30} />
        <Popper t={t} a={a} side={0} />
        <Popper t={t} a={a} side={1} />
        <CursorLayer t={t} a={a} />
      </Camera>
      {/* Avant-plan (parallaxe 1,6) : le bokeh menthe de S8 (même graine : continuité), puis une poussière d'or. */}
      <Camera t={t} {...cam} depth={1.6} style={{ opacity: handoff }}>
        <Dust t={t} count={22} seed="S8bokeh" color={MINT2} size={[3, 7]} alpha={0.16} speed={0.05} />
        {goldIn > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: goldIn }}>
            <Dust t={t} count={16} seed="S9gold" color={GOLD_HI} size={[3, 8]} alpha={0.22} speed={0.07} />
          </div>
        )}
      </Camera>
      <Flash t={t} a={a} />
    </AbsoluteFill>
  );
}

/** Les effets sonores de la scène (secondes du film). */
export const cues: SceneCues = (time) => {
  const a = anchorsOf(time);
  const popAt = a.MAG0 + a.MAG_STAG * 0.5 + a.MAG_DUR * 0.8;
  const out: Fx[] = [
    cue("whoosh_fast", a.CUR0, 0.25, 1.3),
    cue("ui_click", a.CLICK, 0.6),
    // reverse_riser : ses 0,9 dernières secondes, qui se terminent à « et le robot » (à rogner au mixage).
    cue("reverse_riser", a.BOOM - 0.9, 0.6),
    cue("impact_clean", a.BOOM, 0.5),
    cue("stamp_slam", a.BOOM, 0.4, 0.7),
    cue("whoosh_fast", a.BOOM + 0.03, 0.35, 0.9),
    cue("robot_boing", a.LAND, 0.3, 0.85),
    // Les canons : la détonation 0,15 s avant « fait », à 0,5 (à 0,8 ils couvraient « fait la fête »). Chaque fichier est
    // une pluie de 2 s de souffle large bande (−12 dB RMS pendant 0,5 s) : dès « fait », elle plonge sous la voix (× 0,14
    // au lieu de × 0,4) et remonte pleine dans le silence de 0,7 s après P12 — c'est là que la fête sonne en grand.
    { ...cue("confetti_cannon_L", a.FIRE_L - 0.02, 0.5), duck: 0.14, duckFrom: a.FETE + 0.04 },
    { ...cue("confetti_cannon_R", a.FIRE_R, 0.5), duck: 0.14, duckFrom: a.FETE + 0.04 },
    // La danse : un petit rebond au deuxième temps (le geste « party ») ; le premier temps tombe sur les canons.
    cue("robot_boing", a.PARTY, 0.25, 1.15),
    // Le plein de la fête se joue dans le silence après P12 (la musique y remonte) : scintillement à la fin de la voix.
    cue("sparkle_shimmer", a.P12Z - 0.04, 0.5),
    cue("whoosh_fast", a.MAG0, 0.4, 0.6),
    ...[0, 1, 2, 3, 4, 5].map((k) => cue("ui_pop", popAt + k * 3 * F, 0.2, 1 + 0.06 * k)),
  ];
  return out;
};
