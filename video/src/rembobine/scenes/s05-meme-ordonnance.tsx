import { AbsoluteFill } from "remotion";
import {
  Burst,
  Flash,
  MotionBlur,
  Ordonnance,
  Patient,
  PBLogo,
  Pharmacienne,
  Pharmacy,
  PB,
  JAKARTA,
  Ring,
  SCREEN_UI,
  SET,
  Sparkle,
  Sparks,
  clamp01,
  cue,
  keys,
  label,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  shake,
  squash,
  F,
  LogoRobot,
  wobble,
  EXIT,
  IN_OUT,
  LINEAR,
  SNAP,
  WHIP,
  type Cue,
} from "../kit";
import { ComptoirStage } from "./s06-le-bon-conseil";

/* ==========================================================================
 * S5 · MÊME ORDONNANCE (20,0 → 26,4) — N4 « Même patient. Même ordonnance. Mais cette fois, PharmaBoost est au
 * comptoir. » Le comptoir de S1, REJOUÉ en couleurs PharmaBoost (S4 fait l'éclair et l'onde de couleur 20,0 → 20,5).
 *
 *   « Même patient » 20,45    coup de caméra sur le patient (il sautille), viseur vert qui l'attrape, étiquette
 *                             « MÊME » puis « PATIENT » sur le mot.
 *   « Même ordonnance » 21,53 coup de fouet vers le comptoir : l'ordonnance glisse de sa main à sa place, étiquette
 *                             « MÊME » + « ORDONNANCE ». La pharmacienne pose l'Amoxicilline (22,0 → 22,95).
 *   « Mais cette fois »       suspense : la caméra glisse vers l'écran ÉTEINT, l'image s'assombrit sur les bords.
 *   « PharmaBoost » 23,76     l'écran s'allume (trait citron, 23,44), le logo JAILLIT de l'écran vers nous (robot qui
 *                             tourne, mot au dégradé du site), éclair, onde de choc, étincelles, coup de recul, secousse ;
 *                             la pharmacie floutée derrière, voile clair et rayons ; trait de surligneur citron.
 *   « au comptoir » 24,89     le logo se RANGE dans l'écran (il y rétrécit et s'y pose : éclat, la capsule de la bannière
 *                             jaillit) ; on recadre sur le comptoir, la pharmacienne sourit et fait un clin d'œil.
 *   25,9 → 26,4  SORTIE : la caméra PLONGE dans l'écran (×6,45, l'écran se redresse, flou de mouvement) ; l'écran
 *                remplit le cadre exactement comme S6 commence (ComptoirStage), puis la scène s'efface sur S6.
 * ======================================================================== */

const T = {
  pat: 20.45,
  pat2: 20.76,
  slide: 21.42,
  ord: 21.53,
  ord2: 21.95,
  place: 22.0,
  mais: 22.85,
  power: 23.44,
  /** Le logo sort de l'écran (le robot pope à 23,66, le mot claque à ≈ 23,76 sur « PharmaBoost »). */
  burst: 23.62,
  /** L'impact : le logo arrive au centre, éclair, onde de choc. */
  hit: 23.76,
  back: 24.84,
  land: 25.1,
  wink: 25.42,
  plunge: 25.9,
  fade: 26.3,
  end: 26.4,
} as const;

/** Le zoom final de la plongée : la dalle (300 px) dépasse un peu le cadre. ComptoirStage y est à l'échelle 1. */
const Z_END = 6.45;
const SCR = { x: SET.screen.x, y: SET.screen.y };

/* ------------------------------------------------------------------ la caméra */

type Cam = { fx: number; fy: number; z: number; sx: number; sy: number };

function baseCam(t: number) {
  const z = keys(t, [
    [20.0, 1.06],
    [20.38, 1.1, LINEAR],
    [20.62, 1.5, SNAP],
    [21.36, 1.56, LINEAR],
    [21.6, 1.85, WHIP],
    [22.74, 1.93, LINEAR],
    [23.42, 2.25, IN_OUT],
    [23.68, 2.32, LINEAR],
    [24.04, 1.2, SNAP],
    [24.84, 1.16, LINEAR],
    [25.18, 1.32, SNAP],
    [25.9, 1.6, IN_OUT],
  ]);
  const fx = keys(t, [
    [20.0, 960],
    [20.38, 975, LINEAR],
    [20.62, 1215, SNAP],
    [21.36, 1238, LINEAR],
    [21.6, 1040, WHIP],
    [22.74, 1005, LINEAR],
    [23.42, 482, IN_OUT],
    [23.68, 470, LINEAR],
    [24.04, 820, SNAP],
    [24.84, 850, LINEAR],
    [25.18, 740, SNAP],
    [25.9, 600, IN_OUT],
  ]);
  const fy = keys(t, [
    [20.0, 540],
    [20.38, 535, LINEAR],
    [20.62, 520, SNAP],
    [21.36, 512, LINEAR],
    [21.6, 505, WHIP],
    [22.74, 498, LINEAR],
    [23.42, 405, IN_OUT],
    [23.68, 402, LINEAR],
    [24.04, 480, SNAP],
    [24.84, 476, LINEAR],
    [25.18, 470, SNAP],
    [25.9, 440, IN_OUT],
  ]);
  return { fx, fy, z };
}

function camAt(t: number): Cam {
  let { fx, fy, z } = baseCam(t);
  if (t > T.plunge) {
    // La plongée : zoom exponentiel, et le centre de l'écran file en ligne droite vers le centre du cadre.
    const c0 = baseCam(T.plunge);
    const P0 = { x: (SCR.x - c0.fx) * c0.z + 960, y: (SCR.y - c0.fy) * c0.z + 540 };
    const u = prog(t, T.plunge, T.end - 0.02 - T.plunge, WHIP);
    z = Math.exp(lerp(Math.log(c0.z), Math.log(Z_END), u));
    const P = { x: lerp(P0.x, 960, u), y: lerp(P0.y, 540, u) };
    fx = SCR.x - (P.x - 960) / z;
    fy = SCR.y - (P.y - 540) / z;
  } else {
    // Le monde couvre toujours le cadre (marge de 24 px pour les secousses).
    const hx = (960 + 24) / z;
    const hy = (540 + 24) / z;
    fx = Math.min(1920 - hx, Math.max(hx, fx));
    fy = Math.min(1080 - hy, Math.max(hy, fy));
  }
  const calm = 1 - prog(t, T.plunge, 0.3, IN_OUT);
  let sx = wobble(t, 51, 4, 0.5) * calm;
  let sy = wobble(t, 52, 3, 0.5) * calm;
  for (const [at, amp, frames] of [
    [T.pat + 0.15, 6, 10],
    [21.6, 5, 9],
    [T.hit, 18, 15],
    [T.land, 5, 8],
  ] as const) {
    const s = shake(t, at, amp, frames);
    sx += s.x * calm;
    sy += s.y * calm;
  }
  return { fx, fy, z, sx, sy };
}

const toScreen = (c: Cam, x: number, y: number) => ({ x: (x - c.fx) * c.z + 960 + c.sx, y: (y - c.fy) * c.z + 540 + c.sy });

/* ------------------------------------------------------------------ l'écran du comptoir */

/**
 * Ce que montre l'écran : l'écran de S6 (ComptoirStage, 1920 × 1080) posé dans le cadre virtuel 1600 × 1000 du moniteur
 * à l'échelle qui le rend EXACTEMENT plein cadre au bout de la plongée (k × Z_END × s = 1).
 */
function StageInScreen({ t }: { t: number }) {
  const s = 1 / ((SET.screen.w / 1600) * Z_END);
  return (
    <div style={{ position: "absolute", inset: 0, background: SCREEN_UI.paper }}>
      <div style={{ position: "absolute", left: 800 - 960, top: 500 - 540, width: 1920, height: 1080, transform: `scale(${s})`, transformOrigin: "50% 50%" }}>
        <ComptoirStage t={t} capsuleAt={T.land} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ le monde (la pharmacie) */

function World({ t }: { t: number }) {
  const c = camAt(t);
  const tilt = 18 * (1 - prog(t, 25.62, 0.62, IN_OUT));
  const power = prog(t, T.power, 0.3, LINEAR);
  // Derrière le logo géant : la pharmacie floutée.
  const blur = 7 * prog(t, T.burst + 0.06, 0.22, SNAP) * (1 - prog(t, T.back, 0.26, IN_OUT));
  // Le patient « apparaît » : petit sautillement sur « Même ».
  const hop = Math.sin(Math.PI * prog(t, T.pat - 0.08, 0.26, LINEAR)) * 16;
  const sl = prog(t, T.slide, 0.34, SNAP);
  const slSettle = ressort(t, T.slide + 0.2, { damping: 9, stiffness: 300, mass: 0.5 });
  return (
    <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${960 + c.sx}px, ${540 + c.sy}px) scale(${c.z}) translate(${-c.fx}px, ${-c.fy}px)`, filter: blur > 0.05 ? `blur(${blur / c.z}px)` : undefined }}>
      <Pharmacy t={t} mood="pb" screen="pb" screenPower={power} screenTilt={tilt} screenContent={<StageInScreen t={t} />}>
        <Pharmacienne t={t} mood="pb" expression={t < T.burst + 0.06 ? "neutre" : "sourire"} place={prog(t, T.place, 0.95, LINEAR)} placeKind="amoxicilline" placeTo={SET.slots.box1} wink={T.wink} />
        {t >= T.slide - 0.01 && <Ordonnance x={lerp(1330, SET.slots.rx.x, sl)} y={lerp(596, SET.slots.rx.y, sl)} w={150} flat={1} rotate={lerp(16, -8, sl) + (1 - clamp01(slSettle)) * 5} />}
        <Patient t={t} mood="pb" expression={t < 23.9 ? "neutre" : "sourire"} peek={false} y={SET.patient.y - hop} />
      </Pharmacy>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ l'habillage (étiquettes, viseurs) */

/** Les coins d'un viseur vert autour d'un rectangle du MONDE, qui se resserrent à `at`. */
function Brackets({ t, c, at, exitAt, rect, len = 34 }: { t: number; c: Cam; at: number; exitAt: number; rect: [number, number, number, number]; len?: number }) {
  if (t < at - 0.02) return null;
  const k = prog(t, at, 0.22, SNAP);
  const out = prog(t, exitAt, 0.18, EXIT);
  if (out >= 1) return null;
  const a = toScreen(c, rect[0], rect[1]);
  const b = toScreen(c, rect[2], rect[3]);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const g = lerp(1.35, 1, k) * (1 + 0.012 * Math.sin((t - at) * 7)) * lerp(1, 1.12, out);
  const W = ((b.x - a.x) / 2) * g;
  const H = ((b.y - a.y) / 2) * g;
  const flash = pulse(t, at + 0.12, 0.03, 0.04, 0.2);
  const d = (sx: number, sy: number) => `M${cx + sx * W},${cy + sy * (H - len)} L${cx + sx * W},${cy + sy * H} L${cx + sx * (W - len)},${cy + sy * H}`;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: clamp01(k * 2.5) * (1 - out), pointerEvents: "none" }}>
      {flash > 0 && <rect x={cx - W} y={cy - H} width={2 * W} height={2 * H} rx={18} fill={rgba(PB.citron, 0.28 * flash)} />}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sy], i) => (
        <g key={i}>
          <path d={d(sx, sy)} fill="none" stroke={PB.green} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d(sx, sy)} fill="none" stroke={PB.citron} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </svg>
  );
}

/** L'étiquette « MÊME » + « PATIENT » : la pastille pope sur le 1er mot, le 2e mot s'y glisse sur sa voix. */
function Tag({ t, at, at2, a, b, x, y, exitAt, pin }: { t: number; at: number; at2: number; a: string; b: string; x: number; y: number; exitAt: number; pin?: { x: number; y: number } }) {
  if (t < at - 0.02) return null;
  const r = ressort(t, at, { damping: 10, stiffness: 280, mass: 0.55 });
  const k2 = prog(t, at2, 0.26, SNAP);
  const out = prog(t, exitAt, 0.2, EXIT);
  if (out >= 1) return null;
  const size = 38;
  return (
    <>
      {pin && (
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: clamp01(r) * (1 - out), pointerEvents: "none" }}>
          <line x1={x} y1={y} x2={lerp(x, pin.x, clamp01(r))} y2={lerp(y, pin.y, clamp01(r))} stroke={PB.green} strokeWidth={4} strokeLinecap="round" />
          <circle cx={pin.x} cy={pin.y} r={9 * clamp01(r)} fill={PB.citron} stroke={PB.green} strokeWidth={4} />
        </svg>
      )}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `translate(-50%, -50%) scale(${Math.max(0, r) * lerp(1, 0.7, out)}) rotate(${(1 - clamp01(r)) * -8 - 2}deg)`,
          opacity: clamp01(r * 3) * (1 - out),
          display: "flex",
          alignItems: "center",
          gap: 0,
          height: size * 1.8,
          padding: `0 ${size * 0.6}px`,
          borderRadius: 999,
          background: PB.green,
          boxShadow: `0 18px 40px -16px ${rgba(PB.green, 0.7)}, 0 0 0 3px ${rgba(PB.citron, 0.5)}`,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ ...label(size), color: PB.citron, letterSpacing: "0.1em" }}>{a}</span>
        <span style={{ display: "inline-block", overflow: "hidden", maxWidth: 420 * k2, transition: "none" }}>
          <span style={{ display: "inline-block", ...label(size), color: "#FFFFFF", letterSpacing: "0.1em", paddingLeft: size * 0.42, transform: `translateX(${(1 - k2) * -30}px)`, opacity: clamp01(k2 * 2) }}>{b}</span>
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ PharmaBoost jaillit */

/** Le fond clair derrière le logo géant : voile, rayons qui tournent, halo menthe. */
function RevealBackdrop({ t, w }: { t: number; w: number }) {
  if (w <= 0) return null;
  const rot = (t - T.burst) * 14;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: w }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 70% 62% at 50% 44%, ${rgba("#FFFFFF", 0.9)} 0%, ${rgba(PB.paper, 0.78)} 45%, ${rgba(PB.paper2, 0.55)} 100%)` }} />
      <div
        style={{
          position: "absolute",
          left: 960 - 1300,
          top: 450 - 1300,
          width: 2600,
          height: 2600,
          borderRadius: "50%",
          background: `repeating-conic-gradient(from ${rot}deg, ${rgba(PB.brand, 0.1)} 0deg 5deg, transparent 5deg 15deg)`,
          WebkitMaskImage: "radial-gradient(circle, transparent 12%, black 22%, transparent 58%)",
          maskImage: "radial-gradient(circle, transparent 12%, black 22%, transparent 58%)",
        }}
      />
      <div style={{ position: "absolute", left: 960 - 700, top: 450 - 380, width: 1400, height: 760, background: `radial-gradient(ellipse at 50% 50%, ${rgba(PB.mint, 0.22)} 0%, transparent 65%)` }} />
    </AbsoluteFill>
  );
}

const LOGO = { x: 960, y: 450, size: 170 } as const;
/** Le logo en deux pièces : la tête du robot (1,32 × size) et le mot (mesuré : ≈ 1065 px à 170 px), écartés de 0,24 × size. */
const ROBOT = 1.32 * LOGO.size;
const GAP = 0.24 * LOGO.size;
const WORD_W = 1065;
const ROBOT_SLOT = { x: LOGO.x - (ROBOT + GAP + WORD_W) / 2 + ROBOT / 2, y: LOGO.y };

/**
 * Le logo géant. La tête du robot pointe dans l'écran allumé (23,55), en JAILLIT et vole en tournant jusqu'à sa place
 * (arrivée 23,76, écrasement) ; le mot « PharmaBoost » claque à côté au même instant (coup de poing du kit). Sur
 * « au comptoir », tout le logo rétrécit et file se ranger dans l'écran.
 */
function GiantLogo({ t, c }: { t: number; c: Cam }) {
  if (t < 23.5 || t > T.land + 0.02) return null;
  const scr = toScreen(c, SCR.x, SCR.y);
  const back = prog(t, T.back, T.land - T.back, WHIP);
  const x = lerp(LOGO.x, scr.x, back);
  const y = lerp(LOGO.y, scr.y, back);
  const s = lerp(1, 0.15, back) * (1 + 0.035 * pulse(t, T.hit + 0.02, 0.04, 0.02, 0.22));
  const o = 1 - prog(t, T.land - 0.05, 0.05, LINEAR);
  const breathe = 1 + 0.012 * Math.sin((t - T.burst) * 3.2) * (1 - back);
  const mark = prog(t, 23.98, 0.24, SNAP) * (1 - back);
  // Le vol de la tête du robot, de l'écran à sa place dans le logo (repère du conteneur, échelle 1 pendant le vol).
  const k = prog(t, T.burst, T.hit - T.burst, IN_OUT);
  const peek = ressort(t, 23.5, { damping: 10, stiffness: 320, mass: 0.5 });
  const rdx = (scr.x - ROBOT_SLOT.x) * (1 - k);
  const rdy = (scr.y - ROBOT_SLOT.y) * (1 - k) - Math.sin(Math.PI * k) * 140;
  const sq = squash(t, T.hit, 6 * F);
  const rs = k > 0 ? lerp(0.42, 1, k) : 0.42 * Math.max(0, peek);
  const rr = -320 * (1 - k);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${s * breathe}) rotate(${back * -6}deg)`, opacity: o, filter: back > 0.2 ? `blur(${(back - 0.2) * 6}px)` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: GAP }}>
        <div style={{ position: "relative", width: ROBOT, height: ROBOT, flexShrink: 0 }}>
          <div style={{ position: "absolute", inset: 0, transform: `translate(${rdx}px, ${rdy}px) rotate(${rr}deg) scale(${rs * sq.sx}, ${rs * sq.sy})`, transformOrigin: "50% 60%", filter: `drop-shadow(0 ${LOGO.size * 0.08}px ${LOGO.size * 0.16}px rgba(15,47,42,.24))` }}>
            <LogoRobot t={t} size={ROBOT} winkAt={24.3} />
          </div>
        </div>
        <div style={{ position: "relative", width: WORD_W, flexShrink: 0 }}>
          {/* Le trait de surligneur citron sous « Boost ». */}
          <div style={{ position: "absolute", left: "55%", width: "46.5%", bottom: "13%", height: "30%", borderRadius: 14, background: PB.citron, transform: `scaleX(${mark}) skewX(-12deg)`, transformOrigin: "0 50%" }} />
          <PBLogo t={t} at={T.hit - 0.06} size={LOGO.size} variant="wordmark" tone="light" grad />
        </div>
      </div>
    </div>
  );
}

/** L'impact du logo : éclair, onde de choc, étincelles (sarcelle, menthe, citron). */
function RevealFx({ t }: { t: number }) {
  const at = T.hit;
  return (
    <>
      <Ring t={t} at={at} x={LOGO.x} y={LOGO.y} max={1900} color={PB.brand} width={18} life={0.62} />
      <Ring t={t} at={at + 0.04} x={LOGO.x} y={LOGO.y} max={1100} color={PB.green} width={5} life={0.5} echo={false} />
      <Sparks t={t} at={at} x={LOGO.x} y={LOGO.y} count={30} seed="s5-sparks-a" speed={1700} spread={180} color={PB.brand} len={52} life={0.55} width={4} />
      <Sparks t={t} at={at + 0.03} x={LOGO.x} y={LOGO.y} count={22} seed="s5-sparks-b" speed={1300} spread={180} color={PB.mint} len={40} life={0.5} width={4} />
      <Burst t={t} at={at} x={LOGO.x} y={LOGO.y} count={22} radius={620} seed="s5-burst" colors={[PB.citron, PB.mint, PB.brand, PB.green]} size={18} life={0.6} />
      <Sparkle t={t} at={24.08} x={LOGO.x + 600} y={LOGO.y - 70} size={90} color={PB.citron} />
      <Sparkle t={t} at={24.2} x={LOGO.x - 470} y={LOGO.y - 110} size={64} color={PB.mint} />
      <Flash t={t} at={at - 0.01} dur={0.22} color="#FFFFFF" max={0.6} />
    </>
  );
}

/** Le logo se pose dans l'écran : éclat citron sur l'écran. */
function LandFx({ t, c }: { t: number; c: Cam }) {
  const p = toScreen(c, SCR.x, SCR.y);
  const g = pulse(t, T.land - 0.02, 0.04, 0.04, 0.3);
  return (
    <>
      {g > 0 && <div style={{ position: "absolute", left: p.x - 360, top: p.y - 260, width: 720, height: 520, background: `radial-gradient(ellipse at 50% 50%, ${rgba(PB.citron, 0.7 * g)} 0%, ${rgba(PB.mint, 0.25 * g)} 38%, transparent 68%)`, pointerEvents: "none" }} />}
      <Ring t={t} at={T.land} x={p.x} y={p.y} max={560} color={PB.green} width={7} life={0.45} />
      <Sparkle t={t} at={T.land + 0.04} x={p.x + 170} y={p.y - 120} size={64} color={PB.citron} />
    </>
  );
}

/** « Mais cette fois » : l'image s'assombrit sur les bords pendant que la caméra glisse vers l'écran éteint. */
function Suspense({ t }: { t: number }) {
  const k = prog(t, T.mais, 0.5, IN_OUT) * (1 - prog(t, T.burst, 0.08, LINEAR));
  if (k <= 0) return null;
  return <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(ellipse 58% 62% at 46% 50%, transparent 40%, ${rgba(PB.green, 0.5 * k)} 100%)` }} />;
}

/* ------------------------------------------------------------------ la scène */

export function Scene({ t }: { t: number }) {
  const c = camAt(t);
  const fade = prog(t, T.fade, T.end - T.fade, LINEAR);
  const wash = prog(t, T.burst + 0.04, 0.2, SNAP) * (1 - prog(t, T.back, 0.24, IN_OUT));
  const head = toScreen(c, 1356, 300);
  const rx = toScreen(c, SET.slots.rx.x + 20, SET.slots.rx.y - 14);
  return (
    <AbsoluteFill style={{ background: PB.paper, overflow: "hidden", opacity: 1 - fade }}>
      <MotionBlur on={t > 26.0 && t < 26.3} samples={6}>
        {(tt) => <World t={tt} />}
      </MotionBlur>
      <Suspense t={t} />
      {/* « Même patient » : le viseur attrape le patient, l'étiquette se pose à côté de sa tête. */}
      <Brackets t={t} c={c} at={T.pat} exitAt={21.3} rect={[1186, 238, 1494, 650]} />
      <Tag t={t} at={T.pat} at2={T.pat2} a="Même" b="patient" x={head.x + 400} y={head.y - 40} exitAt={21.3} pin={{ x: head.x + 50, y: head.y + 6 }} />
      {/* « Même ordonnance » : elle glisse sur le comptoir. */}
      <Brackets t={t} c={c} at={21.7} exitAt={22.62} rect={[1018, 528, 1196, 590]} len={26} />
      <Tag t={t} at={T.ord} at2={T.ord2} a="Même" b="ordonnance" x={rx.x + 50} y={rx.y - 196} exitAt={22.62} pin={{ x: rx.x + 6, y: rx.y - 26 }} />
      {/* « PharmaBoost » : le logo jaillit de l'écran, puis s'y range. */}
      <RevealBackdrop t={t} w={wash} />
      <RevealFx t={t} />
      <GiantLogo t={t} c={c} />
      <LandFx t={t} c={c} />
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("whoosh-pb", 20.34, 0.3),
  cue("attrape", T.pat, 0.55),
  cue("pop-leger", T.pat2 + 0.02, 0.4),
  cue("balayage-court", 21.32, 0.35),
  cue("papier", T.slide, 0.6),
  cue("ui-pop", T.ord + 0.02, 0.4),
  cue("pop-leger", T.ord2 + 0.02, 0.4, 1.06),
  cue("boite-posee", 22.76, 0.35),
  cue("aspiration", 23.0, 0.4, 1, 0.66),
  cue("robot-allume", T.power, 0.6),
  cue("whoosh-pb", T.burst - 0.02, 0.35, 1.15),
  cue("impact-net", T.hit - 0.06, 0.8),
  cue("sub-boom", T.hit - 0.06, 0.45),
  cue("scintillement", 23.98, 0.45),
  cue("whoosh-pb", T.back, 0.4),
  cue("ui-ding", T.land, 0.35),
  cue("whoosh-lourd", 25.86, 0.55),
];
