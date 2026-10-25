import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { Bell } from "lucide-react";
import {
  ABOVE_Z,
  CAMS,
  City,
  FloatTag,
  JAKARTA,
  N,
  PASSANT_COLORS,
  PB,
  PB_SHOP,
  Passant,
  Sparkle,
  anchors,
  camLerp,
  camLook,
  clamp01,
  cue,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  toScreen,
  wobble,
  EXIT,
  IN_OUT,
  POP,
  SNAP,
  type CityCam,
  type Cue,
  type P2,
} from "../kit";
import { BannerHead } from "../../rembobine/kit/screens";

/* ==========================================================================
 * C5 — LE CERCLE (30,4 → 35,85), onglet LE CERCLE. V11 « Alors il revient. Nouveau passage, nouveau conseil. »
 * V12 « C'est un cercle. »
 *
 *  30,4   sous le fondu de C4 : la rue (même cadrage que le fond de C4), le patient revient par le trottoir, une
 *         petite cloche citron au-dessus de lui (la notification de C4) ; la caméra avance vers la porte
 *  31,03  « revient » : il est à la porte, « +1 visite » (flèche de retour) ; il entre (carillon)
 *  31,81  « Nouveau passage » : la bannière du comptoir s'ouvre au-dessus de la pharmacie (« En attente de scan… »)
 *  32,50  bip, éclair dans la vitrine ; 32,64 la nouvelle ligne « Pastilles gorge · pour Paracétamol 1 g · 8 en stock »
 *         glisse, elle s'allume sur « conseil » (32,89) : lisible ≈ 0,8 s
 *  33,30  la caméra recule : la pharmacie au centre ; 33,46 la bannière se replie dans l'étape 1 de l'anneau
 *  33,55  L'IMAGE FORTE : l'anneau citron se dessine (comète), les 4 étapes s'allument tour à tour, il se FERME sur
 *         « cercle » (34,39) : onde, étincelles ; la comète continue, doucement
 *  35,35  sortie : l'anneau s'efface, la caméra rejoint CAMS.both (35,71, d'où part C6), fondu de 35,56 à 35,83
 * Le fond de C4 rejoint camC5(30,4) et dessine aussi RETURNER : le fondu de C4 → C5 ne change rien à la rue.
 * ======================================================================== */

const S0 = 30.4;
const W = { alors: 30.59, revient: 31.03, nouveau: 31.81, passage: 32.15, nouveau2: 32.64, conseil: 32.89, cest: 33.89, cercle: 34.39 };
const BIP = 32.5;
/** La nouvelle ligne glisse sur « nouveau [conseil] » (juste après le bip) et s'allume sur « conseil » : ≈ 0,8 s lisible. */
const LINE_AT = 32.64;
/** La bannière se replie dans l'étape 1 de l'anneau. */
const FOLD = 33.46;
const PULL = 33.3;
const RING_AT = 33.55;
const CLOSE = W.cercle;
const OUT = 35.35;

// ---------------------------------------------------------------- la caméra (partagée avec le fond de C4)

/** Le cadrage où se rejoignent C4 et C5 (proche de CAMS.both : PharmaBoost à gauche, l'autre à droite). */
export const CAM_LINK: CityCam = camLook(PB_SHOP.xc, -3, ABOVE_Z, 1.36, [345, 712]);
const CAM_DOOR: CityCam = camLook(PB_SHOP.xc + 0.6, -3, ABOVE_Z, 1.85, [575, 815]);
const CAM_RING_A: CityCam = camLook(PB_SHOP.xc - 1.1, -5.4, 2.0, 1.2, [574, 1040]);
const CAM_RING_B: CityCam = camLook(PB_SHOP.xc - 1.0, -5.4, 2.0, 1.27, [574, 1046]);
const sine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);

const ringCam = (t: number) => camLerp(CAM_RING_A, CAM_RING_B, clamp01((t - PULL) / (OUT + 0.5 - PULL)));
export function camC5(t: number): CityCam {
  const push = camLerp(CAM_LINK, CAM_DOOR, prog(t, S0, PULL - S0, sine));
  if (t < PULL) return push;
  const ring = camLerp(push, ringCam(t), prog(t, PULL, 0.66, IN_OUT));
  if (t < OUT) return ring;
  return camLerp(ring, CAMS.both, prog(t, OUT, 0.36, IN_OUT));
}

/** Le patient qui revient (aussi dessiné par le fond de C4) : par le trottoir, jusqu'à la porte, et il entre. */
export const RETURNER = { path: [[0.4, -1.0], [-4.7, -1.12], [-5.5, -2.15]] as P2[], start: 29.8, dur: 1.35, color: PASSANT_COLORS[1] };
/** Il ressort, son sac à la main, et repart à droite (mêmes valeurs que LEAVER de c6-a-cote.tsx : il continue dans C6). */
const LEAVER = { path: [[-5.4, -2.15], [-4.6, -1.0], [3.5, -0.9], [22, -0.9]] as P2[], start: 34.5, dur: 5.218, color: PASSANT_COLORS[1] };

/** La position du passant (même marche que le kit : départ et arrêt doux). */
function walkPos(path: P2[], t: number, start: number, dur: number): P2 {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    segs.push(l);
    total += l;
  }
  const raw = clamp01((t - start) / dur);
  const r = Math.min(0.25, 0.35 / dur);
  const v = 1 / (1 - r);
  const k = raw < r ? (0.5 * v * raw * raw) / r : raw < 1 - r ? 0.5 * v * r + v * (raw - r) : 1 - (0.5 * v * (1 - raw) * (1 - raw)) / r;
  let s = k * total;
  for (let i = 0; i < segs.length; i++) {
    if (s <= segs[i] || i === segs.length - 1) {
      const q = segs[i] > 0 ? clamp01(s / segs[i]) : 1;
      return [lerp(path[i][0], path[i + 1][0], q), lerp(path[i][1], path[i + 1][1], q)];
    }
    s -= segs[i];
  }
  return path[0];
}

// ---------------------------------------------------------------- l'anneau

const RC = { x: 540, y: 1018, rx: 345, ry: 300 };
/** La comète accélère un peu vers la fermeture : fraction du tour = 0,55 x + 0,45 x². */
const ease = (x: number) => 0.55 * x + 0.45 * x * x;
const inv = (f: number) => (-0.55 + Math.sqrt(0.3025 + 1.8 * f)) / 0.9;
const STEP_AT = [0, 0.25, 0.5, 0.75].map((f) => RING_AT + inv(f) * (CLOSE - RING_AT));
const ringPt = (phi: number): P2 => [RC.x + RC.rx * Math.cos(phi), RC.y + RC.ry * Math.sin(phi)];
/** L'angle de la comète (rad) : départ en haut (−90°), sens des aiguilles d'une montre ; après la fermeture, un tour lent. */
function cometAngle(t: number) {
  if (t < CLOSE) return -Math.PI / 2 + 2 * Math.PI * ease(clamp01((t - RING_AT) / (CLOSE - RING_AT)));
  return -Math.PI / 2 + 2 * Math.PI * (1 + (t - CLOSE) / 2.6);
}
function arcPath(a0: number, a1: number) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.03));
  let d = "";
  for (let i = 0; i <= n; i++) {
    const [x, y] = ringPt(a0 + ((a1 - a0) * i) / n);
    d += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

// les pictogrammes des étapes (40 × 40, blancs sur le disque vert)
const ICONS: ReactNode[] = [
  // 1. le conseil au comptoir : une bulle, la croix verte
  <g key="1">
    <path d="M7 8 H33 A4 4 0 0 1 37 12 V26 A4 4 0 0 1 33 30 H18 L11 36 V30 H7 A4 4 0 0 1 3 26 V12 A4 4 0 0 1 7 8 Z" fill="#FFFFFF" />
    <path d="M20 13 V25 M14 19 H26" stroke={PB.cross} strokeWidth={4} strokeLinecap="round" />
  </g>,
  // 2. le vrai complément : le sac de la pharmacie
  <g key="2">
    <path d="M14 13 C14 6 26 6 26 13" fill="none" stroke="#DCE8E4" strokeWidth={2.6} />
    <path d="M7 13 H33 L31 36 H9 Z" fill="#FFFFFF" />
    <path d="M20 19 V31 M14 25 H26" stroke={PB.cross} strokeWidth={3.4} strokeLinecap="round" />
  </g>,
  // 3. le bilan et les offres : le téléphone, un cœur
  <g key="3">
    <rect x={10} y={3} width={20} height={34} rx={4.5} fill="#FFFFFF" />
    <rect x={13} y={8} width={14} height={22} rx={2} fill={PB.green} />
    <path d="M20 26.5 C15.5 23 14 21 14 18.8 C14 17 15.4 15.6 17.1 15.6 C18.3 15.6 19.4 16.3 20 17.3 C20.6 16.3 21.7 15.6 22.9 15.6 C24.6 15.6 26 17 26 18.8 C26 21 24.5 23 20 26.5 Z" fill={PB.citron} />
  </g>,
  // 4. il revient : la flèche de retour
  <g key="4">
    <path d="M30 26 A11 11 0 1 1 27 12.5" fill="none" stroke="#FFFFFF" strokeWidth={4.2} strokeLinecap="round" />
    <path d="M22.5 7.5 L31 10.5 L27.5 18.8 Z" fill="#FFFFFF" />
  </g>,
];
const STEPS: { lines: string[]; phi: number; soon?: boolean }[] = [
  { lines: ["Le conseil", "au comptoir"], phi: -Math.PI / 2 },
  { lines: ["Le vrai", "complément"], phi: 0 },
  { lines: ["Le bilan", "et les offres"], phi: Math.PI / 2, soon: true },
  { lines: ["Il revient"], phi: Math.PI },
];

function StepPill({ t, i }: { t: number; i: number }) {
  const at = STEP_AT[i];
  if (t < at - 0.02) return null;
  const s = STEPS[i];
  const [x, y] = ringPt(s.phi);
  const r = ressort(t, at, { damping: 11, stiffness: 260, mass: 0.55 });
  const lit = pulse(t, at, 0.05, 0.08, 0.6) + 0.8 * pulse(t, CLOSE + 0.04 * i, 0.06, 0.05, 0.6);
  const out = prog(t, OUT, 0.3, IN_OUT);
  const bob = wobble(t, 3 + i, 4, 0.9);
  return (
    <div style={{ position: "absolute", left: x, top: y + bob, width: 0, height: 0, opacity: clamp01(r * 3) * (1 - out) }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(-50%, -50%) scale(${Math.max(0, lerp(0.55, 1, r)) * (1 - 0.08 * out)})`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "9px 20px 9px 9px",
          borderRadius: 22,
          whiteSpace: "nowrap",
          background: "rgba(8,24,21,0.94)",
          border: `2px solid ${rgba(PB.citron, 0.55 + 0.45 * clamp01(lit))}`,
          boxShadow: `0 18px 44px rgba(0,0,0,.55), 0 0 ${20 + 40 * clamp01(lit)}px ${rgba(PB.citron, 0.16 + 0.4 * clamp01(lit))}`,
        }}
      >
        <span style={{ display: "inline-flex", width: 56, height: 56, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 99, background: `radial-gradient(circle at 35% 30%, ${PB.teal}, ${PB.green})`, boxShadow: `inset 0 0 0 2px ${rgba(PB.citron, 0.75)}` }}>
          <svg width={36} height={36} viewBox="0 0 40 40">
            {ICONS[i]}
          </svg>
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {s.lines.map((l, j) => (
            <span key={j} style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 27, lineHeight: 1.06, letterSpacing: "-0.02em", color: N.white }}>
              {l}
            </span>
          ))}
        </span>
        {s.soon && (
          <span style={{ position: "absolute", right: -18, bottom: -23, padding: "5px 11px", borderRadius: 99, background: PB.citron, color: PB.green, fontFamily: JAKARTA, fontWeight: 800, fontSize: 15, letterSpacing: "0.14em", transform: "rotate(-5deg)", boxShadow: `0 0 0 2px ${PB.green}, 0 0 18px ${rgba(PB.citron, 0.5)}` }}>BIENTÔT</span>
        )}
      </div>
    </div>
  );
}

function Ring({ t }: { t: number }) {
  if (t < RING_AT - 0.2) return null;
  const th = cometAngle(t);
  const drawn = Math.min(th, (3 * Math.PI) / 2);
  const track = prog(t, RING_AT - 0.2, 0.35, SNAP);
  const out = prog(t, OUT, 0.28, IN_OUT);
  const closeK = prog(t, CLOSE, 0.75, SNAP);
  const w = 7 + 9 * pulse(t, CLOSE, 0.05, 0.04, 0.5);
  const cometA = t < CLOSE ? 1 : 0.55;
  const tail = Array.from({ length: 16 }, (_, k) => {
    const a = th - k * (t < CLOSE ? 0.045 : 0.035);
    const [x, y] = ringPt(a);
    return { x, y, r: 11 * (1 - k / 17), o: (1 - k / 16) ** 1.6 };
  });
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: 1 - out, transform: `scale(${1 - 0.06 * out})`, transformOrigin: `${RC.x}px ${RC.y}px` }}>
      <defs>
        <radialGradient id="c5-inner" cx={RC.x} cy={RC.y} r={RC.rx} gradientUnits="userSpaceOnUse" gradientTransform={`translate(0 ${RC.y}) scale(1 ${RC.ry / RC.rx}) translate(0 ${-RC.y})`}>
          <stop offset="0%" stopColor={PB.citron} stopOpacity={0} />
          <stop offset="80%" stopColor={PB.citron} stopOpacity={0} />
          <stop offset="100%" stopColor={PB.citron} stopOpacity={0.13} />
        </radialGradient>
      </defs>
      {/* la piste, en pointillés discrets */}
      <ellipse cx={RC.x} cy={RC.y} rx={RC.rx} ry={RC.ry} fill="none" stroke={rgba(N.white, 0.16)} strokeWidth={2} strokeDasharray="3 13" strokeLinecap="round" opacity={track} />
      {/* le halo intérieur, une fois fermé */}
      <ellipse cx={RC.x} cy={RC.y} rx={RC.rx} ry={RC.ry} fill="url(#c5-inner)" opacity={closeK} />
      {/* l'anneau tracé */}
      {t >= RING_AT && (
        <g style={{ filter: `drop-shadow(0 0 10px ${rgba(PB.citron, 0.85)}) drop-shadow(0 0 30px ${rgba(PB.citron, 0.4)})` }}>
          <path d={arcPath(-Math.PI / 2, drawn)} fill="none" stroke={PB.citron} strokeWidth={w} strokeLinecap="round" />
          <path d={arcPath(-Math.PI / 2, drawn)} fill="none" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={2} strokeLinecap="round" />
        </g>
      )}
      {/* l'onde de la fermeture */}
      {closeK > 0 && closeK < 1 && <ellipse cx={RC.x} cy={RC.y} rx={RC.rx * (1 + 0.32 * closeK)} ry={RC.ry * (1 + 0.32 * closeK)} fill="none" stroke={PB.citron} strokeWidth={10 * (1 - closeK) + 1} opacity={0.75 * (1 - closeK)} />}
      {/* la comète */}
      {t >= RING_AT && (
        <g opacity={cometA}>
          {tail.map((p, k) => (
            <circle key={k} cx={p.x} cy={p.y} r={p.r} fill={k < 2 ? "#FFFFFF" : PB.citron} opacity={p.o} />
          ))}
          <circle cx={tail[0].x} cy={tail[0].y} r={14} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 12px ${PB.citron}) drop-shadow(0 0 28px ${rgba(PB.citron, 0.8)})` }} />
        </g>
      )}
      {/* les points des étapes sur la piste, avant qu'elles s'allument */}
      {STEPS.map((s, i) => {
        const [x, y] = ringPt(s.phi);
        return t < STEP_AT[i] ? <circle key={i} cx={x} cy={y} r={7} fill={rgba(N.white, 0.35)} opacity={track} /> : null;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- petits éléments

function ReturnIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" style={{ flex: "none", display: "block" }}>
      <path d="M30 26 A11 11 0 1 1 27 12.5" fill="none" stroke={PB.teal} strokeWidth={4.2} strokeLinecap="round" />
      <path d="M22.5 7.5 L31 10.5 L27.5 18.8 Z" fill={PB.teal} />
    </svg>
  );
}

/** La petite cloche citron au-dessus du patient : la notification l'a fait revenir. */
function BellBubble({ t, x, y }: { t: number; x: number; y: number }) {
  const at = 30.55;
  if (t < at) return null;
  const r = ressort(t, at, { damping: 10, stiffness: 260, mass: 0.5 });
  const o = 1 - prog(t, 30.98, 0.2, EXIT);
  if (o <= 0) return null;
  const ring = ((t - at) % 0.9) / 0.9;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, opacity: clamp01(r * 3) * o }}>
      <div style={{ position: "absolute", left: -27, top: -27, width: 54, height: 54, borderRadius: 99, border: `2px solid ${rgba(PB.citron, 0.6 * (1 - ring))}`, transform: `scale(${1 + ring * 0.8})` }} />
      <div style={{ position: "absolute", left: -24, top: -24, width: 48, height: 48, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", background: PB.citron, boxShadow: `0 0 24px ${rgba(PB.citron, 0.6)}, 0 10px 24px rgba(0,0,0,.45)`, transform: `scale(${Math.max(0, r)}) rotate(${10 * Math.sin((t - at) * 14) * Math.exp(-(t - at) * 3)}deg)` }}>
        <Bell size={26} color={PB.green} strokeWidth={2.6} />
      </div>
    </div>
  );
}

/** « Illustration · exemples » — petit, en bas de la scène utile. */
function Mention({ t, from, to }: { t: number; from: number; to: number }) {
  const o = Math.min(prog(t, from, 0.2, SNAP), 1 - prog(t, to, 0.2, EXIT));
  if (o <= 0) return null;
  return <div style={{ position: "absolute", left: 64, top: 1436, fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, color: "rgba(255,255,255,.55)", opacity: o, textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>Illustration · exemples</div>;
}

// ---------------------------------------------------------------- la scène

export function Scene({ t }: { t: number }) {
  const cam = camC5(t);
  const a = anchors(cam);
  const ringOn = prog(t, PULL + 0.1, 0.5, IN_OUT) * (1 - prog(t, OUT, 0.4, IN_OUT));
  const fadeOut = prog(t, OUT + 0.21, 0.27, IN_OUT);

  // le patient
  const rp = walkPos(RETURNER.path, t, RETURNER.start, RETURNER.dur);
  const head = toScreen(cam, rp[0], rp[1], 2.55);

  // la bannière du comptoir : elle s'ouvre, reçoit la ligne, puis se replie dans l'étape 1
  const bIn = ressort(t, W.nouveau, { damping: 13, stiffness: 200, mass: 0.6 });
  const bOut = prog(t, FOLD, 0.26, IN_OUT);
  const bannerShow = t >= W.nouveau && bOut < 1;
  const bTarget = ringPt(-Math.PI / 2);
  const bx = lerp(548, bTarget[0], bOut);
  const by = lerp(708, bTarget[1], bOut) + wobble(t, 5, 4, 0.8);
  const bScale = 0.92 * lerp(0.82 + 0.18 * Math.max(0, bIn), 0.17, bOut);

  // l'accroche de l'anneau à la pharmacie pendant la sortie
  const hold = (() => {
    if (t <= OUT) return { dx: 0, dy: 0, k: 1, ox: 0, oy: 0 };
    const rc = ringCam(t);
    const [x0, y0] = toScreen(rc, PB_SHOP.xc - 1.1, -5.4, 2.0);
    const [x1, y1] = toScreen(cam, PB_SHOP.xc - 1.1, -5.4, 2.0);
    return { dx: x1 - x0, dy: y1 - y0, k: cam.zoom / rc.zoom, ox: x0, oy: y0 };
  })();

  // le bip : un éclair dans la vitrine
  const bip = pulse(t, BIP, 0.04, 0.03, 0.35);

  return (
    <AbsoluteFill style={{ background: N.sky, opacity: 1 - fadeOut }}>
      <City t={t} cam={cam} lights={1} pbLit={1} coteLit={0.75} queue={1} queueCount={6} dim={0.14 * ringOn}>
        <Passant t={t} path={RETURNER.path} start={RETURNER.start} dur={RETURNER.dur} color={RETURNER.color} seed={9} enter />
        {t >= LEAVER.start && <Passant t={t} path={LEAVER.path} start={LEAVER.start} dur={LEAVER.dur} color={LEAVER.color} seed={9} bag fadeIn />}
      </City>

      {/* l'éclair du bip dans la vitrine */}
      {bip > 0 && (
        <div style={{ position: "absolute", left: a.pbWindow[0] - 150, top: a.pbWindow[1] - 110, width: 300, height: 220, borderRadius: "50%", background: `radial-gradient(ellipse, ${rgba("#FFFFFF", 0.85 * bip)} 0%, ${rgba(PB.citron, 0.45 * bip)} 35%, transparent 70%)`, mixBlendMode: "screen", pointerEvents: "none" }} />
      )}
      {bip > 0 && <div style={{ position: "absolute", left: a.pbWindow[0] - 70 * bip, top: a.pbWindow[1] - 2, width: 140 * bip, height: 4, borderRadius: 2, background: "#FF5A4E", boxShadow: "0 0 14px #FF5A4E", opacity: bip }} />}

      {/* il revient : la cloche, puis « +1 visite » à la porte */}
      <BellBubble t={t} x={head[0]} y={head[1] - 36} />
      {(() => {
        const p = toScreen(cam, PB_SHOP.xc + 0.6, -2.3, 2.1);
        return <FloatTag t={t} at={W.revient - 0.03} out={31.72} x={p[0]} y={p[1]} text="+1 visite" icon={<ReturnIcon />} tone="citron" stem={190} />;
      })()}

      {/* nouveau passage, nouveau conseil : la bannière au-dessus de la pharmacie */}
      {bannerShow && (
        <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, opacity: clamp01(bIn * 2.5) * (1 - prog(t, FOLD + 0.1, 0.16, EXIT)) }}>
          <BannerHead t={t} x={bx} y={by} scale={bScale} lines={[{ n: 1, drug: "Paracétamol 1 g", product: "Pastilles gorge", chips: [{ kind: "stock", text: "8 en stock" }], at: LINE_AT }]} highlight={{ n: 1, at: W.conseil }} />
        </div>
      )}

      {/* l'anneau, la vignette autour, les étapes */}
      {ringOn > 0 && <div style={{ position: "absolute", inset: 0, opacity: ringOn, background: `radial-gradient(ellipse ${RC.rx * 1.45}px ${RC.ry * 1.45}px at ${RC.x}px ${RC.y}px, transparent 62%, ${rgba(N.sky, 0.55)} 100%)` }} />}
      {/* à la sortie, l'anneau reste accroché à la pharmacie qui glisse (il suit la caméra) pendant qu'il s'efface */}
      <div style={{ position: "absolute", inset: 0, transformOrigin: `${hold.ox}px ${hold.oy}px`, transform: `translate(${hold.dx}px, ${hold.dy}px) scale(${hold.k})` }}>
        <Ring t={t} />
        {STEPS.map((_, i) => (
          <StepPill key={i} t={t} i={i} />
        ))}
        {[0, 1, 2, 3].map((i) => {
          const [x, y] = ringPt(STEPS[i].phi);
          return <Sparkle key={i} t={t} at={CLOSE + 0.03 * i} x={x + (i === 1 ? 110 : i === 3 ? -90 : 120)} y={y - 40} size={56} color={PB.citron} />;
        })}
      </div>

      <Mention t={t} from={W.revient - 0.05} to={33.55} />
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("pop-leger", 30.58, 0.22),
  cue("carte-ping", W.revient - 0.02, 0.45),
  cue("porte-carillon", 31.2, 0.3, 1, 1.2),
  cue("carte-depliee", W.nouveau, 0.4),
  cue("scanner-bip", BIP, 0.6),
  cue("ui-ding", W.conseil, 0.45),
  cue("orbite", RING_AT - 0.08, 0.55),
  cue("pop-leger", STEP_AT[1], 0.2),
  cue("pop-leger", STEP_AT[2], 0.2, 1.08),
  cue("pop-leger", STEP_AT[3], 0.2, 1.16),
  cue("scintillement", CLOSE, 0.65),
  cue("etincelle-magique", CLOSE + 0.02, 0.3),
  cue("balayage-court", OUT + 0.02, 0.3),
];
