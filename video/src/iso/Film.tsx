import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Bell, Boxes, CalendarCheck, CalendarClock, Check, Coins, Link2, Lock, Megaphone, PackageOpen, Pill as PillIcon, QrCode, ShieldCheck, MousePointer2, Play, Plug, Repeat, ShieldAlert, Store, Sun, Trophy, Droplets, Smile, Sparkles, Flower2, Zap, X } from "lucide-react";
import { AdnBackdrop, BagDrugs, Confetti, Cues, DUPES, Dupe, DupeTile, Flash, JAKARTA, MailBilan, Notification, PB, PBLogo, Phone, Ring, Sparkle, cue, rgba, type Cue, type DupeKind } from "../rembobine/kit";
import { ISO } from "../rembobine/iso";
import { FilmClock } from "../presentation/motion/kit/clock";
import { Grain, Vignette } from "../presentation/motion/kit/grain";
import { IN_OUT, SNAP, prog, ressort, wobble } from "../presentation/motion/kit/ease";
import { Abs, Card, Cross, Journee, LOCK_BG, Lettre1, MINT, PASSANTS, Pill, Rise, Scene, Shop, Title, pop } from "../lettre/Lettre";
import { LINES } from "./script";
import MOTS from "./mots.json";

/**
 * LE FILM DE PRÉSENTATION, version isotrétinoïne (fondateur, 4 nov. 2026). Deux montages du même film :
 *   • « presentation » (le site) : le comptoir rembobiné sur la routine isotrétinoïne, « en une seconde, personne ne peut
 *     tout avoir en tête », la fiche complète, l'e-mail ET l'application, les campagnes, le titulaire et son équipe ;
 *   • « lettre » (le QR code du courrier) : « Bonjour, Docteur… Je vous laisse deux minutes… », la présentation entière, puis
 *     « Réservez une démonstration ».
 * Fond blanc, aucune marque : les quatre produits sont dessinés (kit/dupes.tsx). Les temps viennent des MOTS (mots.json).
 */
export const FPS = 60;
export type Variant = "presentation" | "lettre";

type Word = { w: string; at: number; end: number };
type Said = { who: string; dur: number; words: Word[] };
const M = MOTS as Record<string, Said>;
const norm = (s: string) => s.toLowerCase().replace(/[.,:;?!…«»"]/g, "").replace(/’/g, "'");

const ROUTINE: { k: DupeKind; gest: string; Icon: typeof Sun }[] = [
  { k: "iso-nettoyant", gest: "Nettoyer", Icon: Droplets },
  { k: "iso-hydratant", gest: "Hydrater", Icon: Sparkles },
  { k: "iso-levres", gest: "Lèvres", Icon: Smile },
  { k: "iso-solaire", gest: "Soleil", Icon: Sun },
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
function filmAt(keys: [number, number][], s: number) {
  for (let i = 1; i < keys.length; i++) {
    const [a, sa] = keys[i - 1];
    const [b, sb] = keys[i];
    if (s >= sa && s <= sb && sb > sa) return (sb - sa) / (b - a) > 8 ? null : a + ((s - sa) / (sb - sa)) * (b - a);
  }
  return null;
}

function Act({ t, keys, only }: { t: number; keys: [number, number][]; only: string[] }) {
  const st = storyAt(keys, t);
  const list = ISO.filter((s) => only.includes(s.id) && st >= s.start && st < s.end);
  return (
    <BagDrugs.Provider value={["isotretinoine", "hydratant"]}>
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
function actCues(keys: [number, number][], only: string[], from = -Infinity, until = Infinity): Cue[] {
  const out: Cue[] = [];
  for (const s of ISO) {
    if (!only.includes(s.id)) continue;
    for (const c of s.mod.cues) {
      if (c.at < s.start - 0.5 || c.at > s.end || c.at < from || c.at > until) continue;
      const at = filmAt(keys, c.at);
      if (at !== null) out.push({ ...c, at });
    }
  }
  return out;
}

const tx = (size: number, weight = 700, color = MINT.ink): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, color, letterSpacing: size > 24 ? "-0.02em" : 0 });
const Example = () => <span style={{ ...tx(14, 700, MINT.soft), padding: "4px 10px", borderRadius: 99, background: "#EEF3F1" }}>Exemple</span>;

export function makeFilm(variant: Variant) {
  const lettre = variant === "lettre";
  // ---- Où tombe chaque phrase ----------------------------------------------------------------------------------------
  const VAT: Record<string, number> = {};
  const end = (id: string) => VAT[id] + M[id].words[M[id].words.length - 1].end;
  const w = (id: string, word: string, nth = 0) => {
    const hits = M[id].words.filter((x) => norm(x.w) === norm(word));
    if (!hits[nth]) throw new Error(`Mot introuvable : ${id} « ${word} »`);
    return VAT[id] + hits[nth].at;
  };
  let A = 0.6;
  if (lettre) {
    VAT.L1 = 0.9;
    VAT.L2 = end("L1") + 0.45;
    A = end("L2") + 0.5;
  }
  VAT.D1 = A + 1.4;
  VAT.D2 = A + 4.3;
  VAT.I1 = A + 6.0 - M.I1.words[0].at;
  VAT.I2 = end("I1") + 0.45;
  VAT.I3 = end("I2") + 0.45;
  const DROP = end("I3") + 0.32;
  VAT.I4 = DROP + 0.45;
  const ACT1_END = end("I4") + 0.45;
  VAT.I5 = ACT1_END + 0.35;
  const H_END = end("I5") + 0.4;
  VAT.I6 = H_END + 0.3;
  VAT.I7 = end("I6") + 0.2;
  const S_END = end("I7") + 0.45;
  VAT.I8 = S_END + 0.5;
  VAT.I9 = end("I8") + 1.3;
  const ACT2_END = end("I9") + 0.5;
  VAT.I10 = ACT2_END + 0.35;
  const F_END = end("I10") + 0.6;
  VAT.C1 = F_END + 0.6;
  VAT.D4 = end("C1") + 0.35;
  VAT.I11 = end("D4") + 0.3;
  const ACT3_END = end("I11") + 0.9;
  VAT.I12 = ACT3_END + 0.35;
  VAT.I13 = end("I12") + 0.25;
  VAT.I16 = end("I13") + 0.3;
  const B_END = end("I16") + 0.6;
  VAT.I14 = B_END + 0.35;
  const C_END = end("I14") + 0.4;
  VAT.I15 = C_END + 0.35;
  const E_END = end("I15") + 0.4;
  VAT.N12 = E_END + 0.3;
  VAT.D5 = end("N12") + 0.3;
  if (lettre) VAT.L3 = end("D5") + 0.5;
  const FINAL_HIT = end(lettre ? "L3" : "D5") + 0.55;
  const TOTAL = Math.ceil(FINAL_HIT + 3.4);

  // ---- Les trois morceaux du comptoir : temps du film → temps d'histoire de « Rembobinons » ---------------------------
  const ACT1: [number, number][] = [
    [A, 0],
    [VAT.I1, 6.0],
    [w("I1", "l'acné…"), 8.02],
    [w("I1", "mais"), 9.286],
    [w("I1", "rien"), 9.727],
    [w("I1", "sécheresse"), 10.2],
    [w("I1", "provoquer"), 10.667],
    [w("I1", "médicament."), 11.074],
    [end("I1"), 12.38],
    [w("I2", "cette"), 12.748],
    [w("I2", "chaque"), 14.002],
    [w("I2", "france"), 15.535],
    // « Et pas seulement pour l'acné… » : la carte de France reste, les autres ordonnances passent devant (Trappe).
    [w("I2", "et"), 15.85],
    [end("I2") - 0.3, 16.1],
    [end("I2"), 16.342],
    [w("I3", "alors…"), 16.825],
    [w("I3", "rembobinons"), 17.8],
    [DROP, 20.0],
    [w("I4", "même"), 20.45],
    [w("I4", "même", 1), 21.529],
    [w("I4", "ordonnance"), 21.947],
    [w("I4", "mais"), 22.853],
    [w("I4", "pharmaboost"), 23.758],
    [w("I4", "comptoir"), 24.885],
    [end("I4"), 25.593],
    [ACT1_END + 0.5, 25.85],
  ];
  const ACT2: [number, number][] = [
    [S_END - 0.4, 25.95],
    [w("I8", "dès"), 26.1],
    [w("I8", "scannée,"), 26.44],
    // La barre de chargement (Chargement) tient pendant que l'ordonnance s'analyse ; puis « le bon conseil » : la ligne ①.
    [w("I8", "bon") - 0.06, 26.5],
    [w("I8", "conseil") + 0.1, 26.62],
    [w("I8", "s'affiche,") + 0.3, 26.8],
    [w("I8", "pris") - 0.05, 26.98],
    [w("I8", "stock"), 27.8],
    [w("I8", "crème"), 27.9],
    [w("I8", "routine"), 28.05],
    // « Puis la routine » : chaque ligne sur son mot.
    [w("I8", "hydratant,") - 0.05, 28.15],
    [w("I8", "baume") - 0.05, 28.3],
    [w("I8", "solaire") - 0.05, 28.45],
    [end("I8"), 28.6],
    [VAT.I9 - 0.2, 29.95],
    [VAT.I9, 30.15],
    [w("I9", "questions"), 30.359],
    [w("I9", "poser"), 30.847],
    [w("I9", "le"), 31.299],
    [w("I9", "conseil"), 31.462],
    [w("I9", "prodiguer"), 31.729],
    // « Les challenges laboratoires, les dates courtes » : les deux pastilles claquent sur leur mot.
    [w("I9", "les", 1), 32.9],
    [w("I9", "challenges") - 0.05, 33.47],
    [w("I9", "dates") - 0.05, 34.35],
    [end("I9"), 35.04],
    [ACT2_END + 0.5, 35.3],
  ];
  const ACT3: [number, number][] = [
    [F_END - 0.4, 35.3],
    [VAT.C1, 35.49],
    [w("C1", "conseille"), 37.058],
    [w("C1", "crème"), 37.603],
    [end("C1"), 38.36],
    [VAT.D4, 38.791],
    [end("D4"), 40.01],
    [w("I11", "le"), 40.55],
    [w("I11", "décide"), 41.363],
    [w("I11", "conseil"), 42.524],
    [w("I11", "délivrance"), 43.813],
    [end("I11"), 44.529],
    [ACT3_END, 45.3],
  ];

  // ===================================================================================================================
  // La lettre (montage « lettre ») : les deux premières images sont celles du film de la lettre (même voix, mêmes temps).
  // ===================================================================================================================
  function DeuxMinutes({ t }: { t: number }) {
    const ring = prog(t, w("L2", "deux") - 0.1, 2.6, IN_OUT);
    const p = pop(t, w("L2", "deux") - 0.2);
    return (
      <>
        <Title t={t} at={w("L2", "découvrir")} text="Ce que PharmaBoost change *au comptoir.*" y={170} size={70} />
        <Abs x={960} y={600}>
          <div style={{ position: "relative", width: 400, height: 400, transform: `scale(${p})` }}>
            <svg width={400} height={400} viewBox="0 0 400 400" style={{ position: "absolute", inset: 0 }}>
              <circle cx={200} cy={200} r={180} fill="none" stroke={rgba(MINT.green, 0.15)} strokeWidth={22} />
              <circle cx={200} cy={200} r={180} fill="none" stroke={MINT.green} strokeWidth={22} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ring} transform="rotate(-90 200 200)" />
            </svg>
            <div style={{ position: "absolute", inset: 64, borderRadius: 999, background: "#FFFFFF", boxShadow: "0 30px 60px -30px rgba(15,43,38,.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Play size={72} fill={MINT.green} color={MINT.green} style={{ marginLeft: 10 }} />
              <span style={tx(42, 800)}>2 minutes</span>
            </div>
          </div>
        </Abs>
      </>
    );
  }

  // ===================================================================================================================
  // « Rien ne change dans vos habitudes : PharmaBoost se connecte directement à votre logiciel. »
  // ===================================================================================================================
  function Habitudes({ t }: { t: number }) {
    const a = VAT.I5;
    const pb = w("I5", "pharmaboost");
    const link = prog(t, w("I5", "connecte") - 0.1, 0.9, IN_OUT);
    const snap = pop(t, w("I5", "directement"));
    const rows = 7;
    return (
      <>
        <Title t={t} at={a} text="Rien ne change *dans vos habitudes.*" y={120} size={68} />
        <Abs x={760} y={610}>
          <div style={{ transform: `scale(${0.94 + 0.06 * prog(t, a, 0.6, SNAP)})`, opacity: prog(t, a, 0.4) }}>
            <Card style={{ width: 980, height: 600, overflow: "hidden", borderRadius: 22 }}>
              <div style={{ height: 56, background: "linear-gradient(180deg,#3B5C8C,#2F4C77)", display: "flex", alignItems: "center", gap: 12, padding: "0 22px" }}>
                {["#F26B5B", "#F5C04A", "#5CC96A"].map((c) => (
                  <span key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c }} />
                ))}
                <span style={{ ...tx(22, 800, "#FFFFFF"), marginLeft: 14 }}>Votre logiciel de pharmacie</span>
                <span style={{ marginLeft: "auto", ...tx(18, 600, "rgba(255,255,255,.7)") }}>Facturation · Délivrance</span>
              </div>
              <div style={{ display: "flex", gap: 0, background: "#DCE5F0", padding: "10px 18px", ...tx(16, 700, "#2F4C77") }}>
                {["Désignation", "Qté", "Prix", "Stock", "Dus"].map((h, i) => (
                  <span key={h} style={{ flex: i === 0 ? 4 : 1 }}>{h}</span>
                ))}
              </div>
              {Array.from({ length: rows }, (_, r) => (
                <div key={r} style={{ display: "flex", alignItems: "center", padding: "0 18px", height: 52, borderBottom: "1px solid #E5ECF3", background: r === 0 ? "#FFF6C9" : r % 2 ? "#F7FAFD" : "#FFFFFF" }}>
                  <span style={{ flex: 4 }}>
                    <span style={{ display: "inline-block", height: 12, width: r === 0 ? 300 : 180 + ((r * 53) % 140), borderRadius: 6, background: r === 0 ? "#C8453B" : "#C9D5E3", opacity: r === 0 ? 0.85 : 1 }} />
                  </span>
                  {[1, 2, 3, 4].map((c) => (
                    <span key={c} style={{ flex: 1 }}>
                      <span style={{ display: "inline-block", height: 12, width: 34, borderRadius: 6, background: "#D6DFEA" }} />
                    </span>
                  ))}
                </div>
              ))}
              <div style={{ position: "absolute", left: 18, top: 128, ...tx(17, 800, "#7A2E27"), opacity: prog(t, a + 0.5, 0.3) }}>Isotrétinoïne 20 mg · capsules</div>
            </Card>
          </div>
        </Abs>
        {/* La bannière PharmaBoost qui se pose sur le logiciel */}
        <Abs x={1410} y={470}>
          <div style={{ transform: `translate(${(1 - snap) * 120}px, ${(1 - snap) * -40}px) scale(${0.6 + 0.4 * Math.min(1, snap)})`, opacity: Math.min(1, snap * 2) }}>
            <Card style={{ width: 520, padding: "20px 24px", borderRadius: 24, boxShadow: `0 40px 80px -40px rgba(15,43,38,.55), 0 0 0 3px ${rgba(MINT.green, 0.5)}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Cross size={22} />
                <span style={{ ...tx(16, 800, MINT.deep), letterSpacing: "0.16em" }}>PHARMABOOST</span>
              </div>
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14 }}>
                <DupeTile kind="iso-nettoyant" size={78} radius={18} />
                <div>
                  <div style={tx(24, 800)}>Routine isotrétinoïne</div>
                  <div style={tx(17, 600, MINT.soft)}>4 produits · en stock</div>
                </div>
              </div>
            </Card>
          </div>
        </Abs>
        {/* Le lien direct */}
        <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1920} height={1080}>
          <path d="M1250 610 C 1330 610, 1330 540, 1400 545" fill="none" stroke={MINT.green} strokeWidth={6} strokeLinecap="round" strokeDasharray="1" pathLength={1} strokeDashoffset={1 - link} opacity={0.9} />
        </svg>
        <Abs x={1410} y={700}>
          <Pill t={t} at={w("I5", "logiciel.") - 0.1} size={28}>
            <Plug size={30} color={MINT.green} /> Connecté à votre logiciel
          </Pill>
        </Abs>
        <Abs x={1410} y={800}>
          <Pill t={t} at={pb + 0.2} size={24}>
            <Check size={26} color={MINT.green} /> Même écran, mêmes gestes
          </Pill>
        </Abs>
      </>
    );
  }

  // ===================================================================================================================
  // « En une seconde, personne ne peut tout avoir en tête… PharmaBoost, lui, y pense pour vous. »
  // ===================================================================================================================
  function UneSeconde({ t }: { t: number }) {
    // Les deux questions du fondateur (5 nov. 2026), mot à mot sur la voix — puis le moteur : stock, dates courtes,
    // surstock, challenges laboratoires et marge entrent dans PharmaBoost, qui en sort le bon conseil et la routine.
    const words = M.I6.words;
    const split = words.findIndex((x) => /^combien/i.test(x.w));
    const q1 = words.slice(0, split);
    const q2 = words.slice(split);
    const KEY = /potentiel|conseil|opportunit|inaper/i;
    const q2At = VAT.I6 + q2[0].at - 0.1;
    const engine = VAT.I7;
    const qOut = prog(t, engine - 0.25, 0.35, IN_OUT);
    const lift = prog(t, q2At - 0.05, 0.45, SNAP);
    const sentence = (list: Word[], size: number) =>
      list.map((x, i) => {
        const k = prog(t, VAT.I6 + x.at - 0.06, 0.22, SNAP);
        const key = KEY.test(x.w);
        const hit = key ? pop(t, VAT.I6 + x.at - 0.04) : 1;
        return (
          <span key={i} style={{ display: "inline-block", marginRight: size * 0.26, opacity: 0.14 + 0.86 * k, transform: `translateY(${(1 - k) * 14}px) scale(${key ? 0.8 + 0.2 * Math.min(1.15, hit) : 1})`, color: key && k > 0.5 ? MINT.green : MINT.ink }}>
            {x.w}
          </span>
        );
      });
    const missed = Math.round(37 * prog(t, q2At, end("I6") - q2At, IN_OUT));
    // Le moteur
    const inputs = [
      { I: Boxes, l: "Stock", at: w("I7", "stock,") },
      { I: CalendarClock, l: "Dates courtes", at: w("I7", "dates") },
      { I: PackageOpen, l: "Surstock", at: w("I7", "surstock,") },
      { I: Trophy, l: "Challenges laboratoires", at: w("I7", "challenges") },
      { I: Coins, l: "Marge", at: w("I7", "marge…") },
    ];
    const absorb = w("I7", "en") - 0.2;
    const core = { x: 960, y: 540 };
    const coreIn = pop(t, engine + 0.05);
    const flash = prog(t, absorb + 0.55, 0.12, SNAP) * (1 - prog(t, absorb + 0.7, 0.5, IN_OUT));
    const spin = (t - engine) * (60 + 400 * prog(t, absorb, 0.6, IN_OUT) * (1 - prog(t, absorb + 1.4, 0.8)));
    const out = { bon: w("I7", "bon") - 0.1, routine: w("I7", "routine") - 0.1 };
    const card = prog(t, out.bon, 0.5, SNAP);
    const engineOut = prog(t, S_END - 0.35, 0.35, IN_OUT);
    return (
      <>
        {qOut < 1 && (
          <div style={{ position: "absolute", inset: 0, opacity: 1 - qOut, transform: `translateY(${-qOut * 40}px)` }}>
            <Abs x={960} y={420 - 140 * lift}>
              <div style={{ transform: `scale(${(1 - 0.22 * lift) * (0.92 + 0.08 * Math.min(1, pop(t, VAT.I6 - 0.1)))})`, opacity: (1 - 0.45 * lift) * Math.min(1, pop(t, VAT.I6 - 0.1) * 2) }}>
                <Card style={{ display: "flex", alignItems: "center", gap: 28, width: 1420, padding: "34px 44px", borderRadius: 34 }}>
                  <span style={{ display: "inline-flex", flexShrink: 0, width: 92, height: 92, borderRadius: 26, background: "#FCEBDD", alignItems: "center", justifyContent: "center", ...tx(62, 800), color: "#D9772A" }}>?</span>
                  <span style={{ ...tx(46, 800), lineHeight: 1.22 }}>{sentence(q1, 46)}</span>
                </Card>
              </div>
            </Abs>
            {t >= q2At && (
              <Abs x={960} y={640}>
                <div style={{ transform: `translateY(${(1 - Math.min(1, lift)) * 60}px) scale(${0.9 + 0.1 * Math.min(1, pop(t, q2At))})`, opacity: Math.min(1, lift * 2) }}>
                  <Card style={{ display: "flex", alignItems: "center", gap: 28, width: 1420, padding: "34px 44px", borderRadius: 34, boxShadow: `0 0 0 4px ${rgba("#D9772A", 0.35)}, 0 30px 60px -30px rgba(15,43,38,.5)` }}>
                    <span style={{ display: "inline-flex", flexShrink: 0, width: 92, height: 92, borderRadius: 26, background: "#D9772A", alignItems: "center", justifyContent: "center", ...tx(62, 800, "#FFFFFF") }}>?</span>
                    <span style={{ ...tx(46, 800), lineHeight: 1.22 }}>{sentence(q2, 46)}</span>
                  </Card>
                </div>
              </Abs>
            )}
            <Abs x={960} y={850}>
              <div style={{ opacity: prog(t, q2At + 0.3, 0.3), transform: `scale(${0.8 + 0.2 * Math.min(1, pop(t, q2At + 0.3))})`, display: "inline-flex", alignItems: "center", gap: 14, padding: "14px 26px", borderRadius: 999, background: "#FFFFFF", boxShadow: "0 18px 40px -22px rgba(15,43,38,.5)" }}>
                <span style={tx(26, 700, MINT.soft)}>Conseils passés inaperçus aujourd&apos;hui</span>
                <span style={{ ...tx(40, 800, "#D9772A"), fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "right" }}>{missed}</span>
              </div>
            </Abs>
          </div>
        )}
        {t >= engine - 0.05 && (
          <div style={{ position: "absolute", inset: 0, opacity: 1 - engineOut }}>
            <Title t={t} at={engine} out={w("I7", "seconde,") - 0.35} text="PharmaBoost *croise tout.*" y={110} size={66} />
            <Title t={t} at={w("I7", "seconde,") - 0.2} text="Le bon conseil, *en une seconde.*" y={110} size={66} />
            {/* Les fils : chaque donnée part vers PharmaBoost */}
            <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              {inputs.map((it, i) => {
                const y = 270 + i * 130;
                const draw = prog(t, it.at + 0.05, 0.35, IN_OUT) * (1 - prog(t, absorb + i * 0.06, 0.3));
                if (draw <= 0) return null;
                return <path key={it.l} d={`M640 ${y} C 780 ${y}, 800 ${core.y}, ${core.x - 130} ${core.y}`} fill="none" stroke={MINT.green} strokeWidth={5} strokeDasharray="12 12" strokeDashoffset={-t * 120} opacity={0.7 * draw} />;
              })}
            </svg>
            {inputs.map((it, i) => {
              const k = pop(t, it.at - 0.08);
              if (k <= 0) return null;
              const y0 = 270 + i * 130;
              const a = prog(t, absorb + i * 0.06, 0.4, IN_OUT);
              if (a >= 1) return null;
              return (
                <Abs key={it.l} x={420 + (core.x - 420) * a} y={y0 + (core.y - y0) * a}>
                  <div style={{ transform: `scale(${Math.min(1, k) * (1 - 0.7 * a)})`, opacity: 1 - a * a }}>
                    <Card style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px 14px 14px", width: 430, borderRadius: 22 }}>
                      <span style={{ display: "inline-flex", width: 56, height: 56, borderRadius: 16, background: MINT.bg, alignItems: "center", justifyContent: "center" }}>
                        <it.I size={30} color={MINT.green} />
                      </span>
                      <span style={tx(30, 800)}>{it.l}</span>
                    </Card>
                  </div>
                </Abs>
              );
            })}
            {/* Le cœur : PharmaBoost */}
            <Abs x={core.x} y={core.y}>
              <div style={{ position: "relative", width: 260, height: 260, transform: `scale(${Math.min(1.1, coreIn) * (1 + 0.12 * flash)})` }}>
                <svg width={260} height={260} viewBox="0 0 260 260" style={{ position: "absolute", inset: 0, transform: `rotate(${spin}deg)` }}>
                  <circle cx={130} cy={130} r={120} fill="none" stroke={rgba(MINT.green, 0.25)} strokeWidth={10} />
                  <circle cx={130} cy={130} r={120} fill="none" stroke={MINT.green} strokeWidth={10} strokeLinecap="round" strokeDasharray="90 60 30 60" />
                </svg>
                <div style={{ position: "absolute", inset: 28, borderRadius: 999, background: "#FFFFFF", boxShadow: `0 30px 60px -30px rgba(15,43,38,.55), 0 0 ${60 * flash}px ${rgba(MINT.green, 0.8 * flash)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Cross size={64} />
                  <span style={{ ...tx(20, 800, MINT.deep), letterSpacing: "0.12em" }}>PHARMABOOST</span>
                </div>
              </div>
            </Abs>
            <Ring t={t} at={absorb + 0.55} x={core.x} y={core.y} max={520} color={MINT.green} />
            {/* Ce qui en sort : le bon conseil, puis la routine complète */}
            {card > 0 && (
              <Abs x={core.x + (1500 - core.x) * card} y={core.y}>
                <div style={{ transform: `scale(${0.4 + 0.6 * card})`, opacity: Math.min(1, card * 2) }}>
                  <Card style={{ width: 500, padding: "24px 26px", borderRadius: 28, boxShadow: `0 0 0 4px ${rgba(MINT.green, 0.45)}, 0 40px 80px -40px rgba(15,43,38,.6)` }}>
                    <div style={{ ...tx(16, 800, MINT.green), letterSpacing: "0.12em" }}>LE BON CONSEIL</div>
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 16 }}>
                      <DupeTile kind="iso-nettoyant" size={80} radius={18} />
                      <span style={tx(27, 800)}>{DUPES["iso-nettoyant"].name}</span>
                    </div>
                    <div style={{ marginTop: 18, ...tx(16, 800, MINT.green), letterSpacing: "0.12em", opacity: prog(t, out.routine, 0.3) }}>+ LA ROUTINE COMPLÈTE</div>
                    <div style={{ marginTop: 10, display: "flex", gap: 14 }}>
                      {ROUTINE.slice(1).map((r, i) => {
                        const k = pop(t, out.routine + 0.1 + i * 0.12);
                        return (
                          <div key={r.k} style={{ transform: `scale(${k})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <DupeTile kind={r.k} size={70} radius={16} />
                            <span style={tx(15, 700, MINT.soft)}>{r.gest}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              </Abs>
            )}
          </div>
        )}
      </>
    );
  }

  // ===================================================================================================================
  // « Et pas seulement pour l'acné : antibiotiques, allergies, douleurs… à chaque ordonnance, des conseils passent à la
  // trappe. » — devant la carte de France : trois autres ordonnances, leur conseil oublié, puis la trappe s'ouvre.
  // ===================================================================================================================
  function Trappe({ t }: { t: number }) {
    const from = w("I2", "et") - 0.15;
    const trap = w("I2", "trappe.") - 0.25;
    if (t < from || t > end("I2") + 0.6) return null;
    const veil = prog(t, from, 0.35) * (1 - prog(t, end("I2") + 0.1, 0.4));
    const cases = [
      { I: PillIcon, l: "Antibiotiques", miss: "Probiotique oublié", at: w("I2", "antibiotiques,") },
      { I: Flower2, l: "Allergies", miss: "Lavage nasal oublié", at: w("I2", "allergies,") },
      { I: Zap, l: "Douleurs", miss: "Patch chauffant oublié", at: w("I2", "douleurs…") },
    ];
    const xs = w("I2", "ordonnance,") - 0.1;
    return (
      <>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${rgba(MINT.paper, 0.2)} 0%, ${rgba(MINT.paper, 0.85)} 60%)`, opacity: veil }} />
        <Abs x={960} y={150}>
          <div style={{ opacity: prog(t, from + 0.1, 0.35) * (1 - prog(t, trap + 0.4, 0.3)), ...tx(56, 800), whiteSpace: "nowrap" }}>
            Et pas seulement <span style={{ color: MINT.green }}>pour l&apos;acné.</span>
          </div>
        </Abs>
        {cases.map((c, i) => {
          const k = pop(t, c.at - 0.1);
          if (k <= 0) return null;
          const cross = pop(t, xs + i * 0.1);
          const fall = prog(t, trap + i * 0.07, 0.55, (x) => x * x);
          return (
            <Abs key={c.l} x={520 + i * 440} y={620 + fall * 700}>
              <div style={{ transform: `scale(${Math.min(1, k)}) rotate(${fall * (i - 1) * 25}deg)`, opacity: 1 - fall * 0.6 }}>
                <Card style={{ width: 380, padding: "26px 28px", borderRadius: 28, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ display: "inline-flex", width: 60, height: 60, borderRadius: 18, background: MINT.bg, alignItems: "center", justifyContent: "center" }}>
                      <c.I size={32} color={MINT.green} />
                    </span>
                    <span style={tx(32, 800)}>{c.l}</span>
                  </div>
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, background: "#FDF0EE" }}>
                    <span style={{ display: "inline-flex", width: 30, height: 30, borderRadius: 99, background: "#D9534A", alignItems: "center", justifyContent: "center", transform: `scale(${Math.min(1.2, cross)})` }}>
                      <X size={20} color="#FFFFFF" strokeWidth={3} />
                    </span>
                    <span style={tx(22, 700, "#B23B33")}>{c.miss}</span>
                  </div>
                </Card>
              </div>
            </Abs>
          );
        })}
        {/* La trappe : une fente sombre qui s'ouvre sous les cartes */}
        <Abs x={960} y={900}>
          <div style={{ width: 1500 * prog(t, trap - 0.2, 0.3, SNAP) * (1 - prog(t, end("I2") + 0.1, 0.3)), height: 26, borderRadius: 99, background: "radial-gradient(ellipse at 50% 50%, #0F2B26 30%, rgba(15,43,38,0) 75%)", opacity: 0.85 }} />
        </Abs>
      </>
    );
  }

  // ===================================================================================================================
  // La barre de chargement (fondateur, 5 nov. 2026) : entre « scannée » et « le bon conseil », on VOIT l'ordonnance
  // s'analyser, vite, et l'on sait quand le conseil arrive.
  // ===================================================================================================================
  function Chargement({ t }: { t: number }) {
    const a = w("I8", "scannée,") + 0.05;
    const b = w("I8", "bon") - 0.08;
    if (t < a - 0.1 || t > b + 0.9) return null;
    const p = prog(t, a, b - a, (x) => 1 - Math.pow(1 - x, 2.2));
    const done = t >= b;
    const inK = prog(t, a - 0.1, 0.25, SNAP);
    const outK = prog(t, b + 0.45, 0.4, IN_OUT);
    const ok = pop(t, b);
    return (
      <Abs x={1240} y={300 - outK * 30}>
        <div style={{ opacity: inK * (1 - outK), transform: `scale(${0.9 + 0.1 * inK})` }}>
          <Card style={{ width: 620, padding: "20px 26px", borderRadius: 24, boxShadow: `0 30px 60px -30px rgba(15,43,38,.55)${done ? `, 0 0 0 ${4 * Math.min(1, ok)}px ${rgba(MINT.green, 0.5)}` : ""}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {done ? (
                <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 99, background: MINT.green, alignItems: "center", justifyContent: "center", transform: `scale(${Math.min(1.2, ok)})` }}>
                  <Check size={22} color="#FFFFFF" strokeWidth={3} />
                </span>
              ) : (
                <Cross size={28} />
              )}
              <span style={tx(26, 800, done ? MINT.deep : MINT.ink)}>{done ? "Conseil prêt" : "Analyse de l'ordonnance…"}</span>
              <span style={{ marginLeft: "auto", ...tx(24, 800, MINT.green), fontVariantNumeric: "tabular-nums" }}>{Math.round(p * 100)} %</span>
            </div>
            <div style={{ marginTop: 14, height: 14, borderRadius: 99, background: "#E3ECE8", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p * 100}%`, borderRadius: 99, background: `linear-gradient(90deg, ${MINT.green}, #2BD67B)`, boxShadow: `0 0 16px ${rgba(MINT.green, 0.6)}` }} />
            </div>
          </Card>
        </div>
      </Abs>
    );
  }

  // ===================================================================================================================
  // Pendant que la pharmacienne parle : le conseil (la crème lavante), puis la routine, chacun sur son mot.
  // ===================================================================================================================
  function ConseilPuisRoutine({ t }: { t: number }) {
    const a = w("C1", "crème") - 0.15;
    const r = w("C1", "routine") - 0.1;
    if (t < a - 0.1 || t > end("C1") + 0.8) return null;
    const outK = prog(t, end("C1") + 0.2, 0.4, IN_OUT);
    const items = [
      { k: ROUTINE[1].k, at: w("C1", "hydratant,") },
      { k: ROUTINE[2].k, at: w("C1", "baume") },
      { k: ROUTINE[3].k, at: w("C1", "solaire.") },
    ];
    return (
      <Abs x={1330} y={110 - outK * 30}>
        <div style={{ opacity: 1 - outK, display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ transform: `scale(${Math.min(1, pop(t, a))})` }}>
            <Card style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 22px 12px 12px", borderRadius: 22 }}>
              <DupeTile kind="iso-nettoyant" size={64} radius={14} />
              <div>
                <div style={{ ...tx(13, 800, MINT.green), letterSpacing: "0.12em" }}>LE CONSEIL</div>
                <div style={{ ...tx(22, 800), whiteSpace: "nowrap" }}>Crème lavante apaisante</div>
              </div>
            </Card>
          </div>
          {t >= r && (
            <>
              <span style={{ ...tx(40, 800, MINT.green), transform: `scale(${Math.min(1, pop(t, r))})` }}>+</span>
              <div style={{ transform: `scale(${Math.min(1, pop(t, r))})` }}>
                <Card style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderRadius: 22 }}>
                  <div style={{ ...tx(13, 800, MINT.green), letterSpacing: "0.12em", width: 92, lineHeight: 1.2 }}>LA ROUTINE</div>
                  {items.map((it) => (
                    <div key={it.k} style={{ transform: `scale(${Math.min(1, pop(t, it.at - 0.08))})` }}>
                      <DupeTile kind={it.k} size={58} radius={13} />
                    </div>
                  ))}
                </Card>
              </div>
            </>
          )}
        </div>
      </Abs>
    );
  }

  // ===================================================================================================================
  // Les quatre produits en grand, chacun sur son mot (« un nettoyant doux, un soin hydratant, un baume à lèvres, une
  // protection solaire »), au-dessus de la bannière qui les nomme.
  // ===================================================================================================================
  function Vitrine({ t }: { t: number }) {
    const words = ["lavante", "hydratant,", "baume", "solaire"];
    const out = prog(t, end("I8") + 0.5, 0.45, IN_OUT);
    if (t < w("I8", "lavante") - 0.2 || out >= 1) return null;
    return (
      <Abs x={960} y={800}>
        <div style={{ display: "flex", gap: 34, opacity: 1 - out, transform: `translateY(${out * 40}px)` }}>
          {ROUTINE.map((r, i) => {
            const k = pop(t, w("I8", words[i]) - 0.08);
            const d = DUPES[r.k];
            return (
              <div key={r.k} style={{ transform: `translateY(${(1 - Math.min(1, k)) * 50}px) scale(${0.6 + 0.4 * k})`, opacity: Math.min(1, k * 2) }}>
                <Card style={{ width: 300, height: 300, borderRadius: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "0 0 22px", background: `linear-gradient(170deg, #FFFFFF 30%, ${d.tile[1]})` }}>
                  <Dupe kind={r.k} h={200} />
                  <span style={{ marginTop: 10, ...tx(24, 800) }}>{d.short}</span>
                </Card>
              </div>
            );
          })}
        </div>
      </Abs>
    );
  }

  // ===================================================================================================================
  // « Et un clic sur le conseil : sa fiche complète, contre-indications comprises. »
  // ===================================================================================================================
  function Fiche({ t }: { t: number }) {
    const a = VAT.I10;
    const click = w("I10", "clic") + 0.15;
    const open = prog(t, click + 0.1, 0.6, SNAP);
    const ci = w("I10", "contre-indications");
    const glow = prog(t, ci - 0.1, 0.3, SNAP);
    const cursor = prog(t, a, 0.9, IN_OUT);
    const d = DUPES["iso-solaire"];
    const sections = [
      { t: "Indication", v: "Protéger la peau, rendue très sensible au soleil par le traitement.", at: w("I10", "fiche") },
      { t: "Conseils d'utilisation", v: "Chaque matin sur le visage ; renouveler toutes les 2 heures dehors.", at: w("I10", "complète,") },
      { t: "Précautions et contre-indications", v: "Allergie connue à l'un des composants. Ne pas appliquer sur une peau lésée.", at: ci, alert: true },
    ];
    return (
      <>
        <Title t={t} at={a} text="Un clic : *la fiche complète.*" y={110} size={68} />
        {/* La ligne du conseil, sur la bannière */}
        <Abs x={520} y={430}>
          <div style={{ transform: `scale(${pop(t, a - 0.1)})` }}>
            <Card style={{ width: 600, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, borderRadius: 22, boxShadow: t > click ? `0 0 0 4px ${rgba(MINT.green, 0.55)}, 0 30px 60px -30px rgba(15,43,38,.5)` : undefined }}>
              <DupeTile kind="iso-solaire" size={86} radius={18} />
              <div style={{ flex: 1 }}>
                <div style={tx(15, 800, MINT.soft)}>POUR ISOTRÉTINOÏNE 20 MG</div>
                <div style={tx(27, 800)}>{d.name}</div>
                <div style={{ marginTop: 6, display: "inline-block", padding: "4px 12px", borderRadius: 99, background: "#E3F4EC", ...tx(15, 700, MINT.deep) }}>8 en stock</div>
              </div>
            </Card>
          </div>
        </Abs>
        <Abs x={360 + 400 * cursor} y={620 - 170 * cursor}>
          <MousePointer2 size={52} fill="#0F2B26" color="#FFFFFF" strokeWidth={1.5} style={{ transform: `scale(${t > click && t < click + 0.15 ? 0.85 : 1})`, opacity: 1 - prog(t, click + 0.6, 0.3) }} />
        </Abs>
        {/* La fiche */}
        <Abs x={1290} y={600}>
          <div style={{ transform: `translateX(${(1 - open) * 120}px) scale(${0.92 + 0.08 * open})`, opacity: open }}>
            <Card style={{ width: 800, padding: 34, borderRadius: 30 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
                <span style={{ display: "inline-flex", width: 150, height: 170, borderRadius: 22, background: `linear-gradient(160deg, ${d.tile[0]}, ${d.tile[1]})`, alignItems: "center", justifyContent: "center" }}>
                  <Dupe kind="iso-solaire" h={150} />
                </span>
                <div>
                  <div style={tx(16, 800, MINT.green)}>FICHE DU PRODUIT</div>
                  <div style={tx(34, 800)}>{d.name}</div>
                  <div style={{ marginTop: 6, ...tx(19, 600, MINT.soft) }}>Visage · peaux sensibles</div>
                </div>
              </div>
              {sections.map((s) => {
                const k = prog(t, s.at - 0.1, 0.35, SNAP);
                return (
                  <div key={s.t} style={{ marginTop: 18, padding: "14px 18px", borderRadius: 16, background: s.alert ? rgba("#E0884A", 0.08 + 0.1 * glow) : "#F4F8F6", borderLeft: `5px solid ${s.alert ? "#E0884A" : MINT.green}`, opacity: k, transform: `translateY(${(1 - k) * 16}px)`, boxShadow: s.alert && glow > 0 ? `0 0 0 ${3 * glow}px ${rgba("#E0884A", 0.45)}` : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, ...tx(15, 800, s.alert ? "#B5531C" : MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {s.alert && <ShieldAlert size={18} />} {s.t}
                    </div>
                    <div style={{ marginTop: 4, ...tx(21, 600) }}>{s.v}</div>
                  </div>
                );
              })}
            </Card>
          </div>
        </Abs>
      </>
    );
  }

  // ===================================================================================================================
  // Après le comptoir : l'e-mail, puis l'application
  // ===================================================================================================================
  const pulseOn = (t: number, at: number) => prog(t, at - 0.1, 0.25, SNAP) * (1 - prog(t, at + 1.1, 0.4, IN_OUT));
  function AppIso({ t, at }: { t: number; at: number }) {
    const lit = { conseils: pulseOn(t, w("I13", "conseils,")), routine: pulseOn(t, w("I13", "routine,")), rappel: pulseOn(t, w("I13", "rappel")) };
    const box = (k: number): CSSProperties => ({ marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 12, boxShadow: k > 0.01 ? `0 0 0 ${3 * k}px ${rgba(MINT.green, 0.6)}, 0 10px 24px -14px rgba(0,0,0,.3)` : "0 0 0 1px #E4ECE9", transform: `scale(${1 + 0.03 * k})` });
    const st = (i: number): CSSProperties => ({ opacity: prog(t, at + 0.1 * i, 0.35), transform: `translateY(${(1 - prog(t, at + 0.1 * i, 0.35, SNAP)) * 16}px)` });
    const ring = prog(t, w("I13", "rappel") - 0.1, 1.2, IN_OUT);
    return (
      <div style={{ position: "absolute", inset: 0, background: "#EEF3F1", padding: "56px 14px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...st(0) }}>
          <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 10, background: PB.green, alignItems: "center", justifyContent: "center" }}>
            <Cross size={18} color={PB.citron} />
          </span>
          <span style={tx(16, 800, "#101828")}>PharmaBoost</span>
          <span style={{ marginLeft: "auto", ...tx(12, 600, "#64748B") }}>Pharmacie du Centre</span>
        </div>
        <div style={{ marginTop: 14, ...tx(24, 800, "#0B3B47"), ...st(1) }}>Mon bilan</div>
        <div style={st(2)}>
          <div style={box(lit.conseils)}>
            <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Mes conseils</div>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {ROUTINE.map((r) => (
                <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <DupeTile kind={r.k} size={34} radius={9} />
                  <span style={{ lineHeight: 1.1, ...tx(11, 700, "#101828") }}>{DUPES[r.k].short}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={st(3)}>
          <div style={box(lit.routine)}>
            <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Ma routine isotrétinoïne</div>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {ROUTINE.map(({ Icon, gest }) => (
                <span key={gest} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", borderRadius: 10, background: "#EAF5EF", ...tx(12.5, 700, MINT.deep) }}>
                  <Icon size={14} /> {gest}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={st(4)}>
          <div style={{ ...box(lit.rappel), display: "flex", alignItems: "center", gap: 12 }}>
            <svg width={52} height={52} viewBox="0 0 56 56">
              <circle cx={28} cy={28} r={23} fill="none" stroke="#E3ECE8" strokeWidth={7} />
              <circle cx={28} cy={28} r={23} fill="none" stroke={MINT.green} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - 0.77 * ring} transform="rotate(-90 28 28)" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Rappel</div>
              <div style={tx(14, 800, "#101828")}>Fin de cure dans 7 jours</div>
            </div>
            <Bell size={22} color={MINT.green} style={{ transform: `rotate(${lit.rappel > 0 ? Math.sin(t * 30) * 14 * lit.rappel : 0}deg)` }} />
          </div>
        </div>
      </div>
    );
  }

  function Bilan({ t }: { t: number }) {
    // Le bilan par QR code (fondateur, 5 nov. 2026) : le QR code sur la bannière du comptoir, le téléphone du patient le scanne,
    // le bilan s'ouvre et se garde dans l'appli ; puis « aucune donnée de santé n'est gardée ».
    const qrIn = prog(t, VAT.I12 - 0.2, 0.6, SNAP);
    const scan = w("I12", "scanne");
    const opens = w("I12", "s'ouvre") - 0.15;
    const appAt = w("I13", "l'application") - 0.25;
    const camera = prog(t, scan - 0.2, 0.4, SNAP) * (1 - prog(t, opens, 0.35));
    const beam = ((t - scan) % 1.2) / 1.2;
    const opened = prog(t, opens, 0.5, SNAP);
    const safe = prog(t, VAT.I16 - 0.1, 0.6, SNAP);
    return (
      <>
        <Title t={t} at={VAT.I12} out={appAt - 0.3} text="Son bilan conseil, *par QR code.*" y={110} size={64} />
        <Title t={t} at={appAt - 0.1} out={VAT.I16 - 0.3} text="Gardé dans *l'application PharmaBoost.*" y={110} size={64} />
        <Title t={t} at={VAT.I16 - 0.1} text="Aucune donnée de santé *chez nous.*" y={110} size={64} />
        {/* La bannière du comptoir et son QR code */}
        <Abs x={600} y={600}>
          <div style={{ opacity: qrIn, transform: `scale(${0.9 + 0.1 * qrIn})` }}>
            <Card style={{ width: 430, padding: "30px 30px 26px", borderRadius: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <span style={tx(28, 800)}>Le bilan du patient</span>
              <QrArt size={260} />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, ...tx(22, 700, MINT.soft) }}>
                <QrCode size={24} color={MINT.green} /> Scannez avec votre téléphone
              </span>
            </Card>
          </div>
        </Abs>
        <Phone t={t} x={1280} y={620} scale={0.98 * (0.9 + 0.1 * qrIn)} tilt={-8} style={{ opacity: qrIn }}>
          <div style={{ position: "absolute", inset: 0 }}>
            {camera > 0.01 && (
              <div style={{ position: "absolute", inset: 0, background: "#0B1714", opacity: camera, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "relative", width: 230, height: 230, borderRadius: 24, border: `4px solid ${MINT.green}` }}>
                  <div style={{ position: "absolute", inset: 18, opacity: 0.9 }}>
                    <QrArt size={186} light />
                  </div>
                  <div style={{ position: "absolute", left: 10, right: 10, top: `${10 + beam * 200}px`, height: 4, borderRadius: 4, background: MINT.green, boxShadow: `0 0 18px ${MINT.green}` }} />
                </div>
              </div>
            )}
            {opened > 0.01 && (
              <div style={{ position: "absolute", inset: 0, opacity: opened }}>
                <AppIso t={t} at={opens} />
              </div>
            )}
          </div>
        </Phone>
        <Abs x={600} y={880}>
          <div style={{ opacity: safe, transform: `translateY(${(1 - safe) * 30}px)` }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "16px 28px", borderRadius: 999, background: "#FFFFFF", boxShadow: "0 18px 40px -22px rgba(15,43,38,.5)", ...tx(28, 800) }}>
              <ShieldCheck size={32} color={MINT.green} /> Tout reste sur le téléphone du patient <Lock size={26} color={MINT.green} />
            </span>
          </div>
        </Abs>
      </>
    );
  }

  /** Un QR code dessiné (illustration) : trois repères et un motif fixe, jamais un vrai lien. */
  function QrArt({ size, light = false }: { size: number; light?: boolean }) {
    const n = 25;
    const cell = size / n;
    const ink = light ? "#FFFFFF" : MINT.deep;
    const finder = (fx: number, fy: number) => (
      <g key={`${fx}-${fy}`}>
        <rect x={fx * cell} y={fy * cell} width={7 * cell} height={7 * cell} fill={ink} />
        <rect x={(fx + 1) * cell} y={(fy + 1) * cell} width={5 * cell} height={5 * cell} fill={light ? "#0B1714" : "#FFFFFF"} />
        <rect x={(fx + 2) * cell} y={(fy + 2) * cell} width={3 * cell} height={3 * cell} fill={ink} />
      </g>
    );
    const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
    const cells: ReactNode[] = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (inFinder(x, y)) continue;
        const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        if (v - Math.floor(v) > 0.52) cells.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell + 0.4} height={cell + 0.4} fill={ink} />);
      }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
        {cells}
        {finder(0, 0)}
        {finder(n - 7, 0)}
        {finder(0, n - 7)}
      </svg>
    );
  }

  // ===================================================================================================================
  // « Vous lancez une campagne avec un laboratoire, une remise ? Toute votre patientèle reçoit la notification… et revient
  // chez vous, plutôt qu'ailleurs. »
  // ===================================================================================================================
  function Campagne({ t }: { t: number }) {
    // « Et cette application ne sert pas qu'au patient : c'est aussi le lien direct entre votre pharmacie et toute votre
    // patientèle. » Le téléphone du bilan reste à sa place : la pharmacie se relie à lui, puis à tous les patients.
    // « Vous lancez une campagne d'offres avec un laboratoire ? Vos patients reçoivent la notification… et viennent en
    // profiter chez vous, plutôt qu'ailleurs. »
    const lien = w("I14", "lien");
    const toute = w("I14", "toute");
    const vous = w("I14", "vous") - 0.35;
    const lance = w("I14", "lancez");
    const offres = w("I14", "d'offres");
    const labo = w("I14", "laboratoire");
    const click = labo + 0.85;
    const patients = w("I14", "patients");
    const notif = w("I14", "notification…");
    const viennent = w("I14", "viennent");
    const p1 = 1 - prog(t, vous, 0.4, IN_OUT);
    const link = prog(t, lien - 0.1, 0.6, IN_OUT);
    const crowd = prog(t, patients - 0.3, 0.4) * (1 - prog(t, viennent - 0.5, 0.45, IN_OUT));
    const shops = prog(t, viennent - 0.45, 0.6, SNAP);
    const lit = prog(t, viennent - 0.1, 0.4, SNAP);
    const minis = [
      [-250, -260], [250, -250], [-330, 40], [330, 60], [-230, 300], [240, 300],
    ];
    return (
      <>
        <Title t={t} at={VAT.I14} out={vous - 0.1} text="L'application, *le lien avec vos patients.*" y={110} size={62} />
        <Title t={t} at={lance - 0.1} out={viennent - 0.75} text="Vos offres laboratoire, *sur leur téléphone.*" y={110} size={62} />
        <Title t={t} at={viennent - 0.1} text="Ils viennent *chez vous.*" y={110} size={70} />
        {/* 1. La pharmacie, le téléphone du patient, et le lien direct */}
        {p1 > 0 && (
          <div style={{ position: "absolute", inset: 0, opacity: p1 }}>
            <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              <path d="M770 600 C 950 520, 1050 540, 1150 600" fill="none" stroke={MINT.green} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - link} />
              {link >= 1 && <path d="M770 600 C 950 520, 1050 540, 1150 600" fill="none" stroke="#FFFFFF" strokeWidth={4} strokeDasharray="10 22" strokeDashoffset={-t * 140} />}
              {minis.map(([dx, dy], i) => {
                const k = prog(t, toute + i * 0.07, 0.4, IN_OUT);
                return k > 0 ? <path key={i} d={`M770 600 Q ${960 + dx * 0.3} ${600 + dy * 0.6}, ${1280 + dx} ${620 + dy}`} fill="none" stroke={rgba(MINT.green, 0.6)} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k} /> : null;
              })}
            </svg>
            <Abs x={560} y={600}>
              <div style={{ transform: `scale(${Math.min(1, pop(t, VAT.I14 - 0.2))})` }}>
                <Card style={{ width: 380, padding: "30px 28px", borderRadius: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                  <span style={{ display: "inline-flex", width: 96, height: 96, borderRadius: 28, background: PB.green, alignItems: "center", justifyContent: "center" }}>
                    <Store size={54} color={PB.citron} />
                  </span>
                  <span style={tx(30, 800)}>Votre pharmacie</span>
                </Card>
              </div>
            </Abs>
            <Abs x={960} y={545}>
              <div style={{ opacity: prog(t, lien, 0.3), transform: `scale(${Math.min(1, pop(t, lien))})`, display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 20px", borderRadius: 999, background: "#FFFFFF", boxShadow: "0 14px 30px -18px rgba(15,43,38,.5)", ...tx(24, 800, MINT.deep) }}>
                <Link2 size={26} color={MINT.green} /> Lien direct
              </div>
            </Abs>
            {minis.map(([dx, dy], i) => {
              const k = pop(t, toute + 0.25 + i * 0.07);
              return k > 0 ? (
                <Abs key={i} x={1280 + dx} y={620 + dy}>
                  <div style={{ transform: `scale(${Math.min(1, k) * 0.9})`, width: 74, height: 130, borderRadius: 18, background: "#FFFFFF", border: `4px solid ${MINT.ink}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 24px -14px rgba(0,0,0,.4)" }}>
                    <Cross size={26} />
                  </div>
                </Abs>
              ) : null;
            })}
            <Phone t={t} x={1280} y={620} scale={0.98} tilt={-8}>
              <div style={{ position: "absolute", inset: 0 }}>
                <AppIso t={t} at={-10} />
              </div>
            </Phone>
          </div>
        )}
        {/* 2. La campagne d'offres avec un laboratoire */}
        {t >= lance - 0.4 && (
          <Abs x={500} y={590}>
            <div style={{ transform: `scale(${pop(t, lance - 0.3) * 0.92})` }}>
              <Card style={{ width: 640, padding: 34 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ display: "inline-flex", width: 56, height: 56, borderRadius: 16, background: MINT.bg, alignItems: "center", justifyContent: "center" }}>
                    <Megaphone size={30} color={MINT.green} />
                  </span>
                  <span style={tx(34, 800)}>Campagne d&apos;offres</span>
                  <span style={{ marginLeft: "auto" }}>
                    <Example />
                  </span>
                </div>
                {[
                  { l: "Laboratoire", v: "Laboratoire partenaire", at: labo - 0.1 },
                  { l: "Gamme", v: "Soins solaires", at: offres },
                  { l: "Offre", v: "−20 % en pharmacie", at: labo + 0.3 },
                ].map((f) => (
                  <div key={f.l} style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRadius: 14, background: "#F4F8F6", opacity: prog(t, f.at, 0.3) }}>
                    <span style={tx(24, 600, MINT.soft)}>{f.l}</span>
                    <span style={tx(26, 800)}>{f.v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                  <span style={{ padding: "16px 34px", borderRadius: 999, background: t > click ? MINT.deep : MINT.green, ...tx(28, 800, "#FFFFFF"), transform: `scale(${t > click && t < click + 0.15 ? 0.94 : 1})` }}>{t > click + 0.1 ? "✓ Campagne lancée" : "Lancer la campagne"}</span>
                </div>
              </Card>
            </div>
          </Abs>
        )}
        {/* Les patients reçoivent la notification */}
        {crowd > 0 && (
          <div style={{ position: "absolute", inset: 0, opacity: crowd }}>
            {Array.from({ length: 15 }, (_, i) => {
              const col = i % 5;
              const row = Math.floor(i / 5);
              const k = pop(t, patients - 0.2 + 0.04 * i);
              const ping = prog(t, notif - 0.3 + 0.04 * i, 0.2, SNAP);
              const ripple = prog(t, notif - 0.3 + 0.04 * i, 0.9);
              const x = 1110 + col * 170;
              const y = 380 + row * 210;
              return (
                <div key={i} style={{ position: "absolute", left: x - 50, top: y - 50, width: 100, height: 140, transform: `scale(${k})` }}>
                  {ripple > 0 && ripple < 1 && <div style={{ position: "absolute", left: 50 - 70 * ripple, top: 30 - 70 * ripple, width: 140 * ripple, height: 140 * ripple, borderRadius: 999, border: `3px solid ${rgba(MINT.green, 1 - ripple)}` }} />}
                  <div style={{ width: 54, height: 54, borderRadius: 99, background: PASSANTS[i % PASSANTS.length], margin: "0 auto" }} />
                  <div style={{ width: 84, height: 66, borderRadius: "40px 40px 10px 10px", background: PASSANTS[i % PASSANTS.length], filter: "brightness(.9)", margin: "6px auto 0" }} />
                  <div style={{ position: "absolute", right: 0, top: -6, width: 40, height: 40, borderRadius: 12, background: MINT.green, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${ping})`, boxShadow: "0 8px 16px -8px rgba(0,0,0,.4)" }}>
                    <Bell size={22} color="#FFFFFF" />
                  </div>
                </div>
              );
            })}
            <Abs x={1450} y={960}>
              <Pill t={t} at={notif} size={26}>
                <Bell size={28} color={MINT.green} /> « −20 % chez votre pharmacie »
              </Pill>
            </Abs>
          </div>
        )}
        {/* … et ils viennent en profiter chez vous, plutôt qu'ailleurs */}
        {shops > 0 && (
          <div style={{ position: "absolute", left: 1000, top: 170, width: 1100, height: 900, opacity: shops, transform: `scale(${0.56}) translateY(${(1 - shops) * 60}px)`, transformOrigin: "0 0" }}>
            <div style={{ position: "absolute", left: 0, right: -400, top: 890, height: 12, background: MINT.ink, opacity: 0.85 }} />
            <Shop x={360} lit={lit} t={t} />
            <Shop x={1180} lit={0} t={t} />
            {PASSANTS.map((c, i) => {
              const s0 = viennent - 0.2 + i * 0.25;
              const k = prog(t, s0, 1.5, IN_OUT);
              if (t < s0 || k >= 1) return null;
              return (
                <div key={i} style={{ position: "absolute", left: 860 - 420 * k, top: 720 - Math.abs(Math.sin(k * 14)) * 8, opacity: Math.min(1, k * 6) * (1 - prog(t, s0 + 1.3, 0.2)) }}>
                  <div style={{ width: 44, height: 44, borderRadius: 99, background: c, margin: "0 auto" }} />
                  <div style={{ width: 66, height: 112, borderRadius: "33px 33px 10px 10px", background: c, filter: "brightness(.9)", marginTop: 5 }} />
                </div>
              );
            })}
          </div>
        )}
        {shops > 0 && (
          <Abs x={1450} y={960}>
            <Pill t={t} at={w("I14", "plutôt")} size={26}>
              <Repeat size={28} color={MINT.green} /> Chez vous, plutôt qu&apos;ailleurs
            </Pill>
          </Abs>
        )}
      </>
    );
  }

  // ===================================================================================================================
  // « Et le titulaire suit son équipe : conseils vendus, chiffre d'affaires et marge de chacun, le classement, et où
  // chacun en est dans les challenges. »
  // ===================================================================================================================
  function Equipe({ t }: { t: number }) {
    const a = VAT.I15;
    const cols = [
      { k: "conseils", l: "Conseils vendus", at: w("I15", "conseils") },
      { k: "ca", l: "Chiffre d'affaires", at: w("I15", "chiffre") },
      { k: "marge", l: "Marge", at: w("I15", "marge") },
    ];
    const rankAt = w("I15", "classement,");
    const chalAt = w("I15", "challenges.") - 0.6;
    const people = [
      { n: "Claire", c: 42, ca: "1 260 €", m: "512 €", ch: 0.86, col: "#F0BAC6" },
      { n: "Hugo", c: 35, ca: "1 040 €", m: "418 €", ch: 0.7, col: "#9CC7F0" },
      { n: "Léa", c: 28, ca: "830 €", m: "331 €", ch: 0.55, col: "#F6D98A" },
      { n: "Yanis", c: 19, ca: "560 €", m: "224 €", ch: 0.38, col: "#C9B8F0" },
    ];
    const colLit = (at: number) => prog(t, at - 0.1, 0.25, SNAP) * (1 - prog(t, at + 1.2, 0.4, IN_OUT));
    return (
      <>
        <Title t={t} at={a} text="Le titulaire *suit son équipe.*" y={110} size={68} />
        <Abs x={960} y={600}>
          <div style={{ transform: `scale(${0.94 + 0.06 * prog(t, a, 0.6, SNAP)})`, opacity: prog(t, a, 0.4) }}>
            <Card style={{ width: 1500, padding: "30px 40px", borderRadius: 30 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={tx(32, 800)}>Mon équipe · ce mois-ci</span>
                <span style={{ marginLeft: "auto" }}>
                  <Example />
                </span>
              </div>
              <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "90px 1.4fr 1fr 1fr 1fr 1.5fr", gap: 0, alignItems: "center", padding: "0 10px", ...tx(18, 800, MINT.soft) }}>
                <span>Rang</span>
                <span>Pharmacien / préparateur</span>
                {cols.map((c) => (
                  <span key={c.k} style={{ color: colLit(c.at) > 0.3 ? MINT.green : undefined }}>{c.l}</span>
                ))}
                <span style={{ color: colLit(chalAt) > 0.3 ? MINT.green : undefined }}>Challenge en cours</span>
              </div>
              {people.map((p, i) => {
                const k = prog(t, a + 0.3 + i * 0.12, 0.4, SNAP);
                const medal = pop(t, rankAt + i * 0.1);
                const fill = prog(t, chalAt + i * 0.1, 1.1, IN_OUT);
                const cell = (at: number, v: string | number) => {
                  const lit = colLit(at);
                  return <span style={{ ...tx(28, 800), padding: "8px 12px", marginLeft: -12, borderRadius: 12, background: rgba(MINT.green, 0.12 * lit), color: lit > 0.3 ? MINT.deep : MINT.ink }}>{v}</span>;
                };
                return (
                  <div key={p.n} style={{ marginTop: 12, display: "grid", gridTemplateColumns: "90px 1.4fr 1fr 1fr 1fr 1.5fr", alignItems: "center", padding: "14px 10px", borderRadius: 18, background: i === 0 ? "#F4FBF7" : "#FAFCFB", opacity: k, transform: `translateY(${(1 - k) * 20}px)` }}>
                    <span style={{ display: "inline-flex", width: 52, height: 52, borderRadius: 99, alignItems: "center", justifyContent: "center", background: i === 0 ? "#FFE8A3" : i === 1 ? "#E6ECEA" : i === 2 ? "#FBD9C2" : "#EEF2F1", ...tx(24, 800), transform: `scale(${0.7 + 0.3 * Math.min(1, medal)})` }}>{i + 1}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ width: 46, height: 46, borderRadius: 99, background: p.col }} />
                      <span style={tx(28, 800)}>{p.n}</span>
                    </span>
                    {cell(cols[0].at, p.c)}
                    {cell(cols[1].at, p.ca)}
                    {cell(cols[2].at, p.m)}
                    <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ flex: 1, height: 14, borderRadius: 99, background: "#E3ECE8", overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: `${p.ch * 100 * fill}%`, borderRadius: 99, background: `linear-gradient(90deg, ${MINT.green}, #2BD67B)` }} />
                      </span>
                      <span style={{ ...tx(20, 800, MINT.soft), width: 60 }}>{Math.round(p.ch * 100 * fill)} %</span>
                    </span>
                  </div>
                );
              })}
            </Card>
          </div>
        </Abs>
      </>
    );
  }

  // ===================================================================================================================
  // La signature
  // ===================================================================================================================
  function Fin({ t }: { t: number }) {
    const pb = VAT.N12;
    const merci = VAT.D5;
    const finalIn = t >= FINAL_HIT - 0.05;
    const vous = lettre ? VAT.L3 : Infinity;
    const reservez = lettre ? w("L3", "réservez") : FINAL_HIT + 0.3;
    const btn = ressort(t, finalIn ? FINAL_HIT + 0.35 : reservez, { damping: 10, stiffness: 240, mass: 0.6 });
    const sloganOut = prog(t, Math.min(vous, FINAL_HIT) - 0.3, 0.35, IN_OUT);
    const vousOut = prog(t, FINAL_HIT - 0.4, 0.35, IN_OUT);
    return (
      <>
        <Flash t={t} at={pb - 0.05} dur={0.3} max={0.5} />
        <Flash t={t} at={FINAL_HIT} dur={0.35} max={0.55} />
        <Abs x={960} y={finalIn ? 320 : 280}>
          <PBLogo t={t} at={finalIn ? FINAL_HIT : pb} size={finalIn ? 130 : 110} tone="light" grad />
        </Abs>
        <Ring t={t} at={pb + 0.1} x={960} y={280} max={1000} color={MINT.green} />
        <Ring t={t} at={w("N12", "copilote") - 0.05} x={960} y={500} max={700} color={PB.citron} />
        <Sparkle t={t} at={w("N12", "copilote")} x={300} y={440} size={64} color={PB.gold} />
        <Sparkle t={t} at={w("N12", "copilote") + 0.12} x={1620} y={560} size={56} color={MINT.green} />
        {!finalIn && (
          <>
            <div style={{ position: "absolute", inset: 0, opacity: 1 - sloganOut }}>
              <Abs x={960} y={500}>
                <Rise t={t} at={w("N12", "le") - 0.1} text="Le copilote IA du comptoir *de votre pharmacie.*" size={66} style={{ width: 1600 }} />
              </Abs>
              <Abs x={960} y={680}>
                <div style={{ transform: `scale(${pop(t, merci - 0.1)})` }}>
                  <Card style={{ padding: "20px 36px", borderRadius: 999, display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ width: 50, height: 50, borderRadius: 99, background: "#F0BAC6" }} />
                    <span style={{ ...tx(36, 800), fontStyle: "italic" }}>« Merci PharmaBoost ! »</span>
                  </Card>
                </div>
              </Abs>
            </div>
            {lettre && (
              <div style={{ position: "absolute", inset: 0, opacity: 1 - vousOut }}>
                <Abs x={960} y={500}>
                  <Rise t={t} at={vous} text="Et vous, quelle pharmacie *voulez-vous être ?*" size={70} style={{ width: 1600 }} />
                </Abs>
              </div>
            )}
          </>
        )}
        {finalIn && (
          <>
            <Confetti t={t} at={FINAL_HIT + 0.1} x={960} y={420} count={70} power={1500} />
            <Abs x={960} y={560}>
              <div style={{ opacity: prog(t, FINAL_HIT + 0.3, 0.5), ...tx(54, 800), letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
                Le copilote IA <span style={{ color: MINT.green }}>du comptoir de votre pharmacie.</span>
              </div>
            </Abs>
          </>
        )}
        {(lettre ? t >= reservez : finalIn) && (
          <Abs x={960} y={finalIn ? 740 : 700}>
            <div style={{ position: "relative", transform: `scale(${btn * (t > FINAL_HIT + 1.25 && t < FINAL_HIT + 1.4 ? 0.96 : 1)})`, display: "flex", alignItems: "center", gap: 16, padding: "26px 50px", borderRadius: 999, background: MINT.green, ...tx(42, 800, "#FFFFFF"), boxShadow: `0 24px 50px -20px ${rgba(MINT.green, 0.7)}` }}>
              <CalendarCheck size={44} /> Réserver une démonstration
              <span style={{ position: "absolute", inset: 0, borderRadius: 999, overflow: "hidden", pointerEvents: "none" }}>
                <span style={{ position: "absolute", top: 0, bottom: 0, width: 160, left: `${-30 + 160 * (((t - FINAL_HIT) * 0.7) % 1.6)}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent)" }} />
              </span>
            </div>
          </Abs>
        )}
        {finalIn && (
          <>
            <Abs x={960 + 420 * (1 - prog(t, FINAL_HIT + 0.5, 0.7, IN_OUT)) + 140} y={finalIn ? 780 + 260 * (1 - prog(t, FINAL_HIT + 0.5, 0.7, IN_OUT)) : 0}>
              <MousePointer2 size={58} fill="#0F2B26" color="#FFFFFF" strokeWidth={1.5} style={{ opacity: prog(t, FINAL_HIT + 0.45, 0.2), transform: `scale(${t > FINAL_HIT + 1.25 && t < FINAL_HIT + 1.4 ? 0.82 : 1})` }} />
            </Abs>
            <Ring t={t} at={FINAL_HIT + 1.28} x={1100} y={760} max={260} color={MINT.green} />
          </>
        )}
        <Abs x={960} y={finalIn ? 860 : 820}>
          <div style={{ opacity: prog(t, reservez + 0.8, 0.5), ...tx(36, 800, MINT.deep) }}>pharmaboost.app</div>
        </Abs>
        <Sparkle t={t} at={FINAL_HIT + 0.2} x={1240} y={320} size={80} color={PB.gold} />
      </>
    );
  }

  // ---- Les sous-titres -------------------------------------------------------------------------------------------------
  type CapLine = { at: number; words: Word[]; quote: boolean };
  const CAPTION_LINES: CapLine[] = [];
  for (const l of LINES) {
    if (VAT[l.id] === undefined) continue;
    const quote = l.who === "clemence" || l.who === "eric";
    let cur: Word[] = [];
    for (const wd of M[l.id].words) {
      cur.push(wd);
      if (/[.:?!…]$/.test(wd.w) || (cur.length >= 6 && /,$/.test(wd.w)) || cur.length >= 11) {
        CAPTION_LINES.push({ at: VAT[l.id], words: cur, quote });
        cur = [];
      }
    }
    if (cur.length) CAPTION_LINES.push({ at: VAT[l.id], words: cur, quote });
  }
  function Captions({ t }: { t: number }) {
    const line = CAPTION_LINES.find((l) => t >= l.at + l.words[0].at - 0.15 && t <= l.at + l.words[l.words.length - 1].end + 0.3);
    if (!line) return null;
    const vt = t - line.at;
    return (
      <Abs x={960} y={1018}>
        <div style={{ maxWidth: 1760, padding: "10px 24px", borderRadius: 16, background: "rgba(255,255,255,.92)", boxShadow: "0 10px 30px -18px rgba(15,43,38,.4)", textAlign: "center", ...tx(31, 700), lineHeight: 1.3, whiteSpace: "nowrap", fontStyle: line.quote ? "italic" : undefined }}>
          {line.quote ? "« " : ""}
          {line.words.map((wd, i) => (
            <span key={i} style={{ color: vt >= wd.at ? MINT.ink : rgba(MINT.ink, 0.3) }}>
              {wd.w.replace(/^…/, "")}
              {i < line.words.length - 1 ? " " : ""}
            </span>
          ))}
          {line.quote ? " »" : ""}
        </div>
      </Abs>
    );
  }

  // ---- La musique de « Rembobinons » : tension jusqu'au DROP, groove bouclé, fin calée sur le dernier coup ---------------
  const LOOP: [number, number] = [20, 58];
  const TAIL_AT = FINAL_HIT - (66 - 58);
  type Seg = { at: number; from: number; to: number; gain: (t: number) => number };
  const SPANS = Object.keys(VAT).map((id) => [VAT[id], end(id)] as const);
  const duck = (t: number) => {
    let d = 0;
    for (const [a, b] of SPANS) if (t >= a - 0.2 && t <= b + 0.45) d = Math.max(d, Math.min(1, (t - (a - 0.2)) / 0.2, (b + 0.45 - t) / 0.45));
    return d;
  };
  const level = (t: number) => 0.3 + (0.1 - 0.3) * duck(t);
  const MUSIC: Seg[] = [];
  if (lettre) MUSIC.push({ at: 0, from: 20, to: 20 + A + 0.6, gain: (t) => Math.min(1, t / 1.5) * 0.11 * (1 - prog(t, A - 0.3, 0.8)) });
  {
    const len = DROP - A;
    MUSIC.push({ at: A, from: Math.max(0, 20 - len), to: 20, gain: (t) => (t < A + 6 ? 0.18 : 0.22 + (0.12 - 0.22) * duck(t)) });
    let at = DROP;
    while (at < TAIL_AT - 0.01) {
      const l = Math.min(LOOP[1] - LOOP[0], TAIL_AT - at);
      MUSIC.push({ at, from: LOOP[0], to: LOOP[0] + l, gain: level });
      at += l;
    }
    MUSIC.push({ at: TAIL_AT, from: 58, to: 69, gain: (t) => Math.max(level(t), t > FINAL_HIT - 0.9 ? 0.42 : 0) * (1 - prog(t, TOTAL - 1.6, 1.5)) });
  }

  // ---- Les bruitages -----------------------------------------------------------------------------------------------------
  const ONE = ["S1", "S2", "S3", "S4", "S5"];
  const SFX: Cue[] = [
    ...(lettre ? [cue("papier", w("L1", "lettre,") - 0.5, 0.5), cue("tic", w("L1", "plutôt"), 0.3), cue("telephone-vibre", w("L1", "déranger"), 0.4), cue("ui-ding", w("L2", "deux"), 0.35), cue("whoosh-rapide", A - 0.2, 0.35)] : []),
    ...actCues(ACT1, ONE, -Infinity, 25.8),
    cue("pharmacie-ambiance", A, 0.5, 1, 6.4),
    cue("whoosh-pb", ACT1_END - 0.1, 0.35),
    cue("ui-clic", w("I5", "connecte"), 0.35),
    cue("pop-leger", w("I5", "directement"), 0.35),
    ...[w("I2", "antibiotiques,"), w("I2", "allergies,"), w("I2", "douleurs…")].map((at, i) => cue("pop-leger", at - 0.1, 0.32, 1 + i * 0.06)),
    cue("whoosh-rapide", w("I2", "trappe.") - 0.25, 0.35),
    cue("chrono", VAT.I6 + 0.1, 0.3),
    cue("pop-leger", VAT.I6 + 0.02, 0.3, 1),
    cue("pop-leger", w("I6", "Combien") - 0.08, 0.3, 1.05),
    cue("pop-leger", VAT.I7 + 0.05, 0.3, 0.95),
    ...[w("I7", "stock,"), w("I7", "dates"), w("I7", "surstock,"), w("I7", "challenges"), w("I7", "marge…")].map((at, i) => cue("pop-leger", at - 0.08, 0.28, 1 + i * 0.05)),
    cue("whoosh-rapide", w("I7", "en") - 0.2, 0.35),
    cue("etincelle", w("I7", "en") + 0.35, 0.4),
    cue("cloche-reussite", w("I7", "bon") - 0.1, 0.3),
    ...[0, 1, 2].map((i) => cue("pop-leger", w("I7", "routine") + i * 0.12, 0.26, 1.05 + i * 0.05)),
    cue("ui-ding", w("I8", "bon") - 0.08, 0.35),
    cue("whoosh-rapide", S_END - 0.2, 0.3),
    ...actCues(ACT2, ["S6", "S7"], 25.9, 35.3),
    cue("whoosh-rapide", ACT2_END - 0.1, 0.3),
    cue("ui-clic", w("I10", "clic") + 0.15, 0.5),
    cue("swipe-tel", w("I10", "clic") + 0.25, 0.3),
    cue("ui-ding", w("I10", "contre-indications"), 0.3),
    cue("whoosh-rapide", F_END - 0.2, 0.3),
    ...actCues(ACT3, ["S8"], 35.3, 45.3),
    cue("pop-leger", w("C1", "crème") - 0.15, 0.3),
    ...[w("C1", "hydratant,"), w("C1", "baume"), w("C1", "solaire.")].map((at, i) => cue("pop-leger", at - 0.08, 0.26, 1.05 + i * 0.05)),
    cue("whoosh-pb", ACT3_END - 0.1, 0.35),
    cue("pop-leger", w("I12", "scanne") - 0.1, 0.35, 1),
    cue("mail", w("I12", "s'ouvre") - 0.1, 0.4),
    cue("pop-leger", VAT.I16 - 0.05, 0.35, 0.95),
    cue("swipe-tel", w("I13", "l'application") - 0.2, 0.35),
    cue("pop-leger", w("I13", "conseils,"), 0.3),
    cue("pop-leger", w("I13", "routine,"), 0.3),
    cue("notif-douce", w("I13", "rappel"), 0.35),
    cue("swipe-tel", w("I14", "lien") - 0.1, 0.3),
    cue("pop-leger", w("I14", "toute") + 0.25, 0.28, 1.1),
    cue("whoosh-rapide", w("I14", "vous") - 0.35, 0.3),
    cue("ui-clic", w("I14", "laboratoire") + 0.85, 0.5),
    cue("notif-douce", w("I14", "notification…") - 0.3, 0.35),
    cue("notif-douce", w("I14", "notification…") - 0.1, 0.3, 1.08),
    cue("notif-douce", w("I14", "notification…") + 0.1, 0.3, 1.16),
    cue("neon", w("I14", "viennent") - 0.1, 0.4),
    cue("porte-carillon", w("I14", "viennent") + 0.5, 0.3),
    cue("whoosh-rapide", C_END - 0.2, 0.3),
    cue("pop-leger", w("I15", "conseils"), 0.28),
    cue("pop-leger", w("I15", "chiffre"), 0.28, 1.05),
    cue("pop-leger", w("I15", "marge"), 0.28, 1.1),
    cue("montee", w("I15", "classement,") - 0.1, 0.3),
    cue("cloche-reussite", w("I15", "challenges.") - 0.4, 0.3),
    cue("impact-net", VAT.N12 - 0.05, 0.45),
    ...(lettre ? [cue("ui-ding", w("L3", "réservez"), 0.35)] : []),
    cue("confettis", FINAL_HIT + 0.1, 0.35),
    cue("etincelle", w("N12", "copilote"), 0.35),
    cue("ui-clic", FINAL_HIT + 1.28, 0.45),
  ];

  function Film() {
    const frame = useCurrentFrame();
    const t = frame / FPS;
    const actWrap = (from: number, to: number, keys: [number, number][], only: string[]) =>
      t >= from - 0.45 && t < to + 0.5 ? (
        <AbsoluteFill style={{ opacity: prog(t, from - 0.4, 0.4) * (1 - prog(t, to, 0.45, IN_OUT)) }}>
          <Act t={t} keys={keys} only={only} />
        </AbsoluteFill>
      ) : null;
    return (
      <AbsoluteFill style={{ background: MINT.paper }}>
        <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 0%, #FFFFFF 0%, ${MINT.paper} 55%, #E2EEEA 100%)` }} />
        <div style={{ position: "absolute", inset: 0, opacity: 0.3 }}>
          <AdnBackdrop t={t} tone="paper" width={1920} focus={[0.82, 0.3]} style={{ background: "transparent" }} />
        </div>
        {lettre && (
          <>
            <Scene t={t} from={0} to={w("L1", "plutôt") - 0.35}>
              <Lettre1 t={t} />
            </Scene>
            <Scene t={t} from={w("L1", "plutôt") - 0.3} to={VAT.L2 - 0.25}>
              <Journee t={t} />
            </Scene>
            <Scene t={t} from={VAT.L2 - 0.2} to={A - 0.1}>
              <DeuxMinutes t={t} />
            </Scene>
          </>
        )}
        {t >= A - 0.05 && t < ACT1_END + 0.5 && (
          <AbsoluteFill style={{ opacity: prog(t, A - 0.05, 0.3) * (1 - prog(t, ACT1_END, 0.45, IN_OUT)) }}>
            <Act t={t} keys={ACT1} only={ONE} />
          </AbsoluteFill>
        )}
        <Trappe t={t} />
        <Scene t={t} from={ACT1_END} to={H_END}>
          <Habitudes t={t} />
        </Scene>
        <Scene t={t} from={H_END} to={S_END}>
          <UneSeconde t={t} />
        </Scene>
        {actWrap(S_END, ACT2_END, ACT2, ["S6", "S7"])}
        <Chargement t={t} />
        <Scene t={t} from={ACT2_END} to={F_END}>
          <Fiche t={t} />
        </Scene>
        {actWrap(F_END, ACT3_END, ACT3, ["S8"])}
        <ConseilPuisRoutine t={t} />
        <Scene t={t} from={ACT3_END} to={B_END}>
          <Bilan t={t} />
        </Scene>
        <Scene t={t} from={B_END} to={C_END}>
          <Campagne t={t} />
        </Scene>
        <Scene t={t} from={C_END} to={E_END}>
          <Equipe t={t} />
        </Scene>
        <Scene t={t} from={E_END} to={TOTAL + 1}>
          <Fin t={t} />
        </Scene>
        <Captions t={t} />
        <Grain t={t} opacity={0.02} />
        <Vignette strength={0.12} />
        {LINES.filter((l) => VAT[l.id] !== undefined).map((l) => (
          <Sequence key={`v-${l.id}`} from={Math.round(VAT[l.id] * FPS)} layout="none" name={`Voix ${l.id}`}>
            <Audio src={staticFile(`iso/voix/${l.id}.wav`)} volume={1} />
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
  return { Film, TOTAL_FRAMES: TOTAL * FPS, TOTAL, VAT };
}

export const PRESENTATION = makeFilm("presentation");
export const LETTRE = makeFilm("lettre");
