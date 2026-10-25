import { useId, type ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import {
  N,
  PB,
  JAKARTA,
  rgba,
  City,
  PB_SHOP,
  windowOf,
  camLook,
  camLerp,
  prog,
  keys,
  pulse,
  ressort,
  wobble,
  tween,
  clamp01,
  lerp,
  SNAP,
  POP,
  EXIT,
  IN_OUT,
  LINEAR,
  Odometer,
  Ring,
  Sparkle,
  cue,
  type Cue,
  type P3,
} from "../kit";
import { BannerHead, BannerCard, BANNER_CARD, LogoRobot, type ChipSpec } from "../../rembobine/kit/screens";
import { MedBox, Douchette, Pharmacienne } from "../../rembobine/kit/decor";
import { Mention } from "../../presentation/motion/kit/mention";

/* ==========================================================================
 * C2 — LE COMPTOIR (10,75 → 18,75), onglet LE COMPTOIR.
 *
 * On sort de la plongée de C1 : la caméra recule de la vitrine illuminée, la rue reste floue et assombrie derrière.
 * Devant : le comptoir (une dalle vert-encre), la bannière PharmaBoost qui flotte en légère perspective.
 *   « Une boîte scannée… »            la boîte « Amoxicilline 1 g » se pose (11,24), la douchette bipe (11,54)
 *   « le bon conseil s'affiche »       une comète monte de la boîte ; la ligne « ① Probiotique pour Amoxicilline 1 g »
 *                                      glisse dans la bannière (12,80), « 12 en stock » (13,49)
 *   « au comptoir »                    la ligne s'allume en citron, étincelle (14,10)
 *   « Le pharmacien est guidé »        la bannière se déplie en grande carte (15,0) ; la pharmacienne (buste, souriante)
 *                                      entre à gauche ; les questions arrivent (15,30 · 16,05)
 *   « Il conseille plus, »             elle pose le Probiotique à côté de l'antibiotique (17,12) et le bouton « Vendu »
 *                                      de la carte s'enfonce (17,08) : « Conseils vendus » passe de +1 à +2 (exemple)
 *   « et mieux. »                      onglet « Discours » + coche verte (17,70), le discours de la remise s'écrit
 *                                      (« à distance de l'antibiotique, toute la durée du traitement »), fini à 18,2
 * Sortie (18,25 → 18,75) : tout le premier plan file dans la vitrine et la scène s'efface : C3 est dessous, au même
 * cadrage, net (mise au point qui revient sur la rue).
 * ======================================================================== */

const WIN: P3 = windowOf(PB_SHOP);
/** La fin de la plongée de C1 (dans la vitrine). */
const CAM_IN = camLook(WIN[0], WIN[1], WIN[2], 8.5);
const CAM_A = camLook(WIN[0], WIN[1], WIN[2], 3.4, [560, 990]);
/** Le cadrage de sortie — C3 commence exactement là (mêmes valeurs dans c3-le-patient.tsx). */
const CAM_OUT = camLook(WIN[0], WIN[1], WIN[2], 2.8, [560, 1000]);
const OUT_AT = 18.25;

// ---- les places (px du cadre 1080 × 1920) ----
const COUNTER = { back: 1300, front: 1432 };
const AMOX = { x: 640, y: 1392, w: 132 };
const PROBIO_TO = { x: 440, y: 1392 };
const PHARMA = { x: 226, y: COUNTER.back, scale: 1.25 };
const HEAD = { x: 540, y: 790 };
const CARD = { x: 676, y: 893, s: 0.68 };
const PILL = { x: 852, y: 1252 };

const CHIPS: ChipSpec[] = [{ kind: "stock", text: "12 en stock" }];

// ---- temps (film) ----
const T = {
  head: 10.95,
  box: 11.05, // la boîte tombe, se pose à 11,24
  scan: 11.54,
  comet: 12.22,
  line: 12.8,
  chip: 13.49,
  hl: 14.1,
  morph: 14.8,
  card: 15.0,
  q1: 15.3,
  q2: 16.05,
  pharma: 15.08,
  place: 16.4, // la boîte arrive sur le comptoir à place + 0,8 × 0,9 = 17,12
  sold: 17.08, // le bouton « Vendu » s'enfonce (au plus bas sur « plus », 17,10) : c'est lui qui fait passer le compteur
  plus: 17.12,
  mieux: 17.7,
};

/** Un plan en légère perspective (le style « téléphone » de la référence), pivot en (cx, cy). */
function Tilt({ cx, cy, ry, rx, children }: { cx: number; cy: number; ry: number; rx: number; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 1900, perspectiveOrigin: `${cx}px ${cy}px` }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: `${cx}px ${cy}px`, transform: `rotateX(${rx}deg) rotateY(${ry}deg)` }}>{children}</div>
    </div>
  );
}

/** Le comptoir : dalle vert-encre vue de derrière, filet de lumière citron au bord avant. */
function Counter({ t, k }: { t: number; k: number }) {
  const id = `c2c${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { back, front } = COUNTER;
  const glowX = 0.5 + 0.08 * Math.sin(t * 0.7);
  return (
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute", left: 0, top: 0, transform: `translateY(${(1 - k) * 320}px)`, opacity: clamp01(k * 1.6) }}>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B4A40" />
          <stop offset="1" stopColor="#123730" />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B2520" />
          <stop offset="0.5" stopColor="#081B17" />
          <stop offset="1" stopColor={N.sky} />
        </linearGradient>
        <radialGradient id={`${id}g`} cx={glowX} cy="0" r="0.75">
          <stop offset="0" stopColor={PB.citron} stopOpacity={0.2} />
          <stop offset="1" stopColor={PB.citron} stopOpacity={0} />
        </radialGradient>
      </defs>
      <path d={`M-40,${back} L1120,${back} L1210,${front} L-130,${front} Z`} fill={`url(#${id}t)`} />
      <path d={`M-40,${back} L1120,${back} L1210,${front} L-130,${front} Z`} fill={`url(#${id}g)`} />
      <line x1={-40} y1={back} x2={1120} y2={back} stroke={rgba("#FFFFFF", 0.09)} strokeWidth={2} />
      <rect x={-10} y={front} width={1100} height={1920 - front} fill={`url(#${id}f)`} />
      <line x1={-130} y1={front} x2={1210} y2={front} stroke={rgba(PB.citron, 0.42)} strokeWidth={2.5} />
      <line x1={-130} y1={front + 3} x2={1210} y2={front + 3} stroke={rgba(PB.citron, 0.12)} strokeWidth={8} />
    </svg>
  );
}

/** Le chemin de la donnée : une comète citron de la boîte scannée vers la bannière. */
function Comet({ t, at, dur, from, ctrl, to }: { t: number; at: number; dur: number; from: [number, number]; ctrl: [number, number]; to: [number, number] }) {
  const u = (t - at) / dur;
  if (u < 0 || u > 1.25) return null;
  const pt = (s: number) => {
    const q = SNAP(clamp01(s));
    const a = 1 - q;
    return [a * a * from[0] + 2 * a * q * ctrl[0] + q * q * to[0], a * a * from[1] + 2 * a * q * ctrl[1] + q * q * to[1]];
  };
  const fade = 1 - clamp01((u - 1) / 0.25);
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", mixBlendMode: "screen" }}>
      {Array.from({ length: 9 }, (_, i) => {
        const [x, y] = pt(u - i * 0.045);
        const r = (11 - i * 1.05) * (u - i * 0.045 < 0 ? 0 : 1);
        return r > 0 ? <circle key={i} cx={x} cy={y} r={r} fill={i === 0 ? "#FFFFFF" : PB.citron} opacity={fade * (1 - i / 9) * (i === 0 ? 1 : 0.75)} /> : null;
      })}
      {(() => {
        const [x, y] = pt(u);
        return <circle cx={x} cy={y} r={34} fill={rgba(PB.citron, 0.28 * fade)} />;
      })()}
    </svg>
  );
}

/** Le lien qui reste entre la boîte scannée et la bannière (pointillés citron qui coulent vers le haut). */
function Link({ t, k, from, ctrl, to }: { t: number; k: number; from: [number, number]; ctrl: [number, number]; to: [number, number] }) {
  if (k <= 0.001) return null;
  const d = `M${from[0]},${from[1]} Q${ctrl[0]},${ctrl[1]} ${to[0]},${to[1]}`;
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <path d={d} fill="none" stroke={rgba(PB.citron, 0.16 * k)} strokeWidth={9} strokeLinecap="round" />
      <path d={d} fill="none" stroke={rgba(PB.citron, 0.6 * k)} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="3 13" strokeDashoffset={t * 48} />
      <circle cx={to[0]} cy={to[1]} r={5} fill={PB.citron} opacity={k} />
      <circle cx={from[0]} cy={from[1]} r={5} fill={PB.citron} opacity={k} />
    </svg>
  );
}

/** « Conseils vendus +1 → +2 » — un compteur d'exemple. */
function SoldPill({ t, at, roll, x, y }: { t: number; at: number; roll: number; x: number; y: number }) {
  if (t < at) return null;
  const k = ressort(t, at, { damping: 12, stiffness: 240, mass: 0.6 });
  const bump = pulse(t, roll, 0.06, 0.05, 0.35);
  const plus = clamp01((t - roll) / 0.9);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(-50%, -50%) translateY(${wobble(t, 5, 3, 0.8)}px) scale(${(0.6 + 0.4 * k) * (1 + 0.06 * bump)})`,
          opacity: clamp01(k * 2),
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 20px 10px 12px",
          borderRadius: 999,
          whiteSpace: "nowrap",
          background: "rgba(8,24,21,0.92)",
          border: `2px solid ${rgba(PB.citron, 0.45 + 0.4 * bump)}`,
          boxShadow: `0 16px 40px rgba(0,0,0,.5), 0 0 ${18 + 30 * bump}px ${rgba(PB.citron, 0.18 + 0.3 * bump)}`,
        }}
      >
        <LogoRobot t={t} size={44} seed={4} />
        <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 25, color: rgba("#FFFFFF", 0.86), letterSpacing: "-0.01em" }}>Conseils vendus</span>
        <Odometer t={t} value={(tt) => tween(tt, roll, 0.34, 1, 2, SNAP)} prefix="+" size={34} color={PB.citron} />
      </div>
      {plus > 0 && plus < 1 && (
        <div style={{ position: "absolute", left: 150, top: -36 - 44 * SNAP(plus), fontFamily: JAKARTA, fontWeight: 800, fontSize: 30, color: PB.citron, opacity: 1 - plus * plus, textShadow: `0 0 16px ${rgba(PB.citron, 0.6)}` }}>+1</div>
      )}
    </div>
  );
}

/** La coche verte de « mieux ». */
function CheckBadge({ t, at, x, y, size = 60 }: { t: number; at: number; x: number; y: number; size?: number }) {
  if (t < at) return null;
  const k = ressort(t, at, { damping: 10, stiffness: 300, mass: 0.5 });
  const draw = prog(t, at + 0.08, 0.26, SNAP);
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, transform: `scale(${Math.max(0, k)})` }}>
      <svg width={size} height={size} viewBox="0 0 60 60" style={{ overflow: "visible" }}>
        <circle cx={30} cy={30} r={29} fill={PB.stock} />
        <circle cx={30} cy={30} r={29} fill="none" stroke="#FFFFFF" strokeWidth={3} opacity={0.9} />
        <path d="M17 31 L26 40 L43 21" fill="none" stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={42} strokeDashoffset={42 * (1 - draw)} />
      </svg>
    </div>
  );
}

export function Scene({ t }: { t: number }) {
  // ---- le fond : la rue, floue, la caméra recule de la vitrine ----
  const k1 = prog(t, 10.75, 1.75, IN_OUT);
  const k2 = prog(t, 12.5, OUT_AT - 12.5, LINEAR);
  const cam = camLerp(camLerp(CAM_IN, CAM_A, k1), CAM_OUT, IN_OUT(k2));
  const blur = lerp(18, 9, k1);
  const dim = lerp(0.12, 0.46, k1);

  // ---- la sortie ----
  const out = prog(t, OUT_AT, 0.42, EXIT);
  const fade = 1 - prog(t, OUT_AT + 0.06, 0.44, IN_OUT);

  // ---- entrées ----
  const counterK = prog(t, 10.85, 0.55, SNAP);
  const headIn = prog(t, T.head, 0.42, SNAP);
  const morph = prog(t, T.morph, 0.36, IN_OUT);
  const boxDrop = keys(t, [
    [T.box, 0],
    [T.box + 0.19, 1, (x) => x * x],
  ]);
  const land = t >= T.box + 0.19 ? Math.exp(-(t - T.box - 0.19) / 0.07) * Math.sin(((t - T.box - 0.19) / 0.09) * Math.PI) : 0;
  const scanGlow = pulse(t, T.scan + 0.08, 0.06, 0.12, 0.6);
  const douIn = prog(t, 11.0, 0.42, SNAP);
  const douOut = prog(t, 12.3, 0.45, EXIT);
  const dx = lerp(lerp(1010, 690, douIn), 1060, douOut) + wobble(t, 9, 4, 1.4);
  const dy = lerp(lerp(940, 1190, douIn), 960, douOut) + wobble(t, 11, 3, 1.2);
  const pharmaK = prog(t, T.pharma, 0.5, SNAP);
  const place = clamp01((t - T.place) / 0.9);

  // la bannière repliée, qui se replie vers la carte à 14,8
  const hx = lerp(HEAD.x, CARD.x, morph);
  const hy = lerp(HEAD.y, CARD.y - (BANNER_CARD.H * CARD.s) / 2 + 30, morph) + wobble(t, 3, 4, 0.7) * (1 - morph);
  const hs = lerp(1, CARD.s, morph) * (0.93 + 0.07 * headIn);

  // le recul de « caméra » sur le comptoir : serré pendant le scan, large quand la pharmacienne arrive
  const dolly = lerp(1.38, 1, morph) * lerp(1, 1.035, prog(t, 15.2, 3.0, LINEAR));
  const dollyT = `scale(${dolly.toFixed(4)})`;
  const dollyO = `${AMOX.x}px ${AMOX.y}px`;

  // repères de la carte (coordonnées de la carte, échelle 1 → écran)
  const toCard = (lx: number, ly: number): [number, number] => [CARD.x + (lx - BANNER_CARD.W / 2) * CARD.s, CARD.y + (ly - BANNER_CARD.H / 2) * CARD.s];
  const disc = BANNER_CARD.tab("discours", CHIPS);
  // la coche : au coin haut droit de la bulle « À dire au patient » (sans cacher l'onglet)
  const [chkX, chkY] = toCard(842, disc.y + 84);
  const cardFloat = wobble(t, 7, 5, 0.6);

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <City t={t} cam={cam} pbLit={1} queue={1} dim={dim} style={{ filter: `blur(${blur.toFixed(2)}px)` }} />
      {/* le premier plan : il file dans la vitrine à la sortie */}
      <AbsoluteFill style={{ transformOrigin: "560px 1000px", transform: `scale(${1 - 0.72 * out})`, opacity: 1 - out }}>
        {/* un voile en bas pour asseoir le comptoir */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 1060, height: 860, background: `linear-gradient(180deg, ${rgba(N.sky, 0)} 0%, ${rgba(N.sky, 0.55)} 40%, ${rgba(N.sky, 0.9)} 100%)`, opacity: counterK }} />
        <div style={{ position: "absolute", inset: 0, transformOrigin: dollyO, transform: dollyT }}>
          <Counter t={t} k={counterK} />
        </div>

        {/* la grande carte (la bannière dépliée) */}
        <div style={{ position: "absolute", inset: 0, transform: `translateY(${cardFloat}px)` }}>
          <Tilt cx={CARD.x} cy={CARD.y} ry={-9 + 2 * Math.sin(t * 0.5)} rx={3}>
            <BannerCard
              t={t}
              at={T.card}
              x={CARD.x}
              y={CARD.y}
              scale={CARD.s}
              product="Probiotique"
              for="Amoxicilline 1 g"
              chips={CHIPS}
              count={1}
              sold={T.sold}
              tab={(tt) => (tt < T.mieux ? "questions" : "discours")}
              questions={[
                { text: "Avez-vous déjà eu des troubles digestifs avec un antibiotique ?", at: T.q1 },
                { text: "Prenez-vous déjà un probiotique ?", at: T.q2 },
              ]}
              // le discours de la remise (fiche du produit : à distance de l'antibiotique, toute la durée du traitement) ;
              // il finit de s'écrire avant la sortie (18,25)
              discours={{ text: "À prendre à distance de l'antibiotique, pendant toute la durée du traitement.", at: T.mieux + 0.08, dur: 0.42 }}
            />
            <CheckBadge t={t} at={T.mieux + 0.02} x={chkX} y={chkY} size={52} />
            <Sparkle t={t} at={T.mieux + 0.06} x={chkX + 30} y={chkY - 26} size={70} color={PB.citron} />
          </Tilt>
        </div>

        {/* la bannière repliée (avant 15,2) */}
        {t < T.morph + 0.4 && (
          <div style={{ position: "absolute", inset: 0, opacity: headIn * (1 - prog(t, T.morph + 0.12, 0.24, LINEAR)) }}>
            <Tilt cx={hx} cy={hy} ry={-7 + 1.5 * Math.sin(t * 0.6)} rx={4}>
              <BannerHead
                t={t}
                x={hx}
                y={hy}
                scale={hs}
                lines={[{ n: 1, drug: "Amoxicilline 1 g", product: "Probiotique", chips: [{ kind: "stock", text: "12 en stock", at: T.chip }], at: T.line }]}
                highlight={{ n: 1, at: T.hl }}
              />
            </Tilt>
          </div>
        )}

        {/* la boîte scannée, sur le comptoir */}
        <div style={{ position: "absolute", inset: 0, transformOrigin: dollyO, transform: dollyT }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: `${AMOX.x}px ${AMOX.y}px`,
            transform: `translateY(${(1 - boxDrop) * -150 + (1 - counterK) * 320}px) scale(${1 + 0.1 * land}, ${1 - 0.12 * land})`,
            opacity: t < T.box ? 0 : clamp01((t - T.box) / 0.08),
            filter: scanGlow > 0.01 ? `drop-shadow(0 0 ${22 * scanGlow}px ${rgba(PB.citron, 0.95)})` : undefined,
          }}
        >
          <MedBox kind="amoxicilline" x={AMOX.x} y={AMOX.y} w={AMOX.w} side={1} t={t} />
        </div>
        <Ring t={t} at={T.scan + 0.1} x={AMOX.x + 6} y={AMOX.y - 44} max={330} color={PB.citron} width={4} life={0.6} />
        </div>

        {/* la pharmacienne (elle se coupe seule au bord du comptoir) */}
        {t >= T.pharma && (
          <div style={{ position: "absolute", inset: 0, opacity: pharmaK, transformOrigin: dollyO, transform: `translateX(${(1 - pharmaK) * -70}px) ${dollyT}` }}>
            <Pharmacienne
              t={t}
              mood="pb"
              expression="sourire"
              talk={[
                [15.32, 16.35],
                [16.78, 17.55],
              ]}
              place={place > 0 ? place : undefined}
              placeKind="probiotique"
              placeTo={PROBIO_TO}
              x={PHARMA.x}
              y={PHARMA.y}
              scale={PHARMA.scale}
            />
          </div>
        )}

        {/* la comète de la donnée, de la boîte vers la bannière, puis le lien qui reste */}
        <Link t={t} k={prog(t, T.line + 0.12, 0.3, SNAP) * (1 - prog(t, T.morph - 0.05, 0.25, LINEAR))} from={[AMOX.x, AMOX.y - 100 * dolly]} ctrl={[690, 1010]} to={[300, HEAD.y + 86]} />
        <Comet t={t} at={T.comet} dur={0.56} from={[AMOX.x, AMOX.y - 100 * dolly]} ctrl={[720, 860]} to={[250, 770]} />

        {/* la douchette */}
        {t >= 11.0 && douOut < 1 && (
          <div style={{ position: "absolute", inset: 0, opacity: clamp01(douIn * 2) * (1 - douOut), transformOrigin: dollyO, transform: dollyT }}>
            <Douchette t={t} x={dx} y={dy} angle={12 + wobble(t, 4, 2, 1)} size={0.85} beamAt={T.scan} beamDur={0.34} beamLength={175} beamWidth={150} />
          </div>
        )}

        <SoldPill t={t} at={16.78} roll={T.plus} x={PILL.x} y={PILL.y} />

        {/* l'exemple : « 12 en stock », le compteur */}
        <div style={{ position: "absolute", left: 0, top: 1404, width: 1080, height: 90 }}>
          <Mention t={t} from={13.4} to={OUT_AT + 0.6} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("ui-pop", T.head, 0.3),
  cue("boite-posee", T.box + 0.18, 0.45),
  cue("scan-laser", T.scan - 0.04, 0.4),
  cue("scanner-bip", T.scan + 0.02, 0.6),
  cue("balayage-mini", T.comet, 0.3),
  cue("carte-ping", T.line, 0.5),
  cue("pop-leger", T.chip, 0.35),
  cue("etincelle", T.hl, 0.35),
  cue("carte-depliee", T.card - 0.02, 0.5),
  cue("ui-pop", T.q1, 0.22),
  cue("ui-pop", T.q2, 0.22),
  cue("ui-clic", T.sold, 0.32),
  cue("boite-posee", T.plus, 0.4),
  cue("compteur", T.plus + 0.04, 0.28),
  cue("ui-clic", T.mieux, 0.4),
  cue("ui-ding", T.mieux + 0.04, 0.42),
  cue("whoosh-pb", OUT_AT, 0.4),
];
