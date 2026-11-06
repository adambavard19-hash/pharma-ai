import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Bell, CalendarCheck, CalendarClock, Check, Heart, MousePointer2, QrCode, Repeat, Send, Smile, Sparkles, Star, Sun, TrendingUp, Droplets } from "lucide-react";
import {
  BannerHead,
  Burst,
  Chip,
  Confetti,
  Cues,
  Douchette,
  Dupe,
  DupeTile,
  Flash,
  Grain,
  JAKARTA,
  MedBox,
  MONO,
  Odometer,
  Ordonnance,
  ISO_RX,
  PB,
  PBLogo,
  Pharmacienne,
  Phone,
  Notification,
  Ring,
  Sparkle,
  Vignette,
  AdnBackdrop,
  clamp01,
  cue,
  lerp,
  prog,
  ressort,
  rgba,
  wobble,
  IN_OUT,
  SNAP,
  type BannerLine,
  type Cue,
  type DupeKind,
} from "../../rembobine/kit";
import { Abs, Card, MINT, PASSANTS, Rise, Shop, pop } from "../../lettre/Lettre";
import { FPS, M, linesOf, timeline, type Word } from "../kit";
import { Back, Clock, CounterFront, COUNTER_Y, Layer, SpeedLines, TimeRibbon, hhmm } from "./world";

/**
 * VIDÉO DE PRÉSENTATION N° 1 — « UNE JOURNÉE AU COMPTOIR » (fondateur, 6 nov. 2026).
 * Une journée en accéléré : l'horloge du comptoir grandit au centre et fouette ses aiguilles entre chaque moment, le ciel
 * de la vitrine tourne, les passants filent, la lumière glisse sur le comptoir. 9 h isotrétinoïne (conseil puis routine),
 * 11 h antibiotique (probiotique choisi dans le stock : date courte, challenge, laboratoire préféré), 16 h antiallergique,
 * l'équipe accompagnée, le bilan par QR code et l'offre qui fait revenir, 19 h le rideau et le point du titulaire, la nuit :
 * la pharmacie qui se démarque, puis la fin de marque. Voix A1–A8 (figées), temps de chaque mot dans mots.json.
 */

const { VAT, end, w } = timeline();
VAT.A1 = 0.9;
VAT.A2 = end("A1") + 1.15;
VAT.A3 = end("A2") + 1.3;
VAT.A4 = end("A3") + 1.3;
VAT.A5 = end("A4") + 0.75;
VAT.A6 = end("A5") + 0.6;
VAT.A7 = end("A6") + 1.3;
VAT.A8 = end("A7") + 0.75;
const FIN_AT = w("A8", "pharmaboost,") - 0.08;
const FINAL_HIT = end("A8") + 0.2;
const TOTAL = Math.ceil((FINAL_HIT + 3.0) * FPS) / FPS;

// ---- Les accélérés : l'horloge grandit au centre entre deux moments -----------------------------------------------
type Lapse = { a: number; b: number; from: number; to: number };
const LAPSES: Lapse[] = [
  { a: end("A2") + 0.12, b: VAT.A3 + 0.5, from: 9.3, to: 11 },
  { a: end("A3") + 0.12, b: VAT.A4 + 0.5, from: 11.22, to: 16 },
  { a: end("A6") + 0.12, b: VAT.A7 + 0.5, from: 18.25, to: 19 },
];
const SW = LAPSES.map((l) => (l.a + l.b) / 2 - 0.1);

/** L'heure d'histoire. */
const H_KEYS: [number, number][] = [
  [VAT.A2 - 0.05, 9],
  [LAPSES[0].a, 9.3],
  [VAT.A3 - 0.02, 11],
  [LAPSES[1].a, 11.22],
  [VAT.A4 - 0.02, 16],
  [end("A4") + 0.3, 16.12],
  [end("A5") + 0.3, 17.2],
  [LAPSES[2].a, 18.25],
  [VAT.A7 - 0.02, 19],
  [end("A7") + 0.2, 19.35],
  [VAT.A8 + 0.6, 20.8],
];
const INTRO_T0 = VAT.A2 - 6;
function hourAt(t: number) {
  if (t < VAT.A2 - 0.05) {
    const s = Math.min(59, 54 + Math.floor(Math.max(0, t - INTRO_T0)));
    return 8 + 59 / 60 + s / 3600;
  }
  for (let i = 1; i < H_KEYS.length; i++) {
    const [a, ha] = H_KEYS[i - 1];
    const [b, hb] = H_KEYS[i];
    if (t <= b) {
      const lapse = LAPSES.find((l) => Math.abs(l.a - a) < 1e-6);
      const k = (t - a) / (b - a);
      return ha + (hb - ha) * (lapse ? IN_OUT(clamp01(k)) : k);
    }
  }
  return H_KEYS[H_KEYS.length - 1][1];
}
/** La trotteuse : elle saute chaque seconde, et tourne à toute vitesse pendant l'accéléré. */
function secAt(t: number, h: number) {
  if (t < VAT.A2 - 0.05) return ((54 + Math.floor(Math.max(0, t - INTRO_T0))) % 60) * 6 + 6 * Math.min(1, Math.max(0, (t - INTRO_T0) % 1) * 12) - 6;
  const lapse = LAPSES.find((l) => t >= l.a && t <= l.b);
  if (lapse) return ((h * 3600) % 60) * 6 * 8;
  return Math.floor(t) * 6;
}
/** L'ouverture de l'horloge (0 : petite dans la bande, 1 : au centre). */
function expandAt(t: number) {
  let e = t < VAT.A2 - 0.25 ? 1 : 1 - prog(t, VAT.A2 - 0.25, 0.55, IN_OUT);
  for (const l of LAPSES) e = Math.max(e, prog(t, l.a, 0.38, SNAP) * (1 - prog(t, l.b - 0.42, 0.42, IN_OUT)));
  return e;
}

const tx = (size: number, weight = 700, color: string = MINT.ink): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, color, letterSpacing: size > 24 ? "-0.02em" : 0 });
const Example = () => <span style={{ ...tx(16, 700, MINT.soft), padding: "5px 12px", borderRadius: 99, background: "#EEF3F1" }}>Exemple</span>;
const slideIn = (t: number, at: number, dur = 0.5) => prog(t, at, dur, SNAP);

/** Un objet posé sur le comptoir : il glisse depuis un côté, rebondit, et peut repartir. */
function OnCounter({ t, at, out, x, from = 1, children, y = COUNTER_Y }: { t: number; at: number; out?: number; x: number; from?: number; children: ReactNode; y?: number }) {
  if (t < at - 0.02) return null;
  const k = slideIn(t, at, 0.55);
  const o = out === undefined ? 0 : prog(t, out, 0.35, IN_OUT);
  if (o >= 1) return null;
  const land = t > at + 0.3 ? Math.exp(-(t - at - 0.3) * 9) * Math.sin((t - at - 0.3) * 30) * 0.06 : 0;
  return (
    <div style={{ position: "absolute", left: x + (1 - k) * 700 * from + o * 600 * from, top: y, width: 0, height: 0, opacity: 1 - o }}>
      <div style={{ position: "absolute", left: 0, bottom: 0, transform: `translateX(-50%) scaleY(${1 - land}) rotate(${(1 - k) * 8 * from}deg)`, transformOrigin: "50% 100%" }}>{children}</div>
    </div>
  );
}
/** Un produit qui pope sur le comptoir. */
function PopOn({ t, at, x, children, y = COUNTER_Y }: { t: number; at: number; x: number; children: ReactNode; y?: number }) {
  const k = pop(t, at);
  if (k <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0 }}>
      <div style={{ position: "absolute", left: 0, bottom: 0, transform: `translateX(-50%) translateY(${(1 - Math.min(1, k)) * -80}px) scale(${k})`, transformOrigin: "50% 100%" }}>{children}</div>
    </div>
  );
}

/** La douchette et son bip : faisceau, anneau, « BIP ». */
function Scanner({ t, x, beam }: { t: number; x: number; beam: number }) {
  const k = prog(t, beam, 0.12);
  const bip = t >= beam && t < beam + 0.7;
  return (
    <>
      <Douchette t={t} x={x} y={COUNTER_Y - 222} size={1.15} beamAt={beam} beamDur={0.45} beamLength={150} beamWidth={170} />
      <Ring t={t} at={beam + 0.12} x={x} y={COUNTER_Y - 60} max={300} color="#FF4D4D" />
      {bip && (
        <Abs x={x + 170} y={COUNTER_Y - 290}>
          <span style={{ display: "inline-block", ...tx(40, 800, "#E0533F"), transform: `scale(${k * (1 + 0.2 * (1 - prog(t, beam, 0.3)))}) rotate(-8deg)`, opacity: 1 - prog(t, beam + 0.45, 0.25) }}>BIP</span>
        </Abs>
      )}
    </>
  );
}

// =====================================================================================================================
// A1 — « Huit heures cinquante-neuf. Une journée au comptoir commence. »
// =====================================================================================================================
function Intro({ t }: { t: number }) {
  const open = w("A1", "commence.") - 0.1;
  const out = 1 - prog(t, VAT.A2 - 0.35, 0.4, IN_OUT);
  if (out <= 0) return null;
  const veil = 0.55 * (1 - prog(t, open, 0.8, IN_OUT)) + 0.2;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ background: `radial-gradient(70% 70% at 35% 45%, ${rgba("#FFFFFF", veil * 0.6)}, ${rgba("#0F2B26", veil * 0.55)})` }} />
      <div style={{ position: "absolute", left: 1010, top: 300, width: 860 }}>
        <div style={{ ...tx(26, 800, MINT.green), letterSpacing: "0.22em", textTransform: "uppercase", opacity: prog(t, VAT.A1 - 0.2, 0.4), transform: `translateY(${(1 - prog(t, VAT.A1 - 0.2, 0.5)) * 20}px)` }}>Pharmacie du Centre</div>
        <div style={{ marginTop: 14, fontFamily: MONO, fontWeight: 700, fontSize: 170, lineHeight: 1, color: PB.green, letterSpacing: "-0.04em", transform: `scale(${0.85 + 0.15 * pop(t, VAT.A1)})`, transformOrigin: "0 50%", opacity: t >= VAT.A1 ? 1 : 0 }}>{t < VAT.A2 - 0.1 ? "8 h 59" : "9 h 00"}</div>
        <div style={{ marginTop: 26 }}>
          <Rise t={t} at={w("A1", "une") - 0.05} text="Une journée *au comptoir* commence." size={66} style={{ width: 860, display: "flex", flexWrap: "wrap", justifyContent: "flex-start", columnGap: "0.24em" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

// =====================================================================================================================
// A2 — 9 h : isotrétinoïne → la crème lavante apaisante, puis la routine
// =====================================================================================================================
const BOX_X = 500;
const ROUTINE_ROW: { k: DupeKind; word: string; x: number }[] = [
  { k: "iso-nettoyant", word: "crème", x: 700 },
  { k: "iso-hydratant", word: "soin", x: 812 },
  { k: "iso-levres", word: "baume", x: 922 },
  { k: "iso-solaire", word: "protection", x: 1032 },
];
const L9: BannerLine[] = [
  { n: 1, drug: "Isotrétinoïne 20 mg", product: "Crème lavante apaisante", image: "kind:iso-nettoyant", at: w("A2", "conseil") + 0.25, openAt: w("A2", "conseil") + 0.05, chips: [{ kind: "stock", text: "En stock" }] },
  { n: 2, drug: "Isotrétinoïne 20 mg", product: "Soin hydratant", image: "kind:iso-hydratant", at: w("A2", "soin") - 0.08, chips: [{ kind: "stock", text: "En stock" }] },
  { n: 3, drug: "Isotrétinoïne 20 mg", product: "Baume à lèvres", image: "kind:iso-levres", at: w("A2", "baume") - 0.08, chips: [{ kind: "stock", text: "En stock" }] },
  { n: 4, drug: "Isotrétinoïne 20 mg", product: "Protection solaire", image: "kind:iso-solaire", at: w("A2", "protection") - 0.08, chips: [{ kind: "stock", text: "En stock" }] },
];
function Banner({ t, lines, at, scale = 0.74, x = 1450, top = 214 }: { t: number; lines: BannerLine[]; at: number; scale?: number; x?: number; top?: number }) {
  if (t < at) return null;
  const k = ressort(t, at, { damping: 12, stiffness: 200, mass: 0.6 });
  const boxH = Math.max(100, 36 + 140 * lines.length);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: clamp01(k * 3) }}>
      <BannerHead t={t} lines={lines} x={x} y={top + (boxH * scale) / 2 + (1 - Math.min(1, k)) * -60} scale={scale * (0.85 + 0.15 * k)} />
    </div>
  );
}
function Neuf({ t }: { t: number }) {
  const ord = w("A2", "ordonnance") - 0.3;
  const boxAt = w("A2", "boîte") - 0.35;
  const beam = w("A2", "scannée…");
  const pbAt = w("A2", "pharmaboost") - 0.15;
  const routineAt = w("A2", "routine");
  const sweep = prog(t, ord, 0.9, IN_OUT) * (1 - prog(t, beam + 0.4, 0.8, IN_OUT));
  return (
    <>
      <OnCounter t={t} at={ord} x={240} from={1}>
        <div style={{ transform: `translateY(40px) scale(${1 + 0.35 * sweep})`, transformOrigin: "50% 100%" }}>
          <Ordonnance lines={ISO_RX} w={240} flat={0.55} rotate={-6} />
        </div>
      </OnCounter>
      <OnCounter t={t} at={boxAt} x={BOX_X} from={-1}>
        <MedBox kind="isotretinoine" w={240} />
      </OnCounter>
      <Scanner t={t} x={BOX_X} beam={beam} />
      <Flash t={t} at={beam + 0.05} dur={0.25} max={0.25} color="#FFFFFF" />
      {ROUTINE_ROW.map((r) => (
        <PopOn key={r.k} t={t} at={w("A2", r.word) - 0.05} x={r.x}>
          <Dupe kind={r.k} h={195} />
        </PopOn>
      ))}
      {ROUTINE_ROW.map((r) => (
        <Sparkle key={`s${r.k}`} t={t} at={w("A2", r.word)} x={r.x + 30} y={COUNTER_Y - 210} size={46} color={PB.citron} />
      ))}
      <Banner t={t} lines={L9} at={pbAt} />
      <Ring t={t} at={pbAt + 0.05} x={1450} y={260} max={520} color={MINT.green} />
      {t >= routineAt - 0.1 && (
        <Abs x={870} y={COUNTER_Y - 300}>
          <div style={{ transform: `scale(${pop(t, routineAt - 0.1)})` }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 20px", borderRadius: 999, background: PB.green, ...tx(24, 800, PB.citron), whiteSpace: "nowrap" }}>
              <Sparkles size={24} /> La routine complète
            </span>
          </div>
        </Abs>
      )}
    </>
  );
}

// =====================================================================================================================
// A3 — 11 h : antibiotique → le probiotique choisi dans le stock (date courte, challenge, laboratoire préféré)
// =====================================================================================================================
const STOCK = [0, 1, 2, 3, 4];
const PICK = 2;
/** Après chaque critère, les boîtes qui restent. */
const KEEP: number[][] = [
  [0, 1, 2, 3, 4],
  [0, 2, 3],
  [2, 3],
  [2],
];
function Onze({ t }: { t: number }) {
  const boxAt = w("A3", "antibiotique.") - 0.3;
  const beam = w("A3", "scanné…");
  const cardAt = w("A3", "probiotique,") - 0.12;
  const stockAt = w("A3", "stock") - 0.25;
  const crit = [w("A3", "date") - 0.05, w("A3", "challenge") - 0.05, w("A3", "laboratoire", 1) - 0.05];
  const stage = crit.filter((c) => t >= c + 0.15).length;
  const keep = KEEP[stage];
  const chosen = crit[2] + 0.55;
  const fly = prog(t, chosen + 0.5, 0.6, IN_OUT);
  const ck = ressort(t, cardAt, { damping: 13, stiffness: 190, mass: 0.7 });
  const radar = t >= stockAt && t < chosen ? ((t - stockAt) * 1.6) % 1 : -1;
  const cardL = 1080;
  const cardW = 760;
  return (
    <>
      <OnCounter t={t} at={boxAt} x={BOX_X} from={-1}>
        <MedBox kind="amoxicilline" w={240} />
      </OnCounter>
      <Scanner t={t} x={BOX_X} beam={beam} />
      <Flash t={t} at={beam + 0.05} dur={0.25} max={0.25} color="#FFFFFF" />
      {/* le probiotique choisi se pose à côté de l'antibiotique */}
      <PopOn t={t} at={chosen + 1.05} x={790}>
        <MedBox kind="probiotique" w={210} />
      </PopOn>
      <Ring t={t} at={chosen + 1.1} x={790} y={COUNTER_Y - 50} max={320} color={MINT.green} />
      {t >= cardAt && (
        <div style={{ position: "absolute", left: cardL, top: 190, width: cardW, opacity: clamp01(ck * 3), transform: `translateY(${(1 - Math.min(1, ck)) * 60}px) scale(${0.9 + 0.1 * ck})`, transformOrigin: "50% 0%" }}>
          <div style={{ borderRadius: 36, padding: 14, background: "linear-gradient(160deg, #BDEBD7 0%, #8FDDBE 100%)", boxShadow: `0 0 0 3px #3DBF8E, 0 44px 90px -34px rgba(14,124,90,.55)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 10px 12px" }}>
              <svg viewBox="0 0 40 40" width={26} height={26}>
                <path d="M14 2h12v12h12v12H26v12H14V26H2V14h12z" fill={MINT.green} />
              </svg>
              <span style={{ ...tx(18, 700), letterSpacing: "0.2em" }}>
                PHARMA<span style={{ color: MINT.green }}>BOOST</span>
              </span>
            </div>
            <div style={{ borderRadius: 26, background: "#FFFFFF", padding: "22px 26px 24px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span style={tx(36, 800)}>Probiotique</span>
                <span style={tx(21, 600, MINT.soft)}>pour Amoxicilline 1 g</span>
              </div>
              <div style={{ marginTop: 16, ...tx(17, 800, MINT.green), letterSpacing: "0.14em", textTransform: "uppercase", opacity: prog(t, stockAt, 0.3) }}>Choisi dans votre stock</div>
              {/* l'étagère du stock */}
              <div style={{ position: "relative", marginTop: 10, height: 150, borderRadius: 18, background: "#F1FAF6", boxShadow: "inset 0 0 0 2px #E3EBE8", opacity: prog(t, stockAt, 0.3) }}>
                <div style={{ position: "absolute", left: 16, right: 16, bottom: 22, height: 6, borderRadius: 3, background: rgba(MINT.ink, 0.14) }} />
                {STOCK.map((i) => {
                  const inK = pop(t, stockAt + 0.06 * i);
                  const alive = keep.includes(i);
                  const dimK = alive ? 0 : 1;
                  const pick = i === PICK ? prog(t, chosen, 0.4, SNAP) : 0;
                  const hop = radar >= 0 && keep.includes(i) && Math.floor(radar * keep.length) === keep.indexOf(i) ? 1 : 0;
                  return (
                    <div key={i} style={{ position: "absolute", left: 40 + i * 132, bottom: 28, width: 0, height: 0 }}>
                      <div style={{ position: "absolute", left: 0, bottom: 0, transform: `translateX(-50%) translateY(${-hop * 8 - pick * 14}px) scale(${inK * (1 + 0.12 * pick)})`, transformOrigin: "50% 100%", opacity: 1 - 0.75 * dimK, filter: `grayscale(${dimK}) hue-rotate(${(i - PICK) * 18}deg)` }}>
                        <MedBox kind="probiotique" w={92} shadow={false} />
                      </div>
                      {pick > 0 && (
                        <div style={{ position: "absolute", left: -64, bottom: -12, width: 128, height: 128, borderRadius: 20, boxShadow: `0 0 0 ${4 * pick}px ${MINT.green}, 0 0 30px ${rgba(MINT.green, 0.5 * pick)}` }} />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* les trois critères */}
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12, minHeight: 236 }}>
                {[
                  { kind: "date" as const, text: "Date courte", at: crit[0] },
                  { kind: "challenge" as const, text: "Challenge laboratoire", at: crit[1] },
                  { kind: "plain" as const, text: "Laboratoire préféré du titulaire", at: crit[2] },
                ].map((c, i) => {
                  const slam = t >= c.at ? 1 + 0.5 * (1 - prog(t, c.at, 0.22, SNAP)) : 0;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, height: 64, opacity: t >= c.at ? 1 : 0 }}>
                      <span style={{ display: "inline-flex", width: 40, height: 40, borderRadius: 99, alignItems: "center", justifyContent: "center", background: MINT.green, transform: `scale(${pop(t, c.at + 0.15)})` }}>
                        <Check size={26} color="#FFFFFF" strokeWidth={3.4} />
                      </span>
                      <div style={{ transform: `scale(${slam})`, transformOrigin: "0 50%" }}>
                        {c.kind === "plain" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 50, padding: "0 18px", borderRadius: 999, background: "#E7F0FF", color: "#2A4FA8", boxShadow: "inset 0 0 0 2px rgba(42,79,168,.16)", ...tx(27, 700, "#2A4FA8"), whiteSpace: "nowrap" }}>
                            <Heart size={24} fill="#2A4FA8" strokeWidth={0} /> {c.text}
                          </span>
                        ) : (
                          <Chip t={t} kind={c.kind} text={c.text} size={28} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* le choix, qui file vers le comptoir */}
      {t >= chosen + 0.5 && fly < 1 && (
        <div style={{ position: "absolute", left: lerp(cardL + 26 + 14 + 40 + PICK * 132, 790, fly), top: lerp(560, COUNTER_Y, fly) - Math.sin(Math.PI * fly) * 160, width: 0, height: 0 }}>
          <div style={{ position: "absolute", left: 0, bottom: 0, transform: `translateX(-50%) scale(${lerp(0.55, 0.9, fly)}) rotate(${Math.sin(Math.PI * fly) * -14}deg)`, transformOrigin: "50% 100%" }}>
            <MedBox kind="probiotique" w={170} />
          </div>
        </div>
      )}
      {t >= chosen && t < chosen + 1.6 && (
        <Abs x={cardL + cardW / 2} y={168}>
          <div style={{ transform: `scale(${pop(t, chosen)})` }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 22px", borderRadius: 999, background: PB.green, ...tx(24, 800, PB.citron), whiteSpace: "nowrap" }}>
              <Star size={22} fill={PB.citron} strokeWidth={0} /> Le bon choix, en une seconde
            </span>
          </div>
        </Abs>
      )}
    </>
  );
}

// =====================================================================================================================
// A4 — 16 h : antiallergique → lavage nasal, routine des allergies
// =====================================================================================================================
const L16: BannerLine[] = [
  { n: 1, drug: "Cétirizine 10 mg", product: "Lavage nasal", image: "kind:nez", at: w("A4", "lavage") + 0.15, openAt: w("A4", "lavage") - 0.1, chips: [{ kind: "stock", text: "En stock" }] },
  { n: 2, drug: "Cétirizine 10 mg", product: "Routine allergies", routine: ["kind:nez", "kind:yeux", "kind:gorge"], at: w("A4", "routine") - 0.1, chips: [{ kind: "stock", text: "En stock" }] },
];
function Seize({ t }: { t: number }) {
  const boxAt = w("A4", "antiallergique.") - 0.35;
  const beam = w("A4", "scanné…");
  return (
    <>
      <OnCounter t={t} at={boxAt} x={BOX_X} from={-1}>
        <MedBox kind="cetirizine" w={240} />
      </OnCounter>
      <Scanner t={t} x={BOX_X} beam={beam} />
      <Flash t={t} at={beam + 0.05} dur={0.25} max={0.25} color="#FFFFFF" />
      <Banner t={t} lines={L16} at={beam + 0.3} scale={0.78} top={260} />
      <PopOn t={t} at={w("A4", "lavage")} x={770}>
        <MedBox kind="eaudemer" w={200} />
      </PopOn>
      {[
        { k: "nez", I: Droplets, c: "#1C6FB0", x: 940 },
        { k: "yeux", I: Sparkles, c: "#5B3FB8", x: 1025 },
      ].map((r, i) => (
        <PopOn key={r.k} t={t} at={w("A4", "routine") + 0.12 * i} x={r.x} y={COUNTER_Y - 6}>
          <span style={{ display: "inline-flex", width: 68, height: 68, borderRadius: 18, alignItems: "center", justifyContent: "center", background: r.c, boxShadow: "0 12px 24px -12px rgba(0,0,0,.4)" }}>
            <r.I size={36} color="#FFFFFF" />
          </span>
        </PopOn>
      ))}
    </>
  );
}

// =====================================================================================================================
// A5 — « Votre équipe n'a plus à tout retenir : PharmaBoost l'accompagne, et chaque conseil donne tout son potentiel. »
// =====================================================================================================================
const MEMO = ["Posologies", "Routines", "Dates courtes", "Challenges", "Stock", "Contre-indications"];
const MEMO_POS = [
  [-250, -380],
  [40, -470],
  [300, -400],
  [-330, -230],
  [330, -250],
  [-40, -560],
];
const PH_X = 520;
function Equipe({ t }: { t: number }) {
  const memoAt = w("A5", "tout") - 0.35;
  const pbAt = w("A5", "pharmaboost");
  const pot = w("A5", "potentiel.") - 0.08;
  const ring = prog(t, w("A5", "chaque") - 0.1, pot - w("A5", "chaque") + 0.25, IN_OUT);
  const target = { x: 1380, y: 260 };
  const head = { x: PH_X + 10, y: COUNTER_Y - 280 * 1.35 };
  return (
    <>
      {MEMO.map((m, i) => {
        const at = memoAt + i * 0.07;
        const fly = prog(t, pbAt - 0.05 + i * 0.05, 0.55, IN_OUT);
        if (t < at || fly >= 1) return null;
        const [dx, dy] = MEMO_POS[i];
        const x0 = head.x + dx;
        const y0 = head.y + dy * 0.48 + wobble(t, i + 2, 6, 1.2);
        const x = lerp(x0, target.x, fly);
        const y = lerp(y0, target.y, fly) - Math.sin(Math.PI * fly) * 120;
        return (
          <Abs key={m} x={x} y={y}>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "10px 18px", borderRadius: 999, background: "#FFFFFF", boxShadow: "0 14px 30px -16px rgba(15,43,38,.5)", ...tx(24, 700), whiteSpace: "nowrap", transform: `scale(${pop(t, at) * (1 - 0.6 * fly)})`, opacity: 1 - prog(t, pbAt + 0.35 + i * 0.05, 0.25) }}>{m}</span>
          </Abs>
        );
      })}
      {/* PharmaBoost qui accompagne */}
      {t >= pbAt - 0.1 && (
        <Abs x={target.x} y={target.y}>
          <div style={{ transform: `scale(${pop(t, pbAt - 0.1)})` }}>
            <Card style={{ padding: "18px 30px", borderRadius: 999, display: "flex", alignItems: "center", gap: 18 }}>
              <PBLogo t={t} at={pbAt - 0.05} size={46} tone="light" grad />
              <span style={{ width: 2, height: 40, background: MINT.line }} />
              <span style={{ ...tx(28, 800, MINT.green), whiteSpace: "nowrap" }}>l'accompagne</span>
            </Card>
          </div>
        </Abs>
      )}
      <Ring t={t} at={pbAt + 0.25} x={target.x} y={target.y} max={500} color={MINT.green} />
      {/* le compteur du jour et la jauge du potentiel */}
      {t >= VAT.A5 + 0.2 && (
        <Abs x={1380} y={640}>
          <div style={{ transform: `scale(${pop(t, VAT.A5 + 0.2)})` }}>
            <Card style={{ width: 640, padding: "26px 34px", borderRadius: 32, display: "flex", alignItems: "center", gap: 30 }}>
              <div style={{ position: "relative", width: 190, height: 190, flexShrink: 0 }}>
                <svg width={190} height={190} viewBox="0 0 190 190">
                  <circle cx={95} cy={95} r={80} fill="none" stroke={rgba(MINT.green, 0.14)} strokeWidth={18} />
                  <circle cx={95} cy={95} r={80} fill="none" stroke={MINT.green} strokeWidth={18} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - (0.35 + 0.65 * ring)} transform="rotate(-90 95 95)" />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", ...tx(46, 800, PB.green) }}>{Math.round(35 + 65 * ring)} %</div>
              </div>
              <div>
                <div style={tx(22, 700, MINT.soft)}>Conseils proposés aujourd'hui</div>
                {(() => {
                  const u = clamp01((t - VAT.A5) / (end("A5") - VAT.A5 + 0.4));
                  const v = Math.floor(lerp(23, 61, u));
                  const at = VAT.A5 + ((v - 23) / (61 - 23)) * (end("A5") - VAT.A5 + 0.4);
                  const bump = 1 + 0.08 * (1 - prog(t, at, 0.18));
                  return <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 92, lineHeight: 1.1, color: PB.green, fontVariantNumeric: "tabular-nums", transform: `scale(${bump})`, transformOrigin: "0 70%" }}>{v}</div>;
                })()}
                <div style={{ marginTop: 6, height: 50 }}>
                  {t >= pot && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: PB.green, ...tx(24, 800, PB.citron), transform: `scale(${pop(t, pot)})`, whiteSpace: "nowrap" }}>
                      <Sparkles size={22} /> Tout son potentiel
                    </span>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </Abs>
      )}
      <Burst t={t} at={pot + 0.05} x={1160} y={640} count={18} radius={220} />
    </>
  );
}

// =====================================================================================================================
// A6 — Le QR code, le bilan conseil, le rappel ; l'offre, et le patient qui revient
// =====================================================================================================================
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
const ISO4: DupeKind[] = ["iso-nettoyant", "iso-hydratant", "iso-levres", "iso-solaire"];
function AppBilan({ t, at }: { t: number; at: number }) {
  const st = (i: number): CSSProperties => ({ opacity: prog(t, at + 0.1 * i, 0.35), transform: `translateY(${(1 - prog(t, at + 0.1 * i, 0.35, SNAP)) * 16}px)` });
  const rap = w("A6", "rappel");
  const lit = prog(t, rap - 0.1, 0.25) * (1 - prog(t, rap + 1.6, 0.4));
  const ring = prog(t, rap - 0.1, 1.2, IN_OUT);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#EEF3F1", padding: "58px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...st(0) }}>
        <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 10, background: PB.green, alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 40 40" width={18} height={18}>
            <path d="M14 2h12v12h12v12H26v12H14V26H2V14h12z" fill={PB.citron} />
          </svg>
        </span>
        <span style={tx(16, 800, "#101828")}>PharmaBoost</span>
        <span style={{ marginLeft: "auto", ...tx(12, 600, "#64748B") }}>Pharmacie du Centre</span>
      </div>
      <div style={{ marginTop: 16, ...tx(26, 800, "#0B3B47"), ...st(1) }}>Mon bilan conseil</div>
      <div style={{ ...st(2), marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 14, boxShadow: "0 0 0 1px #E4ECE9" }}>
        <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Ma routine isotrétinoïne</div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {ISO4.map((k, i) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, opacity: prog(t, at + 0.35 + 0.1 * i, 0.3) }}>
              <DupeTile kind={k} size={40} radius={10} />
              <span style={{ ...tx(12, 700, "#101828"), lineHeight: 1.15 }}>{["Crème lavante", "Soin hydratant", "Baume lèvres", "Protection solaire"][i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...st(3), marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 14, display: "flex", alignItems: "center", gap: 12, boxShadow: lit > 0.01 ? `0 0 0 ${3 * lit}px ${rgba(MINT.green, 0.7)}, 0 10px 24px -14px rgba(0,0,0,.3)` : "0 0 0 1px #E4ECE9", transform: `scale(${1 + 0.04 * lit})` }}>
        <svg width={54} height={54} viewBox="0 0 56 56">
          <circle cx={28} cy={28} r={23} fill="none" stroke="#E3ECE8" strokeWidth={7} />
          <circle cx={28} cy={28} r={23} fill="none" stroke={MINT.green} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - 0.77 * ring} transform="rotate(-90 28 28)" />
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Rappel</div>
          <div style={tx(15, 800, "#101828")}>Fin de cure dans 7 jours</div>
        </div>
        <Bell size={24} color={MINT.green} style={{ transform: `rotate(${lit > 0 ? Math.sin(t * 30) * 16 * lit : 0}deg)` }} />
      </div>
      <div style={{ ...st(4), marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 14, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 0 0 1px #E4ECE9" }}>
        <CalendarClock size={22} color={MINT.green} />
        <span style={tx(13, 700, "#101828")}>Mes conseils, gardés ici</span>
      </div>
    </div>
  );
}
function Bilan({ t }: { t: number }) {
  const a = VAT.A6;
  const scan = w("A6", "scanne") - 0.1;
  const opens = w("A6", "s'ouvre") - 0.2;
  const lance = w("A6", "lancez") - 0.25;
  const send = w("A6", "offre,") + 0.15;
  const recoit = w("A6", "reçoit…") - 0.05;
  const revient = w("A6", "revient") - 0.35;
  const qrIn = prog(t, a - 0.2, 0.6, SNAP);
  const qrOut = prog(t, lance - 0.3, 0.35, IN_OUT);
  const offIn = prog(t, lance - 0.15, 0.45, SNAP);
  const offOut = prog(t, revient - 0.25, 0.35, IN_OUT);
  const shopIn = prog(t, revient - 0.1, 0.5, SNAP);
  const camera = prog(t, scan - 0.1, 0.35, SNAP) * (1 - prog(t, opens, 0.3));
  const beam = ((t - scan) % 1.1) / 1.1;
  const opened = prog(t, opens, 0.5, SNAP);
  const plane = prog(t, send, 0.65, IN_OUT);
  const click = w("A6", "lancez") + 0.15;
  const walk = prog(t, revient + 0.05, 1.25, IN_OUT);
  return (
    <>
      <AbsoluteFill style={{ background: rgba("#F4F8F6", 0.62) }} />
      {/* le QR code du bilan, sur la bannière du comptoir */}
      {qrOut < 1 && (
        <Abs x={560} y={540}>
          <div style={{ opacity: qrIn * (1 - qrOut), transform: `scale(${0.88 + 0.12 * qrIn - 0.1 * qrOut}) rotate(${-2 + 2 * qrIn}deg)` }}>
            <Card style={{ width: 470, padding: "30px 34px 28px", borderRadius: 34, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
              <span style={tx(32, 800)}>Le bilan conseil</span>
              <div style={{ position: "relative" }}>
                <QrArt size={270} />
                {camera > 0 && <div style={{ position: "absolute", left: -10, right: -10, top: `${beam * 100}%`, height: 5, borderRadius: 4, background: MINT.green, boxShadow: `0 0 18px ${MINT.green}`, opacity: camera }} />}
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, ...tx(22, 700, MINT.soft) }}>
                <QrCode size={24} color={MINT.green} /> Scanné par le patient
              </span>
            </Card>
          </div>
        </Abs>
      )}
      {/* l'offre de la pharmacie */}
      {t >= lance - 0.2 && offOut < 1 && (
        <Abs x={560} y={540}>
          <div style={{ opacity: offIn * (1 - offOut), transform: `translateY(${(1 - offIn) * 40}px) scale(${1 - 0.1 * offOut})` }}>
            <Card style={{ width: 560, padding: "30px 34px", borderRadius: 34 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ ...tx(16, 800, MINT.green), letterSpacing: "0.16em", textTransform: "uppercase" }}>Nouvelle offre</span>
                <span style={{ marginLeft: "auto" }}>
                  <Example />
                </span>
              </div>
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 18 }}>
                <span style={{ display: "inline-flex", width: 86, height: 86, borderRadius: 22, alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#F7B23A,#E8862A)" }}>
                  <Sun size={46} color="#FFFFFF" />
                </span>
                <div>
                  <div style={tx(34, 800)}>−15 % sur le solaire</div>
                  <div style={tx(20, 600, MINT.soft)}>Pharmacie du Centre · cette semaine</div>
                </div>
              </div>
              <div style={{ marginTop: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "18px 0", borderRadius: 999, background: MINT.green, ...tx(26, 800, "#FFFFFF"), transform: `scale(${t > click && t < click + 0.15 ? 0.95 : 1})` }}>
                <Send size={26} /> Envoyer à mes patients
              </div>
              <div style={{ position: "absolute", left: 360 + (1 - prog(t, lance + 0.1, 0.5, IN_OUT)) * 160, top: 260 + (1 - prog(t, lance + 0.1, 0.5, IN_OUT)) * 120, opacity: prog(t, lance, 0.2) }}>
                <MousePointer2 size={50} fill="#0F2B26" color="#FFFFFF" strokeWidth={1.5} style={{ transform: `scale(${t > click && t < click + 0.15 ? 0.82 : 1})` }} />
              </div>
            </Card>
          </div>
        </Abs>
      )}
      <Ring t={t} at={click} x={600} y={700} max={240} color={MINT.green} />
      {/* l'avion de papier de l'offre */}
      {plane > 0 && plane < 1 && (
        <Abs x={lerp(700, 1300, plane)} y={lerp(680, 260, plane) - Math.sin(Math.PI * plane) * 120}>
          <Send size={56} color={MINT.green} style={{ transform: `rotate(${-10 + 30 * plane}deg)` }} />
        </Abs>
      )}
      {/* la pharmacie où il revient */}
      {shopIn > 0 && (
        <div style={{ position: "absolute", left: 560, top: 920, width: 0, height: 0, opacity: shopIn }}>
          <div style={{ position: "absolute", left: 0, top: 0, transform: `scale(${0.62 * (0.9 + 0.1 * shopIn)})`, transformOrigin: "0 0" }}>
            <div style={{ position: "absolute", left: 0, top: -890, width: 0, height: 0 }}>
              <Shop x={0} lit={1} t={t} />
            </div>
          </div>
          {walk > 0 && walk < 1 && (
            <div style={{ position: "absolute", left: lerp(360, 120, walk), top: -150 - Math.abs(Math.sin(walk * 16)) * 6, opacity: 1 - prog(t, revient + 1.15, 0.2) }}>
              <div style={{ width: 34, height: 34, borderRadius: 99, background: PASSANTS[0], margin: "0 auto" }} />
              <div style={{ width: 52, height: 88, borderRadius: "26px 26px 8px 8px", background: PASSANTS[0], filter: "brightness(.9)", marginTop: 4 }} />
            </div>
          )}
          {t >= w("A6", "vous.") - 0.2 && (
            <div style={{ position: "absolute", left: -150, top: -440 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 20px", borderRadius: 999, background: "#FFFFFF", boxShadow: "0 16px 34px -18px rgba(15,43,38,.5)", ...tx(26, 800), transform: `scale(${pop(t, w("A6", "vous.") - 0.2)})`, whiteSpace: "nowrap" }}>
                <Repeat size={26} color={MINT.green} /> Il revient chez vous
              </span>
            </div>
          )}
        </div>
      )}
      {/* le téléphone du patient */}
      <Phone t={t} x={1340} y={560} scale={0.9 * (0.9 + 0.1 * qrIn)} tilt={-8} buzz={recoit} style={{ opacity: qrIn }}>
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
              <AppBilan t={t} at={opens} />
            </div>
          )}
          <Notification t={t} at={recoit} icon="bell" app="Pharmacie du Centre" title="Offre de la semaine" body="−15 % sur le solaire, jusqu'à samedi" x={187} y={92} width={345} />
        </div>
      </Phone>
    </>
  );
}

// =====================================================================================================================
// A7 — 19 h : le rideau tombe, le titulaire fait le point
// =====================================================================================================================
const CHART = [0.08, 0.12, 0.1, 0.2, 0.26, 0.24, 0.36, 0.42, 0.5, 0.58, 0.55, 0.7, 0.8, 0.94];
function Point({ t }: { t: number }) {
  const a = VAT.A7;
  const dash = w("A7", "titulaire") - 0.25;
  const dk = ressort(t, dash, { damping: 14, stiffness: 170, mass: 0.7 });
  const cv = w("A7", "conseils") - 0.1;
  const ca = w("A7", "chiffre") - 0.1;
  const monte = w("A7", "monte,");
  const eq = w("A7", "équipe") - 0.1;
  const draw = prog(t, ca, monte - ca + 0.5, IN_OUT);
  const cw = 360;
  const ch = 150;
  const pts = CHART.map((v, i) => [(i / (CHART.length - 1)) * cw, ch - v * ch] as const);
  const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const tile: CSSProperties = { flex: 1, borderRadius: 26, background: "#F4F8F6", padding: "24px 26px", boxShadow: "inset 0 0 0 2px #E3EBE8", height: 300, boxSizing: "border-box", position: "relative", overflow: "hidden" };
  if (t < dash) return null;
  return (
    <Abs x={960} y={530}>
      <div style={{ opacity: clamp01(dk * 3), transform: `translateY(${(1 - Math.min(1, dk)) * 80}px) scale(${0.9 + 0.1 * dk})` }}>
        <Card style={{ width: 1420, padding: "30px 36px 36px", borderRadius: 38 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <PBLogo t={t} size={34} tone="light" grad />
            <span style={{ width: 2, height: 34, background: MINT.line }} />
            <span style={tx(30, 800)}>Le point du titulaire</span>
            <span style={tx(24, 600, MINT.soft)}>· aujourd'hui, 19 h</span>
            <span style={{ marginLeft: "auto" }}>
              <Example />
            </span>
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 22 }}>
            <div style={{ ...tile, opacity: prog(t, cv - 0.2, 0.3), transform: `scale(${0.94 + 0.06 * pop(t, cv - 0.2)})` }}>
              <div style={tx(24, 700, MINT.soft)}>Conseils vendus</div>
              <div style={{ height: 132, overflow: "hidden" }}>
                <Odometer t={t} value={(tt) => lerp(0, 47, prog(tt, cv, 1.1, IN_OUT))} digits={2} size={120} color={PB.green} />
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "flex-end", height: 60 }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} style={{ flex: 1, borderRadius: 4, background: i > 8 ? MINT.green : rgba(MINT.green, 0.3), height: `${(20 + ((i * 37) % 60) + i * 3) * prog(t, cv + i * 0.04, 0.4, SNAP)}%` }} />
                ))}
              </div>
            </div>
            <div style={{ ...tile, flex: 1.25, opacity: prog(t, ca - 0.2, 0.3), transform: `scale(${0.94 + 0.06 * pop(t, ca - 0.2)})` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={tx(24, 700, MINT.soft)}>Chiffre d'affaires conseil</span>
                <TrendingUp size={26} color={MINT.green} style={{ marginLeft: "auto", transform: `scale(${pop(t, monte)})` }} />
              </div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 60, color: PB.green, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{Math.round(lerp(320, 1860, prog(t, ca, monte - ca + 0.5, IN_OUT))).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} €</div>
              <svg width={cw + 20} height={ch + 20} viewBox={`-10 -10 ${cw + 20} ${ch + 20}`} style={{ position: "absolute", left: 30, bottom: 16, overflow: "visible" }}>
                <defs>
                  <linearGradient id="f1area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={MINT.green} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={MINT.green} stopOpacity={0} />
                  </linearGradient>
                  <clipPath id="f1clip">
                    <rect x={-10} y={-20} width={(cw + 20) * draw} height={ch + 40} />
                  </clipPath>
                </defs>
                <g clipPath="url(#f1clip)">
                  <path d={`${path} L${cw} ${ch} L0 ${ch} Z`} fill="url(#f1area)" />
                  <path d={path} fill="none" stroke={MINT.green} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
                </g>
                {draw > 0 && (() => {
                  const f = draw * (CHART.length - 1);
                  const i = Math.min(CHART.length - 2, Math.floor(f));
                  const k = f - i;
                  const x = lerp(pts[i][0], pts[i + 1][0], k);
                  const y = lerp(pts[i][1], pts[i + 1][1], k);
                  return <circle cx={x} cy={y} r={10} fill={PB.citron} stroke={PB.green} strokeWidth={4} />;
                })()}
              </svg>
            </div>
            <div style={{ ...tile, opacity: prog(t, eq - 0.2, 0.3), transform: `scale(${0.94 + 0.06 * pop(t, eq - 0.2)})`, display: "flex", flexDirection: "column" }}>
              <div style={tx(24, 700, MINT.soft)}>L'équipe</div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                {["#F0BAC6", "#9CC7F0", "#F6D98A"].map((c, i) => (
                  <span key={c} style={{ display: "inline-flex", width: 76, height: 76, borderRadius: 99, background: c, alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 4px #FFFFFF", transform: `translateY(${-Math.abs(Math.sin((t - eq) * 5 + i)) * 8 * prog(t, eq, 0.3)}px) scale(${pop(t, eq + 0.08 * i)})` }}>
                    <Smile size={44} color={PB.green} />
                  </span>
                ))}
              </div>
              <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: PB.green, ...tx(24, 800, PB.citron), transform: `scale(${pop(t, w("A7", "soulagée.") - 0.1)})`, whiteSpace: "nowrap" }}>
                <Heart size={22} fill={PB.citron} strokeWidth={0} /> Équipe soulagée
              </span>
            </div>
          </div>
        </Card>
      </div>
    </Abs>
  );
}

// =====================================================================================================================
// A8 — La nuit : la pharmacie qui se démarque, puis la fin de marque
// =====================================================================================================================
function Rue({ t }: { t: number }) {
  const a = VAT.A8;
  const lit = prog(t, w("A8", "pharmacie") - 0.05, 0.5, SNAP);
  const pro = w("A8", "professionnelle.") - 0.05;
  const push = prog(t, a - 0.3, FIN_AT - a + 0.5, IN_OUT);
  const shops = [380, 960, 1540];
  return (
    <>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #0B1230 0%, #1C2552 55%, #2C3566 100%)" }} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 80 }, (_, i) => {
          const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * 1920;
          const y = (Math.sin(i * 37.3) * 0.5 + 0.5) * 420;
          return <circle key={i} cx={x} cy={y} r={1 + (i % 3) * 0.6} fill="#FFFFFF" opacity={0.3 + 0.5 * Math.abs(Math.sin(t * 1.5 + i))} />;
        })}
        <circle cx={1700} cy={150} r={44} fill="#F4F1DE" />
        <circle cx={1718} cy={138} r={40} fill="#0F1736" />
      </svg>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${1 + 0.08 * push})`, transformOrigin: "960px 760px" }}>
        {/* halo de la pharmacie allumée */}
        <div style={{ position: "absolute", left: 960 - 700, top: 280, width: 1400, height: 900, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba("#9BFFC9", 0.35 * lit)}, transparent)` }} />
        {shops.map((x, i) => (
          <div key={x} style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: `scale(0.8)`, transformOrigin: `${x}px 890px`, filter: i === 1 ? undefined : "brightness(.45) saturate(.4)" }}>
            <Shop x={x} lit={i === 1 ? lit : 0} t={t} />
          </div>
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, top: 890, bottom: 0, background: "linear-gradient(180deg,#141A38,#0B1028)" }} />
        <div style={{ position: "absolute", left: 960 - 330, top: 892, width: 660, height: 120, background: `radial-gradient(closest-side, ${rgba("#BFFFD9", 0.4 * lit)}, transparent)` }} />
        {PASSANTS.slice(0, 4).map((c, i) => {
          const s = a + 0.4 + i * 0.5;
          const k = prog(t, s, 2.4, IN_OUT);
          if (t < s) return null;
          const from = i % 2 ? 1900 : 20;
          const x = lerp(from, 960 + (i % 2 ? 150 : -150), k);
          return (
            <div key={i} style={{ position: "absolute", left: x, top: 770 - Math.abs(Math.sin(k * 18)) * 6, opacity: 1 - prog(t, s + 2.2, 0.3) }}>
              <div style={{ width: 36, height: 36, borderRadius: 99, background: c, margin: "0 auto" }} />
              <div style={{ width: 54, height: 92, borderRadius: "27px 27px 8px 8px", background: c, filter: "brightness(.85)", marginTop: 4 }} />
            </div>
          );
        })}
      </div>
      <Abs x={960} y={150}>
        <Rise t={t} at={a + 0.05} text="Une pharmacie qui *se démarque.*" size={76} color="#FFFFFF" accent={PB.citron} style={{ width: 1600, display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: "0.24em" }} />
      </Abs>
      {t >= pro && (
        <Abs x={960} y={262}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 28px", borderRadius: 999, background: PB.citron, ...tx(36, 800, PB.green), transform: `scale(${1 + 0.6 * (1 - prog(t, pro, 0.22, SNAP))}) rotate(-3deg)`, opacity: prog(t, pro, 0.1), whiteSpace: "nowrap" }}>
            <Check size={34} strokeWidth={3.4} /> Professionnelle
          </span>
        </Abs>
      )}
      <Flash t={t} at={w("A8", "pharmacie") - 0.05} dur={0.35} max={0.3} color="#C8FFE0" />
    </>
  );
}

function Fin({ t }: { t: number }) {
  const btn = ressort(t, FINAL_HIT + 0.05, { damping: 10, stiffness: 240, mass: 0.6 });
  const click = FINAL_HIT + 1.3;
  return (
    <>
      <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 0%, #FFFFFF 0%, ${MINT.paper} 55%, #E2EEEA 100%)` }} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <AdnBackdrop t={t} tone="paper" width={1920} focus={[0.5, 0.35]} style={{ background: "transparent" }} />
      </div>
      <Flash t={t} at={FIN_AT} dur={0.3} max={0.5} />
      <Abs x={960} y={300}>
        <PBLogo t={t} at={FIN_AT} size={120} tone="light" grad />
      </Abs>
      <Ring t={t} at={FIN_AT + 0.1} x={960} y={300} max={1000} color={MINT.green} />
      <Abs x={960} y={520}>
        <Rise t={t} at={w("A8", "le") - 0.1} text="Le copilote IA du comptoir *de votre pharmacie.*" size={62} style={{ width: 1700, display: "flex", justifyContent: "center", columnGap: "0.24em", whiteSpace: "nowrap" }} />
      </Abs>
      {t >= FINAL_HIT && (
        <>
          <Confetti t={t} at={FINAL_HIT + 0.05} x={960} y={420} count={70} power={1500} />
          <Abs x={960} y={710}>
            <div style={{ position: "relative", transform: `scale(${btn * (t > click && t < click + 0.15 ? 0.96 : 1)})`, display: "flex", alignItems: "center", gap: 16, padding: "26px 50px", borderRadius: 999, background: MINT.green, ...tx(42, 800, "#FFFFFF"), boxShadow: `0 24px 50px -20px ${rgba(MINT.green, 0.7)}`, whiteSpace: "nowrap" }}>
              <CalendarCheck size={44} /> Réserver une démonstration
              <span style={{ position: "absolute", inset: 0, borderRadius: 999, overflow: "hidden", pointerEvents: "none" }}>
                <span style={{ position: "absolute", top: 0, bottom: 0, width: 160, left: `${-30 + 160 * (((t - FINAL_HIT) * 0.7) % 1.6)}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent)" }} />
              </span>
            </div>
          </Abs>
          <Abs x={960 + 420 * (1 - prog(t, FINAL_HIT + 0.5, 0.7, IN_OUT)) + 160} y={770 + 220 * (1 - prog(t, FINAL_HIT + 0.5, 0.7, IN_OUT))}>
            <MousePointer2 size={58} fill="#0F2B26" color="#FFFFFF" strokeWidth={1.5} style={{ opacity: prog(t, FINAL_HIT + 0.45, 0.2), transform: `scale(${t > click && t < click + 0.15 ? 0.82 : 1})` }} />
          </Abs>
          <Ring t={t} at={click} x={1110} y={740} max={260} color={MINT.green} />
          <Abs x={960} y={855}>
            <div style={{ opacity: prog(t, FINAL_HIT + 0.35, 0.5), ...tx(38, 800, MINT.deep) }}>pharmaboost.app</div>
          </Abs>
        </>
      )}
      <Sparkle t={t} at={w("A8", "copilote")} x={300} y={460} size={64} color={PB.gold} />
      <Sparkle t={t} at={w("A8", "copilote") + 0.12} x={1620} y={580} size={56} color={MINT.green} />
    </>
  );
}

// =====================================================================================================================
// L'horloge qui grandit (A1 et les accélérés) et le grand chiffre de l'heure
// =====================================================================================================================
function BigClock({ t, h }: { t: number; h: number }) {
  const e = expandAt(t);
  if (t > VAT.A7 + 0.6 && e <= 0) return null;
  if (t >= VAT.A8 - 0.3) return null;
  const intro = t < VAT.A2 + 0.4;
  const cx = intro ? 560 : 960;
  const cy = intro ? 520 : 440;
  const big = intro ? 520 : 470;
  const x = lerp(76, cx, e);
  const y = lerp(66, cy, e);
  const size = lerp(54, big, e);
  const appear = intro ? pop(t, VAT.A1 - 0.4) : 1;
  const ringK = t >= VAT.A2 - 0.08 && t < VAT.A2 + 0.9 ? (t - (VAT.A2 - 0.08)) / 0.98 : 0;
  const lapse = LAPSES.find((l) => t >= l.a - 0.05 && t <= l.b + 0.05);
  const digits = lapse ? prog(t, lapse.a + 0.1, 0.25) * (1 - prog(t, lapse.b - 0.4, 0.3)) : 0;
  return (
    <>
      <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, transform: `scale(${appear})`, filter: `drop-shadow(0 ${20 * e}px ${40 * e}px rgba(15,43,38,${0.35 * e}))` }}>
        <Clock h={h} sec={secAt(t, h)} size={size} ring={ringK} />
      </div>
      {digits > 0 && (
        <Abs x={960} y={790}>
          <div style={{ opacity: digits, transform: `scale(${0.8 + 0.2 * digits})`, fontFamily: MONO, fontWeight: 700, fontSize: 120, color: "#FFFFFF", letterSpacing: "-0.04em", textShadow: "0 10px 40px rgba(15,43,38,.55)", whiteSpace: "nowrap" }}>{hhmm(h)}</div>
        </Abs>
      )}
    </>
  );
}

// ---- Les sous-titres -------------------------------------------------------------------------------------------------
type CapLine = { at: number; words: Word[] };
const CAPTION_LINES: CapLine[] = [];
for (const l of linesOf(1)) {
  if (VAT[l.id] === undefined) continue;
  let cur: Word[] = [];
  for (const wd of M[l.id].words) {
    cur.push(wd);
    if (/[.:?!…]$/.test(wd.w) || (cur.length >= 6 && /,$/.test(wd.w)) || cur.length >= 11) {
      CAPTION_LINES.push({ at: VAT[l.id], words: cur });
      cur = [];
    }
  }
  if (cur.length) CAPTION_LINES.push({ at: VAT[l.id], words: cur });
}
function Captions({ t }: { t: number }) {
  const line = CAPTION_LINES.find((l) => t >= l.at + l.words[0].at - 0.15 && t <= l.at + l.words[l.words.length - 1].end + 0.3);
  if (!line) return null;
  const vt = t - line.at;
  return (
    <Abs x={960} y={1018}>
      <div style={{ maxWidth: 1760, padding: "10px 24px", borderRadius: 16, background: "rgba(255,255,255,.94)", boxShadow: "0 10px 30px -18px rgba(15,43,38,.4)", textAlign: "center", ...tx(31, 700), lineHeight: 1.3, whiteSpace: "nowrap" }}>
        {line.words
          .filter((wd) => wd.w !== ":")
          .map((wd, i, arr) => (
            <span key={i} style={{ color: vt >= wd.at ? MINT.ink : rgba(MINT.ink, 0.3) }}>
              {wd.w.replace(/^…/, "")}
              {i < arr.length - 1 ? (arr[i + 1].w === ":" ? "" : " ") : ""}
            </span>
          ))}
      </div>
    </Abs>
  );
}

// ---- La musique du film iso : tension jusqu'au coup (≈ « Neuf heures »), groove bouclé, fin calée sur le dernier coup --
const DROP_AT = VAT.A2 - 0.05;
const LOOP: [number, number] = [20, 58];
const TAIL_AT = FINAL_HIT - (66 - 58);
type Seg = { at: number; from: number; to: number; gain: (t: number) => number };
const SPANS = linesOf(1).map((l) => [VAT[l.id], end(l.id)] as const);
const duck = (t: number) => {
  let d = 0;
  for (const [a, b] of SPANS) if (t >= a - 0.2 && t <= b + 0.45) d = Math.max(d, Math.min(1, (t - (a - 0.2)) / 0.2, (b + 0.45 - t) / 0.45));
  return d;
};
const level = (t: number) => 0.3 + (0.1 - 0.3) * duck(t);
const MUSIC: Seg[] = [];
MUSIC.push({ at: 0, from: 20 - DROP_AT, to: 20, gain: (t) => Math.min(1, t / 0.8) * (0.2 + (0.11 - 0.2) * duck(t)) });
{
  let at = DROP_AT;
  while (at < TAIL_AT - 0.01) {
    const l = Math.min(LOOP[1] - LOOP[0], TAIL_AT - at);
    MUSIC.push({ at, from: LOOP[0], to: LOOP[0] + l, gain: level });
    at += l;
  }
  MUSIC.push({ at: TAIL_AT, from: 58, to: 69, gain: (t) => Math.max(level(t), t > FINAL_HIT - 0.9 ? 0.42 : 0) * (1 - prog(t, TOTAL - 1.4, 1.35)) });
}

// ---- Les bruitages ---------------------------------------------------------------------------------------------------
const SFX: Cue[] = [
  ...Array.from({ length: 6 }, (_, i) => cue("tic-sec", INTRO_T0 + i + 0.0, 0.32, 1 + (i % 2) * 0.06)).filter((c) => c.at > 0.3 && c.at < VAT.A2 - 0.2),
  cue("pop-leger", VAT.A1 - 0.4, 0.3),
  cue("ui-pop", w("A1", "une"), 0.25),
  cue("whoosh-rapide", w("A1", "commence.") - 0.2, 0.35),
  cue("air-woosh", w("A1", "commence.") - 0.05, 0.4),
  cue("cloche-reussite", VAT.A2 - 0.1, 0.4),
  cue("impact-net", VAT.A2 - 0.08, 0.35),
  cue("pharmacie-ambiance", VAT.A2, 0.25, 1, 5),
  // 9 h
  cue("papier", w("A2", "ordonnance") - 0.3, 0.45),
  cue("boite-posee", w("A2", "boîte") - 0.05, 0.4),
  cue("scanner-bip", w("A2", "scannée…"), 0.55),
  cue("scan-laser", w("A2", "scannée…") - 0.05, 0.25),
  cue("whoosh-pb", w("A2", "pharmaboost") - 0.2, 0.35),
  cue("ui-ding", w("A2", "conseil") + 0.05, 0.4),
  cue("etincelle", w("A2", "crème"), 0.3),
  cue("swoosh", w("A2", "routine") - 0.1, 0.28),
  ...ROUTINE_ROW.slice(1).map((r, i) => cue("pop-leger", w("A2", r.word) - 0.08, 0.34, 1 + i * 0.07)),
  cue("pop-leger", w("A2", "crème") - 0.05, 0.3, 0.95),
  // accéléré 1
  ...LAPSES.flatMap((l) => [cue("whoosh-rapide", l.a - 0.05, 0.38), cue("chrono", l.a + 0.1, 0.32), cue("molette", l.a + 0.25, 0.25), cue("impact-net", l.b - 0.55, 0.3), cue("tic", l.b - 0.5, 0.3)]),
  // 11 h
  cue("boite-posee", w("A3", "antibiotique.") - 0.05, 0.4),
  cue("scanner-bip", w("A3", "scanné…"), 0.55),
  cue("scan-laser", w("A3", "scanné…") - 0.05, 0.25),
  cue("ui-ding", w("A3", "probiotique,") - 0.1, 0.38),
  cue("radar", w("A3", "stock") - 0.2, 0.25),
  ...[w("A3", "date"), w("A3", "challenge"), w("A3", "laboratoire", 1)].map((at, i) => cue("tampon", at - 0.05, 0.42, 1 + i * 0.05)),
  cue("cloche-reussite", w("A3", "laboratoire", 1) + 0.5, 0.32),
  cue("whoosh-rapide", w("A3", "laboratoire", 1) + 1.0, 0.25),
  cue("boite-posee", w("A3", "laboratoire", 1) + 1.55, 0.35),
  // 16 h
  cue("boite-posee", w("A4", "antiallergique.") - 0.1, 0.4),
  cue("scanner-bip", w("A4", "scanné…"), 0.55),
  cue("scan-laser", w("A4", "scanné…") - 0.05, 0.25),
  cue("ui-ding", w("A4", "lavage") - 0.1, 0.38),
  cue("pop-leger", w("A4", "lavage"), 0.3),
  cue("pop-leger", w("A4", "routine") - 0.05, 0.32, 1.06),
  cue("pop-leger", w("A4", "routine") + 0.1, 0.3, 1.12),
  // A5
  cue("whoosh-rapide", VAT.A5 - 0.35, 0.3),
  ...MEMO.map((_m, i) => cue("bulle", w("A5", "tout") - 0.35 + i * 0.07, 0.22, 1 + i * 0.05)),
  cue("aspiration", w("A5", "pharmaboost") - 0.05, 0.35),
  cue("whoosh-pb", w("A5", "pharmaboost") + 0.1, 0.32),
  cue("compteur", VAT.A5 + 0.3, 0.2),
  cue("jauge", w("A5", "chaque") - 0.05, 0.28),
  cue("impact-revelation", w("A5", "potentiel.") - 0.08, 0.35),
  // A6
  cue("whoosh-rapide", VAT.A6 - 0.3, 0.3),
  cue("scanner-bip", w("A6", "scanne") + 0.4, 0.35, 1.15),
  cue("swipe-tel", w("A6", "s'ouvre") - 0.2, 0.35),
  cue("notif-douce", w("A6", "rappel"), 0.35),
  cue("ui-clic", w("A6", "lancez") + 0.15, 0.5),
  cue("avion-papier", w("A6", "offre,") + 0.15, 0.4),
  cue("telephone-vibre", w("A6", "reçoit…") - 0.05, 0.45),
  cue("notif-douce", w("A6", "reçoit…"), 0.38, 1.08),
  cue("whoosh-rapide", w("A6", "revient") - 0.45, 0.28),
  cue("porte-carillon", w("A6", "vous.") - 0.1, 0.4),
  // A7
  cue("porte-ferme", VAT.A7 + 0.25, 0.4),
  cue("whoosh-lourd", VAT.A7 + 0.1, 0.3),
  cue("carte-depliee", w("A7", "titulaire") - 0.25, 0.4),
  cue("compteur", w("A7", "conseils") - 0.1, 0.25),
  cue("montee", w("A7", "chiffre") - 0.1, 0.32),
  cue("caisse", w("A7", "monte,"), 0.35),
  cue("pop-leger", w("A7", "équipe") - 0.1, 0.3),
  cue("coeur", w("A7", "soulagée.") - 0.1, 0.35),
  // A8
  cue("whoosh-cine", VAT.A8 - 0.35, 0.35),
  cue("neon", w("A8", "pharmacie") - 0.05, 0.45),
  cue("tampon", w("A8", "professionnelle.") - 0.05, 0.45),
  cue("impact-net", FIN_AT, 0.45),
  cue("etincelle", w("A8", "copilote"), 0.35),
  cue("confettis", FINAL_HIT + 0.05, 0.35),
  cue("ui-clic", FINAL_HIT + 1.3, 0.45),
];

// =====================================================================================================================
function labelAt(t: number) {
  if (t < SW[0]) return "Isotrétinoïne";
  if (t < SW[1]) return "Antibiotique";
  if (t < VAT.A5 - 0.3) return "Antiallergique";
  if (t < VAT.A6 - 0.3) return "L'équipe";
  if (t < SW[2]) return "Le patient";
  return "Fermeture";
}

function Film() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const h = hourAt(t);
  const speed = Math.abs(hourAt(t + 0.02) - hourAt(t - 0.02)) / 0.04;
  const e = expandAt(t);
  const lapseK = Math.max(0, ...LAPSES.map((l) => prog(t, l.a, 0.3) * (1 - prog(t, l.b - 0.35, 0.3))));
  const shutterMorning = 1 - prog(t, w("A1", "commence.") - 0.1, 0.9, IN_OUT);
  const shutterEvening = prog(t, VAT.A7 + 0.1, 0.9, IN_OUT);
  const shutter = t < VAT.A3 ? shutterMorning : shutterEvening;
  const inShop = t < VAT.A8 - 0.1;
  const streetIn = prog(t, VAT.A8 - 0.4, 0.45, IN_OUT);
  const finIn = prog(t, FIN_AT - 0.1, 0.35, IN_OUT);
  // la caméra : une lente poussée par moment, un coup de zoom à chaque accéléré
  const seg = t < SW[0] ? VAT.A2 : t < SW[1] ? SW[0] : t < VAT.A5 - 0.3 ? SW[1] : t < VAT.A6 - 0.3 ? VAT.A5 : VAT.A6;
  const push = 1 + 0.035 * prog(t, seg, 12, IN_OUT) + 0.05 * lapseK;
  const ribbon = prog(t, VAT.A2 - 0.3, 0.5) * (1 - prog(t, VAT.A8 - 0.6, 0.4));
  const pharmacienne = t >= VAT.A5 - 0.4 && t < VAT.A6 + 0.4;
  return (
    <AbsoluteFill style={{ background: MINT.paper, overflow: "hidden" }}>
      {inShop && (
        <Layer opacity={1 - streetIn}>
          <Layer scale={push} blur={6 * e} origin="38% 60%">
            <Back t={t} h={h} speed={speed} shutter={shutter} />
            {pharmacienne && (
              <div style={{ position: "absolute", inset: 0, opacity: prog(t, VAT.A5 - 0.4, 0.4) * (1 - prog(t, VAT.A6 - 0.2, 0.4)) }}>
                <Pharmacienne t={t} mood="pb" expression="sourire" x={PH_X} y={COUNTER_Y + 10} scale={1.35} wink={w("A5", "potentiel.")} />
              </div>
            )}
            <CounterFront h={h} />
            {t < SW[0] + 0.3 && t > VAT.A2 - 0.5 && (
              <Layer opacity={1 - prog(t, SW[0] - 0.1, 0.3)}>
                <Neuf t={t} />
              </Layer>
            )}
            {t >= SW[0] - 0.1 && t < SW[1] + 0.3 && (
              <Layer opacity={prog(t, SW[0] - 0.1, 0.3) * (1 - prog(t, SW[1] - 0.1, 0.3))}>
                <Onze t={t} />
              </Layer>
            )}
            {t >= SW[1] - 0.1 && t < VAT.A5 && (
              <Layer opacity={prog(t, SW[1] - 0.1, 0.3) * (1 - prog(t, VAT.A5 - 0.4, 0.35))}>
                <Seize t={t} />
              </Layer>
            )}
            {pharmacienne && (
              <Layer opacity={prog(t, VAT.A5 - 0.3, 0.35) * (1 - prog(t, VAT.A6 - 0.3, 0.35))}>
                <Equipe t={t} />
              </Layer>
            )}
          </Layer>
          {t >= VAT.A6 - 0.35 && t < SW[2] + 0.3 && (
            <Layer opacity={prog(t, VAT.A6 - 0.35, 0.35) * (1 - prog(t, SW[2] - 0.1, 0.3))} blur={6 * e}>
              <Bilan t={t} />
            </Layer>
          )}
          {t >= SW[2] - 0.1 && (
            <Layer opacity={prog(t, SW[2] - 0.1, 0.3)}>
              <AbsoluteFill style={{ background: rgba("#0B1230", 0.25 * shutterEvening) }} />
              <Point t={t} />
            </Layer>
          )}
          {/* voile et traînées de l'accéléré */}
          <AbsoluteFill style={{ background: `radial-gradient(60% 60% at 50% 45%, ${rgba("#0F2B26", 0.15 * lapseK)}, ${rgba("#0F2B26", 0.45 * lapseK)})` }} />
          <SpeedLines t={t} k={lapseK} />
          <Intro t={t} />
          <TimeRibbon t={t} h={h} label={labelAt(t)} opacity={ribbon} />
          <BigClock t={t} h={h} />
        </Layer>
      )}
      {streetIn > 0 && finIn < 1 && (
        <Layer opacity={streetIn * (1 - finIn)}>
          <Rue t={t} />
        </Layer>
      )}
      {finIn > 0 && (
        <Layer opacity={finIn}>
          <Fin t={t} />
        </Layer>
      )}
      <Captions t={t} />
      <Grain t={t} opacity={0.02} />
      <Vignette strength={0.12} />
      {linesOf(1).map((l) => (
        <Sequence key={`v-${l.id}`} from={Math.round(VAT[l.id] * FPS)} layout="none" name={`Voix ${l.id}`}>
          <Audio src={staticFile(`promo/voix/${l.id}.wav`)} volume={1} />
        </Sequence>
      ))}
      {MUSIC.map((m, i) => (
        <Sequence key={`m-${i}`} from={Math.max(0, Math.round(m.at * FPS))} durationInFrames={Math.max(1, Math.round((m.to - m.from) * FPS))} layout="none" name={`Musique ${i}`}>
          <Audio src={staticFile("rembobine/music/musique.wav")} startFrom={Math.max(0, Math.round(m.from * FPS))} volume={(f: number) => m.gain(m.at + f / FPS)} />
        </Sequence>
      ))}
      <Cues cues={SFX} />
    </AbsoluteFill>
  );
}

/** Repères pour le compte rendu (temps en secondes). */
export const FILM1_MARKS = { VAT, LAPSES, SW, FIN_AT, FINAL_HIT, TOTAL };
export const FILM = { Film, TOTAL_FRAMES: Math.round(TOTAL * FPS) };
