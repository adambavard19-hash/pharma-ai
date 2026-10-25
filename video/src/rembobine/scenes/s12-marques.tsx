import type { ReactElement } from "react";
import { AbsoluteFill } from "remotion";
import { Check, Star } from "lucide-react";
import { Mention } from "../../presentation/motion/kit/mention";
import {
  AdnBackdrop,
  Camera,
  ChapterTitle,
  Chip,
  Converge,
  CounterScreen,
  Dust,
  EXIT,
  FRANCE_DOTS,
  FRANCE_PATH,
  IN_OUT,
  JAKARTA,
  LogoRobot,
  Odometer,
  PB,
  POP,
  Ring,
  SNAP,
  Sparkle,
  Sparks,
  WHIP,
  clamp01,
  cue,
  hash,
  keys,
  label,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  wobble,
  type Cue,
} from "../kit";

/* ==========================================================================
 * S12 · LES MARQUES (59,6 → 66,0) — N11 : « Pour les marques : leurs challenges sur l'écran du comptoir, au bon moment.
 * Et chaque vente, comptée. »
 *
 *   CHAPITRE    « 3/3 · POUR LES MARQUES » (même gabarit que S9, S10) ; son panneau entre pendant que S11 est balayée
 *               par le même bord (S11 le suit au pixel près) ; il file à 60,62 et reste en étiquette en haut à gauche.
 *   CHALLENGE   60,86 : la carte « Votre marque · Challenge » (pictogramme générique, or : le challenge) claque au centre,
 *               avec la pastille or « +1 € par boîte pour l'équipe » ; lisible pendant tout « challenges » (60,95 → 61,39),
 *               elle se plie à 61,36 en AVION DE PAPIER doré.
 *   L'ÉCRAN     l'avion file en boucle pendant que la caméra glisse sur un mur de 8 écrans de comptoir ÉTEINTS ; il se
 *               démultiplie (61,78) et chaque avion plonge dans un écran, qui s'allume (bannière « En attente de scan… »,
 *               étoile or du challenge reçu).
 *   AU BON      62,57 → 63,2 : une boîte est bipée sur chaque comptoir, l'un après l'autre (rayon de lecture, bip) : la
 *   MOMENT      ligne « Probiotique · pour Amoxicilline 1 g » glisse et la pastille OR « Challenge · Votre marque » claque.
 *   COMPTÉE     63,38 : les écrans se replient en points verts qui filent sur la carte de France — LE MIROIR DE S3 —
 *               et le vert se propage de ville en ville, point par point (257 points, « +1 ») ; à droite, le compteur
 *               « ventes du challenge » (exemple) roule avec les points et S'ARRÊTE sur « comptée » (64,4), avec le tampon
 *               « ✓ Comptée » : le nombre final reste lisible jusqu'à la sortie.
 *   SORTIE      65,16 → 65,72 : tous les points convergent au centre, l'image se referme en iris sur ce point lumineux,
 *               d'où S13 fait claquer le logo à 65,75.
 *   « Illustration · exemples » en haut à droite dès que les chiffres apparaissent.
 * ======================================================================== */

// ---- Les temps (secondes du film) --------------------------------------------------------------------------------
const CH = 59.7; // S11 suit ce même `at` pour sa sortie
const CH_EXIT = 60.62;
const CARD_AT = 60.86; // « challenges » 60,95 → 61,39 : la carte est lisible pendant tout le mot
const LAUNCH = 61.36; // la carte se plie en avion (fin de « challenges »)
const FLY0 = LAUNCH + 0.1;
const SPLIT = 61.78; // l'avion se démultiplie (« du comptoir » 61,88 → 62,52 : les avions plongent dans les écrans)
const PAN = 61.4; // le mur d'écrans glisse dans le cadre (« l'écran » 61,55)
const PAN_DUR = 0.52;
const LEG = 0.32; // durée du plongeon de chaque avion
const STEP_LAND = 0.034;
const SCAN0 = 62.57; // « au bon moment » 62,55 → 63,38
const SCAN_STEP = 0.08;
const COLLAPSE = 63.38; // « Et chaque vente » 63,47
const COMPTEE = 64.4;
const CONV = 65.16;
const IRIS = 65.44;
const IRIS_DUR = 0.28;

// ---- Le mur d'écrans ---------------------------------------------------------------------------------------------
const SW = 372; // largeur de la dalle
const SCREENS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: 330 + (i % 4) * 420, y: i < 4 ? 336 : 642 }));
const LAND_ORDER = [1, 2, 5, 6, 0, 3, 4, 7]; // les avions : du centre vers les bords
const SCAN_ORDER = [5, 1, 6, 3, 0, 7, 2, 4]; // les bips : un comptoir après l'autre, en désordre
const landAt = (i: number) => SPLIT + LAND_ORDER.indexOf(i) * STEP_LAND + LEG;
const scanAt = (i: number) => SCAN0 + SCAN_ORDER.indexOf(i) * SCAN_STEP;
const LINES = [
  { product: "Probiotique", drug: "Amoxicilline 1 g" },
  { product: "Pastilles gorge", drug: "Paracétamol 1 g" },
];

// ---- La carte de France ------------------------------------------------------------------------------------------
const MAP = { x: 700, y: 486, size: 800 };
const MK = MAP.size / 1000;
const toScreen = (p: { x: number; y: number }) => ({ x: MAP.x - MAP.size / 2 + p.x * MK, y: MAP.y - MAP.size / 2 + p.y * MK });
const nearestDot = (x: number, y: number) => {
  let best = 0;
  let bd = Infinity;
  FRANCE_DOTS.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
};
/** Chaque écran devient une ville (écran i → point de la carte). */
const CITY = [
  nearestDot(230, 330), // Rennes
  nearestDot(540, 90), // Lille
  nearestDot(520, 250), // Paris
  nearestDot(800, 285), // Strasbourg
  nearestDot(320, 640), // Bordeaux
  nearestDot(450, 780), // Toulouse
  nearestDot(705, 785), // Marseille
  nearestDot(690, 560), // Lyon
];
const SEED_START = (i: number) => COLLAPSE + 0.1 + SCAN_ORDER.indexOf(i) * 0.022;
const SEED_DUR = 0.36;
const seedArrive = (i: number) => SEED_START(i) + SEED_DUR;
/** Le dernier point s'allume juste avant « comptée » (64,40) : le compteur s'arrête sur le mot, avec le tampon. */
const LAST_LIT = COMPTEE - 0.06;
/** L'instant où chaque point s'allume : le vert part des villes et se propage jusqu'à LAST_LIT. */
const LIT_AT: number[] = (() => {
  const dist = FRANCE_DOTS.map((p) => CITY.map((c) => Math.hypot(p.x - FRANCE_DOTS[c].x, p.y - FRANCE_DOTS[c].y)));
  const at = (v: number) => FRANCE_DOTS.map((_, i) => Math.min(...CITY.map((c, s) => seedArrive(s) + dist[i][s] * v)) + (CITY.includes(i) ? 0 : hash("s12lit", i) * 0.06));
  // La vitesse de propagation telle que le dernier point s'allume à LAST_LIT (dichotomie, déterministe).
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (Math.max(...at(mid)) > LAST_LIT) hi = mid;
    else lo = mid;
  }
  return at(lo);
})();
const PLUS = FRANCE_DOTS.map((_, i) => i).filter((i) => !CITY.includes(i) && hash("s12plus", i) < 0.05).slice(0, 12);
/** Le compteur : chaque point allumé compte (continu, pour que les rouleaux tournent). */
const sales = (tt: number) => LIT_AT.reduce((s, a) => s + clamp01((tt - a) / 0.08), 0);
const CENTER = { x: 960, y: 540 };

// ---- Petites aides -----------------------------------------------------------------------------------------------
type Pt = { x: number; y: number };
const cub = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt => {
  const v = 1 - u;
  return { x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x, y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y };
};
const quad = (p0: Pt, p1: Pt, p2: Pt, u: number): Pt => {
  const v = 1 - u;
  return { x: v * v * p0.x + 2 * v * u * p1.x + u * u * p2.x, y: v * v * p0.y + 2 * v * u * p1.y + u * u * p2.y };
};
const ang = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

// ---- Le fond -----------------------------------------------------------------------------------------------------
function Backdrop({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 95% at 50% 46%, ${PB.green2} 0%, ${PB.green} 52%, #071B17 100%)` }}>
      <AdnBackdrop t={t} tone="night" width={1500} focus={[0.5 - 0.2 * prog(t, PAN, PAN_DUR, WHIP), 0.5]} opacity={0.36} style={{ background: "transparent" }} />
      <Dust t={t} count={30} seed="s12dust" color={PB.mint} alpha={0.2} size={[1.5, 3.5]} speed={0.08} />
    </AbsoluteFill>
  );
}

// ---- La carte « Votre marque · Challenge » -----------------------------------------------------------------------
function BrandMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id="s12mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={PB.goldHi} />
          <stop offset="1" stopColor={PB.gold} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="28" fill="url(#s12mark)" />
      {/* Un pictogramme générique (un hexagone et un point) : aucune marque, et rien qui rappelle un symbole connu
          (l'ancien cercle + feuille se lisait comme le symbole « masculin » ♂). */}
      <path d="M50 19 L77 34.5 L77 65.5 L50 81 L23 65.5 L23 34.5 Z" fill="none" stroke="#FFFFFF" strokeWidth="8.5" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="10" fill="#FFFFFF" />
    </svg>
  );
}

function ChallengeCard({ t }: { t: number }) {
  if (t < CARD_AT || t > LAUNCH + 0.2) return null;
  const r = ressort(t, CARD_AT, { damping: 11, stiffness: 240, mass: 0.6 });
  const fold = prog(t, LAUNCH, 0.12, IN_OUT);
  if (fold >= 0.97) return null;
  const sx = Math.max(0, r) * lerp(1, 0.25, fold);
  const sy = Math.max(0, r) * lerp(1, 0.04, fold);
  const rot = (1 - clamp01(r)) * -14 - 3 + wobble(t, 4, 1.5, 1.4) - 12 * fold;
  const sheen = prog(t, CARD_AT + 0.3, 0.6, IN_OUT);
  return (
    <div style={{ position: "absolute", left: CENTER.x, top: 470, transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${sx}, ${sy})`, opacity: clamp01(r * 3) * (1 - fold * fold) }}>
      <div style={{ position: "relative", width: 700, boxSizing: "border-box", padding: "36px 42px 38px", borderRadius: 38, overflow: "hidden", background: PB.paper, boxShadow: `inset 0 0 0 4px ${rgba(PB.gold, 0.75)}, 0 0 80px ${rgba(PB.gold, 0.35)}, 0 40px 80px -30px rgba(0,0,0,.6)` }}>
        {sheen > 0 && sheen < 1 && <div style={{ position: "absolute", top: "-30%", bottom: "-30%", left: `${-40 + sheen * 150}%`, width: "30%", background: "linear-gradient(100deg, transparent, rgba(255,255,255,.85), transparent)", transform: "skewX(-18deg)" }} />}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 28 }}>
          <BrandMark size={118} />
          <div>
            <div style={{ ...label(22), color: PB.inkSoft }}>Votre marque</div>
            <div style={{ marginTop: 8, fontFamily: JAKARTA, fontWeight: 800, fontSize: 78, letterSpacing: "-0.04em", lineHeight: 1, color: PB.ink }}>Challenge</div>
          </div>
        </div>
        <div style={{ position: "relative", marginTop: 28 }}>
          <Chip t={t} kind="challenge" text="+1 € par boîte pour l’équipe" at={CARD_AT + 0.12} size={34} />
        </div>
      </div>
    </div>
  );
}

// ---- L'avion de papier doré --------------------------------------------------------------------------------------
function Plane({ x, y, angle, scale, opacity = 1, stretch = 1 }: { x: number; y: number; angle: number; scale: number; opacity?: number; stretch?: number }) {
  const flipY = Math.cos((angle * Math.PI) / 180) < 0 ? -1 : 1;
  return (
    <svg width={170} height={110} viewBox="-85 -55 170 110" style={{ position: "absolute", left: x - 85, top: y - 55, overflow: "visible", opacity, transform: `rotate(${angle}deg) scale(${scale * stretch}, ${scale * flipY})`, filter: `drop-shadow(0 10px 14px rgba(0,0,0,.35)) drop-shadow(0 0 14px ${rgba(PB.gold, 0.55)})` }}>
      <path d="M74 0 L-64 -42 L-20 4 Z" fill="#FFF2CC" />
      <path d="M74 0 L-20 4 L-40 30 Z" fill="#C98710" />
      <path d="M74 0 L-66 26 L-20 4 Z" fill={PB.gold} />
      <path d="M74 0 L-20 4" stroke="#9A6408" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M-30 -19 l3.5 7 7.6 1.1 -5.5 5.3 1.3 7.6 -6.9 -3.6 -6.8 3.6 1.3 -7.6 -5.5 -5.3 7.6 -1.1 Z" fill={PB.gold} transform="translate(8 2) scale(.9)" />
    </svg>
  );
}

/** Le grand vol : de la carte pliée jusqu'en haut du cadre, en boucle pendant que la caméra glisse. */
const P0 = { x: CENTER.x, y: 470 };
const P1 = { x: 1330, y: 660 };
const P2 = { x: 1560, y: 120 };
const P3 = { x: 960, y: 118 };
const bigPath = (u: number) => cub(P0, P1, P2, P3, u);

function Planes({ t, gx }: { t: number; gx: number }) {
  const out: ReactElement[] = [];
  if (t >= LAUNCH + 0.06 && t < SPLIT + 0.02) {
    const pop = keys(t, [[LAUNCH + 0.06, 0], [LAUNCH + 0.16, 1.25, POP], [LAUNCH + 0.26, 1]]);
    const u = prog(t, FLY0, SPLIT - FLY0, IN_OUT);
    const p = bigPath(u);
    const q = bigPath(Math.min(1, u + 0.02));
    const speed = Math.abs(u - prog(t - 1 / 60, FLY0, SPLIT - FLY0, IN_OUT)) * 60;
    // La traînée en pointillés.
    for (let j = 1; j <= 14; j++) {
      const uu = u - j * 0.028;
      if (uu <= 0) break;
      const tp = bigPath(uu);
      out.push(<div key={`tr${j}`} style={{ position: "absolute", left: tp.x - 5, top: tp.y - 5, width: 10, height: 10, borderRadius: 99, background: PB.goldHi, opacity: 0.75 * (1 - j / 15) }} />);
    }
    out.push(<Plane key="big" x={p.x} y={p.y} angle={u > 0.98 ? 0 : ang(p, q)} scale={pop * 1.05} stretch={1 + Math.min(0.35, speed * 0.12)} />);
  }
  // La démultiplication : un avion par écran.
  SCREENS.forEach((s, i) => {
    const start = landAt(i) - LEG;
    if (t < start - 0.02 || t > landAt(i) + 0.1) return;
    const dest = { x: s.x + gx, y: s.y };
    const side = (s.x - CENTER.x) * 0.55;
    const ctrl = { x: P3.x + side, y: P3.y - 70 };
    const u = prog(t, start, LEG, IN_OUT);
    const p = quad(P3, ctrl, dest, u);
    const q = quad(P3, ctrl, dest, Math.min(1, u + 0.03));
    const shrink = 1 - prog(t, landAt(i) - 0.06, 0.12, EXIT);
    for (let j = 1; j <= 6; j++) {
      const uu = u - j * 0.06;
      if (uu <= 0) break;
      const tp = quad(P3, ctrl, dest, uu);
      out.push(<div key={`tr${i}-${j}`} style={{ position: "absolute", left: tp.x - 3.5, top: tp.y - 3.5, width: 7, height: 7, borderRadius: 99, background: PB.goldHi, opacity: 0.7 * (1 - j / 7) * shrink }} />);
    }
    if (shrink > 0) out.push(<Plane key={`p${i}`} x={p.x} y={p.y} angle={ang(p, q)} scale={lerp(0.75, 0.42, u) * shrink} />);
  });
  return <>{out}</>;
}

// ---- La bannière miniature d'un écran (dessinée dans le cadre virtuel 1600 × 1000 de CounterScreen) ---------------
function MiniBanner({ t, i }: { t: number; i: number }) {
  const line = LINES[i % 2];
  const land = landAt(i);
  const scan = scanAt(i);
  const star = ressort(t, land + 0.16, { damping: 9, stiffness: 300, mass: 0.5 });
  const row = prog(t, scan + 0.08, 0.34, SNAP);
  const beam = (t - scan) / 0.2;
  const flash = pulse(t, scan + 0.05, 0.03, 0.02, 0.16);
  const gold = t >= scan + 0.16 ? 0.5 + 0.5 * Math.sin((t - scan) * 4 + i) : 0;
  const shimmer = (((t + i * 0.37) * 0.7) % 1) * 1.4 - 0.2;
  const ph = t * 2.2 + i;
  const strand = (off: number) =>
    Array.from({ length: 41 }, (_, k) => {
      const x = k * 40;
      const y = 560 + Math.sin(k * 0.32 + ph + off) * 180;
      return `${k ? "L" : "M"} ${x} ${y.toFixed(1)}`;
    }).join(" ");
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(120% 120% at 72% 30%, #133A31 0%, #0A1A17 55%, #050B0A 100%)" }}>
      <svg width={1600} height={1000} style={{ position: "absolute", inset: 0 }}>
        <path d={strand(0)} fill="none" stroke={rgba(PB.mint, 0.22)} strokeWidth={10} />
        <path d={strand(Math.PI)} fill="none" stroke={rgba(PB.citron, 0.14)} strokeWidth={10} />
      </svg>
      {gold > 0 && <div style={{ position: "absolute", inset: 0, background: `radial-gradient(70% 60% at 30% 82%, ${rgba(PB.gold, 0.16 + 0.1 * gold)} 0%, transparent 70%)` }} />}
      <div style={{ position: "absolute", left: 60, top: 50 }}>
        <LogoRobot t={t} size={150} seed={i} />
      </div>
      {row < 1 && (
        <div style={{ position: "absolute", left: 250, top: 70, height: 130, display: "flex", alignItems: "center", opacity: 1 - row, fontFamily: JAKARTA, fontWeight: 700, fontSize: 76, letterSpacing: "-0.01em" }}>
          <span style={{ color: "transparent", backgroundImage: `linear-gradient(90deg, rgba(242,255,249,.5) ${shimmer * 100 - 20}%, #FFFFFF ${shimmer * 100}%, rgba(242,255,249,.5) ${shimmer * 100 + 20}%)`, WebkitBackgroundClip: "text", backgroundClip: "text" }}>En attente de scan…</span>
        </div>
      )}
      {/* L'étoile du challenge reçu. */}
      {star > 0.01 && (
        <div style={{ position: "absolute", right: 56, top: 52, width: 150, height: 150, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(180deg, ${PB.goldHi}, ${PB.gold})`, boxShadow: `0 0 ${50 + 30 * gold}px ${rgba(PB.gold, 0.6)}`, transform: `scale(${star}) rotate(${(1 - clamp01(star)) * -90 + wobble(t, i + 3, 8, 1.3)}deg)` }}>
          <Star size={92} fill="#3A2600" strokeWidth={0} />
        </div>
      )}
      {row > 0 && (
        <div style={{ position: "absolute", left: 60, top: 260, right: 60, opacity: clamp01(row * 1.8), transform: `translateX(${(1 - row) * -120}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
            <span style={{ display: "inline-flex", width: 128, height: 128, borderRadius: 99, alignItems: "center", justifyContent: "center", background: "#0E8A7B", color: "#FFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 76 }}>1</span>
            <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 124, letterSpacing: "-0.035em", lineHeight: 1, color: "#FFFFFF", whiteSpace: "nowrap" }}>{line.product}</span>
          </div>
          <div style={{ marginTop: 22, marginLeft: 4, fontFamily: JAKARTA, fontWeight: 700, fontSize: 70, color: "rgba(242,255,249,.84)", whiteSpace: "nowrap" }}>pour {line.drug}</div>
          <div style={{ marginTop: 50 }}>
            <Chip t={t} kind="challenge" text="Challenge · Votre marque" at={scan + 0.16} size={80} onDark />
          </div>
        </div>
      )}
      {beam > 0 && beam < 1 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: lerp(-20, 1000, beam), height: 14, background: "#5EEAD4", boxShadow: "0 0 60px 24px rgba(94,234,212,.55)", opacity: 1 - beam * 0.4 }} />
      )}
      {flash > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(255,255,255,${0.28 * flash})` }} />}
    </div>
  );
}

function Wall({ t, gx }: { t: number; gx: number }) {
  if (t < PAN || t > COLLAPSE + 0.6) return null;
  const blur = Math.min(10, Math.abs(gx - (1920 * (1 - prog(t - 1 / 60, PAN, PAN_DUR, WHIP)))) * 0.25);
  return (
    <div style={{ position: "absolute", inset: 0, filter: blur > 0.4 ? "url(#s12mb)" : undefined }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id="s12mb" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={`${blur.toFixed(2)} 0`} />
        </filter>
      </svg>
      {SCREENS.map((s, i) => {
        const k = SCAN_ORDER.indexOf(i);
        const shrink = 1 - prog(t, COLLAPSE + k * 0.022, 0.22, IN_OUT);
        if (shrink <= 0) return null;
        const power = prog(t, landAt(i) - 0.04, 0.42, (x) => x);
        const lit = prog(t, scanAt(i) + 0.14, 0.2, SNAP);
        const fy = wobble(t, i + 11, 4, 0.7);
        return (
          <div key={i} style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${s.x + gx}px, ${s.y + fy}px) scale(${shrink}) translate(${-s.x}px, ${-s.y}px)`, opacity: clamp01(shrink * 3) }}>
            {lit > 0 && <div style={{ position: "absolute", left: s.x - 300, top: s.y - 220, width: 600, height: 440, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(PB.gold, 0.26 * lit)} 0%, transparent 100%)` }} />}
            <CounterScreen t={t} mood="pb" state="pb" power={power} x={s.x} y={s.y} w={SW} tilt={0} stand={false}>
              <MiniBanner t={t} i={i} />
            </CounterScreen>
          </div>
        );
      })}
    </div>
  );
}

// ---- La carte qui s'allume en VERT -------------------------------------------------------------------------------
function GreenMap({ t }: { t: number }) {
  if (t < COLLAPSE + 0.05) return null;
  const draw = prog(t, COLLAPSE + 0.14, 0.6, SNAP);
  const base = prog(t, COLLAPSE + 0.26, 0.45, SNAP);
  const conv = (i: number) => {
    const p = FRANCE_DOTS[i];
    const s = toScreen(p);
    const d = Math.hypot(s.x - CENTER.x, s.y - CENTER.y);
    // Tous les points partent dès CONV (les plus loin d'abord) et accélèrent (x²) : le mouvement se voit tout de suite,
    // et ils sont au centre vers 65,5, quand le cœur lumineux grandit (l'ancienne courbe EXIT les laissait immobiles
    // jusqu'à 65,45, sous un halo déjà allumé à côté de la carte).
    return prog(t, CONV + (1 - d / 700) * 0.06 + hash("s12conv", i) * 0.04, 0.34, (x) => x * x);
  };
  const fade = 1 - prog(t, CONV, 0.2, SNAP);
  const c = { x: (CENTER.x - (MAP.x - MAP.size / 2)) / MK, y: (CENTER.y - (MAP.y - MAP.size / 2)) / MK };
  return (
    <svg width={MAP.size} height={MAP.size} viewBox="0 0 1000 1000" style={{ position: "absolute", left: MAP.x - MAP.size / 2, top: MAP.y - MAP.size / 2, overflow: "visible" }}>
      <defs>
        <radialGradient id="s12glow">
          <stop offset="0%" stopColor={PB.stock} stopOpacity={0.8} />
          <stop offset="100%" stopColor={PB.stock} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g opacity={fade}>
        <path d={FRANCE_PATH} fill={rgba(PB.stock, 0.07 * base)} stroke={rgba(PB.stock, 0.16 * base)} strokeWidth={16} strokeLinejoin="round" />
        <path d={FRANCE_PATH} fill="none" stroke={rgba(PB.mint, 0.75)} strokeWidth={3.5} strokeLinejoin="round" pathLength={1000} strokeDasharray="1000 1000" strokeDashoffset={1000 * (1 - draw)} />
        <path d={FRANCE_PATH} fill="none" stroke={rgba(PB.citron, 0.5)} strokeWidth={4} strokeDasharray="36 964" strokeDashoffset={-t * 240} pathLength={1000} opacity={draw} />
      </g>
      {FRANCE_DOTS.map((p, i) => {
        const at = LIT_AT[i];
        const k = ressort(t, at, { damping: 9, stiffness: 280, mass: 0.5 });
        const kk = clamp01(k);
        const cv = conv(i);
        const x = lerp(p.x, c.x, cv);
        const y = lerp(p.y, c.y, cv);
        const twinkle = kk > 0.9 ? 0.85 + 0.15 * Math.sin(t * 5 + i) : 1;
        const ring = prog(t, at, 0.4, SNAP);
        const dimA = base * fade * (1 - kk);
        const col = cv > 0 ? `color-mix(in srgb, ${PB.citron} ${Math.round(cv * 100)}%, ${PB.stock})` : PB.stock;
        return (
          <g key={i}>
            {dimA > 0.01 && <circle cx={p.x} cy={p.y} r={5.5} fill={rgba("#FFFFFF", 0.16 * dimA)} />}
            {kk > 0.02 && cv < 0.95 && <circle cx={x} cy={y} r={(6.5 + 16 * kk) * (1 - cv * 0.5)} fill="url(#s12glow)" opacity={0.6 * kk * twinkle} />}
            {ring > 0 && ring < 1 && cv === 0 && <circle cx={p.x} cy={p.y} r={6 + 26 * ring} fill="none" stroke={PB.citron} strokeWidth={3 * (1 - ring)} opacity={0.8 * (1 - ring)} />}
            {kk > 0.02 && <circle cx={x} cy={y} r={6.5 * (0.6 + 0.6 * Math.max(0, k)) * (1 - cv * 0.4)} fill={col} />}
            {kk > 0.5 && cv < 0.5 && <circle cx={p.x - 1.8} cy={p.y - 1.8} r={2} fill="#FFFFFF" opacity={0.6 * (kk - 0.5) * 2} />}
          </g>
        );
      })}
      {PLUS.map((i) => {
        const u = (t - LIT_AT[i]) / 0.7;
        if (u < 0 || u > 1 || t > CONV) return null;
        const p = FRANCE_DOTS[i];
        return (
          <text key={`plus${i}`} x={p.x + 10} y={p.y - 14 - 50 * SNAP(u)} fontFamily={JAKARTA} fontWeight={800} fontSize={34} fill={PB.citron} opacity={Math.min(1, u * 6) * (1 - u) * 1.2}>
            +1
          </text>
        );
      })}
    </svg>
  );
}

/** Les écrans qui se replient : un point vert file de chaque écran jusqu'à sa ville. */
function Seeds({ t }: { t: number }) {
  return (
    <>
      {SCREENS.map((s, i) => {
        const start = SEED_START(i);
        if (t < start || t > seedArrive(i) + 0.05) return null;
        const u = prog(t, start, SEED_DUR, IN_OUT);
        const to = toScreen(FRANCE_DOTS[CITY[i]]);
        const ctrl = { x: (s.x + to.x) / 2, y: Math.min(s.y, to.y) - 160 };
        const p = quad(s, ctrl, to, u);
        const r = lerp(16, 7, u);
        return <div key={i} style={{ position: "absolute", left: p.x - r, top: p.y - r, width: 2 * r, height: 2 * r, borderRadius: 99, background: PB.stock, boxShadow: `0 0 24px 8px ${rgba(PB.stock, 0.6)}, 0 0 0 4px ${rgba(PB.citron, 0.5)}` }} />;
      })}
    </>
  );
}

// ---- Le compteur des ventes (exemple) ----------------------------------------------------------------------------
const COUNTER = { x: 1468, y: 478 };

function SalesCounter({ t }: { t: number }) {
  const IN = COLLAPSE + 0.24;
  if (t < IN) return null;
  const k = prog(t, IN, 0.5, SNAP);
  const out = prog(t, CONV - 0.04, 0.32, EXIT);
  const stamp = keys(t, [[COMPTEE - 0.04, 0], [COMPTEE + 0.06, 1.7, SNAP], [COMPTEE + 0.2, 0.94, SNAP], [COMPTEE + 0.32, 1, IN_OUT]]);
  const hit = pulse(t, COMPTEE + 0.06, 0.03, 0.04, 0.4);
  const tick = Math.max(...PLUS.map((i) => pulse(t, LIT_AT[i], 0.03, 0.02, 0.2)));
  return (
    <div style={{ position: "absolute", left: COUNTER.x, top: COUNTER.y, transform: `translate(-50%, -50%) translateX(${(1 - k) * 420 + out * 700}px) rotate(${(1 - k) * 6 + wobble(t, 9, 0.8, 0.8)}deg) scale(${1 + 0.025 * hit})`, opacity: clamp01(k * 2) * (1 - out) }}>
      <div style={{ position: "relative", width: 560, boxSizing: "border-box", padding: "34px 40px 36px", borderRadius: 36, background: `linear-gradient(150deg, ${PB.teal} 0%, ${PB.green2} 70%)`, boxShadow: `inset 0 0 0 2px ${rgba(PB.mint, 0.25 + 0.4 * hit)}, 0 0 ${60 * hit}px ${rgba(PB.citron, 0.4)}, 0 40px 80px -30px rgba(0,0,0,.65)` }}>
        <div style={{ ...label(21), color: rgba("#FFFFFF", 0.72) }}>Ventes du challenge</div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "flex-end", gap: 18 }}>
          <Odometer t={t} value={sales} digits={String(Math.floor(sales(t) + 0.02)).length} size={150} color="#FFFFFF" style={{ transform: `scale(${1 + 0.03 * tick})`, transformOrigin: "0 100%" }} />
        </div>
        <div style={{ marginTop: 10, fontFamily: JAKARTA, fontWeight: 700, fontSize: 32, color: rgba("#FFFFFF", 0.86) }}>ventes comptées</div>
        <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 14 }}>
          <Chip t={t} kind="challenge" text="Votre marque" at={IN + 0.3} size={24} onDark />
          <span style={{ padding: "6px 12px", borderRadius: 99, background: rgba("#FFFFFF", 0.14), color: rgba("#FFFFFF", 0.8), fontFamily: JAKARTA, fontWeight: 700, fontSize: 16, letterSpacing: "0.08em" }}>EXEMPLE</span>
        </div>
        {stamp > 0.01 && (
          <div style={{ position: "absolute", right: -44, top: -62, display: "inline-flex", alignItems: "center", gap: 10, height: 70, padding: "0 26px 0 16px", borderRadius: 99, background: PB.citron, color: PB.green, fontFamily: JAKARTA, fontWeight: 800, fontSize: 32, letterSpacing: "-0.01em", boxShadow: `inset 0 0 0 3px ${PB.green}, 0 16px 34px -12px rgba(0,0,0,.55), 0 0 30px ${rgba(PB.citron, 0.5)}`, transform: `rotate(-8deg) scale(${stamp})`, opacity: clamp01(stamp * 3) }}>
            <Check size={38} strokeWidth={3.6} />
            Comptée
          </div>
        )}
      </div>
    </div>
  );
}

// ---- La scène ----------------------------------------------------------------------------------------------------
export function Scene({ t }: { t: number }) {
  const panK = prog(t, PAN, PAN_DUR, WHIP);
  const gx = 1920 * (1 - panK);
  const cam = {
    zoom: keys(t, [[61.8, 1], [COLLAPSE, 1.05, IN_OUT], [COLLAPSE + 0.4, 0.99, SNAP], [CONV, 1.03, IN_OUT]]),
    shakes: [
      { at: CARD_AT + 0.04, amp: 7 },
      { at: SCAN0 + 0.14, amp: 4 },
      { at: COMPTEE + 0.06, amp: 7 },
    ],
  };
  const iris = prog(t, IRIS, IRIS_DUR, EXIT);
  const R = lerp(1150, 0, iris);
  // Le cœur lumineux grandit à mesure que les points arrivent (et non avant).
  const core = keys(t, [[CONV + 0.16, 0], [IRIS + IRIS_DUR - 0.04, 1, IN_OUT]]);
  const tagFade = 1 - prog(t, CONV, 0.25, SNAP);
  return (
    <AbsoluteFill style={{ clipPath: iris > 0 ? `circle(${R.toFixed(1)}px at ${CENTER.x}px ${CENTER.y}px)` : undefined }}>
      <Camera t={t} {...cam} depth={0.35}>
        <Backdrop t={t} />
      </Camera>
      <Camera t={t} {...cam}>
        <Ring t={t} at={CARD_AT + 0.05} x={CENTER.x} y={470} max={1000} color={PB.gold} width={6} life={0.6} />
        <Sparks t={t} at={CARD_AT + 0.06} x={CENTER.x} y={470} count={26} seed="s12card" speed={1200} spread={180} color={PB.goldHi} len={30} life={0.55} width={4} />
        <ChallengeCard t={t} />
        <Wall t={t} gx={gx} />
        {SCREENS.map((s, i) => (
          <Ring key={`r${i}`} t={t} at={scanAt(i) + 0.16} x={s.x} y={s.y} max={520} color={PB.gold} width={4} life={0.5} echo={false} />
        ))}
        {SCREENS.map((s, i) => (
          <Sparkle key={`sp${i}`} t={t} at={landAt(i) + 0.12} x={s.x + SW / 2 - 30} y={s.y - 92} size={56} color={PB.goldHi} />
        ))}
        <Planes t={t} gx={gx} />
        <GreenMap t={t} />
        <Seeds t={t} />
        <SalesCounter t={t} />
        <Ring t={t} at={COMPTEE + 0.06} x={COUNTER.x + 150} y={COUNTER.y - 200} max={420} color={PB.citron} width={5} life={0.5} />
        <Converge t={t} at={CONV} dur={0.5} x={CENTER.x} y={CENTER.y} count={44} seed="s12conv" radius={760} color={PB.citron} size={5} />
        {core > 0 && (
          <div style={{ position: "absolute", left: CENTER.x - 260, top: CENTER.y - 260, width: 520, height: 520, borderRadius: "50%", opacity: core, transform: `scale(${0.3 + 0.7 * core})`, background: `radial-gradient(circle, #FFFFFF 0%, ${rgba(PB.citron, 0.9)} 10%, ${rgba(PB.stock, 0.35)} 32%, transparent 62%)` }} />
        )}
      </Camera>
      <div className="s12chap" style={{ position: "absolute", inset: 0, opacity: tagFade }}>
        {/* Contournement d'un défaut du kit (ChapterTitle) : avant de monter, le mot en accent dépasse de son masque (le
            coin du « M », tourné de 6°, et le bas de sa lueur citron, coupé net) : un trait lumineux sous le titre de
            59,65 à 60,05. On cache ce mot tant qu'il ne monte pas, et sa lueur n'arrive qu'avec lui. */}
        <style>{`.s12chap span[style*="text-shadow"] { visibility: ${t < CH + 0.3 ? "hidden" : "visible"}; text-shadow: 0 0 40px ${rgba(PB.citron, 0.35 * prog(t, CH + 0.3, 0.3, IN_OUT))} !important; }`}</style>
        <ChapterTitle t={t} at={CH} n="3/3" text="POUR LES *MARQUES*" exitAt={CH_EXIT} />
      </div>
      <Mention t={t} from={CARD_AT} to={CONV + 0.15} />
    </AbsoluteFill>
  );
}

// ---- Les bruitages -----------------------------------------------------------------------------------------------
const BIPS = SCREENS.map((_, i) => cue("scanner-bip", scanAt(i), 0.3, 0.94 + 0.16 * hash("s12bip", i)));
const PINGS = Array.from({ length: 9 }, (_, j) => cue("carte-ping", seedArrive(SCAN_ORDER[0]) + 0.02 + j * ((LAST_LIT - seedArrive(SCAN_ORDER[0]) - 0.02) / 8), 0.2 + 0.06 * hash("s12ping", j), 0.88 + 0.32 * hash("s12pingr", j)));

export const cues: Cue[] = [
  cue("pop-leger", CH + 0.12, 0.35), // « 3/3 »
  cue("swoosh", CH_EXIT - 0.02, 0.3), // le panneau file, le titre se range
  cue("piece", CARD_AT - 0.02, 0.5), // la carte or claque (juste avant « challenges »)
  cue("scintillement", CARD_AT + 0.3, 0.2),
  cue("papier", LAUNCH - 0.02, 0.32), // elle se plie
  cue("avion-papier", LAUNCH + 0.06, 0.55), // l'avion part
  cue("whoosh-pb", PAN, 0.3), // la caméra glisse sur le mur d'écrans
  ...[0, 2, 4, 6].map((k) => cue("pop-leger", SPLIT + LEG + k * STEP_LAND, 0.22, 1 + k * 0.03)), // les avions plongent
  ...BIPS, // « au bon moment » : un bip par comptoir
  cue("ui-ding", SCAN0 + 7 * SCAN_STEP + 0.12, 0.42),
  cue("balayage-mini", COLLAPSE, 0.38), // les écrans se replient
  cue("machine-a-sous", seedArrive(SCAN_ORDER[0]) - 0.04, 0.36, 1, LAST_LIT + 0.12 - (seedArrive(SCAN_ORDER[0]) - 0.04)), // le compteur roule, et s'arrête avec lui
  ...PINGS, // la carte s'allume
  cue("tampon", COMPTEE - 0.05, 0.42), // « ✓ Comptée »
  cue("aspiration", IRIS + IRIS_DUR - 1.38, 0.4), // tout converge vers le logo de S13
];
