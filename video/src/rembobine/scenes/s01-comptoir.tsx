import { useId } from "react";
import { AbsoluteFill } from "remotion";
import {
  A1,
  SET,
  Pharmacy,
  Pharmacienne,
  Patient,
  Ordonnance,
  MedBox,
  Douchette,
  Bubble,
  Camera,
  Flash,
  coldGrade,
  rgba,
  prog,
  keys,
  clamp01,
  lerp,
  hash,
  SNAP,
  IN_OUT,
  WHIP,
  EXIT,
  LINEAR,
  F,
  cue,
  type Cue,
} from "../kit";

/* ==========================================================================
 * S1 · LE COMPTOIR (0 → 6,5) — l'ouverture, documentaire, néon froid.
 *
 *  0 → 1,0    GROS PLAN dans le noir : la boîte « Amoxicilline 1 g » sur le comptoir, le sac vide, le corps du patient à
 *             droite. Le néon claque en deux salves (son « neon » posé à 0 : salve 1 de 0 à 0,3, salve 2 de 0,8 à 1,1).
 *             Entre les deux, dans le noir, la main de la pharmacienne descend la douchette : laser rouge à 0,52, bip et
 *             diode verte à 0,70.
 *  1,0        COUPE sur la 2e salve : le plan large du comptoir, éclairé (encore deux grésillements), la boîte est dans le
 *             sac. La caméra avance lentement jusqu'à 6,0.
 *  D1         « Et avec ceci… » (1,40) puis « Autre chose ? » sur « autre » (2,78) ; la pharmacienne, lasse, parle.
 *  D2         « Non merci. » (4,30) ; il prend son sac pendant qu'il le dit (4,36 → 4,86), se retourne et part (4,90) ;
 *             la porte s'ouvre et carillonne (5,30), il passe la porte (5,78 → 5,90), elle se referme (5,86 → 5,96).
 *  6,0        ARRÊT SUR IMAGE : l'image se fige (le temps reste à 6,0), se désature d'un coup, éclair, petit coup de zoom.
 *  6,17       FILÉ vers la droite (WHIP, 0,27 s, flou horizontal) : la caméra suit le patient dans la rue — S2 arrive
 *             par la droite au même rythme (WHIP_AT / WHIP_DUR exportés pour S2).
 *
 * Exporte aussi <Comptoir t/> : le plan large tel qu'il est à l'instant t (S2 s'en sert pour sa vignette de sortie,
 * « Non merci. » à 4,62).
 * ======================================================================== */

export const CUT = 1.0;
export const FREEZE = 6.0;
export const WHIP_AT = 6.17;
export const WHIP_DUR = 0.27;
/** La course du filé (px) : un cadre entier et un peu plus, pour que le bord flou sorte aussi. */
export const WHIP_RUN = 2060;
const BEAM_AT = 0.52;
const BEAM_DUR = 0.32;

/** Le filé partagé avec S2 : 0 → 1. */
export const whipK = (t: number) => prog(t, WHIP_AT, WHIP_DUR, WHIP);
/** Le flou horizontal du filé (px), d'après la vitesse. */
export function whipBlur(t: number) {
  const v = Math.abs(whipK(t + F) - whipK(t)) * WHIP_RUN; // px par image
  return Math.min(70, v * 0.55);
}

/* ------------------------------------------------------------------ la lumière */

/** Une salve de néon : niveaux tirés à graine toutes les 2 images entre `a` et `b`. */
function salve(t: number, a: number, b: number, seed: string, lo: number, hi: number): number | null {
  if (t < a || t >= b) return null;
  const step = Math.floor((t - a) * 30);
  const on = hash(seed, step) < 0.6;
  return on ? lerp(lo, hi, 0.5 + 0.5 * hash(`${seed}v`, step)) : lo * 0.4;
}

function macroLight(t: number) {
  if (t < 0.02) return 0;
  return salve(t, 0.02, 0.3, "s1neonA", 0.06, 0.7) ?? salve(t, 0.8, CUT, "s1neonB", 0.08, 0.9) ?? 0.06;
}

function wideLight(t: number) {
  return salve(t, CUT, CUT + 0.17, "s1neonC", 0.55, 1) ?? 1;
}

/* ------------------------------------------------------------------ le gros plan : la main, la douchette */

type Pt = { x: number; y: number };

/** Épaule → coude → poignet (coude vers le bas), comme le bras de la pharmacienne du kit. */
function ik(s: Pt, w: Pt, a: number, b: number): { elbow: Pt; wrist: Pt } {
  const dx = w.x - s.x;
  const dy = w.y - s.y;
  const d0 = Math.hypot(dx, dy) || 1e-6;
  const d = Math.min(d0, a + b - 0.5);
  const wrist = { x: s.x + (dx / d0) * d, y: s.y + (dy / d0) * d };
  const base = Math.atan2(dy, dx);
  const A = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const e1 = { x: s.x + a * Math.cos(base + A), y: s.y + a * Math.sin(base + A) };
  const e2 = { x: s.x + a * Math.cos(base - A), y: s.y + a * Math.sin(base - A) };
  return { elbow: e1.y > e2.y ? e1 : e2, wrist };
}

const COAT = coldGrade("#FFFFFF");
const COAT_LINE = coldGrade("#C2D1CC");
const SKIN = coldGrade("#EEC09E");
const SKIN_SH = coldGrade("#DCA07D");
const SHOULDER: Pt = { x: 860, y: 378 };
const SCAN_SIZE = 0.55;
/** La ligne du laser sur la boîte : sur le bandeau du bas, le nom « Amoxicilline 1 g » reste lisible au-dessus. */
const LASER_Y = 570;

/** La fenêtre de la douchette (monde) et son angle, à l'instant t : elle descend dans le noir, bipe, remonte. */
function scanPose(t: number) {
  const hover: Pt = { x: 1008 + Math.sin(t * 9) * 1.2, y: 476 + Math.sin(t * 7) * 1.0 };
  const up: Pt = { x: 968, y: 392 };
  const down = prog(t, 0.26, 0.24, SNAP);
  const lift = prog(t, 0.84, 0.2, IN_OUT);
  const p = { x: lerp(lerp(up.x, hover.x, down), up.x + 10, lift), y: lerp(lerp(up.y, hover.y, down), up.y - 10, lift) };
  const angle = lerp(lerp(-14, 2, down), -10, lift);
  return { ...p, angle };
}

/** La main sur la poignée : la poignée de la douchette, en miroir (elle part vers la gauche, vers la pharmacienne). */
function gripOf(p: { x: number; y: number; angle: number }) {
  const local = { x: 79 * SCAN_SIZE, y: -130 * SCAN_SIZE };
  const a = (p.angle * Math.PI) / 180;
  const rx = local.x * Math.cos(a) - local.y * Math.sin(a);
  const ry = local.x * Math.sin(a) + local.y * Math.cos(a);
  return { x: p.x - rx, y: p.y + ry, rot: 180 - (-22 + p.angle) };
}

function beamLevel(t: number) {
  const u = (t - BEAM_AT) / BEAM_DUR;
  if (u < 0 || u > 1) return 0;
  return u < 0.12 ? (Math.floor((t - BEAM_AT) * 120) % 2 ? 0.55 : 1) : 1 - clamp01((u - 0.8) / 0.2);
}

function ledLevel(t: number) {
  const ld = t - BEAM_AT - BEAM_DUR * 0.6;
  return ld >= 0 && ld < 0.45 ? 1 - ld / 0.45 : 0;
}

function ScanArm({ t }: { t: number }) {
  const p = scanPose(t);
  const g = gripOf(p);
  const arm = ik(SHOULDER, { x: g.x - 10, y: g.y + 4 }, 116, 112);
  const path = `M${SHOULDER.x},${SHOULDER.y} L${arm.elbow.x},${arm.elbow.y} L${arm.wrist.x},${arm.wrist.y}`;
  return (
    <>
      {/* la douchette, en miroir autour de sa fenêtre */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: "scaleX(-1)", transformOrigin: `${p.x}px ${p.y}px` }}>
        <Douchette t={t} x={p.x} y={p.y} angle={p.angle} size={SCAN_SIZE} beamAt={BEAM_AT} beamDur={BEAM_DUR} beamLength={(LASER_Y - p.y) / SCAN_SIZE} beamWidth={175} mood="act1" />
      </div>
      {/* le bras (blouse) et la main qui serre la poignée */}
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <path d={path} fill="none" stroke={COAT_LINE} strokeWidth={38} strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} fill="none" stroke={COAT} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
        <g transform={`translate(${g.x} ${g.y}) rotate(${g.rot})`}>
          <ellipse cx={-2} cy={0} rx={19} ry={15} fill={SKIN} />
          <ellipse cx={-10} cy={-12} rx={9} ry={5.5} fill={SKIN} transform="rotate(25 -10 -12)" />
          <path d="M-14,8 Q-4,13 8,9" fill="none" stroke={SKIN_SH} strokeWidth={2} strokeLinecap="round" />
        </g>
      </svg>
    </>
  );
}

/** Ce qui brille dans le noir : le laser, sa lumière sur la boîte, la diode verte — au-dessus du voile sombre. */
function ScanGlow({ t }: { t: number }) {
  const b = beamLevel(t);
  const led = ledLevel(t);
  if (b <= 0 && led <= 0) return null;
  const p = scanPose(t);
  const lineY = LASER_Y + Math.sin(t * 90) * 0.6;
  const half = (175 * SCAN_SIZE) / 2;
  const ledPt = { x: p.x, y: p.y - 100 * SCAN_SIZE };
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, overflow: "visible", mixBlendMode: "screen", pointerEvents: "none" }}>
      <defs>
        <radialGradient id="s1spill">
          <stop offset="0%" stopColor="#FF2A2A" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#FF2A2A" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="s1led">
          <stop offset="0%" stopColor="#5BFF9C" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#5BFF9C" stopOpacity={0} />
        </radialGradient>
      </defs>
      {b > 0 && (
        <g opacity={b}>
          <path d={`M${p.x - 15},${p.y} L${p.x + 15},${p.y} L${p.x + half},${lineY} L${p.x - half},${lineY} Z`} fill="#FF3030" opacity={0.16} />
          <ellipse cx={p.x} cy={lineY - 14} rx={96} ry={52} fill="url(#s1spill)" />
          <line x1={p.x - half - 4} y1={lineY} x2={p.x + half + 4} y2={lineY} stroke="#FF4040" strokeWidth={7} strokeLinecap="round" opacity={0.45} />
          <line x1={p.x - half} y1={lineY} x2={p.x + half} y2={lineY} stroke="#FF2A2A" strokeWidth={2.2} strokeLinecap="round" />
          <line x1={p.x - half + 6} y1={lineY} x2={p.x + half - 6} y2={lineY} stroke="#FFD6D6" strokeWidth={0.8} strokeLinecap="round" />
        </g>
      )}
      {led > 0 && <circle cx={ledPt.x} cy={ledPt.y} r={14} fill="url(#s1led)" opacity={led} />}
    </svg>
  );
}

/** Le centre du gros plan (monde) : la boîte à gauche, le sac au milieu, le corps du patient à droite, sa tête hors cadre. */
const MACRO = { x: 1132, y: 538 };

/** Le voile sombre du gros plan ; le laser éclaire la boîte (un trou de lumière rouge autour de la ligne). */
function darkVeil(t: number, light: number, zoom: number) {
  const a = (1 - light) * 0.965;
  const b = beamLevel(t);
  if (b <= 0) return rgba(A1.ink, a);
  const p = scanPose(t);
  const sx = 960 + (p.x - MACRO.x) * zoom;
  const sy = 540 + (LASER_Y - 18 - MACRO.y) * zoom;
  const hole = Math.max(0.3, a - 0.62 * b);
  return `radial-gradient(ellipse ${300 * (0.8 + 0.2 * b)}px ${170 * (0.8 + 0.2 * b)}px at ${sx}px ${sy}px, ${rgba(A1.ink, hole)} 0%, ${rgba(A1.ink, hole)} 35%, ${rgba(A1.ink, a)} 100%)`;
}

/** Le gros plan (0 → 1,0) : même monde que le plan large, caméra à ×4 sur la boîte et le sac. */
function Macro({ t }: { t: number }) {
  const light = macroLight(t);
  const zoom = keys(t, [
    [0, 3.86],
    [CUT, 4.08, LINEAR],
  ]);
  const cam = { origin: [MACRO.x, MACRO.y] as [number, number], x: 960 - MACRO.x, y: 540 - MACRO.y, zoom, drift: 0.6 };
  return (
    <AbsoluteFill style={{ background: A1.ink }}>
      <Camera t={t} {...cam}>
        <Pharmacy t={t} mood="act1" douchette={false}>
          <Ordonnance x={SET.slots.rx.x} y={SET.slots.rx.y} w={150} flat={1} rotate={-8} mood="act1" />
          <MedBox kind="amoxicilline" x={SET.slots.box1.x} y={SET.slots.box1.y} w={110} mood="act1" />
          <Patient t={t} mood="act1" grab={0} peek={false} />
          <ScanArm t={t} />
        </Pharmacy>
      </Camera>
      <AbsoluteFill style={{ background: darkVeil(t, light, zoom) }} />
      <Camera t={t} {...cam}>
        <ScanGlow t={t} />
      </Camera>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ le plan large */

const GRAB_AT = 4.36;
const LEAVE_AT = 4.9;
const LEAVE_DUR = 1.0;

function wideCam(t: number) {
  const zoom = 1 + 0.085 * IN_OUT(clamp01((t - CUT) / (FREEZE - CUT))) ** 0.9;
  return { origin: [1010, 330] as [number, number], zoom, drift: 0.8 };
}

/** Le monde du plan large à l'instant t (sans caméra). */
function WideWorld({ t }: { t: number }) {
  const leave = prog(t, LEAVE_AT, LEAVE_DUR, LINEAR);
  const grab = prog(t, GRAB_AT, 0.5, LINEAR);
  const door = keys(t, [
    [5.24, 0],
    [5.46, 1, IN_OUT],
    [5.86, 1],
    [5.96, 0, EXIT],
  ]);
  const pb = SET.pharmacienne.bubble;
  const qb = SET.patient.bubble;
  return (
    <Pharmacy t={t} mood="act1" light={wideLight(t)} doorOpen={door} chimeAt={5.3}>
      <Pharmacienne t={t} mood="act1" expression="lasse" talk={[[1.4, 2.18], [2.22, 3.56]]} />
      <Ordonnance x={SET.slots.rx.x} y={SET.slots.rx.y} w={150} flat={1} rotate={-8} mood="act1" />
      <Patient t={t} mood="act1" talk={[[4.3, 4.96]]} grab={grab} leave={leave} peek boxesInBag={1} />
      <Bubble t={t} at={1.4} exitAt={2.62} text="Et avec ceci…" side={pb.side} mood="act1" x={pb.x - 6} y={pb.y + 34} size={42} />
      <Bubble t={t} at={2.76} exitAt={3.96} text="Autre chose ?" side={pb.side} mood="act1" x={pb.x - 6} y={pb.y + 34} size={58} />
      <Bubble t={t} at={4.28} exitAt={4.9} text="Non merci." side={qb.side} mood="act1" x={qb.x} y={qb.y + 20} size={58} />
    </Pharmacy>
  );
}

/** Le plan large du comptoir tel qu'il est à l'instant t (caméra comprise) — pour la vignette de sortie de S2. */
export function Comptoir({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: A1.ink }}>
      <Camera t={t} {...wideCam(t)}>
        <WideWorld t={t} />
      </Camera>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ l'arrêt sur image et le filé */

function HBlurDef({ id, std }: { id: string; std: number }) {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <defs>
        <filter id={id} x="-5%" y="0%" width="110%" height="100%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={`${std.toFixed(2)} 0`} edgeMode="duplicate" />
        </filter>
      </defs>
    </svg>
  );
}

export function Scene({ t }: { t: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (t < CUT) return <Macro t={t} />;

  const frozen = t >= FREEZE;
  const tt = Math.min(t, FREEZE);
  const k = whipK(t);
  if (k >= 1) return null;
  const grey = prog(t, FREEZE, 4 * F, LINEAR);
  const punch = 1 + 0.03 * prog(t, FREEZE, 0.14, SNAP) - 0.012 * prog(t, WHIP_AT - 0.05, 0.1, IN_OUT);
  const blur = whipBlur(t);
  const filterId = `s1hb${uid}`;
  const filters = [
    grey > 0 ? `grayscale(${grey}) contrast(${1 + 0.18 * grey}) brightness(${1 - 0.06 * grey})` : "",
    blur > 0.3 ? `url(#${filterId})` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {blur > 0.3 && <HBlurDef id={filterId} std={blur} />}
      <AbsoluteFill
        style={{
          transform: `translateX(${-k * WHIP_RUN}px) scale(${punch})`,
          transformOrigin: "960px 470px",
          filter: filters || undefined,
        }}
      >
        <Comptoir t={tt} />
        {frozen && <Flash t={t} at={FREEZE} dur={0.16} color="#F2F6F8" max={0.55} />}
        {frozen && (
          <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 70% at 50% 45%, transparent 50%, ${rgba("#000000", 0.35 * grey)} 100%)` }} />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ les bruitages */

export const cues: Cue[] = [
  cue("neon", 0.0, 0.55),
  cue("scan-laser", BEAM_AT - 0.02, 0.22),
  cue("scanner-bip", 0.7, 0.62),
  cue("bulle", 1.4, 0.2),
  cue("bulle", 2.75, 0.26, 1.06),
  cue("bulle", 4.27, 0.22, 0.94),
  cue("papier", 4.6, 0.32),
  cue("porte-carillon", 5.3, 0.5),
  cue("porte-ferme", 5.74, 0.48),
  cue("arret-image", FREEZE, 0.6, 1, 0.45),
  cue("swoosh", WHIP_AT, 0.42),
];
