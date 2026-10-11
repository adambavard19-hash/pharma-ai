import type { ComponentType } from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, type CalculateMetadataFunction } from "remotion";
import { Audio } from "@remotion/media";
import { ArrowRight, Bandage, Cross, HeartPulse, Leaf, Lightbulb, Pill, Stethoscope, Tablets, Thermometer, User } from "lucide-react";
import { C, ClockOffset, EASE_IN_OUT, FONT, MONO, tw, useF, usePerSecond } from "../theme";
import { Sfx } from "../ui/sfx";
import { LgoWindow, MedBox, ScannerAt, barcodeCenter } from "../ui/counter";
import { ProductTile, Wordmark } from "../ui/product";
import { SALES, answerTree, bannerStart, cardSize, resolveBanner, type BannerState } from "../ui/banner";
import { ESTIMATE_ASSUMPTIONS, estimateAdditionalRevenue } from "../../../src/core/pricing/revenue-estimate";
import { FALLBACK_DURATIONS, SCRIPT, VOICE_DIR } from "../reel/script";
import { CUT, PRE, SCENE_FPS, VIDEO_FPS, detectPauses, reelTimeline, type ReelTimeline, type VoiceInfo } from "../reel/timeline";
import { Burst, Captions, Flash, GOLD, Glow, H, HEAVY, MINT, ReelStage, Ring, SceneFrame, W, pop, type SceneLine } from "../reel/stage";
import { FloatingRobot } from "../reel/robot";
import { ReelBanner, reelPoint, stepsOf, type Act, type Place } from "../reel/banner-play";

/* ==========================================================================
 * LE REEL INSTAGRAM — vertical 1080 × 1920, 60 images/s, ≈ 28 s.
 *
 * « Vous êtes pharmacien ? Cette vidéo est pour vous. » Sept phrases de voix
 * off (src/reel/script.ts), une scène par phrase. Le montage se cale sur la
 * voix : calculateMetadata mesure chaque fichier (durée, pauses), et tout —
 * scènes, sous-titres, clics, sons — en découle. Changer la voix (voix humaine
 * aux mêmes noms de fichiers) recale le film sans toucher au code.
 *
 * Lisible sans le son : sous-titres incrustés, gros, synchronisés, le mot clé
 * en couleur. Zones d'Instagram libres : rien d'écrit dans les 220 px du haut
 * ni dans les 380 px du bas.
 *
 * Honnêteté : la bannière est celle des films (vrai constructeur de l'avis,
 * vraies règles du moteur), produits et prix marqués « exemples » ; le chiffre
 * d'affaires est l'estimation du site (src/core/pricing/revenue-estimate.ts),
 * ses hypothèses écrites dessous, « Pas une promesse ».
 * ======================================================================== */

export type ReelProps = { voices: VoiceInfo[] | null };

/** La durée et les pauses d'un fichier de voix, décodé par le navigateur du rendu. */
async function measure(src: string): Promise<VoiceInfo> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src} : ${res.status}`);
  const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await res.arrayBuffer());
  return { dur: audio.duration, pauses: detectPauses(audio.getChannelData(0), audio.sampleRate) };
}

/** La longueur du film vient de la voix : on mesure les sept fichiers avant le rendu. */
export const calculateReelMetadata: CalculateMetadataFunction<ReelProps> = async ({ props }) => {
  const voices = await Promise.all(
    SCRIPT.map((line, i) =>
      measure(staticFile(`${VOICE_DIR}/${line.id}.mp3`)).catch((e) => {
        console.warn(`Reel : voix ${line.id} illisible (${e}) — durée de secours ${FALLBACK_DURATIONS[i]} s.`);
        return { dur: FALLBACK_DURATIONS[i], pauses: [] };
      }),
    ),
  );
  return { durationInFrames: Math.ceil(reelTimeline(voices).total * VIDEO_FPS), props: { ...props, voices } };
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** La musique : −18 dB sous la voix pendant qu'elle parle, plus présente sur la carte de fin, fondu à la toute fin. */
const DUCKED = 0.18;
const OPEN = 0.7;
function musicVolume(t: number, tl: ReelTimeline) {
  const a = tl.lines[0].start - 0.12;
  const b = tl.lines[tl.lines.length - 1].end + 0.1;
  const v = t < b ? interpolate(t, [a - 0.15, a], [OPEN, DUCKED], clamp) : interpolate(t, [b, b + 0.5], [DUCKED, OPEN], clamp);
  return v * interpolate(t, [tl.total - 1, tl.total - 0.05], [1, 0], clamp);
}

export function Reel({ voices }: ReelProps) {
  const tl = reelTimeline(voices ?? FALLBACK_DURATIONS.map((dur) => ({ dur, pauses: [] })));
  const vf = (s: number) => Math.round(s * VIDEO_FPS);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: "#082638" }}>
      <ReelStage />
      {tl.lines.map((line, i) => {
        const Scene = SCENES[i];
        const next = tl.lines[i + 1];
        const from = i === 0 ? 0 : vf(line.start - PRE);
        const to = next ? vf(next.start - PRE + CUT) : vf(tl.total);
        const L: SceneLine = {
          len: line.dur * SCENE_FPS,
          chunks: line.chunks.map((c) => ({ text: c.text, at: (c.start - line.start) * SCENE_FPS, end: (c.end - line.start) * SCENE_FPS })),
          exit: next ? (next.start - PRE - line.start) * SCENE_FPS : Infinity,
          intro: (line.start - from / VIDEO_FPS) * SCENE_FPS,
        };
        return (
          <Sequence key={line.id} from={from} durationInFrames={to - from} name={`${line.id} · ${line.text}`}>
            <ClockOffset.Provider value={{ from, bound: line.start * SCENE_FPS, rate: SCENE_FPS / VIDEO_FPS }}>
              <Scene L={L} />
            </ClockOffset.Provider>
          </Sequence>
        );
      })}
      {tl.lines.map((line) => (
        <Sequence key={`voix-${line.id}`} from={vf(line.start)} layout="none" name={`Voix ${line.id}`}>
          <Audio src={staticFile(`${VOICE_DIR}/${line.id}.mp3`)} />
        </Sequence>
      ))}
      <Audio src={staticFile("music/reel.wav")} volume={(f) => musicVolume(f / VIDEO_FPS, tl)} />
    </AbsoluteFill>
  );
}

/* ---- Les mises en page communes ------------------------------------------- */

/** Les sous-titres sous l'image (scènes 2 à 5) : centre à 1390, deux lignes au plus, au-dessus des 380 px du bas. */
const LOW = 1390;
const NOTE = "Illustration · produits et prix : exemples";

function Note({ y = 1508, text = NOTE, opacity = 1 }: { y?: number; text?: string; opacity?: number }) {
  return <div style={{ position: "absolute", left: 0, width: W, top: y, textAlign: "center", fontFamily: MONO, fontSize: 23, letterSpacing: "0.05em", color: "rgba(255,255,255,.6)", opacity }}>{text}</div>;
}

const sold = (id: string) => (s: BannerState) => ({ answers: { ...s.answers, [id]: "SOLD" as const } });

/* ---- 1. L'accroche ------------------------------------------------------------ */

const BADGES = [
  { I: Pill, c: MINT },
  { I: Cross, c: "#22C88F" },
  { I: Thermometer, c: C.white },
  { I: Tablets, c: GOLD },
  { I: HeartPulse, c: MINT },
  { I: Bandage, c: C.white },
  { I: Leaf, c: "#22C88F" },
  { I: Stethoscope, c: GOLD },
];

function Hook({ L }: { L: SceneLine }) {
  const f = useF();
  const robot = pop(f, -L.intro - 5, { damping: 10, stiffness: 160 });
  const c1 = L.chunks[1].at;
  // L'accroche s'écrit dès la première image, avant même la voix.
  const early: SceneLine = { ...L, chunks: L.chunks.map((c, i) => (i === 0 ? { ...c, at: -L.intro - 1 } : c)) };
  const cx = 540, cy = 530;
  return (
    <SceneFrame L={L} fadeIn={false}>
      {BADGES.map(({ I, c }, i) => {
        const p = pop(f, -L.intro - 3 + i * 1.2, { damping: 13, stiffness: 150 });
        const ang = ((-67.5 + 45 * i) * Math.PI) / 180;
        const tx = cx + 400 * Math.cos(ang);
        const ty = cy + 270 * Math.sin(ang);
        const t = f / 30;
        const bump = 1 + 0.14 * Math.max(0, tw(f, [c1 + i, c1 + i + 4], [0, 1]) - tw(f, [c1 + i + 4, c1 + i + 12], [0, 1]));
        const x = cx + (tx - cx) * p;
        const y = cy + (ty - cy) * p + Math.sin(t * 2.2 + i) * 10 * p;
        return (
          <div key={i} style={{ position: "absolute", left: x - 59, top: y - 59, width: 118, height: 118, borderRadius: 34, display: "grid", placeItems: "center", background: "rgba(255,255,255,.09)", border: "1.5px solid rgba(255,255,255,.2)", boxShadow: `0 18px 40px -18px rgba(0,0,0,.6), 0 0 34px -6px ${c}55`, opacity: Math.min(1, p * 2), transform: `scale(${(0.2 + 0.8 * p) * bump}) rotate(${Math.sin(t * 1.7 + i * 1.3) * 8 + (1 - p) * 90}deg)` }}>
            <I size={58} color={c} strokeWidth={2.2} />
          </div>
        );
      })}
      <Ring x={cx} y={cy} at={-L.intro} max={760} />
      <div style={{ position: "absolute", left: cx - 150, top: 350, transform: `scale(${0.3 + 0.7 * robot}) rotate(${(1 - robot) * -16}deg)`, opacity: Math.min(1, robot * 2) }}>
        <FloatingRobot size={300} t={f / 30 + 0.9} happy={f >= c1 + 2 && f < c1 + 40} />
      </div>
      <Captions L={early} y={1010} size={124} width={1000} />
      <Sfx at={-L.intro} name="impact" volume={0.6} />
      {BADGES.map((_, i) => (i % 2 === 0 ? <Sfx key={i} at={-L.intro + 2 + i * 1.2} name="pop" volume={0.22} /> : null))}
      <Sfx at={c1 - 1} name="swish" volume={0.3} />
    </SceneFrame>
  );
}

/* ---- 2. Le conseil qui passe à la trappe ------------------------------------- */

function Scribble({ w, at, f }: { w: number; at: number; f: number }) {
  const p = tw(f, [at, at + 8], [0, 1]);
  return <div style={{ height: 12, width: w * p, borderRadius: 6, background: C.ink200, marginTop: 12 }} />;
}

function Missed({ L }: { L: SceneLine }) {
  const f = useF();
  const [, c1, c2, c3, c4] = L.chunks.map((c) => c.at);
  const t = f / 30;
  // La croix de pharmacie : « Au comptoir ».
  const cross = pop(f, -2, { damping: 13 });
  const flicker = f < 8 && Math.floor(f) % 3 === 1 ? 0.45 : 1;
  // Sur « Au comptoir », la croix occupe le centre ; elle monte quand l'ordonnance arrive.
  const settle = tw(f, [c1 - 8, c1 + 4], [0, 1], EASE_IN_OUT);
  // L'ordonnance glisse sur le comptoir, puis s'écarte : le conseil était caché derrière.
  const ord = pop(f, c1 - 6, { damping: 14, stiffness: 150 });
  const aside = tw(f, [c2 - 2, c2 + 10], [0, 1], EASE_IN_OUT);
  const card = pop(f, c2, { damping: 12, stiffness: 160 });
  // Le temps manque : il s'efface.
  const ghost = tw(f, [c4 - 2, c4 + 24], [0, 1], EASE_IN_OUT);
  const watch = pop(f, c3 - 3, { damping: 12 });
  const glowPulse = 0.6 + 0.4 * Math.sin(t * 6);
  return (
    <SceneFrame L={L}>
      {/* La croix verte, au néon. */}
      <div style={{ position: "absolute", left: 540 - 70, top: 230 + (1 - settle) * 390, width: 140, height: 140, opacity: Math.min(1, cross * 2) * flicker * (1 - 0.5 * watch), transform: `scale(${(0.4 + 0.6 * cross) * (1.9 - 0.9 * settle)})` }}>
        <svg viewBox="0 0 100 100" width={140} height={140} style={{ overflow: "visible", filter: "drop-shadow(0 0 18px rgba(34,200,143,.85)) drop-shadow(0 0 40px rgba(34,200,143,.5))" }}>
          <path d="M35 5 H65 V35 H95 V65 H65 V95 H35 V65 H5 V35 H35 Z" fill="#22C88F" stroke="#B8FFE6" strokeWidth={3} strokeLinejoin="round" />
        </svg>
      </div>
      <Ring x={540} y={690} at={0} max={700} color="#22C88F" />
      {/* Le conseil, derrière l'ordonnance. */}
      <div
        style={{
          position: "absolute",
          left: 606 + (1 - aside) * -240 + 36 * ghost,
          top: 420 - 190 * ghost,
          width: 340,
          padding: "26px 24px 22px",
          borderRadius: 28,
          background: C.white,
          border: ghost > 0 ? `3px dashed rgba(155,167,170,${ghost})` : "3px solid transparent",
          boxShadow: `0 0 0 ${5 * (1 - ghost)}px ${MINT}88, 0 0 ${70 * glowPulse * (1 - ghost)}px ${MINT}88, 0 30px 60px -20px rgba(0,0,0,.5)`,
          transform: `rotate(${7 * card}deg) scale(${(0.7 + 0.36 * card) * (1 - 0.18 * ghost)})`,
          opacity: (f < c2 - 2 ? 0 : 1) * (1 - 0.85 * ghost),
          filter: ghost > 0 ? `grayscale(${ghost}) blur(${ghost * 5}px)` : undefined,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: "#D8F6E6", color: "#087443", fontSize: 24, fontWeight: 700 }}>
          <Lightbulb size={24} strokeWidth={2.4} /> Conseil
        </div>
        <ProductTile name="probio-flore-10" size={190} />
        <div style={{ fontSize: 30, fontWeight: 700, color: C.ink900, letterSpacing: "-0.01em" }}>PROBIOTIQUE</div>
        <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink400 }}>exemple</div>
      </div>
      {/* L'ordonnance. */}
      <div
        style={{
          position: "absolute",
          left: 470 - 260 - 140 * aside + (1 - ord) * -700,
          top: 400,
          width: 520,
          height: 600,
          borderRadius: 24,
          background: "#FDFEFE",
          boxShadow: "0 40px 80px -30px rgba(0,0,0,.65), 0 2px 0 rgba(255,255,255,.6) inset",
          transform: `rotate(${-5 - 6 * aside + (1 - ord) * -24}deg)`,
          padding: "34px 40px",
          boxSizing: "border-box",
          opacity: Math.min(1, ord * 2),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg viewBox="0 0 100 100" width={34} height={34}><path d="M35 5 H65 V35 H95 V65 H65 V95 H35 V65 H5 V35 H35 Z" fill="#22C88F" /></svg>
          <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 500, letterSpacing: "0.16em", color: C.ink500 }}>ORDONNANCE</span>
        </div>
        <div style={{ height: 2, background: C.ink100, margin: "22px 0 26px" }} />
        {[
          { name: "AMOXICILLINE 1 g", at: c1 + 2, w: [330, 210] },
          { name: "VALACICLOVIR 500 mg", at: c1 + 9, w: [300, 240] },
        ].map((l) => (
          <div key={l.name} style={{ marginBottom: 34, opacity: tw(f, [l.at, l.at + 4], [0, 1]), transform: `translateX(${(1 - tw(f, [l.at, l.at + 8], [0, 1])) * -20}px)` }}>
            <div style={{ fontSize: 34, fontWeight: 700, color: C.ink900, letterSpacing: "-0.01em", wordSpacing: "0.12em" }}>{l.name}</div>
            <Scribble w={l.w[0]} at={l.at + 3} f={f} />
            <Scribble w={l.w[1]} at={l.at + 6} f={f} />
          </div>
        ))}
        <svg width={220} height={90} viewBox="0 0 220 90" style={{ position: "absolute", right: 40, bottom: 36 }}>
          <path d="M8 60 C 30 10, 50 80, 72 40 S 110 20, 118 55 S 160 70, 170 30 S 200 40, 212 50" fill="none" stroke={C.brand700} strokeWidth={4} strokeLinecap="round" strokeDasharray={420} strokeDashoffset={420 * (1 - tw(f, [c1 + 14, c1 + 30], [0, 1]))} />
        </svg>
      </div>
      {/* Le chronomètre qui s'emballe. */}
      <div style={{ position: "absolute", left: 830, top: 250, width: 170, height: 190, opacity: Math.min(1, watch * 2), transform: `scale(${0.4 + 0.6 * watch}) rotate(${Math.sin(t * 9) * 7 * watch}deg)` }}>
        <svg viewBox="0 0 100 112" width={170} height={190}>
          <rect x={42} y={0} width={16} height={10} rx={3} fill={GOLD} />
          <rect x={47} y={8} width={6} height={8} fill={GOLD} />
          <circle cx={50} cy={62} r={44} fill="rgba(255,255,255,.1)" stroke={C.white} strokeWidth={5} />
          <circle cx={50} cy={62} r={44} fill="none" stroke={GOLD} strokeWidth={5} strokeDasharray={276} strokeDashoffset={276 * (1 - ((Math.max(0, f - c3) * 0.02) % 1))} transform="rotate(-90 50 62)" />
          <line x1={50} y1={62} x2={50} y2={30} stroke={C.white} strokeWidth={5} strokeLinecap="round" transform={`rotate(${Math.max(0, f - c3 + 3) * 26} 50 62)`} />
          <circle cx={50} cy={62} r={5} fill={GOLD} />
        </svg>
      </div>
      {/* La file qui s'allonge au comptoir. */}
      {Array.from({ length: 6 }, (_, i) => {
        const p = pop(f, c3 + 2 + i * 2.6, { damping: 14, stiffness: 180 });
        return (
          <div key={i} style={{ position: "absolute", left: 120 + i * 146, top: 1052, width: 96, height: 96, borderRadius: 48, display: "grid", placeItems: "center", background: i === 0 ? "rgba(88,242,216,.2)" : "rgba(255,255,255,.1)", border: `2px solid ${i === 0 ? MINT : "rgba(255,255,255,.25)"}`, opacity: Math.min(1, p * 2), transform: `translateX(${(1 - p) * 300}px) translateY(${Math.sin(t * 5 + i) * 3}px)` }}>
            <User size={50} color={i === 0 ? MINT : "rgba(255,255,255,.8)"} strokeWidth={2.2} />
          </div>
        );
      })}
      <Captions L={L} y={LOW} size={84} width={880} />
      <Sfx at={-L.intro} name="whoosh" volume={0.3} />
      <Sfx at={c1 - 5} name="swish" volume={0.35} />
      <Sfx at={c2} name="pop" volume={0.45} />
      <Burst x={760} y={640} at={c2 + 2} count={12} radius={280} />
      {[0, 5, 10, 15, 20, 25].map((d) => <Sfx key={d} at={c3 + d} name="tic" volume={0.28} />)}
      <Sfx at={c4} name="whoosh" volume={0.28} />
    </SceneFrame>
  );
}

/* ---- 3. Le scan, comme d'habitude ------------------------------------------- */

const ORD = SALES.ordonnance;
const LGO_ROWS = (scanAt: number) => [
  { text: ORD.lines[1].lgo, qty: ORD.lines[1].qty, price: ORD.lines[1].price, at: -999 },
  { text: ORD.lines[0].lgo, qty: ORD.lines[0].qty, price: ORD.lines[0].price, at: scanAt },
];
const LGO = { x: 70, y: 500, w: 940, h: 450 };
const SCAN_PLACE: Place = { zoom: 2.1, right: 120, top: 250 };

function Beam({ from, to, spread, on }: { from: [number, number]; to: [number, number]; spread: number; on: number }) {
  if (on <= 0) return null;
  const [x1, y1] = from;
  const [x2, y2] = to;
  const a = x2 - spread / 2;
  const b = x2 + spread / 2;
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        <linearGradient id="reel-beam" x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={MINT} stopOpacity={0.7 * on} />
          <stop offset="100%" stopColor={MINT} stopOpacity={0.12 * on} />
        </linearGradient>
      </defs>
      <polygon points={`${x1},${y1 - 4} ${x1},${y1 + 4} ${b},${y2} ${a},${y2}`} fill="url(#reel-beam)" />
      <line x1={a} y1={y2} x2={b} y2={y2} stroke={MINT} strokeWidth={18} opacity={0.3 * on} strokeLinecap="round" />
      <line x1={a} y1={y2} x2={b} y2={y2} stroke="#E9FFFA" strokeWidth={4} opacity={on} strokeLinecap="round" />
    </svg>
  );
}

function Scan({ L }: { L: SceneLine }) {
  const f = useF();
  const [c0, c1] = L.chunks.map((c) => c.at);
  const SCAN = c1 + 8;
  const banner = pop(f, -L.intro, { damping: 15, stiffness: 160 });
  const lgo = pop(f, -L.intro + 2, { damping: 18, stiffness: 140 });
  const box = { x: 100, y: 975, w: 380 };
  const boxIn = pop(f, c0 + 14, { damping: 15, stiffness: 140 });
  const scanner = pop(f, c0 + 20, { damping: 16, stiffness: 150 });
  const [bx, by] = barcodeCenter(box.x, box.y, box.w);
  const nose: [number, number] = [760, 1050];
  const sweep = Math.sin(f / 2.4) * 16;
  const laser = Math.min(tw(f, [SCAN - 10, SCAN - 6], [0, 1]), tw(f, [SCAN + 2, SCAN + 7], [1, 0]));
  const lit = Math.min(tw(f, [SCAN - 2, SCAN + 1], [0, 1]), tw(f, [SCAN + 6, SCAN + 36], [1, 0]));
  const robotAt = { x: W - SCAN_PLACE.right - cardSize(bannerStart(ORD, "idle")).w * SCAN_PLACE.zoom + 50 * SCAN_PLACE.zoom, y: SCAN_PLACE.top + 50 * SCAN_PLACE.zoom };
  return (
    <SceneFrame L={L}>
      <div style={{ position: "absolute", left: LGO.x, top: LGO.y, opacity: lgo, transform: `translateY(${(1 - lgo) * 80}px) scale(${0.94 + 0.06 * lgo})` }}>
        <LgoWindow w={LGO.w} h={LGO.h} lines={LGO_ROWS(SCAN + 1)} />
      </div>
      <div style={{ position: "absolute", left: box.x + (1 - boxIn) * -520, top: box.y, transform: `rotate(${(1 - boxIn) * -20}deg)` }}>
        <MedBox name="AMOXICILLINE 1 g" form="comprimé" w={box.w} lit={lit} tilt={-12} />
      </div>
      <Beam from={nose} to={[bx, by + sweep * laser]} spread={250} on={laser} />
      <div style={{ position: "absolute", inset: 0, transform: `translate(${(1 - scanner) * 420}px, ${(1 - scanner) * 200}px)` }}>
        <ScannerAt nx={nose[0]} ny={nose[1]} w={280} deg={-8} led={lit} />
      </div>
      <Ring x={bx} y={by} at={SCAN} max={420} />
      <div style={{ position: "absolute", inset: 0, opacity: banner, transform: `translateY(${(1 - banner) * -120}px)` }}>
        <ReelBanner sale={ORD} start="idle" acts={[{ at: SCAN + 3, patch: { view: "scan" } }]} place={SCAN_PLACE} />
      </div>
      <Ring x={robotAt.x} y={robotAt.y} at={SCAN + 3} max={360} />
      <Flash at={SCAN} strength={0.14} />
      <Captions L={L} y={LOW} size={86} width={880} />
      <Note opacity={tw(f, [0, 10], [0, 1])} />
      <Sfx at={-L.intro} name="whoosh" volume={0.32} />
      <Sfx at={c0 + 14} name="swish" volume={0.3} />
      <Sfx at={SCAN} name="bip" volume={0.55} />
      <Sfx at={SCAN + 3} name="pop" volume={0.4} />
    </SceneFrame>
  );
}

/* ---- 4. Le bon conseil, dans votre rayon --------------------------------------- */

function Advice({ L }: { L: SceneLine }) {
  const f = useF();
  const perSecond = usePerSecond();
  const [, c1, c2] = L.chunks.map((c) => c.at);
  const OPEN = c1 - 3;
  const grow = tw(f, [OPEN, OPEN + 12], [0, 1], EASE_IN_OUT);
  const place: Place = { zoom: 2.1 - 0.16 * grow, right: 120 - 88 * grow, top: 250 };
  const acts: Act[] = [
    { at: 2, patch: { view: "ready" } },
    { at: OPEN, patch: { view: "expanded" }, click: "see" },
  ];
  const veil = tw(f, [OPEN, OPEN + 14], [0, 1], EASE_IN_OUT);
  const ring = (at: number) => Math.min(tw(f, [at, at + 6], [0, 1]), 1 - tw(f, [L.exit - 4, L.exit + 2], [0, 1]));
  const highlight = (key: string) => (key === "pill:a:challenge" ? ring(c2) : key === "pill:a:date" ? ring(c2 + 4) : key === "pill:a:stock" ? ring(c2 + 8) : 0);
  // La caméra s'approche du premier conseil sur « votre rayon ».
  const push = tw(f, [c2 - 2, c2 + 24], [0, 1], EASE_IN_OUT);
  const b = resolveBanner(bannerStart(ORD, "scan"), stepsOf(acts), f, perSecond);
  const bottom = place.top + b.h * place.zoom;
  return (
    <SceneFrame L={L} punch={0.4}>
      <div style={{ position: "absolute", left: LGO.x, top: LGO.y, filter: `blur(${veil * 5}px)`, opacity: 1 - 0.6 * veil, transform: `scale(${1 - 0.04 * veil})` }}>
        <LgoWindow w={LGO.w} h={LGO.h} lines={LGO_ROWS(-999)} />
      </div>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${1 + 0.07 * push})`, transformOrigin: "540px 560px" }}>
        <ReelBanner sale={ORD} start="scan" acts={acts} place={place} highlight={highlight} />
      </div>
      <Burst x={540} y={300} at={3} count={10} radius={300} />
      <Captions L={L} y={LOW} size={86} width={880} />
      <Note y={Math.max(1508, bottom + 24)} />
      <Sfx at={-L.intro} name="whoosh" volume={0.25} />
      <Sfx at={2} name="pop" volume={0.5} />
      <Sfx at={OPEN + 2} name="swish" volume={0.4} />
      {[0, 4, 8].map((d) => <Sfx key={d} at={c2 + d} name="tic" volume={0.35} />)}
    </SceneFrame>
  );
}

/* ---- 5. Une question, puis un clic -------------------------------------------- */

const PAIN = SALES.douleur;
const DECIDE_PLACE: Place = { zoom: 1.75, right: 85, top: 236 };

function Decide({ L }: { L: SceneLine }) {
  const f = useF();
  const perSecond = usePerSecond();
  const [c0, c1, c2, c3] = L.chunks.map((c) => c.at);
  const WHY = Math.max(6, c0 + 8);
  const WHERE = c1 + 9;
  const SOLD = c3 + 2;
  const acts: Act[] = [
    { at: WHY, patch: answerTree("why", "PAIN"), click: "qa:why:PAIN" },
    { at: WHERE, patch: answerTree("where", "BACK"), click: "qa:where:BACK" },
    { at: c2 + 3, hover: "sold:pain-pack-back" },
    { at: c2 + 24, hover: "not:pain-pack-back" },
    { at: SOLD, patch: sold("pain-pack-back"), click: "sold:pain-pack-back" },
  ];
  const enter = pop(f, -L.intro, { damping: 16, stiffness: 150 });
  const initial = bannerStart(PAIN, "expanded");
  const soldAt = reelPoint(resolveBanner(initial, stepsOf(acts), SOLD - 1, perSecond), "sold:pain-pack-back", DECIDE_PLACE);
  const productAt = reelPoint(resolveBanner(initial, stepsOf(acts), WHERE + 1, perSecond), "sold:pain-pack-back", DECIDE_PLACE);
  const bump = Math.max(0, tw(f, [SOLD, SOLD + 3], [0, 1]) - tw(f, [SOLD + 3, SOLD + 14], [0, 1]));
  return (
    <SceneFrame L={L} punch={0.5}>
      <div style={{ position: "absolute", inset: 0, opacity: enter, transform: `translateX(${(1 - enter) * 500}px) scale(${1 + 0.03 * bump})`, transformOrigin: `${soldAt.x}px ${soldAt.y}px` }}>
        <ReelBanner sale={PAIN} start="expanded" acts={acts} place={DECIDE_PLACE} />
      </div>
      <Ring x={productAt.x - 300} y={productAt.y} at={WHERE + 2} max={300} />
      <Burst x={soldAt.x} y={soldAt.y} at={SOLD} count={18} radius={230} />
      <Ring x={soldAt.x} y={soldAt.y} at={SOLD} max={300} color={C.white} />
      <Captions L={L} y={1410} size={88} width={880} />
      <Note />
      <Sfx at={-L.intro} name="whoosh" volume={0.32} />
      <Sfx at={WHERE + 2} name="pop" volume={0.4} />
      <Sfx at={SOLD} name="pop" volume={0.65} />
      <Sfx at={SOLD + 3} name="notif" volume={0.35} />
    </SceneFrame>
  );
}

/* ---- 6. Le chiffre d'affaires --------------------------------------------------- */

const ESTIMATE = estimateAdditionalRevenue(200);
const A = ESTIMATE_ASSUMPTIONS;
/** La note de l'estimation : les hypothèses du site (revenue-estimate.ts), et ce qu'elle n'est pas. */
const NB = "\u00A0";
const FOOTNOTE = `*Estimation pour ${ESTIMATE.clientsPerDay}${NB}clients par jour${NB}: ${Math.round(A.adviceRate * 100)}${NB}% conseillés × ${A.averageProductCents / 100}${NB}€ × ${A.openDaysPerMonth}${NB}jours. Pas une promesse.`;
const TOKENS = ["probio-flore-10", "spray-nasal-marin", "pastilles-gorge", "vitamine-c-1000", "magnesium-marin-b6", "thermometre-frontal", "probio-confort", "baume-reparateur", "creme-solaire-spf50", "zinc-selenium", "calcium-vitamine-d", "brumisateur"];
const TOKEN_X = [190, 880, 330, 760, 240, 850, 420, 680, 200, 900, 310, 770];
const euros = (n: number) => n.toLocaleString("fr-FR").replace(/\s/g, " ");

function Revenue({ L }: { L: SceneLine }) {
  const f = useF();
  const [, c1, c2] = L.chunks.map((c) => c.at);
  const COUNT_END = c1 + 26;
  const step = (COUNT_END - 8) / TOKENS.length;
  const count = tw(f, [6, COUNT_END], [0, 1], Easing.out(Easing.cubic));
  const value = Math.round((ESTIMATE.perMonthCents / 100) * count / 10) * 10;
  const counter = pop(f, 2, { damping: 12, stiffness: 170 });
  const land = Math.max(0, tw(f, [c2, c2 + 3], [0, 1]) - tw(f, [c2 + 3, c2 + 16], [0, 1]));
  const arrivals = TOKENS.map((_, k) => 2 + k * step + 16);
  const tick = Math.max(0, ...arrivals.map((a) => (f >= a && f < a + 6 ? 1 - (f - a) / 6 : 0)));
  const note = tw(f, [8, 18], [0, 1]);
  return (
    <SceneFrame L={L}>
      <Glow color="#E7B62D" y={40} size={80} opacity={tw(f, [-L.intro, 10], [0, 1])} />
      <Captions L={L} y={430} size={90} width={980} accent={GOLD} />
      {/* Chaque conseil : +7 € qui montent dans le compteur. */}
      {TOKENS.map((name, k) => {
        const t0 = 2 + k * step;
        const p = tw(f, [t0, t0 + 16], [0, 1], Easing.in(Easing.quad));
        if (f < t0 || p >= 1) return null;
        const x = TOKEN_X[k] + (540 - TOKEN_X[k]) * p;
        const y = 1230 + (760 - 1230) * p;
        const o = Math.min(tw(f, [t0, t0 + 3], [0, 1]), 1 - tw(f, [t0 + 12, t0 + 16], [0, 1]));
        return (
          <div key={k} style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${1 - 0.55 * p})`, opacity: o, display: "flex", alignItems: "center", gap: 12, padding: "10px 22px 10px 10px", borderRadius: 999, background: C.white, boxShadow: "0 18px 40px -16px rgba(0,0,0,.55)" }}>
            <ProductTile name={name} size={56} />
            <span style={{ fontFamily: HEAVY, fontWeight: 800, fontSize: 40, color: C.brand700, whiteSpace: "nowrap" }}>+{A.averageProductCents / 100} €</span>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, width: W, top: 640, textAlign: "center", opacity: Math.min(1, counter * 2), transform: `scale(${(0.5 + 0.5 * counter) * (1 + 0.035 * tick + 0.1 * land)})` }}>
        <div style={{ fontFamily: HEAVY, fontWeight: 800, fontSize: 178, lineHeight: 1, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", background: "linear-gradient(180deg, #FFF1C4 0%, #F2C94C 55%, #E0A21A 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 12px 34px rgba(231,182,45,.38))" }}>
          +{euros(value)} €
        </div>
        <div style={{ marginTop: 8, fontFamily: HEAVY, fontWeight: 800, fontSize: 62, color: C.white, letterSpacing: "-0.02em" }}>
          par mois<span style={{ color: GOLD }}>*</span>
        </div>
      </div>
      <Burst x={540} y={730} at={c2} count={22} radius={420} colors={[GOLD, "#FFF1C4", MINT]} size={18} />
      <Ring x={540} y={730} at={c2} max={900} color={GOLD} />
      <div style={{ position: "absolute", left: (W - 880) / 2, width: 880, top: 1376, boxSizing: "border-box", padding: "16px 26px", borderRadius: 18, background: "rgba(3,20,32,.5)", border: "1px solid rgba(255,255,255,.12)", textAlign: "center", fontSize: 34, fontWeight: 600, lineHeight: 1.32, color: "rgba(255,255,255,.92)", opacity: note, transform: `translateY(${(1 - note) * 16}px)` }}>
        {FOOTNOTE}
      </div>
      <Sfx at={-L.intro} name="whoosh" volume={0.3} />
      <Sfx at={0} name="montee" volume={0.3} />
      {arrivals.map((a, k) => (k % 2 === 0 ? <Sfx key={k} at={a} name="tic" volume={0.2} /> : null))}
      <Sfx at={c2} name="impact" volume={0.5} />
      <Sfx at={c2} name="pop" volume={0.4} />
    </SceneFrame>
  );
}

/* ---- 7. La carte de fin ------------------------------------------------------------ */

function End({ L }: { L: SceneLine }) {
  const f = useF();
  const [c0, c1, c2] = L.chunks.map((c) => c.at);
  const robot = pop(f, -L.intro, { damping: 10, stiffness: 150 });
  const word = pop(f, c0 - 1, { damping: 12, stiffness: 190 });
  const cta = pop(f, c1 - 1, { damping: 11, stiffness: 180 });
  const url = pop(f, c2 - 1, { damping: 12, stiffness: 190 });
  const underline = tw(f, [c2 + 4, c2 + 18], [0, 1]);
  const tag = tw(f, [L.len + 2, L.len + 14], [0, 1]);
  const shine = (f - c1) / 40 - Math.floor((f - c1) / 40);
  const pulse = f > c2 + 20 ? 1 + 0.025 * Math.sin(((f - c2) / 30) * Math.PI * 2.2) : 1;
  return (
    <SceneFrame L={L}>
      <Glow color={MINT} y={28} size={90} opacity={0.8} />
      <Ring x={540} y={480} at={-L.intro + 1} max={900} />
      <Burst x={540} y={470} at={-L.intro + 2} count={16} radius={360} />
      <div style={{ position: "absolute", left: 540 - 165, top: 280, transform: `scale(${0.3 + 0.7 * robot}) rotate(${(1 - robot) * 18}deg)`, opacity: Math.min(1, robot * 2) }}>
        <FloatingRobot size={330} t={f / 30 + 1.3} happy={f > L.len + 6 && f < L.len + 44} />
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 735, textAlign: "center", opacity: Math.min(1, word * 2), transform: `scale(${0.4 + 0.6 * word})` }}>
        <Wordmark size={126} dark />
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 900, display: "flex", justifyContent: "center", opacity: Math.min(1, cta * 2), transform: `translateY(${(1 - cta) * 60}px) scale(${(0.6 + 0.4 * cta) * pulse})` }}>
        <div style={{ position: "relative", overflow: "hidden", display: "inline-flex", alignItems: "center", gap: 18, height: 124, padding: "0 60px", borderRadius: 999, background: C.white, color: C.brand700, fontFamily: HEAVY, fontWeight: 800, fontSize: 52, letterSpacing: "-0.02em", boxShadow: `0 30px 60px -24px rgba(0,0,0,.6), 0 0 0 ${8 * (pulse - 1) * 40}px ${MINT}33` }}>
          Réservez votre démo <ArrowRight size={52} strokeWidth={2.8} />
          <div style={{ position: "absolute", top: 0, bottom: 0, width: 140, left: -200 + shine * 1000, background: "linear-gradient(100deg, transparent, rgba(54,232,200,.32) 50%, transparent)" }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 1078, display: "flex", justifyContent: "center", opacity: Math.min(1, url * 2), transform: `scale(${0.5 + 0.5 * url})` }}>
        <div style={{ position: "relative", fontFamily: HEAVY, fontWeight: 800, fontSize: 66, letterSpacing: "-0.02em", color: MINT, textShadow: `0 0 30px ${MINT}66` }}>
          pharmaboost.app
          <div style={{ position: "absolute", left: 0, bottom: -10, height: 6, borderRadius: 3, width: `${underline * 100}%`, background: MINT }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 1230, textAlign: "center", fontSize: 36, fontWeight: 600, color: "rgba(255,255,255,.82)", opacity: tag, transform: `translateY(${(1 - tag) * 14}px)` }}>
        Le copilote du comptoir officinal.
      </div>
      <Sfx at={-L.intro} name="impact" volume={0.5} />
      <Sfx at={c0} name="pop" volume={0.35} />
      <Sfx at={c1 - 1} name="swish" volume={0.35} />
      <Sfx at={c1 + 1} name="pop" volume={0.4} />
      <Sfx at={c2} name="tic" volume={0.35} />
    </SceneFrame>
  );
}

const SCENES: ComponentType<{ L: SceneLine }>[] = [Hook, Missed, Scan, Advice, Decide, Revenue, End];
