import { useMemo, type ReactNode } from "react";
import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame, type CalculateMetadataFunction } from "remotion";
import { Audio } from "@remotion/media";
import { chunkStarts, detectPauses, type VoiceInfo } from "../reel/timeline";
import {
  A,
  ESTIMATE,
  FALLBACK_DURATIONS,
  MONTHLY_PRICE_CENTS,
  OWN_CLIENTS,
  RATE_PERCENT,
  REFERRAL_PERCENT_ONE,
  REFERRAL_PERCENT_TWO,
  REFERRER_PRICE_ONE_CENTS,
  REFERRER_PRICE_TWO_CENTS,
  SCRIPT,
  TARIF_V2_ORDER,
  VOICE_DIR,
  estimateFor,
  money,
  num,
  spokenChunk,
} from "../tarif/script";
import { Mascot, type Track, type TrackEvent } from "../presentation/mascot";
import { Backdrop, Spot } from "../presentation/motion/kit/backdrop";
import { F, IN_OUT, POP, SNAP, clamp01, prog, tween } from "../presentation/motion/kit/ease";
import { JAKARTA, digits, label, support, title } from "../presentation/motion/kit/fonts";
import { Glass } from "../presentation/motion/kit/glass";
import { Grain, Vignette } from "../presentation/motion/kit/grain";
import { Enter, Word } from "../presentation/motion/kit/kinetic";
import { Odometer } from "../presentation/motion/kit/odometer";
import { GOLD_METAL, INK, PB, glowMint, rgba } from "../presentation/motion/kit/palette";
import { Cues, cue, type Cue } from "../presentation/motion/kit/sfx";

/* ==========================================================================
 * « TARIF » v2 (fondateur, 21 oct. 2026) — le calcul de la section Offre, dans le style du film de présentation
 * (encre, halos sarcelle, verre dépoli, Plus Jakarta Sans, compteurs à rouleaux, le robot du site), et le parrainage.
 * 16:9, 1920 × 1080, 60 i/s, rendu en 4K (×2). La longueur vient de la voix (Yann) : chaque fichier est mesuré.
 *
 * Ordre : T1 la question · T2 200 clients · T3 10 % → 20 · T4 × 7 € → 140 €/jour · T5 × 25 jours → 3 500 €/mois ·
 * T6 126 € HT · T8 le parrainage (−10 % puis −20 %) · T7 le simulateur · carte de fin.
 * Aucun chiffre écrit ici : tout vient de src/tarif/script.ts (calcul du site, offre officielle, règle du parrainage).
 * À l'écran pendant le calcul : « Estimation indicative · chiffre d'affaires, pas une marge ».
 * ======================================================================== */

export type TarifV2Props = { voices: Record<string, VoiceInfo> | null; stale: string[] };

const FPS = 60;
const LEAD = 0.6;
const END_CARD = 5.8;

type Chunk = { text: string; start: number; end: number };
type Line = { id: string; start: number; end: number; chunks: Chunk[] };
type Tl = { lines: Record<string, Line>; order: Line[]; endStart: number; total: number };

function timeline(voices: Record<string, VoiceInfo>): Tl {
  let t = LEAD;
  const order = TARIF_V2_ORDER.map((id) => {
    const line = SCRIPT.find((l) => l.id === id)!;
    const voice = voices[id];
    const start = t;
    const end = start + voice.dur;
    t = end + line.gapAfter;
    const starts = chunkStarts(line.chunks.map(spokenChunk), { dur: voice.dur, pauses: voice.pauses.filter(([a, b]) => b - a >= 0.12) });
    const chunks = line.chunks.map((text, j) => ({ text, start: start + starts[j], end: j < starts.length - 1 ? start + starts[j + 1] : end }));
    return { id, start, end, chunks };
  });
  const lines = Object.fromEntries(order.map((l) => [l.id, l]));
  return { lines, order, endStart: t, total: t + END_CARD };
}

async function measure(src: string): Promise<VoiceInfo> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src} : ${res.status}`);
  const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await res.arrayBuffer());
  return { dur: audio.duration, pauses: detectPauses(audio.getChannelData(0), audio.sampleRate) };
}

async function staleVoices(): Promise<string[]> {
  try {
    const res = await fetch(staticFile(`${VOICE_DIR}/voix.json`));
    if (!res.ok) return [`${VOICE_DIR}/voix.json manque`];
    const manifest = (await res.json()) as { lignes?: Record<string, string> };
    return SCRIPT.filter((l) => manifest.lignes?.[l.id] !== l.say).map((l) => `${l.id} : la voix dit « ${manifest.lignes?.[l.id] ?? "—"} »`);
  } catch (e) {
    return [`${VOICE_DIR}/voix.json illisible (${e})`];
  }
}

export const calculateTarifV2Metadata: CalculateMetadataFunction<TarifV2Props> = async ({ props }) => {
  const entries = await Promise.all(
    SCRIPT.map(async (line, i) => [line.id, await measure(staticFile(`${VOICE_DIR}/${line.id}.mp3`)).catch(() => ({ dur: FALLBACK_DURATIONS[i], pauses: [] }))] as const),
  );
  const voices = Object.fromEntries(entries);
  return { durationInFrames: Math.ceil(timeline(voices).total * FPS), props: { ...props, voices, stale: await staleVoices() } };
};

const fallbackVoices = () => Object.fromEntries(SCRIPT.map((l, i) => [l.id, { dur: FALLBACK_DURATIONS[i], pauses: [] }]));

/** Visible de `from` à `to` (fondus courts), en secondes du film. */
function vis(t: number, from: number, to: number, fade = 10 * F) {
  return Math.min(clamp01((t - from) / fade), clamp01((to - t) / fade));
}

function Layer({ o, children, y = 0, s = 1 }: { o: number; children: ReactNode; y?: number; s?: number }) {
  if (o <= 0) return null;
  return <AbsoluteFill style={{ opacity: o, transform: `translateY(${y}px) scale(${s})` }}>{children}</AbsoluteFill>;
}

// ---- Le robot ---------------------------------------------------------------------------------------------------

function robotTrack(tl: Tl): Track {
  const L = tl.lines;
  const ev: TrackEvent[] = [
    { t: 0, kind: "mood", mood: "curious" },
    { t: L.T1.start + 0.4, kind: "mood", mood: "thinking" },
    { t: L.T5.end - 0.4, kind: "mood", mood: "happy" },
    { t: L.T5.end - 0.3, kind: "burst", burst: "jump" },
    { t: L.T8.start + 0.2, kind: "mood", mood: "happy" },
    { t: L.T8.start + 0.3, kind: "burst", burst: "wave" },
    { t: L.T8.chunks[3].start, kind: "emote", emote: "love", dur: 1.2 },
    { t: tl.endStart + 0.5, kind: "mood", mood: "celebrate" },
    { t: tl.endStart + 0.6, kind: "burst", burst: "party" },
    { t: tl.endStart + 3.2, kind: "blink" },
  ];
  return { id: `tarif-v2-${Math.round(tl.total * 100)}`, seed: 2110, events: ev, until: tl.total + 0.5 };
}

// ---- Sous-titres (même habit que la présentation) ---------------------------------------------------------------

function Captions({ t, tl }: { t: number; tl: Tl }) {
  const all = tl.order.flatMap((l) => l.chunks);
  const c = all.find((x) => t >= x.start - 0.05 && t < x.end + 0.02);
  if (!c) return null;
  const k = prog(t, c.start - 0.05, 8 * F, POP);
  const parts = c.text.split(/(\*[^*]+\*)/).filter(Boolean);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            ...support(44),
            fontFamily: JAKARTA,
            color: "#fff",
            padding: "14px 32px",
            borderRadius: 999,
            background: rgba(INK, 0.72),
            backdropFilter: "blur(16px)",
            opacity: k,
            transform: `translateY(${(1 - k) * 16}px) scale(${0.9 + 0.1 * k})`,
            whiteSpace: "nowrap",
          }}
        >
          {parts.map((p, i) => (p.startsWith("*") ? <span key={i} style={{ color: PB.mint2 }}>{p.slice(1, -1)}</span> : <span key={i}>{p}</span>))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ---- Les scènes -------------------------------------------------------------------------------------------------

/** T1 · la question. */
function Hook({ t, tl }: { t: number; tl: Tl }) {
  const L = tl.lines.T1;
  const out = tl.lines.T2.start - 0.15;
  return (
    <Layer o={vis(t, 0, out)} y={-40 * prog(t, out - 0.25, 0.25, IN_OUT)}>
      <Word t={t} at={L.start - 0.2} text="Combien ?" x={960} y={330} size={210} enter="punch" />
      <Word t={t} at={L.start + 0.6} text={"PharmaBoost peut-il\nvous *rapporter* ?"} x={960} y={600} size={96} weight={800} tracking="-0.03em" lineHeight={1.02} enter="rise" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 790, textAlign: "center", ...label(30), color: rgba("#ffffff", 0.7), opacity: prog(t, L.chunks[2]?.start ?? L.start + 2, 0.4) }}>Faisons le calcul</div>
    </Layer>
  );
}

/** T2 + T3 · 200 clients, dont 10 % repartent avec un produit conseillé. */
const COLS = 20;
function Crowd({ t, tl }: { t: number; tl: Tl }) {
  const a = tl.lines.T2;
  const b = tl.lines.T3;
  const out = tl.lines.T4.start - 0.15;
  const n = ESTIMATE.clientsPerDay;
  const lit = ESTIMATE.advisedClientsPerDay;
  const step = n / lit;
  const litAt = b.chunks[0].start;
  const k = prog(t, litAt, 0.9, SNAP);
  const count = t < litAt ? Math.round(tween(t, a.start, 1.4, 0, n, IN_OUT)) : Math.round(tween(t, b.chunks[3].start - 0.3, 0.9, n, lit, IN_OUT));
  return (
    <Layer o={vis(t, a.start - 0.2, out)}>
      <Spot x={1340} y={520} r={560} alpha={0.18} />
      {/* La foule : 200 points, dont 20 s'allument en menthe. */}
      <div style={{ position: "absolute", left: 830, top: 190, width: 1000, display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 14 }}>
        {Array.from({ length: n }, (_, i) => {
          const appear = prog(t, a.start + (i % COLS) * 0.025 + Math.floor(i / COLS) * 0.05, 0.35, POP);
          // Deux clients par rangée, à des places qui changent d'une rangée à l'autre (une foule, pas deux colonnes).
          const isLit = ((Math.floor(i / COLS) * 3 + (i % COLS)) % step) === 0;
          const on = isLit ? k : 0;
          return (
            <div
              key={i}
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                transform: `scale(${appear * (1 + 0.25 * on)})`,
                background: on > 0 ? `color-mix(in srgb, ${PB.mint} ${Math.round(on * 100)}%, rgba(255,255,255,.16))` : "rgba(255,255,255,.16)",
                boxShadow: on > 0.5 ? `0 0 18px ${rgba(PB.mint, 0.7 * on)}` : "none",
                opacity: t >= litAt && !isLit ? 1 - 0.55 * k : 1,
              }}
            />
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 130, top: 300, width: 680 }}>
        <div style={{ ...label(22), whiteSpace: "nowrap", color: rgba("#fff", 0.6) }}>{t < litAt ? "Clients par jour" : "Repartent avec un produit conseillé"}</div>
        <Odometer t={t} value={count} digits={count >= 100 ? 3 : 2} size={230} color={t < litAt ? "#fff" : PB.mint} style={{ marginTop: 18, filter: t >= litAt ? glowMint(0.5) : undefined }} />
        <Enter t={t} at={litAt} kind="pop">
          <div style={{ marginTop: 26, display: "inline-flex", alignItems: "center", gap: 14, padding: "12px 26px", borderRadius: 999, background: rgba(PB.mint, 0.14), border: `1.5px solid ${rgba(PB.mint, 0.5)}`, ...support(40), color: PB.mint2 }}>
            {RATE_PERCENT} % des clients
          </div>
        </Enter>
      </div>
    </Layer>
  );
}

/** T4 · × 7 € → 140 € par jour. */
function PerDay({ t, tl }: { t: number; tl: Tl }) {
  const L = tl.lines.T4;
  const out = tl.lines.T5.start - 0.15;
  const result = L.chunks[2].start;
  return (
    <Layer o={vis(t, L.start - 0.2, out)}>
      <Spot x={960} y={460} r={620} alpha={0.2} />
      <Glass tone="light" active={prog(t, result, 0.4)} radius={40} style={{ left: 300, top: 190, width: 1320, height: 560 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center", alignItems: "baseline", gap: 34 }}>
          <span style={{ ...digits(150), color: "#fff" }}>{num(ESTIMATE.advisedClientsPerDay)}</span>
          <span style={{ ...title(110), color: rgba("#fff", 0.5) }}>×</span>
          <Enter t={t} at={L.start} kind="punch">
            <span style={{ ...digits(150), color: PB.mint }}>{money(A.averageProductCents)}</span>
          </Enter>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 268, textAlign: "center", ...support(27), color: rgba("#fff", 0.72), opacity: prog(t, L.start + 0.5, 0.4), transform: `translateY(${(1 - prog(t, L.start + 0.5, 0.4)) * 20}px)` }}>
          par produit en moyenne · compléments alimentaires, médicaments sans ordonnance
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 350, display: "flex", justifyContent: "center", alignItems: "baseline", gap: 24, opacity: prog(t, result - 0.1, 0.3) }}>
          <span style={{ ...title(72), color: rgba("#fff", 0.6) }}>=</span>
          <Odometer t={t} value={(tt) => tween(tt, result - 0.1, 0.9, 0, ESTIMATE.perDayCents / 100, IN_OUT)} digits={3} suffix=" €" size={150} color="#fff" />
          <span style={{ ...support(56), color: rgba("#fff", 0.75) }}>par jour</span>
        </div>
      </Glass>
    </Layer>
  );
}

/** T5 · 25 jours d'ouverture → 3 500 € de chiffre d'affaires en plus, chaque mois. */
function PerMonth({ t, tl }: { t: number; tl: Tl }) {
  const L = tl.lines.T5;
  const out = tl.lines.T6.start - 0.15;
  const days = A.openDaysPerMonth;
  const total = L.chunks[1].start;
  return (
    <Layer o={vis(t, L.start - 0.2, out)}>
      <Spot x={1300} y={480} r={600} alpha={0.22} />
      <div style={{ position: "absolute", left: 140, top: 210, width: 620, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
        {Array.from({ length: days }, (_, i) => {
          const k = prog(t, L.start + 0.15 + i * 0.06, 0.3, POP);
          return (
            <div key={i} style={{ height: 82, borderRadius: 16, transform: `scale(${0.6 + 0.4 * k})`, opacity: k, background: rgba(PB.teal2, 0.55), border: `1px solid ${rgba(PB.mint, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "center", ...digits(30, 600), color: rgba("#fff", 0.85) }}>
              {i + 1}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 140, top: 760, ...label(26), color: rgba("#fff", 0.6) }}>{days} jours d&apos;ouverture</div>
      <div style={{ position: "absolute", left: 860, top: 250, width: 960, textAlign: "center" }}>
        <div style={{ ...label(28), color: rgba("#fff", 0.6), opacity: prog(t, total - 0.2, 0.3) }}>Chiffre d&apos;affaires en plus</div>
        <div style={{ marginTop: 20, display: "flex", justifyContent: "center", filter: glowMint(prog(t, total + 0.8, 0.4)) }}>
          {/* Le compteur roule, puis le montant s'écrit comme sur le site (« 3 500 € », espace des milliers). */}
          {t < total + 1.15 ? (
            <Odometer t={t} value={(tt) => tween(tt, total - 0.2, 1.3, 0, ESTIMATE.perMonthCents / 100, IN_OUT)} digits={4} suffix=" €" size={210} color={PB.mint} />
          ) : (
            <span style={{ ...digits(210), color: PB.mint }}>{money(ESTIMATE.perMonthCents)}</span>
          )}
        </div>
        <div style={{ marginTop: 16, ...support(56), color: "#fff", opacity: prog(t, L.chunks[3].start - 0.1, 0.3) }}>chaque mois</div>
      </div>
    </Layer>
  );
}

/** T6 · pour un abonnement de 126 € HT : les deux barres, à la même échelle. */
function Compare({ t, tl }: { t: number; tl: Tl }) {
  const L = tl.lines.T6;
  const out = tl.lines.T8.start - 0.15;
  const max = 1300;
  const big = max;
  const small = Math.max(28, (max * MONTHLY_PRICE_CENTS) / ESTIMATE.perMonthCents);
  const g1 = prog(t, L.start - 0.1, 0.8, SNAP);
  const g2 = prog(t, L.chunks[1].start, 0.6, POP);
  return (
    <Layer o={vis(t, L.start - 0.2, out)}>
      <div style={{ position: "absolute", left: 300, top: 300 }}>
        <div style={{ ...label(26), color: rgba("#fff", 0.65) }}>Ce que PharmaBoost peut vous rapporter</div>
        <div style={{ marginTop: 16, height: 120, width: big * g1, borderRadius: 26, background: `linear-gradient(90deg, ${PB.teal}, ${PB.mint})`, boxShadow: `0 0 50px ${rgba(PB.mint, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 34 }}>
          {g1 > 0.6 && <span style={{ ...digits(64), color: INK }}>{money(ESTIMATE.perMonthCents)}</span>}
        </div>
        <div style={{ marginTop: 70, ...label(26), color: rgba("#fff", 0.65) }}>Votre abonnement</div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ height: 120, width: small * g2, borderRadius: 26, background: GOLD_METAL }} />
          <span style={{ ...digits(64), color: "#fff", opacity: g2 }}>{money(MONTHLY_PRICE_CENTS)} <span style={{ ...support(40), color: rgba("#fff", 0.7) }}>HT / mois</span></span>
        </div>
      </div>
    </Layer>
  );
}

/** T8 · le parrainage : un confrère, −10 % ; deux confrères, −20 %. */
function Referral({ t, tl, track }: { t: number; tl: Tl; track: Track }) {
  const L = tl.lines.T8;
  const out = tl.lines.T7.start - 0.15;
  const one = L.chunks[2].start - 0.1;
  const two = L.chunks[4].start - 0.15;
  const price = t < two ? (t < one ? MONTHLY_PRICE_CENTS : REFERRER_PRICE_ONE_CENTS) : REFERRER_PRICE_TWO_CENTS;
  const badge = (at: number, pct: number, x: number) => {
    const k = prog(t, at, 0.5, POP);
    if (k <= 0) return null;
    return (
      <div style={{ position: "absolute", left: x, top: 560, width: 210, height: 210, borderRadius: "50%", transform: `scale(${k}) rotate(${(1 - k) * -20}deg)`, background: `linear-gradient(135deg, ${PB.teal}, #0796b4)`, display: "flex", alignItems: "center", justifyContent: "center", ...title(62), color: "#fff", boxShadow: `0 0 50px ${rgba(PB.mint, 0.35)}` }}>
        −{pct} %
      </div>
    );
  };
  return (
    <Layer o={vis(t, L.start - 0.2, out)}>
      <Spot x={960} y={420} r={640} alpha={0.2} />
      <Word t={t} at={L.start - 0.1} text="*Parrainez* un confrère" x={960} y={190} size={110} tracking="-0.03em" enter="rise" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, display: "flex", justifyContent: "center", alignItems: "baseline", gap: 30 }}>
        {t >= one && <s style={{ ...digits(80, 600), color: rgba("#fff", 0.45) }}>{money(MONTHLY_PRICE_CENTS)}</s>}
        <span style={{ ...digits(160), color: t >= one ? PB.mint : "#fff", filter: t >= one ? glowMint(0.4) : undefined, transform: `scale(${1 + 0.08 * (prog(t, one, 0.12) - prog(t, one + 0.12, 0.3)) + 0.08 * (prog(t, two, 0.12) - prog(t, two + 0.12, 0.3))})`, display: "inline-block" }}>
          {money(price)}
        </span>
        <span style={{ ...support(48), color: rgba("#fff", 0.75) }}>HT / mois</span>
      </div>
      {badge(one, REFERRAL_PERCENT_ONE, 640)}
      {badge(two, REFERRAL_PERCENT_TWO, 1070)}
      <div style={{ position: "absolute", left: 640, top: 790, width: 210, textAlign: "center", ...support(30), color: rgba("#fff", 0.8), opacity: prog(t, one, 0.3) }}>1 confrère</div>
      <div style={{ position: "absolute", left: 1070, top: 790, width: 210, textAlign: "center", ...support(30), color: rgba("#fff", 0.8), opacity: prog(t, two, 0.3) }}>2 confrères</div>
      <div style={{ position: "absolute", left: 180, top: 520, opacity: prog(t, L.start, 0.4) }}>
        <Mascot track={track} t={t} size={260} />
      </div>
    </Layer>
  );
}

/** T7 · le simulateur du site : le curseur passe de 200 à 300 clients, le résultat suit. */
const SL = { x: 380, y: 520, w: 700, max: 600 };
function Simulator({ t, tl }: { t: number; tl: Tl }) {
  const L = tl.lines.T7;
  const out = tl.endStart - 0.1;
  const v = Math.round(tween(t, L.chunks[1].start, 1.4, ESTIMATE.clientsPerDay, OWN_CLIENTS, IN_OUT));
  const est = estimateFor(v);
  const x = SL.x + (SL.w * v) / SL.max;
  return (
    <Layer o={vis(t, L.start - 0.2, out)} s={1 + 0.02 * prog(t, L.start - 0.2, 0.6)}>
      <Glass tone="light" radius={40} style={{ left: 240, top: 180, width: 1440, height: 600 }} />
      <div style={{ position: "absolute", left: SL.x, top: 250, ...support(40), color: "#fff" }}>Estimez ce que PharmaBoost vous rapporte</div>
      <div style={{ position: "absolute", left: SL.x, top: 340, ...label(24), color: rgba("#fff", 0.6) }}>Clients par jour</div>
      <div style={{ position: "absolute", left: SL.x, top: 380 }}>
        <Odometer t={t} value={v} digits={3} size={110} color="#fff" />
      </div>
      <div style={{ position: "absolute", left: SL.x, top: SL.y + 40, width: SL.w, height: 12, borderRadius: 6, background: "rgba(255,255,255,.15)" }}>
        <div style={{ width: x - SL.x, height: 12, borderRadius: 6, background: PB.mint }} />
      </div>
      <div style={{ position: "absolute", left: x - 22, top: SL.y + 24, width: 44, height: 44, borderRadius: "50%", background: "#fff", boxShadow: `0 0 0 8px ${rgba(PB.mint, 0.3)}` }} />
      <div style={{ position: "absolute", left: 1180, top: 330, width: 420 }}>
        <div style={{ ...label(24), color: rgba("#fff", 0.6) }}>Par mois</div>
        <div style={{ marginTop: 14, ...digits(110), color: PB.mint }}>{money(est ? est.perMonthCents : 0)}</div>
        <div style={{ marginTop: 18, ...support(26), color: rgba("#fff", 0.6) }}>Pour un abonnement de {money(MONTHLY_PRICE_CENTS)} HT</div>
      </div>
    </Layer>
  );
}

/** La carte de fin : le robot, PharmaBoost, la promesse, « Réserver une démo », pharmaboost.app. */
function EndCard({ t, tl, track }: { t: number; tl: Tl; track: Track }) {
  const a = tl.endStart;
  return (
    <Layer o={clamp01((t - a + 0.1) / (12 * F))}>
      <Spot x={960} y={470} r={700} alpha={0.28} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "flex", justifyContent: "center", transform: `translateY(${(1 - prog(t, a, 0.6, POP)) * 60}px)` }}>
        <Mascot track={track} t={t} size={250} floating />
      </div>
      <Enter t={t} at={a + 0.35} kind="punch">
        <div style={{ position: "absolute", left: 0, right: 0, top: 470, textAlign: "center", ...title(150), color: "#fff" }}>
          Pharma<span style={{ color: PB.mint }}>Boost</span>
        </div>
      </Enter>
      <Word t={t} at={a + 0.9} text={"Un seul abonnement. *Tout est inclus.*"} x={960} y={690} size={58} weight={700} tracking="-0.02em" enter="rise" />
      <Enter t={t} at={a + 1.5} kind="pop">
        <div style={{ position: "absolute", left: 0, right: 0, top: 780, display: "flex", justifyContent: "center", gap: 26, alignItems: "center" }}>
          <div style={{ padding: "20px 42px", borderRadius: 999, background: PB.teal, ...support(38), color: "#fff", boxShadow: `0 0 40px ${rgba(PB.mint, 0.3)}` }}>Réserver une démo →</div>
          <div style={{ ...support(38), color: rgba("#fff", 0.75) }}>pharmaboost.app</div>
        </div>
      </Enter>
    </Layer>
  );
}

/** La mention honnête, en haut, pendant tout le calcul. */
function Honesty({ t, tl }: { t: number; tl: Tl }) {
  const o = vis(t, tl.lines.T2.start, tl.endStart - 0.2, 12 * F);
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 56, top: 40, fontFamily: JAKARTA, fontWeight: 600, fontSize: 24, color: "rgba(255,255,255,.6)", opacity: o }}>
      Estimation indicative · chiffre d&apos;affaires, pas une marge · exemple
    </div>
  );
}

// ---- Le son -----------------------------------------------------------------------------------------------------

function cuesFor(tl: Tl): Cue[] {
  const L = tl.lines;
  return [
    cue("impact_reveal", L.T1.start - 0.2, 0.55),
    cue("whoosh_fast", L.T2.start - 0.2, 0.4),
    cue("radar_ping", L.T3.chunks[0].start, 0.4),
    cue("counter_roll", L.T3.chunks[3].start - 0.3, 0.35),
    cue("whoosh_heavy", L.T4.start - 0.2, 0.4),
    cue("slot_lock", L.T4.chunks[2].start + 0.7, 0.45),
    cue("whoosh_fast", L.T5.start - 0.2, 0.35),
    cue("counter_roll", L.T5.chunks[1].start - 0.2, 0.4),
    cue("cash_register", L.T5.chunks[1].start + 1.1, 0.5),
    cue("card_unfold", L.T6.start - 0.1, 0.4),
    cue("ui_pop", L.T6.chunks[1].start, 0.5),
    cue("whoosh_heavy", L.T8.start - 0.2, 0.35),
    cue("stamp_slam", L.T8.chunks[2].start - 0.1, 0.5),
    cue("stamp_slam", L.T8.chunks[4].start - 0.15, 0.55),
    cue("sparkle_shimmer", L.T8.chunks[4].start + 0.2, 0.35),
    cue("ui_click", L.T7.chunks[1].start, 0.4),
    cue("riser_big", tl.endStart - 1.2, 0.3),
    cue("impact_clean", tl.endStart + 0.35, 0.6),
    cue("confetti_cannon", tl.endStart + 0.6, 0.35),
  ];
}

const clampX = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function Music({ tl }: { tl: Tl }) {
  const speak = (t: number) => tl.order.some((l) => t >= l.start - 0.15 && t <= l.end + 0.15);
  const duck = (t: number) => (speak(t) ? 0.2 : 0.38);
  const finalAt = Math.max(0, tl.total - 12);
  const fadeOut = (t: number) => interpolate(t, [tl.total - 1.2, tl.total - 0.05], [1, 0], clampX);
  return (
    <>
      <Audio src={staticFile("music/presentation-m2.mp3")} volume={(f) => { const t = f / FPS; return duck(t) * interpolate(t, [0, 0.4, 26.5, 28], [0, 1, 1, 0], clampX); }} />
      <Sequence from={Math.round(26.5 * FPS)} layout="none" name="Musique · suite">
        <Audio src={staticFile("music/presentation-m2-confiance.mp3")} volume={(f) => { const t = 26.5 + f / FPS; return duck(t) * interpolate(t, [26.5, 27.5, finalAt + 0.5, finalAt + 1.5], [0, 1, 1, 0], clampX); }} />
      </Sequence>
      <Sequence from={Math.round(finalAt * FPS)} layout="none" name="Musique · final">
        <Audio src={staticFile("music/presentation-m2-final.mp3")} volume={(f) => { const t = finalAt + f / FPS; return (t >= tl.endStart ? 0.6 : duck(t)) * interpolate(t, [finalAt, finalAt + 1], [0, 1], clampX) * fadeOut(t); }} />
      </Sequence>
    </>
  );
}

// ---- Le film ----------------------------------------------------------------------------------------------------

export function TarifV2({ voices, stale }: TarifV2Props) {
  if (stale?.length) throw new Error(`Film « TarifV2 » : la voix ne dit plus le script — node scripts/voix-tarif.mjs. ${stale.join(" · ")}`);
  const tl = useMemo(() => timeline(voices ?? fallbackVoices()), [voices]);
  const track = useMemo(() => robotTrack(tl), [tl]);
  const cues = useMemo(() => cuesFor(tl), [tl]);
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill style={{ background: INK, fontFamily: JAKARTA }}>
      <Backdrop t={t} kind="brand" />
      <Hook t={t} tl={tl} />
      <Crowd t={t} tl={tl} />
      <PerDay t={t} tl={tl} />
      <PerMonth t={t} tl={tl} />
      <Compare t={t} tl={tl} />
      <Referral t={t} tl={tl} track={track} />
      <Simulator t={t} tl={tl} />
      <EndCard t={t} tl={tl} track={track} />
      <Honesty t={t} tl={tl} />
      <Grain t={t} opacity={0.03} />
      <Vignette strength={0.18} />
      <Captions t={t} tl={tl} />
      {tl.order.map((line) => (
        <Sequence key={line.id} from={Math.round(line.start * FPS)} layout="none" name={`Voix ${line.id}`}>
          <Audio src={staticFile(`${VOICE_DIR}/${line.id}.mp3`)} />
        </Sequence>
      ))}
      <Cues cues={cues} />
      <Music tl={tl} />
    </AbsoluteFill>
  );
}

