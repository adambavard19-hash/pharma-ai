import type { ComponentType } from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, type CalculateMetadataFunction } from "remotion";
import { Audio } from "@remotion/media";
import { CalendarDays, ChevronDown, Euro, Percent, Users, X } from "lucide-react";
import { C, ClockOffset, EASE_IN_OUT, FONT, MONO, SHADOW, tw, useF } from "../theme";
import { Sfx } from "../ui/sfx";
import { EndCard } from "../ui/common";
import { words } from "../ui/kinetic";
import { Cursor } from "../ui/product";
import { rgba } from "../ui/stage";
import { Burst, Flash, HEAVY, MINT, Ring, SceneFrame, pop, type SceneLine } from "../reel/stage";
import { FloatingRobot } from "../reel/robot";
import { CUT, PRE, SCENE_FPS, VIDEO_FPS, detectPauses, type VoiceInfo } from "../reel/timeline";
import { A, ESTIMATE, FALLBACK_DURATIONS, MONTHLY_PRICE_CENTS, OWN_CLIENTS, RATE_PERCENT, SCRIPT, VOICE_DIR, estimateFor, money, num } from "../tarif/script";
import { tarifTimeline, type TarifTimeline } from "../tarif/timeline";
import { Coin, NeonCross, Person, Subtitles, TarifStage } from "../tarif/stage";

/* ==========================================================================
 * « TARIF » — 16:9, 1920 × 1080, 60 images/s, ≈ 40 s. Section tarif du site.
 *
 * Pourquoi PharmaBoost vaut son abonnement, avec LE calcul du site, étape par
 * étape, dit par la voix (Yann, ElevenLabs) : 200 clients par jour → 10 %
 * prennent un conseil en plus → 20 clients → à 7 € → 140 € par jour → sur
 * 25 jours → 3 500 € par mois, pour un abonnement de 126 € HT. Puis le
 * simulateur du site, et la carte de fin (le robot, « Réserver une démo »).
 *
 * Aucun chiffre n'est écrit ici : tout vient de src/core/pricing (le calcul et
 * l'offre officielle) par src/tarif/script.ts. Le montage se cale sur la voix
 * (calculateMetadata mesure chaque fichier, comme le reel).
 *
 * Honnêteté, lisible à l'écran : « Estimation indicative : ce n'est pas une
 * promesse de résultat. » et « Chiffre d'affaires, pas une marge. » ; les
 * trois hypothèses restent écrites en haut de l'image pendant tout le calcul.
 * ======================================================================== */

export type TarifProps = { voices: VoiceInfo[] | null; stale: string[] };

/** La durée et les pauses d'un fichier de voix, décodé par le navigateur du rendu. */
async function measure(src: string): Promise<VoiceInfo> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src} : ${res.status}`);
  const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await res.arrayBuffer());
  return { dur: audio.duration, pauses: detectPauses(audio.getChannelData(0), audio.sampleRate) };
}

/** Ce que disent les fichiers de voix (écrit par scripts/voix-tarif.mjs) face au script : la liste des phrases périmées. */
async function staleVoices(): Promise<string[]> {
  try {
    const res = await fetch(staticFile(`${VOICE_DIR}/voix.json`));
    if (!res.ok) return [`${VOICE_DIR}/voix.json manque`];
    const manifest = (await res.json()) as { lignes?: Record<string, string> };
    return SCRIPT.filter((l) => manifest.lignes?.[l.id] !== l.say).map((l) => `${l.id} : la voix dit « ${manifest.lignes?.[l.id] ?? "—"} », le script « ${l.say} »`);
  } catch (e) {
    return [`${VOICE_DIR}/voix.json illisible (${e})`];
  }
}

/** La longueur du film vient de la voix : on mesure les sept fichiers avant le rendu. */
export const calculateTarifMetadata: CalculateMetadataFunction<TarifProps> = async ({ props }) => {
  const voices = await Promise.all(
    SCRIPT.map((line, i) =>
      measure(staticFile(`${VOICE_DIR}/${line.id}.mp3`)).catch((e) => {
        console.warn(`Tarif : voix ${line.id} illisible (${e}) — durée de secours ${FALLBACK_DURATIONS[i]} s.`);
        return { dur: FALLBACK_DURATIONS[i], pauses: [] };
      }),
    ),
  );
  return { durationInFrames: Math.ceil(tarifTimeline(voices).total * VIDEO_FPS), props: { ...props, voices, stale: await staleVoices() } };
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** La musique : −13 dB sous la voix pendant qu'elle parle (un fond qu'on entend encore), plus présente sur la carte de fin, fondu à la toute fin. */
const DUCKED = 0.22;
const OPEN = 0.7;
function musicVolume(t: number, tl: TarifTimeline) {
  const a = tl.lines[0].start - 0.12;
  const b = tl.lines[tl.lines.length - 1].end + 0.1;
  const v = t < b ? interpolate(t, [a - 0.15, a], [OPEN, DUCKED], clamp) : interpolate(t, [b, b + 0.5], [DUCKED, OPEN], clamp);
  return v * interpolate(t, [tl.total - 1.2, tl.total - 0.05], [1, 0], clamp);
}

/** Les scènes : une ou plusieurs phrases chacune (la foule tient de « 200 clients » à « 140 € par jour », sans coupe). */
const GROUPS = [[0], [1, 2, 3], [4], [5], [6]];
/** La carte de fin entre pendant le silence qui suit la dernière phrase. */
const END_INTRO = 0.4;

/** Une phrase vue depuis sa scène : son début, sa durée et les débuts de ses sous-titres, en images de scène. */
type Spoken = { at: number; len: number; chunks: number[] };
type SceneProps = { L: SceneLine; lines: Spoken[] };

export function Tarif({ voices, stale }: TarifProps) {
  if (stale?.length) throw new Error(`Film « Tarif » : la voix ne dit plus le script — node scripts/voix-tarif.mjs. ${stale.join(" · ")}`);
  const tl = tarifTimeline(voices ?? FALLBACK_DURATIONS.map((dur) => ({ dur, pauses: [] })));
  const S = SCENE_FPS;
  const vf = (s: number) => Math.round(s * VIDEO_FPS);
  const endFrom = vf(tl.endStart - END_INTRO);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: "#082638" }}>
      <TarifStage />
      {GROUPS.map((group, gi) => {
        const lines = group.map((i) => tl.lines[i]);
        const first = lines[0];
        const last = lines[lines.length - 1];
        const nextStart = gi < GROUPS.length - 1 ? tl.lines[GROUPS[gi + 1][0]].start - PRE : tl.endStart - END_INTRO;
        const from = gi === 0 ? 0 : vf(first.start - PRE);
        const to = vf(nextStart + CUT);
        const L: SceneLine = {
          len: (last.end - first.start) * S,
          chunks: lines.flatMap((l) => l.chunks.map((c) => ({ text: c.text, at: (c.start - first.start) * S, end: (c.end - first.start) * S }))),
          exit: (nextStart - first.start) * S,
          intro: (first.start - from / VIDEO_FPS) * S,
        };
        const spoken: Spoken[] = lines.map((l) => ({ at: (l.start - first.start) * S, len: l.dur * S, chunks: l.chunks.map((c) => (c.start - first.start) * S) }));
        const Scene = SCENES[gi];
        return (
          <Sequence key={first.id} from={from} durationInFrames={to - from} name={lines.map((l) => `${l.id} · ${l.text}`).join("  ")}>
            <ClockOffset.Provider value={{ from, bound: first.start * S, rate: S / VIDEO_FPS }}>
              <Scene L={L} lines={spoken} />
            </ClockOffset.Provider>
          </Sequence>
        );
      })}
      {/* Le calcul, étape par étape, et la mention de l'estimation : sur l'horloge du film, au-dessus des scènes. */}
      <ClockOffset.Provider value={{ from: 0, bound: 0, rate: S / VIDEO_FPS }}>
        <Ledger tl={tl} />
        <Honesty tl={tl} />
      </ClockOffset.Provider>
      <Sequence from={endFrom} name="Carte de fin">
        <ClockOffset.Provider value={{ from: endFrom, bound: tl.endStart * S, rate: S / VIDEO_FPS }}>
          <EndCard intro={END_INTRO * S} lead={[words("Un seul abonnement."), words("*Tout est inclus.*", C.brand300)]} mark="robot" />
        </ClockOffset.Provider>
      </Sequence>
      {tl.lines.map((line) => (
        <Sequence key={`voix-${line.id}`} from={vf(line.start)} layout="none" name={`Voix ${line.id}`}>
          <Audio src={staticFile(`${VOICE_DIR}/${line.id}.mp3`)} />
        </Sequence>
      ))}
      <Audio src={staticFile("music/tarif.wav")} volume={(f) => musicVolume(f / VIDEO_FPS, tl)} />
    </AbsoluteFill>
  );
}

/* ---- Le calcul en haut de l'image, et la mention de l'estimation ------------------------------------------- */

/** Les étapes du simulateur du site (revenue-calculator.tsx), mêmes libellés, mêmes valeurs. */
const STEPS = [
  { label: "Clients par jour", value: num(ESTIMATE.clientsPerDay) },
  { label: `Clients conseillés (${RATE_PERCENT} %)`, value: `${num(ESTIMATE.advisedClientsPerDay)} par jour` },
  { label: `× ${money(A.averageProductCents)} par produit en moyenne`, value: `${money(ESTIMATE.perDayCents)} par jour` },
  { label: `× ${A.openDaysPerMonth} jours d'ouverture`, value: `${money(ESTIMATE.perMonthCents)} par mois` },
];

const sec = (s: number) => s * SCENE_FPS;

function Ledger({ tl }: { tl: TarifTimeline }) {
  const f = useF();
  const [t1, t2, t3, t4, t5, t6] = tl.lines;
  const appear = sec(t1.chunks[2].start) - 3;
  const dockAt = sec(t2.start - PRE);
  const dock = tw(f, [dockAt - 6, dockAt + 12], [0, 1], EASE_IN_OUT);
  const goneAt = sec(t6.start - PRE);
  const gone = tw(f, [goneAt - 4, goneAt + 6], [0, 1], EASE_IN_OUT);
  const fills = [sec(t2.chunks[2].start) - 2, sec(t3.chunks[3].start) + 4, sec(t4.chunks[2].start) + 12, sec(t5.chunks[1].start) + 3];
  if (f < appear - 1 || gone >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 0, width: 1920, top: interpolate(dock, [0, 1], [590, 32]), display: "flex", justifyContent: "center", alignItems: "stretch", gap: 14, transform: `scale(${interpolate(dock, [0, 1], [1.24, 1])})`, transformOrigin: "50% 0", opacity: 1 - gone }}>
      {STEPS.map((step, i) => {
        const p = pop(f, appear + i * 3, { damping: 14, stiffness: 170 });
        const v = pop(f, fills[i], { damping: 12, stiffness: 200 });
        const flash = f >= fills[i] ? Math.max(0, 1 - (f - fills[i]) / 22) : 0;
        const on = f >= fills[i];
        const last = i === STEPS.length - 1;
        return (
          <div
            key={i}
            style={{
              position: "relative",
              minWidth: 236,
              padding: "11px 22px 12px",
              borderRadius: 18,
              background: on ? `rgba(54,232,200,${0.1 + 0.16 * flash})` : "rgba(255,255,255,.07)",
              border: `1.5px solid ${on ? rgba(MINT, 0.42 + 0.5 * flash) : "rgba(255,255,255,.16)"}`,
              boxShadow: flash > 0 ? `0 0 ${44 * flash}px ${rgba(MINT, 0.45 * flash)}` : "none",
              opacity: Math.min(1, p * 2),
              transform: `translateY(${(1 - p) * 26}px) scale(${(0.8 + 0.2 * p) * (1 + 0.06 * flash)})`,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 600, color: "rgba(255,255,255,.74)", whiteSpace: "nowrap" }}>{step.label}</div>
            <div style={{ position: "relative", marginTop: 3 }}>
              <span style={{ display: "inline-block", fontFamily: HEAVY, fontWeight: 800, fontSize: 34, letterSpacing: "-0.02em", whiteSpace: "nowrap", color: last ? MINT : C.white, opacity: Math.min(1, v * 2), transform: `translateY(${(1 - Math.min(1, v)) * 18}px)` }}>{step.value}</span>
              <span style={{ position: "absolute", left: 0, top: 0, fontFamily: HEAVY, fontWeight: 800, fontSize: 34, color: "rgba(255,255,255,.32)", opacity: 1 - Math.min(1, v * 2) }}>?</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Les deux phrases d'honnêteté, en bas de l'image, de la première hypothèse à la fin du calcul (le simulateur les répète). */
function Honesty({ tl }: { tl: TarifTimeline }) {
  const f = useF();
  const a = sec(tl.lines[1].start) + 4;
  const out = sec(tl.lines[6].start - PRE);
  const o = Math.min(tw(f, [a, a + 14], [0, 1]), 1 - tw(f, [out - 4, out + 6], [0, 1]));
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, width: 1920, top: 1006, textAlign: "center", fontSize: 25, fontWeight: 600, letterSpacing: "0.005em", color: "rgba(255,255,255,.68)", opacity: o }}>
      Estimation indicative{" "}: ce n'est pas une promesse de résultat. Chiffre d'affaires, pas une marge.
    </div>
  );
}

/* ---- 1. La question --------------------------------------------------------------------------------------- */

/** Les symboles du calcul autour du robot : leur place (par rapport à lui) et leur couleur. */
const BADGES = [
  { I: Users, c: C.white, dx: -440, dy: -110 },
  { I: Percent, c: "#22C88F", dx: -540, dy: 70 },
  { I: Euro, c: C.accent300, dx: -370, dy: 200 },
  { I: X, c: MINT, dx: 440, dy: -100 },
  { I: CalendarDays, c: C.white, dx: 540, dy: 80 },
  { I: Euro, c: MINT, dx: 370, dy: 205 },
];

function Hook({ L }: SceneProps) {
  const f = useF();
  const [, c1, c2, c3] = L.chunks.map((c) => c.at);
  const robot = pop(f, -L.intro, { damping: 10, stiffness: 150 });
  const cx = 960, cy = 300;
  const t = f / 30;
  // « Faisons le calcul » : les symboles plongent vers les étapes du calcul, qui s'ouvrent dessous.
  const dive = tw(f, [c2 - 6, c2 + 10], [0, 1], Easing.in(Easing.cubic));
  const bubble = pop(f, c1 + 2, { damping: 12, stiffness: 190 });
  const bubbleOut = tw(f, [c2 - 4, c2 + 4], [0, 1]);
  return (
    <SceneFrame L={L} fadeIn={false}>
      <Ring x={cx} y={cy} at={-L.intro + 2} max={820} />
      {BADGES.map(({ I, c, dx, dy }, i) => {
        const p = pop(f, -L.intro + 4 + i * 2, { damping: 13, stiffness: 150 });
        const ox = cx + dx;
        const oy = cy + dy + Math.sin(t * 2.1 + i) * 10;
        const bump = 1 + 0.16 * Math.max(0, tw(f, [c1 + i, c1 + i + 4], [0, 1]) - tw(f, [c1 + i + 4, c1 + i + 12], [0, 1]));
        const tx = 520 + [0, 1, 2, 5, 4, 3][i] * 176;
        const x = interpolate(dive, [0, 1], [cx + (ox - cx) * p, tx]);
        const y = interpolate(dive, [0, 1], [cy + (oy - cy) * p, 640]);
        return (
          <div key={i} style={{ position: "absolute", left: x - 56, top: y - 56, width: 112, height: 112, borderRadius: 32, display: "grid", placeItems: "center", background: "rgba(255,255,255,.09)", border: "1.5px solid rgba(255,255,255,.2)", boxShadow: `0 18px 40px -18px rgba(0,0,0,.6), 0 0 32px -6px ${c}55`, opacity: Math.min(1, p * 2) * (1 - dive), transform: `scale(${(0.2 + 0.8 * p) * bump * (1 - 0.5 * dive)}) rotate(${Math.sin(t * 1.6 + i * 1.3) * 8 + (1 - p) * 90}deg)` }}>
            <I size={54} color={c} strokeWidth={2.3} />
          </div>
        );
      })}
      <div style={{ position: "absolute", left: cx - 150, top: cy - 165, transform: `scale(${0.3 + 0.7 * robot}) rotate(${(1 - robot) * -16}deg)`, opacity: Math.min(1, robot * 2) }}>
        <FloatingRobot size={300} t={t + 0.9} happy={f >= c3 - 2 && f < c3 + 40} />
      </div>
      {/* La bulle du robot : « ? », puis « € ». */}
      <div style={{ position: "absolute", left: cx + 140, top: cy - 205, width: 104, height: 92, borderRadius: 30, borderBottomLeftRadius: 8, display: "grid", placeItems: "center", background: C.white, boxShadow: "0 20px 40px -18px rgba(0,0,0,.55)", opacity: Math.min(1, bubble * 2) * (1 - bubbleOut), transform: `scale(${(0.3 + 0.7 * bubble) * (1 - 0.4 * bubbleOut)})`, transformOrigin: "0% 100%" }}>
        <span style={{ fontFamily: HEAVY, fontWeight: 800, fontSize: 60, color: C.brand700, lineHeight: 1 }}>?</span>
      </div>
      <Subtitles L={L} />
      <Sfx at={-L.intro + 2} name="impact" volume={0.5} />
      {BADGES.map((_, i) => (i % 2 === 0 ? <Sfx key={i} at={-L.intro + 6 + i * 2} name="pop" volume={0.18} /> : null))}
      <Sfx at={c1 + 2} name="pop" volume={0.3} />
      <Sfx at={c2 - 4} name="swish" volume={0.32} />
    </SceneFrame>
  );
}

/* ---- 2. La foule : 200 clients, 10 % conseillés, 7 € chacun -------------------------------------------------- */

const COLS = 20;
const ROWS = Math.ceil(ESTIMATE.clientsPerDay / COLS);
const GRID = { x: 652, y: 176, px: 57, py: 59 };
const cell = (i: number) => ({ c: i % COLS, r: Math.floor(i / COLS) });
const cellXY = (i: number) => ({ x: GRID.x + GRID.px * (cell(i).c + 0.5), y: GRID.y + GRID.py * (cell(i).r + 0.5) });
/** Les clients conseillés : un sur dix, répartis dans la foule (deux par rang, décalés d'un rang à l'autre). */
const LIT: number[] = (() => {
  const out: number[] = [];
  const per = Math.round(ESTIMATE.clientsPerDay / Math.max(1, ESTIMATE.advisedClientsPerDay));
  for (let k = 0; k < ESTIMATE.advisedClientsPerDay; k++) {
    const r = Math.floor((k * per) / COLS);
    const j = k % 2;
    out.push(r * COLS + ((r * 7 + 3 + j * 10) % COLS));
  }
  return out;
})();
/** Leur place en formation, deux rangs de dix, pour recevoir leur pièce. */
const formation = (k: number) => {
  const perRow = Math.ceil(LIT.length / 2);
  const row = Math.floor(k / perRow);
  const j = k % perRow;
  return { x: 760 + j * ((1700 - 760) / Math.max(1, perRow - 1)), y: 400 + row * 230 };
};
/** La colonne de gauche : le résultat, au fil du calcul. */
const LEFT = 345;
const COUNTER = { x: LEFT, y: 452 };

function Crowd({ L, lines }: SceneProps) {
  const f = useF();
  const [l2, l3, l4] = lines;
  const [a0, a1, a2] = l2.chunks;
  const [b0, b1, b2, b3] = l3.chunks;
  const [d0, , d2] = l4.chunks;
  const t = f / 30;

  // T2 : la pharmacie, puis la foule se remplit en vague.
  const cross = pop(f, -L.intro + 2, { damping: 13 });
  const settle = tw(f, [a1 - 16, a1 - 2], [0, 1], EASE_IN_OUT);
  const appearAt = (i: number) => a1 - 8 + cell(i).c * 0.95 + cell(i).r * 1.25;
  const arrived = Array.from({ length: ESTIMATE.clientsPerDay }, (_, i) => (f >= appearAt(i) + 3 ? 1 : 0) as number).reduce((s, x) => s + x, 0);

  // T3 : « × 10 % » en grand, la foule s'assombrit, un client sur dix s'allume.
  const big = pop(f, b0 - 2, { damping: 12, stiffness: 180 });
  const park = tw(f, [b1 + 4, b1 + 18], [0, 1], EASE_IN_OUT);
  const dim = tw(f, [b0 + 2, b0 + 14], [0, 1], EASE_IN_OUT);
  const litAt = (k: number) => b1 + 8 + k * 1.3;

  // T4 : les autres s'effacent, les 20 se rangent, chacun reçoit sa pièce ; les pièces montent dans le compteur.
  const clear = tw(f, [d0 - 8, d0 + 4], [0, 1], EASE_IN_OUT);
  const line = tw(f, [d0 - 6, d0 + 12], [0, 1], EASE_IN_OUT);
  const coinAt = (k: number) => d0 + 8 + k * 0.9;
  const FLY = 13;
  const flyFrom = Math.max(d0 + 30, d2 - 40);
  const departAt = (k: number) => flyFrom + k * 1.5;
  const landAt = (k: number) => departAt(k) + FLY;
  const landed = LIT.filter((_, k) => f >= landAt(k)).length;
  const finalAt = landAt(LIT.length - 1);

  // Le compteur de gauche : 200 clients → 20 conseillés → 140 € par jour.
  const phase = landed > 0 ? 2 : f >= b3 - 1 ? 1 : 0;
  const swapAt = phase === 2 ? landAt(0) : phase === 1 ? b3 - 1 : a1 - 8;
  const swap = tw(f, [swapAt, swapAt + 8], [0, 1]);
  const value = phase === 2 ? money(landed * A.averageProductCents) : phase === 1 ? num(ESTIMATE.advisedClientsPerDay) : num(arrived);
  const label = phase === 2 ? "par jour" : phase === 1 ? "clients conseillés par jour" : "clients par jour";
  const tick = Math.max(0, ...LIT.map((_, k) => (f >= landAt(k) && f < landAt(k) + 6 ? 1 - (f - landAt(k)) / 6 : 0)));
  const land = Math.max(0, tw(f, [finalAt, finalAt + 3], [0, 1]) - tw(f, [finalAt + 3, finalAt + 16], [0, 1]));
  const counterIn = tw(f, [a1 - 10, a1], [0, 1]);
  // L'opérateur sous le compteur : « × 10 % » (venu du centre), puis « × 7 € ».
  const opFlip = tw(f, [d0 - 2, d0 + 8], [0, 1], EASE_IN_OUT);

  return (
    <SceneFrame L={L}>
      {/* La pharmacie : en grand au centre sur « Prenez une pharmacie », puis à sa place, en haut de la colonne. */}
      <div style={{ position: "absolute", left: LEFT - 50, top: 188, opacity: Math.min(1, cross * 2), transform: `translate(${(1 - settle) * (1225 - LEFT)}px, ${(1 - settle) * 160}px) scale(${(0.4 + 0.6 * cross) * (1 + 1.4 * (1 - settle))})` }}>
        <NeonCross size={100} glow={0.8 + 0.2 * Math.sin(t * 3)} />
      </div>
      <div style={{ position: "absolute", left: LEFT - 260, width: 520, top: 304, textAlign: "center", fontSize: 30, fontWeight: 700, color: "rgba(255,255,255,.85)", opacity: tw(f, [-L.intro + 6, -L.intro + 16], [0, 1]), transform: `translate(${(1 - settle) * (1225 - LEFT)}px, ${(1 - settle) * 260}px) scale(${1 + 0.7 * (1 - settle)})` }}>Une pharmacie</div>

      {/* Le compteur. */}
      <div style={{ position: "absolute", left: LEFT - 280, width: 560, top: 350, textAlign: "center", opacity: counterIn, transform: `scale(${(0.85 + 0.15 * counterIn) * (1 + 0.04 * tick + 0.1 * land)})` }}>
        <div style={{ height: 160, overflow: "hidden" }}>
          <div style={{ fontFamily: HEAVY, fontWeight: 800, fontSize: 148, lineHeight: "160px", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: phase === 0 ? C.white : MINT, textShadow: phase === 0 ? "none" : `0 0 40px ${rgba(MINT, 0.35)}`, transform: `translateY(${(1 - swap) * 60}px)`, opacity: swap }}>{value}</div>
        </div>
        <div style={{ marginTop: 4, fontSize: 34, fontWeight: 700, color: "rgba(255,255,255,.82)", opacity: swap }}>{label}</div>
      </div>
      <div style={{ position: "absolute", left: LEFT - 150, width: 300, top: 642, display: "flex", justifyContent: "center", opacity: park, perspective: 600 }}>
        <div style={{ padding: "10px 30px", borderRadius: 999, background: rgba(MINT, 0.16), border: `2px solid ${rgba(MINT, 0.6)}`, fontFamily: HEAVY, fontWeight: 800, fontSize: 46, color: MINT, whiteSpace: "nowrap", transform: `rotateX(${opFlip < 0.5 ? opFlip * 180 : (opFlip - 1) * 180}deg)` }}>
          {opFlip < 0.5 ? `× ${RATE_PERCENT} %` : `× ${money(A.averageProductCents)}`}
        </div>
      </div>

      {/* La foule. */}
      {Array.from({ length: ESTIMATE.clientsPerDay }, (_, i) => {
        const k = LIT.indexOf(i);
        const p = pop(f, appearAt(i), { damping: 13, stiffness: 190 });
        if (p <= 0.001) return null;
        const home = cellXY(i);
        if (k < 0) {
          const o = Math.min(1, p * 2) * (1 - 0.78 * dim) * (1 - clear);
          if (o <= 0.001) return null;
          return <div key={i} style={{ position: "absolute", left: home.x - 17, top: home.y - 20, opacity: o, transform: `scale(${0.3 + 0.7 * p})` }}><Person size={34} color="rgba(232,246,250,.92)" /></div>;
        }
        const lit = pop(f, litAt(k), { damping: 11, stiffness: 200 });
        // Dans la foule comme les autres jusqu'à ce qu'il s'allume : rien n'est montré avant la voix.
        const shade = 1 - 0.78 * dim * (1 - Math.min(1, lit * 1.5));
        const to = formation(k);
        const x = interpolate(line, [0, 1], [home.x, to.x]);
        const y = interpolate(line, [0, 1], [home.y, to.y]);
        const s = (0.3 + 0.7 * Math.min(1, p)) * (1 + 0.28 * Math.min(1, lit)) * (1 + 0.5 * line);
        const color = lit > 0.05 ? MINT : "rgba(232,246,250,.92)";
        const plus = pop(f, litAt(k) + 3, { damping: 12, stiffness: 220 }) * (1 - line);
        return (
          <div key={i} style={{ position: "absolute", left: x - 17, top: y - 20, opacity: Math.min(1, p * 2) * shade, transform: `scale(${s})`, filter: lit > 0.05 ? `drop-shadow(0 0 ${10 * Math.min(1, lit)}px ${rgba(MINT, 0.9)})` : undefined }}>
            <Person size={34} color={color} />
            {plus > 0.01 && (
              <div style={{ position: "absolute", left: 24, top: -12, width: 20, height: 20, borderRadius: 10, display: "grid", placeItems: "center", background: C.white, color: C.brand700, fontSize: 17, fontWeight: 800, lineHeight: 1, transform: `scale(${plus})` }}>+</div>
            )}
          </div>
        );
      })}

      {/* « × 10 % » en grand, au centre de la foule, avant de se ranger sous le compteur. */}
      {big > 0.001 && park < 1 && (
        <div
          style={{
            position: "absolute",
            left: interpolate(park, [0, 1], [1225, LEFT]),
            top: interpolate(park, [0, 1], [470, 676]),
            transform: `translate(-50%, -50%) scale(${interpolate(park, [0, 1], [1, 0.3]) * (0.4 + 0.6 * big)})`,
            opacity: Math.min(1, big * 2) * (1 - tw(park, [0.75, 1], [0, 1])),
            padding: "10px 48px 20px",
            borderRadius: 48,
            background: "rgba(6,30,46,.82)",
            border: `3px solid ${rgba(MINT, 0.7)}`,
            boxShadow: `0 0 80px ${rgba(MINT, 0.35)}, 0 40px 80px -30px rgba(0,0,0,.7)`,
            fontFamily: HEAVY,
            fontWeight: 800,
            fontSize: 168,
            letterSpacing: "-0.04em",
            color: MINT,
            whiteSpace: "nowrap",
          }}
        >
          ×{" "}{RATE_PERCENT}{" "}%
        </div>
      )}

      {/* Les pièces : une par client conseillé, puis dans le compteur. */}
      {LIT.map((_, k) => {
        const p = pop(f, coinAt(k), { damping: 11, stiffness: 210 });
        if (p <= 0.001 || f >= landAt(k)) return null;
        const at = formation(k);
        const fly = tw(f, [departAt(k), landAt(k)], [0, 1], Easing.in(Easing.quad));
        const x = interpolate(fly, [0, 1], [at.x, COUNTER.x]);
        const y = interpolate(fly, [0, 1], [at.y - 96, COUNTER.y]) - Math.sin(Math.PI * fly) * 120;
        return (
          <div key={k} style={{ position: "absolute", left: x - 40, top: y - 40, opacity: Math.min(1, p * 2), transform: `scale(${(0.3 + 0.7 * p) * (1 - 0.45 * fly)}) rotate(${(1 - Math.min(1, p)) * -40 + fly * 200}deg)` }}>
            <Coin size={80} label={money(A.averageProductCents)} />
          </div>
        );
      })}
      {/* Le calcul du jour, entre les deux rangs : 20 × 7 € = 140 €. */}
      <div style={{ position: "absolute", left: 700, width: 1060, top: 515, display: "flex", justifyContent: "center", alignItems: "baseline", gap: 22, transform: "translateY(-50%)", fontFamily: HEAVY, fontWeight: 800, fontSize: 70, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
        {[num(ESTIMATE.advisedClientsPerDay), "×", money(A.averageProductCents), "=", money(ESTIMATE.perDayCents)].map((part, j) => {
          const q = pop(f, d2 - 4 + j * 3, { damping: 12, stiffness: 200 });
          return <span key={j} style={{ display: "inline-block", color: j === 4 ? MINT : j % 2 ? "rgba(255,255,255,.6)" : C.white, opacity: Math.min(1, q * 2), transform: `translateY(${(1 - Math.min(1, q)) * 30}px) scale(${0.5 + 0.5 * q})`, textShadow: j === 4 ? `0 0 34px ${rgba(MINT, 0.5)}` : "0 6px 22px rgba(2,18,30,.6)" }}>{part}</span>;
        })}
      </div>
      <Burst x={COUNTER.x} y={COUNTER.y} at={finalAt} count={18} radius={260} colors={[MINT, C.accent300, C.white]} />
      <Ring x={COUNTER.x} y={COUNTER.y} at={finalAt} max={520} />
      <Ring x={1225} y={470} at={b0 - 1} max={700} />

      <Subtitles L={L} />
      <Sfx at={-L.intro} name="whoosh" volume={0.28} />
      <Sfx at={-L.intro + 3} name="pop" volume={0.35} />
      {Array.from({ length: 8 }, (_, k) => <Sfx key={`w${k}`} at={a1 - 6 + k * 4} name="tic" volume={0.14} />)}
      <Sfx at={a2} name="pop" volume={0.3} />
      <Sfx at={b0 - 2} name="impact" volume={0.38} />
      {LIT.map((_, k) => (k % 3 === 0 ? <Sfx key={`l${k}`} at={litAt(k)} name="pop" volume={0.16} /> : null))}
      <Sfx at={b1 + 4} name="swish" volume={0.25} />
      <Sfx at={b3} name="pop" volume={0.32} />
      <Sfx at={d0 - 8} name="whoosh" volume={0.22} />
      {LIT.map((_, k) => (k % 4 === 0 ? <Sfx key={`c${k}`} at={coinAt(k)} name="pop" volume={0.14} /> : null))}
      {LIT.map((_, k) => (k % 2 === 0 ? <Sfx key={`t${k}`} at={landAt(k)} name="tic" volume={0.2} /> : null))}
      <Sfx at={finalAt} name="pop" volume={0.42} />
    </SceneFrame>
  );
}

/* ---- 3. Le mois : 25 jours d'ouverture, 3 500 € -------------------------------------------------------------- */

const CAL = { x: 128, y: 172, w: 800, cols: 5, cw: 134, ch: 84, gap: 13 };

function Month({ L }: SceneProps) {
  const f = useF();
  const [e0, e1, e2] = L.chunks.map((c) => c.at);
  const card = pop(f, -L.intro, { damping: 16, stiffness: 150 });
  const days = A.openDaysPerMonth;
  const first = e0 + 12;
  const lastDay = e1 - 3;
  const dayAt = (k: number) => first + (lastDay - first) * Math.pow(k / Math.max(1, days - 1), 0.8);
  const filled = Array.from({ length: days }, (_, k) => k).filter((k) => f >= dayAt(k)).length;
  const value = Math.max(1, filled) * ESTIMATE.perDayCents;
  const done = filled === days;
  const tick = Math.max(0, ...Array.from({ length: days }, (_, k) => (f >= dayAt(k) && f < dayAt(k) + 5 ? 1 - (f - dayAt(k)) / 5 : 0)));
  const land = Math.max(0, tw(f, [lastDay, lastDay + 3], [0, 1]) - tw(f, [lastDay + 3, lastDay + 18], [0, 1]));
  // Le compteur arrive avec le premier jour : jamais « 0 € » à l'écran.
  const right = pop(f, first - 2, { damping: 14, stiffness: 170 });
  const note = pop(f, e2 + 2, { damping: 14, stiffness: 170 });
  const gridW = CAL.cols * CAL.cw + (CAL.cols - 1) * CAL.gap;
  const gx = CAL.x + (CAL.w - gridW) / 2;
  const RX = 1385;
  return (
    <SceneFrame L={L}>
      {/* Le calendrier : 25 jours d'ouverture, chacun +140 €. */}
      <div style={{ position: "absolute", left: CAL.x, top: CAL.y, width: CAL.w, height: 612, borderRadius: 28, background: C.white, boxShadow: SHADOW.lift, opacity: Math.min(1, card * 2), transform: `translateX(${(1 - card) * -160}px) rotate(${(1 - card) * -4}deg)` }}>
        <div style={{ position: "absolute", left: 40, right: 40, top: 30, display: "flex", alignItems: "center", gap: 16 }}>
          <CalendarDays size={40} color={C.brand600} strokeWidth={2.2} />
          <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", color: C.ink900 }}>{days} jours d'ouverture</span>
          <span style={{ marginLeft: "auto", padding: "8px 18px", borderRadius: 999, background: C.brand50, border: `1px solid ${C.brand200}`, fontSize: 24, fontWeight: 700, color: C.brand700, whiteSpace: "nowrap" }}>{money(ESTIMATE.perDayCents)} par jour</span>
        </div>
      </div>
      {Array.from({ length: days }, (_, k) => {
        const c = k % CAL.cols;
        const r = Math.floor(k / CAL.cols);
        const on = f >= dayAt(k);
        const p = pop(f, dayAt(k), { damping: 11, stiffness: 230 });
        const show = pop(f, -L.intro + 4 + k * 0.5, { damping: 18, stiffness: 180 });
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: gx + c * (CAL.cw + CAL.gap),
              top: CAL.y + 112 + r * (CAL.ch + CAL.gap),
              width: CAL.cw,
              height: CAL.ch,
              borderRadius: 16,
              background: on ? `linear-gradient(140deg, ${C.brand500}, ${C.brand700})` : C.ink50,
              border: `1.5px solid ${on ? C.brand600 : C.ink200}`,
              boxShadow: on ? `0 10px 22px -12px ${rgba(C.brand700, 0.8)}` : "none",
              opacity: Math.min(1, show * 2) * Math.min(1, card * 2),
              transform: `scale(${(0.7 + 0.3 * show) * (on ? 0.9 + 0.1 * Math.min(1.15, p) : 1)})`,
            }}
          >
            <span style={{ position: "absolute", left: 12, top: 8, fontSize: 18, fontWeight: 700, color: on ? "rgba(255,255,255,.75)" : C.ink400 }}>{k + 1}</span>
            {on && <span style={{ position: "absolute", left: 0, right: 0, bottom: 10, textAlign: "center", fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em", color: C.white, opacity: Math.min(1, p * 2), whiteSpace: "nowrap" }}>+{money(ESTIMATE.perDayCents)}</span>}
          </div>
        );
      })}

      {/* Le compteur du mois. */}
      <div style={{ position: "absolute", left: RX - 470, width: 940, top: 228, textAlign: "center", opacity: Math.min(1, right * 2), transform: `translateY(${(1 - right) * 40}px)` }}>
        <div style={{ fontSize: 34, fontWeight: 700, color: "rgba(255,255,255,.82)" }}>Chiffre d'affaires en plus</div>
        <div style={{ marginTop: 10, transform: `scale(${1 + 0.03 * tick + 0.12 * land})` }}>
          <span style={{ display: "inline-block", fontFamily: HEAVY, fontWeight: 800, fontSize: 176, lineHeight: 1.05, letterSpacing: "-0.045em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", background: `linear-gradient(180deg, #E9FFFA 0%, ${MINT} 60%, ${C.brand400} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: `drop-shadow(0 12px 36px ${rgba(MINT, done ? 0.45 : 0.25)})` }}>
            {money(value)}
          </span>
        </div>
        {/* Pendant le décompte, le cumul « après N jours » ; « par mois » seulement une fois les 25 jours comptés. */}
        <div style={{ marginTop: 2, fontFamily: HEAVY, fontWeight: 800, fontSize: 58, letterSpacing: "-0.02em", color: done ? C.white : "rgba(255,255,255,.7)" }}>{done ? "par mois" : `après ${Math.max(1, filled)}\u00A0jour${filled > 1 ? "s" : ""}`}</div>
      </div>
      <div style={{ position: "absolute", left: RX - 400, width: 800, top: 628, display: "flex", justifyContent: "center", opacity: Math.min(1, note * 2), transform: `translateY(${(1 - Math.min(1, note)) * 24}px) scale(${0.85 + 0.15 * Math.min(1, note)})` }}>
        <div style={{ padding: "14px 30px", borderRadius: 999, background: "rgba(255,255,255,.1)", border: "1.5px solid rgba(255,255,255,.28)", fontSize: 32, fontWeight: 700, color: C.white, whiteSpace: "nowrap" }}>
          Chiffre d'affaires, <span style={{ color: C.accent300 }}>pas une marge.</span>
        </div>
      </div>
      <Ring x={RX} y={410} at={lastDay} max={900} />
      <Burst x={RX} y={400} at={lastDay} count={24} radius={460} colors={[MINT, C.white, C.accent300]} size={18} />
      <Flash at={lastDay} strength={0.1} />

      <Subtitles L={L} />
      <Sfx at={-L.intro} name="whoosh" volume={0.3} />
      <Sfx at={first - 4} name="montee" volume={0.32} />
      {Array.from({ length: days }, (_, k) => (k % 2 === 0 ? <Sfx key={k} at={dayAt(k)} name="tic" volume={0.18} /> : null))}
      <Sfx at={lastDay} name="impact" volume={0.5} />
      <Sfx at={lastDay} name="pop" volume={0.4} />
      <Sfx at={e2 + 2} name="pop" volume={0.25} />
    </SceneFrame>
  );
}

/* ---- 4. À la même échelle : 3 500 € et 126 € HT ---------------------------------------------------------------- */

function Bar({ label, value, width, color, grow, dark = false, ring = 0 }: { label: string; value: string; width: number; color: string; grow: number; dark?: boolean; ring?: number }) {
  const w = Math.max(0.015, width) * grow;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", fontSize: 28 }}>
        <span style={{ color: rgba(C.brand900, 0.78), fontWeight: 500 }}>{label}</span>
        <span style={{ color: C.brand900, fontWeight: 700, fontVariantNumeric: "tabular-nums", opacity: tw(grow, [0.3, 0.8], [0, 1]) }}>{value}</span>
      </div>
      <div style={{ position: "relative", marginTop: 10, height: 30, borderRadius: 15, background: dark ? C.ink100 : C.white }}>
        <div style={{ height: "100%", width: `${w * 100}%`, borderRadius: 15, background: color }} />
        {ring > 0 && <div style={{ position: "absolute", left: `${w * 100}%`, top: 15, width: 132, height: 58, marginLeft: -76, marginTop: -29, borderRadius: "50%", border: `4px solid ${C.accent400}`, opacity: ring, transform: `scale(${0.6 + 0.4 * ring})` }} />}
      </div>
    </div>
  );
}

function Compare({ L }: SceneProps) {
  const f = useF();
  const [g0, g1, g2] = L.chunks.map((c) => c.at);
  const card = pop(f, -L.intro, { damping: 16, stiffness: 140 });
  const revenue = ESTIMATE.perMonthCents;
  const scale = Math.max(revenue, MONTHLY_PRICE_CENTS, 1);
  const growRevenue = tw(f, [-L.intro + 6, -L.intro + 30], [0, 1]);
  const price = pop(f, g0 + 2, { damping: 16, stiffness: 160 });
  const growPrice = tw(f, [g1, g1 + 14], [0, 1]);
  const ring = Math.min(tw(f, [g1 + 10, g1 + 18], [0, 1]), 1 - tw(f, [g2 + 30, g2 + 40], [0, 1]));
  const sub = tw(f, [g1 + 4, g1 + 16], [0, 1]);
  // La caméra s'approche très lentement pendant que les deux barres se lisent.
  const drift = tw(f, [0, L.exit], [0, 1], (x) => x);
  return (
    <SceneFrame L={L}>
      <div style={{ position: "absolute", left: 250, top: 166, width: 1420, height: 628, boxSizing: "border-box", padding: "46px 64px", borderRadius: 32, background: C.brand50, border: `3px solid ${C.brand500}`, boxShadow: `0 30px 80px -30px rgba(0,0,0,.6), 0 0 60px -10px ${rgba(MINT, 0.25)}`, opacity: Math.min(1, card * 2), transform: `scale(${(0.88 + 0.12 * card) * (1 + 0.025 * drift)}) translateY(${(1 - card) * 40}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 21, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: C.brand700 }}>À la même échelle</div>
        <div style={{ marginTop: 14, fontSize: 32, fontWeight: 500, color: C.brand800 }}>Chiffre d'affaires supplémentaire estimé</div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 18 }}>
          <span style={{ fontSize: 124, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.05, color: C.brand700, fontVariantNumeric: "tabular-nums" }}>{money(revenue)}</span>
          <span style={{ fontSize: 36, fontWeight: 500, color: C.brand800 }}>par mois</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 28, color: rgba(C.brand900, 0.8), opacity: sub, transform: `translateY(${(1 - sub) * 10}px)` }}>Pour un abonnement de {money(MONTHLY_PRICE_CENTS)} HT par mois.</div>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 26 }}>
          <Bar label="Chiffre d'affaires estimé" value={money(revenue)} width={revenue / scale} color={C.brand600} grow={growRevenue} />
          <div style={{ opacity: Math.min(1, price * 2), transform: `translateY(${(1 - Math.min(1, price)) * 20}px)` }}>
            <Bar label="Abonnement" value={`${money(MONTHLY_PRICE_CENTS)} HT`} width={MONTHLY_PRICE_CENTS / scale} color={C.ink400} grow={growPrice} ring={ring} />
          </div>
        </div>
      </div>
      <Subtitles L={L} />
      <Sfx at={-L.intro} name="whoosh" volume={0.28} />
      <Sfx at={-L.intro + 8} name="swish" volume={0.25} />
      <Sfx at={g0 + 2} name="pop" volume={0.25} />
      <Sfx at={g1 + 2} name="tic" volume={0.3} />
      <Sfx at={g1 + 12} name="pop" volume={0.3} />
    </SceneFrame>
  );
}

/* ---- 5. Le simulateur du site : votre propre nombre ------------------------------------------------------------ */

const SLIDER_MAX = 600;
const CARD = { x: 196, y: 148, w: 1528, h: 644 };
const LCOL = { x: CARD.x + 48, w: 620 };
const RCOL = { x: CARD.x + 720, w: CARD.w - 720 - 48 };
const SLIDER = { x: LCOL.x, y: CARD.y + 300, w: 600 };
const thumbX = (v: number) => SLIDER.x + (SLIDER.w * Math.min(v, SLIDER_MAX)) / SLIDER_MAX;

function Calculator({ L }: SceneProps) {
  const f = useF();
  const [h0, h1, h2, h3] = L.chunks.map((c) => c.at);
  const card = pop(f, -L.intro, { damping: 16, stiffness: 140 });
  // Le pointeur prend le curseur sur « votre propre nombre » et le mène de 200 à 300.
  const press = h1 + 2;
  const dragEnd = Math.max(press + 24, h2 + 8);
  const drag = tw(f, [press + 3, dragEnd], [0, 1], EASE_IN_OUT);
  const clients = ESTIMATE.clientsPerDay + Math.round(((OWN_CLIENTS - ESTIMATE.clientsPerDay) * drag) / 10) * 10;
  const e = estimateFor(clients);
  const scale = Math.max(e.perMonthCents, MONTHLY_PRICE_CENTS, 1);
  const startPt = { x: 1500, y: 960 };
  const grab = { x: thumbX(ESTIMATE.clientsPerDay), y: SLIDER.y + 4 };
  const approach = tw(f, [h0 + 2, press - 2], [0, 1], EASE_IN_OUT);
  const cur = drag > 0 ? { x: thumbX(clients), y: grab.y } : { x: interpolate(approach, [0, 1], [startPt.x, grab.x]), y: interpolate(approach, [0, 1], [startPt.y, grab.y]) };
  const leave = tw(f, [dragEnd + 6, dragEnd + 22], [0, 1], EASE_IN_OUT);
  const pointer = { x: cur.x + leave * 140, y: cur.y + leave * 110 };
  const down = f >= press && f < dragEnd + 2 ? 1 : 0;
  const cursorOpacity = Math.min(tw(f, [h0, h0 + 8], [0, 1]), 1 - tw(f, [dragEnd + 20, dragEnd + 30], [0, 1]));
  const steps = Array.from({ length: (OWN_CLIENTS - ESTIMATE.clientsPerDay) / 10 }, (_, k) => k + 1);
  const stepAt = (k: number) => {
    // L'image où le curseur franchit la k-ième dizaine.
    for (let x = press; x <= dragEnd; x += 0.5) {
      const d = tw(x, [press + 3, dragEnd], [0, 1], EASE_IN_OUT);
      if (Math.round(((OWN_CLIENTS - ESTIMATE.clientsPerDay) * d) / 10) >= k) return x;
    }
    return dragEnd;
  };
  const arrow = pop(f, h3, { damping: 10, stiffness: 180 });
  const bob = Math.sin(((f - h3) / 30) * Math.PI * 2.2) * 10;
  const ratePercent = RATE_PERCENT;
  const row = (label: string, value: string, strong = false) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, padding: "15px 0", borderTop: `1px solid ${C.ink200}` }}>
      <span style={{ fontSize: 22, color: C.ink600 }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: strong ? 700 : 600, color: strong ? C.brand700 : C.ink900, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
  const bar = (label: string, value: string, width: number, color: string) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21 }}>
        <span style={{ color: rgba(C.brand900, 0.75) }}>{label}</span>
        <span style={{ fontWeight: 700, color: C.brand900, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <div style={{ marginTop: 8, height: 18, borderRadius: 9, background: "rgba(255,255,255,.8)" }}>
        <div style={{ height: "100%", width: `${Math.max(1.5, width * 100)}%`, borderRadius: 9, background: color }} />
      </div>
    </div>
  );
  return (
    <SceneFrame L={L}>
      <div style={{ position: "absolute", left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: 32, background: C.white, border: `3px solid ${C.brand500}`, boxShadow: `0 30px 80px -30px rgba(0,0,0,.6), 0 18px 50px -24px ${C.brand600}`, opacity: Math.min(1, card * 2), transform: `scale(${0.9 + 0.1 * card}) translateY(${(1 - card) * 40}px)` }} />
      <div style={{ position: "absolute", inset: 0, opacity: Math.min(1, card * 2), transform: `scale(${0.9 + 0.1 * card}) translateY(${(1 - card) * 40}px)`, transformOrigin: `${CARD.x + CARD.w / 2}px ${CARD.y + CARD.h / 2}px` }}>
        {/* La colonne de saisie. */}
        <div style={{ position: "absolute", left: LCOL.x, top: CARD.y + 44, width: LCOL.w }}>
          <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: C.brand700 }}>Estimez ce que PharmaBoost vous rapporte</div>
          <div style={{ marginTop: 18, fontSize: 27, fontWeight: 600, lineHeight: 1.3, color: C.ink900 }}>À combien estimez-vous votre nombre de clients/patients par jour{" "}?</div>
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 170, height: 72, boxSizing: "border-box", borderRadius: 18, border: `2px solid ${C.ink200}`, background: C.app, display: "flex", alignItems: "center", padding: "0 20px", fontSize: 36, fontWeight: 600, color: C.ink900, fontVariantNumeric: "tabular-nums" }}>{clients}</div>
            <span style={{ fontSize: 22, color: C.ink500 }}>clients par jour</span>
          </div>
        </div>
        {/* Le curseur du site (0 à 600). */}
        <div style={{ position: "absolute", left: SLIDER.x, top: SLIDER.y, width: SLIDER.w, height: 8, borderRadius: 4, background: C.ink200 }}>
          <div style={{ width: thumbX(clients) - SLIDER.x, height: 8, borderRadius: 4, background: C.brand600 }} />
        </div>
        <div style={{ position: "absolute", left: thumbX(clients) - 15, top: SLIDER.y - 11, width: 30, height: 30, borderRadius: 15, background: C.brand600, border: `3px solid ${C.white}`, boxShadow: `0 2px 8px rgba(0,0,0,.25)${down ? `, 0 0 0 8px ${rgba(C.brand500, 0.2)}` : ""}` }} />
        <div style={{ position: "absolute", left: LCOL.x, top: SLIDER.y + 26, fontSize: 18, color: C.ink400 }}>Tapez votre nombre, ou déplacez le curseur.</div>
        {/* Les étapes du calcul. */}
        <div style={{ position: "absolute", left: LCOL.x, top: SLIDER.y + 76, width: LCOL.w, borderBottom: `1px solid ${C.ink200}` }}>
          {row(`Clients conseillés (${ratePercent} %)`, `${num(e.advisedClientsPerDay)} par jour`)}
          {row(`× ${money(A.averageProductCents)} par produit en moyenne`, `${money(e.perDayCents)} par jour`)}
          {row(`× ${A.openDaysPerMonth} jours d'ouverture`, `${money(e.perMonthCents)} par mois`, true)}
        </div>
        {/* Le résultat. */}
        <div style={{ position: "absolute", left: RCOL.x, top: CARD.y + 44, width: RCOL.w, height: SLIDER.y + 248 - (CARD.y + 44), boxSizing: "border-box", padding: "40px 44px", borderRadius: 24, background: C.brand50 }}>
          <div style={{ fontSize: 26, fontWeight: 500, color: C.brand800 }}>Chiffre d'affaires supplémentaire estimé</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ fontSize: 116, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.035em", color: C.brand700, fontVariantNumeric: "tabular-nums" }}>{money(e.perMonthCents)}</span>
            <span style={{ fontSize: 28, fontWeight: 500, color: C.brand800 }}>par mois</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 22, color: rgba(C.brand900, 0.8) }}>Pour un abonnement de {money(MONTHLY_PRICE_CENTS)} HT par mois.</div>
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 24 }}>
            {bar("Chiffre d'affaires estimé", money(e.perMonthCents), e.perMonthCents / scale, C.brand600)}
            {bar("Abonnement", money(MONTHLY_PRICE_CENTS), MONTHLY_PRICE_CENTS / scale, C.ink400)}
          </div>
        </div>
        {/* La note du site, mot pour mot. */}
        <div style={{ position: "absolute", left: LCOL.x, top: CARD.y + CARD.h - 84, width: CARD.w - 96, fontSize: 19, lineHeight: 1.45, color: C.ink500 }}>
          Estimation indicative{" "}: {ratePercent}{" "}% de vos clients prennent un produit conseillé, à {money(A.averageProductCents)} en moyenne, sur {A.openDaysPerMonth} jours d'ouverture par mois. Ce n'est pas une promesse de résultat.
        </div>
      </div>
      {/* « Juste en dessous » : deux flèches dans les marges, qui montrent le bas de la page. */}
      {[CARD.x / 2, CARD.x + CARD.w + (1920 - CARD.x - CARD.w) / 2].map((x) => (
        <div key={x} style={{ position: "absolute", left: x - 36, top: CARD.y + CARD.h - 150 + (arrow > 0 ? bob : 0), opacity: Math.min(1, arrow * 2), transform: `scale(${0.4 + 0.6 * arrow})` }}>
          <ChevronDown size={72} color={MINT} strokeWidth={3} style={{ display: "block", filter: `drop-shadow(0 0 14px ${rgba(MINT, 0.7)})` }} />
          <ChevronDown size={72} color={MINT} strokeWidth={3} style={{ display: "block", marginTop: -44, opacity: 0.55 }} />
        </div>
      ))}
      {cursorOpacity > 0 && (
        <div style={{ position: "absolute", left: 0, top: 0, transform: "scale(1.35)", transformOrigin: `${pointer.x}px ${pointer.y}px` }}>
          <Cursor x={pointer.x - 2} y={pointer.y - 2} opacity={cursorOpacity} press={down ? 1 : 0} click={f >= press && f <= press + 16 ? (f - press) / 16 : -1} />
        </div>
      )}
      <Subtitles L={L} />
      <Sfx at={-L.intro} name="whoosh" volume={0.28} />
      <Sfx at={press} name="clic" volume={0.6} />
      {steps.map((k) => <Sfx key={k} at={stepAt(k)} name="tic" volume={0.22} />)}
      <Sfx at={dragEnd + 1} name="clic" volume={0.4} />
      <Sfx at={h3} name="pop" volume={0.35} />
    </SceneFrame>
  );
}

const SCENES: ComponentType<SceneProps>[] = [Hook, Crowd, Month, Compare, Calculator];
