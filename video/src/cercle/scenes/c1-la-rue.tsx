import { AbsoluteFill } from "remotion";
import {
  ABOVE_Z,
  CAMS,
  City,
  EXIT,
  IN_OUT,
  JAKARTA,
  LINEAR,
  N,
  PASSANT_COLORS,
  PB,
  PB_SHOP,
  POP,
  Passant,
  Queue,
  SNAP,
  Sparkle,
  anchors,
  camLerp,
  camLook,
  clamp01,
  cue,
  groundTransform,
  keys,
  prog,
  ressort,
  rgba,
  toScreen,
  windowOf,
  type CityCam,
  type Cue,
} from "../kit";
import { LogoRobot } from "../../rembobine/kit/screens";

/* ==========================================================================
 * C1 — LA RUE (0 → 11,25). « Même rue. Deux pharmacies. Mêmes boîtes. Mêmes ordonnances. Mais dans l'une, les patients
 * reviennent. Vous savez pourquoi ? Elle a un copilote. »
 *
 *   0 → 2,9    la caméra descend sur le quartier de nuit (déjà en mouvement) ; « rue » (0,88) : les lampadaires
 *              s'allument ; « Deux » (1,41) : la pharmacie de gauche s'allume au néon, « pharmacies » (1,68) : celle de
 *              droite, du même néon neutre.
 *   2,9 → 5,3  au-dessus de chacune, la même étiquette : « Amoxicilline 1 g » (« boîtes », 3,09) puis « Ordonnance »
 *              (« ordonnances », 4,18).
 *   5,3 → 8,1  « l'une » (5,80) : la pharmacie de gauche passe au citron chaud (onde au sol) ; « patients » : la file
 *              arrive ; « reviennent » (7,20) : un patient entre (carillon). À droite, un seul passant passe sans
 *              s'arrêter.
 *   8,1 → 9,6  « Vous savez pourquoi ? » : la caméra se rapproche de la pharmacie illuminée.
 *   9,84       « copilote » : le robot PharmaBoost jaillit au-dessus du toit, éclat citron.
 *   10,3 → 11,25  le robot file dans la vitrine de droite et la caméra plonge derrière lui (jusqu'au cadrage où C2
 *              commence) ; la lumière envahit l'image, puis la scène s'efface sur C2.
 * ======================================================================== */

const PB_TOP: [number, number, number] = [PB_SHOP.xc, PB_SHOP.y1, ABOVE_Z];
const BOTH_A = camLook(...PB_TOP, 1.33, [312, 760]);
const BOTH_B = camLook(...PB_TOP, 1.4, [298, 752]);
const PB_A = camLook(...PB_TOP, 2.0, [560, 800]);
const DIVE = camLook(...windowOf(PB_SHOP), 9);

const T_DIVE = 9.62;
const T_END = 11.25;

function camAt(t: number): CityCam {
  if (t < 2.9) return camLerp(CAMS.high, BOTH_A, IN_OUT(clamp01((t + 0.9) / 3.8)));
  if (t < 8.1) return camLerp(BOTH_A, BOTH_B, IN_OUT(clamp01((t - 2.9) / 5.2)));
  if (t < T_DIVE) return camLerp(BOTH_B, PB_A, IN_OUT(clamp01((t - 8.1) / (T_DIVE - 8.1))));
  const x = clamp01((t - T_DIVE) / 1.55);
  return camLerp(PB_A, DIVE, x * x * x);
}

/* ---------------------------------------------------------------- l'étiquette « boîte, puis ordonnance » */

function BoxIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flex: "none", display: "block" }}>
      <path d="M6 14 L20 7 L34 14 L20 21 Z" fill="#FFFFFF" />
      <path d="M6 14 L20 21 L20 35 L6 28 Z" fill="#DCE8E4" />
      <path d="M34 14 L20 21 L20 35 L34 28 Z" fill="#AFC6BF" />
      <path d="M11 22.2 L15 24.2 M13 21.2 L13 25.2" stroke={PB.cross} strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}
function RxIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flex: "none", display: "block" }}>
      <path d="M9 4 H26 L32 10 V36 H9 Z" fill="#FFFFFF" />
      <path d="M26 4 V10 H32" fill="#CFE0DA" />
      <path d="M13 17 H28 M13 22 H28 M13 27 H22" stroke="#9DB5AE" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M17 9.5 V15.5 M14 12.5 H20" stroke={PB.cross} strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}

/** La même étiquette au-dessus de chaque pharmacie (façon « Coupe 25 € » de la référence), ancrée par son bas-milieu :
 *  la boîte arrive à `at1`, la ligne « Ordonnance » se déplie à `at2`, sortie à `out`. */
function TwinTag({ t, at1, at2, out, x, y, scale = 1 }: { t: number; at1: number; at2: number; out: number; x: number; y: number; scale?: number }) {
  if (t < at1) return null;
  const k = prog(t, at1, 0.42, POP);
  const o = 1 - prog(t, out, 0.28, EXIT);
  if (o <= 0) return null;
  const r2 = prog(t, at2, 0.4, SNAP);
  const r2pop = prog(t, at2, 0.34, POP);
  const bob = Math.sin((t - at1) * 2.1 + x * 0.013) * 5;
  const flash = Math.max(0, 1 - Math.abs(t - at2 - 0.12) / 0.3);
  const rowStyle = { display: "flex", alignItems: "center", gap: 14, whiteSpace: "nowrap" as const };
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, pointerEvents: "none", opacity: Math.min(1, k * 1.6) * o }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          transform: `translate(-50%, ${(1 - k) * 28 + bob - (1 - o) * 16}px) scale(${(0.72 + 0.28 * k) * scale})`,
          transformOrigin: "50% 100%",
        }}
      >
        <div
          style={{
            padding: "13px 24px 13px 16px",
            borderRadius: 18,
            background: "rgba(8,24,21,0.93)",
            border: `2px solid ${rgba(PB.citron, 0.5 + 0.4 * flash)}`,
            boxShadow: `0 18px 44px rgba(0,0,0,.55), 0 0 ${26 + 30 * flash}px ${rgba(PB.citron, 0.12 + 0.25 * flash)}`,
            color: "#FFFFFF",
          }}
        >
          <div style={rowStyle}>
            <BoxIcon size={42} />
            <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 31, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{"Amoxicilline 1\u00A0g"}</span>
          </div>
          <div style={{ height: r2 * 60, overflow: "hidden" }}>
            <div style={{ height: 2, margin: "9px 0 9px 56px", background: rgba(PB.citron, 0.2) }} />
            <div style={{ ...rowStyle, opacity: r2, transform: `translateY(${(1 - r2pop) * 16}px)` }}>
              <RxIcon size={40} />
              <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 31, letterSpacing: "-0.02em", lineHeight: 1.05, color: PB.citron }}>Ordonnance</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- le copilote */

/** Le robot PharmaBoost qui jaillit au-dessus du toit ; (x, y) = son pied (px écran), fil citron jusqu'au toit (roofY). */
function Copilot({ t, at, x: x0, y: y0, roofY, size: size0, dive = 0, to }: { t: number; at: number; x: number; y: number; roofY: number; size: number; dive?: number; to: [number, number] }) {
  if (t < at - 0.02 || dive >= 1) return null;
  // la plongée : le robot file dans la vitrine, devant la caméra
  const d = dive * dive * (3 - 2 * dive);
  const x = x0 + (to[0] - x0) * d;
  const y = y0 + (to[1] + size0 * 0.3 - y0) * d;
  const size = size0 * (1 - 0.55 * d);
  const s = ressort(t, at, { damping: 10, stiffness: 240 });
  const rise = (1 - prog(t, at, 0.4, SNAP)) * 40;
  const bob = Math.sin((t - at) * 2.4) * 6 * prog(t, at + 0.3, 0.4);
  const burst = Math.max(0, 1 - (t - at) / 0.55);
  const ring = prog(t, at, 0.75, SNAP);
  const halo = 0.42 + 0.08 * Math.sin((t - at) * 3);
  const foot = y + rise + bob;
  const cy = foot - size * 0.5;
  const stem = Math.max(0, roofY - foot) * (1 - prog(dive, 0, 0.25, LINEAR));
  const gone = 1 - prog(dive, 0.75, 0.25, LINEAR);
  return (
    <>
      {/* le halo citron */}
      <div style={{ position: "absolute", left: x - size * 1.3, top: cy - size * 1.3, width: size * 2.6, height: size * 2.6, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(PB.citron, 0.55)} 0%, ${rgba(PB.citron, 0.16)} 38%, ${rgba(PB.citron, 0)} 68%)`, opacity: clamp01(s) * (halo + 0.5 * burst) * gone, pointerEvents: "none" }} />
      {/* l'onde */}
      {ring < 1 && (
        <div style={{ position: "absolute", left: x - size * 0.95 * ring, top: cy - size * 0.95 * ring, width: size * 1.9 * ring, height: size * 1.9 * ring, borderRadius: "50%", border: `${3 + 3 * (1 - ring)}px solid ${rgba(PB.citron, 0.8 * (1 - ring))}`, pointerEvents: "none" }} />
      )}
      {/* le fil jusqu'au toit */}
      <div style={{ position: "absolute", left: x - 1.5, top: foot - 4, width: 3, height: stem * prog(t, at + 0.08, 0.35), background: `linear-gradient(${rgba(PB.citron, 0.75)}, ${rgba(PB.citron, 0.05)})`, borderRadius: 2 }} />
      <div style={{ position: "absolute", left: x - size / 2, top: foot - size * 0.884, width: size, height: size, opacity: gone, transform: `scale(${s}) rotate(${-14 * Math.sin(Math.PI * d)}deg)`, transformOrigin: "50% 88%", filter: `drop-shadow(0 10px 24px rgba(0,0,0,.55)) drop-shadow(0 0 ${18 + 30 * burst}px ${rgba(PB.citron, 0.45 + 0.4 * burst)})` }}>
        <LogoRobot t={t} size={size} winkAt={at + 0.62} seed={2} />
      </div>
      <Sparkle t={t} at={at + 0.02} x={x + size * 0.62} y={cy - size * 0.42} size={size * 0.42} color={PB.citron} />
      <Sparkle t={t} at={at + 0.12} x={x - size * 0.66} y={cy - size * 0.1} size={size * 0.3} color="#FFF4D6" />
      <Sparkle t={t} at={at + 0.22} x={x + size * 0.55} y={cy + size * 0.42} size={size * 0.24} color={PB.citron} />
    </>
  );
}

/* ---------------------------------------------------------------- une onde au sol (monde) */

function GroundRing({ t, at, x, y, r, color, dur = 0.9, width = 0.16 }: { t: number; at: number; x: number; y: number; r: number; color: string; dur?: number; width?: number }) {
  const k = (t - at) / dur;
  if (k < 0 || k > 1) return null;
  const e = SNAP(k);
  return (
    <g transform={groundTransform(0.14)}>
      <circle cx={x} cy={y} r={0.4 + r * e} fill="none" stroke={color} strokeWidth={width * (1 - 0.6 * k)} opacity={(1 - k) * (1 - k) * 0.7} />
    </g>
  );
}

/* ---------------------------------------------------------------- la scène */

export function Scene({ t }: { t: number }) {
  const cam = camAt(t);
  const a = anchors(cam);
  const lamps = keys(t, [
    [0.84, 0],
    [0.9, 1, LINEAR],
    [0.95, 0.3, LINEAR],
    [1.03, 1, LINEAR],
  ]);
  const lights = keys(t, [
    [1.37, 0],
    [1.42, 0.9, LINEAR],
    [1.47, 0.2, LINEAR],
    [1.55, 1, LINEAR],
  ]);
  const cote = keys(t, [
    [1.64, 0],
    [1.69, 0.9, LINEAR],
    [1.74, 0.25, LINEAR],
    [1.82, 1, LINEAR],
  ]);
  const pbLit = keys(t, [
    [5.76, 0],
    [5.86, 0.75, LINEAR],
    [5.92, 0.45, LINEAR],
    [6.4, 1],
  ]);
  // le pied du robot : 0,3 m au-dessus du point « au-dessus » du toit ; le fil descend jusqu'au rebord du toit
  const foot = toScreen(cam, PB_SHOP.xc + 0.2, PB_SHOP.y1, ABOVE_Z - 0.5);
  const roof = toScreen(cam, PB_SHOP.xc + 0.2, PB_SHOP.y1, PB_SHOP.h + 0.05);
  const robotSize = 205 * Math.sqrt(cam.zoom / 2);
  // la sortie : la lumière de la vitrine envahit l'image, puis la scène s'efface sur C2
  const fill = keys(t, [
    [10.55, 0],
    [11.02, 1, (x) => x * x],
  ]);
  const fade = 1 - prog(t, T_END - 0.26, 0.26, LINEAR);
  // la mise au point se perd dans la lumière : la rue se floute comme le fond de C2 (flou 18 px à son début), et le
  // fondu se fait flou sur flou au lieu de superposer la façade nette à la vitrine floue
  const exitBlur = 17 * prog(t, 10.78, 0.42, IN_OUT);
  const open = prog(t, 0, 0.4, LINEAR);
  return (
    <AbsoluteFill style={{ background: N.sky, opacity: fade }}>
      <City t={t} cam={cam} lamps={lamps} lights={lights} coteLit={cote} coteCross={cote} pbLit={pbLit} queue={0} style={exitBlur > 0.05 ? { filter: `blur(${exitBlur.toFixed(2)}px)` } : undefined}>
        {/* la vie de la rue : une passante sur le trottoir d'en face */}
        <Passant t={t} path={[[15, 8.85], [-17, 8.85]]} start={-0.5} dur={9.4} color={PASSANT_COLORS[2]} seed={3} />
        {/* un patient longe le trottoir, traverse, se tourne vers la pharmacie qui s'allume et entre au carillon (« reviennent ») */}
        <Passant t={t} path={[[-15, 8.2], [-0.6, 8.2], [-0.6, -0.85], [-5.7, -1.15], [-6.25, -2.55]]} start={-0.35} dur={7.6} color={PASSANT_COLORS[1]} seed={8} enter />
        <GroundRing t={t} at={5.8} x={PB_SHOP.xc} y={-2.2} r={5.2} color={PB.citron} dur={0.9} width={0.22} />
        <GroundRing t={t} at={7.2} x={PB_SHOP.xc} y={-2.4} r={2.6} color={PB.citron} dur={0.7} width={0.12} />
        <Queue t={t} at={5.0} count={8} />
        {/* à côté : un seul passant, qui passe devant sans s'arrêter et s'en va par la ruelle */}
        <Passant t={t} path={[[21, -1.0], [0.1, -1.0], [0.1, -3.7]]} start={3.4} dur={6.2} color={PASSANT_COLORS[3]} seed={11} enter />
      </City>

      {/* « boîtes » (3,09) : les deux étiquettes, à deux images d'écart ; « ordonnances » (4,18) : la ligne se déplie */}
      <TwinTag t={t} at1={3.05} at2={4.15} out={5.28} x={a.pbAbove[0]} y={a.pbAbove[1] + 8} />
      <TwinTag t={t} at1={3.1} at2={4.2} out={5.34} x={a.coteAbove[0]} y={a.coteAbove[1] + 8} />

      <Copilot t={t} at={9.79} x={foot[0]} y={foot[1]} roofY={roof[1]} size={robotSize} dive={prog(t, 10.28, 0.62, LINEAR)} to={a.pbWindow} />

      {/* la lumière de la vitrine envahit l'image */}
      {fill > 0 && (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            background: `radial-gradient(ellipse ${50 + 90 * fill}% ${36 + 70 * fill}% at ${(a.pbWindow[0] / 1080) * 100}% ${(a.pbWindow[1] / 1920) * 100}%, ${rgba(PB.glow, 1)} 0%, ${rgba(PB.citron, 0.75)} 40%, ${rgba(PB.citron, 0)} 100%)`,
            opacity: fill * 0.92,
            mixBlendMode: "screen",
          }}
        />
      )}
      {/* on ouvre dans la nuit — sans image noire : la première image d'un Reel est déjà la rue, encore sombre */}
      {open < 1 && <AbsoluteFill style={{ background: "#000", opacity: 0.7 * (1 - open) }} />}
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("air-woosh", 0.0, 0.28),
  cue("ui-clic", 0.86, 0.35),
  cue("neon", 1.38, 0.45),
  cue("neon", 1.65, 0.38, 1.06),
  cue("pop-leger", 3.06, 0.42),
  cue("pop-leger", 4.16, 0.42, 1.12),
  cue("scintillement", 5.78, 0.4),
  cue("porte-carillon", 7.12, 0.28),
  cue("air-woosh", 8.1, 0.26),
  cue("robot-boing", 9.8, 0.55),
  cue("whoosh-cine", 10.45, 0.42),
];
