import { useId, type CSSProperties } from "react";
import { AbsoluteFill, Easing } from "remotion";
import { noise2D } from "@remotion/noise";
import { ACT1, Camera, DotGrid, EXIT, F, IN_OUT, JAKARTA, POP, SNAP, Vignette, clamp01, cue, digits, hash, keys, lerp, prog, ressort, rgba, rnd, squash } from "./kit";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S3 · Ce qui se perd — voix P4 (« Le patient repart sans ce qui l'aurait aidé. Et la pharmacie passe à côté. »).
 * Fenêtre : time.win.S3 (P4.start → P5.start). Direction : DIRECTION-PRESENTATION.json → buildNotes « S3 ».
 *
 * RELAIS D'ENTRÉE (S2) : point gris #8A94A3 de 28 px en (960, 540).
 * seg(4,1) « Le patient repart »   le point devient la tête (RESSORT), le corps se déplie, le décor se bâtit (étagères
 *                                  sur 3 plans en parallaxe, sol en perspective), la marche démarre ; la boîte fantôme
 *                                  menthe « ? » se dessine et le suit.
 * seg(4,2) « sans ce qui »         la boîte s'élance vers le sac (+68 px en 8 images), s'arrête à 20 px, revient en élastique.
 * seg(4,3) « l'aurait aidé. »      ballon : la boîte s'envole en se balançant, ses tirets tombent un à un ; les portes
 *                                  vitrées se referment (14 images, rebond de 6 px) ; derrière la vitre, le patient s'en va.
 * seg(4,4) « Et la pharmacie »     croix néon grise qui s'allume mal (3 sautes), poussière en suspension ; la caisse
 *                                  surgit, son tiroir s'ouvre : vide (une mite s'en échappe).
 * seg(4,5) « passe à côté. »       PASSE À CÔTÉ file vers sa case, la rate, chancelle au bout de la tablette et bascule ;
 *                                  une pièce grise part en cloche et frôle la croix.
 * ARRÊT SUR IMAGE à FZ = min(seg5 + 0,55 ; P4.end − 0,05) : le temps de la scène se bloque ; monochrome encre-sarcelle,
 *                                  vignette resserrée, trames ; seule la poussière tremble d'un pixel.
 * EXTINCTION DE TÉLÉVISEUR à C = P4.end + 0,15 : ligne (8 images), puis point (6 images) qui vire au menthe.
 * NOIR jusqu'à P5 : le pixel clignote deux fois en dérivant d'un pixel.
 * RELAIS DE SORTIE (S4) : pixel menthe 8 × 8 en (960, 520).
 * ======================================================================== */

const HY = 540; // centre de la tête (= le point de S2)
const FLOOR = 815; // ligne du sol (pieds)
const MID = "#222A33";
const BODY2 = "#5D6773";
const MINT = ACT1.mint;

type Anchors = ReturnType<typeof anchorsOf>;

/** Le téléviseur s'éteint en 14 images (ligne 8, point 6). */
const TV = 14 * F;
/** Deux clignotements de 0,1 s espacés de 0,15 s (direction) : 0,35 s. */
const BLINKS = 0.35;

function anchorsOf(time: Time) {
  const s1 = time.seg(4, 1);
  const s2 = time.seg(4, 2);
  const s3 = time.seg(4, 3);
  const s4 = time.seg(4, 4);
  const s5 = time.seg(4, 5);
  const end = time.Z("P4");
  // ARRÊT SUR IMAGE : MÊME formule que motion/sound.tsx (anchors) — la musique et la montée s'y coupent.
  const FZ = Math.min(s5 + 0.55, end - 0.05);
  const next = time.A("P5");
  // EXTINCTION à P4.end + 0,35 (arrêt ≈ 0,5 s) quand le silence après P4 le permet (gapAfter ≥ 0,9) ; sinon le plus tard
  // possible en gardant l'extinction et les deux clignotements avant P5, jamais moins de 0,25 s d'arrêt.
  const C = Math.min(end + 0.35, Math.max(FZ + 0.25, next - (TV + 0.04 + BLINKS + 0.03)));
  // Les deux clignotements (0,1 s, espacés de 0,15 s), comprimés si la place manque ; le second finit 0,03 s avant P5.
  const room = next - 0.03 - (C + TV + 0.04);
  const bk = Math.max(0.45, Math.min(1, room / BLINKS));
  const blinkDur = 0.1 * bk;
  const b2 = next - 0.03 - blinkDur;
  const b1 = b2 - blinkDur - 0.15 * bk;
  const walk0 = s1 + 0.3;
  // L'élastique : élan sur « sans » (8 images), tenue à 20 px de la main (4 images), puis claquement.
  const lunge = s2;
  const snap = s2 + 12 * F;
  const doors = s3 + 0.2;
  const shut = doors + 10 * F;
  return { s1, s2, s3, s4, s5, end, FZ, C, next, b1, b2, blinkDur, walk0, lunge, snap, doors, shut };
}

/* ---------- Le mouvement : vitesses linéaires par morceaux, intégrées analytiquement (aucun état). ---------- */

type PL = [number, number][];
function integ(pts: PL, t: number) {
  if (t <= pts[0][0]) return 0;
  let area = 0;
  for (let i = 1; i < pts.length; i++) {
    const [t0, v0] = pts[i - 1];
    const [t1, v1] = pts[i];
    if (t <= t0) break;
    const te = Math.min(t, t1);
    const ve = v0 + ((v1 - v0) * (te - t0)) / Math.max(1e-6, t1 - t0);
    area += ((v0 + ve) / 2) * (te - t0);
  }
  const [tl, vl] = pts[pts.length - 1];
  if (t > tl) area += vl * (t - tl);
  return area;
}

/** Distance marchée par le patient (monde) et défilement de la caméra (px). */
function motion(a: Anchors, tt: number) {
  // Une fois les portes fermées, il presse le pas et sort du cadre avant le gag.
  const walk: PL = [
    [a.walk0, 0],
    [a.walk0 + 0.3, 360],
    [a.s4 - 0.2, 360],
    [a.s4 + 0.4, 760],
  ];
  const cam: PL = [
    [a.walk0, 0],
    [a.walk0 + 0.3, 260],
    [a.doors + 0.05, 260],
    [a.s4 - 0.1, 0],
  ];
  const D = integ(walk, tt);
  const S = integ(cam, tt);
  return { D, S, X: 960 + D - S };
}

/* ---------- Le décor : étagères (3 plans), plafond, sol. ---------- */

function Shelves({ tt, a, scroll, depth, top, height, unitW, gap, color, prod, blur, seed, boards, delay }: { tt: number; a: Anchors; scroll: number; depth: number; top: number; height: number; unitW: number; gap: number; color: string; prod: string; blur: number; seed: string; boards: number; delay: number }) {
  const P = unitW + gap;
  const off = scroll * depth;
  const i0 = Math.floor((off - 260) / P);
  const i1 = Math.ceil((off + 2180) / P);
  const units = [];
  for (let i = i0; i <= i1; i++) {
    const x = i * P - off - 130;
    const cx = x + unitW / 2;
    // Le décor se bâtit depuis le centre au début de la scène.
    const rise = prog(tt, a.s1 + delay + (Math.abs(cx - 960) / 1920) * 0.38, 0.5, SNAP);
    if (rise <= 0.001) continue;
    const dy = (1 - rise) * 90;
    const spacing = (height - 30) / boards;
    const items = [];
    for (let b = 0; b < boards; b++) {
      const by = top + 22 + (b + 1) * spacing;
      items.push(<rect key={`b${b}`} x={x + 8} y={by} width={unitW - 16} height={5} rx={2} fill={prod} opacity={0.9} />);
      let px = x + 16;
      let j = 0;
      while (px < x + unitW - 30 && j < 14) {
        const h = hash(`${seed}w`, i * 131 + b * 17 + j);
        const w = 16 + 26 * h;
        const hh = spacing * (0.32 + 0.48 * hash(`${seed}h`, i * 131 + b * 17 + j));
        if (px + w > x + unitW - 14) break;
        const bottle = hash(`${seed}k`, i * 131 + b * 17 + j) < 0.28;
        items.push(<rect key={`p${b}-${j}`} x={px} y={by - hh} width={w} height={hh} rx={bottle ? w / 2.6 : 3} fill={prod} />);
        if (bottle) items.push(<rect key={`c${b}-${j}`} x={px + w * 0.3} y={by - hh - 7} width={w * 0.4} height={8} rx={2} fill={prod} />);
        px += w + 5 + 7 * hash(`${seed}g`, i * 131 + b * 17 + j);
        j++;
      }
    }
    units.push(
      <g key={i} transform={`translate(0 ${dy.toFixed(1)})`} opacity={rise}>
        <rect x={x} y={top} width={unitW} height={height} rx={8} fill={color} />
        <rect x={x} y={top} width={unitW} height={14} rx={6} fill={prod} opacity={0.7} />
        {items}
      </g>,
    );
  }
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", filter: blur > 0 ? `blur(${blur}px)` : undefined }}>
      {units}
    </svg>
  );
}

function Ceiling({ tt, a, scroll }: { tt: number; a: Anchors; scroll: number }) {
  const k = prog(tt, a.s1 + 0.05, 0.5, SNAP);
  const P = 460;
  const off = scroll * 0.6;
  const lights = [];
  for (let i = Math.floor((off - 300) / P); i <= Math.ceil((off + 2200) / P); i++) {
    const x = i * P - off;
    const flick = 0.75 + 0.25 * noise2D("s3-ceil", i * 0.7, tt * 2);
    lights.push(
      <div key={i} style={{ position: "absolute", left: x, top: 64, width: 200, height: 8, borderRadius: 4, background: ACT1.g4, opacity: 0.55 * flick, boxShadow: `0 0 26px ${rgba(ACT1.g4, 0.35)}, 0 18px 60px ${rgba(ACT1.g4, 0.12)}` }} />,
    );
  }
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 110, opacity: k, transform: `translateY(${(1 - k) * -40}px)` }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #080B0F 0%, #0E1318 100%)", borderBottom: `2px solid ${ACT1.g1}` }} />
      {lights}
    </div>
  );
}

function Floor({ tt, a, scroll }: { tt: number; a: Anchors; scroll: number }) {
  const k = prog(tt, a.s1 + 0.04, 0.55, SNAP);
  const P = 140;
  const off = scroll % P;
  const lines = [];
  for (let i = -8; i <= 24; i++) {
    const x0 = i * P - off;
    const x1 = 960 + (x0 - 960) * 2.4;
    lines.push(<line key={i} x1={x0} y1={FLOOR} x2={x1} y2={1080} stroke="#FFFFFF" strokeOpacity={0.05} strokeWidth={2} />);
  }
  return (
    <div style={{ position: "absolute", left: 0, top: FLOOR, width: 1920, height: 1080 - FLOOR, opacity: k }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #151B22 0%, #0B0F14 85%)" }} />
      <svg width={1920} height={1080 - FLOOR} viewBox={`0 ${FLOOR} 1920 ${1080 - FLOOR}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {lines}
        {[0.18, 0.42, 0.75].map((r, i) => (
          <line key={`h${i}`} x1={0} y1={FLOOR + (1080 - FLOOR) * r * r} x2={1920} y2={FLOOR + (1080 - FLOOR) * r * r} stroke="#FFFFFF" strokeOpacity={0.035} strokeWidth={2} />
        ))}
      </svg>
      {/* La ligne du sol se trace depuis les pieds. */}
      <div style={{ position: "absolute", left: 0, top: -1, width: 1920, height: 3, background: ACT1.g2, transformOrigin: "960px 0", transform: `scaleX(${k})` }} />
    </div>
  );
}

/* ---------- Le patient : silhouette géométrique de profil, vers la droite. ---------- */

function PatientSvg({ tt, a, D }: { tt: number; a: Anchors; D: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const form = ressort(tt, a.s1);
  const headR = lerp(14, 30, form);
  const bodyK = prog(tt, a.s1 + 0.07, 8 * F, SNAP);
  const limbK = prog(tt, a.s1 + 0.15, 12 * F, POP);
  const bagK = prog(tt, a.s1 + 0.24, 12 * F, POP);
  const w = clamp01((tt - a.walk0) / 0.3);
  const ph = (2 * Math.PI * D) / 108;
  const bob = 4 * Math.cos(2 * ph) * w;
  const tilt = (2 + 3 * Math.sin(ph)) * w;
  const legA = 26 * Math.sin(ph) * w;
  const armA = -20 * Math.sin(ph) * w;
  const bagA = -armA * 0.55 + 7 * Math.sin(ph - 1.1) * w;
  const idle = tt < a.walk0 ? 1.5 * Math.sin((tt - a.s1) * 9) * clamp01((tt - a.s1) / 0.2) : 0;
  return (
    <svg width={440} height={440} viewBox="-220 -120 440 440" style={{ position: "absolute", left: -220, top: -120, overflow: "visible" }}>
      <defs>
        <linearGradient id={`b${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ACT1.g3} />
          <stop offset="1" stopColor={BODY2} />
        </linearGradient>
        <radialGradient id={`h${uid}`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#B4BDC8" />
          <stop offset="1" stopColor={ACT1.g3} />
        </radialGradient>
      </defs>
      <g transform={`translate(0 ${bob.toFixed(2)}) rotate(${(tilt + idle).toFixed(2)} 0 272)`}>
        {/* Jambe arrière */}
        <g transform={`translate(6 196) rotate(${(-legA).toFixed(2)}) scale(1 ${limbK.toFixed(3)})`}>
          <rect x={-11} y={-4} width={22} height={74} rx={11} fill="#454E5A" />
          <rect x={-10} y={60} width={34} height={14} rx={7} fill="#454E5A" />
        </g>
        {/* Corps (capsule 90 × 190) qui se déplie vers le bas */}
        <g transform={`translate(0 38) scale(1 ${bodyK.toFixed(3)}) translate(0 -38)`}>
          <rect x={-45} y={38} width={90} height={190} rx={45} fill={`url(#b${uid})`} />
          <rect x={-30} y={52} width={10} height={120} rx={5} fill="#FFFFFF" opacity={0.08} />
        </g>
        {/* Jambe avant */}
        <g transform={`translate(-4 196) rotate(${legA.toFixed(2)}) scale(1 ${limbK.toFixed(3)})`}>
          <rect x={-11} y={-4} width={22} height={74} rx={11} fill="#6B7582" />
          <rect x={-10} y={60} width={34} height={14} rx={7} fill="#6B7582" />
        </g>
        {/* Tête : le point de S2 qui grossit */}
        <circle cx={0} cy={0} r={headR} fill={ACT1.g3} />
        <circle cx={0} cy={0} r={headR} fill={`url(#h${uid})`} opacity={clamp01(form)} />
        <circle cx={14} cy={-3} r={3.6} fill={ACT1.g1} opacity={limbK} />
        {/* Bras avant + sac de la pharmacie */}
        <g transform={`translate(4 72) rotate(${armA.toFixed(2)})`} opacity={limbK}>
          <g transform={`scale(1 ${limbK.toFixed(3)})`}>
            <rect x={-10} y={0} width={20} height={98} rx={10} fill="#9AA3AF" />
          </g>
          <g transform={`translate(0 100) rotate(${bagA.toFixed(2)}) scale(${bagK.toFixed(3)})`}>
            <path d="M -14 4 Q 0 -16 14 4" fill="none" stroke="#6B7582" strokeWidth={4} strokeLinecap="round" />
            <rect x={-24} y={6} width={48} height={56} rx={6} fill="#4A535F" />
            <rect x={-24} y={6} width={48} height={12} rx={4} fill="#5D6773" />
          </g>
          <circle cx={0} cy={100} r={12} fill="#B4BDC8" />
        </g>
      </g>
    </svg>
  );
}

function Patient({ tt, a, X, D }: { tt: number; a: Anchors; X: number; D: number }) {
  const w = clamp01((tt - a.walk0) / 0.3);
  const ph = (2 * Math.PI * D) / 108;
  const shadowK = prog(tt, a.s1 + 0.1, 0.3, SNAP);
  return (
    <>
      {/* Reflet sur le sol brillant */}
      <div style={{ position: "absolute", left: X, top: HY, transformOrigin: `0 ${FLOOR - HY}px`, transform: "scaleY(-1)", opacity: 0.1 * shadowK, maskImage: "linear-gradient(0deg, transparent 20%, black 70%)", WebkitMaskImage: "linear-gradient(0deg, transparent 20%, black 70%)" }}>
        <PatientSvg tt={tt} a={a} D={D} />
      </div>
      {/* Ombre portée */}
      <div style={{ position: "absolute", left: X - 70, top: FLOOR - 9, width: 140, height: 18, borderRadius: "50%", background: "rgba(0,0,0,.55)", filter: "blur(6px)", opacity: shadowK, transform: `scaleX(${1 - 0.12 * Math.abs(Math.cos(2 * ph)) * w})` }} />
      <div style={{ position: "absolute", left: X, top: HY, filter: `drop-shadow(0 0 22px ${rgba(ACT1.g4, 0.18)})` }}>
        <PatientSvg tt={tt} a={a} D={D} />
      </div>
    </>
  );
}

/* ---------- La caméra : deux couches (le monde derrière les portes, l'avant) qui partagent dérive et secousses. ---------- */

const O_WORLD: [number, number] = [1080, 700];
const O_FRONT: [number, number] = [960, 470];

type Cam = ReturnType<typeof camOf>;

function camOf(a: Anchors, tt: number) {
  // Poussée lente, recul au claquement des portes, POUSSÉE 1 → 1,08 pendant que le patient s'éloigne derrière la vitre,
  // recul sec quand la caisse surgit, puis poussée vers la croix.
  const zoom = keys(tt, [
    [a.s1, 1],
    [a.s3, 1.035, IN_OUT],
    [a.doors, 1.04, IN_OUT],
    [a.shut + 0.08, 1.0, SNAP],
    [a.s4 - 0.02, 1.08, IN_OUT],
    [a.s4 + 0.24, 1.02, SNAP],
    [a.s5 + 0.2, 1.045, IN_OUT],
    [a.FZ, 1.055, IN_OUT],
  ]);
  // Le monde se rapproche du patient pendant « Le patient repart sans ce qui » (relais à 1 au premier instant).
  const worldZoom = keys(tt, [
    [a.s1, 1],
    [a.s3, 1.1, IN_OUT],
    [a.doors, 1.11, IN_OUT],
    [a.shut + 0.15, 1.0, SNAP],
  ]);
  const follow = keys(tt, [
    [a.walk0, 0],
    [a.doors, -0.22 * (motion(a, a.doors).X - 960), IN_OUT],
  ]);
  const worldX = tt < a.doors ? -0.22 * (motion(a, tt).X - 960) * clamp01((tt - a.walk0) / 0.6) : follow;
  return { zoom, worldZoom, worldX };
}

/** Un point du MONDE exprimé dans la couche de l'AVANT, à la même place à l'écran (à la dérive ±0,4° près : < 2 px).
 *  Monde : zoom·worldZoom autour de O_WORLD, décalé de worldX ; avant : zoom autour de O_FRONT. */
function toFront(c: Cam, x: number, y: number) {
  return {
    x: O_FRONT[0] + (c.worldX + O_WORLD[0] - O_FRONT[0]) / c.zoom + c.worldZoom * (x - O_WORLD[0]),
    y: O_FRONT[1] + (O_WORLD[1] - O_FRONT[1]) / c.zoom + c.worldZoom * (y - O_WORLD[1]),
  };
}

/* ---------- La boîte fantôme : le fil de fer menthe de la boîte Ultra-Levure (celle que S6 conseillera), badge « ? ». ---------- */

const FW = 136; // face avant
const FH = 210;
const SD = 22; // profondeur de la face de côté
const BOX_RIGHT = FW / 2 + 34 + 12; // le badge « ? » dépasse du coin ; + l'inclinaison à la tenue
const BACK = 390; // au repos, à 390 px derrière le patient (l'élan fait ≈ 220 px)
const GLOW = `drop-shadow(0 0 28px ${rgba(MINT, 0.6)}) drop-shadow(0 0 6px ${rgba(MINT, 0.45)})`;
const PEG = { x: 300, y: 560 }; // le piton de l'étagère (monde), d'où part l'élastique
const L0 = 470; // longueur de l'élastique au repos
const HANG: [number, number] = [640, 236]; // où le ballon s'arrête, au-dessus des portes (couche de l'avant)
const RISE = Easing.bezier(0.42, 0, 0.18, 1);

/** Ce que la boîte cherche à toucher : le sac au bout du bras qui balance (voir PatientSvg), ou le dos s'il est plus en arrière. */
function bagBack(a: Anchors, u: number) {
  const { D, X } = motion(a, u);
  const w = clamp01((u - a.walk0) / 0.3);
  const armA = -20 * Math.sin((2 * Math.PI * D) / 108) * w;
  return Math.min(X + 4 - 100 * Math.sin((armA * Math.PI) / 180) - 24, X - 45);
}

/** Le claquement de l'élastique : 1 au départ, deux dépassements (−0,39 puis +0,15), éteint vers 0,6 s. */
function twang(v: number) {
  if (v <= 0) return 1;
  return Math.exp(-6 * v) * Math.cos(2 * Math.PI * 3.2 * v);
}

type BoxSt = { x: number; y: number; rot: number; sx: number; sy: number; q: number; s: number };

/** La boîte dans le MONDE avant le ballon : suit le patient, s'élance (+220 px) vers le sac, s'arrête à 20 px, claque au retour. */
function boxWorld(a: Anchors, u: number) {
  const rest = motion(a, u - 0.09).X - BACK;
  const reach = (v: number) => bagBack(a, v) - 20 - BOX_RIGHT;
  let x = rest;
  const y = HY + 128 + 6 * Math.sin(2 * Math.PI * 0.9 * (u - a.s1));
  let rot = 3 * Math.sin(2 * Math.PI * 0.6 * (u - a.s1) + 1);
  let sx = 1;
  let sy = 1;
  let q = 0;
  if (u >= a.lunge && u < a.snap) {
    x = lerp(rest, reach(u), prog(u, a.lunge, 8 * F, SNAP));
    if (u < a.lunge + 8 * F) {
      sx = 1.16;
      sy = 0.88;
      q = 16;
      rot = 5;
    } else {
      // Tenue à 20 px du sac : écrasée par le freinage, elle tremble au bout de l'élastique tendu.
      const s = squash(u, a.lunge + 8 * F, 4 * F);
      sx = s.sy;
      sy = s.sx;
      q = 24;
      rot = 7 + 1.5 * Math.sin(u * 2 * Math.PI * 22);
    }
  } else if (u >= a.snap) {
    const v = u - a.snap;
    const amp = reach(a.snap) - (motion(a, a.snap - 0.09).X - BACK);
    const tw = twang(v);
    const vel = (amp * (tw - twang(v - F))) / F; // px/s
    x = rest + amp * tw;
    const st = clamp01(Math.abs(vel) / 4200);
    sx = 1 + 0.2 * st;
    sy = 1 - 0.14 * st;
    q = 24 * tw;
    rot = 12 * Math.exp(-5 * v) * Math.sin(2 * Math.PI * 3.2 * v + 0.4) + 3 * Math.sin(2 * Math.PI * 0.6 * (u - a.s1) + 1) * clamp01(v / 0.6);
  }
  return { x, y, rot, sx, sy, q };
}

/** La boîte dans la couche de l'AVANT (au-dessus des portes) : le monde converti, puis le BALLON. */
function boxFront(a: Anchors, u: number): BoxSt & { balloon: number } {
  if (u < a.s3) {
    const w = boxWorld(a, u);
    const c = camOf(a, u);
    const p = toFront(c, w.x, w.y);
    return { ...w, x: p.x, y: p.y, s: c.worldZoom, balloon: 0 };
  }
  // BALLON sur « l'aurait aidé » : petite anticipation vers le bas, montée en balancier en 0,6 s, puis il flotte, hors d'atteinte.
  const w0 = boxWorld(a, a.s3);
  const c0 = camOf(a, a.s3);
  const p0 = toFront(c0, w0.x, w0.y);
  const v = u - a.s3;
  const dip = v < 5 * F ? 12 * Math.sin((Math.PI * v) / (5 * F)) : 0;
  const k = prog(u, a.s3 + 3 * F, 0.6, RISE);
  const swing = Math.exp(-2.2 * v) * Math.sin(2 * Math.PI * 1.5 * v);
  const hov = clamp01((v - 0.6) / 0.4);
  const h = Math.max(0, v - 0.6);
  const x = lerp(p0.x, HANG[0], k) + 38 * swing + 7 * hov * Math.sin(2 * Math.PI * 0.45 * h);
  const y = lerp(p0.y, HANG[1], k) + dip + hov * (7 * Math.sin(2 * Math.PI * 0.8 * h) - 9 * h);
  // Une fois là-haut, elle se penche vers la porte par où le patient est parti, puis se redresse quand la croix s'allume.
  const lean = 7 * hov * (1 - prog(u, a.s4, 0.4, IN_OUT));
  const rot = -17 * Math.exp(-2.4 * v) * Math.sin(2 * Math.PI * 1.5 * v - 0.7) + 3 * hov * Math.sin(2 * Math.PI * 0.6 * h + 1.2) + lean;
  return { x, y, rot, sx: 1, sy: 1, q: -12 * swing, s: lerp(c0.worldZoom, 0.94, k), balloon: k };
}

function BoxShape({ st, drawn, badge, alpha, glow = true, pulse = 1 }: { st: BoxSt; drawn: number; badge: number; alpha: number; glow?: boolean; pulse?: number }) {
  const { x, y, rot, sx, sy, q, s } = st;
  const d = clamp01(drawn);
  const line = (k: number) => clamp01(d * 1.3 - k * 0.3).toFixed(4);
  const det = clamp01(d * 2 - 1);
  return (
    <svg width={420} height={480} viewBox="-210 -240 420 480" style={{ position: "absolute", left: x - 210, top: y - 240, overflow: "visible", opacity: alpha, filter: glow ? GLOW : undefined }}>
      <g transform={`scale(${s.toFixed(4)}) rotate(${rot.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`}>
        {/* Face de côté */}
        <path d={`M ${FW / 2} ${-FH / 2} L ${FW / 2 + SD} ${-FH / 2 + 12} L ${FW / 2 + SD} ${FH / 2 - 6} L ${FW / 2} ${FH / 2}`} fill={rgba(MINT, 0.09 * d)} stroke={MINT} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={`${line(1)} 1`} />
        {/* Face avant */}
        <rect x={-FW / 2} y={-FH / 2} width={FW} height={FH} rx={7} fill={rgba(MINT, 0.18 * d)} stroke={MINT} strokeWidth={3} pathLength={1} strokeDasharray={`${line(0)} 1`} />
        {/* Le dessin de la boîte, en fil de fer : nom, dosage, halo, gélule, « 30 » */}
        <g opacity={det}>
          <rect x={-52} y={-84} width={70} height={15} rx={4} fill={rgba(MINT, 0.6)} />
          <rect x={-52} y={-62} width={88} height={15} rx={4} fill={rgba(MINT, 0.6)} />
          <rect x={-52} y={-39} width={40} height={9} rx={3} fill={rgba(MINT, 0.42)} />
          <rect x={-52} y={-23} width={64} height={4} rx={2} fill={rgba(MINT, 0.3)} />
          <path d={`M ${-FW / 2} 12 Q 0 -4 ${FW / 2} 12`} fill="none" stroke={MINT} strokeOpacity={0.35} strokeWidth={2} />
          <ellipse cx={0} cy={32} rx={56} ry={22} fill="none" stroke={MINT} strokeOpacity={0.4} strokeWidth={2} strokeDasharray="5 6" />
          <rect x={-54} y={60} width={14} height={30} rx={7} fill={rgba(MINT, 0.22)} stroke={MINT} strokeWidth={2.5} />
          <rect x={-32} y={62} width={24} height={14} rx={3} fill={rgba(MINT, 0.55)} />
          <rect x={-32} y={81} width={36} height={5} rx={2} fill={rgba(MINT, 0.35)} />
        </g>
        {/* Badge « ? » au coin */}
        {badge > 0 && (
          <g transform={`translate(${FW / 2 - 4} ${-FH / 2 + 4}) scale(${(badge * pulse).toFixed(3)}) rotate(${q.toFixed(2)})`}>
            <circle r={34} fill={MINT} stroke={ACT1.ink} strokeWidth={4} />
            <text x={0} y={3} textAnchor="middle" dominantBaseline="central" style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 54 }} fill="#062520">
              ?
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}

/** Un point de la boîte (repère local), à l'écran de la couche de l'avant. */
function boxPoint(st: BoxSt, lx: number, ly: number) {
  const r = (st.rot * Math.PI) / 180;
  const px = lx * st.sx;
  const py = ly * st.sy;
  return { x: st.x + st.s * (px * Math.cos(r) - py * Math.sin(r)), y: st.y + st.s * (px * Math.sin(r) + py * Math.cos(r)) };
}

/** L'ÉLASTIQUE menthe : du piton de l'étagère à la boîte ; tendu à l'élan, il ondule au claquement ; sur « l'aurait aidé »
 *  il lâche le piton et devient la ficelle du ballon. */
function Elastic({ tt, a }: { tt: number; a: Anchors }) {
  const app = a.s1 + 0.42;
  if (tt < app + 0.28) return null;
  const st = boxFront(a, tt);
  const pegOp = prog(tt, app + 0.22, 0.15) * (1 - prog(tt, a.s3 + 0.05, 0.25, IN_OUT));
  const c = camOf(a, tt);
  const peg = toFront(c, PEG.x - motion(a, tt).S, PEG.y);
  let path: string;
  let w: number;
  if (tt < a.s3) {
    const at = boxPoint(st, -FW / 2, 8);
    const grow = prog(tt, app + 0.28, 0.16, SNAP);
    const end = { x: lerp(at.x, peg.x, grow), y: lerp(at.y, peg.y, grow) };
    const dx = at.x - end.x;
    const dy = at.y - end.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const rl = len / st.s;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const sag = (rl < L0 ? 0.3 * Math.sqrt(L0 * L0 - rl * rl) : 0) * grow;
    const v = tt - a.snap;
    const wob = v > 0 ? 46 * Math.exp(-7 * v) * Math.sin(2 * Math.PI * 7 * v) : tt >= a.lunge + 8 * F ? 3 * Math.sin(tt * 2 * Math.PI * 22) : 0;
    const c1 = { x: end.x + dx / 3 + nx * (sag + wob), y: end.y + dy / 3 + ny * (sag + wob) };
    const c2 = { x: end.x + (2 * dx) / 3 + nx * (sag - wob), y: end.y + (2 * dy) / 3 + ny * (sag - wob) };
    path = `M ${end.x.toFixed(1)} ${end.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${at.x.toFixed(1)} ${at.y.toFixed(1)}`;
    w = Math.max(2.4, Math.min(7.5, 7 * Math.pow(L0 / Math.max(rl, 1), 1.6))) * st.s;
  } else {
    // La ficelle du ballon : accrochée sous la boîte, elle traîne derrière ses balancements.
    const v = tt - a.s3;
    const bot = boxPoint(st, 0, FH / 2);
    const prev = boxFront(a, tt - 0.12);
    const sway = Math.max(-60, Math.min(60, -0.9 * (st.x - prev.x))) + 6 * Math.sin(tt * 2 * Math.PI * 0.7);
    const hang = { x: bot.x + sway, y: bot.y + 130 * st.s };
    // Elle lâche le piton : le bout libre fouette jusque sous la boîte (0,16 s).
    const k = prog(tt, a.s3, 0.16, SNAP);
    const tip = { x: lerp(peg.x, hang.x, k), y: lerp(peg.y, hang.y, k) };
    const whip = 70 * (1 - k) * Math.sin(Math.PI * k);
    const cx = (bot.x + tip.x) / 2 + whip + sway * 0.4;
    const cy = (bot.y + tip.y) / 2 - whip * 0.6;
    path = `M ${bot.x.toFixed(1)} ${bot.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;
    w = lerp(4.5, 3, clamp01(v / 0.3)) * st.s;
  }
  const v3 = tt - a.s3;
  return (
    <>
      {pegOp > 0 && (
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: pegOp }}>
          <rect x={peg.x - 4} y={peg.y - 30 * c.worldZoom} width={8} height={30 * c.worldZoom} rx={3} fill={ACT1.g2} />
          <circle cx={peg.x} cy={peg.y} r={10 * c.worldZoom} fill={ACT1.ink} stroke={MINT} strokeWidth={3.5} />
          {/* Étincelles quand l'élastique lâche */}
          {v3 >= 0 &&
            v3 < 0.3 &&
            [0, 1, 2, 3, 4, 5].map((i) => {
              const ang = (i / 6) * 2 * Math.PI + 0.4;
              const r = 46 * (1 - Math.exp(-v3 * 14));
              return <circle key={i} cx={peg.x + Math.cos(ang) * r} cy={peg.y + Math.sin(ang) * r} r={3} fill={MINT} opacity={1 - v3 / 0.3} />;
            })}
        </svg>
      )}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", filter: `drop-shadow(0 0 10px ${rgba(MINT, 0.55)})` }}>
        <path d={path} fill="none" stroke={MINT} strokeOpacity={0.3} strokeWidth={w + 6} strokeLinecap="round" />
        <path d={path} fill="none" stroke={MINT} strokeWidth={w} strokeLinecap="round" />
        <path d={path} fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={Math.max(1, w * 0.3)} strokeLinecap="round" />
      </svg>
    </>
  );
}

function GhostBox({ tt, a }: { tt: number; a: Anchors }) {
  const app = a.s1 + 0.42;
  if (tt < app) return null;
  const drawn = prog(tt, app, 0.45, (x) => x);
  const badge = prog(tt, app + 0.3, 12 * F, POP);
  const st = boxFront(a, tt);
  // Le badge bat doucement tant que la boîte espère ; pendant le gag, la boîte s'efface un peu derrière les mots.
  const beat = tt < a.s4 ? 1 + (tt < a.s3 ? 0.08 : 0.12) * Math.max(0, Math.sin(2 * Math.PI * 2 * (tt - app))) : 1;
  const alpha = 1 - 0.2 * prog(tt, a.s4 + 0.2, 0.4, IN_OUT);
  // Échos du mouvement : élan, claquement, départ du ballon.
  const echoes = [];
  const fast = (tt > a.lunge - F && tt < a.snap + 0.4) || (tt > a.s3 && tt < a.s3 + 0.4);
  if (fast) {
    for (let k = 3; k >= 1; k--) {
      const e = boxFront(a, tt - k * 2 * F);
      echoes.push(<BoxShape key={k} st={e} drawn={drawn} badge={0} alpha={alpha * (0.28 - k * 0.08)} glow={false} />);
    }
  }
  return (
    <>
      {echoes}
      <BoxShape st={st} drawn={drawn} badge={badge} alpha={alpha} pulse={beat} />
    </>
  );
}

/* ---------- Les portes vitrées automatiques : elles claquent en 10 images, flou de mouvement, reflet qui balaie la vitre. ---------- */

const DOOR_DUR = 10 * F;
/** Accélère jusqu'au choc (vitesse non nulle à l'arrivée : ça claque). */
const doorEase = (x: number) => x * x * (1.6 - 0.6 * x);

function DoorPanel({ left, side, shine, blur }: { left: number; side: -1 | 1; shine: number; blur: number }) {
  // side −1 : panneau gauche (bord de jonction à droite) ; 1 : panneau droit (jonction à gauche).
  const meetLeft = side === 1;
  const sheenX = 300 + 260 * shine;
  return (
    <div style={{ position: "absolute", left, top: 0, width: 960, height: 1080, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(13,18,24,.38)", backdropFilter: "blur(4px) saturate(.5)", WebkitBackdropFilter: "blur(4px) saturate(.5)" }} />
      {/* Reflets diagonaux de la vitre */}
      <div style={{ position: "absolute", top: -200, left: sheenX - 300, width: 90, height: 1500, transform: "rotate(18deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.07), transparent)" }} />
      <div style={{ position: "absolute", top: -200, left: sheenX - 160, width: 34, height: 1500, transform: "rotate(18deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.05), transparent)" }} />
      {/* Montants (flous pendant la course : le flou de mouvement se lit sur les verticales) */}
      <div style={{ position: "absolute", inset: 0, filter: blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : undefined }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, [meetLeft ? "right" : "left"]: 0, width: 30, background: ACT1.g1, boxShadow: `inset ${meetLeft ? 2 : -2}px 0 0 ${ACT1.g2}` } as CSSProperties} />
        <div style={{ position: "absolute", top: 0, bottom: 0, [meetLeft ? "left" : "right"]: 0, width: 7, background: "#141A20", boxShadow: `inset ${meetLeft ? -2 : 2}px 0 0 ${ACT1.g2}` } as CSSProperties} />
        <div style={{ position: "absolute", top: 0, bottom: 0, [meetLeft ? "left" : "right"]: 7, width: 1, background: "rgba(255,255,255,.12)" } as CSSProperties} />
      </div>
      {/* Traverse basse */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 986, height: 94, background: ACT1.g1, borderTop: `2px solid ${ACT1.g2}` }} />
    </div>
  );
}

function Doors({ tt, a }: { tt: number; a: Anchors }) {
  if (tt < a.doors - 0.12) return null;
  const x01 = clamp01((tt - a.doors) / DOOR_DUR);
  const k = doorEase(x01);
  const reb = keys(tt, [
    [a.shut, 0],
    [a.shut + 3 * F, 7, SNAP],
    [a.shut + 10 * F, 0, IN_OUT],
  ]);
  const open = (1 - k) * 960 + reb;
  const moving = tt >= a.doors && tt < a.shut;
  // Vitesse (px/s) et flou de mouvement : la course d'une image et demie, en dégradé devant le bord d'attaque.
  const vel = moving ? (960 * (3.2 * x01 - 1.8 * x01 * x01)) / DOOR_DUR : 0;
  const smear = vel * F * 1.5;
  const speed = clamp01(vel / ((960 * 1.4) / DOOR_DUR));
  const head = prog(tt, a.doors - 0.12, 0.22, SNAP);
  const flash = Math.max(0, 1 - (tt - a.shut) / 0.35) * (tt >= a.shut ? 1 : 0);
  const led = tt > a.doors - 0.1 && tt < a.shut + 0.3 ? (Math.floor(tt * 12) % 2 === 0 ? 1 : 0.35) : 0.35;
  // Le REFLET qui balaie la vitre une fois fermée (de gauche à droite, 0,6 s).
  const sw = prog(tt, a.shut + 0.04, 0.6, IN_OUT);
  const swOp = tt >= a.shut ? Math.sin(Math.PI * sw) : 0;
  const swX = lerp(-500, 2300, sw);
  return (
    <>
      <DoorPanel left={-open} side={-1} shine={k} blur={Math.min(14, smear * 0.08)} />
      <DoorPanel left={960 + open} side={1} shine={-k} blur={Math.min(14, smear * 0.08)} />
      {/* Flou de mouvement des bords d'attaque */}
      {smear > 2 && (
        <>
          <div style={{ position: "absolute", left: 960 - open, top: 0, width: smear, height: 986, background: `linear-gradient(90deg, rgba(20,26,32,.85), rgba(13,18,24,0))` }} />
          <div style={{ position: "absolute", left: 960 + open - smear, top: 0, width: smear, height: 986, background: `linear-gradient(270deg, rgba(20,26,32,.85), rgba(13,18,24,0))` }} />
          {[0.35, 0.7].map((f, i) => (
            <div key={i}>
              <div style={{ position: "absolute", left: 960 - open + smear * f - 4, top: 0, width: 8, height: 986, background: rgba(ACT1.g2, 0.45 - 0.2 * i) }} />
              <div style={{ position: "absolute", left: 960 + open - smear * f - 4, top: 0, width: 8, height: 986, background: rgba(ACT1.g2, 0.45 - 0.2 * i) }} />
            </div>
          ))}
        </>
      )}
      {/* Traînées de vitesse sur les bords d'attaque */}
      {speed > 0.05 &&
        [0, 1, 2, 3, 4].map((i) => {
          const y = 160 + i * 170 + 40 * hash("s3-door", i);
          const L = 320 * speed * (0.6 + 0.4 * hash("s3-door", i + 9));
          return (
            <div key={i}>
              <div style={{ position: "absolute", left: 960 - open - L, top: y, width: L, height: 2, background: `linear-gradient(90deg, transparent, ${rgba(ACT1.g4, 0.4)})` }} />
              <div style={{ position: "absolute", left: 960 + open, top: y + 60, width: L, height: 2, background: `linear-gradient(270deg, transparent, ${rgba(ACT1.g4, 0.4)})` }} />
            </div>
          );
        })}
      {/* Reflet balayé */}
      {swOp > 0.01 && (
        <div style={{ position: "absolute", left: 0, top: 96, width: 1920, height: 890, overflow: "hidden", opacity: swOp }}>
          <div style={{ position: "absolute", top: -300, left: swX - 160, width: 320, height: 1500, transform: "rotate(18deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.10) 45%, rgba(255,255,255,.16) 50%, rgba(255,255,255,.10) 55%, transparent)" }} />
          <div style={{ position: "absolute", top: -300, left: swX + 230, width: 70, height: 1500, transform: "rotate(18deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.12), transparent)" }} />
        </div>
      )}
      {/* Éclair de la jonction au choc */}
      {flash > 0 && <div style={{ position: "absolute", left: 960 - 3, top: 0, width: 6, height: 1080, background: rgba(ACT1.g4, 0.55 * flash), boxShadow: `0 0 40px ${rgba(ACT1.g4, 0.5 * flash)}` }} />}
      {/* Linteau avec le détecteur */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 96, transform: `translateY(${(1 - head) * -100}px)`, background: "linear-gradient(180deg, #0A0E12, #131920)", borderBottom: `2px solid ${ACT1.g2}` }}>
        <div style={{ position: "absolute", left: 900, top: 52, width: 120, height: 30, borderRadius: 10, background: ACT1.g1, border: `2px solid ${ACT1.g2}` }}>
          <div style={{ position: "absolute", left: 54, top: 10, width: 8, height: 8, borderRadius: 4, background: ACT1.g4, opacity: led, boxShadow: `0 0 10px ${rgba(ACT1.g4, led)}` }} />
        </div>
      </div>
    </>
  );
}

/** Poussière secouée par le choc des portes (tombe du linteau). */
function DoorDust({ tt, a }: { tt: number; a: Anchors }) {
  const u = tt - a.shut;
  if (u < 0 || u > 1.6) return null;
  return (
    <>
      {Array.from({ length: 16 }, (_, i) => {
        const x0 = 960 + rnd("s3-dd", i, -320, 320);
        const vx = rnd("s3-dd", i + 40, -60, 60);
        const d = rnd("s3-dd", i + 80, 0, 0.12);
        const uu = u - d;
        if (uu < 0) return null;
        const y = 100 + rnd("s3-dd", i + 160, 0, 70) + 30 * uu + 0.5 * 220 * uu * uu;
        const x = x0 + vx * uu + 10 * Math.sin(uu * 5 + i);
        const s = rnd("s3-dd", i + 120, 1.5, 3.5);
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: "50%", background: "#FFFFFF", opacity: 0.35 * (1 - clamp01(uu / 1.4)) }} />;
      })}
    </>
  );
}

/* ---------- La croix néon grise. ---------- */

function crossPath(cx: number, cy: number, L: number, T: number) {
  const a = L / 2;
  const b = T / 2;
  return `M ${cx - b} ${cy - a} H ${cx + b} V ${cy - b} H ${cx + a} V ${cy + b} H ${cx + b} V ${cy + a} H ${cx - b} V ${cy + b} H ${cx - a} V ${cy - b} H ${cx - b} Z`;
}

/** 0, 1, .2, .9, .1, 1 sur 0,6 s, en sautes ; ensuite un léger bourdonnement. */
function neonLevel(a: Anchors, tt: number) {
  const u = tt - a.s4;
  if (u < 0) return 0;
  const steps: [number, number][] = [
    [0, 0],
    [0.05, 1],
    [0.13, 0.2],
    [0.24, 0.9],
    [0.36, 0.1],
    [0.5, 1],
  ];
  let v = 0;
  for (const [s, val] of steps) if (u >= s) v = val;
  if (u >= 0.5) v = 0.93 + 0.07 * noise2D("s3-hum", tt * 9, 0);
  return v;
}

function NeonCross({ tt, a }: { tt: number; a: Anchors }) {
  if (tt < a.doors) return null;
  const cx = 960;
  const cy = 400;
  const k = prog(tt, a.shut - 0.05, 0.25, SNAP);
  const lit = neonLevel(a, tt);
  return (
    <>
      {/* Halo projeté sur la vitre */}
      <div style={{ position: "absolute", left: cx - 380, top: cy - 380, width: 760, height: 760, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(ACT1.g4, 0.16 * lit)} 0%, ${rgba(ACT1.g4, 0.05 * lit)} 40%, transparent 70%)` }} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, opacity: k, overflow: "visible" }}>
        {/* Tube éteint */}
        <path d={crossPath(cx, cy, 180, 58)} fill={ACT1.g1} stroke={ACT1.g2} strokeWidth={3} strokeLinejoin="round" />
        <path d={crossPath(cx, cy, 150, 18)} fill="none" stroke={ACT1.g2} strokeWidth={2} strokeLinejoin="round" opacity={0.8} />
      </svg>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, opacity: lit, overflow: "visible", filter: `drop-shadow(0 0 12px ${rgba("#DCE2EA", 0.75)}) drop-shadow(0 0 48px ${rgba(ACT1.g4, 0.38)})` }}>
        <path d={crossPath(cx, cy, 180, 58)} fill={ACT1.g4} stroke="#E4E9EF" strokeWidth={3} strokeLinejoin="round" />
        <path d={crossPath(cx, cy, 150, 18)} fill="#FFFFFF" opacity={0.75} />
      </svg>
    </>
  );
}

/** Poussière en suspension qui monte lentement dans la lumière de la croix (40 grains). */
function RisingDust({ tt, t, a }: { tt: number; t: number; a: Anchors }) {
  const k = prog(tt, a.s4 - 0.1, 0.5, SNAP);
  if (k <= 0) return null;
  const lit = neonLevel(a, tt);
  return (
    <>
      {Array.from({ length: 40 }, (_, i) => {
        const bx = rnd("s3-rd", i, 180, 1740);
        const range = 820;
        const speed = rnd("s3-rd", i + 50, 14, 38);
        const y = 940 - ((rnd("s3-rd", i + 100, 0, range) + speed * (tt - a.s4)) % range);
        const x = bx + 16 * noise2D("s3-rdx", i * 0.37, tt * 0.4);
        // Après l'arrêt sur image, seule la poussière tremble encore d'un pixel.
        const jx = t > a.FZ ? noise2D("s3-jit", i, t * 30) : 0;
        const jy = t > a.FZ ? noise2D("s3-jit", i + 99, t * 30) : 0;
        const s = rnd("s3-rd", i + 150, 1, 3);
        const near = 1 - clamp01(Math.hypot(x - 960, y - 400) / 700);
        const alpha = 0.26 * (0.5 + 0.5 * Math.sin(tt * (1.4 + hash("s3-rd", i + 200) * 2) + i)) * (0.6 + 1.8 * near * lit);
        return <div key={i} style={{ position: "absolute", left: x + jx - s / 2, top: y + jy - s / 2, width: s, height: s, borderRadius: "50%", background: "#FFFFFF", opacity: Math.min(0.7, alpha) * k }} />;
      })}
    </>
  );
}

/* ---------- La caisse : le tiroir s'ouvre, vide. ---------- */

function Register({ tt, a }: { tt: number; a: Anchors }) {
  const t0 = a.s4 + 0.06;
  if (tt < t0 - F) return null;
  const up = ressort(tt, t0);
  const y = (1 - up) * 300;
  const land = squash(tt, t0 + 0.2, 6 * F);
  const openAt = a.s4 + 0.34;
  const open = 40 * ressort(tt, openAt);
  const display = tt > openAt + 0.1 ? (Math.floor((tt - openAt) * 5) % 2 === 0 ? 1 : 0.35) : 0.8;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "480px 815px", transform: `translateY(${y.toFixed(1)}px) scale(${land.sx.toFixed(3)}, ${land.sy.toFixed(3)})` }}>
      {/* Ombre au sol */}
      <div style={{ position: "absolute", left: 330, top: 838, width: 300, height: 22, borderRadius: "50%", background: "rgba(0,0,0,.6)", filter: "blur(8px)" }} />
      {/* Écran */}
      <div style={{ position: "absolute", left: 494, top: 600, width: 112, height: 46, borderRadius: 8, background: "#0E1318", border: `2px solid ${ACT1.g2}`, transform: "perspective(400px) rotateX(18deg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ ...digits(26, 700), color: ACT1.g3, opacity: display, letterSpacing: "0.04em" }}>0,00</span>
      </div>
      <div style={{ position: "absolute", left: 536, top: 644, width: 28, height: 12, background: ACT1.g2 }} />
      {/* Plateau découvert par le tiroir : vide */}
      <div style={{ position: "absolute", left: 356, top: 745, width: 248, height: Math.max(0, open + 2), background: "#0C1015", overflow: "hidden", boxShadow: "inset 0 10px 14px rgba(0,0,0,.8)" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ position: "absolute", left: i * 62 - 1, top: 0, width: 3, height: 60, background: ACT1.g2 }} />
        ))}
      </div>
      {/* Corps */}
      <div style={{ position: "absolute", left: 340, top: 652, width: 280, height: 96, borderRadius: "14px 14px 6px 6px", background: `linear-gradient(180deg, #212931, ${ACT1.g1})`, border: `2px solid ${ACT1.g2}` }}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} style={{ position: "absolute", left: 20 + (i % 4) * 30, top: 16 + Math.floor(i / 4) * 22, width: 22, height: 14, borderRadius: 4, background: ACT1.g2 }} />
        ))}
        <div style={{ position: "absolute", left: 164, top: 18, width: 92, height: 8, borderRadius: 4, background: "#0E1318" }} />
      </div>
      {/* Façade du tiroir (260 × 70) qui glisse de 40 px */}
      <div style={{ position: "absolute", left: 350, top: 745 + open, width: 260, height: 70, borderRadius: 8, background: `linear-gradient(180deg, #333D48, ${ACT1.g2})`, boxShadow: "0 14px 30px rgba(0,0,0,.5)" }}>
        <div style={{ position: "absolute", left: 90, top: 30, width: 80, height: 8, borderRadius: 4, background: ACT1.g1 }} />
      </div>
    </div>
  );
}

/** Une petite mite s'échappe du tiroir vide. */
function Moth({ tt, a }: { tt: number; a: Anchors }) {
  const t0 = a.s4 + 0.46;
  const u = tt - t0;
  if (u < 0 || u > 1.8) return null;
  const x = 470 + 120 * u + 26 * Math.sin(u * 7) + 14 * noise2D("s3-moth", u * 2, 0);
  const y = 770 - 230 * u + 30 * u * u + 18 * Math.sin(u * 11);
  const flap = Math.abs(Math.sin(tt * 2 * Math.PI * 11));
  const op = clamp01(u / 0.1) * (1 - clamp01((u - 1.4) / 0.4));
  return (
    <svg width={56} height={40} viewBox="-28 -20 56 40" style={{ position: "absolute", left: x - 28, top: y - 20, opacity: op, overflow: "visible" }}>
      <g transform={`scale(${(0.3 + 0.7 * flap).toFixed(3)} 1)`}>
        <path d="M -2 -2 C -10 -16 -26 -14 -24 -2 C -23 6 -12 8 -2 4 Z" fill={ACT1.g3} />
        <path d="M 2 -2 C 10 -16 26 -14 24 -2 C 23 6 12 8 2 4 Z" fill={ACT1.g3} />
        <path d="M -2 3 C -8 10 -16 14 -14 6 Z" fill="#6B7582" />
        <path d="M 2 3 C 8 10 16 14 14 6 Z" fill="#6B7582" />
      </g>
      <ellipse cx={0} cy={1} rx={2.8} ry={8} fill={ACT1.g4} />
      <path d="M -1 -7 Q -5 -14 -8 -15 M 1 -7 Q 5 -14 8 -15" stroke={ACT1.g4} strokeWidth={1.2} fill="none" />
    </svg>
  );
}

/* ---------- Le gag : PASSE À CÔTÉ rate sa case. ---------- */

const GAG_TEXT = "PASSE À CÔTÉ";
const GAG_SIZE = 104;
const GAG_PAD_X = 26;
const GAG_PAD_TOP = 46;
const LEDGE_Y = 712;
const BOX_CX = 1030;
const LEDGE_X0 = 676; // la tablette commence après la caisse
const LEDGE_PAST = 40; // … et s'arrête 40 px après la case
const PAST = GAG_PAD_X + LEDGE_PAST + 14; // + 50 % : le centre des mots finit 14 px APRÈS le bout de la tablette

/**
 * Le trajet des mots, en décalage depuis leur place dans la case (0 = pile dans la case) :
 *  1. fouet d'entrée (−1700 px → 0) en décélération uniforme, jusqu'à « passe » (seg5) : ils ARRIVENT dans la case…
 *  2. … mais glissent encore (dérapage, décélération uniforme jusqu'à l'arrêt) de 50 % + PAST : ils la dépassent.
 * Retour : { pct, px } (le pourcentage est relatif à la largeur des mots) et la vitesse en px/s.
 */
function gagPath(a: Anchors, tt: number) {
  const t1 = a.s5;
  const T1 = 0.12;
  const T2 = 0.3;
  const v1 = 2900;
  const L1 = 1700;
  const v0 = (2 * L1) / T1 - v1;
  const acc = (v0 - v1) / T1;
  if (tt < t1 - T1) return { pct: 0, px: -L1, v: v0, f2: 0 };
  if (tt < t1) {
    const u = tt - (t1 - T1);
    return { pct: 0, px: -L1 + v0 * u - 0.5 * acc * u * u, v: v0 - acc * u, f2: 0 };
  }
  const u = clamp01((tt - t1) / T2);
  const f = 1 - (1 - u) * (1 - u);
  return { pct: 50 * f, px: PAST * f, v: v1 * (1 - u), f2: f };
}

function Gag({ tt, a }: { tt: number; a: Anchors }) {
  const ledgeAt = a.s5 - 0.3;
  if (tt < ledgeAt - F) return null;
  const ledge = prog(tt, ledgeAt, 12 * F, SNAP);
  const boxK = prog(tt, a.s5 - 0.22, 12 * F, POP);
  const go = a.s5 - 0.12;
  const path = gagPath(a, tt);
  const speed = clamp01(path.v / 5200);
  // Coup de frein en entrant dans la case : les dernières lettres rattrapent les premières.
  const ring = tt > a.s5 ? Math.exp(-8 * (tt - a.s5)) * Math.sin(2 * Math.PI * 3.4 * (tt - a.s5)) : 0;
  // Chancelle au bout de la tablette, puis bascule (rotation autour du bout de la tablette).
  const stop = a.s5 + 0.3;
  const tip = a.s5 + 0.42;
  let theta = 0;
  let drop = 0;
  if (tt > stop - 0.06 && tt < tip) theta = 3.5 * Math.sin((Math.PI * (tt - stop + 0.06)) / (tip - stop + 0.06));
  if (tt >= tip) {
    const u = tt - tip;
    theta = 30 * u + 0.5 * 2700 * u * u;
    if (theta > 120) theta = 120 + 240 * (u - 0.25);
    drop = u > 0.1 ? 0.5 * 2600 * (u - 0.1) * (u - 0.1) : 0;
  }
  const n = Array.from(GAG_TEXT).length;
  const textStyle: CSSProperties = { fontFamily: JAKARTA, fontWeight: 800, fontSize: GAG_SIZE, letterSpacing: "-0.04em", lineHeight: 0.9, whiteSpace: "pre", display: "inline-block" };
  const puff = tt > stop - 0.04 ? tt - (stop - 0.04) : -1;
  const skid = path.f2 > 0 ? 1 - clamp01((tt - tip + 0.05) / 0.1) : 0;
  return (
    <div style={{ position: "absolute", left: BOX_CX, top: LEDGE_Y, transform: "translate(-50%, -100%)" }}>
      <div style={{ position: "relative", padding: `${GAG_PAD_TOP}px ${GAG_PAD_X}px 0` }}>
        <span style={{ ...textStyle, visibility: "hidden" }}>{GAG_TEXT}</span>
        {/* La tablette (de la caisse jusqu'à 40 px après la case) */}
        <div style={{ position: "absolute", left: `calc(50% - ${BOX_CX - LEDGE_X0}px)`, right: -LEDGE_PAST, bottom: -4, height: 6, borderRadius: 3, background: `linear-gradient(180deg, #3A4450, ${ACT1.g2})`, boxShadow: "0 12px 18px rgba(0,0,0,.5)", transformOrigin: "0 50%", transform: `scaleX(${ledge.toFixed(4)})` }} />
        <div style={{ position: "absolute", right: -LEDGE_PAST - 2, bottom: -8, width: 8, height: 14, borderRadius: 3, background: ACT1.g2, opacity: ledge > 0.98 ? 1 : 0 }} />
        {/* La case pointillée */}
        <div style={{ position: "absolute", inset: 0, bottom: 4, borderRadius: 20, border: `3px dashed ${ACT1.g3}`, background: rgba("#FFFFFF", 0.025), opacity: clamp01(boxK * 1.5), transform: `scale(${(0.9 + 0.1 * boxK).toFixed(4)})` }} />
        {/* Poussière au bout de la tablette quand les mots chancellent */}
        {puff >= 0 &&
          puff < 0.6 &&
          [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const ang = (200 + 140 * hash("s3-puff", i)) * (Math.PI / 180);
            const r = 80 * (1 - Math.exp(-puff * 6)) * (0.45 + 0.55 * hash("s3-puff", i + 7));
            const s = 4 + 4 * hash("s3-puff", i + 13);
            return <div key={i} style={{ position: "absolute", right: -LEDGE_PAST - Math.cos(ang) * r - s / 2, bottom: -Math.sin(ang) * r - s / 2, width: s, height: s, borderRadius: "50%", background: ACT1.g3, opacity: 0.55 * (1 - puff / 0.6) }} />;
          })}
        {/* Les mots */}
        <div
          style={{
            position: "absolute",
            left: GAG_PAD_X,
            bottom: 0,
            transformOrigin: `calc(50% - 14px) calc(100% - 7px)`,
            transform: `translate(calc(${path.pct.toFixed(3)}% + ${path.px.toFixed(2)}px), ${(7 + drop).toFixed(2)}px) rotate(${theta.toFixed(2)}deg)`,
            opacity: clamp01((tt - go) / (2 * F)),
          }}
        >
          {/* Traces de dérapage sur la tablette */}
          {skid > 0 && (
            <div style={{ position: "absolute", left: `calc(${(-path.pct).toFixed(3)}% - ${path.px.toFixed(2)}px)`, right: "35%", bottom: -9, height: 3, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${rgba(ACT1.g4, 0.55)})`, opacity: skid }} />
          )}
          <div style={{ ...textStyle, color: ACT1.g4, transformOrigin: "50% 100%", transform: `skewX(${(-16 * speed + 10 * ring).toFixed(2)}deg) scaleX(${(1 + 0.18 * speed).toFixed(3)})`, textShadow: "0 18px 40px rgba(0,0,0,.6)" }}>
            {Array.from(GAG_TEXT).map((ch, i) => (
              <span key={i} style={{ display: "inline-block", whiteSpace: "pre", transform: `translateX(${(ring * (1 - i / (n - 1)) * 30).toFixed(2)}px)` }}>
                {ch}
              </span>
            ))}
          </div>
          {/* Traînées de vitesse */}
          {speed > 0.08 &&
            [0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ position: "absolute", right: "100%", marginRight: 14 + 30 * hash("s3-sl", i), top: 10 + i * 17, width: (160 + 300 * hash("s3-sl", i + 5)) * speed, height: 3, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${rgba(ACT1.g4, 0.55 * speed)})` }} />
            ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- La pièce grise qui part en cloche et frôle la croix. ---------- */

function Coin({ tt, a }: { tt: number; a: Anchors }) {
  const c0 = a.s5 + 0.1;
  const apex = Math.max(c0 + 0.25, a.FZ - 0.04);
  const d = apex - c0;
  const x0 = 470;
  const y0 = 760;
  const xa = 1012;
  const ya = 284;
  const vx = (xa - x0) / d;
  const vy = (-2 * (y0 - ya)) / d;
  const g = (2 * (y0 - ya)) / (d * d);
  const at = (u: number) => ({ x: x0 + vx * u, y: y0 + vy * u + 0.5 * g * u * u });
  const u = tt - c0;
  if (u < 0) return null;
  const p = at(u);
  const spin = Math.cos(u * 26);
  const sx = Math.max(0.12, Math.abs(spin));
  const face = spin > 0;
  // Traînée effilée le long de la trajectoire (0,1 s).
  const pts = Array.from({ length: 9 }, (_, i) => at(Math.max(0, u - i * 0.0125)));
  const segs = pts.slice(1).map((q, i) => (
    <line key={i} x1={pts[i].x} y1={pts[i].y} x2={q.x} y2={q.y} stroke={ACT1.g4} strokeOpacity={0.3 * (1 - i / 8)} strokeWidth={30 * (1 - i / 9)} strokeLinecap="round" />
  ));
  const sparks =
    u < 0.3
      ? [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const ang = (-130 + 80 * hash("s3-cs", i)) * (Math.PI / 180);
          const r = 90 * (1 - Math.exp(-u * 10)) * (0.5 + 0.5 * hash("s3-cs", i + 3));
          return <div key={`s${i}`} style={{ position: "absolute", left: x0 + Math.cos(ang) * r - 2, top: y0 + Math.sin(ang) * r - 2, width: 4, height: 4, borderRadius: 2, background: ACT1.g4, opacity: 0.6 * (1 - u / 0.3) }} />;
        })
      : null;
  return (
    <>
      {sparks}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", filter: "blur(1.5px)" }}>
        {segs}
      </svg>
      <div style={{ position: "absolute", left: p.x - 23, top: p.y - 23, width: 46, height: 46, transform: `scaleX(${sx.toFixed(3)})` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: face ? `radial-gradient(circle at 35% 30%, #B4BDC8, ${ACT1.g3} 60%, #6B7582)` : "#6B7582", boxShadow: `inset 0 0 0 3px ${rgba("#FFFFFF", 0.16)}, 0 10px 18px rgba(0,0,0,.45)` }} />
        {face && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 26, color: ACT1.g1, lineHeight: 1 }}>€</div>}
      </div>
    </>
  );
}

/* ---------- La scène. ---------- */

export function Scene03({ t, time }: SceneProps) {
  const a = anchorsOf(time);
  // ARRÊT SUR IMAGE : tout le temps de la scène se bloque à FZ (sauf la poussière, le post-traitement et l'extinction).
  const tt = Math.min(t, a.FZ);
  const { D, S, X } = motion(a, tt);
  const c = camOf(a, tt);
  const shakes = [
    { at: a.shut, amp: 10, frames: 14 },
    { at: a.s4 + 0.26, amp: 4, frames: 10 },
    { at: a.s5 + 0.1, amp: 3, frames: 8 },
  ];
  const cam = { zoom: c.zoom, shakes, origin: O_FRONT };
  // Derrière la vitre, la boutique s'éteint pendant « Et la pharmacie ».
  const dim = 1 - 0.5 * prog(tt, a.s4 - 0.3, 0.9, IN_OUT);

  // Arrêt sur image : désaturation BRUTALE (2 images) et image figée qui avance de 1 à 1,02 jusqu'à l'extinction.
  const fz = prog(t, a.FZ, 2 * F, (x) => x);
  const C = a.C;
  const fzZoom = 1 + 0.02 * prog(t, a.FZ, Math.max(0.1, C - a.FZ), (x) => x);
  const sy = t < C ? 1 : lerp(1, 0.004, prog(t, C, 8 * F, EXIT));
  const sx = t < C + 8 * F ? 1 : lerp(1, 0.004, prog(t, C + 8 * F, 6 * F, EXIT));
  const bright = t < C ? 1 : lerp(1, 2.2, prog(t, C, 8 * F, (x) => x));
  const tvGone = t >= C + TV;
  const line = t >= C ? clamp01((0.22 - sy) / 0.16) * (tvGone ? 0 : 1) : 0;
  const dotOn = t >= C + 12 * F;
  const dotMint = prog(t, C + TV, 6 * F, SNAP);
  // Deux clignotements nets dans le silence ; le pixel dérive d'un pixel à chacun.
  const off = (at: number) => t >= at && t < at + a.blinkDur;
  const dotOp = off(a.b1) || off(a.b2) ? 0.06 : 1;
  const ddx = t >= a.b1 + a.blinkDur ? 1 : 0;
  const ddy = t >= a.b2 + a.blinkDur ? -1 : 0;

  return (
    <AbsoluteFill style={{ background: ACT1.ink, overflow: "hidden" }}>
      {!tvGone && (
        <AbsoluteFill style={{ transformOrigin: "960px 520px", transform: `scale(${(sx * fzZoom).toFixed(4)}, ${(sy * fzZoom).toFixed(4)})`, filter: `grayscale(${fz.toFixed(3)}) brightness(${bright.toFixed(3)})` }}>
          <AbsoluteFill style={{ background: ACT1.ink }} />
          <DotGrid t={tt} opacity={time.look(tt).dots} />
          {/* LE MONDE (derrière les portes) : rayons 20 % plus sombres et flous (profondeur), le patient et sa lumière détachés */}
          <Camera t={tt} {...cam} zoom={c.zoom * c.worldZoom} origin={O_WORLD} x={c.worldX} style={{ filter: dim < 0.999 ? `brightness(${dim.toFixed(3)})` : undefined }}>
            <Ceiling tt={tt} a={a} scroll={S} />
            <Shelves tt={tt} a={a} scroll={S} depth={0.3} top={150} height={470} unitW={230} gap={36} color="#0E1217" prod="#141A20" blur={10} seed="s3-back" boards={4} delay={0.16} />
            <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(11,15,20,.0) 30%, rgba(11,15,20,.6) 100%)" }} />
            <Shelves tt={tt} a={a} scroll={S} depth={0.6} top={220} height={560} unitW={290} gap={110} color="#12171D" prod="#1A2128" blur={6.5} seed="s3-mid" boards={5} delay={0.1} />
            <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 60% at 50% 55%, rgba(11,15,20,0) 0%, rgba(11,15,20,.5) 100%)" }} />
            <Shelves tt={tt} a={a} scroll={S} depth={1} top={300} height={515} unitW={330} gap={420} color="#171D23" prod="#212830" blur={4} seed="s3-front" boards={5} delay={0.04} />
            <Floor tt={tt} a={a} scroll={S} />
            {/* Lumière froide qui suit le patient */}
            <div style={{ position: "absolute", left: X - 420, top: 120, width: 840, height: 760, background: `radial-gradient(ellipse 45% 60% at 50% 62%, ${rgba(ACT1.g4, 0.15 * prog(tt, a.s1 + 0.1, 0.4))}, transparent 70%)` }} />
            <div style={{ position: "absolute", left: X - 260, top: FLOOR - 40, width: 520, height: 110, borderRadius: "50%", background: `radial-gradient(ellipse at 50% 40%, ${rgba(ACT1.g4, 0.2 * prog(tt, a.s1 + 0.1, 0.4))}, transparent 70%)` }} />
            <Patient tt={tt} a={a} X={X} D={D} />
            {/* Bokeh d'avant-plan (1,6×) */}
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const P = 2600;
              const bx = ((rnd("s3-bk", i, 0, P) - S * 1.6) % P + P) % P - 300;
              const by = rnd("s3-bk", i + 10, 120, 860);
              const r = rnd("s3-bk", i + 20, 5, 13);
              return <div key={i} style={{ position: "absolute", left: bx - r, top: by - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: rgba("#FFFFFF", 0.05 + 0.04 * hash("s3-bk", i + 30)), filter: "blur(3px)", opacity: prog(tt, a.s1 + 0.3, 0.5) }} />;
            })}
          </Camera>
          {/* L'AVANT : les portes… */}
          <Camera t={tt} {...cam}>
            <Doors tt={tt} a={a} />
            <DoorDust tt={tt} a={a} />
          </Camera>
          {/* … la boîte fantôme et son élastique, AU-DESSUS des portes (elle reste dedans, hors d'atteinte)… */}
          <Camera t={tt} {...cam}>
            <Elastic tt={tt} a={a} />
            <GhostBox tt={tt} a={a} />
          </Camera>
          {/* … la croix, la caisse, le gag, la pièce */}
          <Camera t={tt} {...cam}>
            <NeonCross tt={tt} a={a} />
            <Register tt={tt} a={a} />
            <Moth tt={tt} a={a} />
            <Gag tt={tt} a={a} />
            <Coin tt={tt} a={a} />
            <RisingDust tt={tt} t={t} a={a} />
          </Camera>
          {/* Arrêt sur image : encre-sarcelle, vignette resserrée, trames */}
          {fz > 0 && (
            <>
              <AbsoluteFill style={{ background: "#0F2A28", mixBlendMode: "multiply", opacity: 0.35 * fz }} />
              <AbsoluteFill style={{ background: "#1D8174", mixBlendMode: "color", opacity: 0.32 * fz }} />
              <AbsoluteFill style={{ opacity: fz }}>
                <Vignette strength={0.28} />
              </AbsoluteFill>
              <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0px, rgba(0,0,0,.22) 2px, transparent 2px, transparent 5px)", opacity: 0.55 * fz }} />
              <AbsoluteFill style={{ background: "#FFFFFF", opacity: 0.2 * (1 - clamp01((t - a.FZ) / (4 * F))) }} />
            </>
          )}
        </AbsoluteFill>
      )}
      {/* La ligne blanche du téléviseur qui s'éteint */}
      {line > 0 && (
        <div style={{ position: "absolute", left: 960 - 960 * sx, top: 520 - 3, width: 1920 * sx, height: 6, borderRadius: 3, background: "#FFFFFF", opacity: line, boxShadow: `0 0 24px rgba(255,255,255,${0.8 * line}), 0 0 80px ${rgba("#C9F7EE", 0.5 * line)}` }} />
      )}
      {/* Le pixel menthe : l'œil qui va s'ouvrir (relais S4) */}
      {dotOn && (
        <>
          <div style={{ position: "absolute", left: 960 - 60 + ddx, top: 520 - 60 + ddy, width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(MINT, 0.22 * dotMint * dotOp)}, transparent 65%)` }} />
          <div
            style={{
              position: "absolute",
              left: 960 - 4 + ddx,
              top: 520 - 4 + ddy,
              width: 8,
              height: 8,
              borderRadius: 2,
              background: dotMint < 1 ? `color-mix(in srgb, ${MINT} ${(dotMint * 100).toFixed(1)}%, #FFFFFF)` : MINT,
              boxShadow: `0 0 24px ${MINT}`,
              opacity: dotOp,
            }}
          />
        </>
      )}
    </AbsoluteFill>
  );
}

/** Les effets sonores de la scène (secondes du film) : cue("nom", temps, gain, vitesse). Un son par geste ; ceux qui tombent
 *  pendant P4 restent bas. */
export const cues: SceneCues = (time) => {
  const a = anchorsOf(time);
  return [
    cue("bubble_pop", a.s1, 0.3, 1.3),
    cue("robot_boing", a.snap, 0.25, 0.8), // l'élastique claque, la boîte revient en arrière
    cue("whoosh_fast", a.s3, 0.2, 0.7), // elle s'envole comme un ballon
    cue("door_slide", a.doors, 0.7),
    cue("box_drop", a.shut, 0.3, 0.7),
    cue("neon_flicker_grey", a.s4, 0.6),
    cue("ui_click", a.s4 + 0.34, 0.3, 0.7), // le tiroir-caisse s'ouvre : vide
    // riser_big : se termine à FZ (coupé net à FZ par l'ingénieur du son), jamais avant seg(4,4) − 0,5 ; bas pour laisser « passe à côté ».
    cue("riser_big", Math.max(a.FZ - 3.0, a.s4 - 0.5), 0.45),
    cue("whoosh_fast", a.s5 - 0.05, 0.35, 1.15),
    cue("coin_miss", a.s5 + 0.1, 0.5),
    cue("whoosh_fast", a.s5 + 0.45, 0.4, 0.8),
    cue("crt_off", a.C, 0.8, 1.3),
    cue("ui_click", a.b1, 0.12, 1.8), // les deux clignotements du pixel, dans le silence
    cue("ui_click", a.b2, 0.12, 1.8),
  ];
};
