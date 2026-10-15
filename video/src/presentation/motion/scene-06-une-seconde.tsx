import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, staticFile } from "remotion";
import { Mascot, type Track, type TrackEvent } from "../mascot";
import {
  Burst,
  Camera,
  DotGrid,
  Dust,
  F,
  Halos,
  INK,
  IN_OUT,
  JAKARTA,
  MONO,
  MotionBlur,
  Odometer,
  PB,
  POP,
  Ring,
  SNAP,
  Sparks,
  Spot,
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
  tween,
} from "./kit";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S6 · Une seconde — voix P7 (« Vous scannez une boîte… ») et P8 (« En une seconde : le bon conseil. »).
 * Fenêtre : P6.end + 0,05 → P9.start. S5 est dessinée au-dessus jusqu'à P7.start (sa plongée) : tout ce qui compte
 * commence donc à P7.start. Relais d'entrée : capsule centrée (1200, 260), 1040×132. Relais de sortie (S7) : carte
 * blanche 1400×560 centrée (960, 480) sur fond encre.
 *
 *   P7.0 « Vous scannez »  le robot jaillit de la capsule et se pose à gauche ; la boîte 3D monte en tournant, le laser
 *                          balaie le code-barres, le viseur verrouille, « LECTURE… OK ».
 *   P7.1 « une boîte… »    la boîte est lancée en cloche (fantômes + flou), le robot l'attrape sur sa tablette, la
 *                          comprime en puce et l'expédie dans la capsule, qui s'élargit.
 *   P8.0 « En une seconde » chrono sous la capsule : les chiffres roulent (jamais de valeur finale : la voix dit « une
 *                          seconde », l'écran n'affirme aucune mesure), radar derrière le robot qui réfléchit, trois
 *                          coches dans la capsule ; les chiffres fondent en une grande coche menthe.
 *   P8.1 « le bon conseil » (le tintement et la coche tombent dans la pause, 0,09 s avant « le bon conseil ») la
 *                          capsule se déploie en panneau, carte Ultra-Levure (raison tapée), le robot saute ; la
 *                          crème solaire sort de derrière sur un RESSORT (carte compacte sous le panneau), le robot la
 *                          regarde et bondit, la puce passe de « 1 conseil » à « 2 conseils ».
 *   Sortie                 poussée caméra : la carte remplit le cadre (1400×560) ; le robot sort à gauche.
 * ======================================================================== */

// ---- Géométrie ---------------------------------------------------------------------------------------------------

/** La capsule (relais de S5) : centre x, haut, largeur et hauteur au repos. */
const CAP = { cx: 1200, top: 194, w: 1040, h: 132 };
const CAP_Y = CAP.top + CAP.h / 2; // 260
/** L'avatar (tête) dans la capsule. */
const AVATAR = { x: 740, y: CAP_Y };
/** La puce, une fois rangée dans la capsule (centre). */
const CHIP_SLOT = { x: 962, y: CAP_Y };
/** Le robot hôte : centre x, pieds, taille. */
const HOST = { x: 440, feet: 960, size: 420 };
const HOST_H = HOST.size * 0.92;
/** La tablette du robot (point où la boîte se pose), relatif aux pieds, à l'échelle 1. Le robot hôte est filmé en miroir :
 * sa tablette est du côté de la boîte, qui n'a pas à passer devant son visage. */
const TABLET = { dx: 100, dy: -120 };
/** La boîte : centre au repos, dimensions (face), profondeur. */
const BOX = { x: 1000, y: 620, w: 360, h: 220, d: 84 };
const BOX_HELD = 0.48;
/** Le code-barres, dans la face (haut gauche, taille). */
const BAR = { x: 182, y: 128, w: 156, h: 70 };
/** Le chrono : centre et rayon de l'anneau. Graduations comprises (r + 36), il reste ≥ 24 px sous la capsule (bas à
 * 326) et au-dessus de la bande des sous-titres (y < 860). */
const CHRONO = { x: 1200, y: 604, r: 206 };
const CHRONO_TICK = { r0: 18, minor: 29, major: 36 };
/** La carte 1 (dans le panneau) : gauche, haut, largeur, hauteur avant la poussée. */
const CARD = { left: CAP.cx - 490, top: CAP.top + CAP.h + 14, w: 980, h: 300 };
/** La carte 2 (crème solaire), compacte, posée sous le panneau : gauche, haut, largeur, hauteur, inclinaison. */
const CARD2 = { left: 1000, top: 688, w: 700, h: 132, rot: -2.5 };
/** La poussée de sortie : la carte passe à 1400×560 centrée (960, 480). */
const PUSH_Z = 1400 / CARD.w;
const CARD_H_END = 560 / PUSH_Z;
const PUSH_X = 960 - 960 - PUSH_Z * (CAP.cx - 960);
const PUSH_Y = 480 - 540 - PUSH_Z * (CARD.top + CARD_H_END / 2 - 540);

const MINT_INK = "#12B89B";
const TEAL_TEXT = "#0F766E";

// ---- Le temps ----------------------------------------------------------------------------------------------------

type Beats = ReturnType<typeof beats>;

function beats(time: Time) {
  const P7 = time.A("P7", 0);
  const BOX_SEG = time.A("P7", 1);
  const P8 = time.A("P8", 0);
  // La pause réelle de P8 (≈ 0,1 s) précède « le bon conseil » : le tintement et la coche y tombent, seule leur queue
  // passe sous la voix.
  const GOOD = time.A("P8", 1) - 0.09;
  const P8Z = time.Z("P8");
  const end = time.win.S6.end;
  const R0 = P7 - 0.03; // le robot jaillit de la capsule
  const R1 = R0 + 0.5; // il se pose
  const B0 = P7 - 0.01; // la boîte monte
  const L0 = B0 + 0.24; // laser
  const K0 = B0 + 0.48; // viseur
  const LBL = K0 + 0.02; // « LECTURE… OK »
  const THROW = BOX_SEG;
  const FLY = 0.32;
  const CATCH = THROW + FLY;
  const SQZ = Math.max(CATCH + 0.09, P8 - 0.36);
  const CHIP = SQZ + 0.08;
  const DOCK = CHIP + 0.27;
  const T0 = Math.max(P8, GOOD - 1.0);
  const CHECKS = [0.25, 0.5, 0.8].map((p) => T0 + (GOOD - T0) * p);
  const TYPE0 = GOOD + 0.24;
  const C2 = GOOD + 0.42; // la crème solaire sort de derrière la carte 1
  const C2_LAND = C2 + 0.2;
  const PUSH0 = Math.min(P8Z + 0.085, end - 0.2);
  const PUSH1 = end - 0.02;
  return { P7, BOX_SEG, P8, GOOD, P8Z, end, R0, R1, B0, L0, K0, LBL, THROW, FLY, CATCH, SQZ, CHIP, DOCK, T0, CHECKS, TYPE0, C2, C2_LAND, PUSH0, PUSH1 };
}

/** La piste du robot : la MÊME pour l'hôte et pour l'avatar de la capsule (mêmes humeurs). Regards en x négatif = vers la
 * droite de l'écran pour l'hôte, filmé en miroir. */
function hostTrack(b: Beats): Track {
  const ev: TrackEvent[] = [
    { t: 0, kind: "mood", mood: "idle" },
    { t: b.R0, kind: "burst", burst: "jump" },
    { t: b.R0 + 0.12, kind: "glance", x: -0.75, y: 0.2, dur: 0.5 },
    { t: b.R1, kind: "squash" },
    { t: b.K0, kind: "emote", emote: "surprised", dur: 0.35 },
    { t: b.THROW - 0.08, kind: "glance", x: -0.55, y: -0.45, dur: 0.3 },
    { t: b.CATCH, kind: "squash" },
    { t: b.CATCH + 0.03, kind: "blink" },
    { t: b.SQZ, kind: "mood", mood: "curious" },
    { t: b.CHIP, kind: "glance", x: -0.7, y: -0.7, dur: 0.28 },
    { t: b.P8, kind: "mood", mood: "thinking" },
  ];
  // Les yeux qui balaient pendant le calcul, toutes les 0,25 s.
  for (let k = 0, tt = b.P8 + 0.04; tt < b.GOOD - 0.08; k++, tt += 0.25) ev.push({ t: tt, kind: "glance", x: k % 2 === 0 ? -0.8 : 0.8, y: -0.15, dur: 0.24 });
  // « le bon conseil » : un rire bref (yeux contents 0,42 s ; le corps saute, voir hostPose).
  ev.push({ t: b.GOOD, kind: "burst", burst: "giggle" });
  // Il désigne la crème solaire : yeux rouverts, curieux, regard vers elle (en bas à droite de l'écran) pendant qu'elle
  // arrive, puis bond de joie quand elle se pose (« happy » déclenche le geste « jump »).
  ev.push({ t: b.C2 - 0.06, kind: "mood", mood: "curious" });
  ev.push({ t: b.C2 - 0.04, kind: "glance", x: -0.9, y: 0.6, dur: 0.42 });
  ev.push({ t: b.C2_LAND + 0.1, kind: "mood", mood: "happy" });
  return { id: `S6-host-${Math.round(b.P7 * 1000)}-${Math.round(b.GOOD * 1000)}`, seed: 606, events: ev, until: b.end + 0.3 };
}

// ---- Le robot hôte ---------------------------------------------------------------------------------------------

type HostPose = { x: number; feet: number; s: number; sx: number; sy: number; rot: number; o: number };

function hostPose(t: number, b: Beats): HostPose | null {
  if (t < b.R0) return null;
  const x0 = AVATAR.x;
  const y0 = AVATAR.y + 30;
  // Le saut : parabole qui monte un peu puis plonge vers le sol.
  const u = clamp01((t - b.R0) / (b.R1 - b.R0));
  const a = 380;
  const x = lerp(x0, HOST.x, 1 - (1 - u) ** 1.25);
  const feet = y0 - a * u + (HOST.feet - y0 + a) * u * u;
  const vy = (-a + 2 * (HOST.feet - y0 + a) * u) / 2100;
  const s = lerp(0.24, 1, u ** 1.15);
  let sx = 1;
  let sy = 1;
  let rot = 0;
  if (u < 1) {
    const f = flight(Math.abs(vy));
    sx = f.sx;
    sy = f.sy;
    rot = -14 * Math.sin(Math.PI * u);
  }
  // Atterrissage.
  const sq = squash(t, b.R1, 6 * F);
  sx *= sq.sx;
  sy *= sq.sy;
  // Se baisse avant la réception, écrasement à la réception, puis RESSORT.
  const crouch = keys(t, [
    [b.THROW - 0.12, 1],
    [b.THROW, 0.9, SNAP],
    [b.CATCH - 0.03, 0.93, IN_OUT],
    [b.CATCH, 0.82, SNAP],
    [b.CATCH + 0.12, 1.05, SNAP],
    [b.CATCH + 0.26, 1, IN_OUT],
  ]);
  sy *= crouch;
  sx *= 1 + (1 - crouch) * 0.5;
  // Le saut de joie sur « le bon conseil ».
  const hop = clamp01((t - b.GOOD) / 0.42);
  const hopY = hop > 0 && hop < 1 ? -70 * 4 * hop * (1 - hop) : 0;
  const land = squash(t, b.GOOD + 0.42, 5 * F);
  sx *= land.sx;
  sy *= land.sy;
  // Il se penche vers la crème solaire qui arrive (il la désigne), puis se redresse pour son bond.
  const lean = keys(t, [
    [b.C2 - 0.08, 0],
    [b.C2 + 0.14, 1, SNAP],
    [b.C2_LAND + 0.1, 1, IN_OUT],
    [b.C2_LAND + 0.3, 0, IN_OUT],
  ]);
  rot += 8 * lean;
  // Vie : léger flottement.
  const bob = u >= 1 ? 4 * Math.sin((t - b.R1) * 3.1) : 0;
  return { x: x + 14 * lean, feet: feet + hopY + bob, s, sx, sy, rot, o: clamp01((t - b.R0) / (3 * F)) };
}

/** Le point de la tablette à l'écran (pour poser la boîte). */
function tabletAt(p: HostPose) {
  return { x: p.x + TABLET.dx * p.s * p.sx, y: p.feet + TABLET.dy * p.s * p.sy };
}

function Host({ t, track, pose, exitX }: { t: number; track: Track; pose: HostPose; exitX: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: pose.x - HOST.size / 2 + exitX,
        top: pose.feet - HOST_H,
        width: HOST.size,
        height: HOST_H,
        opacity: pose.o,
        transformOrigin: "50% 100%",
        transform: `rotate(${pose.rot.toFixed(2)}deg) scale(${(-pose.s * pose.sx).toFixed(4)}, ${(pose.s * pose.sy).toFixed(4)})`,
        filter: "drop-shadow(0 24px 40px rgba(0,0,0,.45))",
      }}
    >
      <Mascot track={track} t={t} size={HOST.size} />
    </div>
  );
}

/** Le socle lumineux sous le robot (il ne flotte pas dans le vide). */
function Pedestal({ t, b, exitX }: { t: number; b: Beats; exitX: number }) {
  const k = tween(t, b.R1 - 0.06, 0.4, 0, 1, POP);
  if (k <= 0) return null;
  const glow = 0.55 + 0.25 * Math.sin(t * 4.2) + 0.4 * pulse(t, b.CATCH, 0.04, 0, 0.3) + 0.5 * pulse(t, b.GOOD + 0.42, 0.04, 0, 0.35);
  return (
    <div style={{ position: "absolute", left: HOST.x - 190 + exitX, top: HOST.feet - 26, width: 380, height: 52, transform: `scaleX(${k.toFixed(3)})`, opacity: clamp01(k) }}>
      <div style={{ position: "absolute", inset: -30, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(PB.mint, 0.28 * glow)}, transparent)` }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(0,0,0,.55), rgba(0,0,0,.15) 70%, transparent)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${rgba(PB.mint2, 0.55 * glow)}`, boxShadow: `0 0 24px ${rgba(PB.mint, 0.4 * glow)}` }} />
      <svg width={380} height={52} viewBox="0 0 380 52" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <ellipse cx={190} cy={26} rx={150} ry={14} fill="none" stroke={rgba(PB.mint2, 0.22)} strokeWidth={1.2} />
        <ellipse
          cx={190}
          cy={26}
          rx={150}
          ry={14}
          fill="none"
          stroke={PB.mint2}
          strokeWidth={2}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="14 86"
          strokeDashoffset={-((t * 45) % 100)}
          style={{ filter: `drop-shadow(0 0 6px ${PB.mint})` }}
        />
      </svg>
    </div>
  );
}

/** Le radar derrière le robot qui réfléchit. */
function Radar({ t, b, exitX }: { t: number; b: Beats; exitX: number }) {
  const inK = tween(t, b.P8 - 0.04, 0.3, 0, 1, POP);
  const outK = prog(t, b.GOOD, 0.22, SNAP);
  const k = inK * (1 - outK);
  if (k <= 0.001) return null;
  const R = 270;
  const ang = ((t - b.P8) * 360) % 360;
  const cx = HOST.x + exitX;
  const cy = 700;
  const blips = [0, 1, 2, 3, 4].map((i) => {
    const a = hash("S6-blip", i) * 360;
    const rr = 80 + hash("S6-blip", i + 10) * (R - 100);
    const since = ((((t - b.P8) * 360 - a) % 360) + 360) % 360;
    const life = since < 200 && t - b.P8 > a / 360 ? 1 - since / 200 : 0;
    return { a, rr, life };
  });
  return (
    <div style={{ position: "absolute", left: cx - R, top: cy - R, width: R * 2, height: R * 2, opacity: k, transform: `scale(${(0.7 + 0.3 * inK + 0.15 * outK).toFixed(3)})` }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `conic-gradient(from ${ang}deg, ${rgba(PB.mint, 0)} 0deg, ${rgba(PB.mint, 0)} 290deg, ${rgba(PB.mint, 0.22)} 352deg, ${rgba(PB.mint2, 0.5)} 360deg)`,
        }}
      />
      {[1, 0.66, 0.33].map((f) => (
        <div key={f} style={{ position: "absolute", left: R * (1 - f), top: R * (1 - f), width: R * 2 * f, height: R * 2 * f, borderRadius: "50%", border: `1.5px solid ${rgba(PB.mint, 0.22)}` }} />
      ))}
      <div style={{ position: "absolute", left: R - 0.75, top: 0, width: 1.5, height: R * 2, background: rgba(PB.mint, 0.12) }} />
      <div style={{ position: "absolute", top: R - 0.75, left: 0, height: 1.5, width: R * 2, background: rgba(PB.mint, 0.12) }} />
      {blips.map((p, i) =>
        p.life > 0 ? (
          <div
            key={i}
            style={{
              position: "absolute",
              left: R + Math.cos(((p.a - 90) * Math.PI) / 180) * p.rr - 6,
              top: R + Math.sin(((p.a - 90) * Math.PI) / 180) * p.rr - 6,
              width: 12,
              height: 12,
              borderRadius: 6,
              background: PB.mint2,
              opacity: p.life,
              boxShadow: `0 0 16px ${PB.mint}`,
            }}
          />
        ) : null,
      )}
    </div>
  );
}

// ---- La boîte en 3D ----------------------------------------------------------------------------------------------

const BARS = (() => {
  const out: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; x < BAR.w - 4; i++) {
    const w = 1.5 + Math.floor(hash("S6-bars", i) * 3) * 1.5;
    if (x + w > BAR.w) break;
    out.push({ x, w });
    x += w + 1.5 + Math.floor(hash("S6-gaps", i) * 3) * 1.2;
  }
  return out;
})();

function PillIcon({ size = 22, color = PB.teal2 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
      <g transform="rotate(-40 12 12)">
        <rect x={3} y={8} width={18} height={8} rx={4} fill="none" stroke={color} strokeWidth={2.2} />
        <path d="M 12 8 L 12 16" stroke={color} strokeWidth={2.2} />
        <rect x={3} y={8} width={9} height={8} rx={4} fill={color} />
      </g>
    </svg>
  );
}

/** Ce qui se passe sur le code-barres : barres qui s'allument, laser, viseur, éclair. */
function ScanOverlay({ t, b }: { t: number; b: Beats }) {
  const sweep = 20 * F;
  const laserOn = t >= b.L0 - F && t <= b.L0 + sweep + 6 * F;
  const ly = keys(t, [
    [b.L0, -8],
    [b.L0 + 10 * F, BAR.h + 8, IN_OUT],
    [b.L0 + sweep, -8, IN_OUT],
  ]);
  const goingDown = t < b.L0 + 10 * F;
  const laserO = laserOn ? Math.min(clamp01((t - b.L0) / (2 * F) + 1), 1 - clamp01((t - (b.L0 + sweep)) / (6 * F))) : 0;
  const cornerK = prog(t, b.K0, 8 * F, SNAP);
  const cornerS = lerp(1.2, 1, cornerK);
  const flash = pulse(t, b.K0 + 7 * F, F, 0, 6 * F);
  const pad = 12;
  const fx = BAR.x - pad;
  const fy = BAR.y - pad;
  const fw = BAR.w + pad * 2;
  const fh = BAR.h + pad * 2;
  const L = 34;
  const corner = (rot: number, x: number, y: number) => (
    <svg
      key={rot}
      width={L}
      height={L}
      viewBox={`0 0 ${L} ${L}`}
      style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)`, overflow: "visible", filter: `drop-shadow(0 0 6px ${rgba(PB.mint, 0.9)})` }}
    >
      <path d={`M 2 ${L} L 2 6 Q 2 2 6 2 L ${L} 2`} fill="none" stroke={PB.mint2} strokeWidth={5} strokeLinecap="round" />
    </svg>
  );
  const lockedPulse = t > b.K0 + 8 * F ? 0.5 + 0.5 * Math.sin((t - b.K0) * 18) : 1;
  return (
    <>
      {/* Les barres : noires, puis menthe une à une au passage du laser. */}
      <div style={{ position: "absolute", left: BAR.x, top: BAR.y, width: BAR.w, height: BAR.h }}>
        {BARS.map((bar, i) => {
          const lit = clamp01((t - (b.L0 + (bar.x / BAR.w) * sweep)) / (3 * F));
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: bar.x,
                top: 0,
                width: bar.w,
                height: BAR.h - 12,
                background: lit > 0 ? `rgba(${Math.round(lerp(11, 18, lit))},${Math.round(lerp(15, 184, lit))},${Math.round(lerp(20, 155, lit))},1)` : INK,
                boxShadow: lit > 0.5 ? `0 0 6px ${rgba(PB.mint, 0.6 * lit)}` : undefined,
              }}
            />
          );
        })}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, fontFamily: MONO, fontWeight: 600, fontSize: 10, letterSpacing: "0.18em", color: "#4A5562", textAlign: "center" }}>
          3 400 9 3 1 2 0 4 7
        </div>
      </div>
      {/* Le laser et sa traînée. */}
      {laserO > 0 && (
        <div style={{ position: "absolute", left: BAR.x - 70, top: BAR.y + ly - 3, width: BAR.w + 140, height: 6, opacity: laserO }}>
          <div
            style={{
              position: "absolute",
              left: 70,
              right: 70,
              height: 56,
              top: goingDown ? -54 : 3,
              background: `linear-gradient(${goingDown ? "to top" : "to bottom"}, ${rgba(PB.mint, 0.55)}, ${rgba(PB.mint, 0)})`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${rgba(PB.mint, 0)}, ${PB.mint} 18%, ${PB.mint2} 50%, ${PB.mint} 82%, ${rgba(PB.mint, 0)})`,
              boxShadow: `0 0 30px ${PB.mint}, 0 0 12px ${PB.mint2}`,
            }}
          />
          <div style={{ position: "absolute", left: "30%", width: "40%", top: 2, height: 2, background: "#fff", borderRadius: 1 }} />
          {[0, 1].map((side) => (
            <div
              key={side}
              style={{
                position: "absolute",
                top: -9,
                [side ? "right" : "left"]: 52,
                width: 24,
                height: 24,
                borderRadius: 12,
                background: `radial-gradient(circle, #fff 0%, ${PB.mint2} 35%, ${rgba(PB.mint, 0)} 70%)`,
              }}
            />
          ))}
        </div>
      )}
      {/* Le viseur qui verrouille. */}
      {cornerK > 0 && (
        <div style={{ position: "absolute", left: fx, top: fy, width: fw, height: fh, transform: `scale(${cornerS.toFixed(3)})`, opacity: clamp01(cornerK * 3) * (0.75 + 0.25 * lockedPulse) }}>
          {corner(0, -2, -2)}
          {corner(90, fw - L + 2, -2)}
          {corner(180, fw - L + 2, fh - L + 2)}
          {corner(270, -2, fh - L + 2)}
        </div>
      )}
      {flash > 0 && (
        <div style={{ position: "absolute", left: fx, top: fy, width: fw, height: fh, borderRadius: 8, background: rgba(PB.mint2, 0.85 * flash), boxShadow: `0 0 40px ${rgba(PB.mint, flash)}` }} />
      )}
    </>
  );
}

function BoxFront({ children }: { children?: ReactNode }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          height: 58,
          borderRadius: "8px 8px 0 0",
          background: `linear-gradient(180deg, ${PB.teal2}, ${PB.teal})`,
          display: "flex",
          alignItems: "center",
          paddingLeft: 20,
          gap: 10,
        }}
      >
        <PillIcon size={24} color="#FFFFFF" />
        <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 17, color: "rgba(255,255,255,.92)", letterSpacing: "0.02em" }}>Comprimés</span>
        <div
          style={{
            marginLeft: "auto",
            marginRight: 18,
            width: 34,
            height: 34,
            borderRadius: 17,
            border: "2px solid rgba(255,255,255,.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 14, height: 4, background: "#fff", borderRadius: 2, position: "absolute" }} />
          <div style={{ width: 4, height: 14, background: "#fff", borderRadius: 2 }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 22, top: 72, fontFamily: JAKARTA, fontWeight: 800, fontSize: 31, letterSpacing: "-0.01em", color: INK }}>DOXYCYCLINE</div>
      <div style={{ position: "absolute", left: 22, top: 110, fontFamily: JAKARTA, fontWeight: 800, fontSize: 25, color: TEAL_TEXT }}>100 mg</div>
      <div style={{ position: "absolute", left: 22, top: 152, width: 110, height: 7, borderRadius: 4, background: "#DCE4E8" }} />
      <div style={{ position: "absolute", left: 22, top: 168, width: 80, height: 7, borderRadius: 4, background: "#E6ECEF" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 6, borderRadius: "0 0 8px 8px", background: `linear-gradient(90deg, ${PB.mint}, ${PB.teal2})` }} />
      {children}
    </>
  );
}

/** Une boîte de médicament en volume (CSS 3D). */
function Box3D({
  x,
  y,
  s,
  rz,
  ry,
  rx,
  sx = 1,
  sy = 1,
  children,
  opacity = 1,
}: {
  x: number;
  y: number;
  s: number;
  rz: number;
  ry: number;
  rx: number;
  sx?: number;
  sy?: number;
  children?: ReactNode;
  opacity?: number;
}) {
  const { w: W, h: H, d: D } = BOX;
  const face = (extra: CSSProperties): CSSProperties => ({ position: "absolute", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", overflow: "hidden", ...extra });
  return (
    <div style={{ position: "absolute", left: x - W / 2, top: y - H / 2, width: W, height: H, perspective: 1500, opacity }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: `rotateZ(${rz.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) scale3d(${s.toFixed(4)}, ${s.toFixed(4)}, ${s.toFixed(4)})`,
        }}
      >
        <div style={face({ left: 0, top: 0, width: W, height: H, borderRadius: 8, background: "#FFFFFF", transform: `translateZ(${D / 2}px)`, overflow: "visible" })}>
          <BoxFront>{children}</BoxFront>
        </div>
        <div style={face({ left: 0, top: 0, width: W, height: H, borderRadius: 8, background: "#EEF3F5", transform: `rotateY(180deg) translateZ(${D / 2}px)` })}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 58, background: PB.teal }} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ position: "absolute", left: 24, top: 84 + i * 26, width: 300 - i * 40, height: 8, borderRadius: 4, background: "#D4DDE2" }} />
          ))}
        </div>
        {[90, -90].map((r) => (
          <div key={r} style={face({ left: (W - D) / 2, top: 0, width: D, height: H, background: "linear-gradient(180deg, #E4ECEF, #CBD7DC)", transform: `rotateY(${r}deg) translateZ(${W / 2}px)` })}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 58, background: PB.teal }} />
          </div>
        ))}
        <div style={face({ left: 0, top: (H - D) / 2, width: W, height: D, background: "linear-gradient(90deg, #F7FAFB, #E8EEF1)", transform: `rotateX(90deg) translateZ(${H / 2}px)` })} />
        <div style={face({ left: 0, top: (H - D) / 2, width: W, height: D, background: "#B9C6CC", transform: `rotateX(-90deg) translateZ(${H / 2}px)` })} />
      </div>
    </div>
  );
}

/** La silhouette plate de la boîte, pour la traînée fantôme. */
function BoxGhost({ x, y, s, rz, o }: { x: number; y: number; s: number; rz: number; o: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x - BOX.w / 2,
        top: y - BOX.h / 2,
        width: BOX.w,
        height: BOX.h,
        opacity: o,
        transform: `rotate(${rz.toFixed(1)}deg) scale(${s.toFixed(3)})`,
        borderRadius: 10,
        background: "rgba(255,255,255,.9)",
        overflow: "hidden",
        boxShadow: `0 0 30px ${rgba(PB.mint, 0.5)}`,
      }}
    >
      <div style={{ height: 58, background: PB.teal2 }} />
    </div>
  );
}

type BoxState = { x: number; y: number; s: number; rz: number; ry: number; rx: number; sx: number; sy: number; o: number };

function boxAt(t: number, b: Beats, host: HostPose | null): BoxState | null {
  if (t < b.B0 || t > b.SQZ + 6 * F) return null;
  // 1. Elle jaillit du bas en tournant (RESSORT).
  const r = ressort(t, b.B0, { damping: 13, stiffness: 190, mass: 0.7 });
  let x = lerp(1360, BOX.x, prog(t, b.B0 + 0.06, 0.42, IN_OUT));
  let y = lerp(1320, BOX.y, r);
  let rz = lerp(18, 0, r);
  let ry = lerp(70, 18, r);
  let rx = lerp(20, -9, r);
  let s = lerp(0.8, 1, r);
  // Respiration au repos (vie).
  const idle = clamp01((t - b.B0 - 0.4) / 0.3);
  y += idle * 5 * Math.sin((t - b.B0) * 4);
  ry += idle * 3 * Math.sin((t - b.B0) * 2.6);
  let sx = 1;
  let sy = 1;
  // 2. Le lancer en cloche vers la tablette.
  if (t >= b.THROW - 4 * F && host) {
    const tab = tabletAt(hostPose(b.CATCH, b) ?? host);
    const ant = keys(t, [
      [b.THROW - 4 * F, 0],
      [b.THROW, 1, IN_OUT],
    ]);
    // Anticipation : la boîte se tasse et recule avant de partir.
    if (t < b.THROW) {
      sy *= 1 - 0.08 * ant;
      sx *= 1 + 0.05 * ant;
      y += 10 * ant;
    } else {
      const u = clamp01((t - b.THROW) / b.FLY);
      const p0 = { x: BOX.x, y: BOX.y + 10 };
      const c = { x: (BOX.x + tab.x) / 2 + 60, y: Math.min(BOX.y, tab.y) - 330 };
      const p1 = tab;
      x = (1 - u) * (1 - u) * p0.x + 2 * u * (1 - u) * c.x + u * u * p1.x;
      y = (1 - u) * (1 - u) * p0.y + 2 * u * (1 - u) * c.y + u * u * p1.y;
      rz = lerp(0, -352, u);
      ry = lerp(18, -14 + 360, IN_OUT(u));
      rx = lerp(-9, -6, u);
      s = lerp(1, BOX_HELD, u);
      if (u >= 1 && host) {
        // 3. Sur la tablette : elle suit le robot, vibre 4 images.
        const tb = tabletAt(host);
        const v = t - b.CATCH < 4 * F ? 3 * Math.sin((t - b.CATCH) * 60 * 2.2) : 0;
        x = tb.x + v;
        y = tb.y;
        rz = 8;
        ry = -14;
        rx = -6;
        const sq = squash(t, b.CATCH, 5 * F);
        sx *= sq.sx;
        sy *= sq.sy;
      }
    }
  }
  // 4. Compression en puce.
  let o = 1;
  if (t >= b.SQZ) {
    const k = prog(t, b.SQZ, 6 * F, IN_OUT);
    sx *= lerp(1, 1.7, k);
    sy *= lerp(1, 0.18, k);
    o = 1 - clamp01((t - b.SQZ - 3 * F) / (3 * F));
  }
  return { x, y, s, rz, ry, rx, sx, sy, o };
}

/** Le réticule HUD autour du code-barres : il tourne pendant la lecture et se verrouille avec le viseur. */
function Reticle({ t, b }: { t: number; b: Beats }) {
  const inK = tween(t, b.B0 + 0.12, 0.3, 0, 1, POP);
  const out = prog(t, b.THROW - 0.04, 8 * F, SNAP);
  if (inK <= 0 || out >= 1) return null;
  const lock = prog(t, b.K0, 10 * F, SNAP);
  const R = 190;
  const cx = BOX.x + 80;
  const cy = BOX.y + 53;
  const spin = (t - b.B0) * 140 * (1 - lock) + lock * 45;
  const s = lerp(1.35, 1, lock) * Math.min(1, inK) * (1 + 0.5 * out);
  const flash = pulse(t, b.K0 + 7 * F, F, 0, 0.3);
  return (
    <div style={{ position: "absolute", left: cx - R, top: cy - R, width: R * 2, height: R * 2, opacity: (1 - out) * (0.55 + 0.45 * flash), transform: `scale(${s.toFixed(3)})` }}>
      <svg width={R * 2} height={R * 2} viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} style={{ overflow: "visible" }}>
        <g transform={`rotate(${spin.toFixed(2)})`}>
          <circle r={R - 6} fill="none" stroke={rgba(PB.mint, 0.35)} strokeWidth={1.5} strokeDasharray="3 9" />
          {[0, 90, 180, 270].map((a) => (
            <path key={a} transform={`rotate(${a})`} d={`M 0 ${-R + 2} L 0 ${-R + 26}`} stroke={PB.mint2} strokeWidth={3} strokeLinecap="round" />
          ))}
        </g>
        <g transform={`rotate(${(-spin * 0.6).toFixed(2)})`}>
          <circle r={R - 34} fill="none" stroke={rgba(PB.mint2, 0.5 + 0.4 * flash)} strokeWidth={2} pathLength={100} strokeDasharray="20 5 8 5 30 5 22 5" />
        </g>
      </svg>
      <div
        style={{
          position: "absolute",
          left: R + R * 0.62,
          top: R - R * 0.86,
          fontFamily: MONO,
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: "0.16em",
          color: rgba(PB.mint2, 0.8),
          whiteSpace: "nowrap",
          opacity: lock,
        }}
      >
        EAN-13
      </div>
    </div>
  );
}

/** « LECTURE… OK », en mono sous la boîte. */
function ReadLabel({ t, b }: { t: number; b: Beats }) {
  if (t < b.LBL || t > b.THROW + 0.3) return null;
  const txt = "LECTURE…";
  const n = Math.min(txt.length, Math.floor((t - b.LBL) / F) + 1);
  const okAt = b.LBL + txt.length * F + 2 * F;
  const ok = tween(t, okAt, 10 * F, 0, 1, POP);
  const out = prog(t, b.THROW + 0.04, 10 * F, SNAP);
  const enter = prog(t, b.LBL, 8 * F, SNAP);
  return (
    <div
      style={{
        position: "absolute",
        left: BOX.x - 160,
        top: BOX.y + 150,
        width: 320,
        height: 46,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: enter * (1 - out),
        transform: `translateY(${(1 - enter) * 14 + out * 18}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: 44,
          padding: "0 20px",
          borderRadius: 22,
          background: "rgba(11,15,20,.78)",
          border: `1px solid ${rgba(PB.mint, 0.35)}`,
          boxShadow: `0 0 30px ${rgba(PB.mint, 0.2 * (1 + ok))}`,
        }}
      >
        <div style={{ width: 9, height: 9, borderRadius: 2, background: PB.mint2, opacity: 0.5 + 0.5 * Math.sin(t * 30) ** 2, boxShadow: `0 0 10px ${PB.mint}` }} />
        <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 18, letterSpacing: "0.12em", color: PB.mint2, whiteSpace: "pre" }}>{txt.slice(0, n)}</span>
        {ok > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "0.12em",
              color: INK,
              background: PB.mint2,
              borderRadius: 6,
              padding: "3px 8px",
              transform: `scale(${ok.toFixed(3)})`,
            }}
          >
            OK
          </span>
        )}
      </div>
    </div>
  );
}

// ---- La puce ---------------------------------------------------------------------------------------------------

function cubic(u: number, p0: { x: number; y: number }, c1: { x: number; y: number }, c2: { x: number; y: number }, p3: { x: number; y: number }) {
  const v = 1 - u;
  return { x: v * v * v * p0.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p3.x, y: v * v * v * p0.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p3.y };
}

function ChipBody({ glow = 0 }: { glow?: number }) {
  return (
    <div
      style={{
        width: 300,
        height: 48,
        borderRadius: 24,
        background: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        gap: 10,
        paddingLeft: 16,
        boxSizing: "border-box",
        boxShadow: `0 10px 30px rgba(0,0,0,.35), 0 0 ${20 + 30 * glow}px ${rgba(PB.mint, 0.25 + 0.5 * glow)}`,
      }}
    >
      <PillIcon size={24} />
      <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 22, color: INK, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>Doxycycline 100 mg</span>
    </div>
  );
}

function Chip({ t, b, host, fade }: { t: number; b: Beats; host: HostPose | null; fade: number }) {
  if (t < b.SQZ + 2 * F || !host) return null;
  const start = tabletAt(hostPose(b.CHIP, b) ?? host);
  const p0 = { x: start.x, y: start.y };
  const c1 = { x: p0.x + 140, y: p0.y - 300 };
  const c2 = { x: CHIP_SLOT.x - 380, y: CHIP_SLOT.y - 60 };
  const p3 = CHIP_SLOT;
  const born = tween(t, b.SQZ + 2 * F, 8 * F, 0.4, 1, POP);
  const u = prog(t, b.CHIP, b.DOCK - b.CHIP, CHIP_EASE);
  const pos = t < b.CHIP ? tabletAt(host) : cubic(u, p0, c1, c2, p3);
  const scaleFly = t < b.CHIP ? 0.62 * born : lerp(0.62, 1, u);
  const dock = squash(t, b.DOCK, 6 * F);
  const glow = pulse(t, b.DOCK, 2 * F, 0, 0.35);
  // La traînée : une comète continue le long de la courbe, derrière la puce.
  let trail: ReactNode = null;
  if (t >= b.CHIP && t < b.DOCK + 0.22) {
    const tailFade = 1 - clamp01((t - b.DOCK) / 0.22);
    const pts = Array.from({ length: 18 }, (_, k) => cubic(Math.max(0, u - k * 0.03), p0, c1, c2, p3));
    trail = (
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: tailFade }}>
        {pts.slice(1).map((q, k) => {
          const a = pts[k];
          const f = 1 - k / 17;
          return <line key={k} x1={a.x} y1={a.y} x2={q.x} y2={q.y} stroke={k < 3 ? "#FFFFFF" : PB.mint2} strokeOpacity={0.75 * f} strokeWidth={4 + 26 * f} strokeLinecap="round" />;
        })}
        <circle cx={pts[0].x} cy={pts[0].y} r={40} fill={rgba(PB.mint, 0.25)} style={{ filter: "blur(12px)" }} />
      </svg>
    );
  }
  return (
    <>
      {trail}
      <div
        style={{
          position: "absolute",
          left: pos.x - 150,
          top: pos.y - 24,
          width: 300,
          height: 48,
          opacity: fade,
          transform: `scale(${(scaleFly * dock.sx).toFixed(4)}, ${(scaleFly * dock.sy).toFixed(4)})`,
        }}
      >
        <ChipBody glow={glow} />
      </div>
    </>
  );
}

// ---- La capsule, qui devient le panneau ------------------------------------------------------------------------

function capsuleRect(t: number, b: Beats, push: number) {
  const widen = tween(t, b.DOCK, 0.38, 0, 40, POP);
  const unfold = tween(t, b.GOOD, 0.34, 0, 1, POP);
  const w = lerp(CAP.w + widen, CAP.w, clamp01(unfold));
  const h = lerp(CAP.h, CAP.h + 14 + CARD.h + 24, unfold) + (CARD_H_END - CARD.h) * push;
  const r = lerp(CAP.h / 2, 32, clamp01(unfold));
  // Le petit bond de la capsule quand le robot en sort.
  const bump = 1 + 0.045 * pulse(t, b.R0, 3 * F, 0, 12 * F);
  return { left: CAP.cx - w / 2, top: CAP.top, w, h, r, bump };
}

function CheckRow({ t, at, appear, text, y }: { t: number; at: number; appear: number; text: string; y: number }) {
  const inK = prog(t, appear, 10 * F, SNAP);
  if (inK <= 0) return null;
  const done = prog(t, at, 8 * F, LINEAR_EASE);
  const pop = tween(t, at, 10 * F, 0, 1, POP);
  const spin = ((t - appear) * 540) % 360;
  return (
    <div style={{ position: "absolute", left: 0, top: y - 15, height: 30, display: "flex", alignItems: "center", gap: 12, opacity: inK, transform: `translateX(${(1 - inK) * 24}px)` }}>
      <div style={{ position: "relative", width: 26, height: 26 }}>
        {done <= 0 ? (
          <svg width={26} height={26} viewBox="0 0 26 26" style={{ position: "absolute", transform: `rotate(${spin}deg)` }}>
            <circle cx={13} cy={13} r={10} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={2.5} />
            <path d="M 13 3 A 10 10 0 0 1 23 13" fill="none" stroke={PB.mint} strokeWidth={2.5} strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            width={26}
            height={26}
            viewBox="0 0 26 26"
            style={{ position: "absolute", transform: `scale(${(0.6 + 0.4 * pop).toFixed(3)})`, overflow: "visible", filter: `drop-shadow(0 0 8px ${rgba(PB.mint, 0.8)})` }}
          >
            <circle cx={13} cy={13} r={12} fill={PB.mint} />
            <path d="M 7.5 13.5 L 11.3 17 L 18.5 9.5" fill="none" stroke={INK} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={18} strokeDashoffset={18 * (1 - done)} />
          </svg>
        )}
      </div>
      <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 20, color: `rgba(255,255,255,${(0.45 + 0.4 * clamp01(done * 2)).toFixed(2)})`, whiteSpace: "nowrap" }}>{text}</span>
    </div>
  );
}

const LINEAR_EASE = (x: number) => x;
const CHIP_EASE = Easing.bezier(0.45, 0, 0.15, 1);

function Capsule({ t, b, track, push, children }: { t: number; b: Beats; track: Track; push: number; children?: ReactNode }) {
  const c = capsuleRect(t, b, push);
  const border = 1 - push;
  const ang = (t * 160) % 360;
  const p = clamp01((t - b.T0) / (b.GOOD - b.T0));
  const statusO = 1 - prog(t, b.CHIP - 0.05, 8 * F, SNAP);
  const checksO = 1 - prog(t, b.GOOD, 8 * F, SNAP);
  const headO = 1 - prog(t, b.PUSH0, (b.PUSH1 - b.PUSH0) * 0.7, IN_OUT);
  const countK = tween(t, b.GOOD + 0.14, 12 * F, 0, 1, POP);
  // « 1 conseil » → « 2 conseils » quand la crème solaire se pose.
  const flip = prog(t, b.C2_LAND, 8 * F, SNAP);
  const flipPop = 1 + 0.14 * pulse(t, b.C2_LAND, 3 * F, 0, 10 * F);
  const dots = ".".repeat(1 + (((Math.floor((t - b.P7) * 4) % 3) + 3) % 3));
  return (
    <>
      <Spot x={CAP.cx} y={CAP_Y + (c.h - CAP.h) / 2} r={700} alpha={0.12 + 0.1 * pulse(t, b.GOOD, 0.05, 0, 0.6)} />
      <div style={{ position: "absolute", left: c.left, top: c.top, width: c.w, height: c.h, transformOrigin: `${AVATAR.x - c.left}px ${CAP.h / 2}px`, transform: `scale(${c.bump.toFixed(4)})` }}>
        {/* Corps encre, liseré, lueur. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: c.r,
            opacity: lerp(1, 0, push),
            background: INK,
            border: `1.5px solid ${rgba(PB.mint, 0.35 * border)}`,
            boxShadow: `0 0 40px ${rgba(PB.mint, 0.25 * border)}, 0 30px 70px rgba(0,0,0,${0.55 * border}), inset 0 1px 0 rgba(255,255,255,${0.08 * border})`,
          }}
        />
        {/* Le reflet qui court sur le liseré. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: c.r,
            padding: 1.5,
            background: `conic-gradient(from ${ang}deg, transparent 0deg, ${rgba(PB.mint2, 0.9)} 30deg, transparent 70deg, transparent 180deg, ${rgba(PB.mint2, 0.5)} 210deg, transparent 250deg)`,
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            opacity: border,
          }}
        />
        {/* La barre d'avancement du calcul, au bas de la capsule. */}
        {t >= b.T0 && checksO > 0 && (
          <div style={{ position: "absolute", left: c.r, right: c.r, bottom: 10, height: 3, borderRadius: 2, background: "rgba(255,255,255,.08)", opacity: checksO }}>
            <div style={{ width: `${p * 100}%`, height: "100%", borderRadius: 2, background: PB.mint, boxShadow: `0 0 12px ${PB.mint}` }} />
          </div>
        )}
      </div>
      {/* L'en-tête : avatar, état, puce, coches. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: headO }}>
        <div style={{ position: "absolute", left: AVATAR.x - 22, top: AVATAR.y - 20, width: 44, height: 40, transform: `scale(${(2.1 * c.bump).toFixed(3)})` }}>
          <Mascot track={track} t={t} size={44} />
        </div>
        {statusO > 0 && (
          <div style={{ position: "absolute", left: 818, top: CAP_Y - 16, height: 32, display: "flex", alignItems: "center", gap: 12, opacity: statusO }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: PB.mint, boxShadow: `0 0 ${10 + 8 * Math.sin(t * 6)}px ${PB.mint}` }} />
            <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 26, color: "rgba(255,255,255,.62)", whiteSpace: "pre" }}>{`En attente d'une boîte${dots}`}</span>
          </div>
        )}
        {checksO > 0 && (
          <div style={{ position: "absolute", left: 1190, top: CAP_Y, opacity: checksO }}>
            {["Boîte reconnue", "Stock lu", "Conseil trouvé"].map((txt, i) => (
              <CheckRow key={txt} t={t} appear={b.P8 + i * 4 * F} at={b.CHECKS[i]} text={txt} y={(i - 1) * 36} />
            ))}
          </div>
        )}
        {countK > 0 && (
          <div
            style={{
              position: "absolute",
              left: CAP.cx + 520 - 44 - 196,
              top: CAP_Y - 22,
              width: 196,
              height: 44,
              borderRadius: 22,
              background: rgba(PB.mint, 0.14),
              border: `1px solid ${rgba(PB.mint, 0.4)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              transform: `scale(${(countK * flipPop).toFixed(3)})`,
              boxShadow: `0 0 ${(26 * pulse(t, b.C2_LAND, 3 * F, 0, 14 * F)).toFixed(1)}px ${rgba(PB.mint, 0.7)}`,
            }}
          >
            <svg width={18} height={18} viewBox="0 0 18 18">
              <path d="M 9 1 L 10.9 6.6 L 16.8 6.8 L 12.1 10.4 L 13.8 16 L 9 12.7 L 4.2 16 L 5.9 10.4 L 1.2 6.8 L 7.1 6.6 Z" fill={PB.mint2} />
            </svg>
            <span style={{ display: "inline-flex", alignItems: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 20, color: PB.mint2, whiteSpace: "pre" }}>
              <span style={{ display: "inline-block", height: 26, overflow: "hidden", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ display: "block", lineHeight: "26px", transform: `translateY(${(-26 * flip).toFixed(1)}px)` }}>
                  1<br />2
                </span>
              </span>
              {flip > 0.5 ? " conseils" : " conseil"}
            </span>
          </div>
        )}
        {children}
      </div>
    </>
  );
}

// ---- Le chrono -------------------------------------------------------------------------------------------------

/** La valeur affichée par le chrono : elle ROULE jusqu'à ≈ 0,85 et fond avant de s'arrêter — aucune durée finale à l'écran. */
const CHRONO_TOP = 0.85;

function Chrono({ t, b }: { t: number; b: Beats }) {
  const inK = tween(t, b.P8, 10 * F, 0, 1, POP);
  const outK = prog(t, b.GOOD + 9 * F, 9 * F, SNAP);
  if (inK <= 0 || outK >= 1) return null;
  const pOf = (tt: number) => clamp01((tt - b.T0) / (b.GOOD - b.T0));
  const p = pOf(t);
  const { r } = CHRONO;
  const C = 2 * Math.PI * r;
  const S = 2 * (r + 90);
  const hit = pulse(t, b.GOOD, F, 2 * F, 10 * F);
  const head = ((p * 360 - 90) * Math.PI) / 180;
  // Les chiffres fondent (flou, rétrécissent) pendant qu'ils roulent encore ; la coche jaillit à leur place.
  const melt = prog(t, b.GOOD - 7 * F, 7 * F, IN_OUT);
  const checkK = tween(t, b.GOOD - 2 * F, 12 * F, 0, 1, POP);
  const draw = prog(t, b.GOOD - F, 7 * F, SNAP);
  const CK = 156;
  return (
    <div
      style={{
        position: "absolute",
        left: CHRONO.x - S / 2,
        top: CHRONO.y - S / 2,
        width: S,
        height: S,
        opacity: Math.min(1, inK) * (1 - outK) * 0.95,
        transform: `scale(${(lerp(0.8, 1, inK) * lerp(1, 1.1, outK)).toFixed(4)})`,
      }}
    >
      <svg width={S} height={S} viewBox={`${-S / 2} ${-S / 2} ${S} ${S}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <radialGradient id="s6-chrono-bg">
            <stop offset="0" stopColor={rgba(PB.teal, 0.42)} />
            <stop offset="0.7" stopColor={rgba(PB.teal, 0.16)} />
            <stop offset="1" stopColor={rgba(PB.teal, 0)} />
          </radialGradient>
        </defs>
        <circle r={r + 70} fill="url(#s6-chrono-bg)" />
        {/* Le disque sombre derrière les chiffres : ils se lisent sur la caisse floue. */}
        <circle r={r - 8} fill={rgba(INK, 0.55)} />
        {/* Graduations : celles déjà passées s'allument. */}
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const lit = i / 60 <= p + 1e-6 && p > 0;
          const major = i % 5 === 0;
          const r0 = r + CHRONO_TICK.r0;
          const r1 = r + (major ? CHRONO_TICK.major : CHRONO_TICK.minor);
          return (
            <line
              key={i}
              x1={Math.cos(a) * r0}
              y1={Math.sin(a) * r0}
              x2={Math.cos(a) * r1}
              y2={Math.sin(a) * r1}
              stroke={lit ? PB.mint2 : "rgba(255,255,255,.16)"}
              strokeWidth={major ? 4 : 2.5}
              strokeLinecap="round"
            />
          );
        })}
        <circle r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={12} />
        <circle r={r - 34} fill="none" stroke={rgba(PB.mint, 0.25)} strokeWidth={2} strokeDasharray="4 12" transform={`rotate(${(t * 40) % 360})`} />
        <circle
          r={r}
          fill="none"
          stroke={PB.mint}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${C} ${C}`}
          strokeDashoffset={C * (1 - p)}
          transform="rotate(-90)"
          style={{ filter: `drop-shadow(0 0 14px ${rgba(PB.mint, 0.8)})` }}
        />
        {p > 0 && <circle cx={Math.cos(head) * r} cy={Math.sin(head) * r} r={10 + 6 * hit} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 16px ${PB.mint2})` }} />}
      </svg>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: S / 2 - 104,
          textAlign: "center",
          fontFamily: MONO,
          fontWeight: 600,
          fontSize: 17,
          letterSpacing: "0.3em",
          color: rgba(PB.mint2, 0.85),
          opacity: 1 - melt,
        }}
      >
        ANALYSE
      </div>
      {melt < 1 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: S / 2 - 60,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            opacity: 1 - melt,
            transform: `scale(${lerp(1, 0.55, melt).toFixed(3)})`,
            filter: melt > 0 ? `blur(${(10 * melt).toFixed(1)}px)` : undefined,
          }}
        >
          <Odometer t={t} value={(tt) => CHRONO_TOP * pOf(tt)} digits={1} decimals={2} decimalSep="," size={100} color="#FFFFFF" />
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 44, color: "rgba(255,255,255,.6)", marginLeft: 12, marginTop: 50 }}>s</span>
        </div>
      )}
      {/* La coche menthe, à la place des chiffres. */}
      {checkK > 0 && (
        <svg
          width={CK}
          height={CK}
          viewBox="0 0 64 64"
          style={{
            position: "absolute",
            left: S / 2 - CK / 2,
            top: S / 2 - CK / 2,
            overflow: "visible",
            transform: `scale(${(0.35 + 0.65 * checkK).toFixed(3)}) rotate(${((1 - Math.min(1, checkK)) * -25).toFixed(1)}deg)`,
            filter: `drop-shadow(0 0 ${(18 + 26 * hit).toFixed(1)}px ${rgba(PB.mint, 0.9)})`,
          }}
        >
          <circle cx={32} cy={32} r={30} fill={PB.mint} />
          <circle cx={32} cy={32} r={30} fill="none" stroke="#FFFFFF" strokeOpacity={0.55 * hit} strokeWidth={3} />
          <path d="M 18 33.5 L 28 43 L 46.5 23.5" fill="none" stroke={INK} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        </svg>
      )}
    </div>
  );
}

// ---- Les cartes conseil ----------------------------------------------------------------------------------------

type Advice = { img: string; name: string; price: string; reason: string };

const ULTRA: Advice = { img: "produits/boites/ultra-levure-200-mg.webp", name: "Ultra-Levure 200 mg", price: "8,90 €", reason: "Antibiotique : la flore intestinale peut être perturbée" };
const SOLAIRE: Advice = { img: "produits/boites/creme-solaire-spf50.webp", name: "Crème solaire SPF 50+", price: "16,90 €", reason: "Photosensibilisant : protéger la peau" };

function AdviceCard({ t, a, at, h, typeFrom, style }: { t: number; a: Advice; at: number; h: number; typeFrom?: number; style?: CSSProperties }) {
  const st = (d: number, dur = 12 * F) => prog(t, at + d, dur, SNAP);
  const thumb = tween(t, at + 0.02, 14 * F, 0.6, 1, POP);
  const pill = tween(t, at + 0.12, 12 * F, 0, 1, POP);
  const chars = Array.from(a.reason);
  const n = typeFrom === undefined ? chars.length : Math.max(0, Math.min(chars.length, Math.floor((t - typeFrom) / 0.011)));
  const typing = typeFrom !== undefined && n < chars.length && t >= typeFrom;
  const caretOn = typeFrom !== undefined && t >= typeFrom - 0.1 && (typing || Math.floor(t * 4) % 2 === 0);
  const ping = typeFrom !== undefined ? clamp01((t - (at + 0.18)) / 0.5) : 1;
  return (
    <div
      style={{
        position: "absolute",
        width: CARD.w,
        height: h,
        borderRadius: 24,
        background: "#FFFFFF",
        boxShadow: "0 30px 80px rgba(0,0,0,.45), 0 2px 0 rgba(255,255,255,.6) inset",
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: (h - CARD.h) / 2, width: CARD.w, height: CARD.h }}>
        {/* Vignette produit. */}
        <div
          style={{
            position: "absolute",
            left: 44,
            top: 50,
            width: 200,
            height: 200,
            borderRadius: 20,
            background: "linear-gradient(160deg, #F2F8F7, #E3EFEC)",
            transform: `scale(${thumb.toFixed(3)})`,
            overflow: "hidden",
          }}
        >
          <Img src={staticFile(a.img)} style={{ position: "absolute", left: 10, top: 10, width: 180, height: 180, objectFit: "contain" }} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 290,
            top: 40,
            fontFamily: JAKARTA,
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: TEAL_TEXT,
            opacity: st(0.03),
            transform: `translateX(${(1 - st(0.03)) * 20}px)`,
          }}
        >
          Conseil associé
        </div>
        <div
          style={{
            position: "absolute",
            left: 290,
            top: 64,
            fontFamily: JAKARTA,
            fontWeight: 800,
            fontSize: 36,
            letterSpacing: "-0.02em",
            color: INK,
            whiteSpace: "nowrap",
            opacity: st(0.05),
            transform: `translateX(${(1 - st(0.05)) * 28}px)`,
          }}
        >
          {a.name}
        </div>
        <div
          style={{
            position: "absolute",
            right: 44,
            top: 60,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 40,
            color: INK,
            fontVariantNumeric: "tabular-nums",
            opacity: st(0.08),
            transform: `translateY(${(1 - st(0.08)) * 16}px)`,
          }}
        >
          {a.price}
        </div>
        <div
          style={{
            position: "absolute",
            left: 290,
            top: 122,
            height: 34,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px",
            borderRadius: 17,
            background: rgba(PB.stock, 0.12),
            transform: `scale(${pill.toFixed(3)})`,
            transformOrigin: "0 50%",
          }}
        >
          <div style={{ position: "relative", width: 10, height: 10 }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 5, background: PB.stock }} />
            {ping > 0 && ping < 1 && <div style={{ position: "absolute", inset: -10 * ping, borderRadius: "50%", border: `2px solid ${rgba(PB.stock, 1 - ping)}` }} />}
          </div>
          <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 18, color: "#1B794A" }}>En stock</span>
        </div>
        <div style={{ position: "absolute", left: 290, top: 178, width: CARD.w - 290 - 44, fontFamily: JAKARTA, fontWeight: 600, fontSize: 24, lineHeight: 1.32, color: "#2A333D" }}>
          {chars.slice(0, n).join("")}
          {caretOn && <span style={{ display: "inline-block", width: 3, height: 26, marginLeft: 2, verticalAlign: "-4px", background: PB.teal2, borderRadius: 2 }} />}
        </div>
      </div>
    </div>
  );
}

/** La carte 2, compacte (une ligne) : vignette, nom, « En stock » + raison courte, prix. */
function CompactCard({ t, a, at, style }: { t: number; a: Advice; at: number; style?: CSSProperties }) {
  const st = (d: number, dur = 10 * F) => prog(t, at + d, dur, SNAP);
  const thumb = tween(t, at + 0.06, 14 * F, 0.5, 1, POP);
  return (
    <div
      style={{
        position: "absolute",
        width: CARD2.w,
        height: CARD2.h,
        borderRadius: 22,
        background: "#FFFFFF",
        boxShadow: "0 26px 60px rgba(0,0,0,.5), 0 2px 0 rgba(255,255,255,.6) inset",
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: `linear-gradient(180deg, ${PB.mint}, ${PB.teal2})` }} />
      <div
        style={{
          position: "absolute",
          left: 22,
          top: 14,
          width: 104,
          height: 104,
          borderRadius: 16,
          background: "linear-gradient(160deg, #FFF6EE, #F6E9DC)",
          transform: `scale(${thumb.toFixed(3)})`,
          overflow: "hidden",
        }}
      >
        <Img src={staticFile(a.img)} style={{ position: "absolute", left: 6, top: 6, width: 92, height: 92, objectFit: "contain" }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 148,
          top: 22,
          fontFamily: JAKARTA,
          fontWeight: 800,
          fontSize: 31,
          letterSpacing: "-0.02em",
          color: INK,
          whiteSpace: "nowrap",
          opacity: st(0.08),
          transform: `translateX(${(1 - st(0.08)) * 22}px)`,
        }}
      >
        {a.name}
      </div>
      <div style={{ position: "absolute", left: 148, top: 72, height: 34, display: "flex", alignItems: "center", gap: 12, opacity: st(0.14), transform: `translateX(${(1 - st(0.14)) * 22}px)` }}>
        <div style={{ height: 30, display: "flex", alignItems: "center", gap: 7, padding: "0 12px", borderRadius: 15, background: rgba(PB.stock, 0.12) }}>
          <div style={{ width: 9, height: 9, borderRadius: 5, background: PB.stock }} />
          <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 16, color: "#1B794A" }}>En stock</span>
        </div>
        <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 19, color: "#4A5562", whiteSpace: "nowrap" }}>{a.reason}</span>
      </div>
      <div
        style={{
          position: "absolute",
          right: 30,
          top: 26,
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 32,
          color: INK,
          fontVariantNumeric: "tabular-nums",
          opacity: st(0.1),
          transform: `translateY(${(1 - st(0.1)) * 14}px)`,
        }}
      >
        {a.price}
      </div>
    </div>
  );
}

// ---- Le fond : la caisse floue ---------------------------------------------------------------------------------

function CashWindow({ t, fade }: { t: number; fade: number }) {
  const W = 1280;
  const H = 720;
  return (
    <div style={{ position: "absolute", left: 960 - W / 2, top: 560 - H / 2, width: W, height: H, transform: "scale(1.15)", opacity: fade }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 24, background: "rgba(18,26,34,.88)", border: "1px solid rgba(255,255,255,.14)", overflow: "hidden", filter: "blur(8px)" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 48, background: "rgba(255,255,255,.05)" }} />
        <div
          style={{
            position: "absolute",
            left: 24,
            top: 8,
            height: 40,
            width: 150,
            borderRadius: "12px 12px 0 0",
            background: "rgba(255,255,255,.08)",
            fontFamily: JAKARTA,
            fontWeight: 700,
            fontSize: 22,
            color: "rgba(255,255,255,.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Caisse
        </div>
        {Array.from({ length: 8 }, (_, i) => {
          const sh = 0.5 + 0.5 * Math.sin(t * 2.4 - i * 0.7);
          return (
            <div
              key={i}
              style={{ position: "absolute", left: 90, top: 100 + i * 70, width: 1100 - (i % 3) * 120, height: 14, borderRadius: 7, background: `rgba(255,255,255,${(0.06 + 0.05 * sh).toFixed(3)})` }}
            />
          );
        })}
      </div>
      <div style={{ position: "absolute", inset: -40, background: "rgba(11,15,20,.4)" }} />
    </div>
  );
}

// ---- La scène --------------------------------------------------------------------------------------------------

function World({ t, b, track }: { t: number; b: Beats; track: Track }) {
  const push = prog(t, b.PUSH0, b.PUSH1 - b.PUSH0, IN_OUT);
  const cam = {
    x: PUSH_X * push,
    y: PUSH_Y * push,
    zoom: lerp(1, PUSH_Z, push),
    drift: 1 - push,
    shakes: [
      { at: b.R1, amp: 7, frames: 12 },
      { at: b.CATCH, amp: 6, frames: 10 },
      { at: b.GOOD, amp: 9, frames: 14 },
    ],
  };
  // L'arrivée : on sort de la plongée de S5, la caméra se pose (zoom 1,10 → 1 autour de la capsule).
  const settle = keys(t, [
    [b.P7 - 0.04, 1.1],
    [b.P7 + 0.5, 1, SNAP],
  ]);
  const tension = keys(t, [
    [b.P8, 0],
    [b.GOOD, 1, IN_OUT],
    [b.GOOD + 0.3, 0, SNAP],
  ]);
  const host = hostPose(t, b);
  const exitX = -760 * push;
  const box = boxAt(t, b, host);
  const flying = t > b.THROW - 2 * F && t < b.CATCH + 2 * F;
  const card1At = b.GOOD + 0.09;
  // La crème solaire : elle part de derrière la carte 1 et vient se poser sous le panneau sur un RESSORT.
  const fan = ressort(t, b.C2, { damping: 11, stiffness: 170, mass: 0.7 });
  const c2From = { x: CAP.cx - CARD2.w / 2, y: CARD.top + CARD.h / 2 - CARD2.h / 2 - 40 };
  const c2x = lerp(c2From.x, CARD2.left, fan);
  const c2y = lerp(c2From.y, CARD2.top, fan) + 220 * push;
  const cardH = lerp(CARD.h, CARD_H_END, push);
  const card1 = tween(t, card1At, 0.36, 0, 1, POP);
  return (
    <AbsoluteFill>
      {/* Lointain : la caisse floue, les halos, la grille. */}
      <AbsoluteFill style={{ background: INK }} />
      <Camera t={t} {...cam} depth={0.3}>
        <Halos t={t} intensity={1} seed="S6-halos" />
        <CashWindow t={t} fade={1 - 0.85 * push} />
      </Camera>
      <DotGrid t={t} opacity={0.08} wave={{ at: b.GOOD, x: 1200, y: 480, speed: 1800, strength: 0.6 }} />
      <Camera t={t} {...cam} depth={0.6}>
        <Dust t={t} count={36} seed="S6-dust" color={PB.mint2} alpha={0.22} />
      </Camera>

      {/* Le monde. */}
      <Camera t={t} {...cam}>
        <Camera t={t} zoom={settle * (1 + 0.035 * tension)} origin={[CAP.cx - 120 * tension, CAP_Y + 200 * tension]} drift={0}>
          <Radar t={t} b={b} exitX={exitX} />
          <Chrono t={t} b={b} />
          <Ring t={t} at={b.GOOD} x={CHRONO.x} y={CHRONO.y} max={1300} color={PB.mint2} width={5} life={0.6} />
          <Burst t={t} at={card1At + 0.04} x={CAP.cx} y={CARD.top + CARD.h / 2} count={26} radius={640} seed="S6-card" colors={[PB.mint, PB.mint2, "#FFFFFF"]} size={11} life={0.6} />
          <Capsule t={t} b={b} track={track} push={push}>
            <Chip t={t} b={b} host={host} fade={1} />
          </Capsule>

          {/* Les cartes : la carte 1 dans le panneau, la crème solaire (derrière elle) qui sort sous le panneau. */}
          {t >= b.C2 && (
            <CompactCard
              t={t}
              a={SOLAIRE}
              at={b.C2}
              style={{
                left: c2x,
                top: c2y,
                opacity: clamp01(fan * 3) * (1 - clamp01(push * 1.8)),
                transformOrigin: "50% 50%",
                transform: `rotate(${(CARD2.rot * fan + 4 * push).toFixed(2)}deg) scale(${lerp(0.82, 1, Math.min(1.04, fan)).toFixed(3)})`,
                boxShadow: `0 26px 60px rgba(0,0,0,.5), 0 0 0 ${(3 * pulse(t, b.C2_LAND, 0.05, 0, 0.45)).toFixed(2)}px ${PB.mint2}, 0 0 ${(50 * pulse(t, b.C2_LAND, 0.05, 0, 0.45)).toFixed(1)}px ${rgba(PB.mint, 0.6)}`,
              }}
            />
          )}
          {t >= card1At && (
            <AdviceCard
              t={t}
              a={ULTRA}
              at={card1At}
              h={cardH}
              typeFrom={b.TYPE0}
              style={{
                left: CARD.left,
                top: CARD.top,
                opacity: 1,
                transformOrigin: "50% 30%",
                transform: `translateY(${((1 - Math.min(1, card1)) * 26).toFixed(1)}px) scale(${lerp(0.86, 1, card1).toFixed(4)})`,
                boxShadow: `0 30px 80px rgba(0,0,0,.45), 0 0 0 ${(3 * pulse(t, card1At + 0.1, 0.05, 0, 0.5)).toFixed(2)}px ${PB.mint2}, 0 0 ${(60 * pulse(t, card1At + 0.1, 0.05, 0, 0.5)).toFixed(1)}px ${rgba(PB.mint, 0.6)}`,
              }}
            />
          )}

          {/* Le robot hôte et son socle. */}
          <Pedestal t={t} b={b} exitX={exitX} />
          {host && (
            <MotionBlur on={t > b.R0 && t < b.R1 + 2 * F} samples={6}>
              {(tt) => {
                const hp = hostPose(tt, b);
                return hp ? <Host t={tt} track={track} pose={hp} exitX={-760 * prog(tt, b.PUSH0, b.PUSH1 - b.PUSH0, IN_OUT)} /> : null;
              }}
            </MotionBlur>
          )}

          {/* La boîte : montée, scan, lancer (flou + fantômes), réception, compression. */}
          {box && (
            <MotionBlur on={flying} samples={8}>
              {(tt) => {
                const hp = hostPose(tt, b);
                const bs = boxAt(tt, b, hp);
                if (!bs) return null;
                const ghosts: ReactNode[] = [];
                if (tt > b.THROW && tt < b.CATCH + 3 * F) {
                  for (let i = 1; i <= 6; i++) {
                    const g = boxAt(tt - i * 1.6 * F, b, hostPose(tt - i * 1.6 * F, b));
                    if (g && tt - i * 1.6 * F > b.THROW) ghosts.push(<BoxGhost key={i} x={g.x} y={g.y} s={g.s} rz={g.rz} o={[0.28, 0.2, 0.14, 0.1, 0.06, 0.04][i - 1]} />);
                  }
                }
                return (
                  <>
                    {ghosts}
                    <Box3D x={bs.x} y={bs.y} s={bs.s} rz={bs.rz} ry={bs.ry} rx={bs.rx} sx={bs.sx} sy={bs.sy} opacity={bs.o}>
                      <ScanOverlay t={tt} b={b} />
                    </Box3D>
                  </>
                );
              }}
            </MotionBlur>
          )}
          <ReadLabel t={t} b={b} />
          <Reticle t={t} b={b} />

          {/* Particules. */}
          <Ring t={t} at={b.R0 + 2 * F} x={AVATAR.x} y={AVATAR.y} max={360} color={PB.mint2} width={3} life={0.45} />
          <Ring t={t} at={b.R1} x={HOST.x} y={HOST.feet} max={520} color={PB.mint} width={3} life={0.5} echo={false} />
          <Sparks t={t} at={b.L0 + 2 * F} x={BOX.x + 80} y={BOX.y + 50} count={20} seed="S6-laser" speed={700} spread={180} angle={-90} color={PB.mint2} len={18} life={0.4} width={2} />
          <Ring t={t} at={b.K0 + 7 * F} x={BOX.x + 82} y={BOX.y + 54} max={260} color={PB.mint2} width={3} life={0.35} echo={false} />
          {host && <CatchFx t={t} b={b} host={host} />}
          <Burst t={t} at={b.DOCK} x={CHIP_SLOT.x} y={CHIP_SLOT.y} count={14} radius={170} seed="S6-dock" colors={[PB.mint, PB.mint2, "#FFFFFF"]} size={9} life={0.45} />
          <Sparks t={t} at={b.GOOD + 0.42} x={HOST.x} y={HOST.feet - 10} count={16} seed="S6-hop" speed={650} spread={70} angle={-90} color={PB.mint2} len={16} life={0.4} width={2} />
          <Sparks t={t} at={b.C2_LAND} x={CARD2.left + 74} y={CARD2.top + CARD2.h / 2} count={14} seed="S6-c2" speed={560} spread={120} angle={-120} color={PB.mint2} len={14} life={0.38} width={2} />
        </Camera>
      </Camera>
    </AbsoluteFill>
  );
}

function CatchFx({ t, b, host }: { t: number; b: Beats; host: HostPose }) {
  const tb = tabletAt(host);
  return (
    <>
      <Ring t={t} at={b.CATCH} x={tb.x} y={tb.y} max={300} color={PB.mint2} width={4} life={0.4} echo={false} />
      <Sparks t={t} at={b.CATCH} x={tb.x} y={tb.y} count={14} seed="S6-catch" speed={600} spread={100} angle={-90} color="#FFFFFF" len={14} life={0.35} width={2} />
      <Burst t={t} at={b.SQZ + 3 * F} x={tb.x} y={tb.y} count={10} radius={130} seed="S6-sqz" colors={[PB.mint2, "#FFFFFF"]} size={8} life={0.35} />
    </>
  );
}

export function Scene06({ t, time }: SceneProps) {
  const b = beats(time);
  const track = hostTrack(b);
  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      <MotionBlur on={t > b.PUSH0 && t < b.PUSH1 + F} samples={10}>
        {(tt) => <World t={tt} b={b} track={track} />}
      </MotionBlur>
    </AbsoluteFill>
  );
}

/** Les effets sonores de la scène (secondes du film). */
export const cues: SceneCues = (time) => {
  const b = beats(time);
  return [
    cue("robot_boing", b.R0 + 0.02, 0.5),
    cue("robot_boing", b.R1, 0.35, 1.25),
    cue("scan_laser", b.L0, 0.6),
    cue("hud_lock", b.K0 + 7 * F, 0.6),
    cue("whoosh_fast", b.THROW, 0.5),
    cue("catch_whoomp", b.CATCH, 0.6),
    cue("whoosh_fast", b.CHIP, 0.4, 1.3),
    cue("ui_pop", b.DOCK, 0.4),
    cue("data_processing", b.T0, 0.45),
    ...b.CHECKS.map((c) => cue("ui_click", c, 0.3, 1.4)),
    // Le tintement tombe dans la pause avant « le bon conseil » ; son de la famille LIGHT (× 0,6 sous la voix) : gain 0,3,
    // soit le niveau d'un son ordinaire à 0,45 (× 0,4) — il ne couvre plus la promesse.
    cue("ui_ding", b.GOOD, 0.3),
    cue("card_unfold", b.GOOD + 0.02, 0.6),
    cue("whoosh_fast", b.GOOD + 0.1, 0.35, 0.9),
    cue("robot_boing", b.GOOD + 0.42, 0.3, 1.4),
    cue("whoosh_fast", b.C2, 0.25, 1.15),
    cue("ui_pop", b.C2_LAND, 0.32, 0.9),
    cue("whoosh_heavy", b.PUSH0, 0.4),
  ];
};
