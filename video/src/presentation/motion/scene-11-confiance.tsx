import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, staticFile } from "remotion";
import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { noise2D } from "@remotion/noise";
import { ArrowRight, Check, Droplets, Pill, Sun, X } from "lucide-react";
import { Mascot, type Track } from "../mascot";
import {
  Backdrop,
  Burst,
  DotGrid,
  Dust,
  EXIT,
  F,
  IN_OUT,
  INK,
  JAKARTA,
  MONO,
  MotionBlur,
  POP,
  PB,
  Ring,
  SNAP,
  Sparks,
  Word,
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
  shake,
  wobble,
} from "./kit";
import { Mention } from "./kit/mention";
import { S12_EYE, S12_RING_CENTERS, S12VisorParticles } from "./scene-12-signature";
import type { SceneWindow, Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S11 · LA CONFIANCE — voix P15 (« Chaque règle est relue par une pharmacienne. »), P16 (« Aucune fiche patient. »),
 * P17 (« Et le dernier mot reste au pharmacien. »). Fenêtre : P15.start − 0,05 → P18.start − 0,35.
 *
 *   RELAIS      les 3 piliers de S10 (300×760, centrés y = 520, x = 560 / 960 / 1360).
 *   P15.0       « Chaque règle » : la caméra plonge sur le pilier 1 (×2), qui se plie en une dalle blanche ; trois
 *               cartes-règles en jaillissent en éventail (−10° / 0° / +10°) puis se rangent en cascade (ressort).
 *   P15.1       « est relue » : une LOUPE (vraie loupe : la cascade grossie dans le verre) glisse de carte en carte ;
 *               un surligneur menthe suit, chaque carte reçoit sa coche, saute et passe de « RÈGLE 0n » à « RELUE ».
 *   P15.2       « par une pharmacienne » : sceau « VALIDÉE » qui tombe en tournant (180° → 0, ×1,5 → 1), frappe
 *               (secousse, gouttes, onde), texte circulaire « RELUE PAR UNE PHARMACIENNE » qui tourne, signature tracée.
 *   P16         panoramique vers le pilier 2, qui s'écrase en ligne de lumière ; le dossier patient en jaillit puis part
 *               en 8 lamelles et en pixels ; contour fantôme en pointillés qui défilent ; bouclier en deux moitiés qui se
 *               referment, cadenas qui tombe et se verrouille ; « AUCUNE FICHE PATIENT » mot par mot, soulignement (les mots
 *               ressortent par le haut juste avant P17, hors de la bande des sous-titres). Tenue : zoom lent, reflet.
 *   P17.0       GRUE verticale (pas un 2e fouet latéral) : la scène 3 descend du haut du cadre avec le double du pilier 3,
 *               qui remonte d'un coup et découvre la mini-carte (sans prix) et deux boutons NEUTRES « Vendu » / « Non
 *               vendu ». Le curseur du pharmacien (sa main) hésite : survol franc toutes les 0,25 s (×1,08 + halo), le
 *               robot suit des yeux au même rythme. Le projecteur entre par la gauche et traverse la scène.
 *   P17.1       le projecteur se pose sur le pharmacien (personnage plat : visage simple, blouse, croix menthe, sans nom),
 *               éteint en contour jusque-là ; le robot fait deux pas de côté puis une vraie révérence (20°, pivot au sol,
 *               bras qui balaie, yeux en cœur) ; le pharmacien répond d'un signe de tête et ouvre la main vers lui ; au même
 *               instant les deux boutons s'allument ensemble, le curseur se pose entre eux sans cliquer.
 *               « La décision vous appartient » entre dès P17.0 + 0,3 (≥ 1,2 s de lecture complète).
 *   SORTIE      le robot regarde la caméra, qui se centre sur sa visière (×1,3) ; un masque à la forme de la visière
 *               grandit ×20 en 16 images (flou) et ouvre sur le monde de S12 ; les deux yeux restent devant et deviennent
 *               les deux pilules 90×150 posées sur les « o » du logo de S12 (EYE_TARGETS).
 *   Au-dessus : trois barres de progression façon « stories » (les trois piliers de la confiance).
 * ======================================================================== */

const C = { x: 960, y: 540 };
const MINT = PB.mint;
const MINT2 = PB.mint2;
const G1 = "#C9D1DA";
const G2 = "#8A94A3";
const G3 = "#E9EEF2";

/** Le relais avec S12 : les deux « o » de « PharmaBoost » (mesurés par S12) et la taille des yeux 90×150. */
const EYE_TARGETS = S12_RING_CENTERS.map(([x, y]) => ({ x, y }));
const EYE_SIZE = { w: S12_EYE.w, h: S12_EYE.h };

// ---- Le temps -----------------------------------------------------------------------------------------------

/** L'hésitation : 4 survols de 0,25 s. */
const ALT = 0.25;
const ALT_STEPS = 4;

function anchors(time: Time, win: SceneWindow) {
  const R1 = time.A("P15", 0);
  const R2 = time.A("P15", 1);
  const R3 = time.A("P15", 2);
  const P15Z = time.Z("P15");
  const P16A = time.A("P16", 0);
  const P16Z = time.Z("P16");
  const P17A = time.A("P17", 0);
  const P17B = time.A("P17", 1);
  const P17Z = time.Z("P17");
  const END = win.end;
  const FILE = P16A - 0.15;
  const LOCK = FILE + 0.58;
  /** La grue vers le pilier 3 part sur « Et le dernier mot » (le silence après P16 laisse lire la ligne). */
  const PAN2 = P17A;
  const RETRACT = PAN2 + 0.3;
  const ALT0 = RETRACT + 0.2;
  const BOW = P17B + 0.3;
  /** Le pharmacien répond d'un signe de tête ; au même instant les deux boutons s'allument ensemble (rien n'est choisi). */
  const NOD = BOW + 0.18;
  /** L'iris s'ouvre en 13 images, le plus tard possible : la plongée prend le moins possible sur la lecture du titre. */
  const MASK = END - 14 * F;
  const DIVE = MASK - 0.12;
  return {
    START: win.start,
    R1,
    R2,
    R3,
    P15Z,
    P16A,
    P16Z,
    P17A,
    P17B,
    P17Z,
    END,
    /** Le pilier 1 se plie (10 images). */
    FOLD: R1 + 3 * F,
    /** Les cartes jaillissent en éventail. */
    FAN: R1 + 0.15,
    /** … puis se rangent en cascade. */
    SPREAD: R1 + 0.27,
    CHECK: [R2 + 0.15, R2 + 0.45, R2 + 0.75],
    SEAL: R3,
    HIT: R3 + 8 * F,
    SIGN: R3 + 0.3,
    /** Le panoramique part sur la fin de « pharmacienne » : il est posé quand « AUCUNE » monte (aucun mot dans le flou). */
    PAN1: P15Z - 0.03,
    PAN1_DUR: 0.38,
    FILE,
    SLICE: FILE + 0.2,
    SHIELD: FILE + 0.36,
    CLOSE: FILE + 0.36 + 10 * F,
    LOCK,
    LATCH: LOCK + 0.26,
    /** « AUCUNE » entre quand le panoramique se pose (plus de mot dans le flou) ; ligne pleine ≥ 1,15 s avant la grue. */
    WORDS: [P16A + 0.06, P16A + 0.17, P16A + 0.28],
    /** Les mots ressortent par le haut juste avant la grue : ils ne descendent pas dans la bande des sous-titres de P17. */
    WORDS_OUT: PAN2 - 0.14,
    PAN2,
    /** Le pilier 3, descendu avec la grue, remonte et découvre le choix. */
    RETRACT,
    /** Le titre « La décision vous appartient » (≥ 1,2 s de lecture complète avant la plongée). */
    TITLE: P17A + 0.3,
    /** Le curseur du pharmacien hésite : Vendu, Non vendu, Vendu, Non vendu (toutes les ALT s), puis se pose entre les deux. */
    ALT0,
    ALT_END: Math.min(ALT0 + ALT_STEPS * ALT, NOD),
    /** Le projecteur entre par le côté, traverse la scène, puis se pose sur le pharmacien sur « reste au ». */
    BEAM_IN: P17A + 0.4,
    BEAM: P17B,
    /** Deux petits sauts de côté (le robot laisse la place), puis la révérence. */
    HOP1: P17B,
    HOP2: P17B + 0.15,
    BOW,
    BOW_BACK: BOW + 0.4,
    NOD,
    LOOK: DIVE - 0.06,
    DIVE,
    MASK,
    /** La mention « Illustration · exemples » (coin haut droit) tant que la mini-carte produit du pilier 3 est à l'écran :
     * celle de l'orchestrateur s'arrête à P14.end + 0,3, avant S11. */
    MENTION_FROM: RETRACT - 0.05,
    MENTION_TO: DIVE + 0.1,
  };
}
type A = ReturnType<typeof anchors>;

// ---- La caméra ----------------------------------------------------------------------------------------------

const PILLAR_X = [560, 960, 1360];
const PILLAR = { w: 300, h: 760, cy: 520 };

/** La grue du passage 2 → 3 : tout monte de CRANE px, le pilier 3 et sa scène descendent du haut du cadre. */
const CRANE = 1100;
/** La grue part vite et se pose longuement : le pilier 2 quitte le cadre aussitôt, la scène 3 arrive sans trou noir. */
const CRANE_EASE = Easing.bezier(0.4, 0, 0.1, 1);

/** Le monde : zoom ×2 sur le pilier 1, panoramique vers 2, puis GRUE verticale vers 3. Point du monde p → 960 + Z(p − F) + o. */
function camera(t: number, a: A) {
  const kz = prog(t, a.R1, 0.5, SNAP);
  const p1 = prog(t, a.PAN1, a.PAN1_DUR, IN_OUT);
  const p2 = prog(t, a.PAN2, 0.5, CRANE_EASE);
  const Z = lerp(1, 2, kz);
  const Fx = lerp(960, 560, kz) + 400 * p1;
  const Fy = lerp(540, 520, kz) - (CRANE / Z) * p2;
  let ox = 3 * noise2D("s11-cam", t * 0.15, 0);
  let oy = 3 * noise2D("s11-cam", 0, t * 0.15 + 5.1);
  for (const s of [shake(t, a.HIT, 4, 10), shake(t, a.CLOSE, 7, 12), shake(t, a.LATCH, 4, 10)]) {
    ox += s.x;
    oy += s.y;
  }
  /** Les contenus plein cadre des piliers glissent en avant-plan (parallaxe 1,6). */
  const panX = -1280 * p1;
  return { kz, p1, p2, Z, Fx, Fy, ox, oy, panX };
}
type Cam = ReturnType<typeof camera>;

const worldX = (cam: Cam, x: number) => 960 + cam.Z * (x - cam.Fx) + cam.ox;

/** Décalage de la station i (0, 1, 2) à l'écran : 1 → 2 en panoramique, 2 → 3 en grue (3 descend du haut). */
const stationX = (cam: Cam, i: number) => (i < 2 ? cam.panX + 1280 * i : 0) + cam.ox * 1.3;
const stationY = (cam: Cam, i: number) => (i < 2 ? CRANE * cam.p2 : -CRANE * (1 - cam.p2)) + cam.oy * 1.3;

// ---- Petites aides ------------------------------------------------------------------------------------------

const abs = (x: number, y: number, w: number, h: number, extra?: CSSProperties): CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h, ...extra });

/** Petit saut d'une carte validée : monte de ~12 px, rebondit. */
function hop(t: number, at: number, amp = 18) {
  const u = t - at;
  if (u < 0 || u > 0.7) return 0;
  return -amp * Math.exp(-7 * u) * Math.sin((2 * Math.PI * u) / 0.3);
}

function Layer({ x = 0, y = 0, children, style }: { x?: number; y?: number; children: ReactNode; style?: CSSProperties }) {
  return <AbsoluteFill style={{ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`, ...style }}>{children}</AbsoluteFill>;
}

/** Mots qui montent un à un depuis leur ligne de base (masque), chacun à son instant. */
function RiseWords({ t, words, ats, x, baseline, size, colors, weight = 800, tracking = "-0.03em", gap = 0.26, outAt }: { t: number; words: string[]; ats: number[]; x: number; baseline: number; size: number; colors: string[]; weight?: number; tracking?: string; gap?: number; outAt?: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: baseline - size * 0.78, transform: "translateX(-50%)", display: "flex", gap: size * gap, whiteSpace: "nowrap", fontFamily: JAKARTA, fontWeight: weight, fontSize: size, letterSpacing: tracking, lineHeight: 1 }}>
      {words.map((w, i) => {
        const k = prog(t, ats[i], 18 * F, SNAP);
        // Sortie par le haut de leur masque (mot après mot) : elles quittent la bande des sous-titres avant la phrase suivante.
        const out = outAt === undefined ? 0 : prog(t, outAt + i * 2 * F, 9 * F, EXIT);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", padding: `${size * 0.1}px ${size * 0.04}px ${size * 0.2}px`, margin: `${-size * 0.1}px ${-size * 0.04}px ${-size * 0.2}px` }}>
            <span style={{ display: "inline-block", transform: `translateY(${((1 - k) * 118 - out * 118).toFixed(2)}%)`, color: colors[i] }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
}

// ---- Fond -------------------------------------------------------------------------------------------------

function Background({ t, a, cam }: { t: number; a: A; cam: Cam }) {
  const bx = -400 * cam.p1 * 0.6 - 160 * cam.kz + cam.ox * 0.3;
  const by = CRANE * 0.35 * cam.p2 + cam.oy * 0.3;
  const bs = 1 + 0.14 * cam.kz;
  return (
    <>
      <Backdrop t={t} kind="brand" halo={0.6} />
      <div style={{ position: "absolute", left: -420, top: -720, width: 2760, height: 2100, transform: `translate(${bx.toFixed(2)}px, ${by.toFixed(2)}px) scale(${bs.toFixed(4)})` }}>
        <DotGrid t={t} opacity={0.08} drift={9} />
      </div>
      {/* Mot géant en contour, derrière les cartes (parallaxe .6). */}
      <Layer x={cam.panX * 0.6 + cam.ox * 0.6} y={cam.oy * 0.6} style={{ opacity: 1 - cam.p1 }}>
        <Word t={t} at={a.R2 - 0.02} text="RELUE" x={1010} y={560} size={430} enter="rise" stagger={2} outline={{ width: 2, color: rgba(MINT, 0.3) }} style={{ transform: `translate(-50%, -50%) translateX(${(-30 * (t - a.R2)).toFixed(2)}px)` }} />
      </Layer>
    </>
  );
}

// ---- Les piliers (monde) --------------------------------------------------------------------------------

/** Le pilier tel que S10 le laisse (même dégradé, mêmes rayons, même filet de lumière). */
const PILLAR_BG = `linear-gradient(180deg, ${rgba(MINT2, 0.9)} 0%, ${rgba(MINT, 0.2)} 82%, ${rgba(MINT, 0)} 100%)`;

function Pillars({ t, a, cam }: { t: number; a: A; cam: Cam }) {
  const fold = prog(t, a.FOLD, 10 * F, SNAP);
  const gone1 = prog(t, a.FAN + 2 * F, 7 * F, SNAP);
  // Les piliers 2 et 3 s'éteignent en lueur pendant la plongée sur le pilier 1 (vite : pas de colonne nette dans le cadre).
  const dim = prog(t, a.R1, 0.2, IN_OUT);
  // Pilier 2 : net pendant le panoramique, puis écrasé en ligne de lumière d'où sort le dossier.
  const focus2 = prog(t, a.PAN1, 0.25, SNAP);
  const crush = prog(t, a.FILE - 0.1, 7 * F, SNAP);
  const line2 = prog(t, a.FILE + 2 * F, 12 * F, SNAP);
  // Pilier 3 : reste dans l'ombre, puis part vers le bas avec la grue (son double descend du haut, en station 3).
  const gone3 = prog(t, a.PAN2, 0.3, SNAP);
  // Un pilier hors foyer n'est plus qu'une LUEUR : le rectangle s'efface (op × (1 − flou)) au profit d'un halo radial sans
  // aucun bord — plus de bande claire ni de couture verticale dans le cadre (ni de stries pendant le panoramique flou).
  const items = [
    { i: 0, sx: 1 + 0.12 * fold, sy: lerp(1, 0.2, fold), op: 1 - gone1, blur: 0, white: fold, origin: "50% 50%" },
    { i: 1, sx: 1 + 0.5 * crush, sy: lerp(1, 0.012, crush), op: 1 - line2, blur: dim * (1 - focus2), white: crush, origin: "50% 50%" },
    { i: 2, sx: 1, sy: 1, op: 1 - gone3, blur: dim, white: 0, origin: "50% 0%" },
  ];
  return (
    <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${(960 - cam.Z * cam.Fx + cam.ox).toFixed(2)}px, ${(540 - cam.Z * cam.Fy + cam.oy).toFixed(2)}px) scale(${cam.Z.toFixed(4)})` }}>
      {items.map((p) =>
        p.op * p.blur <= 0.01 ? null : (
          <div
            key={`glow-${p.i}`}
            style={{
              ...abs(PILLAR_X[p.i] - PILLAR.w * 1.1, PILLAR.cy - PILLAR.h * 0.62, PILLAR.w * 2.2, PILLAR.h * 1.1),
              background: `radial-gradient(ellipse 50% 50% at 50% 42%, ${rgba(MINT, 0.17)} 0%, ${rgba(MINT, 0.07)} 42%, transparent 100%)`,
              opacity: p.op * p.blur,
            }}
          />
        ),
      )}
      {items.map((p) =>
        p.op * (1 - p.blur) <= 0.001 || p.sy <= 0.001 ? null : (
          <div
            key={p.i}
            style={{
              ...abs(PILLAR_X[p.i] - PILLAR.w / 2, PILLAR.cy - PILLAR.h / 2, PILLAR.w, PILLAR.h),
              borderRadius: "28px 28px 4px 4px",
              background: PILLAR_BG,
              boxShadow: p.blur > 0.02 ? undefined : `0 0 60px ${rgba(MINT, 0.4 + 0.4 * p.white)}`,
              opacity: p.op * (1 - p.blur),
              filter: p.blur > 0.02 ? `blur(${(24 * p.blur).toFixed(1)}px)` : undefined,
              transformOrigin: p.origin,
              transform: `scale(${p.sx.toFixed(4)}, ${p.sy.toFixed(4)})`,
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", left: "16%", width: "10%", top: 0, bottom: 0, background: "linear-gradient(180deg, rgba(255,255,255,.3), transparent 70%)", opacity: 0.35 }} />
            <div style={{ position: "absolute", inset: 0, background: "#FFFFFF", opacity: 0.85 * p.white }} />
            {/* Le pli : deux plis horizontaux annoncent les trois cartes. */}
            {p.i === 0 &&
              p.white > 0.05 &&
              [1, 2].map((n) => <div key={n} style={{ position: "absolute", left: 0, right: 0, top: `${(n * 100) / 3}%`, height: 12 / Math.max(0.2, p.sy), marginTop: -6 / Math.max(0.2, p.sy), background: rgba(PB.teal2, 0.75), opacity: p.white }} />)}
            {/* Reflet qui descend dans le pilier (vie permanente). */}
            <div style={{ position: "absolute", left: 0, right: 0, height: 160, top: (((t - a.R1) * 900) % 1100) - 160, background: `linear-gradient(180deg, transparent, ${rgba("#FFFFFF", 0.28)}, transparent)`, opacity: t < a.R1 ? 0 : 1 }} />
          </div>
        ),
      )}
      {/* La ligne de lumière du pilier 2, qui s'étire et s'éteint. */}
      {crush > 0.95 && line2 < 1 && (
        <div style={{ ...abs(PILLAR_X[1] - 230 - 300 * line2, PILLAR.cy - 3, 460 + 600 * line2, 6), borderRadius: 6, background: `linear-gradient(90deg, transparent, #FFFFFF, transparent)`, opacity: 1 - line2, boxShadow: `0 0 30px ${MINT}` }} />
      )}
    </AbsoluteFill>
  );
}

// ---- Station 1 : les règles ---------------------------------------------------------------------------

const RULES = [
  { from: "Antibiotique", to: "probiotique", Icon: Pill },
  { from: "Doxycycline", to: "protection solaire", Icon: Sun },
  { from: "Rhume", to: "sérum physiologique", Icon: Droplets },
];
const CARD = { w: 740, h: 150 };
const CARD_POS = [
  { x: 770, y: 346, r: -2 },
  { x: 810, y: 520, r: 0 },
  { x: 850, y: 694, r: 2 },
];
const FAN_ANGLES = [-10, 0, 10];

/** La pose d'une carte : éventail autour du pilier qui se plie, puis cascade (ressort). */
function cardPose(t: number, a: A, k: number, pivotX: number) {
  const pop = prog(t, a.FAN + k * 3 * F, 9 * F, POP);
  const s = ressort(t, a.SPREAD + k * 3 * F);
  const th = (FAN_ANGLES[k] * Math.PI) / 180;
  const pivotY = 820;
  const fx = pivotX + Math.sin(th) * 300;
  const fy = pivotY - Math.cos(th) * 300;
  const P = CARD_POS[k];
  return {
    x: lerp(fx, P.x, s),
    y: lerp(fy, P.y, s) + hop(t, a.CHECK[k]) + wobble(t, 11 + k, 2.5, 0.8) * s,
    r: lerp(FAN_ANGLES[k], P.r, s),
    sc: lerp(0.5, 0.78, pop) + (1 - 0.78) * s,
    op: clamp01((t - a.FAN - k * 3 * F) / (3 * F)),
  };
}

function RuleCard({ t, a, k, pivotX }: { t: number; a: A; k: number; pivotX: number }) {
  const p = cardPose(t, a, k, pivotX);
  if (p.op <= 0) return null;
  const R = RULES[k];
  const at = a.CHECK[k];
  const mark = prog(t, at - 0.22, 0.26, IN_OUT);
  const done = prog(t, at, 8 * F, POP);
  const tick = evolvePath(prog(t, at + 2 * F, 8 * F, SNAP), "M 13 23 L 20 30 L 32 16");
  const lit = pulse(t, at, 0.05, 0.05, 0.4);
  const shine = prog(t, at + 4 * F, 0.5, IN_OUT);
  const relue = prog(t, at + 3 * F, 6 * F, SNAP);
  return (
    <div
      style={{
        ...abs(p.x - CARD.w / 2, p.y - CARD.h / 2, CARD.w, CARD.h),
        transform: `rotate(${p.r.toFixed(3)}deg) scale(${p.sc.toFixed(4)})`,
        opacity: p.op,
        borderRadius: 20,
        background: "rgba(255,255,255,.96)",
        boxShadow: `0 0 0 ${(2.5 * done).toFixed(2)}px ${MINT}, 0 0 ${(40 * lit + 18 * done).toFixed(1)}px ${rgba(MINT, 0.35 * done + 0.4 * lit)}, 0 30px 80px rgba(0,0,0,.45)`,
      }}
    >
      <div style={{ position: "absolute", inset: 0, borderRadius: 20, overflow: "hidden" }}>
        {/* Reflet au moment de la coche. */}
        {shine > 0 && shine < 1 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(105deg, transparent ${shine * 160 - 40}%, rgba(54,232,200,.22) ${shine * 160 - 25}%, transparent ${shine * 160 - 10}%)` }} />}
      </div>
      {/* Pictogramme de la famille. */}
      <div style={{ ...abs(28, 39, 72, 72), borderRadius: 18, background: `linear-gradient(160deg, ${rgba(MINT, 0.22)}, ${rgba(PB.teal2, 0.16)})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <R.Icon size={36} color={PB.teal2} strokeWidth={2.4} />
      </div>
      {/* Étiquette : « RÈGLE 0n » puis « RELUE ». */}
      <div style={{ ...abs(124, 30, 300, 17), overflow: "hidden" }}>
        <div style={{ ...label(15), color: G2, transform: `translateY(${-130 * relue}%)`, opacity: 1 - relue }}>RÈGLE 0{k + 1}</div>
        <div style={{ ...label(15), color: PB.teal2, position: "absolute", top: 0, transform: `translateY(${130 * (1 - relue)}%)`, opacity: relue }}>RELUE ✓</div>
      </div>
      {/* La règle, avec le surligneur menthe qui suit la loupe. */}
      <div style={{ position: "absolute", left: 124, top: 58, display: "flex", alignItems: "center", gap: 12, fontFamily: JAKARTA, fontWeight: 700, fontSize: 30, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap" }}>
        <div style={{ position: "absolute", left: -8, top: 2, bottom: -2, width: `calc(${(mark * 100).toFixed(2)}% + 16px)`, borderRadius: 10, background: rgba(MINT, 0.26), opacity: mark > 0 ? 1 : 0 }} />
        <span style={{ position: "relative" }}>{R.from}</span>
        <ArrowRight size={30} color={MINT} strokeWidth={3.2} style={{ position: "relative" }} />
        <span style={{ position: "relative" }}>{R.to}</span>
      </div>
      {/* La coche. */}
      <div style={{ ...abs(CARD.w - 28 - 44, (CARD.h - 44) / 2, 44, 44) }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 44, border: `2px dashed ${rgba(G2, 0.55)}`, opacity: 1 - done }} />
        {done > 0 && (
          <svg width={44} height={44} viewBox="0 0 44 44" style={{ position: "absolute", inset: 0, overflow: "visible", transform: `scale(${done.toFixed(3)})` }}>
            <circle cx={22} cy={22} r={22} fill={MINT} />
            <path d="M 13 23 L 20 30 L 32 16" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={tick.strokeDasharray} strokeDashoffset={tick.strokeDashoffset} />
          </svg>
        )}
      </div>
    </div>
  );
}

/** La loupe : son centre suit un chemin qui MARQUE UN ARRÊT sur chaque carte (0,12 s, le temps de lire la règle grossie)
 * autour de sa coche, puis saute à la suivante. */
function lensPos(t: number, a: A) {
  const [c1, c2, c3] = a.CHECK;
  const x = keys(t, [
    [a.R2 - 0.14, 300],
    [c1 - 0.08, 700, IN_OUT],
    [c1 + 0.04, 712],
    [c2 - 0.08, 760, IN_OUT],
    [c2 + 0.04, 772],
    [c3 - 0.08, 820, IN_OUT],
    [c3 + 0.04, 832],
    [c3 + 0.3, 1240, IN_OUT],
  ]);
  const y = keys(t, [
    [a.R2 - 0.14, 238],
    [c1 - 0.08, 350, IN_OUT],
    [c1 + 0.04, 348],
    [c2 - 0.08, 524, IN_OUT],
    [c2 + 0.04, 522],
    [c3 - 0.08, 698, IN_OUT],
    [c3 + 0.04, 696],
    [c3 + 0.3, 868, IN_OUT],
  ]);
  const show = prog(t, a.R2 - 0.14, 8 * F, POP) * (1 - prog(t, c3 + 0.12, 0.2, EXIT));
  return { x, y, show };
}

const LENS_R = 64;

function Lens({ t, a }: { t: number; a: A }) {
  const L = lensPos(t, a);
  if (L.show <= 0.001) return null;
  return (
    <div style={{ ...abs(L.x - 70, L.y - 70, 140, 140), transform: `scale(${L.show.toFixed(3)}) rotate(${(-8 + 4 * Math.sin(t * 7)).toFixed(2)}deg)`, filter: "drop-shadow(0 18px 30px rgba(0,0,0,.45))" }}>
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ overflow: "visible" }}>
        {/* Manche 70×16. */}
        <g transform="translate(70 70) rotate(45)">
          <rect x={66} y={-8} width={70} height={16} rx={8} fill="#FFFFFF" />
          <rect x={66} y={-8} width={14} height={16} rx={3} fill={G1} />
        </g>
        <circle cx={70} cy={70} r={LENS_R - 1} fill="rgba(255,255,255,.06)" />
        <circle cx={70} cy={70} r={LENS_R} fill="none" stroke="#FFFFFF" strokeWidth={10} />
        <circle cx={70} cy={70} r={LENS_R + 6} fill="none" stroke={rgba(MINT, 0.5)} strokeWidth={1.5} />
        <path d="M 30 52 A 44 44 0 0 1 58 28" fill="none" stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={5} strokeLinecap="round" />
      </svg>
    </div>
  );
}

const SEAL_POS = { x: 1490, y: 496 };
const SIGN_D =
  "M 8 58 C 18 30, 34 14, 40 30 C 46 46, 30 66, 40 64 C 52 62, 58 30, 66 34 C 74 38, 66 60, 76 58 C 88 56, 92 36, 100 40 C 108 44, 100 60, 110 58 C 124 55, 128 24, 138 28 C 148 32, 136 62, 150 58 C 162 55, 170 38, 180 42 C 190 46, 184 60, 196 56 C 210 52, 222 30, 236 34 C 246 37, 240 50, 252 44 M 30 74 C 90 66, 170 68, 250 62";
const SIGN_LEN = getLength(SIGN_D);

function Seal({ t, a }: { t: number; a: A }) {
  if (t < a.SEAL) return null;
  const s = ressort(t, a.SEAL);
  const sc = 1.5 - 0.5 * s;
  const rot = 180 * (1 - s);
  const op = clamp01((t - a.SEAL) / (3 * F));
  const hit = pulse(t, a.HIT, 0.03, 0.04, 0.45);
  const spin = (t - a.SEAL) * 22;
  const breathe = 1 + 0.012 * Math.sin((t - a.HIT) * 5);
  const sign = prog(t, a.SIGN, 20 * F, IN_OUT);
  const ev = evolvePath(sign, SIGN_D);
  const nib = sign > 0 && sign < 1 ? getPointAtLength(SIGN_D, SIGN_LEN * sign) : null;
  // Pendant la tenue, un reflet balaie le sceau.
  const glint = prog(t, a.SIGN + 0.3, 0.45, IN_OUT);
  return (
    <>
      {/* L'ombre du tampon, qui se resserre à l'approche. */}
      <div style={{ ...abs(SEAL_POS.x - 120, SEAL_POS.y - 110, 240, 240), borderRadius: "50%", background: "radial-gradient(circle, rgba(0,0,0,.55), transparent 70%)", transform: `translate(${(24 * (sc - 1)).toFixed(1)}px, ${(40 * (sc - 1) + 14).toFixed(1)}px) scale(${(0.8 + 0.4 * (sc - 1)).toFixed(3)})`, opacity: op * 0.8 }} />
      <div style={{ ...abs(SEAL_POS.x - 160, SEAL_POS.y - 160, 320, 320), opacity: op, transform: `rotate(${rot.toFixed(2)}deg) scale(${(sc * breathe).toFixed(4)})`, filter: `drop-shadow(0 0 ${(14 + 30 * hit).toFixed(1)}px ${rgba(MINT, 0.45 + 0.4 * hit)})` }}>
        <svg width={320} height={320} viewBox="-160 -160 320 320" style={{ overflow: "visible" }}>
          <defs>
            <path id="s11-seal-arc" d="M -134 0 A 134 134 0 1 1 134 0 A 134 134 0 1 1 -134 0" />
            <clipPath id="s11-seal-clip">
              <circle r={114} />
            </clipPath>
            <linearGradient id="s11-glint" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
              <stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.55} />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <circle r={110} fill="rgba(11,15,20,.72)" stroke={MINT} strokeWidth={8} />
          <circle r={95} fill="none" stroke={MINT} strokeWidth={2} />
          {Array.from({ length: 24 }, (_, i) => {
            const an = (i / 24) * Math.PI * 2;
            return <circle key={i} cx={Math.cos(an) * 102.5} cy={Math.sin(an) * 102.5} r={1.6} fill={rgba(MINT, 0.6)} />;
          })}
          <path d="M -22 -26 L -6 -10 L 24 -42" fill="none" stroke={MINT} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          <text x={0} y={34} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={34} letterSpacing="0.02em" fill={MINT}>
            VALIDÉE
          </text>
          {glint > 0 && glint < 1 && (
            <g clipPath="url(#s11-seal-clip)">
              <rect x={-230 + 460 * glint - 40} y={-200} width={80} height={400} fill="url(#s11-glint)" transform="rotate(24)" />
            </g>
          )}
          <g transform={`rotate(${spin.toFixed(2)})`}>
            <text fontFamily={JAKARTA} fontWeight={700} fontSize={15} letterSpacing="0.18em" fill="rgba(255,255,255,.62)">
              <textPath href="#s11-seal-arc" textLength={2 * Math.PI * 134 - 6} lengthAdjust="spacing">
                RELUE PAR UNE PHARMACIENNE • RELUE PAR UNE PHARMACIENNE •
              </textPath>
            </text>
          </g>
        </svg>
      </div>
      {/* Les gouttes et l'onde de la frappe. */}
      <Ring t={t} at={a.HIT} x={SEAL_POS.x} y={SEAL_POS.y} max={420} width={3} life={0.5} />
      <Burst t={t} at={a.HIT} x={SEAL_POS.x} y={SEAL_POS.y} count={8} radius={190} colors={[MINT, MINT2, "#FFFFFF"]} size={13} life={0.5} seed="s11-drops" />
      {/* La signature, tracée sous le sceau. */}
      <div style={{ ...abs(SEAL_POS.x - 130, SEAL_POS.y + 168, 260, 80) }}>
        <svg width={260} height={80} viewBox="0 0 260 80" style={{ overflow: "visible" }}>
          <path d={SIGN_D} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />
          {nib && (
            <>
              <circle cx={nib.x} cy={nib.y} r={9} fill={rgba(MINT, 0.3)} />
              <circle cx={nib.x} cy={nib.y} r={4} fill={MINT2} />
            </>
          )}
        </svg>
      </div>
    </>
  );
}

function Station1({ t, a, cam }: { t: number; a: A; cam: Cam }) {
  if (t < a.FAN - F || t > a.PAN1 + 0.6) return null;
  // Le pivot de l'éventail : là où se trouve le pilier 1 quand il se plie.
  const pivotX = worldX(camera(a.FAN, a), PILLAR_X[0]);
  const L = lensPos(t, a);
  const exit = prog(t, a.PAN1 + 0.15, 0.3, SNAP);
  // La tenue vit : lent zoom ×1 → ×1,04 du sceau jusqu'au panoramique.
  const hold = 1 + 0.04 * clamp01((t - a.SIGN) / (a.PAN1 + 0.3 - a.SIGN));
  const cards = (
    <>
      {[2, 1, 0].map((k) => (
        <RuleCard key={k} t={t} a={a} k={k} pivotX={pivotX} />
      ))}
    </>
  );
  // La loupe : sous le verre, les cartes d'origine sont effacées (masque troué) et remplacées par leur copie exacte
  // grossie autour du centre du verre — plus de lettres doublées ni décalées.
  const lensOn = L.show > 0.05;
  const lr = LENS_R * L.show - 5;
  const hole = lensOn ? `radial-gradient(circle ${lr.toFixed(1)}px at ${L.x.toFixed(1)}px ${L.y.toFixed(1)}px, transparent ${(lr - 0.5).toFixed(1)}px, #000 ${(lr + 0.5).toFixed(1)}px)` : undefined;
  const S = 1.45;
  return (
    <Layer x={stationX(cam, 0)} y={stationY(cam, 0)} style={{ opacity: 1 - exit }}>
      <AbsoluteFill style={{ transformOrigin: "1100px 520px", transform: `scale(${hold.toFixed(4)})` }}>
        {/* L'éclair du pilier qui se plie. */}
        <Ring t={t} at={a.FAN} x={pivotX} y={540} max={900} width={5} life={0.45} />
        <Sparks t={t} at={a.FAN} x={pivotX} y={540} count={26} speed={1300} spread={180} seed="s11-fan" life={0.45} />
        <AbsoluteFill style={{ maskImage: hole, WebkitMaskImage: hole }}>{cards}</AbsoluteFill>
        {/* Dans le verre de la loupe : la cascade grossie ×1,45 autour du centre du verre, coupée en cercle. */}
        {lensOn && (
          <AbsoluteFill style={{ clipPath: `circle(${lr.toFixed(1)}px at ${L.x.toFixed(1)}px ${L.y.toFixed(1)}px)` }}>
            <AbsoluteFill style={{ background: "rgba(11,15,20,.18)" }} />
            <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${(-L.x * (S - 1)).toFixed(2)}px, ${(-L.y * (S - 1)).toFixed(2)}px) scale(${S})`, filter: "brightness(1.06) saturate(1.15)" }}>{cards}</AbsoluteFill>
            <AbsoluteFill style={{ background: `radial-gradient(circle ${lr.toFixed(1)}px at ${(L.x - 18).toFixed(1)}px ${(L.y - 22).toFixed(1)}px, rgba(255,255,255,.14), transparent 70%)` }} />
            {/* Le bord du verre : une fine ombre intérieure (on lit une lentille, pas un décalage). */}
            <AbsoluteFill style={{ background: `radial-gradient(circle ${lr.toFixed(1)}px at ${L.x.toFixed(1)}px ${L.y.toFixed(1)}px, transparent ${(lr - 12).toFixed(1)}px, rgba(11,15,20,.28) ${lr.toFixed(1)}px)` }} />
          </AbsoluteFill>
        )}
        <Lens t={t} a={a} />
        {a.CHECK.map((c, k) => (
          <Sparks key={k} t={t} at={c + 4 * F} x={CARD_POS[k].x + CARD.w / 2 - 50} y={CARD_POS[k].y} count={12} speed={620} spread={180} len={18} life={0.4} seed={`s11-chk${k}`} />
        ))}
        <Seal t={t} a={a} />
      </AbsoluteFill>
    </Layer>
  );
}

// ---- Station 2 : aucune fiche patient ------------------------------------------------------------------

const FILE_POS = { x: 960, y: 440, w: 360, h: 290 };

function Dossier() {
  return (
    <svg width={FILE_POS.w} height={FILE_POS.h} viewBox="0 0 360 290" style={{ display: "block", overflow: "visible" }}>
      <rect x={0} y={0} width={150} height={44} rx={12} fill="#AEB8C3" />
      <rect x={0} y={24} width={360} height={266} rx={18} fill={G1} />
      <rect x={24} y={52} width={312} height={212} rx={12} fill={G3} />
      <circle cx={100} cy={126} r={34} fill={G2} />
      <path d="M 46 230 C 46 186, 70 170, 100 170 C 130 170, 154 186, 154 230 Z" fill={G2} />
      {[
        [112, 120],
        [142, 92],
        [172, 112],
        [202, 72],
      ].map(([y, w], i) => (
        <rect key={i} x={186} y={y} width={w} height={13} rx={6.5} fill={G2} opacity={0.62} />
      ))}
    </svg>
  );
}

const SHIELD = { w: 420, h: 500, cx: 960, cy: 452 };
const SHIELD_OUTER = "M 210 8 C 270 40, 340 50, 400 52 L 400 214 C 400 340, 316 436, 210 492 C 104 436, 20 340, 20 214 L 20 52 C 80 50, 150 40, 210 8 Z";
const HALF_L_FILL = "M 210 8 C 150 40, 80 50, 20 52 L 20 214 C 20 340, 104 436, 210 492 Z";
const HALF_L_STROKE = "M 210 8 C 150 40, 80 50, 20 52 L 20 214 C 20 340, 104 436, 210 492";
const HALF_R_FILL = "M 210 8 C 270 40, 340 50, 400 52 L 400 214 C 400 340, 316 436, 210 492 Z";
const HALF_R_STROKE = "M 210 8 C 270 40, 340 50, 400 52 L 400 214 C 400 340, 316 436, 210 492";
const SHIELD_INNER = "M 210 40 C 262 66, 322 76, 370 78 L 370 216 C 370 324, 298 408, 210 456 C 122 408, 50 324, 50 216 L 50 78 C 98 76, 158 66, 210 40 Z";

function Station2({ t, a, cam }: { t: number; a: A; cam: Cam }) {
  if (t < a.PAN1 || t > a.PAN2 + 0.6) return null;
  const X = stationX(cam, 1);
  // Part vers le bas avec la grue : le bouclier reste visible dans le mouvement (pas d'image vide), les mots sont déjà
  // ressortis par le haut (WORDS_OUT) et ne traversent donc pas les sous-titres de P17.
  const exit = prog(t, a.PAN2 + 0.12, 0.25, SNAP);
  // La tenue vit : lent zoom ×1 → ×1,04 du verrouillage jusqu'à la grue.
  const hold = 1 + 0.04 * clamp01((t - a.LATCH) / (a.PAN2 + 0.3 - a.LATCH));
  // Le dossier.
  const pop = prog(t, a.FILE, 12 * F, POP);
  const fileOp = clamp01((t - a.FILE) / (3 * F));
  const bands = 8;
  const bh = FILE_POS.h / bands;
  const fx = FILE_POS.x - FILE_POS.w / 2;
  const fy = FILE_POS.y - FILE_POS.h / 2;
  // Bouclier, cadenas.
  const close = prog(t, a.SHIELD, 10 * F, POP);
  const shieldOp = clamp01((t - a.SHIELD) / (4 * F));
  const closed = t >= a.CLOSE;
  const seam = pulse(t, a.CLOSE, 0.03, 0.03, 0.35);
  const latchFlash = pulse(t, a.LATCH, 0.03, 0.05, 0.5);
  const drop = prog(t, a.LOCK, 9 * F, SNAP);
  const land = a.LOCK + 9 * F;
  const sq = t >= land ? 1 - 0.14 * Math.exp(-12 * (t - land)) * Math.cos(30 * (t - land)) : 1;
  const latch = prog(t, a.LATCH, 4 * F, SNAP);
  const sweep = t > a.LATCH ? ((t - a.LATCH) / 0.9) % 1 : -1;
  const ghost = prog(t, a.SLICE + 0.1, 8 * F, SNAP) * (1 - prog(t, a.LATCH + 0.1, 0.3, SNAP));
  const breathe = closed ? 1 + 0.01 * Math.sin((t - a.CLOSE) * 4.5) : 1;
  const underline = prog(t, a.WORDS[2] + 0.28, 16 * F, IN_OUT);
  // Le soulignement s'efface de gauche à droite avec la sortie des mots.
  const wipe = Math.min(underline, prog(t, a.WORDS_OUT, 12 * F, IN_OUT));
  return (
    <Layer x={X} y={stationY(cam, 1)} style={{ opacity: 1 - exit }}>
      <AbsoluteFill style={{ transformOrigin: "960px 600px", transform: `scale(${hold.toFixed(4)})` }}>
      {/* Halo derrière le bouclier. */}
      <div style={{ ...abs(SHIELD.cx - 420, SHIELD.cy - 420, 840, 840), borderRadius: "50%", background: `radial-gradient(circle, ${rgba(MINT, 0.16 * shieldOp + 0.12 * latchFlash)}, transparent 65%)` }} />
      {/* Le dossier, entier puis en lamelles. */}
      {t >= a.FILE && t < a.SLICE && (
        <div style={{ ...abs(fx, fy, FILE_POS.w, FILE_POS.h), opacity: fileOp, transform: `translateY(${(30 * (1 - pop)).toFixed(1)}px) scale(${lerp(0.3, 1, pop).toFixed(4)}) rotate(${(-8 * (1 - pop)).toFixed(2)}deg)`, filter: "drop-shadow(0 26px 50px rgba(0,0,0,.5))" }}>
          <Dossier />
        </div>
      )}
      {t >= a.SLICE &&
        Array.from({ length: bands }, (_, j) => {
          const p = prog(t, a.SLICE + j * F, 12 * F, EXIT);
          if (p >= 1) return null;
          const dir = j % 2 === 0 ? -1 : 1;
          return (
            <div key={j} style={{ ...abs(fx, fy, FILE_POS.w, FILE_POS.h), clipPath: `inset(${(j * bh).toFixed(2)}px 0 ${(FILE_POS.h - (j + 1) * bh).toFixed(2)}px 0)`, transform: `translate(${(dir * (40 + 30 * hash("s11-band", j)) * p).toFixed(1)}px, ${(60 * p).toFixed(1)}px)`, opacity: 1 - p }}>
              <Dossier />
            </div>
          );
        })}
      {/* La désagrégation en pixels. */}
      {t >= a.SLICE &&
        t < a.SLICE + 0.9 &&
        Array.from({ length: 56 }, (_, i) => {
          const j = i % bands;
          const u = t - a.SLICE - j * F - hash("s11-px", i) * 0.08;
          if (u < 0 || u > 0.6) return null;
          const k = u / 0.6;
          const x0 = fx + hash("s11-px-x", i) * FILE_POS.w;
          const y0 = fy + (j + hash("s11-px-y", i)) * bh;
          const vx = (hash("s11-px-vx", i) - 0.5) * 340 + (j % 2 === 0 ? -80 : 80);
          const vy = -60 + hash("s11-px-vy", i) * 200;
          const s = 5 + hash("s11-px-s", i) * 8;
          const col = i % 7 === 0 ? MINT : i % 2 ? G1 : G2;
          return <div key={i} style={{ ...abs(x0 + vx * u - s / 2, y0 + vy * u + 160 * u * u - s / 2, s, s), background: col, opacity: (1 - k) * 0.9, borderRadius: 1.5 }} />;
        })}
      {/* Le contour fantôme du dossier : le vide, en pointillés qui défilent. */}
      {ghost > 0 && (
        <svg style={{ ...abs(fx - 4, fy + 20, FILE_POS.w + 8, FILE_POS.h - 16), overflow: "visible", opacity: ghost }} viewBox={`0 0 ${FILE_POS.w + 8} ${FILE_POS.h - 16}`}>
          <rect x={4} y={4} width={FILE_POS.w} height={FILE_POS.h - 24} rx={18} fill="none" stroke="rgba(255,255,255,.32)" strokeWidth={2.5} strokeDasharray="14 12" strokeDashoffset={-t * 60} />
        </svg>
      )}
      {/* Le bouclier : deux moitiés qui se referment. */}
      {t >= a.SHIELD && (
        <div style={{ ...abs(SHIELD.cx - SHIELD.w / 2, SHIELD.cy - SHIELD.h / 2, SHIELD.w, SHIELD.h), transform: `scale(${breathe.toFixed(4)})`, filter: `drop-shadow(0 0 ${(18 + 26 * latchFlash + 20 * seam).toFixed(1)}px ${rgba(MINT, 0.55 + 0.3 * latchFlash)})` }}>
          <svg width={SHIELD.w} height={SHIELD.h} viewBox="0 0 420 500" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            <defs>
              <clipPath id="s11-shield-clip">
                <path d={SHIELD_OUTER} />
              </clipPath>
              <linearGradient id="s11-sweep" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                <stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.22} />
                <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </linearGradient>
            </defs>
            {[
              { fill: HALF_L_FILL, stroke: HALF_L_STROKE, d: -1 },
              { fill: HALF_R_FILL, stroke: HALF_R_STROKE, d: 1 },
            ].map((h) => (
              <g key={h.d} opacity={shieldOp} transform={`translate(${(h.d * 280 * (1 - close)).toFixed(1)} 0) rotate(${(h.d * 24 * (1 - close)).toFixed(2)} 210 250)`}>
                <path d={h.fill} fill={rgba(MINT, 0.12)} />
                <path d={h.stroke} fill="none" stroke={MINT} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}
            {closed && (
              <g clipPath="url(#s11-shield-clip)">
                <path d={SHIELD_INNER} fill="none" stroke={rgba(MINT, 0.4)} strokeWidth={2} />
                {sweep >= 0 && <rect x={0} y={-160 + sweep * 820} width={420} height={160} fill="url(#s11-sweep)" />}
                <rect x={207} y={0} width={6} height={500} fill="#FFFFFF" opacity={seam} />
              </g>
            )}
          </svg>
        </div>
      )}
      {closed && <Ring t={t} at={a.CLOSE} x={SHIELD.cx} y={SHIELD.cy} max={760} width={4} life={0.55} />}
      {/* Le cadenas, qui tombe puis se verrouille. */}
      {t >= a.LOCK && (
        <div style={{ ...abs(SHIELD.cx - 70, SHIELD.cy - 20 - 120, 140, 220), transform: `translateY(${(-420 * (1 - drop)).toFixed(1)}px) scale(${(2 - sq).toFixed(4)}, ${sq.toFixed(4)})`, transformOrigin: "50% 100%", filter: `drop-shadow(0 14px 22px rgba(0,0,0,.5)) drop-shadow(0 0 ${(10 + 30 * latchFlash).toFixed(1)}px ${rgba(MINT, 0.6)})` }}>
          <svg width={140} height={220} viewBox="0 0 140 220" style={{ overflow: "visible" }}>
            <defs>
              <linearGradient id="s11-lock" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={MINT2} />
                <stop offset="1" stopColor="#1FBF9F" />
              </linearGradient>
            </defs>
            <g transform={`translate(0 ${(-24 * (1 - latch)).toFixed(2)})`}>
              <path d="M 28 128 L 28 82 A 42 42 0 0 1 112 82 L 112 128" fill="none" stroke={MINT} strokeWidth={16} />
            </g>
            <rect x={7} y={112} width={126} height={100} rx={20} fill="url(#s11-lock)" />
            <rect x={7} y={112} width={126} height={22} rx={11} fill="#FFFFFF" opacity={0.18} />
            <circle cx={70} cy={152} r={12} fill={INK} />
            <rect x={65} y={156} width={10} height={26} rx={4} fill={INK} />
          </svg>
        </div>
      )}
      <Ring t={t} at={a.LATCH} x={SHIELD.cx} y={SHIELD.cy + 20} max={300} width={3} life={0.4} echo={false} />
      <Sparks t={t} at={a.LATCH} x={SHIELD.cx} y={SHIELD.cy - 40} count={16} speed={700} spread={70} len={20} life={0.45} seed="s11-latch" />
      {/* AUCUNE FICHE PATIENT, mot par mot ; ligne de base y = 860. */}
      <RiseWords t={t} words={["AUCUNE", "FICHE", "PATIENT"]} ats={a.WORDS} x={960} baseline={860} size={96} colors={[MINT, "#FFFFFF", "#FFFFFF"]} outAt={a.WORDS_OUT} />
      {underline > 0 && <div style={{ ...abs(960 - 560 + 1120 * wipe, 884, 1120 * (underline - wipe), 6), borderRadius: 6, background: `linear-gradient(90deg, ${rgba(MINT, 0.2)}, ${MINT})`, boxShadow: `0 0 18px ${rgba(MINT, 0.7)}` }} />}
      {underline > 0 && underline < 1 && <div style={{ ...abs(960 - 560 + 1120 * underline - 7, 880, 14, 14), borderRadius: 14, background: "#FFFFFF", boxShadow: `0 0 16px ${MINT2}` }} />}
      </AbsoluteFill>
    </Layer>
  );
}

// ---- Station 3 : le dernier mot -------------------------------------------------------------------------

/**
 * La scène du choix, remontée au-dessus de la bande des sous-titres (sol y = 840) et ouverte sur les tiers : le robot à
 * gauche (x 700, puis 580 après ses deux pas de côté), le pharmacien à droite (x 1360), la mini-carte et les deux
 * boutons au centre, au-dessus d'eux.
 */
const FLOOR = 840;
const ROBOT = { size: 360, x: 700, feet: FLOOR };
const ROBOT_H = ROBOT.size * 0.92;
const HOP_DX = 60;
const PHARMA = { x: 1360, feet: FLOOR, scale: 1.15 };
const BTN = { w: 250, h: 78, y: 440, vendu: 828, non: 1092 };
const MINI_Y = 300;
/** Le curseur (la main du pharmacien) : sa pointe dans chaque bouton, et sa pose finale entre les deux. */
const CUR_V = { x: BTN.vendu + 44, y: BTN.y + 20 };
const CUR_N = { x: BTN.non + 44, y: BTN.y + 20 };
const CUR_REST = { x: 962, y: BTN.y + 52 };

/** Le centre horizontal du robot (deux petits sauts de côté de −60 px). */
function robotX(t: number, a: A) {
  return ROBOT.x - HOP_DX * prog(t, a.HOP1, 0.15, IN_OUT) - HOP_DX * prog(t, a.HOP2, 0.15, IN_OUT);
}
function robotLift(t: number, a: A) {
  const arc = (at: number) => {
    const u = (t - at) / 0.15;
    return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
  };
  return -34 * (arc(a.HOP1) + arc(a.HOP2));
}
/** La révérence : 20° vers le pharmacien, pivot aux pieds, tenue, puis relevée. */
function bowAngle(t: number, a: A) {
  return 20 * (prog(t, a.BOW, 0.2, SNAP) - prog(t, a.BOW_BACK, 0.18, IN_OUT));
}

/** Les pas de l'hésitation : V, N, V, N… à partir de ALT0, tant que le signe de tête n'est pas venu. */
function altSteps(a: A) {
  const n = Math.max(2, Math.min(ALT_STEPS, Math.floor((a.NOD - a.ALT0) / ALT + 1e-6)));
  return Array.from({ length: n }, (_, i) => ({ at: a.ALT0 + i * ALT, on: i % 2 === 0 ? ("V" as const) : ("N" as const) }));
}

type Key = [number, number] | [number, number, (x: number) => number];

/** Le curseur : entre du côté du pharmacien, survole Vendu / Non vendu (alternance franche, 5 images), se pose entre. */
function cursorPos(t: number, a: A) {
  const steps = altSteps(a);
  const t0 = a.ALT0 - 0.16;
  const kx: Key[] = [[t0, 1290]];
  const ky: Key[] = [[t0, 640]];
  const last = () => [kx[kx.length - 1], ky[ky.length - 1]] as const;
  steps.forEach((s, i) => {
    const P = s.on === "V" ? CUR_V : CUR_N;
    const dy = i % 2 ? -6 : 6;
    if (i === 0) {
      kx.push([s.at, P.x, SNAP]);
      ky.push([s.at, P.y + dy, SNAP]);
      return;
    }
    // Il attend sur le bouton, puis saute d'un coup sur l'autre.
    const [lx, ly] = last();
    kx.push([s.at, lx[1]]);
    ky.push([s.at, ly[1]]);
    kx.push([s.at + 5 * F, P.x, SNAP]);
    ky.push([s.at + 5 * F, P.y + dy, SNAP]);
  });
  const [lx, ly] = last();
  const rest = Math.max(a.NOD, lx[0] + F);
  kx.push([rest, lx[1]], [rest + 0.16, CUR_REST.x, SNAP]);
  ky.push([rest, ly[1]], [rest + 0.16, CUR_REST.y, SNAP]);
  return { x: keys(t, kx), y: keys(t, ky), op: clamp01((t - t0) / (4 * F)) };
}

/** Le projecteur : x du pied du faisceau (entre par la gauche, traverse, se pose sur le pharmacien). */
function beamX(t: number, a: A) {
  return keys(t, [
    [a.BEAM_IN, -320],
    [a.BEAM - 0.03, PHARMA.x + 46, IN_OUT],
    [a.BEAM + 0.16, PHARMA.x, SNAP],
  ]);
}

function robotTrack(a: A): Track {
  const steps = altSteps(a).filter((s) => s.at < a.P17B - 0.05);
  return {
    id: `S11-robot-v3-${Math.round(a.ALT0 * 1000)}-${Math.round(a.P17B * 1000)}-${Math.round(a.END * 1000)}`,
    seed: 1107,
    until: a.END + 0.1,
    events: [
      { t: 0, kind: "mood", mood: "idle" },
      { t: a.PAN2 + 0.1, kind: "mood", mood: "curious" },
      { t: a.RETRACT, kind: "glance", x: 0.5, y: -1, dur: 0.2 },
      // Il suit l'hésitation : à gauche (Vendu), à droite (Non vendu), au même rythme que le curseur.
      ...steps.map((s) => ({ t: s.at + 0.02, kind: "glance" as const, x: s.on === "V" ? 0.15 : 0.95, y: s.on === "V" ? -1 : -0.7, dur: ALT - 0.01 })),
      { t: a.ALT0 + 0.1, kind: "blink" },
      // Le projecteur trouve le pharmacien : le robot le regarde, fait ses deux pas de côté et sa révérence.
      { t: a.P17B - 0.04, kind: "glance", x: 1, y: -0.25, dur: 0.9 },
      { t: a.HOP1 + 0.15, kind: "squash" },
      { t: a.HOP2 + 0.15, kind: "squash" },
      { t: a.BOW, kind: "mood", mood: "happy" },
      { t: a.BOW - 0.02, kind: "glance", x: 0.7, y: 0.9, dur: a.BOW_BACK - a.BOW + 0.06 },
      { t: a.BOW + 0.04, kind: "emote", emote: "love", dur: 0.5 },
      { t: a.BOW + 0.1, kind: "emit", particle: "heart", count: 2 },
      { t: a.LOOK, kind: "glance", x: 0, y: 0, dur: 1.2 },
    ],
  };
}

/** Le pilier 3 : son double descend avec la grue, puis remonte d'un coup et découvre le choix. */
function StagePillar({ t, a }: { t: number; a: A }) {
  const up = prog(t, a.RETRACT, 0.24, EXIT);
  if (up >= 1) return null;
  const w = 420;
  const h = 1180;
  const flash = pulse(t, a.RETRACT + 0.14, 0.04, 0.02, 0.25);
  return (
    <>
      <div style={{ ...abs(960 - w / 2, 960 - h - 1300 * up, w, h), borderRadius: "34px 34px 6px 6px", background: PILLAR_BG, boxShadow: `0 0 80px ${rgba(MINT, 0.45)}`, transformOrigin: "50% 0%", transform: `scaleY(${(1 + 0.25 * up).toFixed(4)}) scaleX(${(1 - 0.35 * up).toFixed(4)})`, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "16%", width: "10%", top: 0, bottom: 0, background: "linear-gradient(180deg, rgba(255,255,255,.3), transparent 70%)", opacity: 0.35 }} />
        <div style={{ position: "absolute", left: 0, right: 0, height: 180, top: (((t - a.PAN2) * 1100) % 1400) - 180, background: `linear-gradient(180deg, transparent, ${rgba("#FFFFFF", 0.3)}, transparent)` }} />
      </div>
      {flash > 0 && <div style={{ ...abs(960 - 360, -6, 720, 12), borderRadius: 12, background: "linear-gradient(90deg, transparent, #FFFFFF, transparent)", opacity: flash, boxShadow: `0 0 40px ${MINT}` }} />}
    </>
  );
}

function MiniCard({ t, a }: { t: number; a: A }) {
  const pop = prog(t, a.RETRACT + 0.04, 12 * F, POP);
  if (pop <= 0) return null;
  const fl = 6 * Math.sin((t - a.PAN2) * 2.6);
  const dimm = prog(t, a.BEAM, 0.3, SNAP);
  // Pas de prix ici (hors de la mention « Illustration · exemples ») : le nom et la puce « Conseil » suffisent.
  return (
    <div style={{ ...abs(960 - 230, MINI_Y - 55 + fl, 460, 110), borderRadius: 22, background: "#FFFFFF", boxShadow: `0 24px 60px rgba(0,0,0,.45), 0 0 0 1px ${rgba(MINT, 0.2)}`, transform: `scale(${lerp(0.6, 1, pop).toFixed(4)}) rotate(${(wobble(t, 9, 1.2, 0.8) * (1 - dimm)).toFixed(2)}deg)`, opacity: clamp01(pop * 2) * (1 - 0.12 * dimm) }}>
      <div style={{ ...abs(12, 11, 88, 88), borderRadius: 16, background: "linear-gradient(160deg, #F4F8FA, #E6EEF2)", overflow: "hidden" }}>
        <Img src={staticFile("produits/boites/ultra-levure-200-mg.webp")} style={{ width: "100%", height: "100%", objectFit: "contain", transform: `rotate(${wobble(t, 4, 2).toFixed(2)}deg)` }} />
      </div>
      <div style={{ position: "absolute", left: 118, top: 20, fontFamily: JAKARTA, fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap" }}>Ultra-Levure 200 mg</div>
      <div style={{ position: "absolute", left: 118, top: 62, display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ height: 30, padding: "0 12px", borderRadius: 999, background: rgba(MINT, 0.18), color: PB.teal2, display: "flex", alignItems: "center", ...label(14) }}>Conseil</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: 8, background: rgba(PB.teal2, 0.25 + 0.6 * clamp01(Math.sin((t - a.RETRACT) * 7 - i * 0.9))) }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Les deux boutons, NEUTRES et de même poids : seul le survol du curseur les allume, tour à tour, puis ensemble. */
function Buttons({ t, a }: { t: number; a: A }) {
  const pv = prog(t, a.RETRACT + 0.08, 12 * F, POP);
  const pn = prog(t, a.RETRACT + 0.08 + 3 * F, 12 * F, POP);
  if (pv <= 0) return null;
  const c = cursorPos(t, a);
  const near = (bx: number) => c.op * clamp01(1 - Math.abs(c.x - (bx + 44)) / 150) * clamp01(1 - Math.abs(c.y - (BTN.y + 20)) / 120);
  const both = prog(t, a.NOD, 0.2, SNAP) * (1 - 0.4 * prog(t, a.DIVE - 0.2, 0.2, IN_OUT));
  const items = [
    { x: BTN.vendu, p: pv, h: near(BTN.vendu), text: "Vendu", Icon: Check },
    { x: BTN.non, p: pn, h: near(BTN.non), text: "Non vendu", Icon: X },
  ];
  return (
    <>
      {items.map(({ x, p, h, text, Icon }) => {
        const lit = Math.max(h, 0.55 * both);
        return (
          <div
            key={text}
            style={{
              position: "absolute",
              left: x - BTN.w / 2,
              top: BTN.y - BTN.h / 2,
              width: BTN.w,
              height: BTN.h,
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              boxSizing: "border-box",
              fontFamily: JAKARTA,
              fontSize: 27,
              fontWeight: 800,
              color: "#FFFFFF",
              background: `linear-gradient(180deg, rgba(255,255,255,${(0.1 + 0.08 * lit).toFixed(3)}), ${rgba(MINT, 0.05 + 0.2 * lit)})`,
              border: `2px solid ${lit > 0.02 ? rgba(MINT, 0.35 + 0.65 * lit) : "rgba(255,255,255,.35)"}`,
              boxShadow: `0 0 ${(8 + 44 * lit).toFixed(1)}px ${rgba(MINT, 0.12 + 0.5 * lit)}, 0 14px 30px rgba(0,0,0,.35)`,
              transform: `scale(${(lerp(0.5, 1, p) * (1 + 0.08 * h + 0.025 * both)).toFixed(4)})`,
              opacity: clamp01(p * 2),
            }}
          >
            <Icon size={26} strokeWidth={3.2} color={lit > 0.3 ? MINT2 : "rgba(255,255,255,.85)"} />
            {text}
          </div>
        );
      })}
    </>
  );
}

/** Le curseur du pharmacien : il survole, il ne clique pas. */
function HandCursor({ t, a }: { t: number; a: A }) {
  const c = cursorPos(t, a);
  if (c.op <= 0) return null;
  const out = 1 - prog(t, a.DIVE - 0.1, 0.12, SNAP);
  return (
    <div style={{ ...abs(c.x, c.y, 40, 52), opacity: c.op * out, transform: `rotate(${(-6 + 3 * Math.sin(t * 9)).toFixed(2)}deg)`, transformOrigin: "0 0" }}>
      <svg width={40} height={52} viewBox="0 0 20 26" style={{ overflow: "visible", filter: `drop-shadow(0 4px 6px rgba(0,0,0,.45)) drop-shadow(0 0 8px ${rgba(MINT, 0.5)})` }}>
        <path d="M1 1 L1 20 L6 15.5 L9.5 23.5 L13 22 L9.5 14 L16 14 Z" fill="#FFFFFF" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Le projecteur : entre par la gauche, traverse la scène (il effleure le robot), puis se pose sur le pharmacien. */
function Beam({ t, a }: { t: number; a: A }) {
  const kin = prog(t, a.BEAM_IN, 0.18, SNAP);
  if (kin <= 0) return null;
  const x = beamX(t, a);
  const v = x - beamX(t - 2 * F, a);
  const lock = prog(t, a.BEAM - 0.02, 0.12, SNAP);
  const flash = pulse(t, a.BEAM, 0.04, 0.03, 0.4);
  const flick = 1 + 0.04 * noise2D("s11-beam", t * 3, 0);
  const top = -140;
  const bot = FLOOR;
  const lean = -0.45 * v;
  const op = kin * (0.55 + 0.45 * lock) * flick;
  const tw = 46;
  const bw = lerp(300, 250, lock);
  return (
    <>
      <svg style={{ ...abs(0, 0, 1920, 1080), overflow: "visible", opacity: op }} viewBox="0 0 1920 1080">
        <defs>
          <linearGradient id="s11-beam-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.26 + 0.2 * flash} />
            <stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0.1 + 0.1 * flash} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0.03} />
          </linearGradient>
          <filter id="s11-beam-blur" x="-20%" y="-5%" width="140%" height="110%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <polygon points={`${x + lean - tw},${top} ${x + lean + tw},${top} ${x + bw},${bot} ${x - bw},${bot}`} fill="url(#s11-beam-g)" filter="url(#s11-beam-blur)" />
        <polygon points={`${x + lean - tw / 2},${top} ${x + lean + tw / 2},${top} ${x + bw * 0.55},${bot} ${x - bw * 0.55},${bot}`} fill="url(#s11-beam-g)" opacity={0.6} />
      </svg>
      {/* La flaque de lumière au sol, qui suit le faisceau. */}
      <div style={{ ...abs(x - bw, bot - 30, 2 * bw, 60), borderRadius: "50%", background: `radial-gradient(ellipse, rgba(255,255,255,${(0.18 + 0.12 * flash).toFixed(3)}), rgba(255,255,255,.06) 55%, transparent 72%)`, opacity: kin }} />
      {/* Poussières dans la lumière. */}
      {Array.from({ length: 24 }, (_, i) => {
        const vv = ((hash("s11-mote", i) + (t - a.BEAM_IN) * (0.04 + 0.05 * hash("s11-mote-s", i))) % 1) * 0.92 + 0.04;
        const y = top + (bot - top) * (1 - vv);
        const half = tw + (bw - tw) * (1 - vv);
        const mx = x + lean * vv + (hash("s11-mote-x", i) - 0.5) * 1.6 * half + 14 * noise2D("s11-mote", i, t * 0.6);
        const s = 2 + 3 * hash("s11-mote-r", i);
        return <div key={i} style={{ ...abs(mx, y, s, s), borderRadius: s, background: "#FFFFFF", opacity: 0.5 * kin * (0.4 + 0.6 * hash("s11-mote-a", i)) }} />;
      })}
    </>
  );
}

/** Le bras de la révérence : il se lève et balaie vers le pharmacien (dessiné dans la boîte du robot, épaule droite). */
function BowArm({ t, a }: { t: number; a: A }) {
  const show = prog(t, a.BOW - 0.1, 5 * F, SNAP) * (1 - prog(t, a.BOW_BACK + 0.06, 8 * F, SNAP));
  if (show <= 0) return null;
  const sweep = prog(t, a.BOW - 0.06, 0.3, IN_OUT);
  const back = prog(t, a.BOW_BACK, 0.18, IN_OUT);
  const ang = lerp(lerp(-160, -40, sweep), -10, back);
  const u = ROBOT.size / 100;
  const sx = 80 * u;
  const sy = (62 + 4) * u;
  return (
    <div style={{ ...abs(sx - 16, sy, 32, 30 * u), transformOrigin: "16px 0", transform: `rotate(${ang.toFixed(2)}deg)`, opacity: show }}>
      <div style={{ position: "absolute", left: 0, top: -4, width: 32, height: 24 * u, borderRadius: 16, background: "#FFFFFF", border: "4px solid #8FBCD0", boxSizing: "border-box" }} />
      <div style={{ position: "absolute", left: -6, top: 24 * u - 22, width: 44, height: 44, borderRadius: 44, background: "#FFFFFF", border: "4px solid #8FBCD0", boxSizing: "border-box" }} />
    </div>
  );
}

const SKIN = "#F1C7A3";
const SKIN_D = "#D9A47F";
const HAIR = "#3A2A22";

/** Le pharmacien : personnage plat dans le style du robot (blouse, croix menthe, visage simple), sans nom ni badge écrit. */
function Pharmacist({ t, a }: { t: number; a: A }) {
  const show = prog(t, a.RETRACT + 0.06, 0.3, SNAP);
  if (show <= 0) return null;
  // Éclairé quand le faisceau l'approche, pleinement quand il se pose.
  const near = clamp01(1 - Math.abs(beamX(t, a) - PHARMA.x) / 300) * prog(t, a.BEAM_IN, 0.18, SNAP);
  const lit = Math.max(near * 0.8, prog(t, a.BEAM - 0.02, 8 * F, SNAP));
  const nod = prog(t, a.NOD, 0.12, SNAP) - prog(t, a.NOD + 0.2, 0.2, IN_OUT);
  // La main : sous le menton (il réfléchit) pendant l'hésitation, puis s'ouvre vers le robot au signe de tête.
  const open = prog(t, a.NOD - 0.02, 0.22, SNAP);
  const think = 2.5 * Math.sin((t - a.ALT0) * 2 * Math.PI * 2);
  const lookX = lerp(-4, -6, open) + (t < a.NOD ? 2.5 * Math.sign(Math.sin(((t - a.ALT0) / ALT) * Math.PI)) : 0);
  const br = 1 + 0.006 * Math.sin(t * 3.2);
  const W = 260;
  const H = 480;
  const elbow = { x: lerp(52, 30, open), y: lerp(286, 270, open) };
  const hand = { x: lerp(106, -26, open) + (1 - open) * think * 0.4, y: lerp(124, 236, open) + (1 - open) * think };
  const body = (lit: boolean) => {
    const coat = lit ? "#FFFFFF" : "#141B22";
    const edge = lit ? "#B9CCD8" : "rgba(255,255,255,.26)";
    const skin = lit ? SKIN : "#161D24";
    const hair = lit ? HAIR : "#161D24";
    const shirt = lit ? "#CFF4EC" : "#141B22";
    const leg = lit ? "#2E3946" : "#121820";
    const sw = lit ? 2.5 : 2;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {/* Jambes et chaussures. */}
        <rect x={92} y={400} width={32} height={70} rx={10} fill={leg} stroke={lit ? "none" : edge} strokeWidth={sw} />
        <rect x={136} y={400} width={32} height={70} rx={10} fill={leg} stroke={lit ? "none" : edge} strokeWidth={sw} />
        <ellipse cx={104} cy={472} rx={24} ry={9} fill={lit ? "#1B232C" : "#10161C"} stroke={lit ? "none" : edge} strokeWidth={sw} />
        <ellipse cx={156} cy={472} rx={24} ry={9} fill={lit ? "#1B232C" : "#10161C"} stroke={lit ? "none" : edge} strokeWidth={sw} />
        {/* Bras droit (côté écran droit), le long du corps. */}
        <path d={`M 222 150 Q 240 250 232 ${(352 + 3 * Math.sin(t * 2.4)).toFixed(1)}`} fill="none" stroke={edge} strokeWidth={36} strokeLinecap="round" />
        <path d={`M 222 150 Q 240 250 232 ${(352 + 3 * Math.sin(t * 2.4)).toFixed(1)}`} fill="none" stroke={coat} strokeWidth={31} strokeLinecap="round" />
        <circle cx={232} cy={378 + 3 * Math.sin(t * 2.4)} r={15} fill={skin} stroke={lit ? SKIN_D : edge} strokeWidth={sw} />
        {/* Blouse. */}
        <path d="M 32 420 L 30 200 C 30 140, 66 112, 104 106 L 156 106 C 194 112, 230 140, 230 200 L 228 420 Z" fill={coat} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M 104 106 L 130 176 L 156 106 Z" fill={shirt} />
        {lit && <path d="M 124 120 L 136 120 L 134 176 L 130 186 L 126 176 Z" fill={PB.teal2} />}
        <path d="M 104 106 L 130 176 L 110 204 L 86 122 Z M 156 106 L 130 176 L 150 204 L 174 122 Z" fill={coat} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M 130 176 L 130 420" stroke={edge} strokeWidth={sw} />
        {[236, 290, 344].map((y) => (
          <circle key={y} cx={138} cy={y} r={4} fill={lit ? "#C9D6DD" : "transparent"} stroke={lit ? "none" : edge} strokeWidth={1.5} />
        ))}
        {/* Poche, stylo et croix menthe. */}
        <rect x={156} y={236} width={52} height={44} rx={7} fill="none" stroke={edge} strokeWidth={sw} />
        {lit && <rect x={168} y={222} width={6} height={22} rx={3} fill={PB.teal2} />}
        {lit && (
          <g transform="translate(190 214)">
            <rect x={-4.5} y={-12} width={9} height={24} rx={2} fill={MINT} />
            <rect x={-12} y={-4.5} width={24} height={9} rx={2} fill={MINT} />
          </g>
        )}
        {/* Cou. */}
        <rect x={116} y={80} width={28} height={32} rx={10} fill={skin} stroke={lit ? "none" : edge} strokeWidth={sw} />
        {/* Tête, qui fait oui. */}
        <g transform={`translate(0 ${(5 * nod).toFixed(2)}) rotate(${(-3 * nod).toFixed(2)} 130 96)`}>
          <circle cx={88} cy={58} r={9} fill={skin} stroke={lit ? SKIN_D : edge} strokeWidth={sw} />
          <circle cx={172} cy={58} r={9} fill={skin} stroke={lit ? SKIN_D : edge} strokeWidth={sw} />
          <circle cx={130} cy={54} r={44} fill={skin} stroke={lit ? "none" : edge} strokeWidth={sw} />
          <path d="M 86 56 C 82 20, 108 4, 132 6 C 160 6, 180 24, 175 56 C 168 40, 152 30, 134 30 C 116 30, 98 38, 86 56 Z" fill={hair} stroke={lit ? "none" : edge} strokeWidth={sw} />
          {lit && (
            <g transform={`translate(${lookX.toFixed(2)} ${(2 * nod).toFixed(2)})`}>
              <circle cx={114} cy={60} r={4.6} fill={INK} />
              <circle cx={146} cy={60} r={4.6} fill={INK} />
              <circle cx={112.6} cy={58.4} r={1.4} fill="#FFFFFF" />
              <circle cx={144.6} cy={58.4} r={1.4} fill="#FFFFFF" />
              <ellipse cx={104} cy={74} rx={7} ry={3.8} fill="#F29C9C" opacity={0.45} />
              <ellipse cx={156} cy={74} rx={7} ry={3.8} fill="#F29C9C" opacity={0.45} />
              <path d={`M 118 ${78} Q 130 ${(86 + 3 * open).toFixed(1)} 142 78`} fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
            </g>
          )}
        </g>
        {/* Bras gauche (côté robot) : la main sous le menton, puis ouverte vers le robot. */}
        <path d={`M 40 150 Q ${elbow.x - 14} ${elbow.y - 40} ${elbow.x} ${elbow.y} L ${hand.x.toFixed(1)} ${hand.y.toFixed(1)}`} fill="none" stroke={edge} strokeWidth={36} strokeLinecap="round" strokeLinejoin="round" />
        <path d={`M 40 150 Q ${elbow.x - 14} ${elbow.y - 40} ${elbow.x} ${elbow.y} L ${hand.x.toFixed(1)} ${hand.y.toFixed(1)}`} fill="none" stroke={coat} strokeWidth={31} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={hand.x} cy={hand.y - 4} r={15} fill={skin} stroke={lit ? SKIN_D : edge} strokeWidth={sw} />
      </svg>
    );
  };
  return (
    <>
      {/* Ombre portée au sol. */}
      <div style={{ ...abs(PHARMA.x - 150, PHARMA.feet - 16, 300, 32), borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,.55), transparent 70%)", opacity: show }} />
      <div style={{ ...abs(PHARMA.x - W / 2, PHARMA.feet - H, W, H), opacity: show, transformOrigin: "50% 100%", transform: `translateY(${(20 * (1 - show)).toFixed(1)}px) scale(${PHARMA.scale}) scaleY(${br.toFixed(4)})` }}>
        {body(false)}
        <div style={{ position: "absolute", inset: 0, opacity: lit, filter: `drop-shadow(0 0 ${(18 + 20 * lit).toFixed(1)}px ${rgba("#FFFFFF", 0.22)})` }}>{body(true)}</div>
      </div>
    </>
  );
}

function Station3({ t, a, cam, track }: { t: number; a: A; cam: Cam; track: Track }) {
  if (t < a.PAN2 - 0.02) return null;
  const rx = robotX(t, a);
  const lift = robotLift(t, a);
  const bow = bowAngle(t, a);
  const enter = prog(t, a.PAN2 + 0.05, 0.42, SNAP);
  // Le faisceau effleure le robot en passant.
  const graze = clamp01(1 - Math.abs(beamX(t, a) - rx) / 240) * prog(t, a.BEAM_IN, 0.18, SNAP) * (1 - prog(t, a.BEAM - 0.1, 0.1, SNAP));
  return (
    <Layer x={stationX(cam, 2)} y={stationY(cam, 2)}>
      <StagePillar t={t} a={a} />
      <Beam t={t} a={a} />
      <Pharmacist t={t} a={a} />
      {/* Ombre du robot. */}
      <div style={{ ...abs(rx - 130 + 0.9 * bow, ROBOT.feet - 18, 260, 36), borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,.5), transparent 70%)", transform: `scale(${(1 + lift / 120).toFixed(3)})` }} />
      <div style={{ ...abs(rx - ROBOT.size / 2, ROBOT.feet - ROBOT_H + lift + 40 * (1 - enter), ROBOT.size, ROBOT_H), transformOrigin: "78% 100%", transform: `rotate(${bow.toFixed(3)}deg) scaleY(${(1 - 0.05 * (bow / 20)).toFixed(4)})`, filter: graze > 0.01 ? `brightness(${(1 + 0.3 * graze).toFixed(3)}) drop-shadow(0 0 ${(30 * graze).toFixed(1)}px rgba(255,255,255,.35))` : undefined }}>
        <Mascot track={track} t={t} size={ROBOT.size} look={null} />
        <BowArm t={t} a={a} />
      </div>
      <MiniCard t={t} a={a} />
      <Buttons t={t} a={a} />
      <HandCursor t={t} a={a} />
      <Word t={t} at={a.TITLE} text="La décision *vous appartient*" x={960} y={132} size={64} weight={700} tracking="-0.02em" lineHeight={1.1} enter="rise" stagger={0.6} />
    </Layer>
  );
}

// ---- HUD : les trois piliers ------------------------------------------------------------------------

function Progress({ t, a }: { t: number; a: A }) {
  const show = prog(t, a.R1 + 0.2, 0.3, SNAP) * (1 - prog(t, a.DIVE, 0.12, SNAP));
  if (show <= 0) return null;
  const spans: [number, number][] = [
    [a.R1, a.PAN1],
    [a.PAN1, a.PAN2],
    [a.PAN2, a.P17Z],
  ];
  const w = 150;
  const gap = 14;
  const x0 = 960 - (3 * w + 2 * gap) / 2;
  return (
    <div style={{ ...abs(x0, 46, 3 * w + 2 * gap, 30), opacity: show, transform: `translateY(${(-16 * (1 - show)).toFixed(1)}px)` }}>
      {spans.map(([s, e], i) => {
        const k = clamp01((t - s) / (e - s));
        const on = t >= s && t < e;
        return (
          <div key={i} style={{ ...abs(i * (w + gap), 0, w, 30) }}>
            <div style={{ ...abs(0, 0, w, 5), borderRadius: 5, background: "rgba(255,255,255,.16)", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(k * 100).toFixed(2)}%`, background: MINT, boxShadow: on ? `0 0 10px ${MINT}` : undefined }} />
            </div>
            <div style={{ position: "absolute", left: 0, top: 13, fontFamily: MONO, fontWeight: 700, fontSize: 14, color: on ? MINT2 : "rgba(255,255,255,.4)", letterSpacing: "0.08em" }}>0{i + 1}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- La sortie : plongée dans la visière ---------------------------------------------------------------

/** La visière et les yeux du robot (taille 360), dans le repère de l'écran avant la plongée. */
function visorGeometry(t: number, a: A, cam: Cam) {
  const left = stationX(cam, 2) + robotX(t, a) - ROBOT.size / 2;
  const top = stationY(cam, 2) + ROBOT.feet - ROBOT_H + robotLift(t, a);
  const u = ROBOT.size / 100;
  // Tête : translate(10 −9) scale(.8) ; écran 20..80 × 24..66 (rx 19) ; yeux (38, 42) et (62, 42), rx 4,8 ry 6,4.
  const sx = (x: number) => left + (10 + 0.8 * x) * u;
  const sy = (y: number) => top + (-9 + 0.8 * y + 4) * u;
  return {
    cx: sx(50),
    cy: sy(45),
    w: 0.8 * 60 * u,
    h: 0.8 * 42 * u,
    r: 0.8 * 19 * u,
    eyes: [
      { x: sx(38), y: sy(42) },
      { x: sx(62), y: sy(42) },
    ],
    ew: 0.8 * 9.6 * u,
    eh: 0.8 * 12.8 * u,
  };
}

/** La caméra se centre sur la visière (×1,3 en 0,25 s), puis continue de plonger en accélérant (×3,5) pendant l'iris. */
function dive(t: number, a: A, cam: Cam) {
  const k = prog(t, a.DIVE, 0.25, IN_OUT);
  const v = visorGeometry(t, a, cam);
  const push = Math.pow(clamp01((t - a.MASK) / (16 * F)), 1.6);
  const Z = lerp(1, 1.3, k) * Math.pow(3.5, push);
  const Fx = lerp(C.x, v.cx, k);
  const Fy = lerp(C.y, v.cy, k);
  const map = (x: number, y: number) => ({ x: C.x + Z * (x - Fx), y: C.y + Z * (y - Fy) });
  return { k, Z, Fx, Fy, v, map, transform: `translate(${(C.x - Z * Fx).toFixed(2)}px, ${(C.y - Z * Fy).toFixed(2)}px) scale(${Z.toFixed(4)})` };
}

/** Le monde de S12 (son état de départ) : encre et ses 80 particules menthe. */
function S12World({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: INK }}>
      <S12VisorParticles t={t} />
    </AbsoluteFill>
  );
}

function Plunge({ t, a, cam }: { t: number; a: A; cam: Cam }) {
  if (t < a.MASK) return null;
  const d = dive(t, a, cam);
  const u = IN_OUT(clamp01((t - a.MASK) / (16 * F)));
  // L'iris grandit à vitesse constante en échelle logarithmique (une vraie plongée) ; les yeux suivent la courbe.
  const g = Math.pow(20, clamp01((t - a.MASK) / (16 * F)));
  const c = d.map(d.v.cx, d.v.cy);
  // L'iris : la visière à l'écran (qui grandit déjà avec la caméra) × un supplément, jusqu'à ×20 en tout.
  const extra = Math.max(1, (1.3 * g) / d.Z);
  const w = d.v.w * d.Z * extra;
  const h = d.v.h * d.Z * extra;
  const r = d.v.r * d.Z * extra;
  return (
    <>
      <div style={{ ...abs(c.x - w / 2, c.y - h / 2, w, h), borderRadius: r, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: -(c.x - w / 2), top: -(c.y - h / 2), width: 1920, height: 1080 }}>
          <S12World t={t} />
        </div>
      </div>
      {/* Les deux yeux restent devant et deviennent les deux pilules du logo. */}
      {d.v.eyes.map((e, i) => {
        const p = d.map(e.x, e.y);
        const T = EYE_TARGETS[i];
        const ew = lerp(d.v.ew * d.Z, EYE_SIZE.w, u);
        const eh = lerp(d.v.eh * d.Z, EYE_SIZE.h, u);
        const x = lerp(p.x, T.x, u);
        const y = lerp(p.y, T.y, u);
        return <div key={i} style={{ ...abs(x - ew / 2, y - eh / 2, ew, eh), borderRadius: ew / 2, background: u < 0.5 ? MINT2 : S12_EYE.color, boxShadow: `0 0 ${(16 + 30 * u).toFixed(1)}px ${rgba(MINT, 0.7)}` }} />;
      })}
    </>
  );
}

// ---- La scène --------------------------------------------------------------------------------------------

function Frame({ t, a, track }: { t: number; a: A; track: Track }) {
  const cam = camera(t, a);
  const d = t >= a.DIVE ? dive(t, a, cam) : null;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: INK }}>
      <AbsoluteFill style={d ? { transformOrigin: "0 0", transform: d.transform } : undefined}>
        <Background t={t} a={a} cam={cam} />
        <Pillars t={t} a={a} cam={cam} />
        <Station1 t={t} a={a} cam={cam} />
        <Station2 t={t} a={a} cam={cam} />
        <Station3 t={t} a={a} cam={cam} track={track} />
        <Dust t={t} count={26} seed="s11-dust" color={MINT2} alpha={0.22} size={[1.5, 3.5]} speed={0.05} />
      </AbsoluteFill>
      <Progress t={t} a={a} />
      <Plunge t={t} a={a} cam={cam} />
    </AbsoluteFill>
  );
}

export function Scene11({ t, time, win }: SceneProps) {
  const a = anchors(time, win);
  const track = robotTrack(a);
  const fast = (t >= a.R1 && t < a.R1 + 0.32) || (t >= a.PAN1 && t < a.PAN1 + a.PAN1_DUR) || (t >= a.PAN2 && t < a.PAN2 + 0.45) || t >= a.DIVE;
  return (
    <AbsoluteFill>
      <MotionBlur on={fast} samples={8}>
        {(tt) => <Frame t={tt} a={a} track={track} />}
      </MotionBlur>
      <Mention t={t} from={a.MENTION_FROM} to={a.MENTION_TO} />
    </AbsoluteFill>
  );
}

/** Les effets sonores de la scène (secondes du film) : cue("nom", temps, gain, vitesse). */
export const cues: SceneCues = (time) => {
  const a = anchors(time, time.win.S11);
  return [
    cue("paper_fold", a.FOLD, 0.3),
    cue("card_unfold", a.FAN, 0.3, 1.2),
    cue("sparkle_shimmer", a.R2 - 0.1, 0.25, 0.8),
    ...a.CHECK.map((c) => cue("ui_click", c, 0.3, 1.3)),
    cue("stamp_slam", a.HIT, 0.45),
    cue("pen_signature", a.SIGN, 0.5),
    cue("whoosh_fast", a.PAN1, 0.25, 0.7),
    cue("ui_pop", a.FILE, 0.3),
    cue("pixel_dissolve", a.SLICE, 0.4),
    cue("lock_shield", a.SHIELD, 0.5),
    cue("hud_lock", a.LATCH, 0.35),
    cue("whoosh_fast", a.PAN2, 0.25, 0.7),
    cue("ui_pop", a.RETRACT + 0.06, 0.25, 1.2),
    // L'hésitation du curseur : des survols à peine audibles (sous « Et le dernier mot »).
    ...altSteps(a).map((s) => cue("ui_click", s.at, 0.07, 1.7)),
    cue("sparkle_shimmer", a.BEAM, 0.3),
    // La révérence : un souffle doux (plus de « boing » de dessin animé sur « reste au pharmacien »).
    cue("whoosh_fast", a.BOW, 0.15, 0.7),
    cue("whoosh_heavy", a.DIVE, 0.5),
    cue("reverse_riser", a.END - 0.6, 0.4),
  ];
};
