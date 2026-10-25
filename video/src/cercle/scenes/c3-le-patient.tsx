import { useId } from "react";
import { AbsoluteFill } from "remotion";
import { Lock } from "lucide-react";
import {
  N,
  PB,
  JAKARTA,
  rgba,
  City,
  Passant,
  PASSANT_COLORS,
  PB_SHOP,
  ABOVE_Z,
  STREET,
  windowOf,
  camLook,
  camLerp,
  toScreen,
  anchors,
  groundTransform,
  FloatTag,
  prog,
  keys,
  pulse,
  ressort,
  wobble,
  clamp01,
  lerp,
  SNAP,
  POP,
  EXIT,
  IN_OUT,
  LINEAR,
  Ring,
  Sparkle,
  cue,
  type Cue,
  type CityCam,
  type P2,
  type P3,
} from "../kit";
import { Phone, PHONE_SIZE, Notification, MailBilan } from "../../rembobine/kit/screens";
import { MedBox, PharmacyBag } from "../../rembobine/kit/decor";

/* ==========================================================================
 * C3 — LE PATIENT (18,25 → 25,45), onglet LE PATIENT.
 *
 * On ressort de la vitrine (C2 file dedans et s'efface : même cadrage, net ici) : la rue de nuit, PharmaBoost qui brille.
 *   « Le patient »                 il sort de la pharmacie (pilule menthe, sac à la main : le même que C5), un anneau citron
 *                                  au sol le désigne (18,74) ; « repart » : il longe le trottoir vers le passage piéton,
 *                                  la caméra l'accompagne
 *   « le vrai complément »         une vue « radio » s'ouvre au-dessus de lui, reliée à son sac : DEUX boîtes, l'antibiotique
 *                                  et le Probiotique (les deux noms lisibles) ; le Probiotique s'allume (20,24), étiquette
 *                                  « Le vrai complément » ; « de son traitement » : l'antibiotique s'éclaire (21,04)
 *   « Ça fait pro. »               un sceau « PRO » se pose sur la vue radio (21,80)
 *   « Son bilan conseil l'attend   la vue se referme ; un trait de lumière part de la croix de la pharmacie ; le téléphone
 *     dans son téléphone. »        monte en perspective (écran verrouillé, « lundi 26 octobre » : C4 montre le même
 *                                  téléphone le « lundi 2 novembre »), la notification « Votre bilan conseil » sort de sous
 *                                  l'heure (22,94), un toucher (23,52), l'e-mail du bilan s'ouvre (MailBilan)
 * Sortie (24,95 → 25,45) : le téléphone tombe (comme dans C4, qui le fait remonter avec l'appli), la caméra a rejoint le
 * cadrage du début de C4 (CAM_A) et la scène s'efface sur la même rue.
 * ======================================================================== */

const WIN: P3 = windowOf(PB_SHOP);
/** Le cadrage de sortie de C2 (mêmes valeurs dans c2-le-comptoir.tsx) : C3 commence exactement là, net. */
const CAM_IN = camLook(WIN[0], WIN[1], WIN[2], 2.8, [560, 1000]);
/** Le cadrage du début de C4 (c4-l-appli.tsx, CAM_A) : la sortie y aboutit. */
const CAM_C4 = camLook(PB_SHOP.xc, -3, ABOVE_Z, 1.24, [326, 694]);

const W = { patient: 18.74, repart: 19.16, vrai: 19.99, complement: 20.24, traitement: 21.04, pro: 21.8, son: 22.7, bilan: 22.94, attend: 23.57, telephone: 24.23 };
const OUT = 24.95;

/** Le patient : la même pilule menthe que celui qui revient dans C5 (RETURNER). */
const PATIENT = { path: [[-5.7, -2.75], [-5.45, -1.25], [-0.9, -0.8], [-0.2, 0.7], [-0.05, 6.6]] as P2[], start: 18.6, dur: 6.9, color: PASSANT_COLORS[1] };

/** La marche du kit (vitesse régulière, départ et arrêt doux) — pour suivre le patient. */
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

const BASE: P2 = [-3.4, -1.2];
function camAt(t: number): CityCam {
  const [px, py] = walkPos(PATIENT.path, t, PATIENT.start, PATIENT.dur);
  const f = 0.45;
  const track = camLook(BASE[0] + (px - BASE[0]) * f, BASE[1] + (py - BASE[1]) * f, 0, 1.9, [470, 1130]);
  const c1 = camLerp(CAM_IN, track, IN_OUT(clamp01((t - 18.25) / 1.2)));
  return camLerp(c1, CAM_C4, IN_OUT(clamp01((t - 22.6) / (OUT + 0.5 - 22.6))));
}

// ---- la vue radio (assez grande pour que les deux noms de boîtes se lisent ; le bord haut reste sous y = 580) ----
const LOUPE = { x: 790, y: 812, r: 206 };
const BAG_W = 240;
/** La poignée du sac (le sac entier, poignée comprise, est centré dans la vue). */
const BAG_AT = { x: LOUPE.x, y: LOUPE.y - 158 };
/** Les deux boîtes dans le sac (milieu du bas, largeur) : l'antibiotique en haut à gauche, le Probiotique devant, en bas
 *  à droite — il ne cache que le coin de l'autre, jamais son nom. */
const BOX_A = { x: LOUPE.x - 50, y: LOUPE.y + 34, w: 164, rot: -6 };
const BOX_P = { x: LOUPE.x + 44, y: LOUPE.y + 124, w: 164, rot: 4 };
const XR = "#8FE9FF";

function Loupe({ t, k, from, sweep, hlP, hlA }: { t: number; k: number; from: [number, number]; sweep: number; hlP: number; hlA: number }) {
  const id = `c3l${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (k <= 0.001) return null;
  const { x, y, r } = LOUPE;
  // le bord du cercle du côté du sac
  const dx = from[0] - x;
  const dy = from[1] - y;
  const d = Math.hypot(dx, dy) || 1;
  const ex = x + (dx / d) * r * Math.min(1, k);
  const ey = y + (dy / d) * r * Math.min(1, k);
  const kp = clamp01(k);
  const cx = lerp(from[0], x, kp);
  const cy = lerp(from[1], y, kp);
  const sweepY = y - r + 2 * r * sweep;
  const boxIn = (by: number) => clamp01((sweepY - (by - 70)) / 60);
  const pop = (h: number) => 1 + 0.1 * h;
  return (
    <>
      {/* le fil : du sac au bord de la vue */}
      <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <line x1={from[0]} y1={from[1]} x2={ex} y2={ey} stroke={rgba(PB.citron, 0.75)} strokeWidth={2.5} strokeDasharray="7 7" strokeDashoffset={-t * 30} />
        <circle cx={from[0]} cy={from[1]} r={14 + 3 * Math.sin(t * 5)} fill="none" stroke={PB.citron} strokeWidth={2.5} opacity={0.9 * k} />
        <circle cx={from[0]} cy={from[1]} r={4} fill={PB.citron} opacity={k} />
      </svg>
      <div style={{ position: "absolute", left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, transform: `scale(${k})`, transformOrigin: "50% 50%" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", background: `radial-gradient(circle at 50% 42%, #10323C 0%, #071A20 62%, #04100F 100%)`, boxShadow: `0 0 0 5px ${rgba("#FFFFFF", 0.9)}, 0 0 0 9px ${rgba(PB.citron, 0.55)}, 0 0 60px ${rgba(PB.citron, 0.25)}, 0 30px 70px rgba(0,0,0,.6)` }}>
          <svg width={2 * r} height={2 * r} style={{ position: "absolute", left: 0, top: 0 }}>
            <defs>
              <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={XR} stopOpacity={0} />
                <stop offset="1" stopColor={XR} stopOpacity={0.35} />
              </linearGradient>
            </defs>
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={(i + 1) * ((2 * r) / 10)} x2={2 * r} y2={(i + 1) * ((2 * r) / 10)} stroke={rgba(XR, 0.07)} strokeWidth={1} />
            ))}
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} y1={0} x1={(i + 1) * ((2 * r) / 10)} y2={2 * r} x2={(i + 1) * ((2 * r) / 10)} stroke={rgba(XR, 0.05)} strokeWidth={1} />
            ))}
            {sweep > 0 && sweep < 1 && (
              <>
                <rect x={0} y={sweepY - y + r - 70} width={2 * r} height={70} fill={`url(#${id}s)`} />
                <line x1={0} y1={sweepY - y + r} x2={2 * r} y2={sweepY - y + r} stroke={XR} strokeWidth={2.5} />
              </>
            )}
          </svg>
          {/* le sac, en radio, et les deux boîtes en couleur dedans */}
          <div style={{ position: "absolute", left: -(x - r), top: -(y - r), width: 1080, height: 1920 }}>
            <PharmacyBag x={BAG_AT.x} y={BAG_AT.y + wobble(t, 3, 2, 0.8)} w={BAG_W} boxes={0} xray={1} />
            <div style={{ position: "absolute", inset: 0, opacity: boxIn(BOX_A.y), transformOrigin: `${BOX_A.x}px ${BOX_A.y}px`, transform: `translateY(${wobble(t, 8, 2, 0.9)}px) scale(${pop(hlA)})`, filter: hlA > 0.01 ? `drop-shadow(0 0 ${4 + 18 * hlA}px ${rgba("#FFFFFF", 0.85)})` : undefined }}>
              <MedBox kind="amoxicilline" x={BOX_A.x} y={BOX_A.y} w={BOX_A.w} side={1} t={t} rotate={BOX_A.rot} shadow={false} />
            </div>
            <div style={{ position: "absolute", inset: 0, opacity: boxIn(BOX_P.y), transformOrigin: `${BOX_P.x}px ${BOX_P.y}px`, transform: `translateY(${wobble(t, 12, 2, 0.9)}px) scale(${pop(hlP)})`, filter: hlP > 0.01 ? `drop-shadow(0 0 ${22 * hlP}px ${rgba(PB.citron, 0.95)})` : undefined }}>
              <MedBox kind="probiotique" x={BOX_P.x} y={BOX_P.y} w={BOX_P.w} side={1} t={t} rotate={BOX_P.rot} shadow={false} />
            </div>
          </div>
          {/* un reflet de verre */}
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `linear-gradient(140deg, ${rgba("#FFFFFF", 0.14)} 0%, ${rgba("#FFFFFF", 0)} 38%)` }} />
        </div>
      </div>
    </>
  );
}

/** Le sceau « PRO » : il claque sur la vue radio (il part de 1,7 fois sa taille : il ne mord pas la bande du texte). */
function ProSeal({ t, at, x, y, out }: { t: number; at: number; x: number; y: number; out: number }) {
  if (t < at - 0.12) return null;
  const fall = keys(t, [
    [at - 0.12, 0],
    [at, 1, (u) => u * u],
  ]);
  const settle = t >= at ? 1 + 0.08 * Math.exp(-(t - at) / 0.06) * Math.cos((t - at) * 40) : 1;
  const o = 1 - prog(t, out, 0.25, EXIT);
  if (o <= 0) return null;
  const s = lerp(1.7, 1, fall) * settle * (1 - 0.4 * (1 - o));
  const size = 150;
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, opacity: clamp01(fall * 1.4) * o, transform: `rotate(${-12 + wobble(t, 6, 1.5, 0.8)}deg) scale(${s})` }}>
      <svg width={size} height={size} viewBox="-75 -75 150 150" style={{ overflow: "visible", filter: `drop-shadow(0 10px 22px rgba(0,0,0,.55)) drop-shadow(0 0 18px ${rgba(PB.citron, 0.35)})` }}>
        <circle r={72} fill="#0A1F1B" />
        <circle r={70} fill="none" stroke={PB.citron} strokeWidth={4} />
        <circle r={60} fill="none" stroke={PB.citron} strokeWidth={1.5} strokeDasharray="2 5" opacity={0.85} />
        {/* la coche AU-DESSUS du mot (elle ne le touche pas), le mot, les trois étoiles dessous */}
        <path d="M-14,-35 L-5,-26 L14,-45" fill="none" stroke={PB.cross} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        <text x={0} y={17} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={44} letterSpacing={-1} fill={PB.citron}>
          PRO
        </text>
        {[-1, 1].map((sd) => (
          <path key={sd} d={`M${sd * 32},30 L${sd * 34},35 L${sd * 39},36 L${sd * 35},39 L${sd * 36},44 L${sd * 32},41 L${sd * 28},44 L${sd * 29},39 L${sd * 25},36 L${sd * 30},35 Z`} fill={PB.citron} opacity={0.9} />
        ))}
        <path d="M0,30 L3,36 L9,37 L4.5,41 L6,47 L0,44 L-6,47 L-4.5,41 L-9,37 L-3,36 Z" fill={PB.citron} />
      </svg>
    </div>
  );
}

/** L'écran verrouillé du téléphone (générique : aucune marque), mis en page comme celui de C4 (même téléphone). */
const CLOCK_BOTTOM = 202;
function LockScreen({ t }: { t: number }) {
  const sw = PHONE_SIZE.W - 2 * PHONE_SIZE.bezel;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: sw, height: PHONE_SIZE.H - 2 * PHONE_SIZE.bezel, overflow: "hidden", background: `radial-gradient(120% 70% at 20% 10%, #1D5A4D 0%, ${rgba("#1D5A4D", 0)} 60%), radial-gradient(100% 60% at 90% 95%, #0E6B5D 0%, ${rgba("#0E6B5D", 0)} 55%), linear-gradient(170deg, #0D352E 0%, #061814 70%)` }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 62, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Lock size={20} color="rgba(255,255,255,.85)" strokeWidth={2.4} />
        <div style={{ marginTop: 10, fontFamily: JAKARTA, fontWeight: 700, fontSize: 17, lineHeight: 1.15, letterSpacing: "-0.005em", color: "rgba(255,255,255,.85)" }}>lundi 26 octobre</div>
        <div style={{ marginTop: 2, fontFamily: JAKARTA, fontWeight: 700, fontSize: 86, letterSpacing: "-0.04em", color: rgba("#FFFFFF", 0.94), lineHeight: 1 }}>9:41</div>
      </div>
      <div style={{ position: "absolute", left: "50%", bottom: 62, width: 46, height: 46, marginLeft: -23, borderRadius: 99, background: rgba("#FFFFFF", 0.14), transform: `scale(${1 + 0.02 * Math.sin(t * 2)})` }} />
    </div>
  );
}

/** Le trait de lumière : de la croix de LA pharmacie vers le téléphone (le bilan part de chez elle). */
function Beam({ t, at, dur, from, to }: { t: number; at: number; dur: number; from: [number, number]; to: [number, number] }) {
  const u = (t - at) / dur;
  if (u < 0 || u > 1.3) return null;
  const ctrl: [number, number] = [(from[0] + to[0]) / 2 + 40, Math.min(from[1], to[1]) - 120];
  const pt = (s: number) => {
    const q = SNAP(clamp01(s));
    const a = 1 - q;
    return [a * a * from[0] + 2 * a * q * ctrl[0] + q * q * to[0], a * a * from[1] + 2 * a * q * ctrl[1] + q * q * to[1]];
  };
  const fade = 1 - clamp01((u - 1) / 0.3);
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", mixBlendMode: "screen" }}>
      {Array.from({ length: 10 }, (_, i) => {
        const s = u - i * 0.04;
        if (s < 0) return null;
        const [px, py] = pt(s);
        return <circle key={i} cx={px} cy={py} r={10 - i * 0.9} fill={i === 0 ? "#FFFFFF" : PB.citron} opacity={fade * (1 - i / 10)} />;
      })}
    </svg>
  );
}

const PH = { x: 726, y: 1036, s: 1.04 };
/** La notification : centre (repère de l'écran), un peu plus grande que celle du kit pour se lire dans un Reel. */
const NOTIF = { x: (PHONE_SIZE.W - 2 * PHONE_SIZE.bezel) / 2, y: 292, w: 304, s: 1.1 };

export function Scene({ t }: { t: number }) {
  const cam = camAt(t);
  const a = anchors(cam);
  const [px, py] = walkPos(PATIENT.path, t, PATIENT.start, PATIENT.dur);
  const pz = py < STREET.road[0] || py > STREET.road[1] ? STREET.curb : 0;
  const ground = toScreen(cam, px, py, pz);
  const bag: [number, number] = [ground[0] + 13 * cam.zoom, ground[1] - 20 * cam.zoom];

  // l'anneau qui désigne le patient
  const ringK = ressort(t, W.patient - 0.04, { damping: 11, stiffness: 220, mass: 0.6 }) * (1 - prog(t, 24.4, 0.5, IN_OUT));
  const ringPulse = 0.5 + 0.5 * Math.sin((t - W.patient) * 4.2);

  // la vue radio : le balayage a révélé les DEUX boîtes avant « complément » (20,24)
  const loupeK = keys(t, [
    [W.vrai - 0.1, 0],
    [W.vrai + 0.3, 1, POP],
    [22.38, 1],
    [22.66, 0, EXIT],
  ]);
  const sweep = prog(t, W.vrai - 0.02, 0.24, LINEAR);
  const hlP = prog(t, W.complement - 0.02, 0.22, SNAP);
  const hlA = pulse(t, W.traitement - 0.02, 0.12, 0.55, 0.45);

  // le téléphone (mêmes gestes que C4, qui le fait remonter)
  const up = ressort(t, 22.62, { damping: 15, stiffness: 150, mass: 0.85 });
  const fall = prog(t, OUT - 0.08, 0.42, (u) => u * u);
  const phY = PH.y + (1 - up) * 1100 + fall * 1350;
  const tilt = -13 - (1 - clamp01(up)) * 28 + 3 * Math.sin((t - 23) * 0.7) - fall * 18;
  const pitch = 7 + (1 - clamp01(up)) * 14 + 1.5 * Math.sin((t - 23) * 0.55);
  const rot = 2.5 + (1 - clamp01(up)) * 9 + fall * 16;
  const tap = pulse(t, 23.5, 0.06, 0.04, 0.2);
  const mailK = prog(t, 23.6, 0.5, SNAP);
  const telPop = 1 + 0.03 * pulse(t, W.telephone, 0.1, 0.05, 0.4);

  const dim = lerp(lerp(0, 0.3, prog(t, 22.62, 0.6, IN_OUT)), 0.16, prog(t, OUT, 0.45, IN_OUT));
  const fadeOut = prog(t, OUT + 0.05, 0.42, IN_OUT);
  const sw = PHONE_SIZE.W - 2 * PHONE_SIZE.bezel;
  const sh = PHONE_SIZE.H - 2 * PHONE_SIZE.bezel;

  return (
    <AbsoluteFill style={{ background: N.sky, opacity: 1 - fadeOut }}>
      <City t={t} cam={cam} pbLit={1} queue={1} queueCount={7} coteLit={lerp(1, 0.75, prog(t, 23.0, 2.4, LINEAR))} dim={dim}>
        {ringK > 0.001 && (
          <g transform={groundTransform(pz + 0.01)}>
            <ellipse cx={px} cy={py} rx={0.95 * ringK} ry={0.95 * ringK} fill={rgba(PB.citron, 0.1 + 0.06 * ringPulse)} stroke={PB.citron} strokeWidth={0.07} opacity={0.95} />
            <ellipse cx={px} cy={py} rx={(1.15 + 0.35 * ringPulse) * ringK} ry={(1.15 + 0.35 * ringPulse) * ringK} fill="none" stroke={PB.citron} strokeWidth={0.04} opacity={0.5 * (1 - ringPulse)} />
          </g>
        )}
        <Passant t={t} path={PATIENT.path} start={PATIENT.start} dur={PATIENT.dur} color={PATIENT.color} seed={9} bag fadeIn scale={1.12} />
        {/* un passant sur le trottoir de devant (sarcelle : à moitié caché par les toits du premier plan, il ne fait pas
            tache comme un éclat blanc) */}
        <Passant t={t} path={[[14, 8.2], [-16, 8.2]]} start={18.4} dur={9} color={PASSANT_COLORS[4]} seed={3} />
      </City>

      {/* « le vrai complément de son traitement » */}
      <Loupe t={t} k={loupeK} from={bag} sweep={sweep} hlP={hlP} hlA={hlA} />
      {hlP > 0 && loupeK > 0.5 && <Sparkle t={t} at={W.complement + 0.04} x={BOX_P.x + 74} y={BOX_P.y - 104} size={66} color={PB.citron} />}
      <FloatTag t={t} at={W.complement} out={22.36} x={LOUPE.x} y={LOUPE.y + LOUPE.r + 92} text="Le vrai complément" icon="check" tone="citron" scale={0.92} />
      <ProSeal t={t} at={W.pro + 0.03} x={LOUPE.x + 146} y={LOUPE.y - 142} out={22.36} />
      <Ring t={t} at={W.pro + 0.03} x={LOUPE.x + 146} y={LOUPE.y - 142} max={300} color={PB.citron} width={4} life={0.55} />

      {/* le bilan part de la pharmacie… */}
      <Beam t={t} at={22.72} dur={0.3} from={a.pbCross} to={[PH.x - 60, PH.y - 290]} />

      {/* …et arrive dans son téléphone */}
      {up > 0.001 && (
        <Phone t={t} x={PH.x} y={phY} scale={PH.s * telPop} tilt={tilt} pitch={pitch} rot={rot} buzz={W.bilan} statusTone={mailK > 0.5 ? "dark" : "light"} screen="#061814">
          <LockScreen t={t} />
          {/* la notification sort de SOUS l'heure (découpe juste sous l'horloge) : elle ne passe jamais sur « 9:41 » */}
          <div style={{ position: "absolute", left: 0, top: 0, width: sw, height: sh, transformOrigin: "50% 37%", transform: `scale(${1 - 0.035 * tap})`, clipPath: `inset(${CLOCK_BOTTOM + 10}px 0 0 0)` }}>
            <Notification t={t} at={W.bilan} x={NOTIF.x} y={NOTIF.y} width={NOTIF.w} scale={NOTIF.s} title="Pharmacie du Centre" body="Votre bilan conseil vous attend." icon="mail" />
          </div>
          {tap > 0 && <div style={{ position: "absolute", left: 177 - 40 * (1 + tap), top: NOTIF.y - 40 * (1 + tap), width: 80 * (1 + tap), height: 80 * (1 + tap), borderRadius: "50%", background: rgba("#FFFFFF", 0.28 * tap), zIndex: 30 }} />}
          {t >= 23.6 && (
            <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - mailK) * 100}%)`, borderRadius: 24, overflow: "hidden", boxShadow: "0 -20px 40px rgba(0,0,0,.35)" }}>
              <MailBilan t={t} at={23.48} />
            </div>
          )}
        </Phone>
      )}
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("porte-carillon", 18.62, 0.28, 1, 1.3),
  cue("pop-leger", W.patient, 0.32),
  cue("radar", W.vrai - 0.02, 0.38),
  cue("carte-ping", W.complement, 0.48),
  cue("ui-pop", W.traitement, 0.22),
  cue("tampon", W.pro + 0.03, 0.72),
  cue("balayage-mini", 22.4, 0.25),
  cue("whoosh-pb", 22.62, 0.38),
  cue("telephone-vibre", W.bilan, 0.32, 1, 0.6),
  cue("notif-douce", W.bilan + 0.02, 0.5),
  cue("ui-clic", 23.5, 0.38),
  cue("swipe-tel", 23.6, 0.36),
  cue("etincelle", W.telephone, 0.22),
  cue("swoosh", OUT, 0.38),
];
