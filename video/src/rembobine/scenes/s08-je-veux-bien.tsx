import type { CSSProperties } from "react";
import { AbsoluteFill, Easing } from "remotion";
import {
  BANNER_CARD,
  Confetti,
  Cursor,
  JAKARTA,
  MedBox,
  Ordonnance,
  PB,
  Patient,
  Pharmacienne,
  Pharmacy,
  Ring,
  SCREEN_UI,
  SET,
  Sparkle,
  Sparks,
  Bubble,
  clamp01,
  cue,
  keys,
  lerp,
  prog,
  patientPose,
  pulse,
  ressort,
  rgba,
  shake,
  wobble,
  EXIT,
  F,
  IN_OUT,
  LINEAR,
  POP,
  SNAP,
  WHIP,
  type Cue,
  type MedKind,
} from "../kit";
import { Mention } from "../../presentation/motion/kit/mention";
import { CardWorld, screenMap } from "./s07-les-mots";

/* ==========================================================================
 * S8 · JE VEUX BIEN (35,3 → 45,3) — D3 « Avec votre antibiotique, je vous conseille un probiotique. » (la pharmacienne),
 * D4 « Ah oui, je veux bien ! » (le patient), N7 « Le pharmacien décide. Le patient repart mieux conseillé. »
 *
 * LE MIROIR DE S1 : le même comptoir, en couleurs PharmaBoost.
 *   35,3 → 35,8   ENTRÉE : S7 se réduit dans l'écran du comptoir pendant que le comptoir dézoome (screenMap, partagé).
 *   D3            la caméra s'approche de la pharmacienne (souriante) ; « antibiotique » : la boîte d'Amoxicilline
 *                 sautille ; « je vous conseille » : sa bulle ; « probiotique » : elle POSE la boîte (37,6).
 *   D4            contrechamp sur le patient, qui sourit : « Ah oui, je veux bien ! » (la même place que « Non merci. »).
 *   40,0 VENDU    la caméra claque en plan large, tampon « VENDU ! » citron sur le comptoir vert, éclaboussures,
 *                 canons à confettis, « +1 conseil vendu » qui monte de l'écran, secousse ; clin d'œil de la pharmacienne.
 *   « Le pharmacien décide »   on plonge dans l'écran du comptoir : gros plan sur la carte, le pointeur (sa main) clique
 *                 « Vendu », la ligne « ✓ Vendu » se trace ; l'étiquette « Le pharmacien décide. » (« décide » sur le mot).
 *   « Le patient repart mieux conseillé »   retour au comptoir : les DEUX boîtes sautent dans le sac, il le prend, se
 *                 retourne et sort ; le sac passe en radio (miroir de S2) : deux boîtes, ✓ Probiotique ; signe de la main,
 *                 carillon joyeux (rate 1,06).
 *   44,8 → 45,3   SORTIE : une bande citron balaie le cadre (S9 apparaît derrière elle).
 * Mention « Illustration · exemples » en encre sombre (fond clair).
 * ======================================================================== */

const NB = " ";

/** Les temps (secondes du film), calés sur mots.json (D3, D4, N7). */
const T = {
  in: 35.3,
  inEnd: 35.8,
  antibio: 36.01,
  je: 36.8,
  place: 37.0, // la main monte avec la boîte (posée à place + 0,8 × 0,78 ≈ 37,62, sur « probiotique »)
  placeDur: 0.78,
  d3Out: 38.36,
  ah: 38.79,
  vendu: 40.0,
  diveIn: 40.46,
  diveInDur: 0.26,
  click: 40.8, // « pharmacien »
  decide: 41.36,
  diveOut: 41.95,
  diveOutDur: 0.3,
  hop1: 42.26,
  hop2: 42.4,
  hopDur: 0.2,
  grab: 42.6,
  grabDur: 0.42,
  leave: 43.0,
  leaveDur: 1.66,
  xray: 43.5, // « mieux »
  chime: 44.3,
  wave: 43.86,
  wipe: 44.8,
  end: 45.3,
} as const;

/* ------------------------------------------------------------------ la caméra du comptoir */

type Cam = { z: number; fx: number; fy: number; sx: number; sy: number };

function camAt(t: number): Cam {
  const z = keys(t, [
    [T.inEnd, 1],
    [36.7, 1.1, IN_OUT],
    [38.3, 1.2, LINEAR],
    [38.78, 1.16, IN_OUT],
    [39.98, 1.2, LINEAR],
    [40.14, 1.0, SNAP],
    [42.4, 1.0],
    [44.7, 1.1, IN_OUT],
  ]);
  let fx = keys(t, [
    [T.inEnd, 960],
    [36.7, 890, IN_OUT],
    [38.3, 830, LINEAR],
    [38.78, 1130, IN_OUT],
    [39.98, 1150, LINEAR],
    [40.14, 960, SNAP],
    [42.4, 960],
    [44.7, 1180, IN_OUT],
  ]);
  let fy = keys(t, [
    [T.inEnd, 540],
    [36.7, 500, IN_OUT],
    [38.3, 452, LINEAR],
    [38.78, 452, IN_OUT],
    [39.98, 446, LINEAR],
    [40.14, 540, SNAP],
    [42.4, 540],
    [44.7, 520, IN_OUT],
  ]);
  // Le comptoir couvre toujours le cadre.
  const hx = 960 / z;
  const hy = 540 / z;
  fx = Math.min(1920 - hx, Math.max(hx, fx));
  fy = Math.min(1080 - hy, Math.max(hy, fy));
  // Dérive vivante, nulle aux raccords (35,8 · 40,46 · 42,25) pour que les plongées dans l'écran tombent juste.
  const live = Math.min(prog(t, T.inEnd, 0.6, IN_OUT), 1 - prog(t, 40.05, 0.3, IN_OUT)) + Math.min(prog(t, 42.3, 0.6, IN_OUT), 1);
  let sx = wobble(t, 81, 5, 0.5) * live;
  let sy = wobble(t, 82, 3.5, 0.5) * live;
  const v = shake(t, T.vendu, 18, 16);
  const b = shake(t, 37.63, 3, 10);
  sx += v.x + b.x;
  sy += v.y + b.y;
  return { z, fx, fy, sx, sy };
}
const camTransform = (c: Cam) => `translate(${960 + c.sx}px, ${540 + c.sy}px) scale(${c.z}) translate(${-c.fx}px, ${-c.fy}px)`;

/** La plongée dans l'écran : k = 1 plan large … 0 l'écran plein cadre (null hors des plongées). */
function diveK(t: number): number | null {
  if (t < T.inEnd) return prog(t, T.in, T.inEnd - T.in, WHIP);
  if (t >= T.diveIn && t < T.diveOut + T.diveOutDur) {
    if (t < T.diveOut) return 1 - prog(t, T.diveIn, T.diveInDur, WHIP);
    return prog(t, T.diveOut, T.diveOutDur, WHIP);
  }
  return null;
}

/* ------------------------------------------------------------------ le gros plan : la carte, « Vendu » */

/** Le centre du bouton « Vendu » dans le cadre de CardWorld (carte au repos, caméra de S7 à 1,045 autour de 760, 520). */
const VENDU = (() => {
  const s = 0.92;
  const wx = 606 + (BANNER_CARD.vendu.x - BANNER_CARD.W / 2) * s;
  const wy = 504 + (BANNER_CARD.vendu.y - BANNER_CARD.H / 2) * s;
  return { x: 760 + (wx - 760) * 1.045, y: 520 + (wy - 520) * 1.045 };
})();
const INSERT = { z: 1.6, x: 830, y: 640 } as const;

function insertZoom(t: number) {
  return keys(t, [
    [40.5, 1],
    [40.86, INSERT.z, SNAP],
    [41.8, INSERT.z + 0.08, LINEAR],
    [42.18, 1, IN_OUT],
  ]);
}

/** L'étiquette « Le pharmacien décide. » (cadre 1920 × 1080 du gros plan). */
function DecideTag({ t }: { t: number }) {
  if (t < 40.72 || t > 42.3) return null;
  const pop = ressort(t, 40.74, { damping: 12, stiffness: 260, mass: 0.6 });
  const out = prog(t, 41.86, 0.2, EXIT);
  const w1 = prog(t, 40.78, 0.34, SNAP);
  const w2 = prog(t, T.decide - 0.02, 0.3, POP);
  const hit = pulse(t, T.decide, 0.04, 0.08, 0.35);
  const word: CSSProperties = { display: "inline-block", fontFamily: JAKARTA, fontWeight: 800, fontSize: 70, letterSpacing: "-0.035em", lineHeight: 1, color: PB.green, whiteSpace: "nowrap" };
  return (
    <div style={{ position: "absolute", left: INSERT.x, top: 430, width: 0, height: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(-50%, -50%) scale(${Math.max(0, pop) * (1 - 0.2 * out) * (1 + 0.04 * hit)}) rotate(${(1 - clamp01(pop)) * -6 - 2}deg)`,
          opacity: clamp01(pop * 3) * (1 - out),
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 22, padding: "22px 40px 26px", borderRadius: 999, background: PB.citron, boxShadow: `0 0 0 4px ${PB.green}, 0 24px 60px -16px rgba(0,0,0,.55), 0 0 ${40 + 40 * hit}px ${rgba(PB.citron, 0.6)}` }}>
          <span style={{ display: "inline-block", overflow: "hidden", padding: "0 0 6px" }}>
            <span style={{ ...word, transform: `translateY(${(1 - w1) * 110}%)` }}>Le pharmacien</span>
          </span>
          <span style={{ ...word, transform: `scale(${w2})`, opacity: clamp01(w2 * 3), textDecoration: "underline", textDecorationThickness: 7, textUnderlineOffset: 10, textDecorationColor: PB.brand }}>décide.</span>
          {/* la pointe, vers le bouton */}
          <svg width={60} height={34} viewBox="0 0 60 34" style={{ position: "absolute", left: "50%", bottom: -30, marginLeft: -30, overflow: "visible" }}>
            <path d="M4,0 L30,30 L56,0 Z" fill={PB.citron} stroke={PB.green} strokeWidth={4} strokeLinejoin="round" />
            <rect x={0} y={-6} width={60} height={8} fill={PB.citron} />
          </svg>
        </div>
      </div>
      <Sparkle t={t} at={T.decide + 0.04} x={300} y={-46} size={78} color="#FFFFFF" />
    </div>
  );
}

/** Le projecteur sur « Vendu » : le reste de la carte s'assombrit (l'étiquette se pose dans l'ombre). */
function Spotlight({ t }: { t: number }) {
  const o = Math.min(prog(t, 40.62, 0.3, SNAP), 1 - prog(t, 41.82, 0.25, IN_OUT));
  if (o <= 0) return null;
  const r = 1 + 0.03 * Math.sin((t - 40.6) * 4);
  return <AbsoluteFill style={{ pointerEvents: "none", opacity: o, background: `radial-gradient(ellipse ${640 * r}px ${190 * r}px at ${INSERT.x}px ${INSERT.y}px, transparent 0%, transparent 66%, ${rgba(PB.green, 0.56)} 100%)` }} />;
}

/** Le gros plan (cadre 1920 × 1080) : la carte de S7, zoomée sur « Vendu », le pointeur, l'étiquette. C'est aussi ce que
 *  montre l'écran du comptoir : la plongée est exacte dans les deux sens. */
function InsertView({ t }: { t: number }) {
  const zi = insertZoom(t);
  const u = clamp01((zi - 1) / (INSERT.z - 1));
  const px = lerp(VENDU.x, INSERT.x, u);
  const py = lerp(VENDU.y, INSERT.y, u);
  const curK = prog(t, 40.5, 0.28, WHIP);
  const cx = lerp(VENDU.x + 520, VENDU.x + 34, curK) + wobble(t, 91, 3, 1.1) * prog(t, 40.9, 0.4, IN_OUT);
  const cy = lerp(VENDU.y + 260, VENDU.y + 14, curK) - Math.sin(Math.PI * curK) * 60;
  const curO = clamp01((t - 40.5) / 0.06) * (1 - prog(t, 41.8, 0.2, LINEAR));
  return (
    <AbsoluteFill style={{ background: SCREEN_UI.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${px}px, ${py}px) scale(${zi}) translate(${-VENDU.x}px, ${-VENDU.y}px)` }}>
        <CardWorld t={t} sold={T.click} />
        <Ring t={t} at={T.click + 0.02} x={VENDU.x} y={VENDU.y} max={300} color={PB.citron} width={6} life={0.45} />
        <Sparks t={t} at={T.click + 0.03} x={VENDU.x} y={VENDU.y} count={16} speed={620} spread={180} color={PB.brand} len={18} life={0.38} seed="s8clic" />
        {t >= 40.5 && t < 42.0 && <Cursor t={t} x={cx} y={cy} clickAt={T.click} opacity={curO} size={1.1} />}
      </AbsoluteFill>
      <Spotlight t={t} />
      <DecideTag t={t} />
    </AbsoluteFill>
  );
}

/** Ce que montre l'écran du comptoir (cadre virtuel 1600 × 1000) : le gros plan, en 16:9, au milieu. */
function ScreenView({ t }: { t: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: SCREEN_UI.paper, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 50, width: 1920, height: 1080, transform: `scale(${1600 / 1920})`, transformOrigin: "0 0" }}>
        <InsertView t={t} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ VENDU ! */

const STAMP = { cx: 676, cy: 724, rot: -6, w: 760, h: 250 } as const;
const STAMP_EASE = Easing.bezier(0.2, 0, 0.2, 1);
const LAND = T.vendu + F;

function Stamp({ t }: { t: number }) {
  const V = T.vendu - 4 * F;
  if (t < V - 4 * F || t > 40.5) return null;
  const incoming = clamp01((t - (V - 4 * F)) / (4 * F));
  const slam = prog(t, V, 5 * F, STAMP_EASE);
  const settle = keys(t, [
    [LAND, 1],
    [LAND + 2 * F, 0.965],
    [LAND + 8 * F, 1, POP],
  ]);
  const out = prog(t, 40.38, 6 * F, IN_OUT);
  const scale = (t < V ? 1.7 : lerp(1.7, 1, slam)) * settle * (1 + 0.1 * out);
  const op = (t < V ? 0 : clamp01((t - V) / (2 * F))) * (1 - out);
  const sweep = clamp01((t - LAND) / 0.4);
  const sh = shake(t, T.vendu, 10, 14);
  const shadowScale = t < V ? lerp(1.45, 1.12, incoming) : lerp(1.12, 1.02, slam);
  const shadowOp = (t < V ? 0.4 * incoming : lerp(0.4, 0.28, slam)) * (1 - out);
  return (
    <div style={{ position: "absolute", left: STAMP.cx + sh.x, top: STAMP.cy + sh.y, width: 0, height: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: -STAMP.w / 2, top: -STAMP.h / 2 + 22, width: STAMP.w, height: STAMP.h, borderRadius: 44, background: "rgba(0,0,0,.85)", filter: "blur(26px)", opacity: shadowOp, transform: `rotate(${STAMP.rot}deg) scale(${shadowScale})` }} />
      <div style={{ position: "absolute", left: -STAMP.w / 2, top: -STAMP.h / 2, width: STAMP.w, height: STAMP.h, opacity: op, transform: `rotate(${STAMP.rot + 1.5 * (1 - slam)}deg) scale(${scale})`, filter: `${out > 0 ? `blur(${(6 * out).toFixed(2)}px) ` : ""}drop-shadow(0 0 22px ${rgba(PB.citron, 0.55)})` }}>
        <svg width={STAMP.w} height={STAMP.h} viewBox={`0 0 ${STAMP.w} ${STAMP.h}`} style={{ overflow: "visible" }}>
          <defs>
            <filter id="s8-encre" x="-4%" y="-8%" width="108%" height="116%">
              <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves={2} seed={4} result="warp" />
              <feDisplacementMap in="SourceGraphic" in2="warp" scale={6} xChannelSelector="R" yChannelSelector="G" result="rough" />
              <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves={3} seed={9} result="grain" />
              <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -16 0 0 0 13.4" result="holes" />
              <feComposite in="rough" in2="holes" operator="in" />
            </filter>
          </defs>
          <rect x={14} y={14} width={STAMP.w - 28} height={STAMP.h - 28} rx={40} fill={PB.citron} />
          <g filter="url(#s8-encre)">
            <rect x={14} y={14} width={STAMP.w - 28} height={STAMP.h - 28} rx={40} fill="none" stroke={PB.green} strokeWidth={10} />
            <rect x={32} y={32} width={STAMP.w - 64} height={STAMP.h - 64} rx={26} fill="none" stroke={PB.green} strokeWidth={3} opacity={0.75} />
            <text x={STAMP.w / 2} y={STAMP.h / 2 + 64} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={178} letterSpacing={-6} fill={PB.green}>
              {`VENDU${NB}!`}
            </text>
          </g>
        </svg>
        <div style={{ position: "absolute", inset: 14, borderRadius: 40, overflow: "hidden", mixBlendMode: "soft-light" }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, transparent ${sweep * 150 - 30}%, rgba(255,255,255,.9) ${sweep * 150 - 18}%, transparent ${sweep * 150 - 6}%)` }} />
        </div>
      </div>
      <Splatter t={t} out={out} />
    </div>
  );
}

function Splatter({ t, out }: { t: number; out: number }) {
  if (t < LAND - F) return null;
  const k = prog(t, LAND - F, 10 * F, SNAP);
  const rot = (STAMP.rot * Math.PI) / 180;
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const ang = (i / 14) * Math.PI * 2 + (((i * 7919) % 100) / 100) * 0.35;
        const ex = Math.cos(ang) * (STAMP.w / 2 - 30);
        const ey = Math.sin(ang) * (STAMP.h / 2 - 20);
        const dist = (70 + 130 * (((i * 104729) % 97) / 97)) * k;
        const lx = ex + Math.cos(ang) * dist;
        const ly = ey + Math.sin(ang) * dist;
        const x = lx * Math.cos(rot) - ly * Math.sin(rot);
        const y = lx * Math.sin(rot) + ly * Math.cos(rot);
        const r = 4 + 9 * (((i * 31337) % 89) / 89);
        const stretch = 1 + 2.2 * (1 - k);
        return <div key={i} style={{ position: "absolute", left: x - r * stretch, top: y - r, width: 2 * r * stretch, height: 2 * r, borderRadius: 999, background: PB.citron, boxShadow: `0 0 0 2px ${rgba(PB.green, 0.35)}`, transform: `rotate(${(ang + rot) * (180 / Math.PI)}deg)`, opacity: 1 - out }} />;
      })}
    </>
  );
}

/** « +1 conseil vendu », qui monte de l'écran du comptoir. */
function PlusOne({ t }: { t: number }) {
  const at = 40.1;
  if (t < at || t > 40.5) return null;
  const k = ressort(t, at, { damping: 11, stiffness: 240, mass: 0.6 });
  const out = prog(t, 40.36, 0.12, EXIT);
  const y = lerp(SET.screen.y - 70, SET.screen.y - 180, prog(t, at, 0.45, SNAP));
  return (
    <div style={{ position: "absolute", left: SET.screen.x + 20, top: y, transform: `translate(-50%, -50%) scale(${Math.max(0, k) * (1 - 0.3 * out)})`, opacity: 1 - out }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 28px", borderRadius: 999, background: PB.green, boxShadow: `0 0 0 3px ${PB.citron}, 0 0 40px ${rgba(PB.citron, 0.55)}, 0 18px 40px -12px rgba(0,0,0,.5)`, whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 52, color: PB.citron, letterSpacing: "-0.03em" }}>+1</span>
        <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 34, color: "#FFFFFF" }}>conseil vendu</span>
      </div>
    </div>
  );
}

const CONFETTI = [PB.citron, PB.mint, PB.brand, "#FFFFFF", PB.stock, PB.cyan];

/* ------------------------------------------------------------------ le comptoir */

/** Une boîte qui saute du comptoir dans le sac posé (repère du cadre au repos). */
function HopBox({ t, kind, at, from, w0, to }: { t: number; kind: MedKind; at: number; from: { x: number; y: number }; w0: number; to: { x: number; y: number; rot: number } }) {
  if (t < at || t >= at + T.hopDur) return null;
  const k = prog(t, at, T.hopDur, IN_OUT);
  const x = lerp(from.x, to.x, k);
  const y = lerp(from.y, to.y, k) - Math.sin(Math.PI * k) * 120;
  const w = lerp(w0, 65, k);
  return <MedBox kind={kind} x={x} y={y} w={w} side={1 - k} rotate={lerp(0, to.rot, k) + Math.sin(Math.PI * k) * -14} />;
}

/** Le sac du patient en radio, au bout de son bras : l'étiquette « ✓ Probiotique » (miroir de la place vide de S2). */
function XrayTag({ t, leave }: { t: number; leave: number }) {
  if (t < T.xray) return null;
  const pose = patientPose(leave);
  const k = ressort(t, T.xray + 0.06, { damping: 11, stiffness: 260, mass: 0.6 });
  const o = pose.opacity * (1 - prog(t, 44.42, 0.16, LINEAR));
  if (o <= 0) return null;
  // la poignée du sac (main du fond), puis le milieu du sac
  const turn = 1 - 0.16 * Math.sin(Math.PI * clamp01(pose.back));
  const hx = pose.x + pose.scale * turn * (-124 + Math.sin(pose.phase) * 10 * pose.walk);
  const hy = pose.y + pose.scale * (-316 - Math.abs(Math.sin(pose.phase)) * 8 * pose.walk);
  const bx = hx;
  const by = hy + pose.scale * 120;
  return (
    <div style={{ position: "absolute", left: bx - 74 * pose.scale, top: by - 150 * pose.scale, opacity: o }}>
      <div style={{ transform: `translate(-100%, -50%) scale(${Math.max(0, k)})`, transformOrigin: "100% 50%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px 9px 10px", borderRadius: 999, background: PB.citron, boxShadow: `0 0 0 3px ${PB.green}, 0 12px 26px -8px rgba(0,0,0,.4)`, whiteSpace: "nowrap" }}>
          <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 99, alignItems: "center", justifyContent: "center", background: PB.green }}>
            <svg width={20} height={20} viewBox="0 0 26 26">
              <path d="M6 13.5 L11 18.5 L20.5 8" fill="none" stroke={PB.citron} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={24} strokeDashoffset={24 * (1 - prog(t, T.xray + 0.14, 0.2, SNAP))} />
            </svg>
          </span>
          <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 30, color: PB.green, letterSpacing: "-0.02em" }}>Probiotique</span>
        </div>
      </div>
    </div>
  );
}

function Counter({ t }: { t: number }) {
  const place = t < T.hop2 ? prog(t, T.place, T.placeDur, LINEAR) : undefined;
  const leave = prog(t, T.leave, T.leaveDur, LINEAR);
  const grab = t < T.grab ? 0 : prog(t, T.grab, T.grabDur, LINEAR);
  const kinds: MedKind[] = t < T.hop2 + T.hopDur ? ["amoxicilline"] : ["amoxicilline", "probiotique"];
  const door = Math.min(prog(t, 44.1, 0.32, SNAP), 1 - prog(t, 44.72, 0.4, IN_OUT));
  const antiHop = keys(t, [
    [T.antibio, 0],
    [T.antibio + 0.1, -26, SNAP],
    [T.antibio + 0.34, 0, POP],
  ]);
  const antiGlow = pulse(t, T.antibio, 0.08, 0.5, 0.5);
  const box1 = { x: SET.slots.box1.x, y: SET.slots.box1.y };
  const box2 = { x: SET.slots.box2.x, y: SET.slots.box2.y };
  const bag = { x: SET.slots.bag.x, y: SET.slots.bag.y - 182 }; // la poignée du sac posé
  return (
    <Pharmacy t={t} mood="pb" screen="pb" screenPower={1} screenContent={<ScreenView t={t} />} screenTilt={diveTilt(t)} doorOpen={door} chimeAt={T.chime}>
      <Pharmacienne t={t} mood="pb" expression="sourire" talk={[[35.49, 38.29]]} place={place} placeKind="probiotique" wink={40.16} />
      <Ordonnance x={SET.slots.rx.x} y={SET.slots.rx.y} w={150} flat={1} rotate={-8} />
      {antiGlow > 0 && <div style={{ position: "absolute", left: box1.x - 110, top: box1.y - 120, width: 220, height: 160, borderRadius: "50%", background: `radial-gradient(ellipse at 50% 55%, ${rgba(PB.citron, 0.85 * antiGlow)} 0%, ${rgba(PB.citron, 0.3 * antiGlow)} 45%, transparent 70%)` }} />}
      {t < T.hop1 && <MedBox kind="amoxicilline" x={box1.x} y={box1.y + antiHop} w={110} />}
      <Ring t={t} at={T.antibio + 0.02} x={box1.x} y={box1.y - 40} max={190} color={PB.brand} width={5} life={0.5} />
      <HopBox t={t} kind="amoxicilline" at={T.hop1} from={box1} w0={110} to={{ x: bag.x - 5.2, y: bag.y + 39 + 16.9, rot: -5 }} />
      <HopBox t={t} kind="probiotique" at={T.hop2} from={box2} w0={106} to={{ x: bag.x + 24.7, y: bag.y + 39 + 19.5, rot: 7 }} />
      <Sparkle t={t} at={37.64} x={box2.x + 50} y={box2.y - 90} size={60} color={PB.citron} />
      <Patient
        t={t}
        mood="pb"
        expression={t < 38.62 ? "neutre" : "sourire"}
        talk={[[38.79, 40.0]]}
        grab={grab}
        leave={leave}
        bagKinds={kinds}
        peek={t >= T.hop1 + T.hopDur}
        bagXray={prog(t, T.xray, 0.3, SNAP) * 0.85}
        wave={T.wave}
      />
      <XrayTag t={t} leave={leave} />
      <Bubble t={t} at={T.je} exitAt={T.d3Out} text={<>Je vous conseille<br />un probiotique.</>} side="right" mood="pb" x={SET.pharmacienne.bubble.x} y={SET.pharmacienne.bubble.y + 6} size={44} />
      <Bubble t={t} at={T.ah} exitAt={39.97} text={<>Ah oui,<br />{`je veux bien${NB}!`}</>} side="left" mood="pb" x={SET.patient.bubble.x} y={SET.patient.bubble.y + 8} size={50} />
    </Pharmacy>
  );
}

function diveTilt(t: number) {
  const k = diveK(t);
  return k === null ? undefined : screenMap(k).tilt;
}

/* ------------------------------------------------------------------ la scène */

/** La sortie : une bande citron balaie de gauche à droite ; derrière elle, S9. Renvoie le découpage et la bande. */
function wipeEdges(t: number) {
  const lead = lerp(-420, 2440, prog(t, T.wipe, 0.3, IN_OUT));
  const trail = lerp(-420, 2440, prog(t, T.wipe + 0.07, 0.34, IN_OUT));
  return { lead, trail, slant: 210 };
}

export function Scene({ t }: { t: number }) {
  const k = diveK(t);
  const world = k === null ? camTransform(camAt(t)) : screenMap(k).world;
  const overlay = t >= T.diveIn && t < T.diveOut + T.diveOutDur && k !== null;
  const ov = overlay ? screenMap(k) : null;
  const kk = k ?? 1;
  const ovBlur = overlay ? Math.sin(Math.PI * kk) * 2.2 : 0;
  const w = t >= T.wipe ? wipeEdges(t) : null;
  const clip = w ? `polygon(${w.trail + w.slant}px 0, 2400px 0, 2400px 1080px, ${w.trail - w.slant}px 1080px)` : undefined;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ clipPath: clip, background: SCREEN_UI.paper }}>
        <AbsoluteFill style={{ transformOrigin: "0 0", transform: world }}>
          <Counter t={t} />
        </AbsoluteFill>
        <PlusOne t={t} />
        <Stamp t={t} />
        {ov && (
          <AbsoluteFill style={{ transformOrigin: "50% 50%", transform: ov.frame, filter: ovBlur > 0.2 ? `blur(${ovBlur.toFixed(2)}px)` : undefined, boxShadow: `0 30px 80px rgba(0,0,0,${0.35 * kk})` }}>
            <InsertView t={t} />
          </AbsoluteFill>
        )}
        <Confetti t={t} at={T.vendu} x={260} y={980} count={56} angle={-62} spread={26} power={2100} colors={CONFETTI} seed="s8cg" life={2.6} />
        <Confetti t={t} at={T.vendu + 0.03} x={1660} y={980} count={56} angle={-118} spread={26} power={2100} colors={CONFETTI} seed="s8cd" life={2.6} />
        <AbsoluteFill style={{ filter: "invert(1)" }}>
          <Mention t={t} from={T.in} to={T.end + 0.2} />
        </AbsoluteFill>
      </AbsoluteFill>
      {w && (
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
          <polygon points={`${w.trail + w.slant},0 ${w.lead + w.slant},0 ${w.lead - w.slant},1080 ${w.trail - w.slant},1080`} fill={PB.citron} />
          <polygon points={`${w.lead + w.slant - 26},0 ${w.lead + w.slant},0 ${w.lead - w.slant},1080 ${w.lead - w.slant - 26},1080`} fill={PB.green} opacity={0.18} />
        </svg>
      )}
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  // D3 — la pharmacienne
  cue("ui-pop", T.antibio + 0.02, 0.28, 0.9),
  cue("bulle", T.je - 0.02, 0.4),
  cue("attrape", T.place + 0.06, 0.3),
  cue("boite-posee", 37.6, 0.55),
  // D4 — le patient
  cue("bulle", T.ah - 0.02, 0.42, 1.1),
  // VENDU !
  cue("tampon-vendu", T.vendu - 0.02, 0.85),
  cue("caisse", T.vendu + 0.03, 0.5),
  cue("canon-confettis", T.vendu, 0.5),
  cue("ui-ding", 40.12, 0.3, 1.1),
  // Le pharmacien décide : plongée dans l'écran, clic sur « Vendu »
  cue("whoosh-pb", T.diveIn - 0.03, 0.42),
  cue("ui-clic", T.click, 0.65),
  cue("ui-pop", T.click + 0.18, 0.4),
  cue("pop-leger", T.decide - 0.04, 0.35),
  cue("whoosh-pb", T.diveOut - 0.02, 0.38, 0.9),
  // Le patient repart mieux conseillé
  cue("attrape", T.hop1 + 0.04, 0.32, 1.05),
  cue("attrape", T.hop2 + 0.04, 0.32, 1.18),
  cue("papier", T.grab + 0.18, 0.3),
  cue("etincelle", T.xray + 0.04, 0.3),
  cue("porte-carillon", T.chime, 0.5, 1.06),
  // Sortie : balayage citron
  cue("whoosh-rapide", T.wipe - 0.04, 0.5),
];
