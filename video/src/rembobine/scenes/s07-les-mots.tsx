import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import {
  AdnBackdrop,
  BANNER_CARD,
  BRAND_GRAD,
  BannerCard,
  Burst,
  Camera,
  Chip,
  Coins,
  Cursor,
  JAKARTA,
  PB,
  Ring,
  SCREEN_UI,
  SET,
  Sparkle,
  Sparks,
  clamp01,
  cue,
  keys,
  lerp,
  prog,
  pulse,
  rgba,
  wobble,
  EXIT,
  IN_OUT,
  LINEAR,
  SNAP,
  WHIP,
  type BannerTab,
  type ChipKind,
  type ChipSpec,
  type Cue,
} from "../kit";
import { Mention } from "../../presentation/motion/kit/mention";

/* ==========================================================================
 * S7 · LES QUESTIONS, LES MOTS (30,0 → 35,8) — N6 « Les questions à poser. Les mots à dire. La marge, le challenge,
 * la date courte. »
 *
 * La grande carte de la bannière (Questions · Discours · Fiche) sur le papier de l'hélice d'ADN, à gauche ; à droite,
 * la « scène » où chaque mot dit prend corps.
 *   30,04 → 30,5   relais de S6 (qui s'efface sur nous) : la carte se déplie depuis la ligne ① EXACTEMENT comme dans
 *                  S6 (960, 470, ×0,98), puis glisse à sa place (à gauche) pendant que la scène s'éclaire.
 *   « questions »  clic sur l'onglet Questions (halo citron), les deux questions arrivent ; à droite « Les questions /
 *                  à poser. » ; un trait sarcelle entoure les questions dans la carte.
 *   « mots »       clic sur l'onglet Discours (la vraie bascule d'onglet), la phrase s'écrit ; « Les mots / à dire. ».
 *   « marge » / « challenge » / « date courte »   chaque pastille CLAQUE en grand sur la scène (onde, gerbe, grand mot
 *                  en contour derrière, pièces d'or pour le challenge), puis file se ranger à sa place dans la carte,
 *                  à la fin du mot (la carte encaisse, étincelle) : les trois pastilles finissent en ligne, comme sur la
 *                  vraie carte.
 *   35,3 → 35,8    SORTIE : dézoom rapide — tout le cadre devient l'écran du comptoir de S8 (même perspective, 18°).
 *
 * Le monde de cette scène (<CardWorld/>) est exporté : S8 le montre dans l'écran du comptoir et y replonge pour le gros
 * plan sur « Vendu ». screenMap(k) donne la correspondance cadre ↔ écran du comptoir (partagée avec S8).
 * Mention « Illustration · exemples » (stock, marge, challenge) en haut à droite, en encre sombre (fond clair).
 * ======================================================================== */

const NB = "\u00A0"; // espace insécable
const NNB = "\u202F"; // espace fine insécable
const AMOXI = `Amoxicilline 1${NB}g`;

/** Les temps (secondes du film), calés sur mots.json (N6). */
export const S7_T = {
  unfold: 30.04, // la carte se déplie (même instant que S6)
  glide: 30.46, // elle glisse à sa place
  qTab: 30.36, // « questions » : clic sur l'onglet
  q1: 30.44,
  q2: 30.86, // « poser »
  h1Out: 31.22,
  dTab: 31.42, // clic sur Discours (« mots » 31,46)
  mots: 31.46,
  dire: 31.73,
  disc: 31.62, // la phrase s'écrit…
  discDur: 1.5,
  h2Out: 32.28,
  out: 35.3, // dézoom vers le comptoir
  end: 35.8,
} as const;

type Hero = { kind: ChipKind; text: string; word: string; at: number; fly: number; land: number; scale: number; color: string };
/** Chaque pastille : elle claque sur son mot, file à la fin du mot, se pose dans la carte. */
const HEROES: Hero[] = [
  { kind: "marge", text: `Marge +4,20${NNB}€`, word: "MARGE", at: 32.75, fly: 33.08, land: 33.34, scale: 2.35, color: PB.brand },
  { kind: "challenge", text: `Challenge · +1${NNB}€ par boîte pour l'équipe`, word: "CHALLENGE", at: 33.52, fly: 33.94, land: 34.2, scale: 1.42, color: PB.gold },
  { kind: "date", text: "Date courte", word: "DATE COURTE", at: 34.4, fly: 34.78, land: 35.04, scale: 2.35, color: PB.date },
];
const [H_MARGE, H_CHAL, H_DATE] = HEROES;

/** Les pastilles de la carte : le stock (déjà vu dans S6), puis celles qui se posent. */
const CHIPS: ChipSpec[] = [
  { kind: "stock", text: "12 en stock", at: S7_T.unfold + 0.18 },
  { kind: "marge", text: H_MARGE.text, at: H_MARGE.land - 0.09 },
  { kind: "challenge", text: H_CHAL.text, at: H_CHAL.land - 0.09 },
  { kind: "date", text: H_DATE.text, at: H_DATE.land - 0.09 },
];

const QUESTIONS = [
  { text: `Avez-vous déjà eu des troubles digestifs avec un antibiotique${NB}?`, at: S7_T.q1 },
  { text: `Prenez-vous déjà un probiotique${NB}?`, at: S7_T.q2 },
];
const DISCOURS = { text: "Avec un antibiotique, la flore intestinale peut être perturbée. Je vous conseille un probiotique pendant le traitement.", at: S7_T.disc, dur: S7_T.discDur };

/* ------------------------------------------------------------------ géométrie */

/** La carte à sa place (centre, échelle) ; la scène à droite. */
const HOME = { x: 606, y: 504, s: 0.92 } as const;
/** La pose de la carte à la fin de S6 (Unfold : 960, 470, ×0,98, depuis la ligne ① de la capsule). */
const S6_FROM = { x: 1240, y: 394, s: 0.62 } as const;
const S6_TO = { x: 960, y: 470, s: 0.98 } as const;
const STAGE = { x: 1462, y: 452 } as const;

function cardPose(t: number) {
  const u = prog(t, S7_T.unfold, 0.3, SNAP);
  const g = prog(t, S7_T.glide, 0.52, SNAP);
  return {
    x: lerp(lerp(S6_FROM.x, S6_TO.x, u), HOME.x, g),
    y: lerp(lerp(S6_FROM.y, S6_TO.y, u), HOME.y, g),
    s: lerp(lerp(S6_FROM.s, S6_TO.s, u), HOME.s, g),
  };
}

/** Repères de la carte (px depuis son coin haut gauche, échelle 1), mesurés sur les planches. */
const IN = {
  /** Les deux questions à poser (la fiche de la bannière d'aujourd'hui, 30 oct. 2026). */
  questions: BANNER_CARD.ask,
  /** « À dire au patient ». */
  discours: BANNER_CARD.say,
  /** Le centre de chaque pastille posée. */
  slot: { marge: { x: 327, y: 281 }, challenge: { x: 297, y: 328 }, date: { x: 630, y: 328 } } as Record<string, { x: number; y: number }>,
};
const TAB_Q = BANNER_CARD.tab("questions", CHIPS);
const TAB_D = BANNER_CARD.tab("discours", CHIPS);

/** Un point de la carte (repère carte) → le cadre, à la pose `p`. */
const onCard = (p: { x: number; y: number }, c: { x: number; y: number; s: number }) => ({ x: c.x + (p.x - BANNER_CARD.W / 2) * c.s, y: c.y + (p.y - BANNER_CARD.H / 2) * c.s });

/* ------------------------------------------------------------------ la caméra du monde */

/** La poussée lente de la scène, les secousses des claques et des poses. Figée (sauf la dérive) dès 35,1. */
function s7Shakes() {
  return [
    ...HEROES.map((h) => ({ at: h.at + 0.02, amp: 7, frames: 12 })),
    ...HEROES.map((h) => ({ at: h.land, amp: 4, frames: 10 })),
  ];
}
function s7Zoom(t: number) {
  return keys(t, [
    [30.4, 1],
    [32.4, 1.035, IN_OUT],
    [33.0, 1.02, SNAP],
    [35.1, 1.045, LINEAR],
  ]);
}

/* ------------------------------------------------------------------ petits outils */

/** Un mot qui monte de sa ligne de base (masque) et repart vers le haut. */
function Rise({ t, at, exitAt, children, style }: { t: number; at: number; exitAt?: number; children: ReactNode; style?: CSSProperties }) {
  if (t < at - 1 / 60) return null;
  const k = prog(t, at, 0.42, SNAP);
  const o = exitAt === undefined ? 0 : prog(t, exitAt, 0.26, EXIT);
  if (o >= 1) return null;
  return (
    <span style={{ display: "inline-block", overflow: "hidden", padding: "0.06em 0.04em 0.14em", margin: "-0.06em -0.04em -0.14em", verticalAlign: "top" }}>
      <span style={{ display: "inline-block", transform: `translateY(${(1 - k) * 112 - o * 112}%) rotate(${(1 - k) * 4}deg)`, transformOrigin: "0 100%", ...style }}>{children}</span>
    </span>
  );
}

const gradText: CSSProperties = { backgroundImage: BRAND_GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };

/** Le grand titre de la scène : deux lignes, mot à mot, le mot-clé au dégradé du site ; une barre qui se trace. */
function Heading({ t, l1, l2, at1, at2, exitAt }: { t: number; l1: [string, string]; l2: string; at1: number; at2: number; exitAt: number }) {
  if (t < at1 - 0.02 || t > exitAt + 0.5) return null;
  const size = 96;
  const drift = (t - at1) * -14;
  const bar = prog(t, at2 + 0.12, 0.4, SNAP) * (1 - prog(t, exitAt, 0.2, EXIT));
  const base: CSSProperties = { fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.04em", lineHeight: 1.02, whiteSpace: "nowrap", color: PB.green };
  return (
    <div style={{ position: "absolute", left: 1092, top: 326, transform: `translateX(${drift}px)` }}>
      <div style={{ ...base, display: "flex", gap: "0.24em" }}>
        <Rise t={t} at={at1} exitAt={exitAt}>{l1[0]}</Rise>
        <Rise t={t} at={at1 + 0.06} exitAt={exitAt + 0.03} style={gradText}>
          {l1[1]}
        </Rise>
      </div>
      <div style={{ ...base, marginTop: 4, display: "flex", gap: "0.24em" }}>
        {l2.split(" ").map((w, i) => (
          <Rise key={i} t={t} at={at2 + i * 0.06} exitAt={exitAt + 0.06 + i * 0.03}>
            {w}
          </Rise>
        ))}
      </div>
      <div style={{ marginTop: 26, width: 180 * bar, height: 10, borderRadius: 5, backgroundImage: BRAND_GRAD, boxShadow: `0 6px 18px ${rgba(PB.brand, 0.35)}` }} />
    </div>
  );
}

/** Un trait sarcelle qui entoure une zone de la carte (repère carte), avec un voile citron. */
function Marker({ t, at, outAt, x, y, w, h }: { t: number; at: number; outAt: number; x: number; y: number; w: number; h: number }) {
  if (t < at || t > outAt + 0.3) return null;
  const k = prog(t, at, 0.45, IN_OUT);
  const o = 1 - prog(t, outAt, 0.25, EXIT);
  const r = 26;
  const per = 2 * (w + h) - (8 - 2 * Math.PI) * r;
  const breathe = 0.5 + 0.5 * Math.sin((t - at) * 6);
  return (
    <svg style={{ position: "absolute", left: x - 10, top: y - 10, overflow: "visible", opacity: o, pointerEvents: "none" }} width={w + 20} height={h + 20}>
      <rect x={10} y={10} width={w} height={h} rx={r} fill={rgba(PB.citron, 0.22 * k)} />
      <rect x={10} y={10} width={w} height={h} rx={r} fill="none" stroke={PB.brand} strokeWidth={4 + breathe} strokeDasharray={per} strokeDashoffset={per * (1 - k)} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 ${6 + 6 * breathe}px ${rgba(PB.mint, 0.55)})` }} />
    </svg>
  );
}

/** Le halo citron sur un onglet cliqué (repère carte). */
function TabGlow({ t, at, x, y, w }: { t: number; at: number; x: number; y: number; w: number }) {
  const g = pulse(t, at, 0.06, 0.12, 0.45);
  if (g <= 0) return null;
  return <div style={{ position: "absolute", left: x - w / 2 - 6, top: y - 29, width: w + 12, height: 58, borderRadius: 18, boxShadow: `0 0 0 ${4 * g}px ${rgba(PB.citron, 0.95 * g)}, 0 0 ${34 * g}px ${rgba(PB.citron, g)}`, background: rgba(PB.citron, 0.22 * g), pointerEvents: "none" }} />;
}

/* ------------------------------------------------------------------ les pastilles en vedette */

/** Où est la pastille en vedette à l'instant tt : sur la scène, puis en vol (arc) jusqu'à sa place dans la carte. */
function heroPose(h: Hero, tt: number, slot: { x: number; y: number }, endScale: number) {
  const float = { x: wobble(tt, 31 + h.at, 6, 0.9), y: wobble(tt, 41 + h.at, 5, 1.1) };
  const drop = (1 - prog(tt, h.at, 0.32, SNAP)) * -70;
  const from = { x: STAGE.x + float.x, y: STAGE.y + float.y + drop };
  const antic = keys(tt, [
    [h.fly - 0.07, 1],
    [h.fly, 1.07, SNAP],
  ]);
  if (tt < h.fly) return { x: from.x, y: from.y, s: h.scale * antic, rot: wobble(tt, 51 + h.at, 2.2, 0.8), k: 0 };
  const k = prog(tt, h.fly, h.land - h.fly, WHIP);
  const ctrl = { x: lerp(from.x, slot.x, 0.55), y: Math.min(from.y, slot.y) - 190 };
  const v = 1 - k;
  return {
    x: v * v * from.x + 2 * v * k * ctrl.x + k * k * slot.x,
    y: v * v * from.y + 2 * v * k * ctrl.y + k * k * slot.y,
    s: lerp(h.scale * 1.07, endScale, k),
    rot: lerp(0, -9, Math.sin(Math.PI * k)),
    k,
  };
}

function HeroChip({ t, h, slot, endScale }: { t: number; h: Hero; slot: { x: number; y: number }; endScale: number }) {
  if (t < h.at || t >= h.land) return null;
  const layers = [0.036, 0.024, 0.012, 0];
  return (
    <>
      {layers.map((d, i) => {
        const p = heroPose(h, t - d, slot, endScale);
        const flying = heroPose(h, t, slot, endScale).k;
        if (d > 0 && (flying <= 0 || t - d < h.fly)) return null;
        const fade = d === 0 ? 1 - prog(t, h.land - 0.06, 0.06, LINEAR) : [0.1, 0.18, 0.28][i] * Math.sin(Math.PI * flying);
        return (
          <Chip
            key={i}
            t={t}
            kind={h.kind}
            text={h.text}
            at={h.at}
            size={22}
            x={p.x}
            y={p.y}
            scale={p.s}
            rot={p.rot}
            style={{ opacity: fade, filter: d === 0 ? `drop-shadow(0 ${10 * p.s}px ${16 * p.s}px rgba(0,0,0,.35))` : "blur(2px)", zIndex: d === 0 ? 2 : 1 }}
          />
        );
      })}
    </>
  );
}

/** Le plateau des pastilles : un morceau de la bannière (le « noir vivant » de l'hélice), où chaque pastille claque ;
 * dedans, le grand mot en contour de la pastille en cours (il glisse, change de couleur). */
const PAD = { w: 780, h: 316, in: 32.62 } as const;
function Pad({ t }: { t: number }) {
  if (t < PAD.in - 0.02) return null;
  const inK = prog(t, PAD.in, 0.42, SNAP);
  const out = prog(t, H_DATE.fly + 0.02, 0.3, EXIT);
  if (out >= 1) return null;
  const hit = Math.max(0, ...HEROES.map((h) => pulse(t, h.at, 0.04, 0.06, 0.4)));
  const cur = [...HEROES].reverse().find((h) => t >= h.at - 0.02) ?? null;
  const glowC = cur ? (cur.kind === "date" ? "#E0675C" : cur.kind === "marge" ? PB.citron : PB.gold) : PB.mint;
  const s = lerp(0.82, 1, inK) * (1 + 0.035 * hit) * (1 - 0.25 * out);
  return (
    <div
      style={{
        position: "absolute",
        left: STAGE.x - PAD.w / 2,
        top: STAGE.y - PAD.h / 2,
        width: PAD.w,
        height: PAD.h,
        borderRadius: 52,
        overflow: "hidden",
        background: SCREEN_UI.night,
        opacity: clamp01(inK * 2) * (1 - out),
        transform: `scale(${s}) rotate(${(1 - inK) * -3}deg)`,
        clipPath: inK < 1 ? `inset(${(1 - inK) * 50}% 0 ${(1 - inK) * 50}% 0 round 52px)` : undefined,
        boxShadow: `0 0 0 2px ${rgba(glowC, 0.25 + 0.5 * hit)}, 0 0 ${70 + 50 * hit}px -10px ${rgba(glowC, 0.45 + 0.3 * hit)}, 0 46px 90px -34px rgba(0,0,0,.7)`,
      }}
    >
      <AdnBackdrop t={t + 5} tone="night" width={1150} focus={[0.6, 0.5]} opacity={0.6} />
      {HEROES.map((h) => {
        if (t < h.at - 0.02 || t > h.land + 0.2) return null;
        const k = prog(t, h.at, 0.5, SNAP);
        const o = 1 - prog(t, h.fly - 0.02, 0.24, EXIT);
        const c = h.kind === "date" ? "#E0675C" : h.kind === "marge" ? PB.citron : PB.goldHi;
        return (
          <div
            key={h.kind}
            style={{
              position: "absolute",
              left: 40 + (1 - k) * 180 - (t - h.at) * 70,
              top: PAD.h / 2 - 122,
              fontFamily: JAKARTA,
              fontWeight: 800,
              fontSize: 228,
              lineHeight: 1,
              letterSpacing: `${lerp(0.14, -0.035, k)}em`,
              whiteSpace: "nowrap",
              color: "transparent",
              WebkitTextStroke: `2px ${rgba(c, 0.42)}`,
              opacity: clamp01(k * 1.6) * o,
            }}
          >
            {h.word}
          </div>
        );
      })}
    </div>
  );
}

/** Les éclats à l'arrivée d'une pastille en vedette. */
function HeroFx({ t, h }: { t: number; h: Hero }) {
  const x = STAGE.x;
  const y = STAGE.y;
  const colors = h.kind === "challenge" ? [PB.gold, PB.goldHi, "#FFFFFF"] : h.kind === "date" ? [PB.date, "#E0675C", "#FFFFFF"] : [PB.citron, PB.brand, "#FFFFFF"];
  return (
    <>
      <Ring t={t} at={h.at + 0.02} x={x} y={y} max={h.kind === "challenge" ? 640 : 460} color={h.color} width={5} life={0.5} />
      <Burst t={t} at={h.at + 0.03} x={x} y={y} count={16} radius={h.kind === "challenge" ? 420 : 300} colors={colors} size={13} life={0.55} seed={`s7b${h.kind}`} />
      {h.kind === "challenge" && <Coins t={t} at={h.at + 0.04} x={x} y={y - 10} count={11} power={1250} size={46} seed="s7coins" />}
      {h.kind === "date" && <Sparks t={t} at={h.at + 0.03} x={x} y={y} count={18} speed={760} spread={180} color={PB.date} len={22} life={0.42} seed="s7date" />}
      {h.kind === "marge" && <Sparks t={t} at={h.at + 0.03} x={x} y={y} count={18} speed={760} spread={180} color={PB.brand} len={22} life={0.42} seed="s7marge" />}
      <Sparkle t={t} at={h.at + 0.1} x={x + 150} y={y - 62} size={70} color={h.kind === "challenge" ? PB.goldHi : "#FFFFFF"} />
    </>
  );
}

/* ------------------------------------------------------------------ le monde */

/**
 * Le monde de S7 dans un cadre 1920 × 1080 : le papier de l'hélice, la grande carte et la scène. Exporté pour S8 :
 * `sold` = le pharmacien clique « Vendu » à ce temps ; `children` = dessiné dans le repère de la carte au repos (S8 y
 * pose son curseur).
 */
export function CardWorld({ t, sold, children }: { t: number; sold?: number; children?: ReactNode }) {
  const c = cardPose(t);
  const zoom = s7Zoom(t);
  const shakes = s7Shakes();
  const cam = { zoom, origin: [760, 520] as [number, number], shakes, drift: 0.7 };
  const dim = keys(t, [
    [30.3, 0.28],
    [30.85, 0, SNAP],
  ]);
  const tab = (tt: number): BannerTab => (tt < S7_T.dTab + 0.02 ? "questions" : "discours");
  const bump = Math.max(
    0,
    ...HEROES.map((h) =>
      keys(t, [
        [h.land - 0.01, 0],
        [h.land + 0.05, 1, SNAP],
        [h.land + 0.26, 0, IN_OUT],
      ]),
    ),
  );
  const done = prog(t, H_DATE.land + 0.04, 0.5, LINEAR);
  const cardBox: CSSProperties = { position: "absolute", left: c.x - (BANNER_CARD.W / 2) * c.s, top: c.y - (BANNER_CARD.H / 2) * c.s, width: BANNER_CARD.W, height: BANNER_CARD.H, transform: `scale(${c.s * (1 + 0.014 * bump)})`, transformOrigin: "0 0" };
  const slotOf = (h: Hero) => onCard(IN.slot[h.kind], HOME);
  const qTab = onCard(TAB_Q, c);
  const dTab = onCard(TAB_D, c);
  return (
    <AbsoluteFill style={{ background: SCREEN_UI.paper, overflow: "hidden" }}>
      <Camera t={t} {...cam} depth={0.35}>
        <AdnBackdrop t={t} tone="paper" width={1800} focus={[0.42, 0.5]} drift={1.2} />
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 46% 56% at 76% 44%, ${rgba("#FFFFFF", 0.72 * (1 - dim))} 0%, transparent 72%)` }} />
        {dim > 0 && <div style={{ position: "absolute", inset: 0, background: rgba(PB.green, dim) }} />}
      </Camera>
      <Camera t={t} {...cam} depth={0.7}>
        <Pad t={t} />
      </Camera>
      <Camera t={t} {...cam}>
        {/* la grande carte */}
        <div style={cardBox}>
          <div style={{ position: "absolute", left: 30, right: 30, top: 60, bottom: -10, borderRadius: 60, boxShadow: `0 50px 90px -30px ${rgba("#06110F", 0.45)}` }} />
          <BannerCard t={t} at={S7_T.unfold} product="Probiotique" for={AMOXI} tab={tab} questions={QUESTIONS} discours={DISCOURS} chips={CHIPS} sold={sold} />
          <TabGlow t={t} at={S7_T.qTab} x={TAB_Q.x} y={TAB_Q.y} w={170} />
          <Marker t={t} at={S7_T.q1 + 0.04} outAt={S7_T.h1Out - 0.04} {...IN.questions} />
          <Marker t={t} at={S7_T.disc + 0.02} outAt={S7_T.h2Out + 0.12} {...IN.discours} />
          {/* fin : la carte complète s'illumine (contour citron, reflet) */}
          {done > 0 && done < 1 && (
            <div style={{ position: "absolute", inset: 0, borderRadius: 46, overflow: "hidden", pointerEvents: "none", boxShadow: `0 0 0 ${4 * Math.sin(Math.PI * done)}px ${rgba(PB.citron, 0.9)}, 0 0 ${60 * Math.sin(Math.PI * done)}px ${rgba(PB.citron, 0.55)}` }}>
              <div style={{ position: "absolute", top: "-20%", bottom: "-20%", left: `${-40 + done * 160}%`, width: "30%", background: "linear-gradient(100deg, transparent, rgba(255,255,255,.35), transparent)", transform: "skewX(-18deg)", mixBlendMode: "screen" }} />
            </div>
          )}
          {children}
        </div>
        {/* les étincelles des pastilles qui se posent */}
        {HEROES.map((h) => (
          <Sparkle key={h.kind} t={t} at={h.land - 0.02} x={slotOf(h).x + 60} y={slotOf(h).y - 16} size={58} color={h.kind === "challenge" ? PB.goldHi : PB.citron} />
        ))}
        {/* le pointeur (le pharmacien) : Questions, puis Discours */}
        <S7Cursor t={t} qTab={qTab} dTab={dTab} />
        {/* le titre de la scène */}
        <Heading t={t} l1={["Les", "questions"]} l2="à poser." at1={30.6} at2={S7_T.q2} exitAt={S7_T.h1Out} />
        <Heading t={t} l1={["Les", "mots"]} l2="à dire." at1={S7_T.mots} at2={S7_T.dire} exitAt={S7_T.h2Out} />
        {/* les pastilles en vedette */}
        {HEROES.map((h) => (
          <HeroFx key={`fx${h.kind}`} t={t} h={h} />
        ))}
        {HEROES.map((h) => (
          <HeroChip key={h.kind} t={t} h={h} slot={slotOf(h)} endScale={HOME.s} />
        ))}
      </Camera>
    </AbsoluteFill>
  );
}

function S7Cursor({ t, qTab, dTab }: { t: number; qTab: { x: number; y: number }; dTab: { x: number; y: number } }) {
  if (t < 30.12 || t > 32.3) return null;
  const a = prog(t, 30.12, 0.22, SNAP);
  const b = prog(t, 31.08, 0.3, WHIP);
  const away = prog(t, 31.72, 0.5, IN_OUT);
  const x = lerp(lerp(1500, qTab.x + 6, a), dTab.x + 4, b) + away * 260 + wobble(t, 71, 3, 1.2) * (1 - b * (1 - away));
  const y = lerp(lerp(860, qTab.y + 6, a), dTab.y + 6, b) - Math.sin(Math.PI * b) * 26 + away * 300;
  const o = clamp01((t - 30.12) / 0.06) * (1 - prog(t, 31.95, 0.3, LINEAR));
  return <Cursor t={t} x={x} y={y} clickAt={[S7_T.qTab, S7_T.dTab]} opacity={o} size={1.05} />;
}

/* ------------------------------------------------------------------ le cadre ↔ l'écran du comptoir (partagé avec S8) */

/** La dalle de l'écran du comptoir (SET.screen) et l'échelle cadre → dalle (le cadre 16:9 prend toute la largeur). */
export const SCREEN_FIT = SET.screen.w / 1920;
/** Le grossissement du comptoir quand l'écran remplit le cadre. */
export const SCREEN_ZOOM = 1 / SCREEN_FIT;

/**
 * k = 0 : l'écran du comptoir REMPLIT le cadre ; k = 1 : le comptoir en plan large (zoom 1). Donne pour les deux scènes :
 *   world  — la transformation CSS du comptoir (S8), origine 0 0 ;
 *   frame  — la transformation CSS du cadre 1920 × 1080 posé sur la dalle (origine au centre), perspective comprise ;
 *   tilt   — l'inclinaison de l'écran (0 → 18°) à passer à <Pharmacy screenTilt/>.
 */
export function screenMap(k: number) {
  const z = Math.exp((1 - k) * Math.log(SCREEN_ZOOM));
  const cx = lerp(960, SET.screen.x, k);
  const cy = lerp(540, SET.screen.y, k);
  const tilt = SET.screen.tilt * k;
  const s = z * SCREEN_FIT;
  return {
    z,
    tilt,
    world: `translate(${cx}px, ${cy}px) scale(${z}) translate(${-SET.screen.x}px, ${-SET.screen.y}px)`,
    frame: `translate(${cx - 960}px, ${cy - 540}px) scale(${s}) perspective(${(SET.screen.w * 5) / SCREEN_FIT}px) rotateY(${tilt}deg)`,
  };
}

/* ------------------------------------------------------------------ la scène */

export function Scene({ t }: { t: number }) {
  const k = prog(t, S7_T.out, S7_T.end - S7_T.out, WHIP);
  const m = k > 0 ? screenMap(k) : null;
  const fade = 1 - prog(t, S7_T.end - 0.12, 0.12, LINEAR);
  const blur = Math.sin(Math.PI * k) * 2.5;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transformOrigin: "50% 50%", transform: m ? m.frame : undefined, opacity: fade, filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined, boxShadow: m ? `0 ${30 * k}px ${80 * k}px rgba(0,0,0,${0.35 * k})` : undefined }}>
        <CardWorld t={t} />
        <AbsoluteFill style={{ filter: "invert(1)" }}>
          <Mention t={t} from={30.0} to={S7_T.end + 0.2} />
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  // Questions
  cue("ui-clic", S7_T.qTab, 0.6),
  cue("balayage-mini", S7_T.glide, 0.22),
  cue("ui-pop", S7_T.q1, 0.38),
  cue("ui-pop", S7_T.q2, 0.36, 1.08),
  // Les mots
  cue("balayage-mini", S7_T.h1Out, 0.2, 1.1),
  cue("ui-clic", S7_T.dTab, 0.6, 1.05),
  cue("laser-ecrit", S7_T.disc, 0.3, 1, S7_T.discDur),
  cue("balayage-mini", S7_T.h2Out, 0.2, 1.15),
  // La marge
  cue("piece", H_MARGE.at, 0.55),
  cue("balayage-mini", H_MARGE.fly, 0.3, 1.2),
  cue("ui-pop", H_MARGE.land, 0.45),
  // Le challenge
  cue("caisse", H_CHAL.at, 0.32),
  cue("balayage-mini", H_CHAL.fly, 0.3, 1.2),
  cue("ui-pop", H_CHAL.land, 0.45, 1.06),
  // La date courte
  cue("pop-sec", H_DATE.at, 0.45),
  cue("balayage-mini", H_DATE.fly, 0.3, 1.25),
  cue("ui-pop", H_DATE.land, 0.5, 1.12),
  cue("scintillement", H_DATE.land + 0.06, 0.3),
  // Sortie : dézoom vers le comptoir
  cue("whoosh-pb", S7_T.out - 0.04, 0.55),
];
