import { useId, type ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import {
  A1,
  Patient,
  patientPose,
  PharmacyBag,
  MedBox,
  bagSlot,
  Camera,
  Flash,
  coldGrade,
  rgba,
  prog,
  keys,
  clamp01,
  lerp,
  hash,
  rnd,
  pulse,
  ressort,
  SNAP,
  POP,
  IN_OUT,
  EXIT,
  LINEAR,
  F,
  JAKARTA,
  MONO,
  label,
  cue,
  type Cue,
} from "../kit";
import { Comptoir, WHIP_RUN, whipK, whipBlur } from "./s01-comptoir";

/* ==========================================================================
 * S2 · ET RIEN D'AUTRE (6,0 → 13,1) — LE CHOC. Voix N1 : « Il repart avec son antibiotique… et rien pour sa flore
 * intestinale. » (Il 6,00 · repart 6,27 · antibiotique 8,02 · et 9,29 · rien 9,73 · pour 10,20 · sa 10,47 · flore 10,67 ·
 * intestinale 11,07 · fin 12,38).
 *
 *  6,0 → 7,45  LA RUE, la nuit, néon froid : on suit le patient de dos (il marche, le sac au bout du bras) ; la rue
 *              défile en perspective (vitrines, réverbères, potelets), la lumière des réverbères passe sur lui.
 *              Arrivée par la droite au rythme du filé de S1 (6,17 → 6,44). Deux battements de cœur (6,2 et 7,2) :
 *              l'image cogne (petit coup de zoom, vignette).
 *  7,45 → 8,0  LA CAMÉRA PLONGE sur le sac (zoom ×3,76 qui accélère, flou) ; « aspiration » culmine sur 8,0.
 *  8,0         LE COUP (musique + sub-boom) : insert sur le sac, éclair, secousse. Le sac passe AUX RAYONS X de haut en bas
 *              (8,04 → 8,30) : une seule boîte dedans, « Amoxicilline 1 g ». Viseur de scanner (coins cyan).
 *  8,30        L'étiquette « Antibiotique · 7 jours » se pose, reliée à la boîte.
 *  9,45        LE DISQUE RAYÉ : l'image hoquette (le temps fait des allers-retours), puis SE FIGE à 9,66.
 *  9,73        « RIEN. » claque en rouge (A1.alarm), énorme, à droite ; la place vide en pointillés rouges apparaît dans
 *              le sac, à côté de la boîte, avec « ? » ; le viseur passe au rouge ; secousse.
 *  10,20 →     la place vide grandit et s'écrit mot à mot : « pour sa » (10,20) / « flore » (10,67) / « intestinale »
 *              (11,07). L'image figée continue d'avancer lentement ; un battement de cœur à 12,0 fait cogner « RIEN. ».
 *  12,6 → 13,1 SORTIE : l'image se réduit en vignette 640 × 360 au centre (VIGNETTE), et devient le comptoir de S1 à
 *              « Non merci. » (Comptoir à 4,46) — la première vignette de S3 ; fondu de 13,0 à 13,1.
 * ======================================================================== */

/** La vignette de sortie (centre, taille) : la première vignette de S3. */
export const VIGNETTE = { x: 960, y: 540, w: 640, h: 360 };

const HIT = 8.0;
const XRAY_AT = 8.04;
const XRAY_DUR = 0.26;
const TAG_AT = 8.3;
const SCRATCH = 9.45;
const FREEZE = 9.66;
const RIEN = 9.73;
const GROW = 10.12;
const WORDS: [string, number][] = [
  ["pour sa", 10.2],
  ["flore", 10.67],
  ["intestinale", 11.07],
];
const HEART2 = 12.0;
const EXIT_AT = 12.6;
const XR = "#8FE9FF";

/* ------------------------------------------------------------------ le temps de l'image (le disque rayé, le gel) */

function tEff(t: number) {
  if (t < SCRATCH) return t;
  if (t < FREEZE) {
    const u = (t - SCRATCH) / (FREEZE - SCRATCH);
    return SCRATCH + 0.15 * u - 0.2 * Math.sin(u * Math.PI * 3) * (1 - u);
  }
  return SCRATCH + 0.15;
}

/* ================================================================== LA RUE */

const VP = { x: 960, y: 430 };
const GY = 475;
const SPEED = 0.62;
const camZ = (t: number) => (t - 6) * SPEED;
const NEAR = 0.14;

type XY = [number, number];
const proj = (X: number, h: number, d: number): XY => [VP.x + X / d, VP.y + (GY - h) / d];
const poly = (pts: XY[]) => `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L")} Z`;
/** Un rectangle vertical dans le plan X (façade), entre les profondeurs d1 < d2 et les hauteurs h1 < h2. */
const wallQuad = (X: number, d1: number, d2: number, h1: number, h2: number) => poly([proj(X, h1, d1), proj(X, h2, d1), proj(X, h2, d2), proj(X, h1, d2)]);
/** Une bande de sol entre X1 et X2, de d1 à d2. */
const groundQuad = (X1: number, X2: number, d1: number, d2: number) => poly([proj(X1, 0, d1), proj(X2, 0, d1), proj(X2, 0, d2), proj(X1, 0, d2)]);

/** Les éléments répétés le long de la rue : profondeurs visibles d'une série de pas P (décalage o). */
function series(c: number, P: number, o: number, dMin: number, dMax: number) {
  const out: { k: number; d: number }[] = [];
  const k0 = Math.ceil((c + dMin - o) / P);
  const k1 = Math.floor((c + dMax - o) / P);
  for (let k = k1; k >= k0; k--) out.push({ k, d: k * P + o - c });
  return out;
}

const C = {
  skyTop: "#0A1013",
  skyLow: "#1E2A31",
  haze: "#2B3A42",
  facade: "#192227",
  facade2: "#1D272C",
  far: "#121A1E",
  walk: "#20292E",
  joint: "#2A343A",
  curb: "#3A464C",
  road: "#11171A",
  dash: "#56636A",
  pole: "#0C1214",
  lamp: A1.neon,
  shopLit: coldGrade("#F1E2B8", 0.9),
  shopCold: "#6F8792",
  shopOff: "#141C20",
  sign: coldGrade("#36C9A8", 0.7),
};

const fog = (d: number) => clamp01((d - 2.5) / 16);

function Street({ t }: { t: number }) {
  const c = camZ(t);
  const RIGHT = 640;
  const CURB = -250;
  const LEFT = -2900;
  const lamps = series(c, 2.7, 1.55, NEAR, 22);
  const shops = series(c, 0.92, 0.2, NEAR, 18);
  const posts = series(c, 0.78, 0.5, 0.22, 12);
  const joints = series(c, 0.42, 0.1, NEAR, 9);
  const dashes = series(c, 1.5, 0.3, 0.3, 20);
  const farShops = series(c, 1.1, 0.6, 3.3, 22);
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="s2sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.skyTop} />
          <stop offset="100%" stopColor={C.skyLow} />
        </linearGradient>
        <radialGradient id="s2hz" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={C.haze} stopOpacity={0.9} />
          <stop offset="100%" stopColor={C.haze} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="s2glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={C.lamp} stopOpacity={0.9} />
          <stop offset="30%" stopColor={C.lamp} stopOpacity={0.25} />
          <stop offset="100%" stopColor={C.lamp} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="s2pool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#9FB8C4" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#9FB8C4" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="s2cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.lamp} stopOpacity={0.1} />
          <stop offset="100%" stopColor={C.lamp} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* le ciel, la ville au loin */}
      <rect width={1920} height={1080} fill="url(#s2sky)" />
      <ellipse cx={VP.x - 80} cy={VP.y} rx={900} ry={170} fill="url(#s2hz)" />
      {Array.from({ length: 14 }, (_, i) => {
        const w = rnd("s2sky-w", i, 26, 70);
        const x = VP.x - 330 + i * 46 + rnd("s2sky-x", i, -10, 10);
        const h = rnd("s2sky-h", i, 20, 110);
        return <rect key={`sk${i}`} x={x} y={VP.y - h} width={w} height={h + 6} fill={C.far} />;
      })}
      {Array.from({ length: 22 }, (_, i) => (
        <rect key={`skw${i}`} x={VP.x - 320 + rnd("s2skw-x", i, 0, 620)} y={VP.y - rnd("s2skw-y", i, 12, 90)} width={3} height={4} fill={C.shopLit} opacity={0.25 + 0.2 * Math.sin(t * 2 + i)} />
      ))}

      {/* la chaussée et le trottoir d'en face */}
      <path d={groundQuad(LEFT, CURB - 20, NEAR, 60)} fill={C.road} />
      {dashes.map(({ k, d }) => (
        <path key={`da${k}`} d={groundQuad(-1340, -1300, d, d + 0.55)} fill={C.dash} opacity={0.55 * (1 - fog(d))} />
      ))}
      {/* les façades d'en face (loin, à gauche) */}
      <path d={wallQuad(LEFT, 3.0, 60, 0, 2400)} fill={C.far} />
      {farShops.map(({ k, d }) => {
        const lit = hash("s2fs", k) < 0.55;
        return (
          <g key={`fs${k}`} opacity={1 - fog(d) * 0.7}>
            <path d={wallQuad(LEFT, d, d + 0.62, 70, 420)} fill={lit ? C.shopCold : C.shopOff} opacity={lit ? 0.5 : 1} />
            {hash("s2fu", k) < 0.4 && <path d={wallQuad(LEFT, d + 0.1, d + 0.4, 800, 1000)} fill={C.shopLit} opacity={0.35} />}
          </g>
        );
      })}

      {/* notre trottoir, la bordure */}
      <path d={groundQuad(CURB, RIGHT, NEAR, 60)} fill={C.walk} />
      {joints.map(({ k, d }) => (
        <path key={`jt${k}`} d={groundQuad(CURB, RIGHT, d, d + 0.012 * d)} fill={C.joint} opacity={1 - fog(d)} />
      ))}
      <path d={groundQuad(CURB - 22, CURB, NEAR, 60)} fill={C.curb} />

      {/* les vitrines et la façade de droite */}
      <path d={wallQuad(RIGHT, NEAR, 60, 0, 2600)} fill={C.facade} />
      {shops.map(({ k, d }) => {
        const kind = hash("s2shop", k);
        const lit = kind < 0.42;
        const cold = kind >= 0.42 && kind < 0.62;
        const f = fog(d);
        const glass = lit ? C.shopLit : cold ? C.shopCold : C.shopOff;
        return (
          <g key={`sh${k}`} opacity={1 - f * 0.75}>
            <path d={wallQuad(RIGHT, d + 0.06, d + 0.86, 0, 640)} fill={C.facade2} />
            {lit && <path d={groundQuad(RIGHT - 300, RIGHT, d + 0.1, d + 0.7)} fill={C.shopLit} opacity={0.07} />}
            <path d={wallQuad(RIGHT, d + 0.14, d + 0.62, 70, 500)} fill={glass} opacity={lit ? 0.5 + 0.05 * Math.sin(t * 3 + k) : cold ? 0.34 : 1} />
            {lit && <path d={wallQuad(RIGHT, d + 0.14, d + 0.62, 70, 110)} fill={C.shopOff} opacity={0.5} />}
            <path d={wallQuad(RIGHT, d + 0.68, d + 0.8, 0, 470)} fill={C.shopOff} />
            {hash("s2sign", k) < 0.35 && <path d={wallQuad(RIGHT, d + 0.16, d + 0.6, 540, 600)} fill={C.sign} opacity={0.5} />}
            {[900, 1350, 1800].map((h, r) =>
              [0.18, 0.5].map((dd, j) => {
                const on = hash("s2up", k * 7 + r * 2 + j) < 0.28;
                return <path key={`u${r}${j}`} d={wallQuad(RIGHT, d + dd, d + dd + 0.2, h, h + 260)} fill={on ? C.shopLit : "#11181B"} opacity={on ? 0.32 : 0.9} />;
              }),
            )}
          </g>
        );
      })}

      {/* les réverbères : mât, crosse, lampe, halo, cône, flaque de lumière */}
      {lamps.map(({ k, d }) => {
        const s = 1 / d;
        const f = 1 - fog(d);
        const base = proj(-300, 0, d);
        const top = proj(-300, 1260, d);
        const head = proj(-140, 1235, d);
        const ground = proj(-140, 0, d);
        return (
          <g key={`la${k}`} opacity={f}>
            <ellipse cx={ground[0]} cy={ground[1]} rx={430 * s} ry={90 * s} fill="url(#s2pool)" />
            {d > 0.9 && <path d={`M${head[0] - 26 * s},${head[1]} L${head[0] + 26 * s},${head[1]} L${ground[0] + 300 * s},${ground[1]} L${ground[0] - 300 * s},${ground[1]} Z`} fill="url(#s2cone)" opacity={clamp01((d - 0.9) / 0.8)} />}
            <rect x={base[0] - 8 * s} y={top[1]} width={16 * s} height={base[1] - top[1]} fill={C.pole} />
            <path d={`M${top[0]},${top[1]} Q${top[0] + 60 * s},${top[1] - 30 * s} ${head[0]},${head[1] - 10 * s}`} fill="none" stroke={C.pole} strokeWidth={12 * s} />
            <rect x={head[0] - 34 * s} y={head[1] - 12 * s} width={68 * s} height={14 * s} rx={6 * s} fill="#2A3439" />
            <circle cx={head[0]} cy={head[1] + 6 * s} r={160 * s} fill="url(#s2glow)" opacity={0.8 + 0.2 * Math.sin(t * 13 + k)} />
          </g>
        );
      })}
      {/* les potelets du trottoir (le premier plan qui défile vite) */}
      {posts.map(({ k, d }) => {
        if (hash("s2post", k) < 0.25) return null;
        const s = 1 / d;
        const b = proj(CURB + 40, 0, d);
        return (
          <g key={`po${k}`} opacity={1 - fog(d)}>
            <rect x={b[0] - 13 * s} y={b[1] - 270 * s} width={26 * s} height={270 * s} rx={10 * s} fill="#0F1518" />
            <rect x={b[0] - 13 * s} y={b[1] - 236 * s} width={26 * s} height={14 * s} fill="#4E5B61" />
          </g>
        );
      })}
    </svg>
  );
}

/** La lumière des réverbères qui passe sur le patient (il est à la profondeur 1). */
function lampWash(t: number) {
  const c = camZ(t);
  let w = 0;
  for (const { d } of series(c, 2.7, 1.55, 0.2, 3)) w = Math.max(w, Math.exp(-(((d - 1) / 0.45) ** 2)));
  return w;
}

/* ------------------------------------------------------------------ le patient de dos, qui marche */

const WALKER = { x: 1060, y: 905, s: 0.9 };
const leaveAt = (t: number) => 0.14 + (t - 6.0) * 0.23;

function Walker({ t }: { t: number }) {
  const L = Math.min(0.86, leaveAt(t));
  const pose = patientPose(L);
  const k = WALKER.s / pose.scale;
  const wash = lampWash(t);
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${WALKER.x}px, ${WALKER.y}px) scale(${k}) translate(${-pose.x}px, ${-pose.y}px)` }}>
        <Patient t={t} mood="act1" leave={L} boxesInBag={1} peek />
      </div>
      <div
        style={{
          position: "absolute",
          left: WALKER.x - 260,
          top: WALKER.y - 720,
          width: 520,
          height: 760,
          mixBlendMode: "screen",
          opacity: 0.32 * wash,
          background: `radial-gradient(ellipse 42% 34% at 50% 38%, ${rgba("#BFD2DA", 0.8)} 0%, transparent 100%)`,
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ le plan de la rue (6,0 → 8,0) */

/** Le sac du patient dans le plan de la rue (centre du corps du sac) : il sert d'axe à la plongée. */
const BAG_IN_STREET = { x: WALKER.x - 124 * WALKER.s, y: WALKER.y + (-316 + 110) * WALKER.s };
/** Le sac de l'insert : poignée et largeur. */
const H = { x: 800, y: 236, w: 440 };
const BAG_INSERT_CENTER = { x: H.x, y: H.y + 0.85 * H.w };
const PLUNGE_AT = 7.45;
const PLUNGE_Z = H.w / (130 * WALKER.s);

function heartbeat(t: number) {
  let k = 0;
  for (const at of [6.2, 7.2]) k += pulse(t, at, 0.04, 0, 0.22) + 0.6 * pulse(t, at + 0.2, 0.04, 0, 0.2);
  return k;
}

function StreetShot({ t, uid }: { t: number; uid: string }) {
  const wk = whipK(t);
  const pan = (1 - wk) * WHIP_RUN;
  const blurX = whipBlur(t);
  const pk = prog(t, PLUNGE_AT, HIT - PLUNGE_AT, EXIT);
  const zoom = 1 + (PLUNGE_Z - 1) * pk + 0.016 * heartbeat(t);
  const cam = {
    origin: [BAG_IN_STREET.x, BAG_IN_STREET.y] as [number, number],
    x: (BAG_INSERT_CENTER.x - BAG_IN_STREET.x) * pk,
    y: (BAG_INSERT_CENTER.y - BAG_IN_STREET.y) * pk,
    zoom,
    drift: 1,
  };
  const blur = 9 * pk ** 3;
  const fid = `s2hb${uid}`;
  return (
    <AbsoluteFill style={{ background: C.skyTop, overflow: "hidden" }}>
      {blurX > 0.3 && (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <defs>
            <filter id={fid} x="-5%" y="0%" width="110%" height="100%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={`${blurX.toFixed(2)} 0`} edgeMode="duplicate" />
            </filter>
          </defs>
        </svg>
      )}
      <AbsoluteFill style={{ transform: `translateX(${pan}px)`, filter: [blurX > 0.3 ? `url(#${fid})` : "", blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : ""].filter(Boolean).join(" ") || undefined }}>
        <Camera t={t} {...cam}>
          <Street t={t} />
          <Walker t={t} />
        </Camera>
        {/* le cœur qui cogne : la vignette se resserre */}
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 72% at 55% 50%, transparent 45%, ${rgba("#000000", 0.35 + 0.25 * Math.min(1, heartbeat(t)))} 100%)` }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* ================================================================== L'INSERT : LE SAC AUX RAYONS X */

const JACKET = coldGrade("#2C4A78");
const JACKET_SH = coldGrade("#203A61");
const SKIN = coldGrade("#D49B75");
const SKIN_SH = coldGrade("#BC8058");

/** Le flou de la rue derrière le sac : des taches de lumière froides qui dérivent (sans filtre). */
function Bokeh({ t }: { t: number }) {
  return (
    <>
      {Array.from({ length: 11 }, (_, i) => {
        const size = rnd("s2bk-s", i, 90, 300);
        const x = ((rnd("s2bk-x", i, 0, 2300) - (t - 8) * rnd("s2bk-v", i, 40, 120)) % 2300 + 2300) % 2300 - 190;
        const y = rnd("s2bk-y", i, 60, 900);
        const a = rnd("s2bk-a", i, 0.08, 0.22) * (0.8 + 0.2 * Math.sin(t * 2 + i));
        const col = i % 3 === 0 ? "#C9D9E0" : i % 3 === 1 ? "#7F98A4" : coldGrade("#F1E2B8", 0.9);
        return <div key={i} style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(col, a)} 0%, ${rgba(col, a * 0.6)} 45%, transparent 70%)` }} />;
      })}
    </>
  );
}

/** La main qui tient la poignée (poing vu de face, doigts refermés sur l'anse), et la manche qui monte hors du cadre.
 *  Repère : celui du sac de 130 de large (l'anse passe en 0, 5), mis à l'échelle s. */
function Hand({ s }: { s: number }) {
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <g transform={`scale(${s})`}>
        {/* la manche et son revers */}
        <path d={`M4,-30 L22,-120 L30,-230`} fill="none" stroke={JACKET_SH} strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" />
        <path d={`M4,-30 L22,-120 L30,-230`} fill="none" stroke={JACKET} strokeWidth={41} strokeLinecap="round" strokeLinejoin="round" />
        {/* le dos de la main */}
        <path d="M-17,-34 C-21,-18 -21,-4 -18,6 L18,6 C21,-6 21,-20 16,-34 C6,-40 -8,-40 -17,-34 Z" fill={SKIN} />
        <path d="M10,-36 C18,-28 20,-12 18,6 L12,6 C14,-8 14,-24 10,-36 Z" fill={SKIN_SH} opacity={0.55} />
        {/* les quatre doigts refermés sur l'anse */}
        {[-13.5, -4.5, 4.5, 13.5].map((x, i) => (
          <rect key={i} x={x - 4.6} y={-2 + Math.abs(x) * 0.12} width={9.2} height={17 - Math.abs(x) * 0.18} rx={4.4} fill={SKIN} stroke={SKIN_SH} strokeWidth={1.1} />
        ))}
        <path d="M-17,1 C-8,-3 8,-3 17,1" fill="none" stroke={SKIN_SH} strokeWidth={1.3} strokeLinecap="round" opacity={0.8} />
        {/* le pouce, posé en travers */}
        <path d="M-19,-16 C-14,-12 -6,-8 2,-6 C6,-5 7,-1 3,1 C-6,1 -15,-3 -21,-9 Z" fill={SKIN} stroke={SKIN_SH} strokeWidth={1.1} />
        {/* le revers de la manche, par-dessus le poignet */}
        <path d="M-20,-40 C-8,-48 12,-48 22,-40 L20,-30 C10,-36 -8,-36 -18,-30 Z" fill={JACKET_SH} />
      </g>
    </svg>
  );
}

/** Coins de viseur autour du sac (cyan aux rayons X, rouge à l'alarme). */
function Brackets({ t }: { t: number }) {
  const inK = ressort(t, XRAY_AT);
  if (inK <= 0) return null;
  const alarm = prog(t, RIEN, 0.08, LINEAR);
  const col = alarm > 0.5 ? A1.alarm : XR;
  const snap = 1 + 0.08 * (1 - inK) + 0.05 * pulse(t, RIEN, 0.03, 0, 0.3);
  const box = { l: H.x - 290, r: H.x + 290, t: H.y - 40, b: H.y + 1.4 * H.w + 26 };
  const arm = 54;
  const breathe = 1 + 0.006 * Math.sin(t * 5);
  const cx = (box.l + box.r) / 2;
  const cy = (box.t + box.b) / 2;
  const corners: [number, number, number, number][] = [
    [box.l, box.t, 1, 1],
    [box.r, box.t, -1, 1],
    [box.l, box.b, 1, -1],
    [box.r, box.b, -1, -1],
  ];
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: Math.min(1, inK * 1.4) }}>
      <g transform={`translate(${cx} ${cy}) scale(${snap * breathe}) translate(${-cx} ${-cy})`} style={{ filter: `drop-shadow(0 0 8px ${rgba(col, 0.7)})` }}>
        {corners.map(([x, y, sx, sy], i) => (
          <path key={i} d={`M${x},${y + sy * arm} L${x},${y} L${x + sx * arm},${y}`} fill="none" stroke={col} strokeWidth={4} strokeLinecap="round" />
        ))}
      </g>
    </svg>
  );
}

/** L'étiquette « Antibiotique · 7 jours », reliée à la boîte. */
function Tag({ t, swing }: { t: number; swing: number }) {
  const k = ressort(t, TAG_AT);
  if (k <= 0) return null;
  const slot = bagSlot(0, H.w);
  const a = (swing * Math.PI) / 180;
  const lx = slot.x - slot.w / 2 - 4;
  const ly = slot.y + slot.w * 0.3 - slot.w * 0.3;
  const tip = { x: H.x + lx * Math.cos(a) - ly * Math.sin(a), y: H.y + lx * Math.sin(a) + ly * Math.cos(a) };
  const right = 560;
  const lineK = prog(t, TAG_AT, 0.22, SNAP);
  const red = prog(t, RIEN, 0.1, LINEAR);
  return (
    <>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <line x1={right} y1={tip.y} x2={lerp(right, tip.x, lineK)} y2={tip.y} stroke={XR} strokeWidth={2.5} opacity={0.85} />
        <circle cx={tip.x} cy={tip.y} r={7 * lineK} fill={XR} />
        <circle cx={tip.x} cy={tip.y} r={16 * lineK} fill="none" stroke={XR} strokeWidth={1.5} opacity={0.5 + 0.3 * Math.sin(t * 6)} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: right,
          top: tip.y,
          transform: `translate(-100%, -50%) translateX(${(1 - k) * -40}px) scale(${0.85 + 0.15 * k})`,
          transformOrigin: "100% 50%",
          opacity: clamp01(k * 1.5) * (1 - 0.35 * red),
          padding: "14px 22px 15px",
          borderRadius: 16,
          background: rgba("#06131A", 0.82),
          border: `2px solid ${rgba(XR, 0.75)}`,
          boxShadow: `0 0 26px ${rgba(XR, 0.25)}`,
          whiteSpace: "nowrap",
          fontFamily: JAKARTA,
          fontWeight: 800,
          fontSize: 32,
          letterSpacing: "-0.01em",
          color: "#FFFFFF",
        }}
      >
        Antibiotique <span style={{ color: XR }}>·</span> <span style={{ fontFamily: MONO, fontWeight: 700, color: XR }}>7</span> jours
      </div>
    </>
  );
}

/** Le contenu de la place vide : « ? », puis les mots dits. */
function GhostText({ t }: { t: number }) {
  const q = ressort(t, RIEN + 0.02) * (1 - prog(t, GROW - 0.04, 0.12, EXIT));
  const qBeat = 1 + 0.08 * Math.max(0, Math.sin((t - RIEN) * Math.PI * 2 * 1.6));
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {q > 0.01 && (
        <span style={{ position: "absolute", fontFamily: JAKARTA, fontWeight: 800, fontSize: 92, lineHeight: 1, color: A1.alarm, transform: `scale(${q * qBeat})`, textShadow: `0 0 24px ${rgba(A1.alarm, 0.7)}` }}>?</span>
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        {WORDS.map(([w, at], i) => {
          const k = prog(t, at - 0.03, 0.2, SNAP);
          return (
            <span
              key={w}
              style={{
                fontFamily: JAKARTA,
                fontWeight: 800,
                fontSize: i === 0 ? 22 : 27,
                lineHeight: 1.08,
                letterSpacing: "-0.01em",
                color: i === 0 ? "#FFD9D5" : "#FFFFFF",
                opacity: k,
                transform: `translateY(${(1 - k) * 12}px) scale(${0.8 + 0.2 * POP(k)})`,
                textShadow: `0 0 14px ${rgba(A1.alarm, 0.85)}`,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** « RIEN. » : coup de poing, séparation rouge/cyan à l'impact, puis il respire et cogne au cœur. */
function RienWord({ t }: { t: number }) {
  if (t < RIEN - F) return null;
  const k = prog(t, RIEN, 9 * F, SNAP);
  const sc = 1 + 1.3 * (1 - k) + 0.035 * pulse(t, HEART2, 0.04, 0, 0.3) + 0.02 * pulse(t, HEART2 + 0.2, 0.04, 0, 0.25);
  const split = 14 * (1 - prog(t, RIEN, 0.22, LINEAR));
  const jitter = (hash("s2rj", Math.floor(t * 30)) - 0.5) * 3 * (t > RIEN + 0.3 ? 1 : 0);
  const glowA = 0.55 + 0.15 * Math.sin((t - RIEN) * 4) + 0.3 * pulse(t, HEART2, 0.04, 0, 0.3);
  const base = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    fontFamily: JAKARTA,
    fontWeight: 800,
    fontSize: 272,
    letterSpacing: "-0.05em",
    lineHeight: 1,
    whiteSpace: "nowrap" as const,
  };
  return (
    <div style={{ position: "absolute", left: 1432 + jitter, top: 560, width: 0, height: 0 }}>
      <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(-50%, -50%) scale(${sc})`, filter: k < 1 ? `blur(${(1 - k) * 12}px)` : undefined, opacity: clamp01((t - RIEN) / (3 * F)) }}>
        <div style={{ position: "relative" }}>
          {split > 0.5 && <span style={{ ...base, color: "#00E5FF", opacity: 0.55, transform: `translateX(${-split}px)`, mixBlendMode: "screen" }}>RIEN.</span>}
          {split > 0.5 && <span style={{ ...base, color: "#FF2A6A", opacity: 0.55, transform: `translateX(${split}px)`, mixBlendMode: "screen" }}>RIEN.</span>}
          <span style={{ ...base, position: "relative", color: A1.alarm, textShadow: `0 0 40px ${rgba(A1.alarm, glowA)}, 0 0 110px ${rgba(A1.alarm, glowA * 0.45)}` }}>RIEN.</span>
        </div>
      </div>
    </div>
  );
}

function BagShot({ t }: { t: number }) {
  const te = tEff(t);
  const frozen = t >= FREEZE;
  const swing = Math.sin((te - 8) * Math.PI * 2 * 0.95 + 0.6) * 5.5 + Math.sin(te * 3.1) * 0.8;
  const settle = keys(t, [
    [HIT, 1.1],
    [HIT + 0.35, 1, SNAP],
  ]);
  const drift = 1 + 0.03 * prog(t, HIT + 0.35, SCRATCH - HIT - 0.35, LINEAR);
  const push = 1 + 0.045 * IN_OUT(clamp01((t - RIEN) / (EXIT_AT - RIEN)));
  const zoom = settle * drift * push;
  const xk = prog(t, XRAY_AT, XRAY_DUR, IN_OUT);
  // le gabarit du sac (anchor "handle") : la boîte du composant fait (w + 2·pad) × (1,4w + 2·pad), pad = 0,3w
  const pad = 0.3 * H.w;
  const Ht = 1.4 * H.w + 2 * pad;
  const lineY = lerp(-40, 1.4 * H.w + 16, xk); // la ligne de balayage, en y du sac (0 = poignée)
  const cut = clamp01((lineY + pad) / Ht) * 100; // en % de la boîte du composant, depuis le haut
  const slot = bagSlot(1, H.w);
  const ghostK = ressort(t, RIEN);
  const grow = 1 + 0.3 * prog(t, GROW, 0.3, POP);
  const glitch = t >= FREEZE && t < FREEZE + 4 * F ? (Math.floor((t - FREEZE) * 60) % 2 ? 14 : -10) : 0;
  const sweep = !frozen && t > XRAY_AT + XRAY_DUR + 0.3 ? ((te - (XRAY_AT + XRAY_DUR + 0.3)) % 1.25) / 1.25 : -1;
  const sweepY = lerp(-20, 1.4 * H.w, sweep);
  const scanOn = xk > 0 && xk < 1;
  return (
    <AbsoluteFill style={{ background: "#0A1114", overflow: "hidden" }}>
      <Camera t={t} zoom={zoom} origin={[960, 520]} drift={frozen ? 0.25 : 1.2} shakes={[{ at: HIT, amp: 16, frames: 14 }, { at: RIEN, amp: 22, frames: 16 }, { at: HEART2, amp: 4, frames: 10 }]}>
        <AbsoluteFill style={{ transform: `translateX(${glitch}px)` }}>
          <Bokeh t={te} />
          <AbsoluteFill style={{ background: `radial-gradient(ellipse 46% 60% at ${(H.x / 1920) * 100}% 56%, ${rgba("#16303A", 0.55)} 0%, transparent 100%)` }} />
          {/* le sac, qui se balance au bout du bras */}
          <div style={{ position: "absolute", left: H.x, top: H.y, width: 0, height: 0, transform: `rotate(${swing}deg)` }}>
            <PharmacyBag x={0} y={0} w={H.w} boxes={1} mood="act1" style={{ clipPath: `inset(${cut}% 0 0 0)` }} />
            {xk > 0 && <PharmacyBag x={0} y={0} w={H.w} boxes={1} xray={1} mood="act1" style={{ clipPath: `inset(0 0 ${100 - cut}% 0)` }} />}
            {scanOn && (
              <div style={{ position: "absolute", left: -H.w / 2 - 40, top: lineY - 3, width: H.w + 80, height: 6, borderRadius: 3, background: XR, boxShadow: `0 0 18px ${XR}, 0 0 50px ${rgba(XR, 0.6)}` }} />
            )}
            {sweep >= 0 && <div style={{ position: "absolute", left: -H.w / 2 + 6, top: sweepY, width: H.w - 12, height: 2, background: rgba(XR, 0.35), boxShadow: `0 0 12px ${rgba(XR, 0.4)}` }} />}
            {ghostK > 0 && (
              <div style={{ position: "absolute", left: slot.x, top: slot.y, width: 0, height: 0, transform: `scale(${ghostK * grow})` }}>
                <MedBox ghost={A1.alarm} x={0} y={slot.w * 0.3} w={slot.w} t={t}>
                  <GhostText t={t} />
                </MedBox>
              </div>
            )}
          </div>
          {/* la main ne se balance pas : le sac pivote sous elle */}
          <div style={{ position: "absolute", left: H.x, top: H.y, width: 0, height: 0 }}>
            <Hand s={H.w / 130} />
          </div>
          {frozen && <AbsoluteFill style={{ background: rgba("#05090B", 0.22 * prog(t, FREEZE, 0.1, LINEAR)) }} />}
        </AbsoluteFill>
        <Brackets t={t} />
        <Tag t={t} swing={swing} />
      </Camera>
      {/* l'alarme : la vignette rougit un instant, puis reste à peine teintée */}
      <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(ellipse 75% 75% at 50% 50%, transparent 55%, ${rgba(A1.alarm, 0.28 * pulse(t, RIEN, 0.03, 0.05, 0.6) + 0.1 * prog(t, RIEN, 0.6, LINEAR))} 100%)` }} />
      <Camera t={t} zoom={1 + 0.5 * (push - 1)} origin={[960, 520]} drift={0.25} shakes={[{ at: RIEN, amp: 30, frames: 16 }, { at: HEART2, amp: 5, frames: 10 }]}>
        <RienWord t={t} />
      </Camera>
      <Flash t={t} at={HIT} dur={0.26} color="#DFF7FF" max={0.72} />
      <Flash t={t} at={FREEZE} dur={0.1} color="#FFFFFF" max={0.35} />
      <Flash t={t} at={RIEN} dur={0.14} color={A1.alarm} max={0.3} />
    </AbsoluteFill>
  );
}

/* ================================================================== LA SCÈNE */

function Frame({ t, children }: { t: number; children: ReactNode }) {
  const k = prog(t, EXIT_AT, 0.36, IN_OUT);
  if (k <= 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  const s = lerp(1, VIGNETTE.w / 1920, k);
  const cx = lerp(960, VIGNETTE.x, k);
  const cy = lerp(540, VIGNETTE.y, k);
  const cf = prog(t, EXIT_AT + 0.1, 0.24, IN_OUT);
  const out = 1 - prog(t, 13.0, 0.1, LINEAR);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          transformOrigin: "960px 540px",
          transform: `translate(${cx - 960}px, ${cy - 540}px) scale(${s})`,
          borderRadius: 34 * k,
          overflow: "hidden",
          opacity: out,
          boxShadow: `0 ${30 * k}px ${90 * k}px ${rgba("#000000", 0.6 * k)}`,
          outline: `${4 * k}px solid ${rgba(A1.pale, 0.35 * k)}`,
        }}
      >
        {children}
        {cf > 0 && (
          <AbsoluteFill style={{ opacity: cf }}>
            <Comptoir t={4.46} />
          </AbsoluteFill>
        )}
      </div>
    </AbsoluteFill>
  );
}

export function Scene({ t }: { t: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <AbsoluteFill style={{ background: t < EXIT_AT ? C.skyTop : "transparent" }}>
      <Frame t={t}>{t < HIT ? <StreetShot t={t} uid={uid} /> : <BagShot t={t} />}</Frame>
    </AbsoluteFill>
  );
}

/* ================================================================== LES BRUITAGES */

export const cues: Cue[] = [
  cue("coeur", 6.2, 0.55),
  cue("coeur", 7.2, 0.62),
  cue("aspiration", HIT - 1.2, 0.42),
  cue("sub-boom", HIT, 0.68),
  cue("scan-laser", XRAY_AT, 0.26, 0.8),
  cue("ui-pop", TAG_AT, 0.3),
  cue("disque-raye", SCRATCH, 0.55),
  cue("tampon", RIEN, 0.62),
  cue("sub-boom", RIEN, 0.45),
  ...WORDS.map(([, at]) => cue("tic-sec", at - 0.02, 0.24)),
  cue("coeur", HEART2, 0.42),
  cue("balayage-court", EXIT_AT - 0.1, 0.28),
];
