import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { Users } from "lucide-react";
import { Mascot, type Track, type TrackEvent } from "../mascot";
import {
  Backdrop,
  Burst,
  Camera,
  DotGrid,
  Dust,
  EXIT,
  F,
  IN_OUT,
  JAKARTA,
  LINEAR,
  MONO,
  MotionBlur,
  PB,
  POP,
  Ring,
  SNAP,
  Sparks,
  anticip,
  clamp01,
  cue,
  hash,
  keys,
  label,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  wobble,
  type Cue,
} from "./kit";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S10 · L'ÉQUIPE — voix P13 (« Chacun son comptoir, ses ventes, ses challenges. ») et P14 (« Et le titulaire suit
 * toute l'équipe. »). Fenêtre : P13.start − 0,05 → P15.start.
 *
 *   RELAIS      les contours de confettis de S9 (65 par tuile) ; une comète menthe fait le tour de chaque contour et
 *               le transforme en bord de verre ; le verre se remplit, la tuile claque (POP, 4 images d'écart).
 *   CAMÉRA      plan large le temps que les tuiles claquent, puis poussée × 1,35 sur une tuile par segment : Comptoir 1
 *               (« Chacun son comptoir »), Comptoir 2 (« ses ventes », l'historique monte), Comptoir 3 (« ses
 *               challenges », l'anneau se ferme) ; retour au plan large à P14 − 0,2, juste avant le FLIP.
 *   COMPTOIR    4 tuiles COMPTOIR 1 → 4 (aucun prénom), chacune son robot, chaque gag joué quand la caméra est là : la
 *               marque (venue de S9) fait coucou, le 2e rit, le 3e saute de joie quand son anneau se ferme, le 4e (au
 *               bord du cadre du Comptoir 3) est étourdi (trois étoiles en orbite). Caméra poussée : la bande des
 *               sous-titres s'assombrit (les tuiles du bas n'y font pas de texte sous la phrase).
 *   VENTES      « Historique » : les lignes « Vente · 10:42 » montent toutes les 0,25 s, chaque nouvelle arrive en POP
 *               avec sa pastille « Vendu » menthe et un éclair, déphasées de 0,06 s d'une tuile à l'autre.
 *   CHALLENGES  un anneau doré se remplit derrière la tête de chaque robot (45 / 70 / 100 / 30 %) ; celui du
 *               Comptoir 3 se ferme : éclair doré, onde, étoile en RESSORT, paillettes, son robot saute, la pastille
 *               « Challenge » se dore, vague dans la grille.
 *   TITULAIRE   recomposition FLIP (flou de mouvement ; l'historique, figé, rétrécit avec sa carte) : les tuiles se
 *               rangent en colonne à gauche pendant que « Performances » se déploie de gauche à droite derrière un
 *               liseré lumineux ; puis le tableau monte par morceaux : colonnes et podium en squelette (pointillés,
 *               reflet qui balaie), lignes du classement en cascade de 60 ms, « En direct » qui pulse, puis « bat »
 *               (onde + radar) dans le silence entre « titulaire » et « suit ».
 *   L'ÉQUIPE    histogramme sans chiffres en RESSORT dans son squelette sur « suit », courbe lumineuse et son aire, échange des lignes 2
 *               et 3 en arc (+0,2 s, la ligne qui monte passe DEVANT, opaque), podium en 3 temps (+0,35 s, 70 ms
 *               d'écart), trophée qui brille (+0,2 s) — tableau complet ≈ 0,4 s avant les piliers.
 *   SORTIE      les barres 3, 4, 5 deviennent les 3 piliers de lumière menthe (300 × 760, centrés x = 560 / 960 / 1360,
 *               y = 520) ; tout le reste s'efface. La caméra se pose (dérive et zoom à zéro) : relais exact pour S11.
 * ======================================================================== */

// ---- Constantes ------------------------------------------------------------------------------------------------
const MINT = PB.mint;
const MINT2 = PB.mint2;
const TEAL2 = PB.teal2;
const GOLD = PB.gold;
const GOLD_HI = PB.goldHi;
const GOLD_LO = PB.goldLo;
const GREY = "#C9D1DA";
const CREAM = "#FFE7A3";

/** Les 4 tuiles (centres) — les mêmes que les cibles des confettis de S9. */
const TILES: readonly [number, number][] = [
  [654, 297],
  [1266, 297],
  [654, 651],
  [1266, 651],
];
const TW = 600;
const TH = 330;
const TR = 28;
/** La colonne de gauche après la recomposition (gauche, haut) ; tuiles 300 × 140. */
const SMALL: readonly [number, number][] = [
  [120, 170],
  [120, 330],
  [120, 490],
  [120, 650],
];
const SW = 300;
const SH = 140;
/** Les robots : la marque (tuile 1), puis trois apparences de comptoir bien distinctes (lunettes, bonnet, nœud). */
const LOOKS: readonly (number | null)[] = [null, 5, 16, 3];
/** Remplissage des anneaux de challenge (le 3e se ferme). */
const RING_FILL = [0.45, 0.7, 1, 0.3];
const ROBOT = 190;
const ROBOT_H = ROBOT * 0.92;
/** Centre de la tête depuis le haut du robot (viewBox du site : tête en (50, 26,6), origine y = −4). */
const HEAD_FROM_TOP = (26.6 + 4) * (ROBOT / 100);
const RING_R = 88;
const ROBOT_SMALL = 84;

/** Le tableau de bord. */
const PANEL = { x: 500, y: 150, w: 1260, h: 740 };
const BAR_H = [0.45, 0.62, 0.5, 0.78, 0.7, 0.9, 0.84].map((k) => k * 300);
const BAR_W = 56;
const BAR_GAP = 28;
const BAR_X0 = 560;
const BAR_BASE = 780;
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
/** Les barres qui deviennent les piliers, et les centres des piliers. */
const PILLAR_BARS = [2, 3, 4];
const PILLAR_CX = [560, 960, 1360];
const PILLAR = { w: 300, h: 760, cy: 520 };

/** Le classement : ordre de départ (n° de comptoir) et longueur de barre ; le Comptoir 2 double le Comptoir 1. */
const BOARD = [
  { n: 3, fill: 0.94 },
  { n: 1, fill: 0.74 },
  { n: 2, fill: 0.66, after: 0.82 },
  { n: 4, fill: 0.5 },
];
const BOARD_X = 1250;
const BOARD_Y = 336;
const ROW_W = 440;
const ROW_H = 64;
const ROW_STEP = 76;
const PODIUM = { cx: 1470, base: 846, w: 90, gap: 8 };
/** Podium : écart entre les marches (3e, 2e, 1er) et arrivée du trophée, depuis `a.PODIUM`. */
const STEP_DT = 0.07;
const TROPHY_DT = 0.2;

// ---- Les ancrages ------------------------------------------------------------------------------------------------
function anchorsOf(time: Time) {
  const w = time.win.S10;
  const P13 = time.A("P13");
  const VENTES = time.A("P13", 1);
  const CHAL = time.A("P13", 2);
  const P13E = time.Z("P13");
  const P14 = time.A("P14");
  const EQUIPE = time.A("P14", 1);
  const P14E = time.Z("P14");
  const EXIT_T = P14E + 0.1;
  // Les piliers doivent être posés à P15.start − 0,05 (relais S11) : 14 images, moins si la pause est courte.
  const PILLAR_DUR = Math.max(8 * F, Math.min(14 * F, w.end - 0.05 - EXIT_T - 4 * F));
  // La caméra pousse (× 1,35) sur une tuile par segment : Comptoir 1, puis 2 (« ses ventes »), puis 3 (« ses challenges ») ;
  // plan large retrouvé à P14 − 0,2, juste avant la recomposition.
  const CLOSE = CHAL + 2 * 3 * F + 0.36;
  const PUSH1_0 = P13 + 0.22;
  const PUSH1_1 = Math.min(P13 + 0.62, VENTES - 0.2);
  const PAN2_0 = VENTES - 0.08;
  const PAN2_1 = VENTES + 0.27;
  const PAN3_0 = Math.max(PAN2_1 + 0.12, CHAL - 0.08);
  const PAN3_1 = PAN3_0 + 0.35;
  const BACK_1 = P14 - 0.2;
  const BACK_0 = Math.min(Math.max(CLOSE + 0.14, PAN3_1 + 0.1), BACK_1 - 0.18);
  const DASH = P14 + 0.1;
  // Le tableau monte par morceaux pendant « titulaire » : panneau, squelettes du graphique et du podium (reflet qui
  // passe), lignes du classement (cascade de 60 ms), « En direct » qui pulse déjà.
  const ROWS0 = DASH + 0.42;
  const LIVE = Math.min(ROWS0 + 0.22, EQUIPE - 0.12);
  return {
    W0: w.start,
    W1: w.end,
    P13,
    VENTES,
    CHAL,
    P13E,
    P14,
    EQUIPE,
    P14E,
    EXIT_T,
    PILLAR_DUR,
    /** Claquement de la tuile i. */
    popT: (i: number) => P13 + i * 4 * F,
    /** Le geste du robot i, joué quand la caméra est sur lui : coucou (Comptoir 1), rire (2), saut de joie à la fermeture de
     *  son anneau (3), tournis (4, vu au bord du cadre du Comptoir 3). */
    GEST: [PUSH1_1 - 0.15, PAN2_1 - 0.1, CLOSE, PAN3_1 - 0.08],
    /** Début du remplissage de l'anneau i. */
    ringT: (i: number) => CHAL + i * 3 * F,
    /** L'anneau du Comptoir 3 se ferme. */
    CLOSE,
    PUSH1_0,
    PUSH1_1,
    PAN2_0,
    PAN2_1,
    PAN3_0,
    PAN3_1,
    BACK_0,
    BACK_1,
    FLIP: P14 - 2 * F,
    DASH,
    TITU: P14 + 0.22,
    ROWS0,
    LIVE,
    /** « En direct » bat (onde + radar) dans le silence entre « titulaire » et « suit » : A(P14, 1) tombe au début de cette
     *  pause (la voix y est à −40 dB) ; « suit » n'arrive que 0,25 s plus tard. */
    PING: Math.max(LIVE + 0.08, EQUIPE + 0.02),
    CHIP: EQUIPE + 0.16,
    SWAP: EQUIPE + 0.2,
    PODIUM: Math.min(EQUIPE + 0.35, EXIT_T - 0.46),
  };
}
type Anchors = ReturnType<typeof anchorsOf>;

// ---- Les pistes des robots ---------------------------------------------------------------------------------------
function robotTrack(a: Anchors, i: number): Track {
  const look = (x: number, y: number, at: number, dur: number): TrackEvent => ({ t: at, kind: "glance", x, y, dur });
  const common: TrackEvent[] = [
    // Au moment du « titulaire » : tous les robots regardent le tableau de bord qui se déploie.
    look(1, 0.1, a.FLIP + 0.12, 0.9),
    { t: a.FLIP + 0.5, kind: "blink" },
    look(0.85, 0.25, a.EQUIPE + 0.1, 1.2),
  ];
  let events: TrackEvent[] = [];
  if (i === 0) {
    events = [
      { t: 1, kind: "mood", mood: "happy" },
      { t: a.GEST[0], kind: "burst", burst: "wave" },
      look(0.85, 0.3, a.VENTES + 0.04, 0.45),
      look(0.35, -0.9, a.CHAL + 0.06, 0.4),
      look(0.9, 0.7, a.CLOSE + 0.05, 0.45),
      { t: a.P13E + 0.05, kind: "blink" },
    ];
  } else if (i === 1) {
    events = [
      { t: 1, kind: "mood", mood: "idle" },
      look(-0.8, 0.2, a.GEST[0] + 0.1, 0.4),
      { t: a.GEST[1], kind: "burst", burst: "giggle" },
      { t: a.GEST[1] + 0.5, kind: "blink" },
      look(0.2, -0.9, a.CHAL + 0.08, 0.32),
      look(-0.9, 0.8, a.CLOSE + 0.04, 0.5),
      { t: a.CLOSE + 0.08, kind: "emote", emote: "surprised", dur: 0.6 },
    ];
  } else if (i === 2) {
    events = [
      { t: 1, kind: "mood", mood: "idle" },
      look(0.85, 0.3, a.VENTES + 0.16, 0.4),
      look(0.1, -1, a.CHAL + 0.04, 0.32),
      // L'anneau se ferme (GEST[2]) : il saute de joie (happy → saut, la caméra est sur lui), et lance des étincelles.
      { t: a.GEST[2], kind: "mood", mood: "happy" },
      { t: a.CLOSE + 0.02, kind: "emit", particle: "star", count: 4 },
    ];
  } else {
    events = [
      { t: 1, kind: "mood", mood: "idle" },
      look(-0.8, -0.5, a.P13 + 0.5, 0.4),
      { t: a.GEST[3], kind: "burst", burst: "dizzy" },
      { t: a.GEST[3] + 0.1, kind: "emit", particle: "star", count: 3 },
      { t: a.P13E + 0.05, kind: "blink" },
    ];
  }
  return {
    id: `S10-robot${i}-${Math.round(a.P13 * 1000)}-${Math.round(a.P14 * 1000)}-${Math.round(a.EQUIPE * 1000)}`,
    seed: 1010 + i * 17,
    until: a.W1 + 0.3,
    events: [...events, ...common],
  };
}

// ---- Outils ------------------------------------------------------------------------------------------------------
/** Un point du contour d'un rectangle arrondi (w × h, rayon r), f ∈ [0, 1), parti de (r, 0) dans le sens horaire (comme le trait SVG d'un <rect>). */
function perimeter(w: number, h: number, r: number, f: number): [number, number] {
  const st = w - 2 * r;
  const ss = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  const L = 2 * st + 2 * ss + 4 * arc;
  let d = (((f % 1) + 1) % 1) * L;
  if (d < st) return [r + d, 0];
  d -= st;
  if (d < arc) {
    const th = -Math.PI / 2 + d / r;
    return [w - r + r * Math.cos(th), r + r * Math.sin(th)];
  }
  d -= arc;
  if (d < ss) return [w, r + d];
  d -= ss;
  if (d < arc) {
    const th = d / r;
    return [w - r + r * Math.cos(th), h - r + r * Math.sin(th)];
  }
  d -= arc;
  if (d < st) return [w - r - d, h];
  d -= st;
  if (d < arc) {
    const th = Math.PI / 2 + d / r;
    return [r + r * Math.cos(th), h - r + r * Math.sin(th)];
  }
  d -= arc;
  if (d < ss) return [0, h - r - d];
  d -= ss;
  const th = Math.PI + d / r;
  return [r + r * Math.cos(th), r + r * Math.sin(th)];
}

const STAR_D = "M 0 -1 L 0.294 -0.405 L 0.951 -0.309 L 0.476 0.155 L 0.588 0.809 L 0 0.5 L -0.588 0.809 L -0.476 0.155 L -0.951 -0.309 L -0.294 -0.405 Z";

function StarShape({ x, y, size, rot = 0, fill = GOLD, glow = 1, opacity = 1 }: { x: number; y: number; size: number; rot?: number; fill?: string; glow?: number; opacity?: number }) {
  return (
    <svg style={{ position: "absolute", left: x - size, top: y - size, width: size * 2, height: size * 2, overflow: "visible", opacity, filter: glow > 0 ? `drop-shadow(0 0 ${10 * glow}px ${rgba(GOLD, 0.8)})` : undefined }} viewBox="-1 -1 2 2">
      <defs>
        <linearGradient id="s10-star-gold" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="0.5" stopColor={GOLD_HI} />
          <stop offset="1" stopColor={GOLD} />
        </linearGradient>
      </defs>
      <path d={STAR_D} transform={`rotate(${rot})`} fill={fill === GOLD ? "url(#s10-star-gold)" : fill} stroke={GOLD_LO} strokeWidth={0.04} strokeLinejoin="round" />
    </svg>
  );
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---- Une tuile (comptoir) -----------------------------------------------------------------------------------------
const CONFETTI_PER_TILE = 65;

function TileBorder({ t, a, i, w, h, r, fk }: { t: number; a: Anchors; i: number; w: number; h: number; r: number; fk: number }) {
  const at = a.popT(i) + 2 * F;
  const draw = prog(t, at, 0.34, SNAP);
  const settle = prog(t, at + 0.3, 0.45, LINEAR);
  const gold = i === 2 ? pulse(t, a.CLOSE, 3 * F, 0.12, 0.6) : 0;
  const head = perimeter(w, h, r, draw * 0.999);
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "visible", pointerEvents: "none" }}>
      {/* Bord au repos : 1 px menthe 22 %. */}
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={r} fill="none" stroke={rgba(MINT, 0.22 + 0.2 * (1 - fk) * pulse(t, at + 0.3, 0.1, 0.1, 0.5))} strokeWidth={1} pathLength={1} strokeDasharray={`${draw} 1`} />
      {/* Le trait lumineux de la comète, qui retombe. */}
      {settle < 1 && (
        <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={r} fill="none" stroke={MINT2} strokeWidth={3} pathLength={1} strokeDasharray={`${draw} 1`} opacity={1 - settle} style={{ filter: `drop-shadow(0 0 8px ${rgba(MINT, 0.9)})` }} />
      )}
      {gold > 0 && <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={r} fill="none" stroke={GOLD_HI} strokeWidth={3} opacity={gold} style={{ filter: `drop-shadow(0 0 12px ${rgba(GOLD, 0.9)})` }} />}
      {/* La tête de la comète. */}
      {draw > 0.002 && draw < 0.998 && <circle cx={head[0]} cy={head[1]} r={7} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 10px ${MINT2}) drop-shadow(0 0 22px ${MINT})` }} />}
      {/* Les confettis de S9, posés sur le contour : la comète les avale un à un. */}
      {fk === 0 &&
        Array.from({ length: CONFETTI_PER_TILE }, (_, j) => {
          const f = j / CONFETTI_PER_TILE;
          const s = clamp01(1 - (draw * 1.06 - f) * 22);
          if (s <= 0) return null;
          const [px, py] = perimeter(w, h, r, f);
          const fl = wobble(t, j * 3.1 + i * 17, 2.2, 2.2);
          return <rect key={j} x={px - 5 * s} y={py - 9 * s + fl} width={10 * s} height={18 * s} rx={3 * s} fill={j % 5 === 0 ? MINT2 : MINT} opacity={0.75} />;
        })}
    </svg>
  );
}

function History({ t, a, i, op }: { t: number; a: Anchors; i: number; op: number }) {
  if (op <= 0.001) return null;
  const S = a.VENTES + i * 0.06;
  const STEP = 0.25;
  const count = t < S ? 0 : Math.floor((t - S) / STEP) + 1;
  let scroll = 0;
  for (let n = 1; n < count + 1; n++) scroll += prog(t, S + n * STEP, 0.16, SNAP);
  const total = 4 + count;
  const enter0 = a.P13 + 0.24 + i * 3 * F;
  const headK = prog(t, enter0 - 0.06, 0.3, SNAP);
  const rows: ReactNode[] = [];
  for (let r = Math.max(0, Math.floor(scroll) - 1); r < total; r++) {
    const slot = r - scroll;
    if (slot < -1 || slot > 5) continue;
    const isNew = r >= 4;
    const born = isNew ? S + (r - 4) * STEP : enter0 + r * 0.1;
    const k = isNew ? prog(t, born, 10 * F, POP) : prog(t, born, 16 * F, SNAP);
    const o = isNew ? clamp01((t - born) / (4 * F)) : k;
    const minute = 10 * 60 + 2 + i * 9 + r * 5 + Math.floor(hash("S10-min", i * 50 + r) * 4);
    const sold = r === 4 || (r > 4 ? hash("S10-sold", i * 50 + r) > 0.28 : r !== 1);
    const flash = isNew ? pulse(t, born, 2 * F, 0.05, 0.45) : 0;
    const pillK = prog(t, born + 3 * F, 10 * F, POP);
    rows.push(
      <div
        key={r}
        style={{
          position: "absolute",
          left: 0,
          top: slot * 44,
          width: 280,
          height: 36,
          borderRadius: 10,
          background: `rgba(255,255,255,${0.06 + 0.1 * flash})`,
          boxShadow: flash > 0 ? `0 0 ${18 * flash}px ${rgba(MINT, 0.35 * flash)}, inset 0 0 0 1px ${rgba(MINT, 0.5 * flash)}` : undefined,
          transform: isNew ? `scale(${0.8 + 0.2 * k})` : `translateY(${(1 - k) * 16}px)`,
          transformOrigin: "50% 50%",
          opacity: o,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px 0 14px",
          boxSizing: "border-box",
        }}
      >
        <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 18, color: "rgba(255,255,255,.8)", whiteSpace: "pre" }}>
          Vente · <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 17, fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,.66)" }}>{hhmm(minute)}</span>
        </span>
        {sold ? (
          <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 16, color: MINT2, background: rgba(MINT, 0.18), borderRadius: 999, padding: "3px 11px", transform: `scale(${isNew ? 0.6 + 0.4 * pillK : 1})`, display: "inline-block" }}>Vendu</span>
        ) : (
          <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 18, color: "rgba(201,209,218,.45)", paddingRight: 18 }}>—</span>
        )}
      </div>,
    );
  }
  const mask = "linear-gradient(180deg, transparent 0px, black 22px, black 206px, transparent 232px)";
  return (
    <div style={{ position: "absolute", left: 290, top: 26, width: 280, opacity: op }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, transform: `translateY(${(1 - headK) * 12}px)`, opacity: headK }}>
        <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 20, color: "rgba(255,255,255,.6)" }}>Historique</span>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: MINT, opacity: 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (t - i * 0.25))), boxShadow: `0 0 8px ${MINT}` }} />
      </div>
      <div style={{ position: "absolute", left: 0, top: 36, width: 290, height: 232, overflow: "hidden", maskImage: mask, WebkitMaskImage: mask }}>
        <div style={{ position: "absolute", left: 0, top: 10, width: 290, height: 260 }}>{rows}</div>
      </div>
    </div>
  );
}

function ChallengeRing({ t, a, i, cx, cy, s }: { t: number; a: Anchors; i: number; cx: number; cy: number; s: number }) {
  const at = a.ringT(i);
  const show = prog(t, at - 0.12, 0.22, SNAP);
  if (show <= 0) return null;
  const R = RING_R * s;
  const sw = 8 * s;
  const closed = i === 2 && t >= a.CLOSE;
  const fill = closed ? 1 : Math.min(0.995, RING_FILL[i] * prog(t, at, 0.6, SNAP));
  const flash = i === 2 ? pulse(t, a.CLOSE, 2 * F, 0.06, 0.5) : 0;
  const ang = -Math.PI / 2 + fill * Math.PI * 2;
  const hx = cx + R * Math.cos(ang);
  const hy = cy + R * Math.sin(ang);
  const breath = 0.5 + 0.5 * Math.sin(2 * Math.PI * (t * 1.3 + i * 0.2));
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", opacity: show }}>
      <defs>
        <linearGradient id={`s10-ring-${i}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={GOLD_HI} />
          <stop offset="0.55" stopColor={GOLD} />
          <stop offset="1" stopColor={GOLD_LO} />
        </linearGradient>
      </defs>
      <g transform={`translate(${cx} ${cy}) scale(${0.85 + 0.15 * show}) translate(${-cx} ${-cy})`}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={sw} />
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke={`url(#s10-ring-${i})`}
          strokeWidth={sw * (1 + 0.5 * flash)}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${fill} 1`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 ${6 + 6 * breath + 18 * flash}px ${rgba(GOLD, 0.55 + 0.4 * flash)})` }}
        />
        {fill > 0.01 && !closed && <circle cx={hx} cy={hy} r={sw * 0.75} fill={CREAM} style={{ filter: `drop-shadow(0 0 8px ${GOLD_HI})` }} />}
        {closed && <circle cx={cx} cy={cy} r={R + 14 * s * flash} fill="none" stroke={CREAM} strokeWidth={2 * s} opacity={flash} />}
      </g>
    </svg>
  );
}

function DizzyStars({ t, a, cx, cy, s }: { t: number; a: Anchors; cx: number; cy: number; s: number }) {
  const at = a.GEST[3] + 0.08;
  const o = pulse(t, at, 0.15, 1.0, 0.3);
  if (o <= 0) return null;
  return (
    <>
      {[0, 1, 2].map((k) => {
        const th = 2 * Math.PI * ((t - at) * 1.5 + k / 3);
        const depth = Math.sin(th);
        const x = cx + Math.cos(th) * 74 * s;
        const y = cy - 74 * s + depth * 16 * s;
        return <StarShape key={k} x={x} y={y} size={(8 + 2.5 * depth) * s} rot={(t - at) * 360} opacity={o * (0.7 + 0.3 * depth)} glow={0.6} />;
      })}
    </>
  );
}

function TileView({ t, a, i }: { t: number; a: Anchors; i: number }) {
  const [cx, cy] = TILES[i];
  const flipAt = a.FLIP + i * 3 * F;
  const fk = prog(t, flipAt, 0.5, IN_OUT);
  const x = lerp(cx - TW / 2, SMALL[i][0], fk);
  const y = lerp(cy - TH / 2, SMALL[i][1], fk);
  const w = lerp(TW, SW, fk);
  const h = lerp(TH, SH, fk);
  const r = lerp(TR, 22, fk);
  const popK = prog(t, a.popT(i), 14 * F, POP);
  const fillK = prog(t, a.W0, 8 * F, LINEAR);
  const live = clamp01((t - a.P13) / 0.4);
  const breathe = 1 + 0.0075 * (1 - Math.cos(2 * Math.PI * (t - a.P13 - i * 0.25))) * live * (1 - 0.6 * fk);
  const ant = 1 + anticip(t, flipAt, 5 * F, 0.03);
  const team = pulse(t, a.CHIP + i * 3 * F, 3 * F, 0.06, 0.4);
  const scale = (0.965 + 0.035 * popK) * breathe * ant * (1 + 0.025 * team);
  const out = 1 - prog(t, a.EXIT_T, 10 * F, EXIT);
  // Pendant la recomposition, l'historique reste plein (contenu figé) et rétrécit avec la carte ; il ne s'efface qu'une
  // fois la carte presque réduite — jamais de carte vide.
  const listOp = 1 - clamp01((fk - 0.5) / 0.32);
  const listS = w / TW;
  const listT = Math.min(t, flipAt - 2 * F);
  const sheen = prog(t, a.popT(i) + 0.12, 0.8, LINEAR);
  const sheen2 = i === 2 ? prog(t, a.CLOSE, 0.6, LINEAR) : 0;
  const goldGlow = i === 2 ? pulse(t, a.CLOSE, 3 * F, 0.15, 0.8) : 0;
  const mintGlow = Math.max(pulse(t, a.popT(i) + 0.3, 0.1, 0.1, 0.5), 1.4 * team);

  // Robot : centre et pieds dans la tuile, échelle 1 → 84/190.
  const rs = lerp(1, ROBOT_SMALL / ROBOT, fk);
  const rx = lerp(130, 58, fk);
  const feet = h - lerp(24, 12, fk);
  const headY = feet - (ROBOT_H - HEAD_FROM_TOP) * rs;
  const robotPop = i === 0 ? 1 : ressort(t, a.popT(i) + 2 * F);
  const lab = lerp(24, 20, fk);
  const pillOp = prog(t, a.CHAL - 0.04 + i * 3 * F, 0.25, SNAP) * (1 - clamp01((fk - 0.1) / 0.3));
  const won = i === 2 && t >= a.CLOSE;
  const wonK = i === 2 ? prog(t, a.CLOSE, 10 * F, POP) : 0;
  const miniK = prog(t, flipAt + 0.3, 0.25, SNAP);
  const miniFill = [0.74, 0.82, 0.94, 0.5][i] * prog(t, flipAt + 0.35, 0.5, SNAP);
  const starK = i === 2 ? ressort(t, a.CLOSE + F) : 0;

  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform: `scale(${scale})`, transformOrigin: "50% 50%", opacity: out }}>
      {/* Le verre (fond, reflet intérieur, lueur sous le robot, reflet qui traverse). */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: r,
          overflow: "hidden",
          background: `rgba(18,26,34,${0.88 * fillK})`,
          boxShadow: `0 30px 80px rgba(0,0,0,${0.45 * fillK}), 0 0 ${40 + 30 * goldGlow}px ${goldGlow > 0 ? rgba(GOLD, 0.45 * goldGlow) : rgba(MINT, 0.25 * mintGlow)}`,
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,.13), transparent 40%)", opacity: fillK }} />
        <div style={{ position: "absolute", left: rx - 170 * rs, top: headY - 150 * rs, width: 340 * rs, height: 340 * rs, borderRadius: "50%", background: `radial-gradient(circle, ${won ? rgba(GOLD, 0.22 * (1 - 0.5 * prog(t, a.CLOSE + 0.4, 0.8))) : rgba(PB.teal, 0.42)} 0%, transparent 68%)`, opacity: fillK }} />
        {[sheen, sheen2].map((sh, k) =>
          sh > 0 && sh < 1 ? (
            <div key={k} style={{ position: "absolute", inset: 0, background: `linear-gradient(110deg, transparent ${sh * 160 - 40}%, ${k ? "rgba(255,231,163,.22)" : "rgba(255,255,255,.14)"} ${sh * 160 - 25}%, transparent ${sh * 160 - 10}%)` }} />
          ) : null,
        )}
      </div>
      <TileBorder t={t} a={a} i={i} w={w} h={h} r={r} fk={fk} />
      {team > 0 && <div style={{ position: "absolute", inset: 0, borderRadius: r, boxShadow: `inset 0 0 0 2px ${rgba(MINT2, 0.9 * team)}, 0 0 24px ${rgba(MINT, 0.5 * team)}`, pointerEvents: "none" }} />}

      {/* Étiquette COMPTOIR n — jamais de prénom. */}
      <div style={{ position: "absolute", left: lerp(28, 112, fk), top: lerp(26, 36, fk), ...label(lab), color: "rgba(255,255,255,.7)", whiteSpace: "nowrap", opacity: prog(t, a.popT(i) + 4 * F, 0.3, SNAP), transform: `translateX(${(1 - prog(t, a.popT(i) + 4 * F, 0.3, SNAP)) * -18}px)` }}>
        Comptoir {i + 1}
      </div>
      {listOp > 0.001 && (
        <div style={{ position: "absolute", left: 0, top: 0, width: TW, height: TH, transform: `scale(${listS})`, transformOrigin: "0 0" }}>
          <History t={listT} a={a} i={i} op={listOp} />
        </div>
      )}

      {/* L'anneau doré, derrière le robot. */}
      <ChallengeRing t={t} a={a} i={i} cx={rx} cy={headY} s={rs} />

      {/* Le robot du comptoir. */}
      <div
        style={{
          position: "absolute",
          left: rx - ROBOT / 2,
          top: feet - ROBOT_H,
          width: ROBOT,
          height: ROBOT_H,
          transformOrigin: "50% 100%",
          transform: `scale(${rs * robotPop})`,
          opacity: clamp01(robotPop * 3),
        }}
      >
        <Mascot track={robotTrack(a, i)} t={t} size={ROBOT} look={LOOKS[i]} />
      </div>

      {i === 3 && <DizzyStars t={t} a={a} cx={rx} cy={headY} s={rs} />}
      {/* La pastille « Challenge » (dorée quand l'anneau se ferme) — au-dessus du robot qui saute. */}
      {pillOp > 0 && (
        <div
          style={{
            position: "absolute",
            left: 28,
            top: 62,
            height: 28,
            padding: "0 12px 0 9px",
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: JAKARTA,
            fontWeight: 700,
            fontSize: 16,
            color: won ? "#2A1A00" : GOLD_HI,
            background: won ? `linear-gradient(160deg, ${GOLD_HI}, ${GOLD})` : rgba(GOLD, 0.14),
            border: `1px solid ${rgba(GOLD, won ? 0 : 0.35)}`,
            opacity: pillOp,
            transform: `scale(${(0.8 + 0.2 * pillOp) * (1 + 0.12 * Math.sin(Math.PI * wonK) * (won ? 1 : 0))})`,
            transformOrigin: "0 50%",
            boxShadow: won ? `0 0 18px ${rgba(GOLD, 0.6)}` : undefined,
          }}
        >
          <svg width={14} height={14} viewBox="-1 -1 2 2">
            <path d={STAR_D} fill={won ? "#2A1A00" : GOLD_HI} />
          </svg>
          {won ? "Challenge réussi" : "Challenge"}
        </div>
      )}

      {/* Comptoir 3 : l'étoile du challenge, en badge sur l'anneau (RESSORT 0 → 1,2 → 1). */}
      {i === 2 && starK > 0 && (
        <StarShape x={rx + (RING_R * 0.72 + 12) * rs} y={headY - (RING_R * 0.72 + 12) * rs} size={24 * rs * starK} rot={-14 + 14 * Math.sin((t - a.CLOSE) * 3)} glow={1 + pulse(t, a.CLOSE, 0.05, 0.1, 0.5)} />
      )}

      {/* En colonne : petite barre d'activité et point vivant. */}
      {miniK > 0 && (
        <div style={{ position: "absolute", left: 112, top: 80, width: 160, opacity: miniK, transform: `translateX(${(1 - miniK) * 20}px)` }}>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
            <div style={{ width: `${miniFill * 100}%`, height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${TEAL2}, ${MINT2})`, boxShadow: `0 0 10px ${rgba(MINT, 0.6)}` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Le tableau de bord « Performances » ------------------------------------------------------------------------
function barRect(j: number) {
  const x = BAR_X0 + j * (BAR_W + BAR_GAP);
  return { x, w: BAR_W, h: BAR_H[j] };
}

function curvePath(): string {
  const pts = BAR_H.map((h, j) => [BAR_X0 + j * (BAR_W + BAR_GAP) + BAR_W / 2, BAR_BASE - h - 44] as [number, number]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let j = 0; j < pts.length - 1; j++) {
    const p0 = pts[Math.max(0, j - 1)];
    const p1 = pts[j];
    const p2 = pts[j + 1];
    const p3 = pts[Math.min(pts.length - 1, j + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}
const CURVE = curvePath();
const CURVE_LEN = getLength(CURVE);
const CURVE_X0 = BAR_X0 + BAR_W / 2;
const CURVE_X1 = BAR_X0 + 6 * (BAR_W + BAR_GAP) + BAR_W / 2;

function Bars({ t, a, skipPillars }: { t: number; a: Anchors; skipPillars: boolean }) {
  return (
    <>
      {BAR_H.map((_, j) => {
        if (skipPillars && PILLAR_BARS.includes(j)) return null;
        const b = barRect(j);
        // Avant « toute l'équipe » : des amorces qui ondulent (chargement) ; puis la barre pousse en RESSORT.
        const born = prog(t, a.DASH + 0.38 + j * 2 * F, 0.3, POP);
        if (born <= 0) return null;
        const stub = born * (12 + 14 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t * 1.6 - j * 0.14))));
        const g = ressort(t, a.EQUIPE + j * 3 * F);
        const h = lerp(stub, b.h, g);
        const shine = prog(t, a.EQUIPE + 0.5 + j * 2 * F, 0.5, LINEAR);
        return (
          <div key={j} style={{ position: "absolute", left: b.x, top: BAR_BASE - h, width: b.w, height: h, borderRadius: "12px 12px 4px 4px", background: `linear-gradient(180deg, ${MINT2}, ${TEAL2})`, boxShadow: `0 0 24px ${rgba(MINT, 0.25)}`, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 6, background: "rgba(255,255,255,.55)", borderRadius: "12px 12px 0 0" }} />
            {shine > 0 && shine < 1 && <div style={{ position: "absolute", left: 0, right: 0, top: `${(1 - shine) * 140 - 30}%`, height: "30%", background: "linear-gradient(180deg, transparent, rgba(255,255,255,.35), transparent)" }} />}
          </div>
        );
      })}
    </>
  );
}

/** Le tableau « charge » pendant « titulaire » : colonnes et marches du podium en squelette (pointillés menthe), un reflet qui
 *  les balaie de gauche à droite ; les vraies barres poussent DANS leur squelette sur « suit », les marches sur le podium. */
function Skeleton({ t, a }: { t: number; a: Anchors }) {
  const t0 = a.DASH + 0.36;
  if (t < t0) return null;
  const SWEEP = 0.55;
  const x0 = BAR_X0 - 160;
  const x1 = PODIUM.cx + 1.5 * (PODIUM.w + PODIUM.gap) + 160;
  const sweepX = x0 + (((t - t0) % SWEEP) / SWEEP) * (x1 - x0);
  const ghost = (key: string, left: number, top: number, w: number, h: number, op: number, radius: string) =>
    op > 0.001 ? (
      <div key={key} style={{ position: "absolute", left, top, width: w, height: h, borderRadius: radius, overflow: "hidden", background: "rgba(255,255,255,.045)", border: `1px dashed ${rgba(MINT2, 0.26)}`, boxSizing: "border-box", opacity: op }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: sweepX - left - 70, width: 140, background: `linear-gradient(90deg, transparent, ${rgba(MINT2, 0.2)}, transparent)` }} />
      </div>
    ) : null;
  const barsOut = 1 - prog(t, a.EQUIPE + 0.32, 0.2, LINEAR);
  const podiumOut = 1 - prog(t, a.PODIUM + 0.3, 0.2, LINEAR);
  const steps = [86, 120, 64];
  return (
    <>
      {BAR_H.map((h, j) => {
        const b = barRect(j);
        const k = prog(t, t0 + j * 2 * F, 0.28, SNAP);
        const hh = h * (0.35 + 0.65 * k);
        return ghost(`sk${j}`, b.x, BAR_BASE - hh, b.w, hh, k * barsOut, "12px 12px 4px 4px");
      })}
      {steps.map((h, k) => {
        const kk = prog(t, a.ROWS0 + 0.18 + k * 0.06, 0.28, SNAP);
        const cx = PODIUM.cx + (k - 1) * (PODIUM.w + PODIUM.gap);
        const hh = h * (0.4 + 0.6 * kk);
        return ghost(`skp${k}`, cx - PODIUM.w / 2, PODIUM.base - hh, PODIUM.w, hh, kk * podiumOut, "10px 10px 2px 2px");
      })}
    </>
  );
}

function Curve({ t, a }: { t: number; a: Anchors }) {
  const k = prog(t, a.EQUIPE + 0.1, 0.6, IN_OUT);
  if (k <= 0) return null;
  const ev = evolvePath(k, CURVE);
  const head = getPointAtLength(CURVE, CURVE_LEN * k) ?? { x: CURVE_X1, y: BAR_BASE };
  const area = `${CURVE} L ${CURVE_X1} ${BAR_BASE} L ${CURVE_X0} ${BAR_BASE} Z`;
  const clipW = (CURVE_X1 - CURVE_X0) * k;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible", pointerEvents: "none" }}>
      <defs>
        <linearGradient id="s10-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MINT} stopOpacity={0.22} />
          <stop offset="1" stopColor={MINT} stopOpacity={0} />
        </linearGradient>
        <clipPath id="s10-area-clip">
          <rect x={CURVE_X0} y={0} width={clipW} height={1080} />
        </clipPath>
      </defs>
      <path d={area} fill="url(#s10-area)" clipPath="url(#s10-area-clip)" />
      <path d={CURVE} fill="none" stroke={MINT2} strokeWidth={3} strokeLinecap="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} style={{ filter: `drop-shadow(0 0 8px ${rgba(MINT, 0.9)})` }} />
      <circle cx={head.x} cy={head.y} r={6 + 2 * Math.sin(t * 14)} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 8px ${MINT2}) drop-shadow(0 0 20px ${MINT})` }} />
      <circle cx={head.x} cy={head.y} r={14} fill="none" stroke={MINT2} strokeWidth={1.5} opacity={0.5} />
    </svg>
  );
}

function Board({ t, a }: { t: number; a: Anchors }) {
  const swapK = prog(t, a.SWAP, 0.4, IN_OUT);
  return (
    <>
      <div style={{ position: "absolute", left: BOARD_X, top: BOARD_Y - 34, ...label(16), color: "rgba(255,255,255,.5)", opacity: prog(t, a.ROWS0 - 0.08, 0.25, SNAP), transform: `translateX(${(1 - prog(t, a.ROWS0 - 0.08, 0.3, SNAP)) * 24}px)` }}>Classement</div>
      {/* Les rangs (fixes) : les lignes glissent sous eux. */}
      {BOARD.map((_, slot) => {
        const o = prog(t, a.ROWS0 + slot * 0.06, 0.3, SNAP);
        return (
          <div key={`rk${slot}`} style={{ position: "absolute", left: BOARD_X - 44, top: BOARD_Y + slot * ROW_STEP, width: 36, height: ROW_H, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: 22, color: slot === 0 ? GOLD_HI : "rgba(255,255,255,.42)", opacity: o }}>
            {slot + 1}
          </div>
        );
      })}
      {BOARD.map((row, idx) => {
        const enter = prog(t, a.ROWS0 + idx * 0.06, 0.32, SNAP);
        if (enter <= 0) return null;
        const land = pulse(t, a.ROWS0 + idx * 0.06 + 0.12, 2 * F, 0.04, 0.3);
        let slotY = idx * ROW_STEP;
        let dx = 0;
        let sc = 1;
        let lift = 0;
        let dim = 0;
        if (idx === 2) {
          // La ligne qui monte passe DEVANT en arc, opaque : les deux noms ne se superposent jamais.
          slotY = lerp(2, 1, swapK) * ROW_STEP;
          dx = 56 * Math.sin(Math.PI * swapK);
          sc = 1 + 0.06 * Math.sin(Math.PI * Math.min(1, swapK * 1.3));
          lift = Math.sin(Math.PI * swapK);
        } else if (idx === 1) {
          // Celle qui descend recule un peu (plus sombre, légèrement plus petite).
          slotY = lerp(1, 2, swapK) * ROW_STEP;
          dim = Math.sin(Math.PI * swapK);
          sc = 1 - 0.03 * dim;
        }
        const rise = idx === 2 ? pulse(t, a.SWAP + 0.38, 3 * F, 0.15, 0.6) : 0;
        const fillTarget = row.after !== undefined ? lerp(row.fill, row.after, prog(t, a.SWAP - 0.05, 0.45, SNAP)) : row.fill;
        const fill = fillTarget * prog(t, a.ROWS0 + 0.12 + idx * 0.06, 0.5, SNAP);
        const trackIndex = row.n - 1;
        const champion = row.n === 3;
        return (
          <div
            key={row.n}
            style={{
              position: "absolute",
              left: BOARD_X + dx + (1 - enter) * 50,
              top: BOARD_Y + slotY,
              width: ROW_W,
              height: ROW_H,
              borderRadius: 14,
              // Verre teinté ; sous la ligne qui passe devant, un fond plein (sinon l'autre nom se lit à travers).
              background: `linear-gradient(rgba(255,255,255,${0.06 + 0.04 * lift + 0.08 * rise + 0.06 * land}), rgba(255,255,255,${0.06 + 0.04 * lift + 0.08 * rise + 0.06 * land})), rgba(26,38,48,${clamp01(lift * 3)})`,
              boxShadow: `${lift > 0.01 ? `0 ${18 * lift}px ${40 * lift}px rgba(0,0,0,${0.5 * lift}), ` : ""}inset 0 0 0 1px ${rgba(MINT, 0.12 + 0.5 * rise + 0.35 * land)}${rise > 0 ? `, 0 0 ${24 * rise}px ${rgba(MINT, 0.35 * rise)}` : ""}`,
              transform: `scale(${sc})`,
              opacity: enter * (1 - 0.4 * dim),
              zIndex: idx === 2 ? 2 : 1,
            }}
          >
            <div style={{ position: "absolute", left: 14, top: 12 }}>
              <Mascot track={robotTrack(a, trackIndex)} t={t} size={40} look={LOOKS[trackIndex]} />
            </div>
            <div style={{ position: "absolute", left: 70, top: 0, height: ROW_H, display: "flex", alignItems: "center", gap: 8, fontFamily: JAKARTA, fontWeight: 700, fontSize: 22, color: "#FFFFFF", whiteSpace: "nowrap" }}>
              Comptoir {row.n}
              {champion && (
                <svg width={18} height={18} viewBox="-1 -1 2 2" style={{ filter: `drop-shadow(0 0 6px ${rgba(GOLD, 0.8)})` }}>
                  <path d={STAR_D} fill={GOLD_HI} />
                </svg>
              )}
              {idx === 2 && swapK > 0.6 && (
                <svg width={16} height={16} viewBox="0 0 16 16" style={{ opacity: prog(t, a.SWAP + 0.25, 0.2, SNAP), transform: `translateY(${(1 - prog(t, a.SWAP + 0.25, 0.25, POP)) * 8}px)` }}>
                  <path d="M 8 2 L 14 10 L 2 10 Z" fill={MINT2} />
                </svg>
              )}
            </div>
            <div style={{ position: "absolute", left: 262, top: 28, width: 160, height: 8, borderRadius: 4, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
              <div style={{ width: `${fill * 100}%`, height: "100%", borderRadius: 4, background: champion ? `linear-gradient(90deg, ${GOLD}, ${GOLD_HI})` : `linear-gradient(90deg, ${TEAL2}, ${MINT2})`, boxShadow: `0 0 10px ${rgba(champion ? GOLD : MINT, 0.55)}` }} />
            </div>
          </div>
        );
      })}
    </>
  );
}

function Trophy({ t, x, y, k }: { t: number; x: number; y: number; k: number }) {
  if (k <= 0) return null;
  const glint = ((t * 0.9) % 1.4) / 1.4;
  return (
    <div style={{ position: "absolute", left: x - 30, top: y - 56, width: 60, height: 60, transform: `scale(${k})`, transformOrigin: "50% 100%" }}>
      <div style={{ position: "absolute", left: -50, top: -50, width: 160, height: 160, borderRadius: "50%", background: `repeating-conic-gradient(from ${t * 40}deg at 50% 50%, ${rgba(GOLD, 0.16)} 0deg 10deg, transparent 10deg 30deg)`, maskImage: "radial-gradient(circle, black 20%, transparent 70%)", WebkitMaskImage: "radial-gradient(circle, black 20%, transparent 70%)" }} />
      <svg width={60} height={60} viewBox="0 0 40 40" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", filter: `drop-shadow(0 0 10px ${rgba(GOLD, 0.7)})` }}>
        <defs>
          <linearGradient id="s10-cup" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={CREAM} />
            <stop offset="0.45" stopColor={GOLD_HI} />
            <stop offset="0.75" stopColor={GOLD} />
            <stop offset="1" stopColor={GOLD_LO} />
          </linearGradient>
          <clipPath id="s10-cup-clip">
            <path d="M 10 4 H 30 V 14 C 30 21 26 25 20 25 C 14 25 10 21 10 14 Z" />
          </clipPath>
        </defs>
        <path d="M 10 7 C 3 7 3 16 11 17 M 30 7 C 37 7 37 16 29 17" fill="none" stroke={GOLD} strokeWidth={2.4} strokeLinecap="round" />
        <path d="M 10 4 H 30 V 14 C 30 21 26 25 20 25 C 14 25 10 21 10 14 Z" fill="url(#s10-cup)" stroke={GOLD_LO} strokeWidth={0.8} />
        <rect x={18} y={25} width={4} height={6} fill={GOLD} />
        <rect x={12} y={31} width={16} height={5} rx={1.5} fill="url(#s10-cup)" stroke={GOLD_LO} strokeWidth={0.8} />
        <g clipPath="url(#s10-cup-clip)">
          <rect x={-10 + glint * 60} y={-5} width={5} height={40} fill="rgba(255,255,255,.75)" transform={`rotate(20 ${-8 + glint * 60} 15)`} />
        </g>
      </svg>
    </div>
  );
}

function Podium({ t, a }: { t: number; a: Anchors }) {
  // Gauche → droite : 2e, 1er, 3e ; montée en 3 temps : 3e, 2e, 1er.
  const blocks = [
    { rank: 2, h: 86, top: GREY, order: 1 },
    { rank: 1, h: 120, top: GOLD, order: 2 },
    { rank: 3, h: 64, top: TEAL2, order: 0 },
  ];
  return (
    <>
      {blocks.map((b, k) => {
        const at = a.PODIUM + b.order * STEP_DT;
        const g = ressort(t, at);
        if (g <= 0) return null;
        const cx = PODIUM.cx + (k - 1) * (PODIUM.w + PODIUM.gap);
        const h = b.h * g;
        return (
          <div key={b.rank} style={{ position: "absolute", left: cx - PODIUM.w / 2, top: PODIUM.base - h, width: PODIUM.w, height: h, borderRadius: "10px 10px 2px 2px", overflow: "hidden", background: `linear-gradient(180deg, ${rgba(b.top, 0.42)}, ${rgba(b.top, 0.08)})`, boxShadow: `inset 0 0 0 1px ${rgba(b.top, 0.4)}` }}>
            <div style={{ height: 10, background: b.top, boxShadow: `0 0 16px ${rgba(b.top, 0.7)}` }} />
            <div style={{ textAlign: "center", marginTop: 8, fontFamily: JAKARTA, fontWeight: 800, fontSize: 30, color: "rgba(255,255,255,.88)" }}>{b.rank}</div>
          </div>
        );
      })}
      <Trophy t={t} x={PODIUM.cx} y={PODIUM.base - 120 - 4} k={ressort(t, a.PODIUM + TROPHY_DT)} />
    </>
  );
}

function LivePill({ t, k, at }: { t: number; k: number; at: number }) {
  if (k <= 0) return null;
  // Le point bat toutes les 0,5 s dès l'arrivée de la pastille, en phase avec `at` (où tombe la grande onde).
  const ph = ((((t - at) % 0.5) + 0.5) % 0.5) / 0.5;
  const blink = 0.45 + 0.55 * (1 - ph);
  const ping = ph;
  // L'onde d'arrivée : un anneau menthe qui part de la pastille, et un éclat de lueur.
  const wave = clamp01((t - at) / 0.45);
  const glow = pulse(t, at, 2 * F, 0.06, 0.35);
  return (
    <div style={{ position: "absolute", right: 1920 - (PANEL.x + PANEL.w) + 40, top: PANEL.y + 38, height: 40, padding: "0 16px 0 14px", borderRadius: 999, display: "flex", alignItems: "center", gap: 10, background: rgba(MINT, 0.1 + 0.22 * glow), border: `1px solid ${rgba(MINT, 0.35 + 0.5 * glow)}`, boxShadow: `0 0 ${28 * glow}px ${rgba(MINT, 0.6 * glow)}`, opacity: k, transform: `scale(${0.8 + 0.2 * k})`, transformOrigin: "100% 50%" }}>
      {wave > 0 && wave < 1 && <span style={{ position: "absolute", inset: -24 * wave, borderRadius: 999, border: `2px solid ${MINT2}`, opacity: 0.8 * (1 - wave) }} />}
      <span style={{ position: "relative", width: 10, height: 10 }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: 5, background: MINT, opacity: blink, boxShadow: `0 0 10px ${MINT}` }} />
        <span style={{ position: "absolute", left: -8 * ping, top: -8 * ping, width: 10 + 16 * ping, height: 10 + 16 * ping, borderRadius: "50%", border: `1.5px solid ${MINT}`, opacity: 0.7 * (1 - ping) }} />
      </span>
      <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 18, color: "#FFFFFF" }}>En direct</span>
    </div>
  );
}

function Dashboard({ t, a }: { t: number; a: Anchors }) {
  const k = prog(t, a.DASH, 0.45, SNAP);
  if (k <= 0) return null;
  const out = 1 - prog(t, a.EXIT_T, 10 * F, EXIT);
  const right = 1920 - (PANEL.x + PANEL.w * k);
  const clip = `inset(${PANEL.y - 60}px ${right}px ${1080 - PANEL.y - PANEL.h - 60}px ${PANEL.x - 80}px)`;
  const edge = k > 0.001 && k < 0.999 ? 1 - k * k * k : 0;
  const titleK = prog(t, a.DASH + 0.12, 0.4, SNAP);
  const tituK = prog(t, a.TITU, 0.35, SNAP);
  const divK = prog(t, a.DASH + 0.2, 0.5, SNAP);
  const chipK = prog(t, a.CHIP, 12 * F, POP);
  const chartK = prog(t, a.DASH + 0.3, 0.35, SNAP);
  const sheen = prog(t, a.DASH + 0.35, 0.9, LINEAR);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: out }}>
      <div style={{ position: "absolute", inset: 0, clipPath: clip }}>
        {/* Le panneau de verre. */}
        <div style={{ position: "absolute", left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h, borderRadius: 32, background: PB.glassDark, border: "1px solid rgba(255,255,255,.14)", boxShadow: `0 30px 80px rgba(0,0,0,.45), 0 0 40px ${rgba(MINT, 0.12)}`, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,.12), transparent 38%)" }} />
          <div style={{ position: "absolute", left: -200, top: -260, width: 900, height: 700, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(PB.teal, 0.28)}, transparent 65%)` }} />
          {sheen > 0 && sheen < 1 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(110deg, transparent ${sheen * 160 - 40}%, rgba(255,255,255,.08) ${sheen * 160 - 25}%, transparent ${sheen * 160 - 10}%)` }} />}
        </div>
        {/* En-tête : TITULAIRE, Performances, Toute l'équipe, En direct. */}
        <div style={{ position: "absolute", left: PANEL.x + 44, top: PANEL.y + 34, overflow: "hidden", padding: "2px 0" }}>
          <div style={{ ...label(18), color: MINT2, transform: `translateY(${(1 - tituK) * 110}%)`, textShadow: `0 0 14px ${rgba(MINT, 0.5 * tituK)}` }}>Espace titulaire</div>
        </div>
        <div style={{ position: "absolute", left: PANEL.x + 42, top: PANEL.y + 60, overflow: "hidden", padding: "4px 6px 10px 2px" }}>
          <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 44, letterSpacing: "-0.03em", color: "#FFFFFF", lineHeight: 1.1, transform: `translateY(${(1 - titleK) * 110}%)` }}>Performances</div>
        </div>
        {chipK > 0 && (
          <div style={{ position: "absolute", left: PANEL.x + 370, top: PANEL.y + 68, height: 42, padding: "0 18px 0 14px", borderRadius: 999, display: "flex", alignItems: "center", gap: 9, background: rgba(MINT, 0.16 + 0.2 * pulse(t, a.CHIP, 3 * F, 0.05, 0.4)), border: `1px solid ${rgba(MINT, 0.45)}`, color: MINT2, fontFamily: JAKARTA, fontWeight: 700, fontSize: 20, transform: `scale(${0.6 + 0.4 * chipK})`, transformOrigin: "0 50%", opacity: clamp01(chipK * 2), whiteSpace: "nowrap", boxShadow: `0 0 ${20 * pulse(t, a.CHIP, 3 * F, 0.05, 0.5)}px ${rgba(MINT, 0.5)}` }}>
            <Users size={20} strokeWidth={2.4} />
            Toute l'équipe
          </div>
        )}
        <LivePill t={t} k={prog(t, a.LIVE, 12 * F, POP)} at={a.PING} />
        <div style={{ position: "absolute", left: PANEL.x + 44, top: PANEL.y + 134, width: PANEL.w - 88, height: 1, background: "rgba(255,255,255,.1)", transform: `scaleX(${divK})`, transformOrigin: "0 50%" }} />
        {/* Le graphique : grille sans chiffres, jours, barres, courbe. */}
        <div style={{ position: "absolute", left: BAR_X0, top: PANEL.y + 162, fontFamily: JAKARTA, fontWeight: 700, fontSize: 20, color: "rgba(255,255,255,.55)", opacity: chartK }}>Ventes conseillées · cette semaine</div>
        {[1, 2, 3].map((g) => (
          <div key={g} style={{ position: "absolute", left: BAR_X0 - 10, top: BAR_BASE - g * 90, width: 7 * BAR_W + 6 * BAR_GAP + 20, height: 0, borderTop: "1px dashed rgba(255,255,255,.08)", transform: `scaleX(${prog(t, a.DASH + 0.3 + g * 2 * F, 0.5, SNAP)})`, transformOrigin: "0 50%" }} />
        ))}
        <div style={{ position: "absolute", left: BAR_X0 - 10, top: BAR_BASE, width: 7 * BAR_W + 6 * BAR_GAP + 20, height: 2, background: "rgba(255,255,255,.16)", transform: `scaleX(${chartK})`, transformOrigin: "0 50%" }} />
        {DAYS.map((d, j) => (
          <div key={j} style={{ position: "absolute", left: barRect(j).x, top: BAR_BASE + 14, width: BAR_W, textAlign: "center", fontFamily: MONO, fontWeight: 600, fontSize: 16, color: "rgba(255,255,255,.4)", opacity: prog(t, a.DASH + 0.35 + j * F, 0.3, SNAP) }}>
            {d}
          </div>
        ))}
        <Skeleton t={t} a={a} />
        <Bars t={t} a={a} skipPillars={t >= a.EXIT_T} />
        <Curve t={t} a={a} />
        <Board t={t} a={a} />
        <Podium t={t} a={a} />
      </div>
      {/* Le liseré lumineux du déploiement. */}
      {edge > 0 && (
        <div style={{ position: "absolute", left: PANEL.x + PANEL.w * k - 2, top: PANEL.y - 20, width: 4, height: PANEL.h + 40, borderRadius: 2, background: `linear-gradient(180deg, transparent, ${MINT2} 20%, #FFFFFF 50%, ${MINT2} 80%, transparent)`, opacity: edge, boxShadow: `0 0 24px ${MINT}, 0 0 60px ${rgba(MINT, 0.6)}` }} />
      )}
    </div>
  );
}

// ---- Les piliers (sortie) ----------------------------------------------------------------------------------------
function Pillars({ t, a }: { t: number; a: Anchors }) {
  if (t < a.EXIT_T) return null;
  return (
    <>
      {PILLAR_BARS.map((j, n) => {
        const b = barRect(j);
        const delay = (n === 1 ? 0 : 2) * F;
        const k = prog(t, a.EXIT_T + delay, a.PILLAR_DUR, SNAP);
        const cx0 = b.x + b.w / 2;
        const cx = lerp(cx0, PILLAR_CX[n], k);
        const w = lerp(b.w, PILLAR.w, k);
        const top = lerp(BAR_BASE - b.h, PILLAR.cy - PILLAR.h / 2, k);
        const bottom = lerp(BAR_BASE, PILLAR.cy + PILLAR.h / 2, k);
        const glowK = pulse(t, a.EXIT_T + delay + a.PILLAR_DUR * 0.55, 2 * F, 0.03, 0.2);
        return (
          <div key={j} style={{ position: "absolute", left: cx - w / 2, top, width: w, height: bottom - top, borderRadius: `${lerp(12, 28, k)}px ${lerp(12, 28, k)}px 4px 4px`, overflow: "hidden", boxShadow: `0 0 60px ${rgba(MINT, 0.4)}` }}>
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${MINT2}, ${TEAL2})`, opacity: 1 - k }} />
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${rgba(MINT2, 0.9)} 0%, ${rgba(MINT, 0.2)} 82%, ${rgba(MINT, 0)} 100%)`, opacity: k }} />
            <div style={{ position: "absolute", left: "16%", width: "10%", top: 0, bottom: 0, background: "linear-gradient(180deg, rgba(255,255,255,.3), transparent 70%)", opacity: 0.35 * k }} />
            {glowK > 0 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(255,255,255,${0.45 * glowK}) 0%, rgba(255,255,255,${0.08 * glowK}) 80%, transparent 100%)` }} />}
          </div>
        );
      })}
    </>
  );
}

// ---- La caméra ---------------------------------------------------------------------------------------------------
const CAM_O: [number, number] = [960, 474];
const PUSH = 1.35;
/** Le plan qui pose le point (fx, fy) du monde en (960, sy) à l'écran, au zoom Z : [x, y, zoom]. */
function shot(fx: number, fy: number, Z: number, sy = 452): [number, number, number] {
  return [960 - CAM_O[0] - Z * (fx - CAM_O[0]), sy - CAM_O[1] - Z * (fy - CAM_O[1]), Z];
}
const WIDE: [number, number, number] = [0, 0, 1];
/** Le centre de la tuile i, légèrement décalé vers son robot (l'historique reste entier dans le cadre) ; une tuile du bas est
 *  posée un peu plus bas à l'écran (sinon la moitié basse du cadre reste vide), toujours au-dessus des sous-titres. */
const focusOf = (i: number, Z: number) => shot(TILES[i][0] - 20, TILES[i][1], Z, i >= 2 ? 488 : 452);

/** x, y, zoom de la caméra (sans dérive ni secousse) : plan large, poussée sur 1, 2, 3, retour au large avant le FLIP. */
function camAt(t: number, a: Anchors): { x: number; y: number; zoom: number } {
  const K: [number, [number, number, number], ((x: number) => number)?][] = [
    [a.W0, WIDE],
    [a.PUSH1_0, [0, 0, 1.015], LINEAR],
    [a.PUSH1_1, focusOf(0, PUSH), IN_OUT],
    [a.PAN2_0, focusOf(0, PUSH + 0.035), LINEAR],
    [a.PAN2_1, focusOf(1, PUSH), IN_OUT],
    [a.PAN3_0, focusOf(1, PUSH + 0.03), LINEAR],
    [a.PAN3_1, focusOf(2, PUSH), IN_OUT],
    [a.BACK_0, focusOf(2, PUSH + 0.035), LINEAR],
    [a.BACK_1, WIDE, IN_OUT],
    [a.P14E, [0, 0, 1.02], IN_OUT],
    [a.EXIT_T, WIDE, IN_OUT],
  ];
  const pick = (c: 0 | 1 | 2) => keys(t, K.map(([tk, v, e]) => (e ? [tk, v[c], e] : [tk, v[c]]) as [number, number, (x: number) => number] | [number, number]));
  return { x: pick(0), y: pick(1), zoom: pick(2) };
}
/** Un point du monde à l'écran (pour les couches posées hors caméra : onde de la grille, lueur dorée). */
function toScreen(t: number, a: Anchors, px: number, py: number): [number, number] {
  const c = camAt(t, a);
  return [CAM_O[0] + c.zoom * (px - CAM_O[0]) + c.x, CAM_O[1] + c.zoom * (py - CAM_O[1]) + c.y];
}

// ---- Le monde ----------------------------------------------------------------------------------------------------
function World({ t, a }: { t: number; a: Anchors }) {
  const settle = prog(t, a.EXIT_T - 0.3, 0.3, IN_OUT);
  const cam = {
    ...camAt(t, a),
    origin: CAM_O,
    drift: 1 - settle,
    shakes: [
      { at: a.CLOSE, amp: 6, frames: 10 },
      { at: a.FLIP + 0.5, amp: 5, frames: 10 },
      { at: a.PODIUM + 2 * STEP_DT + 0.03, amp: 3, frames: 8 },
    ],
  };
  const tile3 = TILES[2];
  const starX = tile3[0] - TW / 2 + 130 + RING_R * 0.72 + 12;
  const starY = tile3[1] + TH / 2 - 24 - (ROBOT_H - HEAD_FROM_TOP) - RING_R * 0.72 - 12;
  const headX = tile3[0] - TW / 2 + 130;
  const headY = tile3[1] + TH / 2 - 24 - (ROBOT_H - HEAD_FROM_TOP);
  const out = 1 - prog(t, a.EXIT_T, 10 * F, EXIT);
  return (
    <>
      {/* Couche lointaine : bokeh menthe flou. */}
      <Camera t={t} {...cam} depth={0.3} blur={6}>
        <div style={{ opacity: out }}>
          <Dust t={t} count={18} seed="S10-far" color={MINT} size={[6, 14]} alpha={0.12} speed={0.04} />
        </div>
      </Camera>
      <Camera t={t} {...cam}>
        <Dashboard t={t} a={a} />
        {/* Les tuiles : la dernière qui part est dessinée au-dessus pendant la recomposition. */}
        {[0, 1, 2, 3].map((i) => (
          <TileView key={i} t={t} a={a} i={i} />
        ))}
        {/* Apparition des robots 2 à 4 : petites gerbes. */}
        {[1, 2, 3].map((i) => (
          <Burst key={i} t={t} at={a.popT(i) + 2 * F} x={TILES[i][0] - TW / 2 + 130} y={TILES[i][1] + TH / 2 - 110} count={10} radius={110} seed={`S10-b${i}`} colors={[MINT, MINT2, "#FFFFFF"]} size={8} life={0.4} />
        ))}
        {/* Le challenge du Comptoir 3 se ferme. */}
        <Ring t={t} at={a.CLOSE} x={headX} y={headY} max={300} color={GOLD_HI} width={4} life={0.5} />
        <Sparks t={t} at={a.CLOSE + F} x={starX} y={starY} count={12} speed={620} spread={180} seed="S10-sp" color={GOLD_HI} len={18} life={0.5} />
        {/* « Toute l'équipe » : paillettes sur le trophée. */}
        <Sparks t={t} at={a.PODIUM + TROPHY_DT + 0.02} x={PODIUM.cx} y={PODIUM.base - 150} count={10} speed={420} spread={70} seed="S10-tr" color={GOLD_HI} len={14} life={0.45} />
        <Pillars t={t} a={a} />
      </Camera>
      {/* Avant-plan : bokeh. */}
      <Camera t={t} {...cam} depth={1.6}>
        <div style={{ opacity: out }}>
          <Dust t={t} count={14} seed="S10-near" color={MINT2} size={[3, 7]} alpha={0.14} speed={0.05} />
        </div>
      </Camera>
    </>
  );
}

export function Scene10({ t, time }: SceneProps) {
  const a = anchorsOf(time);
  const pan = (t0: number, t1: number) => t >= t0 && t < t1;
  // Flou de mouvement : obturateur court et 10 échantillons sur les panoramiques rapides (à 6 échantillons, 180°, le texte
  // des tuiles se dédoublait en copies espacées) ; la recomposition et les piliers gardent un obturateur plus ouvert.
  const camMove = pan(a.PAN2_0 + 0.05, a.PAN2_1 - 0.04) || pan(a.PAN3_0 + 0.05, a.PAN3_1 - 0.04) || pan(a.BACK_0 + 0.04, a.BACK_1);
  const objMove = (t >= a.FLIP && t < a.FLIP + 0.56) || (t >= a.EXIT_T && t < a.EXIT_T + a.PILLAR_DUR + 2 * F);
  const blur = camMove || objMove;
  const tile3 = TILES[2];
  const haloBoost = 0.25 * pulse(t, a.CLOSE, 3 * F, 0.15, 0.7);
  // La tête du Comptoir 3, à l'écran (la caméra y est poussée quand l'anneau se ferme).
  const [wx, wy] = toScreen(a.CLOSE, a, tile3[0] - TW / 2 + 130, tile3[1] + 40);
  const [gx, gy] = toScreen(t, a, tile3[0] - TW / 2 + 130, tile3[1] + 30);
  const scrim = clamp01((camAt(t, a).zoom - 1.03) / 0.25);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Backdrop t={t} kind="brand" halo={1 + haloBoost} />
      <DotGrid t={t} opacity={time.look(t).dots} wave={{ at: a.CLOSE, x: wx, y: wy, speed: 1500, color: "255,210,122", strength: 0.6 }} />
      <MotionBlur on={blur} samples={10} shutter={camMove ? 110 : 150}>
        {(tt) => <World t={tt} a={a} />}
      </MotionBlur>
      {/* Caméra poussée : un voile d'encre dans le coin haut droit, pour que la mention « Illustration · exemples » reste
          lisible par-dessus les tuiles voisines. */}
      {scrim > 0 && <AbsoluteFill style={{ pointerEvents: "none", opacity: scrim, background: `radial-gradient(ellipse 640px 200px at 1742px 54px, ${rgba(PB.ink, 0.96)} 0%, ${rgba(PB.ink, 0.9)} 42%, ${rgba(PB.ink, 0.55)} 70%, transparent 100%)` }} />}
      {/* …et la bande des sous-titres s'assombrit : les tuiles du bas (robots, historiques) ne font plus de texte sous la
          phrase, et l'œil reste sur la tuile filmée. */}
      {scrim > 0 && <AbsoluteFill style={{ pointerEvents: "none", opacity: scrim, background: `linear-gradient(180deg, transparent 0px, transparent 730px, ${rgba(PB.ink, 0.62)} 860px, ${rgba(PB.ink, 0.86)} 1080px)` }} />}
      {/* Lueur dorée plein cadre très légère quand l'anneau se ferme. */}
      <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(circle at ${gx / 19.2}% ${gy / 10.8}%, ${rgba(GOLD, 0.16 * pulse(t, a.CLOSE, 2 * F, 0.04, 0.35))}, transparent 45%)` }} />
    </AbsoluteFill>
  );
}

/** Les effets sonores de la scène (secondes du film) : cue("nom", temps, gain, vitesse). */
export const cues: SceneCues = (time) => {
  const a = anchorsOf(time);
  const out: Cue[] = [];
  // Les tuiles claquent (4 images d'écart) — les SEULS pops de ce moment (ceux de S9 sur les mêmes tuiles sont à retirer).
  for (let i = 0; i < 4; i++) out.push(cue("ui_pop", a.popT(i), 0.26, 1 + i * 0.06));
  // Rien d'autre sur « Chacun son comptoir » (phrase dite bas) : le saut du Comptoir 3 se joue à la fermeture de son anneau ;
  // le robot étourdi (au bord du cadre) n'a pas de son, l'anneau doré sonne juste après.
  // Historique : un tic par nouvelle ligne (4 tuiles déphasées de 0,06 s), jusqu'aux challenges.
  for (let i = 0; i < 4; i++) {
    const S = a.VENTES + i * 0.06;
    for (let n = 0; S + n * 0.25 < a.CHAL + 0.2; n++) out.push(cue("ui_click", S + n * 0.25, 0.15, 1.6));
  }
  // L'anneau du Comptoir 3 se ferme, et son robot saute.
  out.push(cue("sparkle_shimmer", a.CLOSE, 0.5));
  out.push(cue("robot_boing", a.CLOSE + 0.02, 0.3, 1.3));
  // Recomposition FLIP : souffle lourd et trois clics à l'arrivée des tuiles.
  out.push(cue("whoosh_heavy", a.FLIP, 0.35));
  for (let i = 1; i < 4; i++) out.push(cue("ui_click", a.FLIP + 0.5 + i * 3 * F, 0.25, 1.1));
  // « En direct » bat dans le silence entre « titulaire » et « suit » (voix à −40 dB), gain réduit : sa queue passe sous « suit ».
  out.push(cue("radar_ping", a.PING, 0.1, 1.2));
  out.push(cue("ui_pop", a.CHIP, 0.22, 1.15));
  // Classement : l'échange ; podium : trois chocs.
  out.push(cue("whoosh_fast", a.SWAP, 0.2, 1.5));
  for (let k = 0; k < 3; k++) out.push(cue("box_drop", a.PODIUM + k * STEP_DT, 0.3, 1.5));
  out.push(cue("sparkle_shimmer", a.PODIUM + TROPHY_DT + 0.02, 0.25, 1.4));
  // Montée courte et étouffée vers les piliers : la FIN du fichier doit tomber sur P15.start (0,6 dernières secondes).
  out.push(cue("reverse_riser", a.W1 - 0.6, 0.35));
  return out;
};
