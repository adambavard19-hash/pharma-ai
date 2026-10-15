import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing } from "remotion";
import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { noise2D } from "@remotion/noise";
import { Mascot, type Track } from "../mascot";
import {
  Camera,
  DotGrid,
  Halos,
  MotionBlur,
  Ring,
  Sparks,
  Spot,
  EXIT,
  F,
  IN_OUT,
  LINEAR,
  POP,
  SNAP,
  clamp01,
  cue,
  flight,
  hash,
  keys,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  squash,
  wobble,
  INK,
  JAKARTA,
  MONO,
  PB,
  type CameraProps,
} from "./kit";
import { Mention } from "./kit/mention";
import type { Fx } from "./sound";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S12 · SIGNATURE — voix P18 « PharmaBoost. Le bon conseil, | à chaque vente. » et P19 « Rendez-vous sur pharmaboost.app. »
 * Fenêtre : P18.start − 0,35 → fin du film (time.win.S12). Direction : DIRECTION-PRESENTATION.json, buildNotes « S12 ».
 *
 *  début          RELAIS de S11 : encre, 80 particules menthe, et les deux YEUX du robot (90×150, #36E8C8) posés
 *                 EXACTEMENT sur les deux « o » du logo (S12_RING_CENTERS, exporté pour S11).
 *  début → morph  la CHARGE (0,3 s, plus de vide entre la montée de S11 et la frappe) : les yeux s'allument et
 *                 vibrent, deux anneaux se resserrent sur eux, deux éclats convergent, les particules sont aspirées ;
 *                 son : robot_boot_rev, coupé 80 ms avant la frappe (l'aspiration fait claquer le logo).
 *  LOGO − 0,05    les yeux se changent en anneaux (rectangle arrondi → anneau, 12 images POP) ; « Pharma B » arrive
 *                 de la gauche et « st » de la droite (flou de mouvement, traînées) ; tout se cale à LOGO + 0,2.
 *  LOGO           impact : onde de choc, étincelles, éclat anamorphique, vague de la grille, halos qui s'ouvrent,
 *                 particules soufflées, coup de zoom + secousse.
 *  tenue du logo  poussée 1 → 1,05 ; LOGO + 0,25 sourire menthe tracé sous « Boost » ; LOGO + 0,5 VAGUE de lettres
 *                 (−12 px, 30 ms d'écart, anneaux compris) ; LOGO + 0,6 reflet large et lumineux qui la suit.
 *  SIGN           « Le bon conseil, » s'imprime mot par mot ; 8 gadgets du film (chrono, tampon VENDU, avion, pièce,
 *                 loupe, cadenas, stylo-laser, étoile du challenge), 100 à 160 px, jaillissent et tournent sur 3 GRANDES
 *                 ellipses TRACÉES (menthe 1,5 px, pointillés qui défilent, traînées) qui encerclent logo ET slogan sans
 *                 jamais les couper ; derrière = ×0,6, flou 6 px ; devant = ×1,2, net ; un tour, en accélérant.
 *  VENTE          (= P18 segment 2) l'orbite s'effondre sous « chaque vente » (8 images EXIT, flou), éclair menthe ;
 *                 « à chaque vente. » s'imprime, trait lumineux qui le souligne ; 2 couloirs de mini-bannières (y ≥ 960,
 *                 sens opposés, 80 et 120 px/s, fondu vers le bas).
 *  P19 − 0,15     la mise en page se pose, CENTRÉE à x = 960 (logo × 0,76, slogan × 0,88) ; le robot bondit au
 *                 tiers droit (x = 1650, × 1,2), socle sur la ligne de la pilule.
 *  P19 + 0,3      le STYLO-LASER sort de sa main, vise, et écrit « pharmaboost.app » à la main, d'un trait (1,2 s,
 *                 étincelles) ; l'écriture s'efface de gauche à droite, puis la pilule : contour, texte, remplissage
 *                 menthe ; 0,4 s plus tard un reflet glisse sur « boost ».
 *  fin + 0,5      la croix du début (tube néon éteint : contour seul) se rallume en MENTHE. Clin d'œil, coucou.
 *  tenue          dérive 1 → 1,02, particules qui montent, reflets de la pilule et du soulignement toutes les 0,8 s,
 *                 halo de la croix qui respire (±15 %) ; saut ample du robot (son + retombée), 3e reflet du logo ;
 *                 fin − 0,9 deux éclats d'étoile sur la croix ; fondu au noir (tout : −18 → −6 images ; la croix : −12 → 0).
 *  VENTE → fin    mention « Illustration · exemples » (coin haut droit) : les couloirs montrent des produits.
 * ======================================================================== */

// ---- Le temps de la scène ----------------------------------------------------------------------------------------

type Beats = ReturnType<typeof beats>;

function beats(time: Time) {
  const start = time.win.S12.start;
  const end = time.total;
  const LOGO = time.marks.logo;
  // « Le » commence à marks.sign (0,77 s dans P18) : le mot s'imprime 2 images avant qu'on l'entende
  const SIGN = Math.max(time.marks.sign - 0.03, LOGO + 0.45);
  const VENTE = Math.max(time.A("P18", 1), SIGN + 0.35);
  const p19 = time.A("P19");
  const p19end = time.Z("P19");
  const write = p19 + 0.3;
  const writeEnd = write + 1.2;
  const pill = writeEnd + 0.05;
  /** l'écriture s'efface de gauche à droite (12 images) ; le texte de la pilule arrive 3 images après */
  const wipeEnd = pill + 12 * F;
  const pillText = wipeEnd + 3 * F;
  const fill = pill + 18 * F;
  const wave = p19end;
  return {
    start,
    end,
    LOGO,
    SIGN,
    VENTE,
    p19,
    p19end,
    /** les yeux deviennent anneaux */
    morph: LOGO - 0.05,
    /** les lettres se calent */
    land: LOGO + 0.2,
    smile: LOGO + 0.25,
    /** la vague de lettres, puis le reflet qui la suit */
    letterWave: LOGO + 0.5,
    shine: LOGO + 0.6,
    /** un second reflet, plus doux, pendant la tenue finale */
    shine2: p19end + 0.7,
    /** un troisième, juste après le saut final : la tenue ne se fige jamais */
    shine3: Math.max(end - 1.6, p19end + 0.85) + 0.5,
    /** effondrement de l'orbite (8 images), puis éclair et soulignement */
    flash: VENTE + 8 * F,
    settle: p19 - 0.15,
    robotIn: p19 - 0.15,
    robotLand: p19 + 0.19,
    penOut: write - 0.24,
    write,
    writeEnd,
    penBack: writeEnd + 0.1,
    pill,
    wipeEnd,
    pillText,
    fill,
    /** le reflet qui glisse sur « boost », 0,4 s après le remplissage */
    glint: fill + 0.4,
    cross: writeEnd + 0.5,
    wink: p19end - 0.3,
    wave,
    /** le saut du coup final : jamais collé au coucou */
    final: Math.max(end - 1.6, wave + 0.85),
  };
}

function cam(t: number, b: Beats): Omit<CameraProps, "t" | "children"> {
  const zoom = keys(t, [
    [b.LOGO - 0.02, 1],
    [b.LOGO + 4 * F, 1.035, SNAP],
    [b.LOGO + 0.7, 1, IN_OUT],
    [b.VENTE - 0.02, 1.025, LINEAR],
    [b.VENTE + 5 * F, 1.045, SNAP],
    [b.VENTE + 0.6, 1, IN_OUT],
    [b.p19end, 1, LINEAR],
    [b.end, 1.02, LINEAR],
  ]);
  // le vertige : la caméra penche un peu pendant que l'orbite s'emballe, et se redresse sur l'éclair
  const rot = -1.1 * Math.pow(prog(t, b.SIGN, b.VENTE - b.SIGN, LINEAR), 2) * (1 - prog(t, b.VENTE, 0.45, SNAP));
  return {
    zoom,
    rot,
    origin: t < b.p19end ? [960, 460] : [960, 520],
    // immobile au premier instant : les yeux de S11 doivent tomber pile sur les anneaux
    drift: 0.7 * prog(t, b.LOGO, 0.6, IN_OUT),
    shakes: [
      { at: b.LOGO, amp: 10, frames: 12 },
      { at: b.land, amp: 5, frames: 10 },
      { at: b.flash, amp: 8, frames: 12 },
      { at: b.robotLand, amp: 4, frames: 10 },
    ],
  };
}

// ---- Géométrie du logo (Jakarta 800, 180 px, approche −0,04 em ; mesurée dans le navigateur de rendu) ----------------

const LOGO_SIZE = 180;
/** Ligne de base du logo. */
const LOGO_BASE = 480;
/** Avec line-height 1, la ligne de base tombe à 162 px sous le haut de la boîte (0,9 em). */
const BASE_IN_BOX = 0.9;
const X_PHARMA = 390;
const X_B = X_PHARMA + 628;
const X_O1 = X_B + 117;
const X_O2 = X_O1 + 110;
const X_ST = X_O2 + 110;
/** Centre de l'encre du « o » dans son avance (117,2 px). */
const O_CX = 58.6;
const RING_Y = LOGO_BASE - 49;
/** Les centres des deux « o » (= des deux yeux à l'instant du relais), en px du cadre, caméra neutre. */
export const S12_RING_CENTERS: [number, number][] = [
  [X_O1 + O_CX, RING_Y],
  [X_O2 + O_CX, RING_Y],
];
/** Les yeux du relais S11 → S12 : rectangles arrondis 90×150, #36E8C8, centrés sur S12_RING_CENTERS. */
export const S12_EYE = { w: 90, h: 150, color: "#36E8C8" } as const;
const RING_D = 102;
const RING_STROKE = 27;
const LOGO_CX = 960;
const LOGO_CY = 413;
/**
 * La mise en page finale reste CENTRÉE (x = 960) : pas de décalage ; le logo passe de ×1,05 (poussée) à ×0,76 et le
 * slogan à ×0,88, pour laisser le tiers droit au robot (×1,2) sans qu'il touche le « st » ni « vente. ».
 */
const SETTLE_DX = 0;
const LOGO_PUSH = 1.05;
const LOGO_FINAL = 0.76;
const SIG_FINAL = 0.88;

// ---- La signature (Jakarta 700, 64 px, −0,02 em) --------------------------------------------------------------------

const SIG_SIZE = 64;
const SIG_BASE = 590;
const SIG_GAP = 17;
const SIG_WORDS: { text: string; tail?: string; w: number; accent?: boolean; second?: boolean }[] = [
  { text: "Le", w: 71.4 },
  { text: "bon", w: 118.8, accent: true },
  { text: "conseil", tail: ",", w: 235.5, accent: true },
  { text: "à", w: 35.9, second: true },
  { text: "chaque", w: 226.4, second: true },
  { text: "vente.", w: 194.4, second: true },
];
const SIG_X: number[] = (() => {
  const total = SIG_WORDS.reduce((s, w) => s + w.w, 0) + SIG_GAP * (SIG_WORDS.length - 1);
  let x = 960 - total / 2;
  return SIG_WORDS.map((w) => {
    const at = x;
    x += w.w + SIG_GAP;
    return at;
  });
})();
const UNDER_X1 = SIG_X[3] - 2;
const UNDER_X2 = SIG_X[5] + SIG_WORDS[5].w - 18;
const UNDER_Y = SIG_BASE + 20;
/** Le point où l'orbite s'effondre : sous « chaque vente ». */
const COLLAPSE: [number, number] = [(SIG_X[4] + UNDER_X2) / 2, UNDER_Y];

// ---- Petits outils ------------------------------------------------------------------------------------------------

function hexRgb(h: string) {
  const v = parseInt(h.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mixHex(a: string, b: string, k: number) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  const c = A.map((x, i) => Math.round(lerp(x, B[i], clamp01(k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const settleK = (t: number, b: Beats) => prog(t, b.settle, 0.4, SNAP);
const abs = (x: number, y: number, extra?: CSSProperties): CSSProperties => ({ position: "absolute", left: x, top: y, ...extra });

// ---- Le monde de la visière : 80 particules menthe (exporté : S11 peut dessiner le même champ dans son masque) ---------

/** Une particule du champ de la visière à l'instant t (sans le souffle de l'impact). */
export function s12Particle(i: number, t: number) {
  const x = hash("S12-pv-x", i) * 1920 + 70 * noise2D("S12-pv", i * 0.37, t * 0.09);
  const y0 = hash("S12-pv-y", i) * 1180 - 50;
  const y = ((((y0 - 14 * t + 55 * noise2D("S12-pv", t * 0.08, i * 0.61)) % 1180) + 1180) % 1180) - 50;
  const s = 2 + 2 * hash("S12-pv-s", i);
  const tw = 0.55 + 0.45 * Math.sin(t * (1.6 + 2.2 * hash("S12-pv-t", i)) + i);
  return { x, y, s, a: (0.35 + 0.45 * hash("S12-pv-a", i)) * tw };
}

export function S12VisorParticles({ t, push, pull }: { t: number; push?: { at: number; x: number; y: number }; pull?: { from: number; to: number; x: number; y: number } }) {
  return (
    <>
      {Array.from({ length: 80 }, (_, i) => {
        const p = s12Particle(i, t);
        let { x, y } = p;
        if (pull && t > pull.from) {
          // l'aspiration avant la frappe : les particules glissent vers les yeux (0 au relais : rien ne saute), puis
          // sont relâchées d'un coup sur la frappe, où le souffle les chasse
          const u = clamp01((t - pull.from) / (pull.to - pull.from));
          const rel = t > pull.to ? Math.exp(-14 * (t - pull.to)) : 1;
          const dx = pull.x - x;
          const dy = pull.y - y;
          const d = Math.max(40, Math.hypot(dx, dy));
          const amt = Math.min(d - 30, (60 + 110 * hash("S12-pv-q", i)) * u * u * Math.min(1, 480 / d)) * rel;
          x += (dx / d) * amt;
          y += (dy / d) * amt;
        }
        if (push && t > push.at) {
          // le souffle de l'impact : chaque particule s'écarte du logo et y reste
          const u = t - push.at;
          const dx = x - push.x;
          const dy = y - push.y;
          const d = Math.max(40, Math.hypot(dx, dy));
          const amt = (1 - Math.exp(-5 * u)) * (90 + 170 * hash("S12-pv-p", i)) * Math.min(1, 520 / d);
          x += (dx / d) * amt;
          y += (dy / d) * amt;
        }
        return <div key={i} style={{ position: "absolute", left: x - p.s / 2, top: y - p.s / 2, width: p.s, height: p.s, borderRadius: "50%", background: PB.mint2, opacity: p.a, boxShadow: p.s > 3.2 ? `0 0 8px ${rgba(PB.mint, 0.8)}` : undefined }} />;
      })}
    </>
  );
}

// ---- Fond ---------------------------------------------------------------------------------------------------------

function Background({ t, b }: { t: number; b: Beats }) {
  const bloom = prog(t, b.LOGO, 0.9, SNAP);
  return (
    <>
      <AbsoluteFill style={{ background: INK }} />
      <AbsoluteFill style={{ opacity: 0.85 * bloom }}>
        <Halos t={t} intensity={1} seed="S12-halos" />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: bloom }}>
        <DotGrid t={t} opacity={0.08} wave={{ at: b.LOGO, x: 1248, y: RING_Y, speed: 1700, width: 260 }} />
      </AbsoluteFill>
    </>
  );
}

// ---- Les yeux → les anneaux ----------------------------------------------------------------------------------------

function ringPath(cx: number, cy: number, w: number, h: number, hole: number) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const r = Math.min(w, h) / 2;
  const outer = `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  if (hole < 0.5) return outer;
  return `${outer} M ${cx - hole} ${cy} A ${hole} ${hole} 0 1 0 ${cx + hole} ${cy} A ${hole} ${hole} 0 1 0 ${cx - hole} ${cy} Z`;
}

/** La charge, du relais au changement des yeux en anneaux : 0 → 1 en accélérant, 0 ensuite. */
function chargeK(t: number, b: Beats) {
  if (t >= b.morph) return 0;
  return Math.pow(clamp01((t - b.start) / (b.morph - b.start)), 1.6);
}

/**
 * La charge (relais → morph) : deux anneaux se resserrent sur les yeux, l'un après l'autre, et deux éclats horizontaux
 * convergent vers eux. Rien au premier instant (le relais de S11 reste exact), tout s'efface sur le changement en anneaux.
 */
function Charge({ t, b }: { t: number; b: Beats }) {
  if (t <= b.start || t > b.morph + 3 * F) return null;
  const cx = (S12_RING_CENTERS[0][0] + S12_RING_CENTERS[1][0]) / 2;
  const cy = RING_Y;
  const D = b.morph - b.start;
  const out = 1 - prog(t, b.morph, 3 * F, LINEAR);
  const ring = (delay: number, r0: number, key: string) => {
    const u = clamp01((t - b.start - delay) / (D - delay));
    if (u <= 0) return null;
    const e = u * u;
    const r = lerp(r0, 92, e);
    const a = Math.min(1, u * 4) * out;
    return <div key={key} style={{ position: "absolute", left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, borderRadius: "50%", border: `${lerp(1.5, 4, e).toFixed(2)}px solid ${rgba(PB.mint2, (0.3 + 0.45 * e) * a)}`, boxShadow: `0 0 ${(14 + 26 * e).toFixed(1)}px ${rgba(PB.mint, 0.35 * a)}, inset 0 0 ${(10 + 20 * e).toFixed(1)}px ${rgba(PB.mint, 0.2 * a)}` }} />;
  };
  const u = clamp01((t - b.start) / D);
  const e = u * u;
  const outer = lerp(1050, 150, e);
  const inner = lerp(560, 96, e);
  const sa = Math.min(1, u * 3) * out;
  return (
    <>
      {ring(0, 640, "r0")}
      {ring(0.08, 900, "r1")}
      {[-1, 1].map((s) => (
        <div
          key={s}
          style={{
            position: "absolute",
            left: s < 0 ? cx - outer : cx + inner,
            top: cy - 1.5,
            width: outer - inner,
            height: 3,
            borderRadius: 2,
            background: s < 0 ? `linear-gradient(90deg, transparent, ${rgba("#E8FFFA", 0.85 * sa)})` : `linear-gradient(90deg, ${rgba("#E8FFFA", 0.85 * sa)}, transparent)`,
            boxShadow: `0 0 10px ${rgba(PB.mint, 0.5 * sa)}`,
          }}
        />
      ))}
    </>
  );
}

/**
 * La vague de lettres (LOGO + 0,5) : chaque lettre de « PharmaBoost » saute de 12 px, 30 ms après la précédente.
 * Indices : P h a r m a = 0…5, B = 6, les deux anneaux = 7 et 8, s t = 9 et 10.
 */
function waveDy(t: number, b: Beats, j: number) {
  const u = (t - (b.letterWave + j * 0.03)) / 0.26;
  if (u <= 0 || u >= 1) return 0;
  // montée franche, retombée avec un léger rebond sous la ligne
  return -12 * Math.sin(Math.PI * u) + 3 * Math.sin(2 * Math.PI * u) * u;
}

function Rings({ t, b, white = false }: { t: number; b: Beats; white?: boolean }) {
  const k = prog(t, b.morph, 12 * F, POP);
  // anticipation : les yeux se tassent un instant avant de se changer en anneaux
  const pre = t < b.morph ? IN_OUT(clamp01((t - (b.morph - 6 * F)) / (6 * F))) : 1 - clamp01((t - b.morph) / (4 * F));
  const breath = 0.5 + 0.5 * Math.sin((t - b.start) * 7);
  const w = lerp(S12_EYE.w, RING_D, k) * (1 + 0.06 * pre);
  const h = lerp(S12_EYE.h, RING_D, k) * (1 - 0.1 * pre);
  const hole = Math.max(0, Math.min(lerp(0, RING_D / 2 - RING_STROKE, k), Math.min(w, h) / 2 - 8));
  const top = mixHex(S12_EYE.color, PB.mint2, k);
  // la charge : les yeux s'allument de plus en plus fort et bourdonnent jusqu'au changement en anneaux
  const ch = chargeK(t, b);
  const hum = 1 + 0.12 * ch * noise2D("S12-hum", t * 38, 0);
  const glowA = Math.min(1, (lerp(0.75, 0.5, k) + 0.25 * ch) * (0.75 + 0.25 * breath) * hum);
  const glow = white ? undefined : `drop-shadow(0 0 ${(lerp(26, 20, k) + 26 * ch).toFixed(1)}px ${rgba(PB.mint, glowA)})`;
  const jit = 1.6 * ch;
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", filter: glow }}>
      <defs>
        <linearGradient id="S12-ring-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.1" stopColor={top} />
          <stop offset="0.9" stopColor={PB.mint} />
        </linearGradient>
      </defs>
      {S12_RING_CENTERS.map(([cx0, cy0], i) => {
        const cx = cx0 + jit * noise2D("S12-jx", t * 30, i);
        const cy = cy0 + waveDy(t, b, 7 + i) + jit * noise2D("S12-jy", t * 30, i);
        const gloss = (t - b.morph) * 70 + i * 140;
        const ga = (gloss * Math.PI) / 180;
        const gr = RING_D / 2 - RING_STROKE / 2;
        const g0 = [cx + gr * Math.cos(ga), cy + gr * Math.sin(ga)];
        const g1 = [cx + gr * Math.cos(ga + 0.8), cy + gr * Math.sin(ga + 0.8)];
        return (
          <g key={i}>
            <path d={ringPath(cx, cy, w, h, hole)} fill={white ? "#FFFFFF" : "url(#S12-ring-grad)"} fillRule="evenodd" />
            {!white && k > 0.9 && <path d={`M ${g0[0]} ${g0[1]} A ${gr} ${gr} 0 0 1 ${g1[0]} ${g1[1]}`} stroke="#FFFFFF" strokeOpacity={0.45 * clamp01((t - b.morph - 12 * F) / 0.3)} strokeWidth={5} strokeLinecap="round" fill="none" />}
          </g>
        );
      })}
    </svg>
  );
}

// ---- Les lettres ---------------------------------------------------------------------------------------------------

const GRAD_TEXT: CSSProperties = {
  backgroundImage: `linear-gradient(170deg, ${PB.mint2} 10%, ${PB.mint} 90%)`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

/** L'arrivée des lettres : freinage franc, mais un départ moins brutal que SNAP (le flou reste lisse). */
const LETTER_EASE = Easing.bezier(0.2, 0.85, 0.3, 1);
const lettersFrom = (b: Beats) => b.morph - 0.08;

function letterOffsets(t: number, b: Beats) {
  const k = prog(t, lettersFrom(b), b.land - lettersFrom(b), LETTER_EASE);
  return { left: -1300 * (1 - k), right: 1100 * (1 - k), k, on: t >= lettersFrom(b) };
}

function Glyphs({ t, b, white = false }: { t: number; b: Beats; white?: boolean }) {
  const o = letterOffsets(t, b);
  if (!o.on) return null;
  const top = LOGO_BASE - BASE_IN_BOX * LOGO_SIZE;
  const base: CSSProperties = { position: "absolute", top, fontFamily: JAKARTA, fontWeight: 800, fontSize: LOGO_SIZE, lineHeight: 1, letterSpacing: "-0.04em", whiteSpace: "pre" };
  const breath = 0.5 + 0.5 * Math.sin((t - b.LOGO) * 5.2);
  // les lueurs n'arrivent qu'une fois les lettres calées (sous le flou de mouvement, une lueur pâle se crénelle)
  const lit = prog(t, b.land - 2 * F, 0.3, SNAP);
  const mintGlow = lit > 0.01 ? `drop-shadow(0 0 22px ${rgba(PB.mint, 0.5 * lit * (0.7 + 0.3 * breath))})` : undefined;
  const whiteStyle: CSSProperties = white ? { color: "#FFFFFF" } : {};
  // la vague : décalage vertical par lettre (span relatif : la forme du mot et ses approches restent celles du bloc)
  const span = (ch: string, j: number, extra?: CSSProperties) => (
    <span key={j} style={{ position: "relative", top: waveDy(t, b, j), ...extra }}>
      {ch}
    </span>
  );
  const mintLetter: CSSProperties = white ? {} : GRAD_TEXT;
  return (
    <>
      <div style={{ ...base, left: X_PHARMA + o.left, color: "#FFFFFF", filter: white || lit < 0.01 ? undefined : `drop-shadow(0 10px 30px rgba(0,0,0,${(0.4 * lit).toFixed(3)}))`, ...whiteStyle }}>{Array.from("Pharma", (ch, j) => span(ch, j))}</div>
      <div style={{ ...base, left: X_B + o.left, top: top + waveDy(t, b, 6), ...(white ? whiteStyle : { ...GRAD_TEXT, filter: mintGlow }) }}>B</div>
      <div style={{ ...base, left: X_ST + o.right, ...(white ? whiteStyle : { filter: mintGlow }) }}>
        {span("s", 9, mintLetter)}
        {span("t", 10, mintLetter)}
      </div>
    </>
  );
}

/** Traînées d'air derrière les lettres qui arrivent. */
function Streaks({ t, b }: { t: number; b: Beats }) {
  const o = letterOffsets(t, b);
  if (!o.on || o.k >= 0.98) return null;
  const v = 1 - o.k;
  return (
    <>
      {Array.from({ length: 7 }, (_, i) => {
        const y = 360 + i * 18 + 6 * hash("S12-str", i);
        const len = (260 + 340 * hash("S12-strl", i)) * v;
        const leftSide = i % 2 === 0;
        const x = leftSide ? X_B + 117 + o.left - len - 40 * hash("S12-strx", i) : X_ST + o.right + 40 * hash("S12-strx", i) + 120;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: len, height: 3, borderRadius: 3, background: leftSide ? `linear-gradient(90deg, transparent, ${rgba("#FFFFFF", 0.7)})` : `linear-gradient(90deg, ${rgba(PB.mint2, 0.8)}, transparent)`, opacity: v }} />;
      })}
    </>
  );
}

const SMILE_D = "M 1052 495 Q 1272 531 1494 495";

function Smile({ t, b }: { t: number; b: Beats }) {
  if (t < b.smile) return null;
  const k = prog(t, b.smile, 12 * F, SNAP);
  const ev = evolvePath(k, SMILE_D);
  const head = getPointAtLength(SMILE_D, getLength(SMILE_D) * k);
  // quand la vague passe sur « Boost », le sourire s'élargit un instant (et suit le saut des lettres)
  const grin = pulse(t, b.letterWave + 0.2, 6 * F, 2 * F, 14 * F);
  const lift = (waveDy(t, b, 7) + waveDy(t, b, 8)) / 2;
  const d = `M ${1052 - 8 * grin} ${495 - 6 * grin + lift} Q 1272 ${531 + 18 * grin + lift} ${1494 + 8 * grin} ${495 - 6 * grin + lift}`;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <path d={k < 1 ? SMILE_D : d} stroke={PB.mint} strokeWidth={7 + 2 * grin} strokeLinecap="round" fill="none" strokeDasharray={k < 1 ? ev.strokeDasharray : undefined} strokeDashoffset={k < 1 ? ev.strokeDashoffset : undefined} style={{ filter: `drop-shadow(0 0 ${10 + 10 * grin}px ${rgba(PB.mint, 0.8 + 0.2 * grin)})` }} />
      {k < 1 && head && <circle cx={head.x} cy={head.y} r={8} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 12px ${PB.mint2})` }} />}
    </svg>
  );
}

function LogoArt({ t, b, white = false }: { t: number; b: Beats; white?: boolean }) {
  return (
    <>
      <Glyphs t={t} b={b} white={white} />
      <Rings t={t} b={b} white={white} />
    </>
  );
}

function Shine({ t, b, at, strength = 1 }: { t: number; b: Beats; at: number; strength?: number }) {
  const u = (t - at) / (22 * F);
  if (u <= 0 || u >= 1) return null;
  // une large bande blanche traverse le logo de gauche à droite (en px du cadre), dans la foulée de la vague
  const p = lerp(180, 1780, IN_OUT(u));
  const band = `linear-gradient(105deg, transparent ${p - 190}px, rgba(0,0,0,.55) ${p - 70}px, black ${p}px, rgba(0,0,0,.55) ${p + 70}px, transparent ${p + 190}px)`;
  const a = Math.min(1, 4 * u, 4 * (1 - u));
  return (
    <AbsoluteFill style={{ opacity: 0.8 * a * strength, WebkitMaskImage: band, maskImage: band, filter: `drop-shadow(0 0 16px ${rgba("#E8FFFA", 0.7)})` }}>
      <LogoArt t={t} b={b} white />
    </AbsoluteFill>
  );
}

/** La poussée pendant la tenue (1 → 1,05, du calage des lettres à l'orbite), puis la mise en page (× 0,86). */
function logoScale(t: number, b: Beats) {
  const push = lerp(1, LOGO_PUSH, prog(t, b.land, b.SIGN + 0.4 - b.land, IN_OUT));
  return lerp(push, LOGO_FINAL, settleK(t, b));
}

function LogoGroup({ t, b, part }: { t: number; b: Beats; part: "letters" | "rest" }) {
  const s = settleK(t, b);
  const sq = squash(t, b.land, 5 * F);
  const sx = 1 + (sq.sx - 1) * 0.22;
  const sy = 1 + (sq.sy - 1) * 0.22;
  return (
    <AbsoluteFill style={{ transformOrigin: `${LOGO_CX}px ${LOGO_CY}px`, transform: `translateX(${(SETTLE_DX * s).toFixed(2)}px) scale(${logoScale(t, b).toFixed(4)})` }}>
      <AbsoluteFill style={{ transformOrigin: `${LOGO_CX}px ${LOGO_BASE}px`, transform: `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` }}>
        {part === "letters" ? (
          <>
            <Streaks t={t} b={b} />
            <Glyphs t={t} b={b} />
          </>
        ) : (
          <>
            <Rings t={t} b={b} />
            <Shine t={t} b={b} at={b.shine} />
            <Shine t={t} b={b} at={b.shine2} strength={0.55} />
            <Shine t={t} b={b} at={b.shine3} strength={0.45} />
            <Smile t={t} b={b} />
          </>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** La lueur derrière le logo (hors flou de mouvement : un dégradé très pâle s'y crénelle). */
function LogoGlow({ t, b }: { t: number; b: Beats }) {
  const glow = prog(t, b.LOGO, 0.5, SNAP) * (0.85 + 0.15 * Math.sin((t - b.LOGO) * 3.1));
  if (glow <= 0) return null;
  return <Spot x={960 + SETTLE_DX * settleK(t, b)} y={LOGO_CY + 10} r={760} color={PB.mint} alpha={0.13 * glow} />;
}

/** L'impact sur « Pharma Boost » : éclat anamorphique, ondes, étincelles. */
function Impact({ t, b }: { t: number; b: Beats }) {
  if (t < b.LOGO - F || t > b.LOGO + 0.9) return null;
  const fl = pulse(t, b.LOGO, 3 * F, 2 * F, 0.5);
  const cx = (S12_RING_CENTERS[0][0] + S12_RING_CENTERS[1][0]) / 2;
  return (
    <>
      <div style={{ position: "absolute", left: cx - 900, top: RING_Y - 1.5, width: 1800, height: 3, background: `linear-gradient(90deg, transparent, ${rgba("#E8FFFA", 0.9 * fl)} 50%, transparent)` }} />
      <div style={{ position: "absolute", left: cx - 700, top: RING_Y - 16, width: 1400, height: 32, filter: "blur(12px)", background: `linear-gradient(90deg, transparent, ${rgba(PB.mint2, 0.45 * fl)} 50%, transparent)` }} />
      <div style={{ position: "absolute", left: cx - 260, top: RING_Y - 260, width: 520, height: 520, borderRadius: "50%", background: `radial-gradient(circle, ${rgba("#FFFFFF", 0.55 * fl)} 0%, ${rgba(PB.mint, 0.25 * fl)} 35%, transparent 70%)` }} />
      <Ring t={t} at={b.LOGO} x={cx} y={RING_Y} max={980} color={PB.mint2} width={5} life={0.6} />
      {S12_RING_CENTERS.map(([x, y], i) => (
        <Sparks key={i} t={t} at={b.LOGO + i * F} x={x} y={y} count={14} seed={`S12-imp${i}`} speed={1100} spread={180} len={30} life={0.55} color={i === 0 ? PB.mint2 : "#FFFFFF"} />
      ))}
    </>
  );
}

// ---- La signature et son soulignement --------------------------------------------------------------------------------

function Signature({ t, b }: { t: number; b: Beats }) {
  const s = settleK(t, b);
  const top = SIG_BASE - BASE_IN_BOX * SIG_SIZE;
  return (
    <AbsoluteFill style={{ transformOrigin: `960px ${SIG_BASE}px`, transform: `translateX(${(SETTLE_DX * s).toFixed(2)}px) scale(${lerp(1, SIG_FINAL, s).toFixed(4)})` }}>
      {SIG_WORDS.map((w, i) => {
        const at = (w.second ? b.VENTE + (i - 3) * 4 * F : b.SIGN + i * 4 * F);
        if (t < at) return null;
        const k = prog(t, at, 8 * F, POP);
        const sc = 1.25 - 0.25 * k;
        const op = clamp01((t - at) / (4 * F));
        const bl = 6 * (1 - clamp01((t - at) / (8 * F)));
        const flashA = w.accent ? pulse(t, at, 3 * F, 0, 0.5) : 0;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: SIG_X[i],
              top,
              fontFamily: JAKARTA,
              fontWeight: 700,
              fontSize: SIG_SIZE,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              whiteSpace: "pre",
              color: w.accent ? PB.mint2 : "#FFFFFF",
              opacity: op,
              transformOrigin: `${w.w / 2}px ${BASE_IN_BOX * SIG_SIZE}px`,
              transform: `scale(${sc.toFixed(4)})`,
              filter: `${bl > 0.2 ? `blur(${bl.toFixed(2)}px) ` : ""}${w.accent ? `drop-shadow(0 0 ${12 + 18 * flashA}px ${rgba(PB.mint, 0.35 + 0.5 * flashA)})` : "drop-shadow(0 6px 18px rgba(0,0,0,.35))"}`,
            }}
          >
            {w.text}
            {w.tail && <span style={{ color: "#FFFFFF" }}>{w.tail}</span>}
          </div>
        );
      })}
      <Underline t={t} b={b} />
    </AbsoluteFill>
  );
}

function Underline({ t, b }: { t: number; b: Beats }) {
  if (t < b.flash) return null;
  const k = prog(t, b.flash, 12 * F, SNAP);
  const w = (UNDER_X2 - UNDER_X1) * k;
  const headA = 1 - prog(t, b.flash + 12 * F, 0.3, LINEAR);
  // un reflet parcourt le trait toutes les 0,8 s (décalé de celui de la pilule)
  const cyc = ((t - b.flash - 0.5) % 0.8 + 0.8) % 0.8;
  const sh = t > b.flash + 0.5 ? cyc / 0.45 : 2;
  const shx = lerp(-0.1, 1.1, sh) * (UNDER_X2 - UNDER_X1);
  return (
    <>
      <div style={{ position: "absolute", left: UNDER_X1, top: UNDER_Y - 3, width: w, height: 6, borderRadius: 3, background: PB.mint, boxShadow: `0 0 14px ${rgba(PB.mint, 0.8)}, 0 0 40px ${rgba(PB.mint, 0.35)}`, overflow: "hidden" }}>
        {sh <= 1 && <div style={{ position: "absolute", left: shx - 40, top: 0, width: 80, height: 6, background: "linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent)" }} />}
      </div>
      {headA > 0 && (
        <div style={{ position: "absolute", left: UNDER_X1 + w - 7, top: UNDER_Y - 7, width: 14, height: 14, borderRadius: "50%", background: "#FFFFFF", opacity: headA, boxShadow: `0 0 14px ${PB.mint2}, 0 0 36px ${rgba(PB.mint, 0.8)}` }} />
      )}
    </>
  );
}

// ---- L'orbite des gadgets ------------------------------------------------------------------------------------------

/**
 * Huit gadgets RECONNAISSABLES du film (chrono, tampon VENDU, avion du bilan, pièce du challenge, loupe, cadenas,
 * stylo-laser, étoile), 100 à 160 px, sur 3 GRANDES ellipses tracées autour du logo et du slogan. Les ellipses ont été
 * choisies pour ne jamais couper les boîtes du logo (poussé à ×1,05) ni du slogan, gadget compris (marge ≥ 15 px) ;
 * un garde-fou baisse quand même l'opacité d'un gadget qui recouperait l'une d'elles.
 */
type GKind = "chrono" | "vendu" | "avion" | "piece" | "loupe" | "cadenas" | "stylo" | "etoile";
const GADGETS: { kind: GKind; orbit: number; phase: number }[] = [
  { kind: "chrono", orbit: 0, phase: 200 },
  { kind: "etoile", orbit: 0, phase: 320 },
  { kind: "avion", orbit: 0, phase: 80 },
  { kind: "vendu", orbit: 1, phase: 22 },
  { kind: "loupe", orbit: 1, phase: 142 },
  { kind: "piece", orbit: 1, phase: 262 },
  { kind: "cadenas", orbit: 2, phase: 112 },
  { kind: "stylo", orbit: 2, phase: 292 },
];
/** Demi-largeur et demi-hauteur de chaque gadget à l'échelle 1 (pour le garde-fou). */
const G_HALF: Record<GKind, [number, number]> = {
  chrono: [56, 62],
  vendu: [82, 40],
  avion: [64, 48],
  piece: [54, 54],
  loupe: [64, 64],
  cadenas: [50, 60],
  stylo: [76, 20],
  etoile: [56, 56],
};
const ORBITS = [
  { rx: 840, ry: 380, tilt: -2, speed: 1.25 },
  { rx: 870, ry: 410, tilt: 4, speed: 1.12 },
  { rx: 900, ry: 440, tilt: -4, speed: 1 },
];
const ORBIT_C: [number, number] = [960, 480];
/** Les boîtes que l'orbite ne doit jamais couper : le logo (poussé à ×1,05) et le slogan. */
const KEEP_OUT: [number, number, number, number][] = [
  [355, 330, 1560, 495],
  [466, 522, 1454, 620],
];

/** L'angle parcouru (degrés) : ω de 45 °/s à 810 °/s en accélérant (ω = 45 + 765·u²), puis 810 °/s pendant l'effondrement. */
function orbitTheta(t: number, b: Beats) {
  const D = b.VENTE - b.SIGN;
  const u = clamp01((t - b.SIGN) / D);
  return D * (45 * u + 255 * u * u * u) + Math.max(0, t - b.VENTE) * 810;
}
function orbitOmega(t: number, b: Beats) {
  const u = clamp01((t - b.SIGN) / (b.VENTE - b.SIGN));
  return t > b.VENTE ? 810 : 45 + 765 * u * u;
}

function orbitPoint(o: (typeof ORBITS)[number], deg: number, r: number, k: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const tr = (o.tilt * Math.PI) / 180;
  const ex = o.rx * Math.cos(a) * r;
  const ey = o.ry * Math.sin(a) * r;
  const x = ORBIT_C[0] + ex * Math.cos(tr) - ey * Math.sin(tr);
  const y = ORBIT_C[1] + ex * Math.sin(tr) + ey * Math.cos(tr);
  return [lerp(x, COLLAPSE[0], k), lerp(y, COLLAPSE[1], k)];
}

/** Le garde-fou : 1 loin des boîtes protégées, 0,3 si le gadget les recoupe. */
function keepOut(x: number, y: number, hw: number, hh: number) {
  let gap = Infinity;
  for (const [x0, y0, x1, y1] of KEEP_OUT) {
    const gx = Math.max(x0 - (x + hw), x - hw - x1, 0);
    const gy = Math.max(y0 - (y + hh), y - hh - y1, 0);
    gap = Math.min(gap, gx > 0 || gy > 0 ? Math.hypot(gx, gy) : 0);
  }
  return lerp(0.3, 1, clamp01(gap / 24));
}

function orbitState(t: number, b: Beats, i: number) {
  const g = GADGETS[i];
  const o = ORBITS[g.orbit];
  const at = b.SIGN + i * 2 * F;
  if (t < at) return null;
  const k = prog(t, b.VENTE, 8 * F, EXIT);
  if (k >= 1) return null;
  // ils jaillissent DE L'EXTÉRIEUR vers leur ellipse (jamais à travers le slogan), avec un ressort
  const r = 1.5 - 0.5 * ressort(t, at);
  const deg = g.phase + orbitTheta(t, b) * o.speed;
  const [x, y] = orbitPoint(o, deg, r, k);
  const d = Math.sin((deg * Math.PI) / 180);
  const dk = (d + 1) / 2;
  const pop = prog(t, at, 10 * F, POP);
  const s = lerp(0.6, 1.2, dk) * pop * (1 - 0.85 * k);
  const front = k > 0 || d > 0;
  const back = clamp01(1 - 2 * dk);
  const guard = k > 0 ? 1 : keepOut(x, y, G_HALF[g.kind][0] * s, G_HALF[g.kind][1] * s);
  // direction du mouvement (avion, stylo) : tangente à l'ellipse
  const a = (deg * Math.PI) / 180;
  const dir = Math.atan2(o.ry * Math.cos(a), -o.rx * Math.sin(a)) + (o.tilt * Math.PI) / 180;
  return { x, y, s, k, r, deg, dk, front, blur: front ? 0 : 6 * back, op: (front ? 1 : lerp(1, 0.5, back)) * guard, dir, spin: wobble(t, i * 3 + 1, 10, 2) };
}

/** Les trois ellipses tracées : trait menthe 1,5 px (≈ 25 %, plus pâle derrière), pointillés qui défilent avec les gadgets. */
function OrbitPaths({ t, b }: { t: number; b: Beats }) {
  if (t < b.SIGN - 0.05 || t > b.VENTE + 9 * F) return null;
  const draw = prog(t, b.SIGN - 0.05, 0.4, SNAP);
  const k = prog(t, b.VENTE, 8 * F, EXIT);
  const theta = orbitTheta(t, b);
  const [cx, cy] = ORBIT_C;
  const sc = 1 - 0.9 * k;
  const dx = (COLLAPSE[0] - cx) * k;
  const dy = (COLLAPSE[1] - cy) * k;
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <defs>
        <linearGradient id="S12-orb" gradientUnits="userSpaceOnUse" x1="0" y1={cy - 450} x2="0" y2={cy + 450}>
          <stop offset="0" stopColor={PB.mint} stopOpacity={0.12} />
          <stop offset="0.5" stopColor={PB.mint} stopOpacity={0.25} />
          <stop offset="1" stopColor={PB.mint2} stopOpacity={0.4} />
        </linearGradient>
        <linearGradient id="S12-orb-dash" gradientUnits="userSpaceOnUse" x1="0" y1={cy - 450} x2="0" y2={cy + 450}>
          <stop offset="0" stopColor={PB.mint} stopOpacity={0.25} />
          <stop offset="1" stopColor={PB.mint2} stopOpacity={0.75} />
        </linearGradient>
      </defs>
      <g opacity={1 - k} transform={`translate(${(cx + dx).toFixed(2)} ${(cy + dy).toFixed(2)}) scale(${sc.toFixed(4)}) translate(${-cx} ${-cy})`}>
        {ORBITS.map((o, i) => (
          <g key={i} transform={`rotate(${o.tilt} ${cx} ${cy})`}>
            <ellipse cx={cx} cy={cy} rx={o.rx} ry={o.ry} fill="none" stroke="url(#S12-orb)" strokeWidth={1.5} pathLength={1} strokeDasharray={`${draw.toFixed(4)} 1`} />
            <ellipse cx={cx} cy={cy} rx={o.rx} ry={o.ry} fill="none" stroke="url(#S12-orb-dash)" strokeWidth={2.4} strokeLinecap="round" pathLength={120} strokeDasharray="0.9 3.1" strokeDashoffset={(-(theta * o.speed) / 3).toFixed(3)} opacity={clamp01((t - b.SIGN) / 0.25)} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Traînées : un arc menthe qui suit chaque gadget sur son ellipse, d'autant plus long que l'orbite s'emballe. */
function Trails({ t, b, side }: { t: number; b: Beats; side: "back" | "front" }) {
  const omega = orbitOmega(t, b);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {GADGETS.map((g, i) => {
        const st = orbitState(t, b, i);
        if (!st || st.front !== (side === "front") || st.s < 0.05) return null;
        const o = ORBITS[g.orbit];
        const span = Math.min(52, Math.max(10, omega * o.speed * 0.07));
        const n = 8;
        const pts = Array.from({ length: n + 1 }, (_, j) => orbitPoint(o, st.deg - (span * j) / n, st.r, st.k));
        return (
          <g key={i} opacity={st.op} style={st.blur > 0.3 ? { filter: `blur(${(st.blur * 0.6).toFixed(2)}px)` } : undefined}>
            {pts.slice(0, -1).map((p, j) => {
              const q = pts[j + 1];
              const f = 1 - j / n;
              return <line key={j} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={j < 2 ? PB.mint2 : PB.mint} strokeWidth={(10 * f * st.s).toFixed(2)} strokeOpacity={(0.42 * f * f).toFixed(3)} strokeLinecap="round" />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

function Orbit({ t, b, side }: { t: number; b: Beats; side: "back" | "front" }) {
  if (t < b.SIGN || t > b.VENTE + 9 * F) return null;
  return (
    <>
      <Trails t={t} b={b} side={side} />
      {GADGETS.map((g, i) => {
        const st = orbitState(t, b, i);
        if (!st || st.front !== (side === "front")) return null;
        const along = (st.dir * 180) / Math.PI;
        const rot = g.kind === "avion" ? along : g.kind === "stylo" ? along + 180 : st.spin;
        return (
          <div key={i} style={{ position: "absolute", left: st.x, top: st.y, width: 0, height: 0, opacity: st.op, filter: st.blur > 0.3 ? `blur(${st.blur.toFixed(2)}px)` : undefined }}>
            <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(-50%, -50%) rotate(${rot.toFixed(2)}deg) scale(${st.s.toFixed(4)})` }}>
              <GadgetArt kind={g.kind} t={t} />
            </div>
          </div>
        );
      })}
    </>
  );
}

const MINT_GLOW = `drop-shadow(0 0 14px ${rgba(PB.mint, 0.75)})`;
const SOFT_SHADOW = "drop-shadow(0 14px 22px rgba(0,0,0,.45))";

function GadgetArt({ kind, t }: { kind: GKind; t: number }) {
  switch (kind) {
    case "chrono": {
      // le chrono de « En une seconde » : son aiguille file (aucun chiffre : pas de durée promise)
      const hand = (t * 540) % 360;
      return (
        <svg width={112} height={124} viewBox="-56 -68 112 124" style={{ display: "block", overflow: "visible", filter: MINT_GLOW }}>
          <rect x={-9} y={-66} width={18} height={12} rx={4} fill={PB.mint2} />
          <rect x={-4} y={-56} width={8} height={8} fill={PB.mint} />
          <path d="M 30 -44 L 38 -52" stroke={PB.mint} strokeWidth={7} strokeLinecap="round" />
          <circle r={46} fill="#0E1A20" stroke={PB.mint} strokeWidth={8} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            const r0 = i % 3 === 0 ? 28 : 33;
            return <line key={i} x1={Math.sin(a) * r0} y1={-Math.cos(a) * r0} x2={Math.sin(a) * 38} y2={-Math.cos(a) * 38} stroke={i % 3 === 0 ? "#FFFFFF" : rgba("#FFFFFF", 0.5)} strokeWidth={i % 3 === 0 ? 3.5 : 2} strokeLinecap="round" />;
          })}
          <path d={`M 0 0 L 0 -38 A 38 38 0 ${hand > 180 ? 1 : 0} 1 ${(Math.sin((hand * Math.PI) / 180) * 38).toFixed(2)} ${(-Math.cos((hand * Math.PI) / 180) * 38).toFixed(2)} Z`} fill={rgba(PB.mint, 0.22)} />
          <line x1={0} y1={0} x2={Math.sin((hand * Math.PI) / 180) * 34} y2={-Math.cos((hand * Math.PI) / 180) * 34} stroke={PB.mint2} strokeWidth={5} strokeLinecap="round" />
          <circle r={6} fill="#FFFFFF" />
        </svg>
      );
    }
    case "vendu":
      return (
        <svg width={164} height={80} viewBox="0 0 164 80" style={{ display: "block", overflow: "visible", filter: MINT_GLOW, transform: "rotate(-8deg)" }}>
          <rect x={3} y={3} width={158} height={74} rx={18} fill="rgba(8,14,18,.9)" stroke={PB.mint} strokeWidth={6} />
          <rect x={11} y={11} width={142} height={58} rx={11} fill="none" stroke={PB.mint} strokeWidth={2} opacity={0.7} />
          <text x={82} y={52} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={33} letterSpacing={-0.5} fill={PB.mint2}>
            VENDU !
          </text>
        </svg>
      );
    case "avion":
      return (
        <svg width={128} height={96} viewBox="0 0 92 70" style={{ display: "block", overflow: "visible", filter: `${SOFT_SHADOW} drop-shadow(0 0 10px ${rgba("#FFFFFF", 0.35)})` }}>
          <path d="M 2 30 L 90 34 L 34 6 Z" fill="#FFFFFF" />
          <path d="M 2 30 L 90 34 L 30 50 Z" fill="#D9E4E9" />
          <path d="M 30 50 L 90 34 L 40 64 Z" fill="#B8C6CE" />
        </svg>
      );
    case "piece": {
      // la pièce du challenge, qui tourne sur elle-même
      const flip = Math.cos(t * 7.5);
      return (
        <div style={{ transform: `scaleX(${(0.25 + 0.75 * Math.abs(flip)).toFixed(3)})` }}>
          <svg width={108} height={108} viewBox="-54 -54 108 108" style={{ display: "block", overflow: "visible", filter: `drop-shadow(0 0 16px ${rgba(PB.gold, 0.7)})` }}>
            <defs>
              <linearGradient id="S12-coin" x1="0" y1="0" x2="0.5" y2="1">
                <stop offset="0" stopColor={PB.goldHi} />
                <stop offset="0.55" stopColor={PB.gold} />
                <stop offset="1" stopColor={PB.goldLo} />
              </linearGradient>
            </defs>
            <circle r={50} fill="url(#S12-coin)" stroke={PB.goldLo} strokeWidth={3} />
            <circle r={39} fill="none" stroke="#FFE7AE" strokeWidth={2.5} opacity={0.7} />
            <text x={0} y={17} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={50} fill="#8A4F00" opacity={0.85}>
              €
            </text>
            <path d="M -30 -30 A 42 42 0 0 1 4 -42" stroke="#FFF6D6" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.75} />
          </svg>
        </div>
      );
    }
    case "loupe":
      return (
        <svg width={128} height={128} viewBox="0 0 128 128" style={{ display: "block", overflow: "visible", filter: MINT_GLOW }}>
          <path d="M 80 80 L 118 118" stroke="#E9F2F5" strokeWidth={16} strokeLinecap="round" />
          <path d="M 80 80 L 92 92" stroke={PB.mint} strokeWidth={18} strokeLinecap="butt" />
          <circle cx={52} cy={52} r={40} fill={rgba(PB.mint, 0.16)} stroke={PB.mint} strokeWidth={10} />
          <path d="M 30 40 A 26 26 0 0 1 48 26" stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" fill="none" opacity={0.85} />
        </svg>
      );
    case "cadenas":
      return (
        <svg width={100} height={118} viewBox="0 0 76 90" style={{ display: "block", overflow: "visible", filter: MINT_GLOW }}>
          <path d="M 20 42 V 28 A 18 18 0 0 1 56 28 V 42" stroke={PB.mint} strokeWidth={8} fill="none" strokeLinecap="round" />
          <rect x={8} y={38} width={60} height={48} rx={11} fill={PB.mint} />
          <rect x={13} y={42} width={50} height={4} rx={2} fill="#FFFFFF" opacity={0.5} />
          <circle cx={38} cy={58} r={6.5} fill={INK} />
          <rect x={35} y={60} width={6} height={13} rx={3} fill={INK} />
        </svg>
      );
    case "stylo":
      // le stylo-laser du robot, pointe allumée
      return (
        <svg width={152} height={40} viewBox="-76 -20 152 40" style={{ display: "block", overflow: "visible", filter: `${SOFT_SHADOW} drop-shadow(0 0 10px ${rgba(PB.mint, 0.45)})` }}>
          <rect x={-64} y={-10} width={108} height={20} rx={10} fill="#F4F8FA" stroke="#B8C6CE" strokeWidth={1.2} />
          <rect x={-64} y={-10} width={26} height={20} rx={10} fill={PB.mint} />
          <rect x={20} y={-10} width={7} height={20} fill={PB.mint} />
          <path d="M 44 -9 L 64 -2.5 L 64 2.5 L 44 9 Z" fill="#16242C" />
          <circle cx={67} cy={0} r={6} fill={PB.mint2} style={{ filter: `drop-shadow(0 0 8px ${PB.mint2})` }} />
          <rect x={-56} y={-7} width={84} height={3.2} rx={1.6} fill="#FFFFFF" opacity={0.9} />
        </svg>
      );
    case "etoile":
      return (
        <svg width={112} height={112} viewBox="0 0 86 86" style={{ display: "block", overflow: "visible", filter: `drop-shadow(0 0 16px ${rgba(PB.gold, 0.75)})` }}>
          <defs>
            <linearGradient id="S12-gold" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor={PB.goldHi} />
              <stop offset="0.55" stopColor={PB.gold} />
              <stop offset="1" stopColor={PB.goldLo} />
            </linearGradient>
          </defs>
          <path d="M 43 4 L 54 30 L 82 32 L 60 50 L 67 78 L 43 63 L 19 78 L 26 50 L 4 32 L 32 30 Z" fill="url(#S12-gold)" stroke={PB.goldLo} strokeWidth={2} strokeLinejoin="round" />
          <path d="M 43 14 L 50 32" stroke="#FFF6D6" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
        </svg>
      );
  }
}

/** L'éclair menthe de l'effondrement, sous « chaque vente ». */
function CollapseFlash({ t, b }: { t: number; b: Beats }) {
  if (t < b.flash - F || t > b.flash + 0.7) return null;
  const k = prog(t, b.flash, 6 * F, SNAP);
  const r = 300 * k;
  const a = 1 - prog(t, b.flash + 4 * F, 14 * F, LINEAR);
  const [x, y] = COLLAPSE;
  return (
    <>
      <div style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: `radial-gradient(circle, ${rgba("#FFFFFF", 0.95 * a)} 0%, ${rgba(PB.mint2, 0.6 * a)} 30%, ${rgba(PB.mint, 0.18 * a)} 60%, transparent 72%)` }} />
      <Ring t={t} at={b.flash} x={x} y={y} max={560} color={PB.mint2} width={4} life={0.5} />
      <Sparks t={t} at={b.flash} x={x} y={y} count={22} seed="S12-flash" speed={1200} spread={180} len={28} life={0.5} color={PB.mint2} />
    </>
  );
}

// ---- Les couloirs de mini-bannières ----------------------------------------------------------------------------------

const LANE_ITEMS: [string, string][] = [
  ["Doxycycline 100 mg", "1 conseil"],
  ["Ultra-Levure", "✓ Vendu"],
  ["Crème SPF 50", "1 conseil"],
  ["Spray nasal", "✓ Vendu"],
  ["Amoxicilline 1 g", "1 conseil"],
  ["Probiotique", "✓ Vendu"],
  ["Paracétamol 1 g", "1 conseil"],
];
/**
 * Deux rangées sous la plaque (haut ≥ 960), en sens opposés : la lointaine (×0,74, floue, 80 px/s vers la droite) et la
 * proche (×1, 120 px/s vers la gauche). Un masque les fond vers le bas au lieu de les couper au bord du cadre.
 */
const LANES = [
  { y: 985, speed: 80, scale: 0.74, blur: 2.6, alpha: 0.38, depth: 0.55, seed: 0 },
  { y: 1046, speed: -120, scale: 1, blur: 0.8, alpha: 0.45, depth: 0.9, seed: 3 },
];
const LANE_STEP = 430;
const LANE_MASK = "linear-gradient(to bottom, transparent 0px, black 14px, black 88px, transparent 136px)";
const LANE_TOP = 950;

function Capsule({ item }: { item: [string, string] }) {
  const sold = item[1].startsWith("✓");
  return (
    <div style={{ width: 360, height: 64, borderRadius: 32, background: "#0E161D", border: `1.5px solid ${rgba(PB.mint, 0.45)}`, display: "flex", alignItems: "center", gap: 10, padding: "0 12px", boxSizing: "border-box", boxShadow: `0 0 18px ${rgba(PB.mint, 0.12)}` }}>
      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#13232B", border: `1.5px solid ${rgba(PB.mint, 0.6)}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0 }}>
        <div style={{ width: 6, height: 9, borderRadius: 3, background: PB.mint }} />
        <div style={{ width: 6, height: 9, borderRadius: 3, background: PB.mint }} />
      </div>
      <div style={{ flex: 1, fontFamily: JAKARTA, fontWeight: 600, fontSize: 20, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "clip" }}>{item[0]}</div>
      <div style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 999, background: sold ? PB.mint : rgba(PB.mint, 0.18), color: sold ? INK : PB.mint2, fontFamily: JAKARTA, fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>{item[1]}</div>
    </div>
  );
}

function Lane({ t, b, lane }: { t: number; b: Beats; lane: (typeof LANES)[number] }) {
  if (t < b.VENTE) return null;
  const appear = prog(t, b.VENTE, 0.45, SNAP);
  const step = LANE_STEP * lane.scale;
  const n = Math.ceil(2900 / step);
  const span = step * n;
  const travel = lane.speed * (t - b.VENTE) - Math.sign(lane.speed) * 200 * (1 - appear);
  const h = 64 * lane.scale;
  return (
    <div style={{ position: "absolute", left: 0, top: LANE_TOP, width: 1920, height: 130, WebkitMaskImage: LANE_MASK, maskImage: LANE_MASK }}>
      <div style={{ position: "absolute", left: 0, top: lane.y - h / 2 - LANE_TOP, width: 1920, height: h, opacity: lane.alpha * appear, filter: lane.blur > 0 ? `blur(${lane.blur}px)` : undefined }}>
        {Array.from({ length: n }, (_, i) => {
          const x = ((((i * step + lane.seed * 97 + travel) % span) + span) % span) - 500;
          return (
            <div key={i} style={{ position: "absolute", left: x, top: 0, transformOrigin: "0 0", transform: `scale(${lane.scale})` }}>
              <Capsule item={LANE_ITEMS[(i + lane.seed) % LANE_ITEMS.length]} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Le robot, son socle et son stylo-laser ------------------------------------------------------------------------

/** Le robot au tiers droit, ×1,2 (360 → 432 px), le socle sur la ligne du bas de la pilule. */
const RS = 432;
const RH = RS * 0.92;
/** 1650 : 80 px d'air entre le « t » du logo (×0,76) et l'oreille du robot, 80 px jusqu'au bord droit. */
const ROBOT_X = 1650;
const ROBOT_FEET = 766;
/** viewBox du Mascot (0 −4 100 92) → px. */
const VB = RS / 100;

function robotPose(t: number, b: Beats) {
  if (t < b.robotIn) return null;
  const D = b.robotLand - b.robotIn;
  const u = clamp01((t - b.robotIn) / D);
  const x = lerp(2180, ROBOT_X, 1 - Math.pow(1 - u, 2.2));
  const hop = u < 1 ? -230 * 4 * u * (1 - u) : 0;
  const fl = u < 1 ? flight(0.8 * Math.abs(1 - 2 * u)) : { sx: 1, sy: 1 };
  const sq = squash(t, b.robotLand, 6 * F);
  // le saut du coup final de la musique (ample : 88 px)
  const fu = clamp01((t - b.final) / 0.44);
  const fhop = fu > 0 && fu < 1 ? -88 * 4 * fu * (1 - fu) : 0;
  const fsq = squash(t, b.final + 0.44, 6 * F);
  const breath = 1 + 0.008 * Math.sin((t - b.robotLand) * 2.4);
  return { x, feet: ROBOT_FEET + hop + fhop, sx: fl.sx * sq.sx * (1 + (fsq.sx - 1) * 0.6), sy: fl.sy * sq.sy * (1 + (fsq.sy - 1) * 0.6) * breath, rot: u < 1 ? -14 * (1 - u) : 0, landed: u >= 1 };
}

function Pedestal({ t, b }: { t: number; b: Beats }) {
  if (t < b.robotLand - 0.08) return null;
  const k = prog(t, b.robotLand - 0.08, 14 * F, POP);
  const hit = pulse(t, b.robotLand, 2 * F, 0, 0.5);
  const w = 400 * k;
  return (
    <>
      <div style={{ position: "absolute", left: ROBOT_X - w * 0.75, top: ROBOT_FEET - 40, width: w * 1.5, height: 80, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(PB.mint, 0.32 + 0.3 * hit)}, transparent)` }} />
      <div style={{ position: "absolute", left: ROBOT_X - w / 2, top: ROBOT_FEET - 16, width: w, height: 32, borderRadius: "50%", border: `2px solid ${rgba(PB.mint2, 0.55 + 0.4 * hit)}`, boxShadow: `0 0 18px ${rgba(PB.mint, 0.45)}` }} />
      {hit > 0 && <Ring t={t} at={b.robotLand} x={ROBOT_X} y={ROBOT_FEET} max={520} color={PB.mint2} width={3} life={0.5} echo={false} />}
    </>
  );
}

function Robot({ t, b, track }: { t: number; b: Beats; track: Track }) {
  const p = robotPose(t, b);
  if (!p) return null;
  const mask = "linear-gradient(to bottom, black 86%, transparent 100%)";
  return (
    <div
      style={{
        position: "absolute",
        left: p.x - RS / 2,
        top: p.feet - RH,
        width: RS,
        height: RH,
        transformOrigin: `${RS / 2}px ${RH}px`,
        transform: `rotate(${p.rot.toFixed(2)}deg) scale(${p.sx.toFixed(4)}, ${p.sy.toFixed(4)})`,
        // pas d'ombre en vol : sous le flou de mouvement, une ombre pâle se crénelle en rectangle
        filter: p.landed ? `drop-shadow(0 24px 30px rgba(0,0,0,.45)) drop-shadow(0 0 26px ${rgba(PB.mint, 0.2)})` : undefined,
      }}
    >
      <div style={{ width: RS, height: RH, WebkitMaskImage: mask, maskImage: mask }}>
        <Mascot track={track} t={t} size={RS} look={null} />
      </div>
    </div>
  );
}

function robotTrack(b: Beats): Track {
  return {
    id: `S12-robot-${b.robotIn.toFixed(3)}-${b.write.toFixed(3)}-${b.p19end.toFixed(3)}-${b.end.toFixed(3)}`,
    seed: 1212,
    until: b.end + 0.2,
    events: [
      { t: b.robotIn, kind: "burst", burst: "jump" },
      { t: b.robotLand, kind: "squash" },
      { t: b.robotLand + 0.06, kind: "glance", x: -0.9, y: 0.25, dur: b.writeEnd - b.robotLand + 0.04 },
      { t: b.write + 0.55, kind: "blink" },
      { t: b.writeEnd + 0.12, kind: "glance", x: -0.6, y: -0.85, dur: 0.38 },
      { t: b.wink, kind: "emote", emote: "wink", dur: 0.55 },
      { t: b.wave, kind: "burst", burst: "wave" },
      { t: b.wave + 1.0, kind: "blink" },
      { t: b.final - 0.35, kind: "glance", x: 0.15, y: -0.2, dur: 0.25 },
      { t: b.final, kind: "burst", burst: "jump" },
      { t: b.final + 0.85, kind: "blink" },
    ],
  };
}

// ---- L'écriture à la main : un tracé cursif d'un seul geste ------------------------------------------------------------

type HP = [number, number] | [number, number, 1];
/** Lettres cursives en unités de hauteur d'x (ligne de base 0, y vers le bas) ; [x, y, 1] = point de rebroussement. */
const HAND: Record<string, { w: number; pts: HP[] }> = {
  p: { w: 1.0, pts: [[0.28, -1.0, 1], [0.22, 0.2], [0.16, 1.0, 1], [0.22, 0.15], [0.36, -0.58], [0.62, -1.0], [0.92, -0.72], [0.88, -0.18], [0.58, 0.02], [0.3, -0.14, 1], [0.64, -0.06], [1.0, -0.3]] },
  h: { w: 1.0, pts: [[0.12, -0.6], [0.42, -1.72], [0.36, -2.16], [0.2, -1.96], [0.14, -1.0], [0.1, 0, 1], [0.2, -0.62], [0.46, -0.98], [0.72, -0.82], [0.7, -0.25], [0.8, 0], [1.0, -0.3]] },
  a: { w: 1.0, pts: [[0.7, -0.92], [0.4, -1.0], [0.1, -0.7], [0.08, -0.22], [0.32, 0.02], [0.62, -0.3], [0.76, -1.0, 1], [0.7, -0.35], [0.78, 0], [1.0, -0.3]] },
  r: { w: 0.72, pts: [[0.1, -1.0, 1], [0.1, 0, 1], [0.16, -0.6], [0.34, -0.96], [0.58, -0.98], [0.7, -0.86]] },
  m: { w: 1.35, pts: [[0.14, -1.0, 1], [0.12, 0, 1], [0.22, -0.65], [0.4, -0.98], [0.58, -0.75], [0.58, 0, 1], [0.66, -0.65], [0.86, -0.98], [1.04, -0.75], [1.02, -0.2], [1.12, 0], [1.35, -0.3]] },
  b: { w: 1.0, pts: [[0.12, -0.6], [0.42, -1.72], [0.36, -2.16], [0.2, -1.96], [0.14, -1.0], [0.12, -0.2], [0.34, 0.02], [0.68, -0.3], [0.7, -0.8], [0.5, -0.98], [0.44, -0.74], [0.7, -0.72], [1.0, -0.8]] },
  o: { w: 0.95, pts: [[0.62, -0.98], [0.3, -0.92], [0.08, -0.5], [0.26, 0.02], [0.6, -0.22], [0.7, -0.7], [0.56, -0.98], [0.58, -0.8], [0.95, -0.82]] },
  s: { w: 0.75, pts: [[0.28, -1.02, 1], [0.52, -0.62], [0.58, -0.22], [0.36, 0.02], [0.1, -0.1, 1], [0.4, -0.06], [0.75, -0.3]] },
  t: { w: 0.7, pts: [[0.32, -1.65, 1], [0.22, -0.3], [0.34, 0.02], [0.7, -0.3]] },
};
const HAND_W = 620;
const HAND_CX = 960;
const HAND_BASE = 742;
const SLANT = 0.22;

type Pt = { x: number; y: number; c: boolean };

function spline(pts: Pt[]) {
  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = p1.c ? p1 : { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = p2.c ? p2 : { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

type HandGeo = { subs: { d: string; len: number; from: number }[]; total: number };
let HAND_GEO: HandGeo | null = null;

function handGeo(): HandGeo {
  if (HAND_GEO) return HAND_GEO;
  const strokes: [number, number, boolean][][] = [];
  const starts: number[] = [];
  let x = 0;
  const word = (letters: string, lead: [number, number] | null, tail: [number, number] | null) => {
    const s: [number, number, boolean][] = [];
    if (lead) s.push([x + lead[0], lead[1], false]);
    for (const ch of letters) {
      const L = HAND[ch];
      starts.push(x);
      for (const p of L.pts) s.push([x + p[0], p[1], p.length === 3]);
      x += L.w + 0.04;
    }
    if (tail) s.push([x - 0.04 + tail[0], tail[1], false]);
    strokes.push(s);
  };
  word("pharmaboost", [-0.22, 0.06], null);
  const xt = starts[10];
  const cross: [number, number, boolean][] = [
    [xt - 0.02, -1.12, false],
    [xt + 0.3, -1.2, false],
    [xt + 0.66, -1.18, false],
  ];
  const dotX = x + 0.1;
  const dot: [number, number, boolean][] = [
    [dotX + 0.07, -0.06, false],
    [dotX, -0.13, false],
    [dotX - 0.07, -0.06, false],
    [dotX, 0.01, false],
    [dotX + 0.07, -0.06, false],
  ];
  x = dotX + 0.24;
  word("app", null, [0.4, -0.62]);
  const app = strokes.pop()!;
  const ordered = [strokes[0], cross, dot, app];
  // pente, puis mise à l'échelle sur 620 px de large
  const slanted = ordered.map((s) => s.map(([px, py, c]) => ({ x: px - py * SLANT, y: py, c })));
  const all = slanted.flat();
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const S = HAND_W / (maxX - minX);
  const px = (p: { x: number; y: number; c: boolean }): Pt => ({ x: HAND_CX - HAND_W / 2 + (p.x - minX) * S, y: HAND_BASE + p.y * S, c: p.c });
  const subs: HandGeo["subs"] = [];
  let acc = 0;
  for (const s of slanted) {
    const d = spline(s.map(px));
    const len = getLength(d);
    subs.push({ d, len, from: acc });
    acc += len;
  }
  HAND_GEO = { subs, total: acc };
  return HAND_GEO;
}

/** L'avancement de l'écriture (0 → 1), un peu lent au départ et à l'arrivée, comme une main. */
function writeK(t: number, b: Beats) {
  const u = clamp01((t - b.write) / (b.writeEnd - b.write));
  return lerp(u, IN_OUT(u), 0.35);
}

function handPoint(k: number) {
  const g = handGeo();
  const L = clamp01(k) * g.total;
  let sub = g.subs[g.subs.length - 1];
  for (const s of g.subs) {
    if (L <= s.from + s.len) {
      sub = s;
      break;
    }
  }
  const p = getPointAtLength(sub.d, Math.max(0, Math.min(sub.len, L - sub.from)));
  return { x: p?.x ?? HAND_CX, y: p?.y ?? HAND_BASE };
}

/** L'écriture s'efface par un balayage de gauche à droite (pill → wipeEnd), avec un liseré lumineux au front. */
function wipeX(t: number, b: Beats) {
  const w = prog(t, b.pill, b.wipeEnd - b.pill, IN_OUT);
  return { w, x: lerp(HAND_CX - HAND_W / 2 - 60, HAND_CX + HAND_W / 2 + 60, w) };
}

function Handwriting({ t, b }: { t: number; b: Beats }) {
  if (t < b.write || t >= b.wipeEnd) return null;
  const g = handGeo();
  const L = writeK(t, b) * g.total;
  const wp = wipeX(t, b);
  const mask = wp.w > 0 ? `linear-gradient(90deg, transparent ${(wp.x - 10).toFixed(1)}px, black ${(wp.x + 40).toFixed(1)}px)` : undefined;
  return (
    <>
    {wp.w > 0 && <div style={{ position: "absolute", left: wp.x - 3, top: HAND_BASE - 130, width: 6, height: 200, borderRadius: 3, background: `linear-gradient(to bottom, transparent, ${PB.mint2}, transparent)`, boxShadow: `0 0 18px ${rgba(PB.mint, 0.9)}`, opacity: Math.min(1, 6 * (1 - wp.w)) }} />}
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", WebkitMaskImage: mask, maskImage: mask }}>
      {g.subs.map((s, i) => {
        const shown = Math.max(0, Math.min(s.len, L - s.from));
        if (shown <= 0) return null;
        const dash = { strokeDasharray: `${s.len} ${s.len}`, strokeDashoffset: s.len - shown };
        return (
          <g key={i}>
            <path d={s.d} fill="none" stroke={PB.mint} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} style={{ filter: "blur(4px)" }} {...dash} />
            <path d={s.d} fill="none" stroke="#EFFFFB" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" {...dash} />
          </g>
        );
      })}
    </svg>
    </>
  );
}

/** Les braises qui tombent de la tête d'écriture. */
function Embers({ t, b }: { t: number; b: Beats }) {
  if (t < b.write || t > b.writeEnd + 0.5) return null;
  const step = 0.025;
  const n0 = Math.floor(t / step);
  const out: ReactNode[] = [];
  for (let j = 0; j < 20; j++) {
    const n = n0 - j;
    const te = n * step;
    if (te < b.write || te > b.writeEnd) continue;
    const u = t - te;
    const life = 0.45;
    if (u > life) continue;
    const h = handPoint(writeK(te, b));
    const vx = (hash("S12-emb", n) - 0.5) * 260;
    const vy = -120 - 180 * hash("S12-emb-y", n);
    const x = h.x + vx * u;
    const y = h.y + vy * u + 0.5 * 900 * u * u;
    const s = 4 * (1 - u / life) + 1;
    out.push(<div key={n} style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s, borderRadius: "50%", background: n % 3 === 0 ? "#FFFFFF" : PB.mint2, opacity: 1 - u / life, boxShadow: `0 0 6px ${PB.mint2}` }} />);
  }
  return <>{out}</>;
}

/** Le stylo-laser : il sort de la main du robot, vise la tête d'écriture, tire, puis y retourne. */
function penState(t: number, b: Beats) {
  if (t < b.penOut || t > b.penBack + 0.3) return null;
  const hand = { x: ROBOT_X + (39 - 50) * VB, y: ROBOT_FEET - RH + (79 + 4) * VB };
  const hover = { x: 1352 + wobble(t, 3, 5, 1.4), y: 826 + wobble(t, 7, 6, 1.2) };
  const kOut = prog(t, b.penOut, 0.24, SNAP);
  const kBack = prog(t, b.penBack, 0.26, IN_OUT);
  const arcOut = -70 * Math.sin(Math.PI * kOut);
  const arcBack = -50 * Math.sin(Math.PI * kBack);
  const x = lerp(lerp(hand.x, hover.x, kOut), hand.x, kBack);
  const y = lerp(lerp(hand.y, hover.y, kOut), hand.y, kBack) + arcOut + arcBack;
  const aiming = t >= b.write - 0.06 && t <= b.writeEnd + 0.04;
  let ang = -90 + 360 * kOut; // une pirouette en sortant
  if (t >= b.write - 0.1) {
    const h = handPoint(writeK(Math.max(t, b.write), b));
    const aim = (Math.atan2(h.y - y, h.x - x) * 180) / Math.PI;
    const k = prog(t, b.write - 0.1, 0.1, SNAP) * (1 - kBack);
    ang = lerp(270, aim < 0 ? aim + 360 : aim, k);
    ang = lerp(ang, 270 - 360, kBack);
  }
  const sc = prog(t, b.penOut, 0.12, POP) * (1 - kBack * 0.7);
  return { x, y, ang, sc, op: 1 - prog(t, b.penBack + 0.2, 0.1, LINEAR), aiming };
}

function Pen({ t, b }: { t: number; b: Beats }) {
  const p = penState(t, b);
  if (!p) return null;
  const rad = (p.ang * Math.PI) / 180;
  const tip = { x: p.x + Math.cos(rad) * 50 * p.sc, y: p.y + Math.sin(rad) * 50 * p.sc };
  const beamOn = p.aiming ? Math.min(prog(t, b.write, 3 * F, LINEAR), 1 - prog(t, b.writeEnd, 3 * F, LINEAR)) : 0;
  const head = beamOn > 0 ? handPoint(writeK(t, b)) : null;
  const flick = 0.85 + 0.15 * noise2D("S12-laser", t * 30, 0);
  return (
    <>
      {head && (
        <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <line x1={tip.x} y1={tip.y} x2={head.x} y2={head.y} stroke={PB.mint} strokeWidth={14} strokeLinecap="round" opacity={0.35 * beamOn * flick} style={{ filter: "blur(6px)" }} />
          <line x1={tip.x} y1={tip.y} x2={head.x} y2={head.y} stroke={PB.mint2} strokeWidth={3} strokeLinecap="round" opacity={beamOn * flick} />
          <line x1={tip.x} y1={tip.y} x2={head.x} y2={head.y} stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.8 * beamOn} />
          <circle cx={head.x} cy={head.y} r={16} fill={PB.mint} opacity={0.35 * beamOn} style={{ filter: "blur(6px)" }} />
          <circle cx={head.x} cy={head.y} r={5} fill="#FFFFFF" opacity={beamOn} />
        </svg>
      )}
      <div style={{ position: "absolute", left: p.x, top: p.y, width: 0, height: 0, opacity: p.op, transform: `rotate(${p.ang.toFixed(2)}deg) scale(${p.sc.toFixed(4)})` }}>
        <div style={{ position: "absolute", left: -60, top: -40, width: 120, height: 80, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(PB.mint, 0.22)}, transparent)` }} />
        <svg width={110} height={24} viewBox="-55 -12 110 24" style={{ position: "absolute", left: -55, top: -12, overflow: "visible", filter: "drop-shadow(0 8px 10px rgba(0,0,0,.45))" }}>
          <rect x={-46} y={-7} width={78} height={14} rx={7} fill="#F4F8FA" stroke="#B8C6CE" strokeWidth={1} />
          <rect x={-46} y={-7} width={18} height={14} rx={7} fill={PB.mint} />
          <rect x={14} y={-7} width={5} height={14} fill={PB.mint} />
          <path d="M 32 -6 L 46 -1.5 L 46 1.5 L 32 6 Z" fill="#16242C" />
          <circle cx={48} cy={0} r={3.5} fill={PB.mint2} opacity={0.6 + 0.4 * beamOn} style={{ filter: `drop-shadow(0 0 6px ${PB.mint2})` }} />
          <rect x={-40} y={-5} width={60} height={2.4} rx={1.2} fill="#FFFFFF" opacity={0.9} />
        </svg>
      </div>
    </>
  );
}

// ---- La pilule de l'adresse ------------------------------------------------------------------------------------------

/** La pilule, centrée à x = 960 sous le slogan. */
const PILL = { x: 680, y: 672, w: 560, h: 96 };
const PILL_CX = PILL.x + PILL.w / 2;
const PILL_CY = PILL.y + PILL.h / 2;
const PILL_R = PILL.h / 2;
const PILL_HALF_R = `M ${PILL_CX} ${PILL.y} H ${PILL.x + PILL.w - PILL_R} A ${PILL_R} ${PILL_R} 0 0 1 ${PILL.x + PILL.w - PILL_R} ${PILL.y + PILL.h} H ${PILL_CX}`;
const PILL_HALF_L = `M ${PILL_CX} ${PILL.y} H ${PILL.x + PILL_R} A ${PILL_R} ${PILL_R} 0 0 0 ${PILL.x + PILL_R} ${PILL.y + PILL.h} H ${PILL_CX}`;
/** « boost » dans l'adresse (Jakarta 700, 56 px : l'adresse = 491,4 px, « pharma » ≈ 211 px, « boost » ≈ 154 px). */
const URL_X0 = PILL_CX - 491.4 / 2;
const BOOST: [number, number] = [URL_X0 + 209, URL_X0 + 366];

const URL_TEXT: CSSProperties = {
  position: "absolute",
  left: PILL.x,
  top: PILL.y,
  width: PILL.w,
  height: PILL.h,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: JAKARTA,
  fontWeight: 700,
  fontSize: 56,
  lineHeight: 1,
  letterSpacing: "-0.01em",
  whiteSpace: "pre",
};

function Pill({ t, b }: { t: number; b: Beats }) {
  if (t < b.pill) return null;
  // le texte n'arrive qu'une fois l'écriture effacée (3 images après la fin du balayage)
  const kIn = prog(t, b.pillText, 8 * F, LINEAR);
  const kB = prog(t, b.pill, 18 * F, IN_OUT);
  const kF = prog(t, b.fill, 8 * F, SNAP);
  const bump = 1 + 0.06 * pulse(t, b.fill, 4 * F, 0, 12 * F);
  const evR = evolvePath(kB, PILL_HALF_R);
  const evL = evolvePath(kB, PILL_HALF_L);
  const headR = kB < 1 ? getPointAtLength(PILL_HALF_R, getLength(PILL_HALF_R) * kB) : null;
  const headL = kB < 1 ? getPointAtLength(PILL_HALF_L, getLength(PILL_HALF_L) * kB) : null;
  // tenue vivante : un reflet traverse la pilule toutes les 0,8 s, après celui de « boost »
  const r0 = b.glint + 0.6;
  const cyc = t > r0 ? ((t - r0) % 0.8) / 0.45 : 2;
  const rx = lerp(-160, PILL.w + 160, cyc);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: `${PILL_CX}px ${PILL_CY}px`, transform: `scale(${bump.toFixed(4)})` }}>
      <div style={{ position: "absolute", left: PILL.x, top: PILL.y, width: PILL.w, height: PILL.h, borderRadius: PILL_R, overflow: "hidden", background: rgba(PB.mint, kF), boxShadow: kF > 0 ? `0 0 ${30 * kF}px ${rgba(PB.mint, 0.5 * kF)}, 0 20px 50px rgba(0,0,0,${0.4 * kF})` : undefined }}>
        {cyc <= 1 && <div style={{ position: "absolute", left: rx - 70, top: -20, width: 140, height: PILL.h + 40, transform: "skewX(-20deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)" }} />}
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {[PILL_HALF_R, PILL_HALF_L].map((d, i) => {
          const ev = i === 0 ? evR : evL;
          return <path key={i} d={d} fill="none" stroke={PB.mint} strokeWidth={2.5} strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} style={{ filter: `drop-shadow(0 0 6px ${rgba(PB.mint, 0.9)})` }} />;
        })}
        {[headR, headL].map((h, i) => (h ? <circle key={i} cx={h.x} cy={h.y} r={5} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 8px ${PB.mint2})` }} /> : null))}
      </svg>
      {kIn > 0 && (
        <div style={{ ...URL_TEXT, color: mixHex("#FFFFFF", INK, kF), opacity: kIn, filter: kIn < 1 ? `blur(${(6 * (1 - kIn)).toFixed(2)}px)` : undefined }}>
          <span style={{ transform: "translateY(-7px)" }}>pharmaboost.app</span>
        </div>
      )}
      <BoostGlint t={t} b={b} />
    </div>
  );
}

/** Le reflet sur « boost » (0,4 s après le remplissage) : il ne touche ni « pharma » ni le point de « .app ». */
function BoostGlint({ t, b }: { t: number; b: Beats }) {
  const u = (t - b.glint) / 0.42;
  if (u <= 0 || u >= 1) return null;
  const x = lerp(BOOST[0] - 40, BOOST[1] + 40, IN_OUT(u));
  const a = Math.min(1, 5 * u, 5 * (1 - u));
  const left = BOOST[0] - 4;
  const width = BOOST[1] - BOOST[0] + 8;
  const band = (cx: number) => `linear-gradient(105deg, transparent ${cx - 46}px, black ${cx - 6}px, black ${cx + 6}px, transparent ${cx + 46}px)`;
  return (
    <div style={{ position: "absolute", left, top: PILL.y, width, height: PILL.h, overflow: "hidden", opacity: a }}>
      {/* la lumière sur la pilule, derrière les lettres */}
      <div style={{ position: "absolute", left: x - left - 34, top: -10, width: 68, height: PILL.h + 20, transform: "skewX(-18deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.7), transparent)" }} />
      {/* et les lettres de « boost » qui s'allument au passage */}
      <div style={{ ...URL_TEXT, left: PILL.x - left, top: 0, color: "#FFFFFF", WebkitMaskImage: band(x - left), maskImage: band(x - left), filter: `drop-shadow(0 0 8px ${rgba("#FFFFFF", 0.8)})` }}>
        <span style={{ transform: "translateY(-7px)" }}>pharmaboost.app</span>
      </div>
    </div>
  );
}

// ---- La croix néon (celle du début, rallumée en menthe) ---------------------------------------------------------------

const CROSS_C: [number, number] = [960, 190];

/** La croix d'un seul contour (barres L × W, coins arrondis r) : le tube néon éteint n'a pas de traits intérieurs. */
function plusPath(cx: number, cy: number, L: number, W: number, r: number) {
  const a = L / 2;
  const w = W / 2;
  return [
    `M ${cx - w + r} ${cy - a} H ${cx + w - r} A ${r} ${r} 0 0 1 ${cx + w} ${cy - a + r} V ${cy - w}`,
    `H ${cx + a - r} A ${r} ${r} 0 0 1 ${cx + a} ${cy - w + r} V ${cy + w - r} A ${r} ${r} 0 0 1 ${cx + a - r} ${cy + w} H ${cx + w}`,
    `V ${cy + a - r} A ${r} ${r} 0 0 1 ${cx + w - r} ${cy + a} H ${cx - w + r} A ${r} ${r} 0 0 1 ${cx - w} ${cy + a - r} V ${cy + w}`,
    `H ${cx - a + r} A ${r} ${r} 0 0 1 ${cx - a} ${cy + w - r} V ${cy - w + r} A ${r} ${r} 0 0 1 ${cx - a + r} ${cy - w} H ${cx - w}`,
    `V ${cy - a + r} A ${r} ${r} 0 0 1 ${cx - w + r} ${cy - a} Z`,
  ].join(" ");
}

function CrossShape({ fill }: { fill: string }) {
  const [cx, cy] = CROSS_C;
  return (
    <>
      <rect x={cx - 60} y={cy - 20} width={120} height={40} rx={8} fill={fill} />
      <rect x={cx - 20} y={cy - 60} width={40} height={120} rx={8} fill={fill} />
    </>
  );
}

function Cross({ t, b }: { t: number; b: Beats }) {
  if (t < b.settle) return null;
  const tube = prog(t, b.settle + 0.1, 0.5, SNAP);
  const core = prog(t, b.cross, 4 * F, LINEAR) * (1 - prog(t, b.end - 12 * F, 9 * F, LINEAR));
  const halo = prog(t, b.cross, 10 * F, SNAP) * (1 - prog(t, b.end - 12 * F, 12 * F, EXIT));
  const tubeFade = 1 - prog(t, b.end - 12 * F, 8 * F, LINEAR);
  // le halo RESPIRE (±15 %) pendant la tenue
  const breathe = 1 + 0.15 * Math.sin(((t - b.cross) * 2 * Math.PI) / 1.5);
  const [cx, cy] = CROSS_C;
  const h = halo * breathe;
  // éteinte : un tube de verre (contour 2 px, reflet intérieur 1 px), pas une forme pleine
  const off = tube * tubeFade * (1 - clamp01(core * 1.5));
  return (
    <>
      <div style={{ position: "absolute", left: cx - 420, top: cy - 420, width: 840, height: 840, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(PB.mint, 0.2 * h)} 0%, ${rgba(PB.mint, 0.06 * h)} 40%, transparent 70%)` }} />
      <div style={{ position: "absolute", left: cx - 640, top: cy - 1, width: 1280, height: 2, background: `linear-gradient(90deg, transparent, ${rgba(PB.mint2, 0.5 * h)} 50%, transparent)` }} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="S12-neon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#B8FFF2" />
            <stop offset="0.55" stopColor={PB.mint2} />
            <stop offset="1" stopColor={PB.mint} />
          </linearGradient>
        </defs>
        {off > 0.01 && (
          <g opacity={off}>
            <path d={plusPath(cx, cy, 120, 40, 8)} fill="none" stroke="rgba(201,209,218,.25)" strokeWidth={2} />
            <path d={plusPath(cx, cy, 113, 33, 5)} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth={1} />
            <path d={`M ${cx - 52} ${cy - 15} H ${cx - 22} M ${cx - 15} ${cy - 52} V ${cy - 24}`} stroke="rgba(255,255,255,.28)" strokeWidth={1} strokeLinecap="round" />
          </g>
        )}
        <g opacity={Math.min(1, h)} style={{ filter: `drop-shadow(0 0 ${(30 * breathe).toFixed(1)}px ${rgba(PB.mint, 0.85)}) drop-shadow(0 0 ${(80 * breathe).toFixed(1)}px ${rgba(PB.mint, 0.55)})` }}>
          <CrossShape fill={PB.mint} />
        </g>
        <g opacity={core}>
          <CrossShape fill="url(#S12-neon)" />
          <rect x={cx - 54} y={cy - 15} width={108} height={4} rx={2} fill="#FFFFFF" opacity={0.6} />
          <rect x={cx - 15} y={cy - 54} width={4} height={108} rx={2} fill="#FFFFFF" opacity={0.45} />
        </g>
        {/* deux éclats d'étoile sur les coins de la croix (avec sparkle_shimmer, fin − 0,9), puis le halo s'éteint */}
        <Twinkle t={t} at={b.end - 0.9} x={cx + 22} y={cy - 22} r={46} />
        <Twinkle t={t} at={b.end - 0.68} x={cx - 21} y={cy + 23} r={30} />
      </svg>
    </>
  );
}

/** Un éclat d'étoile à quatre branches : il grandit en tournant puis se referme (0,45 s). */
function Twinkle({ t, at, x, y, r }: { t: number; at: number; x: number; y: number; r: number }) {
  const u = (t - at) / 0.45;
  if (u <= 0 || u >= 1) return null;
  const s = Math.sin(Math.PI * Math.pow(u, 0.7));
  const R = r * s;
  const w = 0.16 * R;
  const d = `M ${x} ${y - R} Q ${x + w} ${y - w} ${x + R} ${y} Q ${x + w} ${y + w} ${x} ${y + R} Q ${x - w} ${y + w} ${x - R} ${y} Q ${x - w} ${y - w} ${x} ${y - R} Z`;
  return (
    <g transform={`rotate(${(40 * u).toFixed(2)} ${x} ${y})`} style={{ filter: `drop-shadow(0 0 10px ${rgba(PB.mint2, 0.9)})` }}>
      <path d={d} fill="#FFFFFF" opacity={0.95} />
      <circle cx={x} cy={y} r={0.22 * R} fill="#FFFFFF" />
    </g>
  );
}

/** La tenue finale : 40 particules menthe qui montent à 60 px/s. */
function Rising({ t, b }: { t: number; b: Beats }) {
  if (t < b.cross) return null;
  const appear = prog(t, b.cross, 0.6, SNAP);
  return (
    <>
      {Array.from({ length: 40 }, (_, i) => {
        const span = 1200;
        const y = 1120 - ((((t - b.cross) * 60 * (0.7 + 0.6 * hash("S12-up-v", i)) + hash("S12-up", i) * span) % span + span) % span);
        const x = hash("S12-up-x", i) * 1920 + 18 * Math.sin(t * 1.3 + i);
        const s = 2 + 2.5 * hash("S12-up-s", i);
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: "50%", background: PB.mint2, opacity: appear * (0.25 + 0.4 * hash("S12-up-a", i)), boxShadow: `0 0 8px ${rgba(PB.mint, 0.7)}` }} />;
      })}
    </>
  );
}

// ---- La scène --------------------------------------------------------------------------------------------------------

export function Scene12({ t, time }: SceneProps) {
  const b = beats(time);
  const track = robotTrack(b);
  const c = cam(t, b);
  const lettersFast = t >= lettersFrom(b) - F && t < b.land + 2 * F;
  const orbitFast = t >= b.VENTE - 0.42 && t < b.flash + 2 * F;
  const settleFast = t >= b.settle && t < b.settle + 0.25;
  const fadeAll = 1 - prog(t, b.end - 18 * F, 12 * F, LINEAR);
  const push = { at: b.LOGO, x: 1248, y: RING_Y };
  const pull = { from: b.start, to: b.LOGO, x: 1248, y: RING_Y };
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ opacity: fadeAll }}>
        <Background t={t} b={b} />
        <Camera t={t} {...c} depth={0.6}>
          <S12VisorParticles t={t} push={push} pull={pull} />
        </Camera>
        <Camera t={t} {...c}>
          <LogoGlow t={t} b={b} />
          <Charge t={t} b={b} />
        </Camera>
        {LANES.map((lane, i) => (
          <Camera key={i} t={t} {...c} depth={lane.depth}>
            <Lane t={t} b={b} lane={lane} />
          </Camera>
        ))}
        <MotionBlur on={orbitFast} samples={20}>
          {(tt) => (
            <Camera t={tt} {...cam(tt, b)}>
              <OrbitPaths t={tt} b={b} />
              <Orbit t={tt} b={b} side="back" />
            </Camera>
          )}
        </MotionBlur>
        <MotionBlur on={lettersFast || settleFast} samples={lettersFast ? 16 : 8}>
          {(tt) => (
            <Camera t={tt} {...cam(tt, b)}>
              <LogoGroup t={tt} b={b} part="letters" />
            </Camera>
          )}
        </MotionBlur>
        <Camera t={t} {...c}>
          <LogoGroup t={t} b={b} part="rest" />
        </Camera>
        <Camera t={t} {...c}>
          <Impact t={t} b={b} />
        </Camera>
        <MotionBlur on={orbitFast} samples={20}>
          {(tt) => (
            <Camera t={tt} {...cam(tt, b)}>
              <Orbit t={tt} b={b} side="front" />
            </Camera>
          )}
        </MotionBlur>
        <Camera t={t} {...c}>
          <CollapseFlash t={t} b={b} />
        </Camera>
        <MotionBlur on={settleFast}>
          {(tt) => (
            <Camera t={tt} {...cam(tt, b)}>
              <Signature t={tt} b={b} />
            </Camera>
          )}
        </MotionBlur>
        <Camera t={t} {...c}>
          <Pedestal t={t} b={b} />
        </Camera>
        <Camera t={t} {...c}>
          <Robot t={t} b={b} track={track} />
        </Camera>
        <Camera t={t} {...c}>
          <Handwriting t={t} b={b} />
          <Embers t={t} b={b} />
          <Pill t={t} b={b} />
          <Pen t={t} b={b} />
          <Rising t={t} b={b} />
        </Camera>
        {/* les couloirs montrent des produits : la mention reste visible tant qu'ils défilent */}
        <Mention t={t} from={b.VENTE} to={b.end - 6 * F} />
      </AbsoluteFill>
      <Camera t={t} {...c}>
        <Cross t={t} b={b} />
      </Camera>
    </AbsoluteFill>
  );
}

/** Les effets sonores de la scène (secondes du film). Après le néon : le saut du robot et l'extinction du halo, sur la traîne de la musique. */
export const cues: SceneCues = (time) => {
  const b = beats(time);
  const orbitRate = Math.min(1.8, Math.max(0.6, 1.5 / (b.VENTE - b.SIGN)));
  return [
    // la charge des yeux, dès le relais : plus de vide entre la fin de la scène précédente et la frappe ; coupée 80 ms avant
    // la frappe (l'aspiration fait claquer le logo)
    { ...cue("robot_boot_rev", b.start + F, 0.6), until: b.LOGO - 0.08, fade: 0.04 } satisfies Fx,
    cue("whoosh_fast", b.morph, 0.4, 0.9),
    cue("impact_clean", b.LOGO, 0.9),
    cue("whoosh_fast", b.morph + 0.04, 0.4, 1.1),
    cue("sparkle_shimmer", b.shine, 0.5),
    cue("orbit_whoosh", b.SIGN, 0.5, orbitRate),
    cue("impact_clean", b.VENTE, 0.35, 1.4),
    // Le saut du robot reste muet et le souffle discret : ils tombent 0,15 s avant « Rendez-vous », et le « boing » faisait
    // entendre un « Ren… Rendez-vous » (fondateur, 15 oct. 2026).
    cue("whoosh_fast", b.settle, 0.1, 1.2),
    cue("ui_pop", b.penOut + 0.04, 0.25, 1.3),
    cue("laser_write", b.write, 0.3),
    cue("ui_pop", b.fill, 0.4),
    cue("sparkle_shimmer", b.glint, 0.4),
    cue("neon_clean_on", b.cross, 0.6),
    // la fin ne tombe plus dans un trou : le saut du robot, puis le halo de la croix qui s'éteint
    cue("robot_boing", b.final - 0.02, 0.3, 1.2),
    cue("ui_pop", b.final + 0.44, 0.3, 0.8), // il retombe sur son socle (bouche le creux de la musique vers fin − 1,1)
    cue("sparkle_shimmer", b.end - 0.9, 0.3, 0.8), // les éclats sur la croix, puis le halo qui s'éteint
  ];
};
