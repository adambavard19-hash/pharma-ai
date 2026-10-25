import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { Mascot, type Track } from "../../presentation/mascot";
import MOTS from "../mots.json";
import { TOTAL } from "../timeline";
import {
  AdnBackdrop,
  BRAND_GRAD,
  Bubble,
  Burst,
  Camera,
  Confetti,
  Converge,
  Cursor,
  DotGrid,
  F,
  IN_OUT,
  JAKARTA,
  MotionBlur,
  PB,
  PBLogo,
  Pharmacienne,
  Pharmacy,
  POP,
  Ring,
  SNAP,
  Sparkle,
  Sparks,
  WHIP,
  clamp01,
  cue,
  keys,
  lerp,
  prog,
  pulse,
  rgba,
  shake,
  squash,
  wobble,
  type Cue,
} from "../kit";

/* ==========================================================================
 * S13 · LA SIGNATURE (65,5 → 75,0) — N12 « PharmaBoost. Le copilote IA du comptoir de votre pharmacie. »
 *                                     D5 (la pharmacienne) « Il vous fallait autre chose ? » · accord final 72,0.
 *
 *  A  65,50  le vert profond de la bannière (S12 converge au-dessus jusqu'à 66,0) ; des étincelles citron convergent.
 *     65,75  « PharmaBoost. » : le logo CLAQUE au centre (coup de poing, éclair, deux ondes de choc, gerbe d'étincelles,
 *            rayons, vague dans la grille, secousse). 65,90 : le robot du site jaillit dessous et fait coucou.
 *  B  66,36  l'iris s'ouvre sur le PAPIER du site (l'hélice d'ADN claire) ; le logo file en en-tête, le robot vole en
 *            arc jusqu'au rond blanc du titre (comme sur l'accueil du site). La phrase du site arrive mot à mot sur la
 *            voix : « Le copilote IA (robot) du comptoir » / « de votre pharmacie. » au dégradé sarcelle → cyan ; « IA »
 *            se surligne en citron et le robot saute ; un reflet traverse la 2e ligne.
 *  C  69,44  panoramique filé vers LE COMPTOIR, en couleurs PharmaBoost (miroir de S1) : la pharmacienne sourit, la bulle
 *            citron « Il vous fallait / autre chose ? » s'écrit sur la voix ; sur l'écran du comptoir, le robot la regarde.
 *     71,44  fin de « chose ? » : coup de zoom dans l'écran (flou de mouvement, 0,2 s) jusqu'au GROS PLAN du robot, qui
 *            nous fait un CLIN D'ŒIL (71,76), lisible en plein cadre.
 *  D  72,00  l'accord final : éclair, le logo RECLAQUE, « pharmaboost.app » s'écrit dans une barre d'adresse, le bouton
 *            « Réserver une démo » du site ; canons de confettis citron et menthe, ondes, rayons ; un curseur clique sur
 *            le bouton (73,30). 74,42 → 75,0 : fondu au vert profond.
 * Vérité : aucun chiffre, aucune marque ; la phrase, le bandeau « À côté de votre logiciel de gestion · le pharmacien
 * décide », l'adresse et le bouton sont ceux du site.
 * ======================================================================== */

// ---- Le temps ---------------------------------------------------------------------------------------------------------

const N12 = MOTS.N12.words; // PharmaBoost. Le copilote IA du comptoir de votre pharmacie.
const D5 = MOTS.D5.words; // Il vous fallait autre chose ?
const w12 = (i: number) => N12[i].at;

const SLAM = N12[0].at; // 65,75
const POP_IN = SLAM + 0.15; // le robot jaillit sous le logo
const IRIS = 66.36; // le papier du site s'ouvre (entre « PharmaBoost. » et « Le »)
const IRIS_DUR = 0.42;
const FLY = 0.36;
const LAND = IRIS + FLY; // le robot se pose dans le rond du titre
const WHIP_AT = 69.44; // fin de « pharmacie. » : panoramique filé vers le comptoir
const WHIP_DUR = 0.3;
const BUBBLE = D5[0].at - 0.02; // 69,96
const PLUNGE = 71.44; // fin de « chose ? » (71,51) : coup de zoom dans l'écran du comptoir
const DIVE = 0.26;
const CLOSE = PLUNGE + DIVE; // 71,70 : gros plan sur le robot de l'écran
const WINK = 71.76; // le robot NOUS fait un clin d'œil, en gros plan (tenu jusqu'à l'accord final)
const FINAL = 72.0; // l'accord final
const CLICK = 73.3; // le curseur clique « Réserver une démo »
const FADE = 74.42;

// ---- Les couleurs ------------------------------------------------------------------------------------------------------

const DEEP_BG = "radial-gradient(ellipse 78% 72% at 50% 40%, #1D4C42 0%, #0F2F2A 52%, #071A16 100%)";
const PAPER = "#EFF3F2";
/** Le dégradé du titre du site, version claire pour le fond sombre. */
const LIGHT_A = "#5DE6C8";
const LIGHT_B = "#55CBEF";
const CITRON_RGB = "232,255,156";

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mixHex(a: string, b: string, k: number) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return `rgb(${A.map((c, i) => Math.round(lerp(c, B[i], k))).join(",")})`;
}

/** Un dégradé continu sur une ligne de mots : chaque mot prend sa tranche (au prorata des lettres). */
function gradSlices(words: string[], a: string, b: string) {
  const total = words.join(" ").length;
  let pos = 0;
  return words.map((w) => {
    const k0 = pos / total;
    const k1 = (pos + w.length) / total;
    pos += w.length + 1;
    return `linear-gradient(90deg, ${mixHex(a, b, k0)} 0%, ${mixHex(a, b, k1)} 100%)`;
  });
}

const clipText = (bg: string): CSSProperties => ({ color: "transparent", backgroundImage: bg, WebkitBackgroundClip: "text", backgroundClip: "text" });

/** Le rayon de l'iris citron qui ouvre le papier du site (centré sur le logo). */
const irisR = (t: number) => 1450 * prog(t, IRIS, IRIS_DUR, SNAP);

/**
 * L'éclair d'un claquement : une gerbe de lumière blanche → citron centrée sur le logo, qui s'ouvre et s'éteint en quelques
 * images. En « screen », elle ÉCLAIRE le vert profond au lieu de le voiler d'un gris uniforme (le Flash plein cadre du kit).
 */
function Bloom({ t, at, x, y, dur = 0.16, max = 1 }: { t: number; at: number; x: number; y: number; dur?: number; max?: number }) {
  const k = (t - at) / dur;
  if (k < 0 || k >= 1) return null;
  const a = max * (1 - k) ** 2;
  const r = lerp(460, 1500, SNAP(k));
  const c = (m: number) => `rgba(${CITRON_RGB},${(m * a).toFixed(3)})`;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "screen",
        background: `radial-gradient(circle ${r.toFixed(0)}px at ${x}px ${y}px, rgba(255,255,244,${a.toFixed(3)}) 0%, ${c(0.72)} 20%, ${c(0.24)} 52%, ${c(0.07)} 100%)`,
      }}
    />
  );
}

// ---- Le robot (le Mascot du site) : une seule piste pour toute la scène ------------------------------------------------

const TRACK: Track = {
  id: `S13-robot-${SLAM}-${WINK}`,
  seed: 1313,
  until: TOTAL + 0.2,
  events: [
    { t: 64.0, kind: "mood", mood: "happy" },
    { t: POP_IN - 0.3, kind: "burst", burst: "wave" }, // la main se lève vers 66,05 : coucou
    { t: LAND, kind: "squash" },
    { t: LAND + 0.25, kind: "glance", x: -0.7, y: 0.15, dur: 0.5 }, // il regarde « Le copilote »
    { t: w12(3) + 0.17, kind: "burst", burst: "jump" }, // juste après « IA » : il saute
    { t: w12(6) + 0.05, kind: "glance", x: 0.1, y: 0.85, dur: 0.7 }, // il regarde « de votre pharmacie. »
    { t: 69.2, kind: "blink" },
    { t: 70.25, kind: "glance", x: 0.8, y: 0.05, dur: 0.75 }, // sur l'écran : il regarde la pharmacienne
    { t: WINK, kind: "emote", emote: "wink", dur: 0.8 },
  ],
};

function Robot({ t, x, y, size, rot = 0, sx = 1, sy = 1, opacity = 1 }: { t: number; x: number; y: number; size: number; rot?: number; sx?: number; sy?: number; opacity?: number }) {
  const h = size * 0.92;
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - h / 2, width: size, height: h, transform: `rotate(${rot}deg) scale(${sx}, ${sy})`, transformOrigin: "50% 92%", opacity }}>
      <Mascot track={TRACK} t={t} size={size} />
    </div>
  );
}

// ---- Petits décors -------------------------------------------------------------------------------------------------------

/** Rayons de lumière qui tournent derrière le logo. */
function Rays({ t, x, y, k, size = 2600, alpha = 0.11, color = PB.citron }: { t: number; x: number; y: number; k: number; size?: number; alpha?: number; color?: string }) {
  if (k <= 0) return null;
  const mask = "radial-gradient(circle at 50% 50%, black 0%, rgba(0,0,0,.55) 24%, transparent 56%)";
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `repeating-conic-gradient(from ${t * 9}deg at 50% 50%, ${rgba(color, alpha)} 0deg 4deg, transparent 4deg 15deg)`,
        WebkitMaskImage: mask,
        maskImage: mask,
        opacity: k,
        transform: `scale(${0.55 + 0.45 * k})`,
        mixBlendMode: "screen",
        pointerEvents: "none",
      }}
    />
  );
}

/** Halo doux (sans filtre de flou). */
function Glow({ x, y, size, color, a }: { x: number; y: number; size: number; color: string; a: number }) {
  if (a <= 0) return null;
  return <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(color, a)} 0%, ${rgba(color, a * 0.35)} 32%, transparent 66%)`, pointerEvents: "none" }} />;
}

/** Taches de lumière qui dérivent lentement (dégradés, aucun flou). */
const ORBS = [
  { x: 260, y: 220, s: 520, c: PB.mint, p: 0.0 },
  { x: 1650, y: 260, s: 620, c: PB.citron, p: 1.7 },
  { x: 1500, y: 820, s: 560, c: PB.brand, p: 3.1 },
  { x: 380, y: 840, s: 600, c: PB.cyan, p: 4.4 },
  { x: 980, y: 120, s: 420, c: PB.mint, p: 2.3 },
];
function Orbs({ t, alpha }: { t: number; alpha: number }) {
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      {ORBS.map((o, i) => (
        <Glow key={i} x={o.x + 60 * Math.sin(t * 0.33 + o.p)} y={o.y + 40 * Math.sin(t * 0.27 + o.p * 1.3)} size={o.s * (1 + 0.08 * Math.sin(t * 0.6 + o.p))} color={o.c} a={alpha} />
      ))}
    </AbsoluteFill>
  );
}

// ---- A · le logo claque sur le vert profond ----------------------------------------------------------------------------

const LOGO_A = { x: 960, y: 476 }; // S12 converge vers (960, 540) : le logo claque juste au-dessus
const ROBOT_A = { x: 960, y: 772, size: 210 };

function PhaseA({ t }: { t: number }) {
  const k = prog(t, SLAM, 0.5, SNAP);
  const pre = prog(t, SLAM - 0.3, 0.3, (x) => x * x);
  return (
    <AbsoluteFill style={{ background: DEEP_BG }}>
      <AdnBackdrop t={t} tone="night" opacity={0.18 + 0.32 * k} width={1700} focus={[0.5, 0.5]} drift={1.3} />
      <Orbs t={t} alpha={0.1 * k} />
      <DotGrid t={t} opacity={0.06} color={CITRON_RGB} wave={{ at: SLAM, x: LOGO_A.x, y: LOGO_A.y, color: CITRON_RGB, speed: 1900, width: 260 }} />
      <Camera t={t} drift={0} shakes={[{ at: SLAM, amp: 20, frames: 14 }]}>
        <Glow x={LOGO_A.x} y={LOGO_A.y} size={lerp(1000, 520, pre * (1 - k)) + 300 * k} color={PB.citron} a={0.1 + 0.3 * pre * (1 - k) + 0.12 * k} />
        <Rays t={t} x={LOGO_A.x} y={LOGO_A.y} k={k} />
        <Converge t={t} at={SLAM - 0.45} dur={0.45} x={LOGO_A.x} y={LOGO_A.y} count={36} seed="s13-conv" radius={980} color={PB.citron} size={5} />
        <Ring t={t} at={SLAM} x={LOGO_A.x} y={LOGO_A.y} max={1250} color={PB.citron} width={9} life={0.62} />
        <Ring t={t} at={SLAM + 0.1} x={LOGO_A.x} y={LOGO_A.y} max={900} color={PB.mint} width={4} life={0.55} echo={false} />
        <Sparks t={t} at={SLAM} x={LOGO_A.x} y={LOGO_A.y} count={46} seed="s13-spk" speed={1700} spread={180} color={PB.citron} len={48} life={0.55} width={4} />
        <Burst t={t} at={SLAM + 0.02} x={LOGO_A.x} y={LOGO_A.y} count={22} seed="s13-bst" radius={520} colors={[PB.citron, PB.mint, "#FFFFFF"]} size={12} life={0.6} />
        {/* le robot jaillit : poussière d'étoiles sous ses pieds */}
        <Burst t={t} at={POP_IN + 0.2} x={ROBOT_A.x} y={ROBOT_A.y + 96} count={12} seed="s13-pop" radius={200} colors={[PB.mint, PB.citron]} size={9} life={0.45} />
      </Camera>
    </AbsoluteFill>
  );
}

// ---- B · la phrase du site, sur le papier --------------------------------------------------------------------------------

const TITLE = { size: 108, y1: 482, y2: 608, cx: 996, D: 102, gap: 22, x2: 963 };
const HEADER = { x: 960, y: 150, scale: 0.36 };
const LINE2 = ["de", "votre", "pharmacie."];
const LINE2_GRAD = gradSlices(LINE2, PB.brand, PB.cyan);

/** La légère poussée de caméra du papier (après l'atterrissage du robot), commune au texte et au robot. */
function pushB(t: number) {
  const z = 1 + 0.035 * prog(t, LAND, WHIP_AT - LAND, IN_OUT);
  return `translate(960px, 500px) scale(${z}) translate(-960px, -500px)`;
}

/** Un mot qui monte de sa ligne de base, au moment où il est dit. */
function RiseWord({ t, at, children, style }: { t: number; at: number; children: ReactNode; style?: CSSProperties }) {
  const k = prog(t, at - 2 * F, 0.34, SNAP);
  return (
    <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", padding: "0.06em 0.04em 0.22em", margin: "-0.06em -0.04em -0.22em" }}>
      <span style={{ display: "inline-block", transform: `translateY(${(1 - k) * 112}%) rotate(${(1 - k) * 4}deg)`, transformOrigin: "0 100%", opacity: t < at - 2 * F ? 0 : 1, ...style }}>{children}</span>
    </span>
  );
}

function Kicker({ t }: { t: number }) {
  const k = prog(t, w12(1) + 0.02, 0.42, SNAP);
  if (k <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 960,
        top: 338,
        transform: `translate(-50%, -50%) translateY(${(1 - k) * 18}px)`,
        opacity: k,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 24px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.7)",
        border: "1.5px solid rgba(255,255,255,0.9)",
        boxShadow: "0 10px 26px -16px rgba(15,47,42,0.45)",
        fontFamily: JAKARTA,
        fontWeight: 600,
        fontSize: 24,
        color: PB.inkSoft,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: PB.brand, boxShadow: `0 0 0 ${4 + 3 * Math.sin(t * 5)}px ${rgba(PB.brand, 0.15)}` }} />
      À côté de votre logiciel de gestion · le pharmacien décide
    </div>
  );
}

/** Le rond blanc du titre (comme sur le site), qui reçoit le robot. */
function Disc({ t }: { t: number }) {
  const { cx, y1, D } = TITLE;
  if (t < LAND - 0.14) return null;
  const s = keys(t, [
    [LAND - 0.14, 0],
    [LAND + 0.04, 1.16, POP],
    [LAND + 0.26, 1, IN_OUT],
  ]) * (1 + 0.12 * pulse(t, w12(3), 0.06, 0.02, 0.32));
  return (
    <>
      <div style={{ position: "absolute", left: cx - D / 2, top: y1 - D / 2, width: D, height: D, borderRadius: "50%", background: "rgba(255,255,255,0.88)", boxShadow: `0 12px 30px -12px rgba(15,47,42,0.5), inset 0 0 0 1.5px #FFFFFF, 0 0 0 ${6 * pulse(t, w12(3), 0.05, 0.05, 0.4)}px ${rgba(PB.citron, 0.9)}`, transform: `scale(${s})` }} />
      <Ring t={t} at={LAND} x={cx} y={y1} max={300} color={PB.brand} width={4} life={0.5} echo={false} />
      <Ring t={t} at={w12(3) + 0.02} x={cx} y={y1} max={340} color={PB.citron} width={6} life={0.5} />
    </>
  );
}

function TitleLine1({ t }: { t: number }) {
  const { size, y1, cx, D, gap } = TITLE;
  const base: CSSProperties = { position: "absolute", top: y1, fontFamily: JAKARTA, fontWeight: 700, fontSize: size, letterSpacing: "-0.045em", lineHeight: 1.05, color: PB.green, whiteSpace: "nowrap" };
  const hl = prog(t, w12(3) + 0.06, 0.26, SNAP);
  return (
    <>
      <div style={{ ...base, left: cx - D / 2 - gap, transform: "translate(-100%, -50%)" }}>
        <RiseWord t={t} at={w12(1)}>Le</RiseWord> <RiseWord t={t} at={w12(2)}>copilote</RiseWord>{" "}
        <span style={{ position: "relative", display: "inline-block", marginLeft: "0.12em", marginRight: "0.1em" }}>
          {/* « IA » : la capsule vert profond de la bannière glisse dessous, les lettres passent au citron */}
          <span style={{ position: "absolute", left: "-0.13em", right: "-0.13em", top: "0.05em", bottom: "-0.05em", background: PB.green, borderRadius: "0.22em", transform: `scaleX(${hl})`, transformOrigin: "0 50%", boxShadow: `0 10px 26px -10px ${rgba(PB.green, 0.7)}, 0 0 ${34 * pulse(t, w12(3) + 0.12, 0.1, 0.1, 0.5)}px ${rgba(PB.citron, 0.85)}` }} />
          <span style={{ position: "relative" }}>
            <RiseWord t={t} at={w12(3)} style={{ color: mixHex(PB.green, PB.citron, clamp01(hl * 1.5 - 0.25)) }}>
              IA
            </RiseWord>
          </span>
        </span>
      </div>
      <div style={{ ...base, left: cx + D / 2 + gap, transform: "translate(0, -50%)" }}>
        <RiseWord t={t} at={w12(4)}>du</RiseWord> <RiseWord t={t} at={w12(5)}>comptoir</RiseWord>
      </div>
    </>
  );
}

function TitleLine2({ t }: { t: number }) {
  const { size, y2 } = TITLE;
  const ats = [w12(6), w12(7), w12(8)];
  return (
    <div style={{ position: "absolute", left: TITLE.x2, top: y2, transform: "translate(-50%, -50%)", fontFamily: JAKARTA, fontWeight: 700, fontSize: size, letterSpacing: "-0.045em", lineHeight: 1.05, whiteSpace: "nowrap" }}>
      {LINE2.map((w, i) => {
        // le reflet blanc qui traverse la ligne, mot après mot
        const sh = prog(t, 68.98 + i * 0.09, 0.42, IN_OUT);
        const p = -30 + 160 * sh;
        const sheen = sh > 0 && sh < 1 ? `linear-gradient(100deg, transparent ${p - 16}%, ${PB.mint} ${p}%, transparent ${p + 16}%), ` : "";
        return (
          <span key={w}>
            <RiseWord t={t} at={ats[i]} style={clipText(sheen + LINE2_GRAD[i])}>
              {w}
            </RiseWord>
            {i < LINE2.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
}

function PhaseB({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <AdnBackdrop t={t} tone="paper" width={1800} focus={[0.5, 0.56]} drift={1.4} wash={0.1} />
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {ORBS.slice(0, 4).map((o, i) => (
          <Glow key={i} x={o.x + 50 * Math.sin(t * 0.35 + o.p)} y={o.y + 36 * Math.sin(t * 0.3 + o.p)} size={o.s} color={i % 2 ? PB.brand : PB.mint} a={0.07} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: pushB(t), transformOrigin: "0 0" }}>
        <Kicker t={t} />
        <Disc t={t} />
        <TitleLine1 t={t} />
        <TitleLine2 t={t} />
        <Sparkle t={t} at={69.06} x={1500} y={TITLE.y2 - 52} size={80} color={PB.citron} />
        <Sparkle t={t} at={67.5} x={TITLE.cx + 54} y={TITLE.y1 - 62} size={54} color={PB.citron} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---- A ↔ B · le logo et le robot, qui passent d'un monde à l'autre --------------------------------------------------------

function quad(a: number, b: number, c: number, u: number) {
  return (1 - u) * (1 - u) * a + 2 * u * (1 - u) * b + u * u * c;
}

function Shared({ t }: { t: number }) {
  const sA = shake(t, SLAM, 20, 14);
  // Le logo : il claque au centre, puis file en en-tête du site (et passe du blanc sur vert à l'encre sur papier).
  const f = prog(t, IRIS, FLY, IN_OUT);
  const lx = LOGO_A.x + sA.x * (1 - f);
  const ly = lerp(LOGO_A.y, HEADER.y, f) + sA.y * (1 - f);
  const ls = lerp(1, HEADER.scale, f) * (1 - 0.035 * Math.sin(Math.PI * f));
  // L'iris passe SUR le logo : dans le cercle, l'encre du site ; dehors, le blanc du vert profond (aucune image pâle).
  const r = irisR(t);
  const irisOn = t >= IRIS && t < IRIS + IRIS_DUR;
  const outMask = `radial-gradient(circle at ${LOGO_A.x}px ${LOGO_A.y}px, transparent ${r.toFixed(1)}px, black ${(r + 0.5).toFixed(1)}px)`;
  const outside: CSSProperties | undefined = irisOn ? { WebkitMaskImage: outMask, maskImage: outMask } : undefined;
  const inside: CSSProperties | undefined = irisOn ? { clipPath: `circle(${r.toFixed(1)}px at ${LOGO_A.x}px ${LOGO_A.y}px)` } : undefined;
  const logoDark = t >= SLAM && t < IRIS + IRIS_DUR && (
    <AbsoluteFill style={outside}>
      <PBLogo t={t} at={SLAM} size={150} x={lx} y={ly} scale={ls} />
    </AbsoluteFill>
  );
  const logoLight = t >= IRIS && (
    <AbsoluteFill style={inside}>
      <PBLogo t={t} size={150} tone="light" grad x={lx} y={ly} scale={ls} />
    </AbsoluteFill>
  );

  // Le robot : il jaillit sous le logo et fait coucou, puis vole en arc jusqu'au rond du titre.
  let robot: ReactNode = null;
  if (t >= POP_IN) {
    const up = prog(t, POP_IN, 0.34, POP);
    const g = prog(t, IRIS + 0.02, FLY - 0.02, IN_OUT);
    const land = squash(t, LAND, 7 * F);
    const hop = squash(t, POP_IN + 0.26, 6 * F);
    const x0 = ROBOT_A.x + sA.x;
    const y0 = ROBOT_A.y + (1 - up) * 380 + sA.y;
    const x = quad(x0, (x0 + TITLE.cx) / 2 + 240, TITLE.cx, g);
    const y = quad(y0, 300, TITLE.y1, g);
    const size = lerp(ROBOT_A.size, 80, g);
    const rot = -16 * Math.sin(Math.PI * g) + (1 - up) * 10;
    const sx = (g < 1 ? hop.sx : land.sx) * (1 + 0.05 * Math.sin(Math.PI * g));
    const sy = (g < 1 ? hop.sy : land.sy) * (1 - 0.05 * Math.sin(Math.PI * g));
    // son socle de lumière, sous le buste, tant qu'il est sur le vert
    const base = (1 - g) * up;
    robot = (
      <>
        {base > 0 && <div style={{ position: "absolute", left: x - size * 0.55, top: y + size * 0.36, width: size * 1.1, height: size * 0.26, borderRadius: "50%", background: `radial-gradient(ellipse at 50% 50%, ${rgba(PB.citron, 0.42 * base)} 0%, ${rgba(PB.mint, 0.16 * base)} 45%, transparent 72%)` }} />}
        <Robot t={t} x={x} y={y + 2} size={size} rot={rot} sx={sx} sy={sy} />
      </>
    );
  }
  const after = t >= LAND;
  return (
    <AbsoluteFill style={{ transform: after ? pushB(t) : undefined, transformOrigin: "0 0", pointerEvents: "none" }}>
      {logoDark}
      {logoLight}
      {robot}
    </AbsoluteFill>
  );
}

// ---- C · le clin d'œil, au comptoir --------------------------------------------------------------------------------------

/** L'écran du comptoir (cadre virtuel 1600 × 1000) : le vert de la bannière et le robot, qui fait un clin d'œil. */
function ScreenRobot({ t }: { t: number }) {
  const size = 560;
  const h = size * 0.92;
  const left = 800 - size / 2;
  const top = 520 - h / 2;
  const wink = pulse(t, WINK, 0.08, 0.5, 0.3);
  // le nom s'efface pendant le coup de zoom : en gros plan, il serait coupé par le bas du cadre
  const nameOut = prog(t, PLUNGE, DIVE * 0.6, IN_OUT);
  return (
    <div style={{ position: "absolute", inset: 0, background: DEEP_BG, overflow: "hidden" }}>
      {/* 1 400 px dans l'écran : jamais plus de 1 920 px affichés, même au plus près du gros plan (× 6,7) */}
      <AdnBackdrop t={t} tone="night" opacity={0.55} width={1400} focus={[0.5, 0.5]} drift={1} />
      <Glow x={800} y={500} size={1100 + 120 * Math.sin(t * 3)} color={PB.citron} a={0.16 + 0.22 * wink} />
      <div style={{ position: "absolute", left: 800 - 330, top: 520 - 330, width: 660, height: 660, borderRadius: "50%", border: `10px solid ${rgba(PB.citron, 0.18 + 0.4 * wink)}`, transform: `scale(${1 + 0.06 * Math.sin(t * 2.4)})` }} />
      <div style={{ position: "absolute", left, top, width: size, height: h }}>
        <Mascot track={TRACK} t={t} size={size} />
      </div>
      <Sparkle t={t} at={WINK - 0.06} x={left + size * 0.72} y={top + h * 0.12} size={170} color={PB.citron} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, textAlign: "center", fontFamily: JAKARTA, fontWeight: 800, fontSize: 88, letterSpacing: "-0.035em", color: "#FFFFFF", opacity: 1 - nameOut, transform: `translateY(${40 * nameOut}px)` }}>
        Pharma<span style={{ color: PB.citron }}>Boost</span>
      </div>
    </div>
  );
}

/** Le texte de la bulle, mot à mot sur la voix : « Il vous fallait » en petit, « autre chose ? » en grand. */
function BubbleText({ t }: { t: number }) {
  const word = (i: number, text: string) => {
    const k = prog(t, D5[i].at - 2 * F, 0.2, SNAP);
    return (
      <span key={i} style={{ display: "inline-block", opacity: 0.18 + 0.82 * k, transform: `translateY(${(1 - k) * 0.12}em)` }}>
        {text}
      </span>
    );
  };
  return (
    <span style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: "0.62em", fontWeight: 700, opacity: 0.86, marginBottom: "0.08em" }}>
        {word(0, "Il")} {word(1, "vous")} {word(2, "fallait")}
      </span>
      <span style={{ display: "block" }}>
        {word(3, "autre")} {word(4, "chose ?")}
      </span>
    </span>
  );
}

/** Le visage du robot de l'écran, en coordonnées du décor (dalle centrée en 432, 400 ; 1 px virtuel = 0,1875 px). */
const FACE_C = { x: 432, y: 393 };
/** Le gros plan : la dalle (300 px) déborde du cadre (≥ 1 920 px), le robot remplit l'image. */
const Z_CLOSE = 6.5;

function PhaseC({ t }: { t: number }) {
  // Le regard : du plan moyen (pharmacienne + écran + bulle) au coup de zoom dans l'écran, puis le gros plan tenu.
  const push = prog(t, WHIP_AT, PLUNGE - WHIP_AT, IN_OUT);
  const fx0 = lerp(760, 792, push) + wobble(t, 31, 4, 0.5);
  const fy0 = lerp(384, 338, push) + wobble(t, 32, 3, 0.5);
  const z0 = lerp(1.45, 1.76, push);
  const dive = prog(t, PLUNGE, DIVE, WHIP);
  const settle = 1 + 0.035 * prog(t, CLOSE, FINAL - CLOSE, (x) => x);
  const z = Math.exp(lerp(Math.log(z0), Math.log(Z_CLOSE), dive)) * settle;
  // le visage glisse droit vers le centre de l'image pendant que la caméra fonce (aucun aller-retour latéral)
  const px = lerp(960 + z0 * (FACE_C.x - fx0), 960, dive);
  const py = lerp(540 + z0 * (FACE_C.y - fy0), 540, dive);
  const fx = FACE_C.x - (px - 960) / z;
  const fy = FACE_C.y - (py - 540) / z;
  const tilt = lerp(18, 0, prog(t, PLUNGE, DIVE, IN_OUT));
  const bubbleGlow = 0.42 + 0.12 * Math.sin(t * 4);
  return (
    <AbsoluteFill style={{ background: PAPER, overflow: "hidden" }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${960 - z * fx}px, ${540 - z * fy}px) scale(${z})` }}>
        <Pharmacy t={t} mood="pb" screen="pb" screenPower={1} screenContent={<ScreenRobot t={t} />} screenTilt={tilt}>
          <Pharmacienne t={t} mood="pb" expression="sourire" talk={[[D5[0].at, MOTS.D5.end]]} />
          {/* la bulle « lumineuse » : un halo citron derrière elle (sans filtre : la caméra plonge ensuite à × 7) */}
          <Glow x={1040} y={178} size={620} color={PB.citron} a={bubbleGlow * prog(t, BUBBLE, 0.3, SNAP) * (1 - prog(t, PLUNGE, 0.22, SNAP))} />
          <Bubble t={t} at={BUBBLE} exitAt={PLUNGE + 0.02} side="left" mood="pb" x={852} y={262} size={44} text={<BubbleText t={t} />} />
        </Pharmacy>
      </AbsoluteFill>
      {/* la plongée : le bord du cadre s'assombrit vers le vert de l'écran */}
      <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(ellipse 60% 60% at 50% 50%, transparent 40%, ${rgba(PB.green, 0.7 * dive)} 100%)` }} />
    </AbsoluteFill>
  );
}

// ---- D · l'accord final ---------------------------------------------------------------------------------------------------

const FIN = { logoY: 300, tagY: 446, urlY: 574, btnY: 716 };
const TAGLINE = ["Le", "copilote", "IA", "du", "comptoir"];
const TAGLINE2 = ["de", "votre", "pharmacie."];
const TAG2_GRAD = gradSlices(TAGLINE2, LIGHT_A, LIGHT_B);

function Tagline({ t }: { t: number }) {
  const at0 = FINAL + 0.2;
  const all = [...TAGLINE, ...TAGLINE2];
  return (
    <div style={{ position: "absolute", left: 960, top: FIN.tagY, transform: "translate(-50%, -50%)", fontFamily: JAKARTA, fontWeight: 700, fontSize: 40, letterSpacing: "-0.02em", lineHeight: 1.2, whiteSpace: "nowrap", color: rgba("#FFFFFF", 0.88) }}>
      {all.map((w, i) => {
        const g = i - TAGLINE.length;
        return (
          <span key={i}>
            <RiseWord t={t} at={at0 + i * 0.035} style={g >= 0 ? clipText(TAG2_GRAD[g]) : undefined}>
              {w}
            </RiseWord>
            {i < all.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
}

function LockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
      <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke={PB.green} strokeWidth={2.4} strokeLinecap="round" />
      <rect x="5" y="10.2" width="14" height="10.3" rx="2.6" fill={PB.green} />
      <circle cx="12" cy="15.2" r="1.6" fill={PB.mint} />
    </svg>
  );
}

/** « pharmaboost.app » s'écrit dans une barre d'adresse en verre. */
function UrlPill({ t }: { t: number }) {
  const at = FINAL + 0.1;
  if (t < at) return null;
  const k = prog(t, at, 0.42, POP);
  const text = "pharmaboost.app";
  const typed = Math.max(0, Math.min(text.length, Math.floor((t - (at + 0.08)) / 0.022) + 1));
  const caret = t < at + 1.4 ? (Math.floor((t - at) / 0.26) % 2 === 0 ? 1 : 0.15) : 0;
  const sheen = Math.max(prog(t, at + 0.5, 0.55, IN_OUT) * (t < at + 1.2 ? 1 : 0), t > 73.9 ? prog(t, 73.9, 0.55, IN_OUT) : 0);
  const sp = -30 + 160 * sheen;
  // Le texte entier occupe sa place dès le début (la suite est invisible) : les lettres s'écrivent EN PLACE, sans que
  // l'adresse centrée glisse à chaque lettre ; le curseur, sans largeur, ne la décentre pas à la fin.
  const seg = (a: number, b: number) => text.slice(a, Math.max(a, Math.min(b, typed)));
  const rest = (a: number, b: number) => text.slice(Math.max(a, Math.min(b, typed)), b);
  return (
    <div
      style={{
        position: "absolute",
        left: 960,
        top: FIN.urlY,
        transform: `translate(-50%, -50%) scale(${0.72 + 0.28 * k})`,
        opacity: clamp01((t - at) / 0.08),
        height: 108,
        width: 800,
        borderRadius: 999,
        background: "linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.06) 100%)",
        border: "1.5px solid rgba(255,255,255,0.22)",
        boxShadow: `0 24px 60px -20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.25), 0 0 ${40 + 20 * Math.sin(t * 3)}px ${rgba(PB.mint, 0.14)}`,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div style={{ marginLeft: 22, width: 66, height: 66, borderRadius: "50%", background: PB.citron, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 26px ${rgba(PB.citron, 0.5)}`, flexShrink: 0 }}>
        <LockIcon size={34} />
      </div>
      <div style={{ flex: 1, textAlign: "center", marginRight: 66, fontFamily: JAKARTA, fontWeight: 800, fontSize: 64, letterSpacing: "-0.03em", color: "#FFFFFF", whiteSpace: "nowrap" }}>
        {seg(0, 11)}
        <span style={{ color: PB.citron }}>{seg(11, text.length)}</span>
        <span style={{ display: "inline-block", position: "relative", width: 0, height: 0 }}>
          <span style={{ position: "absolute", left: 4, bottom: -7, width: 5, height: 56, background: PB.citron, opacity: caret, borderRadius: 2 }} />
        </span>
        <span style={{ opacity: 0 }}>
          {rest(0, 11)}
          {rest(11, text.length)}
        </span>
      </div>
      {sheen > 0 && sheen < 1 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(105deg, transparent ${sp - 14}%, rgba(255,255,255,0.28) ${sp}%, transparent ${sp + 14}%)`, pointerEvents: "none" }} />}
    </div>
  );
}

/** Le bouton du site : « Réserver une démo », que le curseur vient cliquer. */
function DemoButton({ t }: { t: number }) {
  const at = FINAL + 0.3;
  if (t < at) return null;
  const k = prog(t, at, 0.45, POP);
  const press = 1 - 0.07 * pulse(t, CLICK - 2 * F, 2 * F, 3 * F, 10 * F);
  const lit = prog(t, CLICK, 0.3, SNAP);
  const arrow = 6 * Math.max(0, Math.sin(((t - at) * 2 * Math.PI) / 1.1)) + 8 * pulse(t, CLICK, 0.06, 0.05, 0.3);
  return (
    <div
      style={{
        position: "absolute",
        left: 960,
        top: FIN.btnY,
        transform: `translate(-50%, -50%) translateY(${(1 - k) * 40}px) scale(${(0.8 + 0.2 * k) * press})`,
        opacity: clamp01((t - at) / 0.1),
        height: 86,
        padding: "0 46px 0 50px",
        borderRadius: 999,
        background: BRAND_GRAD,
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: JAKARTA,
        fontWeight: 700,
        fontSize: 34,
        letterSpacing: "-0.01em",
        color: "#FFFFFF",
        whiteSpace: "nowrap",
        boxShadow: `0 18px 40px -14px ${rgba(PB.brand, 0.9)}, inset 0 1px 0 rgba(255,255,255,0.3), 0 0 0 ${2 + 6 * lit}px ${rgba(PB.citron, 0.25 + 0.5 * lit)}`,
      }}
    >
      Réserver une démo
      <svg width={30} height={30} viewBox="0 0 24 24" style={{ transform: `translateX(${arrow}px)` }}>
        <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function FinalCard({ t }: { t: number }) {
  const k = prog(t, FINAL, 0.6, SNAP);
  const fade = prog(t, FADE, TOTAL - FADE - F, IN_OUT);
  // le curseur arrive, clique, puis glisse à peine ; sa pointe se pose entre « démo » et la flèche, juste sous la ligne
  // du texte : ni les lettres ni la flèche ne sont cachées pendant la dernière image tenue
  const cIn = prog(t, CLICK - 0.5, 0.42, SNAP);
  const cx = lerp(1460, 1108, cIn) + 10 * prog(t, CLICK + 0.3, 1, IN_OUT);
  const cy = lerp(1000, FIN.btnY + 22, cIn) + 8 * prog(t, CLICK + 0.3, 1, IN_OUT);
  return (
    <AbsoluteFill style={{ background: DEEP_BG, overflow: "hidden" }}>
      <AdnBackdrop t={t} tone="night" opacity={0.42} width={1700} focus={[0.5, 0.5]} drift={1.3} />
      <Orbs t={t} alpha={0.11} />
      <DotGrid t={t} opacity={0.055} color={CITRON_RGB} wave={{ at: FINAL, x: 960, y: FIN.logoY, color: CITRON_RGB, speed: 2000, width: 280 }} />
      <Camera t={t} drift={0.35} zoom={1.06 + 0.022 * prog(t, FINAL + 0.4, 2.6, IN_OUT)} origin={[960, 500]} shakes={[{ at: FINAL, amp: 22, frames: 16 }, { at: CLICK, amp: 3, frames: 8 }]}>
        <Glow x={960} y={FIN.logoY} size={lerp(600, 1200, k)} color={PB.citron} a={0.12 + 0.04 * Math.sin(t * 2.2)} />
        <Rays t={t} x={960} y={FIN.logoY} k={k} alpha={0.055 + 0.07 * (1 - prog(t, FINAL + 0.3, 1.2, IN_OUT))} />
        <Ring t={t} at={FINAL} x={960} y={FIN.logoY} max={1400} color={PB.citron} width={10} life={0.7} />
        <Ring t={t} at={FINAL + 0.12} x={960} y={FIN.logoY} max={1000} color={PB.mint} width={5} life={0.6} echo={false} />
        <Sparks t={t} at={FINAL} x={960} y={FIN.logoY} count={52} seed="s13-fin" speed={1800} spread={180} color={PB.citron} len={54} life={0.6} width={4} />
        <Burst t={t} at={FINAL + 0.03} x={960} y={FIN.logoY} count={26} seed="s13-finb" radius={600} colors={[PB.citron, PB.mint, "#FFFFFF"]} size={13} life={0.65} />
        <PBLogo t={t} at={FINAL} size={128} x={960} y={FIN.logoY} />
        <Tagline t={t} />
        <UrlPill t={t} />
        <DemoButton t={t} />
        {t >= CLICK - 0.5 && <Cursor t={t} x={cx} y={cy} clickAt={CLICK} opacity={cIn} size={1.25} />}
      </Camera>
      <Confetti t={t} at={FINAL + 0.02} x={40} y={1100} count={80} seed="s13-cg" power={3100} spread={18} angle={-64} gravity={900} colors={[PB.citron, PB.mint, "#FFFFFF", PB.brand]} life={2.9} />
      <Confetti t={t} at={FINAL + 0.02} x={1880} y={1100} count={80} seed="s13-cd" power={3100} spread={18} angle={-116} gravity={900} colors={[PB.mint, PB.citron, "#FFFFFF", PB.cyan]} life={2.9} />
      <AbsoluteFill style={{ background: PB.green, opacity: fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
}

// ---- La scène ---------------------------------------------------------------------------------------------------------------

function Frame({ t }: { t: number }) {
  if (t >= FINAL) return <FinalCard t={t} />;
  const whip = prog(t, WHIP_AT, WHIP_DUR, WHIP);
  const r = irisR(t);
  const irisRing = t >= IRIS && t < IRIS + IRIS_DUR;
  const showB = t >= IRIS && t < WHIP_AT + WHIP_DUR;
  return (
    <AbsoluteFill>
      {t < IRIS + 0.45 && <PhaseA t={t} />}
      {t < WHIP_AT + WHIP_DUR && (
        <AbsoluteFill style={{ transform: whip > 0 ? `translateX(${-1920 * whip}px)` : undefined }}>
          {showB && (
            <AbsoluteFill style={{ clipPath: t < IRIS + 0.42 ? `circle(${r.toFixed(1)}px at ${LOGO_A.x}px ${LOGO_A.y}px)` : undefined }}>
              <PhaseB t={t} />
            </AbsoluteFill>
          )}
          {irisRing && (
            <div style={{ position: "absolute", left: LOGO_A.x - r, top: LOGO_A.y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", border: `${14 * (1 - prog(t, IRIS, 0.42, IN_OUT))}px solid ${PB.citron}`, boxShadow: `0 0 40px ${rgba(PB.citron, 0.6)}`, pointerEvents: "none" }} />
          )}
          <Shared t={t} />
        </AbsoluteFill>
      )}
      {t >= WHIP_AT && (
        <AbsoluteFill style={{ transform: whip < 1 ? `translateX(${1920 * (1 - whip)}px)` : undefined }}>
          <PhaseC t={t} />
        </AbsoluteFill>
      )}
      <Bloom t={t} at={SLAM} x={LOGO_A.x} y={LOGO_A.y} dur={0.16} max={0.95} />
    </AbsoluteFill>
  );
}

export function Scene({ t }: { t: number }) {
  // deux flous de mouvement courts : le panoramique filé (0,23 s) et le coup de zoom dans l'écran (0,2 s)
  const blurOn = (t > WHIP_AT + 0.04 && t < WHIP_AT + WHIP_DUR - 0.03) || (t > PLUNGE + 0.04 && t < CLOSE - 0.02);
  return (
    <AbsoluteFill style={{ background: PB.green, overflow: "hidden" }}>
      <MotionBlur on={blurOn} samples={8}>
        {(tt) => <Frame t={tt} />}
      </MotionBlur>
      {/* le logo de l'accord final est en (960, 300) sous une caméra × 1,06 centrée en (960, 500) : à l'image, y ≈ 288 */}
      <Bloom t={t} at={FINAL} x={960} y={288} dur={0.18} max={1} />
    </AbsoluteFill>
  );
}

// ---- Les bruitages ----------------------------------------------------------------------------------------------------------

export const cues: Cue[] = [
  // A — « PharmaBoost. » : le logo claque (le coup d'impact-epique tombe 0,89 s après son début)
  cue("impact-epique", SLAM - 0.89, 0.7),
  cue("sub-boom", SLAM - 0.02, 0.6),
  cue("etincelle", SLAM + 0.04, 0.3),
  cue("robot-boing", POP_IN + 0.02, 0.3), // discret : il tombe sous « …Boost. »
  // A → B — l'iris, le logo file en en-tête, le robot se pose dans le titre
  cue("whoosh-pb", IRIS - 0.05, 0.45),
  cue("pop-leger", LAND, 0.42),
  // B — « IA » : le robot saute ; le reflet sur « de votre pharmacie. »
  cue("robot-boing", w12(3) + 0.18, 0.22, 1.15),
  cue("scintillement", 68.98, 0.28),
  // B → C — le panoramique filé (le souffle culmine 0,49 s après son début)
  cue("whoosh-rapide", WHIP_AT + 0.13 - 0.49, 0.5),
  // C — la bulle, le coup de zoom dans l'écran, le clin d'œil (après la voix : 71,51)
  cue("bulle", BUBBLE - 0.02, 0.45),
  cue("swoosh", PLUNGE + 0.02, 0.42),
  cue("etincelle", WINK + 0.02, 0.45),
  // D — l'accord final (72,0)
  cue("impact-epique", FINAL - 0.89, 0.82),
  cue("sub-boom", FINAL - 0.01, 0.65),
  cue("etincelle-magique", FINAL - 0.31, 0.5),
  cue("canon-confettis", FINAL + 0.02, 0.45),
  cue("scintillement", FINAL + 0.1, 0.4),
  cue("applaudissements", FINAL + 0.15, 0.3, 1, TOTAL - FINAL - 0.15),
  cue("ui-clic", CLICK, 0.55),
  cue("pop-leger", CLICK + 0.03, 0.3),
];
