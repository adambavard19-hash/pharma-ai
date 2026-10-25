import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { BadgePercent, CalendarCheck, ScanLine, type LucideIcon } from "lucide-react";
import { Mention } from "../../presentation/motion/kit/mention";
import {
  AdnBackdrop,
  AppCures,
  AppHome,
  AppScan,
  AppWelcome,
  Camera,
  Dust,
  EXIT,
  JAKARTA,
  OfferCard,
  PB,
  PBLogo,
  Phone,
  Ring,
  SNAP,
  SoonBadge,
  Sparkle,
  Sparks,
  WHIP,
  clamp01,
  cue,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  wobble,
  type Cue,
} from "../kit";

/* ==========================================================================
 * S11 · L'APPLICATION (53,3 → 60,1) — N10 : « Et bientôt, l'application PharmaBoost : scanner ses boîtes, suivre ses
 * cures, profiter d'offres. »
 *
 *   BIENTÔT     53,58 : la pastille citron CLAQUE au centre, énorme (onde, étincelles, secousse), puis file en arc se
 *               garer en haut à gauche (54,1) — elle y reste, respire et brille jusqu'à la fin de la scène.
 *   L'APPLI     54,16 : le téléphone de héros monte du bas en tournant en 3D et se pose (écran de bienvenue : le robot,
 *               « Votre pharmacie, dans la poche. ») ; « L'application » monte à gauche (54,28), le logo PharmaBoost
 *               claque sur le mot (54,99) ; le titre se range en haut (55,62).
 *   SCANNER     le téléphone fait un tour (55,96) : le viseur, le laser, la boîte verrouillée sur « boîtes » (56,65) ;
 *               la ligne « Scanner ses boîtes » arrive à gauche.
 *   CURES       nouveau tour (57,02) : « Mes cures », les anneaux se remplissent ; ligne « Suivre ses cures ».
 *   OFFRES      nouveau tour (58,12) : l'accueil de l'appli ; ligne « Profiter d'offres » ; le bon « −2 € » JAILLIT du
 *               téléphone (58,44) et se pose à droite, sans aucune marque (étiquette « EXEMPLE » de la carte).
 *   SORTIE      59,65 → 59,99 : la scène est balayée vers la gauche par un bord oblique citron, exactement le bord du
 *               panneau du chapitre « 3/3 · POUR LES MARQUES » de S12 (même `at`, même courbe) : un seul balayage.
 * ======================================================================== */

// ---- Les temps (secondes du film, mots de mots.json) -------------------------------------------------------------
const PILL_AT = 53.58; // « bientôt » 53,64
const PILL_FLY = 54.1;
const RISE = 54.16; // « l'application » 54,31
const TITLE_AT = 54.27;
const WELCOME_AT = 54.22; // l'écran se remplit pendant la montée ; le robot cligne de l'œil à 54,92
const LOGO_AT = 54.99; // « PharmaBoost » 55,01
const SHRINK = 55.62;
const FLIPS = [55.96, 57.02, 58.12] as const; // l'écran change au milieu du tour
const SCAN_AT = 55.75; // verrouillage à SCAN_AT + 0,9 = 56,65, sur « boîtes » (56,65)
// Les écrans démarrent AVANT le milieu du tour (57,02 et 58,12) : quand le téléphone refait face, ils sont déjà en
// train de se remplir (sinon on voit un écran vide pendant 0,2 s).
const CURES_AT = 56.8; // anneaux : 57,0 → 57,9 (« cures » 57,78)
const HOME_AT = 57.88; // la ligne « −2 € » de l'appli arrive vers 58,3, juste avant que le bon en jaillisse
const OUT = 58.44; // le bon jaillit (« d'offres » 58,78)
/** Le `at` du titre de chapitre de S12 : la sortie de S11 suit son panneau au pixel près. */
const NEXT_CHAPTER = 59.7;

const ROWS: { at: number; Icon: LucideIcon; head: string; tail: string }[] = [
  { at: 56.07, Icon: ScanLine, head: "Scanner", tail: "ses boîtes" }, // « scanner » 56,09
  { at: 57.12, Icon: CalendarCheck, head: "Suivre", tail: "ses cures" }, // « suivre » 57,14
  { at: 58.25, Icon: BadgePercent, head: "Profiter", tail: "d’offres" }, // « profiter » 58,28
];

// ---- La géométrie ------------------------------------------------------------------------------------------------
const PH = { x: 1236, y: 484 };
const LEFT = 150;
const ROW_TOP = 474;
const ROW_H = 118;
const PILL_PARK = { x: 290, y: 168 };
const COUPON = { x: 1606, y: 596 };

const qb = (a: number, b: number, c: number, u: number) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c;

// ---- Le fond -----------------------------------------------------------------------------------------------------
function Backdrop({ t }: { t: number }) {
  const slam = pulse(t, PILL_AT, 0.05, 0.05, 0.6);
  const flip = Math.max(...FLIPS.map((T) => pulse(t, T - 0.05, 0.08, 0, 0.4)));
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 95% at 62% 46%, ${PB.green2} 0%, ${PB.green} 52%, #071B17 100%)` }}>
      <AdnBackdrop t={t} tone="night" width={1500} focus={[0.66, 0.5]} opacity={0.4} style={{ background: "transparent" }} />
      {/* « BIENTÔT » en filigrane qui défile derrière tout. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 412,
          whiteSpace: "nowrap",
          fontFamily: JAKARTA,
          fontWeight: 800,
          fontSize: 250,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `2.5px ${rgba(PB.citron, 0.07 + 0.3 * slam + 0.06 * flip)}`,
          transform: `translateX(${-260 - (t - 53.3) * 120}px) scale(${1 + 0.06 * slam})`,
          transformOrigin: "40% 50%",
        }}
      >
        BIENTÔT · BIENTÔT · BIENTÔT · BIENTÔT
      </div>
      <Dust t={t} count={34} seed="s11dust" color={PB.citron} alpha={0.22} size={[1.5, 3.5]} speed={0.08} />
    </AbsoluteFill>
  );
}

// ---- Le téléphone ------------------------------------------------------------------------------------------------
function phoneTilt(t: number, base: number) {
  for (const T of FLIPS) {
    if (t >= T - 0.15 && t < T) return lerp(base, 90, EXIT((t - (T - 0.15)) / 0.15));
    if (t >= T && t < T + 0.32) return lerp(-90, base, SNAP((t - T) / 0.32));
  }
  return base;
}

function HeroPhone({ t }: { t: number }) {
  if (t < RISE) return null;
  const r = ressort(t, RISE, { damping: 14, stiffness: 150, mass: 0.85 });
  const spin = prog(t, RISE, 0.8, SNAP);
  const y = lerp(1640, PH.y, r);
  const base = lerp(-82, -15, spin) + wobble(t, 21, 5, 0.45);
  const tilt = phoneTilt(t, base);
  const rot = lerp(16, -2, spin);
  const pitch = lerp(18, 5, spin) + wobble(t, 5, 2, 0.4);
  const edge = Math.max(...FLIPS.map((T) => pulse(t, T - 0.1, 0.1, 0, 0.16)));
  const blur = Math.max((1 - prog(t, RISE, 0.36, SNAP)) * 7, edge * 2.5);
  const squeeze = 1 - 0.035 * edge;
  let screen: ReactNode;
  if (t < FLIPS[0]) screen = <AppWelcome t={t} at={WELCOME_AT} />;
  else if (t < FLIPS[1]) screen = <AppScan t={t} at={SCAN_AT} />;
  else if (t < FLIPS[2]) screen = <AppCures t={t} at={CURES_AT} />;
  else screen = <AppHome t={t} at={HOME_AT} />;
  const scanning = t >= FLIPS[0] && t < FLIPS[1];
  return (
    <Phone t={t} x={PH.x} y={y} scale={squeeze} tilt={tilt} pitch={pitch} rot={rot} statusTone={scanning ? "light" : "dark"} style={{ filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined }}>
      {screen}
    </Phone>
  );
}

/** Le halo derrière le téléphone : il respire, s'allume à chaque tour. */
function Halo({ t }: { t: number }) {
  if (t < RISE) return null;
  const on = prog(t, RISE + 0.2, 0.6, SNAP);
  const flip = Math.max(...FLIPS.map((T) => pulse(t, T - 0.06, 0.08, 0.02, 0.45)));
  const lock = pulse(t, SCAN_AT + 0.9, 0.04, 0.04, 0.5);
  const size = 1060 * (1 + 0.04 * Math.sin(t * 2.1)) * (1 + 0.08 * flip);
  return (
    <div
      style={{
        position: "absolute",
        left: PH.x - size / 2,
        top: PH.y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        opacity: on,
        background: `radial-gradient(circle, ${rgba(PB.mint, 0.2 + 0.18 * flip)} 0%, ${rgba(PB.citron, 0.08 + 0.2 * lock + 0.1 * flip)} 30%, transparent 64%)`,
      }}
    />
  );
}

// ---- La pastille « BIENTÔT » -------------------------------------------------------------------------------------
function Soon({ t }: { t: number }) {
  if (t < PILL_AT) return null;
  const fly = prog(t, PILL_FLY, 0.46, WHIP);
  const x = qb(960, 470, PILL_PARK.x, fly);
  const y = qb(468, 110, PILL_PARK.y, fly);
  const scale = lerp(2.55, 1.15, fly);
  const glow = pulse(t, PILL_AT, 0.04, 0.06, 0.5);
  return (
    <>
      {glow > 0 && (
        <div style={{ position: "absolute", left: 960 - 700, top: 468 - 700, width: 1400, height: 1400, borderRadius: "50%", opacity: glow, background: `radial-gradient(circle, ${rgba(PB.citron, 0.45)} 0%, ${rgba(PB.citron, 0.12)} 30%, transparent 62%)` }} />
      )}
      <Ring t={t} at={PILL_AT + 0.03} x={960} y={468} max={1100} color={PB.citron} width={7} life={0.6} />
      <Sparks t={t} at={PILL_AT + 0.04} x={960} y={468} count={28} seed="s11pill" speed={1300} spread={180} angle={-90} color={PB.citron} len={34} life={0.55} width={4} />
      <SoonBadge t={t} at={PILL_AT} x={x} y={y} scale={scale} rot={-4 - 10 * Math.sin(Math.PI * fly)} />
      <Sparkle t={t} at={PILL_FLY + 0.44} x={PILL_PARK.x + 128} y={PILL_PARK.y - 30} size={54} color={PB.citron} />
    </>
  );
}

// ---- Le titre, les trois lignes ----------------------------------------------------------------------------------
function Title({ t }: { t: number }) {
  if (t < TITLE_AT) return null;
  const k = prog(t, TITLE_AT, 0.5, SNAP);
  const sh = prog(t, SHRINK, 0.38, SNAP);
  const s = lerp(1, 0.56, sh);
  const top = lerp(316, 246, sh);
  const ul = prog(t, TITLE_AT + 0.25, 0.5, SNAP) * (1 - sh);
  return (
    <div style={{ position: "absolute", left: LEFT, top, transform: `scale(${s})`, transformOrigin: "0 0" }}>
      <div style={{ overflow: "hidden", padding: "6px 8px 14px 0" }}>
        <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 112, letterSpacing: "-0.045em", lineHeight: 0.95, color: "#FFFFFF", whiteSpace: "nowrap", transform: `translateY(${(1 - k) * 115}%) rotate(${(1 - k) * 5}deg)`, transformOrigin: "0 100%", opacity: clamp01(k * 2.5) }}>
          L’application
        </div>
      </div>
      <div style={{ width: 610, height: 9, borderRadius: 99, background: PB.citron, transform: `scaleX(${ul})`, transformOrigin: "0 50%", marginTop: -4, opacity: 1 - sh }} />
      <div style={{ marginTop: 16, height: 130 }}>
        <PBLogo t={t} at={LOGO_AT} size={98} tone="dark" />
      </div>
    </div>
  );
}

function Rows({ t }: { t: number }) {
  return (
    <>
      {ROWS.map((row, i) => {
        if (t < row.at - 0.02) return null;
        const next = ROWS[i + 1]?.at ?? Infinity;
        const active = t < next;
        const dim = prog(t, next, 0.3, SNAP);
        const pop = ressort(t, row.at, { damping: 10, stiffness: 280, mass: 0.55 });
        const k = prog(t, row.at + 0.03, 0.42, SNAP);
        const flash = pulse(t, row.at, 0.06, 0.04, 0.4);
        const bar = prog(t, row.at + 0.12, 0.7, SNAP) * (1 - dim);
        const { Icon } = row;
        return (
          <div key={i} style={{ position: "absolute", left: LEFT, top: ROW_TOP + i * ROW_H, height: 96, display: "flex", alignItems: "center", gap: 28, opacity: 1 - 0.5 * dim }}>
            <div
              style={{
                position: "relative",
                width: 92,
                height: 92,
                borderRadius: 28,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: active ? PB.citron : rgba("#FFFFFF", 0.08),
                boxShadow: active ? `0 0 ${30 + 30 * flash}px ${rgba(PB.citron, 0.45 + 0.4 * flash)}, inset 0 0 0 3px ${PB.green}` : `inset 0 0 0 2px ${rgba(PB.citron, 0.35)}`,
                transform: `scale(${Math.max(0, pop)}) rotate(${(1 - clamp01(pop)) * -25 + (active ? wobble(t, 9 + i, 4, 1.2) : 0)}deg)`,
              }}
            >
              <Icon size={50} color={active ? PB.green : PB.citron} strokeWidth={2.4} />
            </div>
            <div style={{ position: "relative", overflow: "hidden", padding: "4px 12px 14px 0" }}>
              <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 64, letterSpacing: "-0.035em", lineHeight: 1, whiteSpace: "nowrap", transform: `translateY(${(1 - k) * 105}%)`, clipPath: `inset(-20% ${((1 - k) * 100).toFixed(1)}% -20% 0)` }}>
                <span style={{ color: active ? PB.citron : "#FFFFFF" }}>{row.head}</span>
                <span style={{ color: "#FFFFFF" }}> {row.tail}</span>
              </div>
              <div style={{ position: "absolute", left: 0, bottom: 2, height: 6, width: "calc(100% - 12px)", borderRadius: 99, background: PB.citron, transform: `scaleX(${bar})`, transformOrigin: "0 50%" }} />
            </div>
            {active && <Sparkle t={t} at={row.at + 0.08} x={64} y={-6} size={48} color={PB.citron} />}
          </div>
        );
      })}
    </>
  );
}

// ---- Le bon « −2 € » qui jaillit du téléphone --------------------------------------------------------------------
function Coupon({ t }: { t: number }) {
  if (t < OUT) return null;
  const k = ressort(t, OUT, { damping: 15, stiffness: 165, mass: 0.75 });
  const kk = clamp01(k);
  const x = lerp(PH.x + 10, COUPON.x, k);
  const y = lerp(PH.y + 250, COUPON.y, k) - 170 * Math.sin(Math.PI * kk);
  const scale = lerp(0.35, 1.14, k);
  const rot = lerp(-14, 7, k) + wobble(t, 31, 2, 0.9);
  const trail = 1 - prog(t, OUT + 0.15, 0.45, SNAP);
  const bob = wobble(t, 17, 8, 0.7);
  // La traînée : l'arc parcouru, du téléphone jusqu'au bon.
  const pts = Array.from({ length: 18 }, (_, i) => {
    const u = (i / 17) * kk;
    return [lerp(PH.x + 10, COUPON.x, u), lerp(PH.y + 250, COUPON.y, u) - 170 * Math.sin(Math.PI * u)];
  });
  return (
    <>
      {trail > 0 && (
        <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <path d={pts.map(([px, py], i) => `${i ? "L" : "M"} ${px.toFixed(1)} ${py.toFixed(1)}`).join(" ")} fill="none" stroke={PB.citron} strokeWidth={10} strokeLinecap="round" strokeDasharray="2 22" opacity={0.85 * trail} />
        </svg>
      )}
      <OfferCard t={t} x={x} y={y + bob * kk} scale={scale} rot={rot} notch={PB.green} style={{ opacity: clamp01((t - OUT) / 0.06) }} />
      <Sparks t={t} at={OUT + 0.22} x={COUPON.x} y={COUPON.y} count={22} seed="s11coupon" speed={900} spread={180} color={PB.citron} len={26} life={0.5} width={3} />
      <Ring t={t} at={OUT + 0.24} x={COUPON.x} y={COUPON.y} max={640} color={PB.citron} width={5} life={0.55} />
      <Sparkle t={t} at={OUT + 0.3} x={COUPON.x - 190} y={COUPON.y - 120} size={60} color={PB.citron} />
      <Sparkle t={t} at={OUT + 0.4} x={COUPON.x + 200} y={COUPON.y + 40} size={44} color="#FFFFFF" />
      <Sparkle t={t} at={OUT + 0.9} x={COUPON.x - 60} y={COUPON.y - 170} size={40} color={PB.citron} />
    </>
  );
}

// ---- La scène ----------------------------------------------------------------------------------------------------
export function Scene({ t }: { t: number }) {
  const cam = {
    zoom: lerp(1, 1.035, prog(t, 53.3, 6.3, (x) => x)),
    shakes: [
      { at: PILL_AT + 0.02, amp: 11 },
      { at: RISE + 0.5, amp: 6 },
      { at: LOGO_AT + 0.17, amp: 5 },
      { at: SCAN_AT + 0.92, amp: 4 },
      { at: OUT + 0.2, amp: 6 },
    ],
  };
  // La sortie : le bord du panneau du chapitre de S12 (ChapterTitle : L = lerp(2400, −320, WHIP), pente de 260 px).
  const kx = prog(t, NEXT_CHAPTER - 0.05, 0.34, WHIP);
  const E = lerp(2400, -320, kx);
  const wiping = kx > 0;
  return (
    <AbsoluteFill style={{ clipPath: wiping ? `polygon(-400px 0, ${E.toFixed(1)}px 0, ${(E - 260).toFixed(1)}px 1080px, -400px 1080px)` : undefined }}>
      <AbsoluteFill style={{ transform: wiping ? `translateX(${(-210 * kx).toFixed(1)}px)` : undefined }}>
        <Camera t={t} {...cam} depth={0.35}>
          <Backdrop t={t} />
        </Camera>
        <Camera t={t} {...cam}>
          <Halo t={t} />
          <Ring t={t} at={RISE + 0.5} x={PH.x} y={PH.y + 60} max={900} color={PB.mint} width={4} life={0.6} />
          {FLIPS.map((T) => (
            <Ring key={T} t={t} at={T} x={PH.x} y={PH.y} max={760} color={PB.citron} width={3} life={0.45} echo={false} />
          ))}
          <HeroPhone t={t} />
          <Ring t={t} at={LOGO_AT + 0.12} x={LEFT + 66} y={500} max={420} color={PB.citron} width={5} life={0.5} />
          <Title t={t} />
          <Rows t={t} />
          <Sparkle t={t} at={SCAN_AT + 0.95} x={PH.x + 150} y={PH.y - 205} size={70} color={PB.citron} />
          <Coupon t={t} />
        </Camera>
        <Camera t={t} {...cam} depth={0.5}>
          <Soon t={t} />
        </Camera>
        <Mention t={t} from={FLIPS[2]} to={60.2} />
      </AbsoluteFill>
      {wiping && kx < 1 && <AbsoluteFill style={{ background: PB.citron, clipPath: `polygon(${(E - 70).toFixed(1)}px 0, ${E.toFixed(1)}px 0, ${(E - 260).toFixed(1)}px 1080px, ${(E - 330).toFixed(1)}px 1080px)` }} />}
    </AbsoluteFill>
  );
}

// ---- Les bruitages -----------------------------------------------------------------------------------------------
export const cues: Cue[] = [
  cue("pop-long", PILL_AT - 0.02, 0.6), // BIENTÔT claque
  cue("scintillement", PILL_AT + 0.04, 0.28),
  cue("swoosh", PILL_FLY, 0.32), // la pastille se gare
  cue("whoosh-pb", RISE, 0.5), // le téléphone monte en tournant
  cue("attrape", RISE + 0.48, 0.35), // il se pose
  cue("impact-net", LOGO_AT - 0.06, 0.4), // le logo claque (juste avant « PharmaBoost »)
  cue("robot-boing", LOGO_AT + 0.05, 0.28),
  cue("balayage-mini", SHRINK - 0.02, 0.28), // le titre se range
  cue("swoosh", FLIPS[0] - 0.14, 0.34, 1.05), // 1er tour du téléphone
  cue("ui-pop", ROWS[0].at, 0.42),
  cue("scan-laser", SCAN_AT + 0.24, 0.42),
  cue("verrou-hud", SCAN_AT + 0.88, 0.5), // la boîte est reconnue
  cue("swoosh", FLIPS[1] - 0.14, 0.3, 0.95), // 2e tour
  cue("ui-pop", ROWS[1].at, 0.4, 1.06),
  cue("laser-ecrit", FLIPS[1] + 0.04, 0.2), // les anneaux se remplissent
  cue("swoosh", FLIPS[2] - 0.14, 0.3, 1.1), // 3e tour
  cue("ui-pop", ROWS[2].at, 0.4, 1.12),
  cue("swipe-tel", OUT - 0.02, 0.55), // le bon jaillit
  cue("etincelle", OUT + 0.2, 0.42),
  cue("whoosh-rapide", NEXT_CHAPTER - 0.08, 0.5), // le balayage vers S12
];
