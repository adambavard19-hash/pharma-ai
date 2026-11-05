import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Bell, CalendarCheck, Candy, Droplets, Eye, Mail, Megaphone, Play, Repeat, Smartphone, Store, Timer, TrendingUp } from "lucide-react";
import {
  AdnBackdrop,
  BagDrugs,
  Confetti,
  Cues,
  Flash,
  GenericPic,
  JAKARTA,
  MailBilan,
  MedBox,
  Notification,
  Ordonnance,
  PB,
  PBLogo,
  Phone,
  Ring,
  Sparkle,
  cue,
  rgba,
  type Cue,
} from "../rembobine/kit";
import { ALLERGIE } from "../rembobine/allergie";
import { FilmClock } from "../presentation/motion/kit/clock";
import { Grain, Vignette } from "../presentation/motion/kit/grain";
import { IN_OUT, SNAP, prog, ressort, wobble } from "../presentation/motion/kit/ease";
import { LINES } from "./script";
import MOTS from "./mots.json";

/**
 * LE FILM DE LA LETTRE — version 3 (fondateur, 3 nov. 2026 : « reprends celle de base, améliore-la, plus pro ; un vrai
 * conseil de Donna, un peu niche ; fond blanc ; e-mail et appli ; la comparaison des deux pharmacies ; les 3 vidéos en 1 »).
 *
 *   1. La lettre (la base du 31 oct.) : « Bonjour, Docteur… »
 *   2. « Rembobinons », rejoué sur la VRAIE routine allergie de la console (cétirizine → yeux, nez, gorge) :
 *      src/rembobine/allergie, mêmes scènes, temps d'histoire recalés sur la nouvelle voix (`ACT`).
 *   3. La preuve : le conseil parfait, le chiffre d'affaires des pharmacies tests (sans chiffre inventé).
 *   4. Le patient revient : bilan par e-mail et dans l'appli, notification de fin de cure, campagne d'un laboratoire.
 *   5. Deux pharmacies, même rue : c'est un cercle. À côté : « Non merci. »
 *   6. La signature.
 * Les temps viennent des MOTS (mots.json, horodatage ElevenLabs par phrase), jamais tapés à la main.
 */
export const FPS = 60;

type Word = { w: string; at: number; end: number };
type Said = { who: string; dur: number; words: Word[] };
const M = MOTS as Record<string, Said>;

// ---- Où tombe chaque phrase (temps du film) ------------------------------------------------------------------------
const VAT: Record<string, number> = {};
const end = (id: string) => VAT[id] + M[id].words[M[id].words.length - 1].end;
VAT.Y1 = 0.9;
VAT.Y2 = end("Y1") + 0.45;
/** Le comptoir (S1, temps d'histoire 0) commence ici ; l'acte 1 garde le rythme du film d'origine jusqu'à « Il repart ». */
const A = end("Y2") + 0.5;
VAT.D1 = A + 1.4;
VAT.D2 = A + 4.3;
VAT.Y3 = A + 6.0 - M.Y3.words[0].at;
VAT.Y4 = end("Y3") + 0.45;
VAT.Y5 = end("Y4") + 0.45;
const DROP = end("Y5") + 0.32;
VAT.Y6 = DROP + 0.45;
VAT.Y7 = end("Y6") + 0.4;
VAT.Y8 = end("Y7") + 0.35;
const JUMP = end("Y8") + 0.45;
VAT.C1 = JUMP + 0.45;
VAT.D4 = end("C1") + 0.35;
VAT.Y9 = end("D4") + 0.3;
const ACT_END = end("Y9") + 0.9;
VAT.Y9b = ACT_END + 0.35;
const P0 = end("Y9b") + 0.5;
VAT.Y10 = P0 + 0.35;
VAT.Y11 = end("Y10") + 0.3;
VAT.Y12 = end("Y11") + 0.45;
VAT.Y13 = end("Y12") + 0.45;
const R0 = end("Y13") + 0.5;
VAT.Y14 = R0 + 0.5;
VAT.Y15 = end("Y14") + 0.4;
VAT.Y16 = end("Y15") + 0.5;
const B = end("Y16") + 0.35; // à côté : le comptoir de S1, rejoué
VAT.D1b = B + 1.4;
VAT.D2b = B + 4.3;
const F0 = end("D2b") + 0.7;
VAT.Y17 = F0 + 0.45;
VAT.Y18 = end("Y17") + 0.5;
export const FINAL_HIT = end("Y18") + 0.9;
export const TOTAL = Math.ceil(FINAL_HIT + 4.2);
export const TOTAL_FRAMES = TOTAL * FPS;

const norm = (s: string) => s.toLowerCase().replace(/[.,:;?!…«»"]/g, "").replace(/’/g, "'");
/** Le temps du film où commence le n-ième mot `word` de la phrase `id`. */
function w(id: string, word: string, nth = 0): number {
  const hits = M[id].words.filter((x) => norm(x.w) === norm(word));
  if (!hits[nth]) throw new Error(`Mot introuvable : ${id} « ${word} »`);
  return VAT[id] + hits[nth].at;
}

// ---- L'acte du comptoir : temps du film → temps d'histoire de « Rembobinons » -------------------------------------
/** Les paliers [temps du film, temps d'histoire] ; entre deux paliers, le temps est interpolé. Un saut (S7 → S8) est
 * un palier de 0,01 s. */
const ACT: [number, number][] = [
  [A, 0],
  [VAT.Y3, 6.0],
  [w("Y3", "l'allergie…"), 8.02],
  [w("Y3", "et"), 9.286],
  [w("Y3", "rien"), 9.727],
  [w("Y3", "nez,"), 10.2],
  [w("Y3", "yeux,"), 10.667],
  [w("Y3", "gorge."), 11.074],
  [end("Y3"), 12.38],
  [w("Y4", "cette"), 12.748],
  [w("Y4", "chaque"), 14.002],
  [w("Y4", "france"), 15.535],
  [end("Y4"), 16.342],
  [w("Y5", "alors…"), 16.825],
  [w("Y5", "rembobinons"), 17.8],
  [DROP, 20.0],
  [w("Y6", "même"), 20.45],
  [w("Y6", "même", 1), 21.529],
  [w("Y6", "ordonnance"), 21.947],
  [w("Y6", "mais"), 22.853],
  [w("Y6", "pharmaboost"), 23.758],
  [w("Y6", "comptoir"), 24.885],
  [end("Y6"), 25.593],
  [w("Y7", "à"), 26.0],
  [w("Y7", "boîte"), 26.453],
  [w("Y7", "routine"), 27.219],
  [w("Y7", "s'affiche,"), 27.869],
  [w("Y7", "prise"), 28.403],
  [w("Y7", "stock"), 29.216],
  [end("Y7"), 29.757],
  [w("Y8", "les"), 30.15],
  [w("Y8", "questions"), 30.359],
  [w("Y8", "poser"), 30.847],
  [w("Y8", "les", 1), 31.299],
  [w("Y8", "mots"), 31.462],
  [w("Y8", "dire"), 31.729],
  [JUMP, 32.3],
  [JUMP + 0.01, 35.0],
  [VAT.C1, 35.49],
  [w("C1", "conseille"), 37.058],
  [w("C1", "collyre"), 37.603],
  [end("C1"), 38.36],
  [VAT.D4, 38.791],
  [end("D4"), 40.01],
  [w("Y9", "le"), 40.55],
  [w("Y9", "décide"), 41.363],
  [w("Y9", "patient"), 42.524],
  [w("Y9", "complète"), 43.813],
  [end("Y9"), 44.529],
  [ACT_END, 45.3],
];
/** « À côté » : le comptoir de S1, rejoué au même rythme. */
const COTE: [number, number][] = [
  [B, 0],
  [B + 6.2, 6.2],
];

function storyAt(keys: [number, number][], t: number) {
  if (t <= keys[0][0]) return keys[0][1] + (t - keys[0][0]);
  for (let i = 1; i < keys.length; i++) {
    const [a, sa] = keys[i - 1];
    const [b, sb] = keys[i];
    if (t <= b) return sa + ((t - a) / (b - a)) * (sb - sa);
  }
  const [a, sa] = keys[keys.length - 1];
  return sa + (t - a);
}
/** Le temps du film d'un temps d'histoire ; null s'il tombe dans un saut. */
function filmAt(keys: [number, number][], s: number) {
  for (let i = 1; i < keys.length; i++) {
    const [a, sa] = keys[i - 1];
    const [b, sb] = keys[i];
    if (s >= sa && s <= sb && sb > sa) return (sb - sa) / (b - a) > 8 ? null : a + ((s - sa) / (sb - sa)) * (b - a);
  }
  return null;
}

/** Les scènes de l'acte, chacune dans sa fenêtre d'histoire ; la scène qui SORT est au-dessus (comme le film d'origine). */
function Act({ t, keys, only }: { t: number; keys: [number, number][]; only?: string[] }) {
  const st = storyAt(keys, t);
  const list = ALLERGIE.filter((s) => (!only || only.includes(s.id)) && st >= s.start && st < s.end);
  return (
    <BagDrugs.Provider value={["cetirizine", "collyre"]}>
      <FilmClock offset={Math.round((st - t) * FPS)}>
        {[...list].reverse().map((s) => (
          <AbsoluteFill key={s.id}>
            <s.mod.Scene t={st} />
          </AbsoluteFill>
        ))}
      </FilmClock>
    </BagDrugs.Provider>
  );
}
function actCues(keys: [number, number][], only?: string[], until = Infinity): Cue[] {
  const out: Cue[] = [];
  for (const s of ALLERGIE) {
    if (only && !only.includes(s.id)) continue;
    for (const c of s.mod.cues) {
      if (c.at < s.start - 0.5 || c.at > s.end || c.at > until) continue;
      const at = filmAt(keys, c.at);
      if (at !== null) out.push({ ...c, at });
    }
  }
  return out;
}

// ---- Les pièces du décor blanc ---------------------------------------------------------------------------------------
export const MINT = { bg: "#EAF6F0", deep: "#0E7C5A", green: "#0E8A7B", ink: "#0F2B26", soft: "#5B6B66", paper: "#F4F8F6", line: "#DCE7E2" };

export function Abs({ x, y, children, style }: { x: number; y: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", ...style }}>{children}</div>;
}

/** Un tableau du décor blanc : il entre en douceur à `from` et s'efface à `to`. */
export function Scene({ t, from, to, children }: { t: number; from: number; to: number; children: ReactNode }) {
  if (t < from - 0.05 || t > to + 0.45) return null;
  const k = from <= 0.01 ? 1 : prog(t, from, 0.42, SNAP);
  const out = prog(t, to, 0.4, IN_OUT);
  return <AbsoluteFill style={{ opacity: k * (1 - out), transform: `scale(${0.985 + 0.015 * k + 0.02 * out})`, filter: out > 0 ? `blur(${out * 8}px)` : undefined }}>{children}</AbsoluteFill>;
}

/** Un titre dont les mots montent un à un ; *entre étoiles* = couleur d'accent. */
export function Rise({ t, at, text, size = 70, color = MINT.ink, accent = MINT.green, stagger = 0.07, style }: { t: number; at: number; text: string; size?: number; color?: string; accent?: string; stagger?: number; style?: CSSProperties }) {
  let on = false;
  const words = text.split(/\s+/).map((raw) => {
    const startOn = on;
    if (raw.startsWith("*")) on = true;
    const isAccent = on || startOn;
    if (raw.endsWith("*") && raw.length > 1) on = false;
    return { w: raw.replace(/\*/g, ""), accent: isAccent };
  });
  return (
    <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1.08, color, textAlign: "center", ...style }}>
      {words.map((wd, i) => {
        const k = prog(t, at + i * stagger, 0.42, SNAP);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", padding: "0.04em 0.05em 0.2em", margin: "-0.04em 0 -0.2em" }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - k) * 110}%) rotate(${(1 - k) * 5}deg)`, transformOrigin: "0 100%", opacity: t < at + i * stagger - 0.04 ? 0 : 1, color: wd.accent ? accent : undefined }}>{wd.w}</span>
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
}

/** Un titre qui laisse la place au suivant (il monte et s'efface à `out`). */
export function Title({ t, at, out, text, y = 150, size = 66 }: { t: number; at: number; out?: number; text: string; y?: number; size?: number }) {
  if (t < at - 0.05) return null;
  const o = out === undefined ? 0 : prog(t, out, 0.35, IN_OUT);
  if (o >= 1) return null;
  return (
    <Abs x={960} y={y} style={{ opacity: 1 - o, transform: `translate(-50%, ${-50 - o * 40}%)`, filter: o > 0 ? `blur(${o * 6}px)` : undefined }}>
      <Rise t={t} at={at} text={text} size={size} style={{ width: 1700 }} />
    </Abs>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ borderRadius: 28, background: "#FFFFFF", boxShadow: "0 40px 80px -40px rgba(15,43,38,.45), 0 0 0 1px rgba(15,43,38,.05)", ...style }}>{children}</div>;
}
export const pop = (t: number, at: number) => (t < at ? 0 : ressort(t, at, { damping: 12, stiffness: 230, mass: 0.6 }));
export function Pill({ t, at, children, color = MINT.green, size = 30 }: { t: number; at: number; children: ReactNode; color?: string; size?: number }) {
  const k = pop(t, at);
  if (k <= 0) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: `${size * 0.4}px ${size * 0.8}px`, borderRadius: 999, background: "#FFFFFF", boxShadow: `0 16px 34px -18px rgba(15,43,38,.5), 0 0 0 2px ${rgba(color, 0.25)}`, fontFamily: JAKARTA, fontWeight: 800, fontSize: size, color: MINT.ink, transform: `scale(${k})`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
export const Cross = ({ size = 40, color = MINT.green, glow = 0 }: { size?: number; color?: string; glow?: number }) => (
  <svg viewBox="0 0 40 40" width={size} height={size} style={{ filter: glow > 0 ? `drop-shadow(0 0 ${12 * glow}px ${rgba(color, 0.8)})` : undefined }}>
    <path d="M14 2h12v12h12v12H26v12H14V26H2V14h12z" fill={color} />
  </svg>
);

// =====================================================================================================================
// 1. La lettre
// =====================================================================================================================
export function Lettre1({ t }: { t: number }) {
  const slide = prog(t, w("Y1", "lettre,") - 0.6, 1.3, SNAP);
  return (
    <>
      <Title t={t} at={w("Y1", "bonjour,")} text="Bonjour, *Docteur.*" y={150} size={78} />
      <Abs x={960} y={600} style={{ transform: "translate(-50%, -50%) scale(0.86)" }}>
        <div style={{ position: "relative", width: 620, height: 640 }}>
          <div style={{ position: "absolute", left: 250, top: -10 }}>
            <Cross size={120} glow={0.5 + 0.5 * Math.sin(t * 2.4)} />
          </div>
          <div style={{ position: "absolute", left: 60, top: 130, width: 500, height: 470, borderRadius: "18px 18px 0 0", background: "linear-gradient(180deg,#DCEFE7,#C7E6DA)", border: `10px solid ${MINT.ink}`, borderBottom: "none", boxShadow: "0 30px 60px -30px rgba(15,43,38,.5)" }}>
            <div style={{ position: "absolute", inset: 24, borderRadius: 8, background: "linear-gradient(135deg,rgba(255,255,255,.75),rgba(255,255,255,.15))" }} />
            <div style={{ position: "absolute", right: 34, top: 230, width: 16, height: 70, borderRadius: 8, background: MINT.ink }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: 70, textAlign: "center", fontFamily: JAKARTA, fontWeight: 800, fontSize: 30, letterSpacing: "0.2em", color: MINT.deep }}>PHARMACIE</div>
          </div>
          <div style={{ position: "absolute", left: 20, top: 600, width: 580, height: 14, borderRadius: 7, background: MINT.ink }} />
          <div style={{ position: "absolute", left: 160 + (1 - slide) * 520, top: 560 + slide * 6, width: 300, height: 120, borderRadius: 10, background: "#FFFFFF", boxShadow: "0 16px 30px -14px rgba(15,43,38,.45)", transform: `rotate(${-6 + 6 * slide}deg) perspective(600px) rotateX(${55 - 25 * slide}deg)`, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <Mail size={42} color={MINT.green} />
            <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 20, color: MINT.ink, lineHeight: 1.15 }}>
              À l&apos;attention
              <br />
              du pharmacien
            </span>
          </div>
        </div>
      </Abs>
    </>
  );
}

/** « …plutôt que de vous déranger en pleine journée » : la file au comptoir, l'horloge, le téléphone qui sonne. */
export function Journee({ t }: { t: number }) {
  const a = w("Y1", "plutôt");
  const ring = w("Y1", "déranger");
  const u = t - ring;
  const shake = u > 0 && u < 1.2 ? Math.sin(u * 60) * 5 * Math.exp(-u * 2) : 0;
  return (
    <>
      <Title t={t} at={a} text="Plutôt que de vous déranger *en pleine journée.*" y={150} size={64} />
      <Abs x={960} y={620}>
        <div style={{ position: "relative", width: 1300, height: 560 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ position: "absolute", left: 120 + i * 150, top: 160, opacity: prog(t, a + 0.2 + i * 0.12, 0.4), transform: `translateY(${wobble(t, i + 3, 4, 0.8)}px)` }}>
              <div style={{ width: 90, height: 90, borderRadius: 99, background: ["#C9D8D2", "#D9CFC4", "#C6D3DE", "#D7CCD9"][i], margin: "0 auto" }} />
              <div style={{ width: 130, height: 210, borderRadius: "60px 60px 18px 18px", background: ["#DCE7E2", "#E8DFD4", "#D8E2EC", "#E6DDE8"][i], marginTop: 10 }} />
            </div>
          ))}
          <div style={{ position: "absolute", left: 120, top: 500, fontFamily: JAKARTA, fontWeight: 700, fontSize: 28, color: MINT.soft, opacity: prog(t, a + 0.7, 0.4) }}>Quatre patients attendent…</div>
          <div style={{ position: "absolute", left: 830, top: 60, opacity: prog(t, a + 0.3, 0.4) }}>
            <svg width={200} height={200} viewBox="-100 -100 200 200">
              <circle r={90} fill="#FFFFFF" stroke={MINT.ink} strokeWidth={10} />
              <line x1={0} y1={0} x2={0} y2={-58} stroke={MINT.ink} strokeWidth={9} strokeLinecap="round" transform={`rotate(${(t - a) * 30})`} />
              <line x1={0} y1={0} x2={0} y2={-76} stroke={MINT.green} strokeWidth={6} strokeLinecap="round" transform={`rotate(${(t - a) * 360})`} />
              <circle r={8} fill={MINT.ink} />
            </svg>
          </div>
          <div style={{ position: "absolute", left: 1000, top: 300, transform: `rotate(${shake}deg) scale(${pop(t, ring - 0.2)})` }}>
            <Card style={{ width: 240, height: 140, display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <Bell size={54} color="#E0884A" />
              <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 30, color: MINT.ink }}>Driiing</span>
            </Card>
          </div>
        </div>
      </Abs>
    </>
  );
}

/** « Laissez-nous vous montrer, en deux minutes, ce qui change au comptoir. » */
function DeuxMinutes({ t }: { t: number }) {
  const ring = prog(t, w("Y2", "deux") - 0.1, 2.2, IN_OUT);
  const p = pop(t, w("Y2", "deux") - 0.2);
  return (
    <>
      <Title t={t} at={w("Y2", "change")} text="Ce qui change *au comptoir.*" y={170} size={74} />
      <Abs x={960} y={600}>
        <div style={{ position: "relative", width: 400, height: 400, transform: `scale(${p})` }}>
          <svg width={400} height={400} viewBox="0 0 400 400" style={{ position: "absolute", inset: 0 }}>
            <circle cx={200} cy={200} r={180} fill="none" stroke={rgba(MINT.green, 0.15)} strokeWidth={22} />
            <circle cx={200} cy={200} r={180} fill="none" stroke={MINT.green} strokeWidth={22} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ring} transform="rotate(-90 200 200)" />
          </svg>
          <div style={{ position: "absolute", inset: 64, borderRadius: 999, background: "#FFFFFF", boxShadow: "0 30px 60px -30px rgba(15,43,38,.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Play size={72} fill={MINT.green} color={MINT.green} style={{ marginLeft: 10 }} />
            <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 42, color: MINT.ink }}>2 minutes</span>
          </div>
        </div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 3. La preuve : le conseil parfait, le chiffre d'affaires des pharmacies tests (sans chiffre)
// =====================================================================================================================
const ROUTINE = [
  { k: "yeux", text: "Collyre anti-allergique" },
  { k: "nez", text: "Eau de mer · nez allergique" },
  { k: "gorge", text: "Pastilles adoucissantes" },
];
function Preuve({ t }: { t: number }) {
  const parfait = w("Y9b", "parfait,");
  const seconde = w("Y9b", "seconde");
  const prouve = w("Y9b", "prouvé");
  const tests = w("Y9b", "tests,");
  const ca = w("Y9b", "chiffre");
  const left = 1 - prog(t, prouve - 0.3, 0.45, IN_OUT);
  const go = Math.min(tests - 0.3, prouve + 0.35);
  const grow = prog(t, go + 0.2, 2.2, SNAP);
  const bars = [0.42, 0.5, 0.47, 0.6, 0.7, 0.82, 0.95];
  return (
    <>
      <Title t={t} at={VAT.Y9b - 0.3} out={prouve - 0.35} text="Le conseil *parfait.*" y={160} size={84} />
      <Title t={t} at={prouve - 0.1} text="C'est *prouvé.*" y={150} size={84} />
      {left > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: left }}>
          <Abs x={600} y={590}>
            <div style={{ transform: `scale(${pop(t, Math.min(seconde - 1.0, VAT.Y9b + 0.25))})` }}>
              <Card style={{ width: 380, height: 380, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <Timer size={130} color={MINT.green} strokeWidth={1.8} style={{ transform: `rotate(${wobble(t, 4, 6, 3)}deg)` }} />
                <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 88, color: MINT.ink, letterSpacing: "-0.04em" }}>1 s</span>
              </Card>
            </div>
          </Abs>
          <Abs x={1250} y={590}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {ROUTINE.map((p, i) => {
                const k = pop(t, VAT.Y9b - 0.1 + i * 0.2);
                return (
                  <div key={p.k} style={{ transform: `translateX(${(1 - Math.min(1, k)) * 60}px)`, opacity: Math.min(1, k * 2) }}>
                    <Card style={{ display: "flex", alignItems: "center", gap: 22, padding: "18px 30px 18px 18px", width: 620 }}>
                      <GenericPic kind={p.k} size={84} radius={20} />
                      <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 36, color: MINT.ink }}>{p.text}</span>
                    </Card>
                  </div>
                );
              })}
            </div>
          </Abs>
        </div>
      )}
      {t > prouve - 0.3 && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - left }}>
          <Abs x={960} y={600}>
            <Card style={{ width: 1180, height: 560, padding: "40px 54px", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <span style={{ display: "inline-flex", width: 64, height: 64, borderRadius: 18, background: MINT.bg, alignItems: "center", justifyContent: "center" }}>
                  <Store size={36} color={MINT.green} />
                </span>
                <div>
                  <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 40, color: MINT.ink, letterSpacing: "-0.02em", opacity: prog(t, go, 0.4) }}>Nos pharmacies tests</div>
                  <div style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 26, color: MINT.soft, opacity: prog(t, ca - 0.1, 0.4) }}>Chiffre d&apos;affaires</div>
                </div>
                <div style={{ marginLeft: "auto", transform: `scale(${pop(t, ca + 0.9)})` }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "14px 26px", borderRadius: 999, background: MINT.green, color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 32 }}>
                    <TrendingUp size={34} /> En hausse
                  </span>
                </div>
              </div>
              <div style={{ position: "absolute", left: 54, right: 54, bottom: 50, height: 330, display: "flex", alignItems: "flex-end", gap: 34 }}>
                {bars.map((h, i) => {
                  const k = prog(t, go + i * 0.14, 0.6, SNAP);
                  return <div key={i} style={{ flex: 1, height: `${h * 100 * k}%`, borderRadius: "14px 14px 4px 4px", background: i >= 3 ? `linear-gradient(180deg, ${MINT.green}, ${MINT.deep})` : "#D6E2DD" }} />;
                })}
              </div>
              <svg style={{ position: "absolute", left: 54, bottom: 50, overflow: "visible" }} width={1072} height={330} viewBox="0 0 1072 330">
                <path d="M40 210 C 220 170, 380 190, 520 140 S 820 40, 1030 10" fill="none" stroke={PB.gold} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - grow} />
              </svg>
              <div style={{ position: "absolute", left: 54 + 3 * (1072 / 7), top: 150, fontFamily: JAKARTA, fontWeight: 800, fontSize: 22, color: MINT.green, letterSpacing: "0.12em", opacity: prog(t, ca + 0.5, 0.4) }}>AVEC PHARMABOOST →</div>
            </Card>
          </Abs>
        </div>
      )}
    </>
  );
}

// =====================================================================================================================
// 4. Le patient revient
// =====================================================================================================================
/** L'écran de l'appli PharmaBoost du patient : ses conseils, sa routine, sa cure. */
function AppBilan({ t, at, lit }: { t: number; at: number; lit: { conseils: number; routine: number; cure: number } }) {
  const tx = (size: number, weight = 700, color = "#101828"): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, color, letterSpacing: size > 20 ? "-0.02em" : 0 });
  const box = (k: number): CSSProperties => ({ marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 12, boxShadow: k > 0.01 ? `0 0 0 ${3 * k}px ${rgba(MINT.green, 0.6)}, 0 10px 24px -14px rgba(0,0,0,.3)` : "0 0 0 1px #E4ECE9", transform: `scale(${1 + 0.03 * k})` });
  const st = (i: number): CSSProperties => ({ opacity: prog(t, at + 0.1 * i, 0.35), transform: `translateY(${(1 - prog(t, at + 0.1 * i, 0.35, SNAP)) * 16}px)` });
  const cureK = prog(t, at + 0.6, 1.4, IN_OUT);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#EEF3F1", padding: "56px 14px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...st(0) }}>
        <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 10, background: PB.green, alignItems: "center", justifyContent: "center" }}>
          <Cross size={18} color={PB.citron} />
        </span>
        <span style={tx(16, 800)}>PharmaBoost</span>
        <span style={{ marginLeft: "auto", ...tx(12, 600, "#64748B") }}>Pharmacie du Centre</span>
      </div>
      <div style={{ marginTop: 14, ...tx(24, 800, "#0B3B47"), ...st(1) }}>Mon bilan</div>
      <div style={{ ...st(2) }}>
        <div style={box(lit.conseils)}>
          <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Mes conseils</div>
          {ROUTINE.map((p) => (
            <div key={p.k} style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <GenericPic kind={p.k} size={34} radius={9} />
              <span style={tx(14, 700)}>{p.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...st(3) }}>
        <div style={box(lit.routine)}>
          <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Ma routine allergie</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            {[
              { I: Eye, l: "Yeux" },
              { I: Droplets, l: "Nez" },
              { I: Candy, l: "Gorge" },
            ].map(({ I, l }) => (
              <span key={l} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 10, background: "#EAF5EF", ...tx(13, 700, MINT.deep) }}>
                <I size={15} /> {l}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ ...st(4) }}>
        <div style={{ ...box(lit.cure), display: "flex", alignItems: "center", gap: 12 }}>
          <svg width={56} height={56} viewBox="0 0 56 56">
            <circle cx={28} cy={28} r={23} fill="none" stroke="#E3ECE8" strokeWidth={7} />
            <circle cx={28} cy={28} r={23} fill="none" stroke={MINT.green} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - 0.77 * cureK} transform="rotate(-90 28 28)" />
          </svg>
          <div>
            <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Ma cure</div>
            <div style={tx(15, 800)}>Jour {Math.max(1, Math.round(23 * cureK))} sur 30</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ALLERGY_POINTS = [
  { Icon: Eye, title: "Les yeux", text: "collyre anti-allergique" },
  { Icon: Droplets, title: "Le nez", text: "eau de mer, nez allergique" },
  { Icon: Candy, title: "La gorge", text: "pastilles adoucissantes" },
];
/** 0 → 1 → 0 autour d'un mot (la section de l'appli s'allume quand on la nomme). */
const pulseOn = (t: number, at: number) => prog(t, at - 0.1, 0.25, SNAP) * (1 - prog(t, at + 1.1, 0.4, IN_OUT));

/** « Et ça ne s'arrête pas au comptoir. Par e-mail et dans l'application PharmaBoost, le patient retrouve son bilan… » */
function Bilan({ t }: { t: number }) {
  const par = VAT.Y11;
  const devices = prog(t, par - 0.2, 0.6, SNAP);
  return (
    <>
      <Title t={t} at={VAT.Y10} out={par - 0.3} text="Et ça ne s'arrête pas *au comptoir.*" y={520} size={86} />
      <Title t={t} at={par} text="Son bilan, *par e-mail et dans l'appli.*" y={110} size={60} />
      {devices > 0 && (
        <>
          <Phone t={t} x={700} y={610} scale={0.98 * (0.9 + 0.1 * devices)} tilt={10} style={{ opacity: devices }}>
            <MailBilan t={t} at={par} product="Collyre anti-allergique" kind="yeux" why="Avec l'allergie, les yeux piquent ou pleurent souvent : ce collyre agit contre l'allergie des yeux, en complément de votre traitement." points={ALLERGY_POINTS} />
          </Phone>
          <Phone t={t} x={1220} y={610} scale={0.98 * (0.9 + 0.1 * devices)} tilt={-10} style={{ opacity: devices }}>
            <AppBilan t={t} at={w("Y11", "l'application") - 0.2} lit={{ conseils: pulseOn(t, w("Y11", "conseils,")), routine: pulseOn(t, w("Y11", "routine,")), cure: pulseOn(t, w("Y11", "cure.")) }} />
          </Phone>
          <Abs x={400} y={330}>
            <Pill t={t} at={w("Y11", "e-mail")} size={28}>
              <Mail size={30} color={MINT.green} /> Par e-mail
            </Pill>
          </Abs>
          <Abs x={1520} y={330}>
            <Pill t={t} at={w("Y11", "l'application")} size={28}>
              <Smartphone size={30} color={MINT.green} /> Dans l&apos;appli
            </Pill>
          </Abs>
        </>
      )}
    </>
  );
}

export const LOCK_BG = "linear-gradient(170deg,#CFEDE2,#8FD0BC 60%,#5DB8A2)";

/** « Une notification lui rappelle que sa cure se termine : il revient. » */
function Rappel({ t }: { t: number }) {
  const notif = w("Y12", "notification") - 0.1;
  const revient = w("Y12", "revient");
  const walk = prog(t, revient - 0.5, 1.4, IN_OUT);
  return (
    <>
      <Title t={t} at={VAT.Y12} text="Fin de cure : *il revient.*" y={120} size={70} />
      <Phone t={t} x={720} y={600} scale={1.02} buzz={notif} screen={LOCK_BG}>
        <div style={{ position: "absolute", top: 120, left: 0, right: 0, textAlign: "center", fontFamily: JAKARTA, fontWeight: 300, fontSize: 84, color: "#FFFFFF", letterSpacing: "-0.03em" }}>9:41</div>
        <div style={{ position: "absolute", top: 215, left: 0, right: 0, textAlign: "center", fontFamily: JAKARTA, fontWeight: 600, fontSize: 18, color: "#FFFFFF" }}>mardi 3 novembre</div>
        <div style={{ position: "absolute", top: 270, left: 0, right: 0, height: 200 }}>
          <Notification t={t} at={notif} icon="robot" app="PharmaBoost" title="Votre cure se termine bientôt" body="Plus que 7 jours. Passez nous voir à la Pharmacie du Centre." />
        </div>
      </Phone>
      <Abs x={1330} y={600}>
        <div style={{ position: "relative", width: 520, height: 520, opacity: prog(t, notif + 0.4, 0.5) }}>
          <div style={{ position: "absolute", left: 110, top: 70, width: 300, height: 400, borderRadius: "16px 16px 0 0", background: "linear-gradient(180deg,#DCEFE7,#C7E6DA)", border: `8px solid ${MINT.ink}`, borderBottom: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 30, textAlign: "center", fontFamily: JAKARTA, fontWeight: 800, fontSize: 22, letterSpacing: "0.2em", color: MINT.deep }}>PHARMACIE</div>
          </div>
          <div style={{ position: "absolute", left: 230, top: 0 }}>
            <Cross size={60} glow={0.6} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 470, height: 10, borderRadius: 5, background: MINT.ink }} />
          <div style={{ position: "absolute", left: 470 - 250 * walk, top: 270 - Math.abs(Math.sin(walk * 18)) * 8, opacity: 1 - prog(t, revient + 0.85, 0.3) }}>
            <div style={{ width: 56, height: 56, borderRadius: 99, background: "#F0BAC6", margin: "0 auto" }} />
            <div style={{ width: 84, height: 140, borderRadius: "40px 40px 12px 12px", background: "#E58BA1", marginTop: 6 }} />
          </div>
        </div>
      </Abs>
      <Abs x={1330} y={920}>
        <Pill t={t} at={revient} size={30}>
          <Repeat size={32} color={MINT.green} /> Il revient en pharmacie
        </Pill>
      </Abs>
    </>
  );
}

/** « Votre pharmacie lance une campagne avec un laboratoire : ses patients sont prévenus, directement dans l'appli. » */
function Campagne({ t }: { t: number }) {
  const lance = w("Y13", "lance");
  const labo = w("Y13", "laboratoire");
  const prev = w("Y13", "prévenus,");
  const click = labo + 0.55;
  return (
    <>
      <Title t={t} at={VAT.Y13} text="Vos campagnes, *dans leur poche.*" y={110} size={64} />
      <Abs x={560} y={590}>
        <div style={{ transform: `scale(${pop(t, lance - 0.35)})` }}>
          <Card style={{ width: 640, padding: 34 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ display: "inline-flex", width: 56, height: 56, borderRadius: 16, background: MINT.bg, alignItems: "center", justifyContent: "center" }}>
                <Megaphone size={30} color={MINT.green} />
              </span>
              <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 34, color: MINT.ink }}>Nouvelle campagne</span>
            </div>
            {[
              { l: "Laboratoire", v: "Laboratoire partenaire", at: labo - 0.1 },
              { l: "Gamme", v: "Soins solaires", at: labo + 0.05 },
              { l: "Offre", v: "−20 % en pharmacie", at: labo + 0.2 },
            ].map((f) => (
              <div key={f.l} style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRadius: 14, background: "#F4F8F6", opacity: prog(t, f.at, 0.3), fontFamily: JAKARTA }}>
                <span style={{ fontWeight: 600, fontSize: 24, color: MINT.soft }}>{f.l}</span>
                <span style={{ fontWeight: 800, fontSize: 26, color: MINT.ink }}>{f.v}</span>
              </div>
            ))}
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <span style={{ padding: "16px 34px", borderRadius: 999, background: t > click ? MINT.deep : MINT.green, color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 28, transform: `scale(${t > click && t < click + 0.15 ? 0.94 : 1})` }}>{t > click + 0.1 ? "✓ Campagne lancée" : "Lancer la campagne"}</span>
            </div>
          </Card>
        </div>
      </Abs>
      {[0, 1, 2].map((i) => {
        const at = prev - 0.35 + i * 0.18;
        const k = prog(t, at - 0.5, 0.5, SNAP);
        return (
          <Phone key={i} t={t} x={1180 + i * 250} y={600 + (i === 1 ? -40 : 30)} scale={0.62} rot={(i - 1) * 5} buzz={at} style={{ opacity: k }} screen={LOCK_BG}>
            <div style={{ position: "absolute", top: 110, left: 0, right: 0, textAlign: "center", fontFamily: JAKARTA, fontWeight: 300, fontSize: 80, color: "#FFFFFF" }}>9:41</div>
            <div style={{ position: "absolute", top: 240, left: 0, right: 0, height: 200 }}>
              <Notification t={t} at={at} icon="robot" app="PharmaBoost" title="Pharmacie du Centre" body="−20 % sur les soins solaires de notre laboratoire partenaire." />
            </div>
          </Phone>
        );
      })}
      <Abs x={1430} y={950}>
        <Pill t={t} at={w("Y13", "directement")} size={28}>
          <Bell size={30} color={MINT.green} /> Vos patients prévenus
        </Pill>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 5. Même rue, deux pharmacies — c'est un cercle
// =====================================================================================================================
export const PASSANTS = ["#F0BAC6", "#8EEBD3", "#F6D98A", "#9CC7F0", "#C9B8F0", "#F4B59A"];
const SHELF = ["#2C9AB7", "#0E8A7B", "#7A5BD0", "#F2A23A", "#1E88C8", "#D0485F", "#109C7C"];
export function Shop({ x, lit, t }: { x: number; lit: number; t: number }) {
  const on = lit > 0.5;
  const frame = on ? MINT.ink : "#B9C2BF";
  return (
    <div style={{ position: "absolute", left: x - 320, top: 330, width: 640, height: 560 }}>
      <div style={{ position: "absolute", left: 0, top: 60, width: 640, height: 500, borderRadius: "22px 22px 0 0", background: on ? "#FFFFFF" : "#ECEFEE", boxShadow: "0 40px 70px -40px rgba(15,43,38,.45), 0 0 0 2px rgba(15,43,38,.06)" }} />
      <div style={{ position: "absolute", left: 30, top: 90, width: 580, height: 70, borderRadius: 14, background: frame, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 32, letterSpacing: "0.22em", color: on ? "#FFFFFF" : "#E9EDEC" }}>PHARMACIE</span>
      </div>
      <svg style={{ position: "absolute", left: 20, top: 168 }} width={600} height={62} viewBox="0 0 600 62">
        {Array.from({ length: 10 }, (_, i) => (
          <path key={i} d={`M${i * 60} 0 h60 v38 a30 22 0 0 1 -60 0 Z`} fill={i % 2 ? "#FFFFFF" : on ? MINT.green : "#AEB8B5"} stroke={rgba(MINT.ink, 0.08)} />
        ))}
      </svg>
      <div style={{ position: "absolute", left: 40, top: 250, width: 330, height: 250, borderRadius: 12, background: on ? "linear-gradient(160deg,#F4FFD8,#DFF5E8)" : "linear-gradient(160deg,#E2E6E5,#D3D9D7)", boxShadow: `inset 0 0 0 6px ${frame}`, overflow: "hidden" }}>
        {[0, 1, 2].map((r) => (
          <div key={r} style={{ position: "absolute", left: 20, right: 20, top: 66 + r * 70, height: 6, borderRadius: 3, background: on ? rgba(MINT.ink, 0.25) : "#C2C9C7" }}>
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} style={{ position: "absolute", left: 6 + i * 40, bottom: 6, width: 28, height: 30 + ((i * 7 + r * 3) % 4) * 6, borderRadius: 4, background: on ? SHELF[(i + r) % 7] : "#BFC7C4" }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 410, top: 250, width: 180, height: 310, borderRadius: "12px 12px 0 0", background: on ? "linear-gradient(180deg,#DCEFE7,#C7E6DA)" : "#D3D9D7", boxShadow: `inset 0 0 0 6px ${frame}` }}>
        <div style={{ position: "absolute", right: 22, top: 140, width: 12, height: 50, borderRadius: 6, background: frame }} />
      </div>
      <div style={{ position: "absolute", left: 560, top: 0 }}>
        <Cross size={90} color={on ? "#2BD67B" : "#C3CBC8"} glow={lit * (0.7 + 0.3 * Math.sin(t * 3))} />
      </div>
    </div>
  );
}

function Rue({ t }: { t: number }) {
  const a = VAT.Y14;
  const mais = w("Y15", "mais");
  const lit = prog(t, mais - 0.1, 0.5, SNAP);
  const back = w("Y15", "reviennent");
  const cercle = w("Y15", "nouveau") - 0.2;
  const veil = prog(t, cercle, 0.5, IN_OUT) * (1 - prog(t, VAT.Y16 - 0.4, 0.45, IN_OUT));
  const pan = prog(t, VAT.Y16 + 0.1, 1.3, IN_OUT);
  const bx = (i: number) => (i === 0 ? 560 : 1360);
  const nodes = [
    { I: Store, l: "Le conseil au comptoir" },
    { I: Mail, l: "Le bilan, e-mail et appli" },
    { I: Bell, l: "La notification" },
    { I: Repeat, l: "Le retour en pharmacie" },
  ];
  const spin = (t - cercle) * 0.55;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, transformOrigin: "1450px 720px", transform: `scale(${1 + 1.3 * pan})` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 890, height: 12, background: MINT.ink, opacity: 0.85 }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 902, height: 178, background: "linear-gradient(180deg,#E3ECE8,#F4F8F6)" }} />
        {[0, 1].map((i) => (
          <div key={i} style={{ position: "absolute", inset: 0, opacity: prog(t, a + 0.1 + i * 0.15, 0.5), transform: `translateY(${(1 - prog(t, a + 0.1 + i * 0.15, 0.6, SNAP)) * 60}px)` }}>
            <Shop x={bx(i)} lit={i === 0 ? lit : 0} t={t} />
          </div>
        ))}
        {[0, 1].map((i) => (
          <div key={`m${i}`} style={{ position: "absolute", left: bx(i) - 120, top: 240, display: "flex", gap: 30, alignItems: "flex-end", opacity: 1 - prog(t, mais, 0.4) }}>
            <div style={{ transform: `scale(${pop(t, w("Y14", "boîtes,") - 0.1)})`, transformOrigin: "50% 100%" }}>
              <MedBox kind="cetirizine" w={120} />
            </div>
            <div style={{ transform: `scale(${pop(t, w("Y14", "ordonnances") - 0.1)})`, transformOrigin: "50% 100%" }}>
              <Ordonnance w={80} />
            </div>
          </div>
        ))}
        {PASSANTS.map((c, i) => {
          const s = back - 0.6 + i * 0.32;
          const k = prog(t, s, 1.6, IN_OUT);
          if (t < s || k >= 1) return null;
          return (
            <div key={i} style={{ position: "absolute", left: 1010 - 330 * k, top: 720 - Math.abs(Math.sin(k * 14)) * 8, opacity: Math.min(1, k * 6) * (1 - prog(t, s + 1.35, 0.25)) }}>
              <div style={{ width: 44, height: 44, borderRadius: 99, background: c, margin: "0 auto" }} />
              <div style={{ width: 66, height: 112, borderRadius: "33px 33px 10px 10px", background: c, filter: "brightness(.9)", marginTop: 5 }} />
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 420, top: 250, opacity: 1 - prog(t, cercle - 0.2, 0.3) }}>
          <Pill t={t} at={back} size={30}>
            <Repeat size={32} color={MINT.green} /> Ils reviennent
          </Pill>
        </div>
      </div>
      <Flash t={t} at={mais} dur={0.4} max={0.35} color="#F4FFB8" />
      <Title t={t} at={a} out={mais - 0.3} text="Même rue. *Deux pharmacies.*" y={130} size={70} />
      <Title t={t} at={mais - 0.1} out={cercle - 0.1} text="Dans l'une, les patients *reviennent.*" y={130} size={70} />
      <Title t={t} at={VAT.Y16} text="Pendant ce temps, *à côté…*" y={130} size={70} />
      {veil > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: veil }}>
          <AbsoluteFill style={{ background: rgba("#F7FBF9", 0.95) }} />
          <Abs x={960} y={110}>
            <Rise t={t} at={w("Y15", "cercle.")} text="C'est un *cercle.*" size={76} style={{ width: 1400 }} />
          </Abs>
          <Abs x={960} y={590}>
            <div style={{ position: "relative", width: 760, height: 760 }}>
              <svg width={760} height={760} viewBox="-380 -380 760 760" style={{ position: "absolute", inset: 0 }}>
                <circle r={250} fill="none" stroke={rgba(MINT.green, 0.15)} strokeWidth={14} />
                <circle r={250} fill="none" stroke={MINT.green} strokeWidth={14} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog(t, cercle + 0.1, 1.6, IN_OUT)} transform="rotate(-90)" />
                <circle cx={250 * Math.cos(spin * Math.PI * 2 - Math.PI / 2)} cy={250 * Math.sin(spin * Math.PI * 2 - Math.PI / 2)} r={16} fill={PB.gold} opacity={prog(t, cercle + 1.4, 0.3)} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PBLogo t={t} at={cercle + 0.2} size={56} variant="icon" tone="light" />
              </div>
              {nodes.map(({ I, l }, i) => {
                const ang = (i / 4) * Math.PI * 2 - Math.PI / 2;
                const k = pop(t, cercle + 0.25 + i * 0.32);
                return (
                  <div key={l} style={{ position: "absolute", left: 380 + 250 * Math.cos(ang), top: 380 + 250 * Math.sin(ang), transform: `translate(-50%, -50%) scale(${k})` }}>
                    <Card style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 24px", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", width: 52, height: 52, borderRadius: 14, background: MINT.green, alignItems: "center", justifyContent: "center" }}>
                        <I size={28} color="#FFFFFF" />
                      </span>
                      <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 28, color: MINT.ink }}>{l}</span>
                    </Card>
                  </div>
                );
              })}
            </div>
          </Abs>
        </div>
      )}
    </>
  );
}

// =====================================================================================================================
// 6. La signature (fond blanc)
// =====================================================================================================================
function Fin({ t }: { t: number }) {
  const pb = w("Y17", "pharmaboost");
  const vous = VAT.Y18;
  const reservez = w("Y18", "réservez");
  const sloganOut = prog(t, vous - 0.25, 0.35, IN_OUT);
  const finalIn = t >= FINAL_HIT - 0.05;
  const btn = ressort(t, finalIn ? FINAL_HIT + 0.35 : reservez, { damping: 10, stiffness: 240, mass: 0.6 });
  const vousOut = prog(t, FINAL_HIT - 0.4, 0.35, IN_OUT);
  return (
    <>
      <Flash t={t} at={pb - 0.05} dur={0.3} max={0.5} />
      <Flash t={t} at={FINAL_HIT} dur={0.35} max={0.55} />
      <Abs x={960} y={finalIn ? 320 : 270}>
        <PBLogo t={t} at={finalIn ? FINAL_HIT : pb} size={finalIn ? 130 : 110} tone="light" grad />
      </Abs>
      <Ring t={t} at={pb + 0.1} x={960} y={270} max={1000} color={MINT.green} />
      {!finalIn && (
        <>
          <div style={{ position: "absolute", inset: 0, opacity: 1 - sloganOut }}>
            <Abs x={960} y={500}>
              <Rise t={t} at={w("Y17", "votre") - 0.1} text="Votre expertise, *soutenue à chaque délivrance.*" size={70} style={{ width: 1500 }} />
            </Abs>
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: 1 - vousOut }}>
            <Abs x={960} y={500}>
              <Rise t={t} at={vous} text="Et vous, quelle pharmacie *voulez-vous être ?*" size={70} style={{ width: 1600 }} />
            </Abs>
          </div>
        </>
      )}
      {finalIn && (
        <>
          <Confetti t={t} at={FINAL_HIT + 0.1} x={960} y={420} count={70} power={1500} />
          <Abs x={960} y={560}>
            <div style={{ opacity: prog(t, FINAL_HIT + 0.3, 0.5), fontFamily: JAKARTA, fontWeight: 800, fontSize: 54, letterSpacing: "-0.03em", color: MINT.ink, whiteSpace: "nowrap" }}>
              Votre expertise, <span style={{ color: MINT.green }}>soutenue à chaque délivrance.</span>
            </div>
          </Abs>
        </>
      )}
      <Abs x={960} y={finalIn ? 740 : 700}>
        <div style={{ transform: `scale(${t < reservez ? 0 : btn})`, display: "flex", alignItems: "center", gap: 16, padding: "26px 50px", borderRadius: 999, background: MINT.green, color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 42, boxShadow: `0 24px 50px -20px ${rgba(MINT.green, 0.7)}` }}>
          <CalendarCheck size={44} /> Réserver une démonstration
        </div>
      </Abs>
      <Abs x={960} y={finalIn ? 860 : 820}>
        <div style={{ opacity: prog(t, reservez + 0.8, 0.5), fontFamily: JAKARTA, fontWeight: 800, fontSize: 36, color: MINT.deep }}>pharmaboost.app</div>
      </Abs>
      <Sparkle t={t} at={FINAL_HIT + 0.2} x={1240} y={320} size={80} color={PB.gold} />
    </>
  );
}

// ---- Les sous-titres : les mots de chaque phrase, calés sur la voix --------------------------------------------------
type CapLine = { at: number; words: Word[]; quote: boolean };
const CAPTION_LINES: CapLine[] = (() => {
  const out: CapLine[] = [];
  for (const l of LINES) {
    if (VAT[l.id] === undefined) continue;
    const quote = l.who === "clemence" || l.who === "eric";
    let cur: Word[] = [];
    for (const wd of M[l.id].words) {
      cur.push(wd);
      if (/[.:?!…]$/.test(wd.w) || (cur.length >= 6 && /,$/.test(wd.w)) || cur.length >= 11) {
        out.push({ at: VAT[l.id], words: cur, quote });
        cur = [];
      }
    }
    if (cur.length) out.push({ at: VAT[l.id], words: cur, quote });
  }
  return out;
})();

function Captions({ t }: { t: number }) {
  const line = CAPTION_LINES.find((l) => t >= l.at + l.words[0].at - 0.15 && t <= l.at + l.words[l.words.length - 1].end + 0.3);
  if (!line) return null;
  const vt = t - line.at;
  return (
    <Abs x={960} y={1018}>
      <div style={{ maxWidth: 1700, padding: "10px 24px", borderRadius: 16, background: "rgba(255,255,255,.92)", boxShadow: "0 10px 30px -18px rgba(15,43,38,.4)", textAlign: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 31, lineHeight: 1.3, whiteSpace: "nowrap", fontStyle: line.quote ? "italic" : undefined, color: MINT.ink }}>
        {line.quote ? "« " : ""}
        {line.words.map((wd, i) => (
          <span key={i} style={{ color: vt >= wd.at ? MINT.ink : rgba(MINT.ink, 0.3) }}>
            {wd.w}
            {i < line.words.length - 1 ? " " : ""}
          </span>
        ))}
        {line.quote ? " »" : ""}
      </div>
    </Abs>
  );
}

// ---- La musique de « Rembobinons » ------------------------------------------------------------------------------------
// Le fichier (69 s) : la tension de 0 à 20 s (le DROP), le groove de 20 à 58 s (mesures de 2 s), la fin de 58 à 69 s,
// son dernier accord à 66 s.
const LOOP: [number, number] = [20, 58];
const TAIL_AT = FINAL_HIT - (66 - 58);
type Seg = { at: number; from: number; to: number; gain: (t: number) => number };
const SPANS = Object.keys(VAT).map((id) => [VAT[id], end(id)] as const);
function duck(t: number) {
  let d = 0;
  for (const [a, b] of SPANS) if (t >= a - 0.2 && t <= b + 0.45) d = Math.max(d, Math.min(1, (t - (a - 0.2)) / 0.2, (b + 0.45 - t) / 0.45));
  return d;
}
const level = (t: number) => 0.3 + (0.1 - 0.3) * duck(t);
const MUSIC: Seg[] = (() => {
  const out: Seg[] = [];
  // La lettre : le groove, doux, qui s'efface quand le comptoir arrive.
  out.push({ at: 0, from: 20, to: 20 + A + 0.6, gain: (t) => Math.min(1, t / 1.5) * 0.11 * (1 - prog(t, A - 0.3, 0.8)) });
  // L'acte 1 : la tension, calée pour que le DROP (20 s du fichier) tombe sur le retour de la bande.
  const len = DROP - A;
  out.push({ at: A, from: Math.max(0, 20 - len), to: 20, gain: (t) => (t < A + 6 ? 0.18 : 0.22 + (0.12 - 0.22) * duck(t)) });
  // Le groove, bouclé, jusqu'à la fin ; plus bas « à côté » (la pharmacie d'à côté, sans PharmaBoost).
  let at = DROP;
  while (at < TAIL_AT - 0.01) {
    const l = Math.min(LOOP[1] - LOOP[0], TAIL_AT - at);
    out.push({ at, from: LOOP[0], to: LOOP[0] + l, gain: (t) => level(t) * (t > B - 0.3 && t < F0 ? 0.35 : 1) });
    at += l;
  }
  out.push({ at: TAIL_AT, from: 58, to: 69, gain: (t) => Math.max(level(t), t > end("Y18") ? 0.42 : 0) * (1 - prog(t, TOTAL - 1.6, 1.5)) });
  return out;
})();

// ---- Les bruitages ---------------------------------------------------------------------------------------------------
const SFX: Cue[] = [
  cue("papier", w("Y1", "lettre,") - 0.5, 0.5),
  cue("tic", w("Y1", "plutôt"), 0.3),
  cue("telephone-vibre", w("Y1", "déranger"), 0.4),
  cue("ui-ding", w("Y2", "deux"), 0.35),
  cue("whoosh-rapide", A - 0.2, 0.35),
  ...actCues(ACT),
  cue("pharmacie-ambiance", A, 0.5, 1, 6.4),
  cue("whoosh-pb", ACT_END - 0.1, 0.4),
  cue("etincelle", w("Y9b", "parfait,"), 0.4),
  cue("chrono", w("Y9b", "seconde") - 0.6, 0.35),
  cue("tampon", w("Y9b", "prouvé"), 0.45),
  cue("montee", w("Y9b", "chiffre") - 0.2, 0.35),
  cue("cloche-reussite", w("Y9b", "augmenté") - 0.1, 0.35),
  cue("whoosh-rapide", P0, 0.3),
  cue("mail", w("Y11", "e-mail") - 0.1, 0.4),
  cue("swipe-tel", w("Y11", "l'application") - 0.2, 0.35),
  cue("pop-leger", w("Y11", "conseils,"), 0.3),
  cue("pop-leger", w("Y11", "routine,"), 0.3),
  cue("pop-leger", w("Y11", "cure."), 0.3),
  cue("telephone-vibre", w("Y12", "notification") - 0.1, 0.45),
  cue("notif-douce", w("Y12", "notification"), 0.4),
  cue("porte-carillon", w("Y12", "revient") + 0.3, 0.4),
  cue("ui-clic", w("Y13", "laboratoire") + 0.55, 0.5),
  cue("notif-douce", w("Y13", "prévenus,") - 0.35, 0.35),
  cue("notif-douce", w("Y13", "prévenus,") - 0.17, 0.3, 1.08),
  cue("notif-douce", w("Y13", "prévenus,"), 0.3, 1.16),
  cue("whoosh-pb", R0, 0.35),
  cue("pop-leger", w("Y14", "boîtes,") - 0.1, 0.3),
  cue("pop-leger", w("Y14", "ordonnances") - 0.1, 0.3),
  cue("neon", w("Y15", "mais"), 0.45),
  cue("porte-carillon", w("Y15", "reviennent"), 0.3),
  cue("orbite", w("Y15", "nouveau") - 0.1, 0.35),
  cue("whoosh-lourd", VAT.Y16 + 0.1, 0.35),
  ...actCues(COTE, ["S1"], 6.2),
  cue("pharmacie-ambiance", B, 0.45, 1, 6.2),
  cue("impact-net", w("Y17", "pharmaboost") - 0.05, 0.45),
  cue("ui-ding", w("Y18", "réservez"), 0.35),
  cue("confettis", FINAL_HIT + 0.1, 0.35),
];

export function LettreFilm() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const inAct = t >= A - 0.05 && t < ACT_END + 0.5;
  const inCote = t >= B - 0.5 && t < F0 + 0.5;
  return (
    <AbsoluteFill style={{ background: MINT.paper }}>
      <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 0%, #FFFFFF 0%, ${MINT.paper} 55%, #E2EEEA 100%)` }} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.3 }}>
        <AdnBackdrop t={t} tone="paper" width={1920} focus={[0.82, 0.3]} style={{ background: "transparent" }} />
      </div>
      <Scene t={t} from={0} to={w("Y1", "plutôt") - 0.35}>
        <Lettre1 t={t} />
      </Scene>
      <Scene t={t} from={w("Y1", "plutôt") - 0.3} to={VAT.Y2 - 0.25}>
        <Journee t={t} />
      </Scene>
      <Scene t={t} from={VAT.Y2 - 0.2} to={A - 0.1}>
        <DeuxMinutes t={t} />
      </Scene>
      {inAct && (
        <AbsoluteFill style={{ opacity: prog(t, A - 0.05, 0.3) * (1 - prog(t, ACT_END, 0.45, IN_OUT)) }}>
          <Act t={t} keys={ACT} />
        </AbsoluteFill>
      )}
      <Scene t={t} from={ACT_END} to={P0}>
        <Preuve t={t} />
      </Scene>
      <Scene t={t} from={P0} to={VAT.Y12 - 0.3}>
        <Bilan t={t} />
      </Scene>
      <Scene t={t} from={VAT.Y12 - 0.25} to={VAT.Y13 - 0.3}>
        <Rappel t={t} />
      </Scene>
      <Scene t={t} from={VAT.Y13 - 0.25} to={R0}>
        <Campagne t={t} />
      </Scene>
      <Scene t={t} from={R0} to={B}>
        <Rue t={t} />
      </Scene>
      {inCote && (
        <AbsoluteFill style={{ opacity: prog(t, B - 0.4, 0.45) * (1 - prog(t, F0 - 0.1, 0.45, IN_OUT)) }}>
          <Act t={t} keys={COTE} only={["S1"]} />
        </AbsoluteFill>
      )}
      <Scene t={t} from={F0} to={TOTAL + 1}>
        <Fin t={t} />
      </Scene>
      <Captions t={t} />
      <Grain t={t} opacity={0.02} />
      <Vignette strength={0.12} />
      {LINES.filter((l) => VAT[l.id] !== undefined).map((l) => (
        <Sequence key={`v-${l.id}`} from={Math.round(VAT[l.id] * FPS)} layout="none" name={`Voix ${l.id}`}>
          <Audio src={staticFile(`lettre/voix/${l.id}.wav`)} volume={1} />
        </Sequence>
      ))}
      {MUSIC.map((m, i) => (
        <Sequence key={`m-${i}`} from={Math.round(m.at * FPS)} durationInFrames={Math.max(1, Math.round((m.to - m.from) * FPS))} layout="none" name={`Musique ${i}`}>
          <Audio src={staticFile("rembobine/music/musique.wav")} startFrom={Math.round(m.from * FPS)} volume={(f: number) => m.gain(m.at + f / FPS)} />
        </Sequence>
      ))}
      <Cues cues={SFX} />
    </AbsoluteFill>
  );
}
