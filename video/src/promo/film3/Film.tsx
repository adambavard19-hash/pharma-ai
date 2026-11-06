import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Bell, BellRing, Boxes, CalendarCheck, Check, Droplets, Heart, Hourglass, Megaphone, MousePointer2, QrCode, Smile, Sparkles, Star, Sun, TrendingUp, Trophy, Users } from "lucide-react";
import {
  AdnBackdrop,
  BannerHead,
  Bokeh,
  Chip,
  Confetti,
  Cues,
  DUPES,
  Douchette,
  Dupe,
  DupeTile,
  Flash,
  Grain,
  ISO_RX,
  JAKARTA,
  MedBox,
  Notification,
  Ordonnance,
  PB,
  PBLogo,
  Pharmacienne,
  Pharmacy,
  Phone,
  Ring,
  Sparkle,
  Vignette,
  WipeBar,
  clamp01,
  cue,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  wobble,
  EXIT,
  IN_OUT,
  LINEAR,
  SNAP,
  type BannerLine,
  type Cue,
  type DupeKind,
} from "../../rembobine/kit";
import { Abs, Card, Cross, LOCK_BG, MINT, Scene, pop } from "../../lettre/Lettre";
import { FPS, M, linesOf, timeline, type Word } from "../kit";
import { Clara } from "./clara";

/**
 * FILM DE PRÉSENTATION N° 3 — « LA PATIENTE RACONTE » (6 nov. 2026). Clara, 19 ans, raconte (voix de Clémence, en
 * italique entre guillemets) ; le narrateur (Yann) ouvre les coulisses. Huit répliques C1–C8 (src/promo/script.ts).
 *   C1  la rue, en sortant du dermatologue : l'ordonnance d'isotrétinoïne, les inquiétudes en bulles
 *   C2  plongée dans l'écran du comptoir : la boîte sous la douchette, bip, la vraie bannière (conseil puis routine)
 *   C3  au comptoir : la pharmacienne, la crème lavante puis la routine, posées une à une
 *   C4  le radar des coulisses : stock, date courte, challenge du laboratoire, laboratoire préféré du titulaire
 *   C5  le QR code, le bilan conseil sur son téléphone, le rappel avant la fin de cure (calendrier, cloche)
 *   C6  quelques jours plus tard : l'offre de sa pharmacie arrive en notification
 *   C7  elle revient : la porte s'ouvre, « Maintenant, c'est ma pharmacie »
 *   C8  la montée : patiente fidèle, conseils vendus, chiffre d'affaires, équipe soulagée — puis la fin de marque
 * Aucune marque (produits dessinés), « Pharmacie du Centre », jamais de marge sur la bannière.
 */

const tx = (size: number, weight = 700, color: string = MINT.ink): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, color, letterSpacing: size > 24 ? "-0.02em" : 0 });
const Example = ({ dark = false }: { dark?: boolean }) => <span style={{ ...tx(14, 700, dark ? "rgba(255,255,255,.7)" : MINT.soft), padding: "4px 10px", borderRadius: 99, background: dark ? "rgba(255,255,255,.1)" : "#EEF3F1" }}>Exemple</span>;
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const ISO = "Isotrétinoïne 20 mg";

/** Un titre dont les mots montent un à un (comme Rise, avec une vraie espace entre les mots) ; *entre étoiles* = accent. */
function Rise({ t, at, text, size = 70, color = MINT.ink, accent = MINT.green, stagger = 0.07, style }: { t: number; at: number; text: string; size?: number; color?: string; accent?: string; stagger?: number; style?: CSSProperties }) {
  let on = false;
  const words = text.split(/\s+/).map((raw) => {
    const startOn = on;
    if (raw.startsWith("*")) on = true;
    const isAccent = on || startOn;
    if (raw.endsWith("*") && raw.length > 1) on = false;
    return { w: raw.replace(/\*/g, ""), accent: isAccent };
  });
  return (
    <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.03em", lineHeight: 1.08, color, textAlign: "center", ...style }}>
      {words.map((wd, i) => {
        const k = prog(t, at + i * stagger, 0.42, SNAP);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", padding: "0.04em 0.05em 0.2em", margin: `-0.04em ${i < words.length - 1 ? "0.22em" : "0"} -0.2em 0` }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - k) * 110}%) rotate(${(1 - k) * 5}deg)`, transformOrigin: "0 100%", opacity: t < at + i * stagger - 0.04 ? 0 : 1, color: wd.accent ? accent : undefined }}>{wd.w}</span>
          </span>
        );
      })}
    </div>
  );
}

const ROUTINE: { k: DupeKind; gest: string; Icon: typeof Sun }[] = [
  { k: "iso-nettoyant", gest: "Nettoyer", Icon: Droplets },
  { k: "iso-hydratant", gest: "Hydrater", Icon: Sparkles },
  { k: "iso-levres", gest: "Lèvres", Icon: Smile },
  { k: "iso-solaire", gest: "Soleil", Icon: Sun },
];

// ---- La ligne de temps ---------------------------------------------------------------------------------------------
const { VAT, end, w } = timeline();
VAT.C1 = 1.3;
VAT.C2 = end("C1") + 0.6;
VAT.C3 = end("C2") + 0.55;
VAT.C4 = end("C3") + 0.55;
VAT.C5 = end("C4") + 0.55;
VAT.C6 = end("C5") + 0.95;
VAT.C7 = end("C6") + 0.75;
VAT.C8 = end("C7") + 0.6;
const PB_AT = w("C8", "pharmaboost");
const FINAL_HIT = end("C8") + 0.35;
const TOTAL = FINAL_HIT + 2.9;
const TOTAL_FRAMES = Math.round(TOTAL * FPS);

// Les bornes des tableaux
const DIVE = VAT.C2 - 0.15; // la plongée dans l'écran du comptoir
const SCREEN_IN = VAT.C2 + 0.45;
const COMPTOIR_IN = end("C2") + 0.3;
const RADAR_IN = VAT.C4 - 0.2;
const BILAN_IN = VAT.C5 - 0.25;
const OFFRE_IN = end("C5") + 0.35;
const RETOUR_IN = VAT.C7 - 0.45;
const FINALE_IN = VAT.C8 - 0.2;

// La bannière du comptoir : le conseil, puis la routine.
const BANNER: BannerLine[] = [
  { n: 1, drug: ISO, product: "Crème lavante apaisante", image: "kind:iso-nettoyant", chips: [{ kind: "stock", text: "6 en stock", at: w("C2", "conseil") + 0.15 }], at: w("C2", "pharmaboost"), openAt: w("C2", "bon") - 0.1 },
  { n: 2, drug: ISO, product: "Routine · 4 produits", routine: ["kind:iso-nettoyant", "kind:iso-hydratant", "kind:iso-levres", "kind:iso-solaire"], chips: [{ kind: "plain", text: "Nettoyer · Hydrater · Lèvres · Soleil", at: w("C2", "va") }], at: w("C2", "routine") - 0.12 },
];

// =====================================================================================================================
// C1 · La rue, en sortant du dermatologue
// =====================================================================================================================
function Immeubles({ t, pan }: { t: number; pan: number }) {
  const blocks = [
    { x: -120, w: 380, h: 640, c: "#EFE3D3" },
    { x: 260, w: 330, h: 720, c: "#E4ECE6" },
    { x: 590, w: 420, h: 600, c: "#F3E9DD" },
    { x: 1010, w: 460, h: 760, c: "#EAE1F0" },
    { x: 1470, w: 560, h: 680, c: "#F1E6DA" },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateX(${pan}px)` }}>
      {blocks.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: b.x, top: 880 - b.h, width: b.w, height: b.h, background: b.c, boxShadow: "inset -10px 0 0 rgba(15,43,38,.04)" }}>
          {Array.from({ length: Math.floor(b.h / 150) }, (_, r) =>
            Array.from({ length: Math.floor(b.w / 120) }, (_, c) => {
              const lit = (i * 7 + r * 3 + c * 5) % 4 === 0;
              return <div key={`${r}-${c}`} style={{ position: "absolute", left: 30 + c * 120, top: 50 + r * 150, width: 64, height: 92, borderRadius: "32px 32px 4px 4px", background: lit ? "linear-gradient(180deg,#FFE7B8,#FFD48A)" : "linear-gradient(180deg,#D7E3E8,#C6D5DC)", boxShadow: "0 0 0 6px rgba(255,255,255,.55)", opacity: lit ? 0.85 + 0.15 * Math.sin(t * 2 + r + c) : 1 }} />;
            }),
          )}
        </div>
      ))}
      {/* Le cabinet de dermatologie : la porte et sa plaque */}
      <div style={{ position: "absolute", left: 1070, top: 520, width: 230, height: 360, borderRadius: "115px 115px 0 0", background: "linear-gradient(180deg,#5D7E86,#45646C)", boxShadow: "0 0 0 14px #F8F4EE" }}>
        <div style={{ position: "absolute", left: 22, right: 22, top: 40, bottom: 0, borderRadius: "93px 93px 0 0", border: "4px solid rgba(255,255,255,.25)" }} />
        <div style={{ position: "absolute", right: 30, top: 200, width: 14, height: 14, borderRadius: 99, background: "#E9C46A" }} />
      </div>
      <div style={{ position: "absolute", left: 1330, top: 600, width: 180, padding: "14px 16px", borderRadius: 10, background: "linear-gradient(160deg,#F1D79A,#D9B567)", boxShadow: "0 10px 20px -10px rgba(0,0,0,.4)", ...tx(17, 800, "#4A3A12"), lineHeight: 1.2, textAlign: "center" }}>
        Cabinet de
        <br />
        dermatologie
      </div>
    </div>
  );
}

function Rue({ t }: { t: number }) {
  const walkK = prog(t, 0, 1.3, IN_OUT);
  const X = lerp(470, 700, walkK);
  const Y = 470;
  const S = 1.25;
  const walk = 1 - prog(t, 1.05, 0.3);
  const cam = 1 + 0.07 * prog(t, 0, VAT.C2 + 0.4, LINEAR);
  const pan = -60 * prog(t, 0, VAT.C2, LINEAR);
  const pres = w("C1", "prescrit");
  const iso = w("C1", "l'isotrétinoïne");
  const peur = w("C1", "j'avais");
  const hold = prog(t, 0.95, 0.45, SNAP);
  const lookDown = prog(t, pres - 0.4, 0.4) * (1 - prog(t, peur - 0.15, 0.35));
  const insert = pop(t, pres - 0.05);
  const insertOut = prog(t, peur + 0.2, 0.4, IN_OUT);
  const hl = prog(t, iso, 0.6, IN_OUT);
  const handsDown = { l: { x: -92, y: 300 }, r: { x: 92, y: 300 } };
  const handsUp = { l: { x: -34, y: 172 }, r: { x: 44, y: 176 } };
  const hands: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: lerp(handsDown.l.x, handsUp.l.x, hold), y: lerp(handsDown.l.y, handsUp.l.y, hold) },
    { x: lerp(handsDown.r.x, handsUp.r.x, hold), y: lerp(handsDown.r.y, handsUp.r.y, hold) },
  ];
  const worries = [
    { text: "Sécheresse ?", x: 330, y: 250, at: w("C1", "peur") - 0.15 },
    { text: "Les effets ?", x: 1010, y: 230, at: w("C1", "effets") - 0.1 },
    { text: "Le soleil ?", x: 300, y: 470, at: w("C1", "effets") + 0.12 },
    { text: "Mes lèvres ?", x: 1060, y: 450, at: w("C1", "effets") + 0.3 },
  ];
  const ordX = X + 5 * S;
  const ordY = Y + 112 * S;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${cam})`, transformOrigin: "700px 420px" }}>
        <AbsoluteFill style={{ background: "linear-gradient(180deg,#FFF3E4 0%,#FDE4D2 55%,#F7D6C8 100%)" }} />
        <div style={{ position: "absolute", left: 1500, top: 60, width: 260, height: 260, borderRadius: 999, background: "radial-gradient(circle,#FFF6D8 0%,rgba(255,214,150,.55) 45%,transparent 70%)" }} />
        <Immeubles t={t} pan={pan} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 880, height: 14, background: "#D9CFC3" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 894, bottom: 0, background: "linear-gradient(180deg,#EFE8DF,#E4DBD0)" }} />
        <Bokeh t={t} count={14} seed={31} alpha={0.28} colors={["#FFE3B0", "#FFFFFF", PB.citron]} area={[0, 0, 1920, 760]} />
        <Clara t={t} x={X} y={Y} scale={S} expr={t > peur - 0.1 ? "inquiete" : "neutre"} talk={[[VAT.C1, end("C1")]]} spots={0.8} hands={hands} tilt={lookDown * 9} look={[-2 * lookDown, 4 * lookDown]} walk={walk} phase={t * 7.2} />
        {hold > 0.05 && (
          <div style={{ position: "absolute", left: 0, top: 0, opacity: clamp01(hold * 2) }}>
            <Ordonnance x={ordX} y={ordY + (1 - hold) * 120} w={150} rotate={-6} lines={ISO_RX} />
            <div style={{ position: "absolute", left: X + hands[0].x * S - 18, top: Y + hands[0].y * S - 20, width: 34, height: 30, borderRadius: 16, background: "#F2C9A9" }} />
            <div style={{ position: "absolute", left: X + hands[1].x * S - 16, top: Y + hands[1].y * S - 20, width: 34, height: 30, borderRadius: 16, background: "#F2C9A9" }} />
          </div>
        )}
      </div>
      {/* Le gros plan sur l'ordonnance */}
      {insert > 0 && insertOut < 1 && (
        <Abs x={1470} y={470} style={{ opacity: 1 - insertOut }}>
          <div style={{ transform: `scale(${0.7 + 0.3 * Math.min(1.05, insert)}) rotate(${4 - 2 * insertOut}deg) translateY(${insertOut * 40}px)`, filter: "drop-shadow(0 40px 50px rgba(15,43,38,.35))" }}>
            <div style={{ position: "relative", width: 380, height: 380 * 1.38 }}>
              <Ordonnance w={380} lines={ISO_RX} write={prog(t, pres, 0.9, LINEAR)} />
              <div style={{ position: "absolute", left: (20 / 300) * 380, top: (116 / 300) * 380, width: (236 / 300) * 380 * hl, height: (36 / 300) * 380, borderRadius: 6, background: rgba("#E8FF9C", 0.75), mixBlendMode: "multiply" }} />
            </div>
          </div>
        </Abs>
      )}
      {/* Les inquiétudes */}
      {worries.map((q) => {
        const k = pop(t, q.at);
        if (k <= 0) return null;
        const out = prog(t, VAT.C2 - 0.5, 0.3, EXIT);
        return (
          <Abs key={q.text} x={q.x} y={q.y + wobble(t, q.x, 6, 0.8) - out * 30}>
            <div style={{ transform: `scale(${k})`, opacity: 1 - out, display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderRadius: 999, background: "#FFFFFF", boxShadow: "0 18px 36px -18px rgba(15,43,38,.5)", ...tx(30, 800), fontStyle: "italic", whiteSpace: "nowrap" }}>
              <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 99, background: "#FDE4DD", alignItems: "center", justifyContent: "center", ...tx(22, 800, "#C2554A"), fontStyle: "normal" }}>?</span>
              {q.text}
            </div>
          </Abs>
        );
      })}
      {/* Le nom de Clara */}
      <Abs x={260} y={110}>
        <div style={{ opacity: prog(t, 0.3, 0.5) * (1 - prog(t, VAT.C1 + 2.0, 0.4)), transform: `translateX(${(1 - prog(t, 0.3, 0.6, SNAP)) * -30}px)` }}>
          <div style={{ padding: "12px 22px", borderRadius: 16, background: "rgba(255,255,255,.88)", boxShadow: "0 14px 30px -18px rgba(15,43,38,.4)" }}>
            <div style={tx(30, 800)}>Clara, 19 ans</div>
            <div style={tx(18, 600, MINT.soft)}>en sortant du dermatologue</div>
          </div>
        </div>
      </Abs>
    </AbsoluteFill>
  );
}

// =====================================================================================================================
// C2 · La plongée dans l'écran du comptoir, la boîte scannée, la bannière
// =====================================================================================================================
function Plongee({ t }: { t: number }) {
  if (t < DIVE - 0.05 || t > SCREEN_IN + 0.3) return null;
  const z = prog(t, DIVE + 0.1, 0.65, (x) => x * x * x);
  const inK = prog(t, DIVE, 0.2);
  const outK = prog(t, SCREEN_IN - 0.15, 0.3);
  const scale = 1 + 5.5 * z;
  return (
    <AbsoluteFill style={{ opacity: inK * (1 - outK), overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: `${432}px ${400}px`, transform: `scale(${scale})`, filter: z > 0.5 ? `blur(${(z - 0.5) * 6}px)` : undefined }}>
        <Pharmacy t={t} mood="pb" screen="pb" screenPower={prog(t, DIVE, 0.4, LINEAR)} screenTilt={18 * (1 - z)}>
          <Pharmacienne t={t} mood="pb" expression="sourire" />
        </Pharmacy>
      </div>
    </AbsoluteFill>
  );
}

function Ecran({ t }: { t: number }) {
  const a = VAT.C2;
  const beam = w("C2", "scannée") + 0.08;
  const boxIn = prog(t, a + 0.5, 0.35, SNAP);
  const boxOut = 0;
  const done = pop(t, beam + 0.15);
  const dIn = prog(t, a + 0.55, 0.35, SNAP);
  const dOut = prog(t, beam + 0.55, 0.35, EXIT);
  const kick = pulse(t, beam - 0.04, 0.05, 0.04, 0.2);
  const lit = pulse(t, beam, 0.03, 0.22, 0.12);
  const s0 = w("C2", "en");
  const s1 = w("C2", "pharmaboost");
  const ring = prog(t, s0, s1 - s0, LINEAR);
  const timerK = pop(t, s0 - 0.1);
  const timerOut = prog(t, w("C2", "conseil"), 0.35, IN_OUT);
  const hl = w("C2", "conseil");
  return (
    <AbsoluteFill style={{ background: "#F4F8F6", overflow: "hidden" }}>
      <AdnBackdrop t={t} tone="paper" width={1800} focus={[0.42, 0.5]} drift={1.2} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 52% 60% at 22% 52%, ${rgba("#FFFFFF", 0.55)} 0%, transparent 70%)` }} />
      <Abs x={330} y={110}>
        <div style={{ opacity: prog(t, a + 0.3, 0.4), transform: `translateY(${(1 - prog(t, a + 0.3, 0.5, SNAP)) * -20}px)`, display: "flex", alignItems: "center", gap: 12, padding: "12px 22px", borderRadius: 999, background: PB.green, ...tx(22, 800, PB.citron), letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
          <Cross size={22} color={PB.citron} /> EN COULISSES · L&apos;ÉCRAN DU COMPTOIR
        </div>
      </Abs>
      {/* la boîte et la douchette */}
      {t >= a + 0.45 && (
        <>
          {done > 0 && (
            <Abs x={386} y={860}>
              <div style={{ transform: `scale(${done})`, display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", borderRadius: 999, background: "#FFFFFF", boxShadow: "0 16px 34px -18px rgba(15,43,38,.5)", ...tx(28, 800), whiteSpace: "nowrap" }}>
                <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 99, background: MINT.green, alignItems: "center", justifyContent: "center" }}>
                  <Check size={22} color="#FFFFFF" strokeWidth={3} />
                </span>
                Boîte scannée
              </div>
            </Abs>
          )}
          <MedBox kind="isotretinoine" w={340} x={386 + lerp(-640, 0, boxIn) + lerp(0, 160, boxOut)} y={720 + lerp(0, 520, boxOut * boxOut) + wobble(t, 12, 5, 0.6) * done} rotate={lerp(-12, 0, boxIn) + lerp(0, 20, boxOut) + wobble(t, 13, 1.5, 0.5) * done} t={t} />
          {lit > 0 && <div style={{ position: "absolute", left: 386 - 215, top: 720 - 255, width: 430, height: 290, background: `radial-gradient(ellipse at 50% 55%, ${rgba("#FF3B3B", 0.22 * lit)} 0%, transparent 65%)` }} />}
        </>
      )}
      {dOut < 1 && t >= a + 0.5 && (
        <Douchette t={t} x={400 + lerp(-420, 0, dIn) + lerp(0, -380, dOut) + wobble(t, 64, 3, 0.9)} y={420 + lerp(-420, 0, dIn) + lerp(0, -520, dOut) - 10 * kick} angle={lerp(-38, -6, dIn) + 6 * kick + lerp(0, -30, dOut)} size={1.4} beamAt={[beam]} beamDur={0.34} beamLength={118} beamWidth={330} />
      )}
      {/* la bannière */}
      <BannerHead t={t} lines={BANNER} width={920} x={1240} y={470} scale={1.04 + 0.02 * prog(t, hl, 1.2, IN_OUT)} highlight={{ n: 1, at: hl + 0.1 }} style={{ opacity: prog(t, a + 0.4, 0.35) }} />
      {/* « En une seconde » */}
      {timerK > 0 && timerOut < 1 && (
        <Abs x={1240} y={760}>
          <div style={{ transform: `scale(${timerK})`, opacity: 1 - timerOut, display: "flex", alignItems: "center", gap: 18, padding: "16px 30px 16px 18px", borderRadius: 999, background: "#FFFFFF", boxShadow: "0 22px 44px -22px rgba(15,43,38,.5)" }}>
            <svg width={64} height={64} viewBox="0 0 64 64">
              <circle cx={32} cy={32} r={26} fill="none" stroke="#E3ECE8" strokeWidth={8} />
              <circle cx={32} cy={32} r={26} fill="none" stroke={MINT.green} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ring} transform="rotate(-90 32 32)" />
            </svg>
            <span style={tx(34, 800)}>
              {ring < 1 ? "Analyse…" : "Prêt"} <span style={{ color: MINT.green }}>en 1 seconde</span>
            </span>
          </div>
        </Abs>
      )}
      <Sparkle t={t} at={w("C2", "routine")} x={1640} y={540} size={60} color={MINT.green} />
    </AbsoluteFill>
  );
}

// =====================================================================================================================
// C3 · Au comptoir : la pharmacienne lui présente la crème lavante, puis la routine
// =====================================================================================================================
const SHELF_X = [866, 962, 1058, 1154];
function Comptoir({ t }: { t: number }) {
  const a = VAT.C3;
  const elle = w("C3", "elle");
  const push = prog(t, elle - 0.2, 1.8, IN_OUT);
  const z = 1.22 + 0.2 * push + 0.03 * prog(t, COMPTOIR_IN, 4, LINEAR);
  const fx = 1040 + 120 * push;
  const fy = 470 - 30 * push;
  const at = [w("C3", "crème") - 0.1, w("C3", "routine"), w("C3", "complète"), w("C3", "sécheresse") - 0.1];
  const smile = t > w("C3", "savait");
  const routineK = pop(t, w("C3", "routine") - 0.1);
  const routineOut = prog(t, elle + 0.2, 0.4, IN_OUT);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#F4F8F6" }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: `translate(960px, 540px) scale(${z}) translate(${-fx}px, ${-fy}px)` }}>
        <Pharmacy
          t={t}
          mood="pb"
          screen="pb"
          screenContent={
            <AbsoluteFill style={{ background: "#F4F8F6" }}>
              <BannerHead t={t} lines={BANNER} width={920} x={800} y={470} scale={1.45} />
            </AbsoluteFill>
          }
        >
          <Pharmacienne t={t} mood="pb" expression="sourire" talk={[[a + 0.1, w("C3", "douce") + 0.4], [w("C3", "puis") - 0.1, end("C3") - 1.6]]} wink={w("C3", "exactement") + 0.1} />
          {ROUTINE.map((r, i) => {
            const k = pop(t, at[i]);
            if (k <= 0) return null;
            const h = 128;
            const wd = (h * 100) / 160;
            return (
              <div key={r.k} style={{ position: "absolute", left: SHELF_X[i] - wd / 2, top: 572 - h, transformOrigin: "50% 100%", transform: `scale(${k}) translateY(${(1 - Math.min(1, k)) * -60}px)` }}>
                <Dupe kind={r.k} h={h} />
              </div>
            );
          })}
          <Clara t={t} x={1352} y={395} expr={smile ? "sourire" : "neutre"} spots={0.7} tilt={smile ? -4 : 2} look={[-3, 0]} />
        </Pharmacy>
      </div>
      {/* Les gestes, chacun sur son produit (dans le repère de l'image, après la caméra) */}
      {ROUTINE.map((r, i) => {
        const k = pop(t, at[i] + 0.08);
        if (k <= 0 || routineOut >= 1) return null;
        const sx = 960 + (SHELF_X[i] - fx) * z;
        const sy = 540 + (572 - 128 - 34 - fy) * z;
        return (
          <Abs key={r.k} x={sx} y={sy}>
            <div style={{ transform: `scale(${Math.min(1, k)})`, opacity: 1 - routineOut, display: "inline-flex", width: 52, height: 52, borderRadius: 99, background: "#FFFFFF", boxShadow: `0 10px 22px -10px rgba(15,43,38,.5), 0 0 0 3px ${rgba(MINT.green, 0.35)}`, alignItems: "center", justifyContent: "center" }}>
              <r.Icon size={28} color={MINT.green} />
            </div>
          </Abs>
        );
      })}
      {/* L'étiquette : le conseil, puis la routine */}
      <Abs x={1010} y={150}>
        <div style={{ opacity: (1 - routineOut) * prog(t, at[0], 0.3), transform: `translateY(${(1 - prog(t, at[0], 0.5, SNAP)) * -20 - routineOut * 30}px)`, display: "flex", alignItems: "center", gap: 14 }}>
          <Card style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px 10px 10px", borderRadius: 20 }}>
            <DupeTile kind="iso-nettoyant" size={56} radius={14} />
            <div>
              <div style={{ ...tx(13, 800, MINT.green), letterSpacing: "0.12em" }}>LE CONSEIL</div>
              <div style={{ ...tx(22, 800), whiteSpace: "nowrap" }}>Crème lavante très douce</div>
            </div>
          </Card>
          {routineK > 0 && (
            <div style={{ transform: `scale(${Math.min(1, routineK)})` }}>
              <Card style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", borderRadius: 20 }}>
                <span style={tx(28, 800, MINT.green)}>+</span>
                <div>
                  <div style={{ ...tx(13, 800, MINT.green), letterSpacing: "0.12em" }}>LA ROUTINE</div>
                  <div style={{ ...tx(22, 800), whiteSpace: "nowrap" }}>contre la sécheresse</div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </Abs>
      {smile && (
        <>
          <Sparkle t={t} at={w("C3", "exactement")} x={960 + (1290 - fx) * z} y={540 + (230 - fy) * z} size={70} color={PB.gold} />
          <Sparkle t={t} at={w("C3", "exactement") + 0.15} x={960 + (1420 - fx) * z} y={540 + (300 - fy) * z} size={50} color={MINT.green} />
          {[0, 1, 2].map((i) => {
            const k = prog(t, w("C3", "exactement") + i * 0.18, 1.4, LINEAR);
            if (k <= 0 || k >= 1) return null;
            return (
              <div key={i} style={{ position: "absolute", left: 960 + (1430 + i * 30 - fx) * z, top: 540 + (260 - fy) * z - k * 160, opacity: Math.sin(Math.PI * k) }}>
                <Heart size={34 - i * 6} fill="#F08DA0" color="#F08DA0" />
              </div>
            );
          })}
        </>
      )}
    </AbsoluteFill>
  );
}

// =====================================================================================================================
// C4 · Le radar des coulisses
// =====================================================================================================================
const CENTER = { x: 960, y: 470, d: 290 };
function Portrait({ t, d, expression = "sourire" }: { t: number; d: number; expression?: "sourire" | "neutre" }) {
  const s = (d / 290) * 0.95;
  return (
    <div style={{ position: "relative", width: d, height: d, borderRadius: 999, overflow: "hidden", background: "radial-gradient(circle at 50% 35%, #EAF6F0, #BFE3D6)" }}>
      <Pharmacienne t={t} mood="pb" expression={expression} x={d / 2 - 6 * s} y={d * 0.4 + 262 * s} scale={s} />
    </div>
  );
}

function Radar({ t }: { t: number }) {
  const a = VAT.C4;
  const crossed = w("C4", "croisé");
  const titu = w("C4", "titulaire");
  const ph = w("C4", "pharmacienne");
  const calm = prog(t, ph - 0.2, 0.6, IN_OUT);
  const nodes = [
    { at: w("C4", "stock") - 0.12, x: 400, y: 250, Icon: Boxes, color: "#36D69A", title: "Le stock", sub: "6 crèmes lavantes en rayon" },
    { at: w("C4", "date") - 0.1, x: 1520, y: 250, Icon: Hourglass, color: "#FF7A6B", title: "La date courte", sub: "Baume lèvres · à écouler en premier" },
    { at: w("C4", "challenge") - 0.1, x: 400, y: 690, Icon: Trophy, color: PB.gold, title: "Le challenge du laboratoire", sub: "Laboratoire partenaire · ce mois-ci" },
    { at: w("C4", "laboratoire", 1) - 0.1, x: 1520, y: 690, Icon: Star, color: PB.citron, title: "Le laboratoire préféré", sub: "Celui que le titulaire a choisi" },
  ];
  const sweep = (t - a) * 140;
  const ringK = prog(t, crossed - 0.2, 0.8, SNAP);
  const portraitK = pop(t, a + 0.05);
  const done = w("C4", "retenir");
  const badge = pop(t, done - 0.05);
  const result = prog(t, titu + 0.35, 0.5, SNAP);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 80% at 50% 45%, #174238 0%, ${PB.green} 55%, #081C18 100%)`, overflow: "hidden" }}>
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(${rgba(PB.citron, 0.13)} 1.6px, transparent 1.8px)`, backgroundSize: "36px 36px", backgroundPosition: `${(t * 6) % 36}px 0px`, opacity: 0.8 }} />
      {/* les cercles et le balayage du radar */}
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={1920} height={1080}>
        {[210, 340, 470, 600].map((r, i) => (
          <circle key={r} cx={CENTER.x} cy={CENTER.y} r={r * (0.85 + 0.15 * ringK)} fill="none" stroke={rgba(PB.mint, 0.12 - i * 0.02)} strokeWidth={2} strokeDasharray={i % 2 ? "6 10" : undefined} />
        ))}
      </svg>
      <div style={{ position: "absolute", left: CENTER.x - 620, top: CENTER.y - 620, width: 1240, height: 1240, borderRadius: 999, background: `conic-gradient(from ${sweep}deg, ${rgba(PB.mint, 0.22)} 0deg, transparent 70deg, transparent 360deg)`, opacity: 0.8 * (1 - 0.5 * calm) }} />
      <Ring t={t} at={crossed} x={CENTER.x} y={CENTER.y} max={900} color={PB.mint} />
      {/* les fils lumineux */}
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1920} height={1080}>
        {nodes.map((n, i) => {
          const left = n.x < 960;
          const x0 = left ? n.x + 240 : n.x - 240;
          const x1 = CENTER.x + (left ? -150 : 150);
          const y1 = CENTER.y + (n.y < 470 ? -60 : 60);
          const d = `M${x0},${n.y} C${(x0 + x1) / 2},${n.y} ${(x0 + x1) / 2},${y1} ${x1},${y1}`;
          const draw = prog(t, n.at + 0.15, 0.45, IN_OUT);
          if (draw <= 0) return null;
          const flow = (((t - n.at) * 0.9) % 1 + 1) % 1;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={rgba(n.color, 0.35)} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
              {draw >= 1 && (
                <>
                  <path d={d} fill="none" stroke={n.color} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray="0.08 0.92" strokeDashoffset={-flow} style={{ filter: `drop-shadow(0 0 8px ${n.color})` }} />
                  <path d={d} fill="none" stroke={n.color} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray="0.05 0.95" strokeDashoffset={-((flow + 0.5) % 1)} style={{ filter: `drop-shadow(0 0 8px ${n.color})` }} />
                </>
              )}
            </g>
          );
        })}
      </svg>
      {/* les quatre sources */}
      {nodes.map((n, i) => {
        const k = pop(t, n.at);
        if (k <= 0) return null;
        return (
          <Abs key={i} x={n.x} y={n.y + wobble(t, i + 40, 4, 0.7)}>
            <div style={{ transform: `scale(${k * (1 - 0.08 * calm)})`, opacity: 1 - 0.35 * calm, width: 480, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 18, padding: "20px 22px", borderRadius: 26, background: "rgba(255,255,255,.08)", backdropFilter: "blur(8px)", boxShadow: `inset 0 0 0 2px ${rgba(n.color, 0.45)}, 0 30px 60px -30px rgba(0,0,0,.6)` }}>
              <span style={{ display: "inline-flex", flexShrink: 0, width: 70, height: 70, borderRadius: 20, background: rgba(n.color, 0.18), alignItems: "center", justifyContent: "center", boxShadow: `0 0 ${18 * pulse(t, n.at, 0.05, 0.1, 0.6)}px ${n.color}` }}>
                <n.Icon size={38} color={n.color} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...tx(28, 800, "#FFFFFF"), whiteSpace: "nowrap" }}>{n.title}</div>
                <div style={{ ...tx(19, 600, "rgba(255,255,255,.72)"), whiteSpace: "nowrap", marginTop: 4 }}>{n.sub}</div>
              </div>
            </div>
          </Abs>
        );
      })}
      {/* la pharmacienne, au centre */}
      <Abs x={CENTER.x} y={CENTER.y}>
        <div style={{ position: "relative", transform: `scale(${Math.min(1.05, portraitK) * (1 + 0.1 * calm)})` }}>
          <div style={{ position: "absolute", inset: -14, borderRadius: 999, boxShadow: `0 0 0 3px ${rgba(PB.citron, 0.6)}, 0 0 ${50 + 30 * Math.sin(t * 3)}px ${rgba(PB.mint, 0.45)}` }} />
          <Portrait t={t} d={CENTER.d} />
          {badge > 0 && (
            <span style={{ position: "absolute", right: 0, bottom: 10, display: "inline-flex", width: 74, height: 74, borderRadius: 99, background: "#2BD67B", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 6px #0F2F2A", transform: `scale(${badge})` }}>
              <Check size={44} color="#FFFFFF" strokeWidth={3.4} />
            </span>
          )}
        </div>
      </Abs>
      <Ring t={t} at={done} x={CENTER.x} y={CENTER.y} max={520} color={PB.citron} />
      <Sparkle t={t} at={done + 0.1} x={CENTER.x + 170} y={CENTER.y - 150} size={70} color={PB.citron} />
      {/* le conseil qui en sort */}
      {result > 0 && (
        <Abs x={CENTER.x} y={800}>
          <div style={{ opacity: result, transform: `translateY(${(1 - result) * 30}px)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 24px 14px 14px", borderRadius: 24, background: "#FFFFFF", boxShadow: `0 0 0 3px ${rgba(PB.citron, 0.7)}, 0 30px 60px -24px rgba(0,0,0,.6)` }}>
              <DupeTile kind="iso-nettoyant" size={78} radius={18} />
              <div>
                <div style={{ ...tx(26, 800), whiteSpace: "nowrap" }}>Crème lavante apaisante</div>
                <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                  <Chip t={t} kind="stock" text="6 en stock" at={titu + 0.5} size={19} />
                  <Chip t={t} kind="challenge" text="Challenge" at={titu + 0.6} size={19} />
                  <Chip t={t} kind="plain" text="Labo du titulaire" at={titu + 0.7} size={19} />
                </div>
              </div>
            </div>
          </div>
        </Abs>
      )}
      {t < ph - 0.25 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 92, transform: `translateY(-50%) translateY(${-30 * prog(t, ph - 0.6, 0.35, IN_OUT)}px)`, opacity: 1 - prog(t, ph - 0.6, 0.35, IN_OUT) }}>
          <Rise t={t} at={a + 0.05} text="Derrière, PharmaBoost *croise tout.*" size={56} color="#FFFFFF" accent={PB.citron} style={{ width: 1700, margin: "0 auto" }} />
        </div>
      )}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 92, transform: "translateY(-50%)" }}>
          {t >= ph - 0.25 && (
            <div style={{ opacity: 1 }}>
              <Rise t={t} at={ph - 0.25} text="Elle n'a *rien à retenir.*" size={56} color="#FFFFFF" accent={PB.citron} style={{ width: 1700, margin: "0 auto" }} />
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// =====================================================================================================================
// C5 · Le QR code, le bilan sur son téléphone, le rappel avant la fin de cure
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

function AppBilan({ t, at }: { t: number; at: number }) {
  const rappel = w("C5", "rappel");
  const lit = prog(t, rappel - 0.1, 0.25, SNAP);
  const st = (i: number): CSSProperties => ({ opacity: prog(t, at + 0.1 * i, 0.35), transform: `translateY(${(1 - prog(t, at + 0.1 * i, 0.35, SNAP)) * 16}px)` });
  const ring = prog(t, rappel - 0.1, 1.2, IN_OUT);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#EEF3F1", padding: "58px 14px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...st(0) }}>
        <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 10, background: PB.green, alignItems: "center", justifyContent: "center" }}>
          <Cross size={18} color={PB.citron} />
        </span>
        <span style={tx(16, 800, "#101828")}>PharmaBoost</span>
        <span style={{ marginLeft: "auto", ...tx(12, 600, "#64748B") }}>Pharmacie du Centre</span>
      </div>
      <div style={{ marginTop: 14, ...tx(25, 800, "#0B3B47"), ...st(1) }}>Mon bilan conseil</div>
      <div style={{ marginTop: 2, ...tx(13, 600, "#475467"), ...st(1) }}>Pour : isotrétinoïne 20 mg</div>
      <div style={{ marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 12, boxShadow: "0 0 0 1px #E4ECE9", ...st(2) }}>
        <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Ma routine</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {ROUTINE.map((r, i) => {
            const p = ressort(t, at + 0.35 + 0.1 * i, { damping: 12, stiffness: 260, mass: 0.5 });
            return (
              <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 6, opacity: clamp01(p * 3), transform: `scale(${lerp(0.7, 1, clamp01(p))})` }}>
                <DupeTile kind={r.k} size={40} radius={10} />
                <span style={{ lineHeight: 1.1, ...tx(11.5, 700, "#101828") }}>{DUPES[r.k].short}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 12, boxShadow: "0 0 0 1px #E4ECE9", ...st(3) }}>
        <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Chaque jour</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {ROUTINE.map(({ Icon, gest }) => (
            <span key={gest} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", borderRadius: 10, background: "#EAF5EF", ...tx(12.5, 700, MINT.deep) }}>
              <Icon size={14} /> {gest}
            </span>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 12, display: "flex", alignItems: "center", gap: 12, boxShadow: lit > 0.01 ? `0 0 0 ${3 * lit}px ${rgba(MINT.green, 0.6)}, 0 10px 24px -14px rgba(0,0,0,.3)` : "0 0 0 1px #E4ECE9", transform: `scale(${1 + 0.03 * lit})`, ...st(4) }}>
        <svg width={50} height={50} viewBox="0 0 56 56">
          <circle cx={28} cy={28} r={23} fill="none" stroke="#E3ECE8" strokeWidth={7} />
          <circle cx={28} cy={28} r={23} fill="none" stroke={MINT.green} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - 0.82 * ring} transform="rotate(-90 28 28)" />
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Rappel</div>
          <div style={tx(14, 800, "#101828")}>Avant la fin de ma cure</div>
        </div>
        <Bell size={22} color={MINT.green} style={{ transform: `rotate(${lit > 0 ? Math.sin(t * 30) * 14 * (1 - prog(t, rappel + 0.8, 0.4)) : 0}deg)` }} />
      </div>
    </div>
  );
}

function Bilan({ t }: { t: number }) {
  const a = VAT.C5;
  const scan = w("C5", "scanné");
  const opens = w("C5", "bilan") - 0.2;
  const qrIn = prog(t, BILAN_IN, 0.6, SNAP);
  const camera = prog(t, scan - 0.25, 0.3, SNAP) * (1 - prog(t, opens, 0.35));
  const beamY = ((t - scan) % 1.0) / 1.0;
  const opened = prog(t, opens, 0.45, SNAP);
  const lean = keys3(t, scan - 0.2, opens);
  const calAt = w("C5", "avec") - 0.1;
  const calK = pop(t, calAt);
  const rappel = w("C5", "rappel");
  const fin = w("C5", "fin");
  const cells = 28;
  const lastWeek = 21;
  const bell = rappel;
  const bellK = pop(t, bell - 0.05);
  return (
    <AbsoluteFill style={{ background: MINT.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 0%, #FFFFFF 0%, ${MINT.paper} 55%, #E2EEEA 100%)` }} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.3 }}>
        <AdnBackdrop t={t} tone="paper" width={1920} focus={[0.5, 0.3]} style={{ background: "transparent" }} />
      </div>
      {/* le QR code, sur le comptoir */}
      <Abs x={420} y={480}>
        <div style={{ opacity: qrIn, transform: `scale(${0.9 + 0.1 * qrIn}) rotate(-3deg)` }}>
          <Card style={{ width: 400, padding: "28px 28px 24px", borderRadius: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <span style={tx(28, 800)}>Votre bilan conseil</span>
            <QrArt size={240} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, ...tx(20, 700, MINT.soft) }}>
              <QrCode size={22} color={MINT.green} /> Scannez avec votre téléphone
            </span>
          </Card>
        </div>
      </Abs>
      {/* le faisceau du téléphone vers le QR code */}
      {camera > 0.05 && (
        <svg style={{ position: "absolute", left: 0, top: 0 }} width={1920} height={1080}>
          <polygon points={`${830 - 40 * lean},${400} ${830 - 40 * lean},${640} 620,${600} 620,${360}`} fill={rgba(MINT.green, 0.12 * camera)} />
        </svg>
      )}
      <Phone t={t} x={960 - 50 * lean} y={515} scale={0.94 * (0.9 + 0.1 * qrIn)} tilt={-10 + 14 * lean} buzz={fin - 0.1} style={{ opacity: qrIn }}>
        <div style={{ position: "absolute", inset: 0 }}>
          {camera > 0.01 && (
            <div style={{ position: "absolute", inset: 0, background: "#0B1714", opacity: camera, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "relative", width: 230, height: 230, borderRadius: 24, border: `4px solid ${MINT.green}` }}>
                <div style={{ position: "absolute", inset: 18, opacity: 0.9 }}>
                  <QrArt size={186} light />
                </div>
                <div style={{ position: "absolute", left: 10, right: 10, top: `${10 + beamY * 200}px`, height: 4, borderRadius: 4, background: MINT.green, boxShadow: `0 0 18px ${MINT.green}` }} />
              </div>
            </div>
          )}
          {opened > 0.01 && (
            <div style={{ position: "absolute", inset: 0, opacity: opened }}>
              <AppBilan t={t} at={opens} />
            </div>
          )}
          <Notification t={t} at={fin - 0.1} icon="calendar" app="Pharmacie du Centre" title="Votre cure se termine bientôt" body="Pensez à repasser : votre pharmacienne vous attend." until={end("C5") + 1.2} />
        </div>
      </Phone>
      <Ring t={t} at={opens + 0.05} x={960} y={515} max={480} color={MINT.green} />
      {/* le calendrier de la cure */}
      {calK > 0 && (
        <Abs x={1520} y={470}>
          <div style={{ transform: `scale(${Math.min(1.04, calK)}) rotate(2deg)` }}>
            <Card style={{ width: 430, padding: "24px 26px", borderRadius: 30 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ display: "inline-flex", width: 48, height: 48, borderRadius: 14, background: MINT.bg, alignItems: "center", justifyContent: "center" }}>
                  <CalendarCheck size={26} color={MINT.green} />
                </span>
                <div>
                  <div style={tx(26, 800)}>Ma cure</div>
                  <div style={tx(16, 600, MINT.soft)}>Isotrétinoïne · routine</div>
                </div>
                <span style={{ marginLeft: "auto", display: "inline-flex", width: 56, height: 56, borderRadius: 99, background: bellK > 0 ? "#FFF1D6" : "#F1F5F3", alignItems: "center", justifyContent: "center", transform: `scale(${bellK > 0 ? Math.min(1.15, 0.85 + 0.3 * bellK) : 1}) rotate(${bellK > 0 ? Math.sin((t - bell) * 26) * 22 * Math.exp(-(t - bell) * 1.6) : 0}deg)` }}>
                  <BellRing size={30} color={bellK > 0 ? PB.gold : "#9AA9A4"} />
                </span>
              </div>
              <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                {Array.from({ length: cells }, (_, i) => {
                  const tick = calAt + 0.2 + i * 0.028;
                  const done = t >= tick && i < lastWeek;
                  const final = i >= lastWeek;
                  const glow = final ? prog(t, rappel - 0.1 + (i - lastWeek) * 0.05, 0.3, SNAP) : 0;
                  const isEnd = i === cells - 1;
                  return (
                    <div key={i} style={{ height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: done ? MINT.green : final ? rgba(PB.gold, 0.12 + 0.25 * glow) : "#EEF3F1", boxShadow: isEnd && glow > 0 ? `0 0 0 ${3 * glow}px ${PB.gold}` : undefined, transform: `scale(${done ? 1 : final ? 1 + 0.06 * glow : 0.96})` }}>
                      {done ? <Check size={18} color="#FFFFFF" strokeWidth={3} /> : isEnd ? <span style={tx(15, 800, "#8A5A00")}>Fin</span> : <span style={tx(13, 700, final ? "#8A5A00" : "#9AA9A4")}>{i + 1}</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 16, background: "#FFF7E6", opacity: prog(t, rappel, 0.3), transform: `translateY(${(1 - prog(t, rappel, 0.4, SNAP)) * 12}px)` }}>
                <Bell size={22} color={PB.gold} />
                <span style={tx(19, 800, "#6A4A00")}>Rappel 7 jours avant la fin</span>
              </div>
            </Card>
          </div>
        </Abs>
      )}
    </AbsoluteFill>
  );
}
/** Le téléphone se penche vers le QR code pendant le scan, puis revient. */
function keys3(t: number, a: number, b: number) {
  return prog(t, a, 0.3, SNAP) * (1 - prog(t, b, 0.45, IN_OUT));
}

// =====================================================================================================================
// C6 · Quelques jours plus tard : l'offre de sa pharmacie
// =====================================================================================================================
function Offre({ t }: { t: number }) {
  const a = VAT.C6;
  const lance = w("C6", "lance");
  const offre = w("C6", "offre");
  const recoit = w("C6", "reçoit");
  const notif = w("C6", "notification");
  const fly = prog(t, offre - 0.05, 0.55, IN_OUT);
  const card = pop(t, lance - 0.15);
  const smile = t > recoit + 0.1;
  const day = prog(t, OFFRE_IN, 0.9, IN_OUT);
  const phone = { x: 1360, y: 515, s: 0.96 };
  const from = { x: 880, y: 170 };
  const to = { x: phone.x, y: phone.y - 260 };
  const fx = lerp(from.x, to.x, fly);
  const fy = lerp(from.y, to.y, fly) - Math.sin(Math.PI * fly) * 120;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg,#FFF1E2 0%,#FBE2D2 60%,#F3D4C6 100%)" }} />
      {/* la fenêtre et la lumière du soir */}
      <div style={{ position: "absolute", left: 120, top: 120, width: 360, height: 460, borderRadius: 20, background: "linear-gradient(180deg,#FFD9A8,#F7B79A 60%,#E9A3A8)", boxShadow: "0 0 0 16px #FFFFFF, 0 30px 60px -30px rgba(0,0,0,.3)" }}>
        <div style={{ position: "absolute", left: 178, top: 0, bottom: 0, width: 6, background: "#FFFFFF" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 226, height: 6, background: "#FFFFFF" }} />
        <div style={{ position: "absolute", left: 210, top: 300 - 40 * day, width: 90, height: 90, borderRadius: 99, background: "radial-gradient(circle,#FFF4D0,#FFD27A 60%,transparent 72%)" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 800, bottom: 0, background: "#EBCDBE" }} />
      {/* la plante */}
      <div style={{ position: "absolute", left: 1700, top: 640, width: 120, height: 160, borderRadius: "10px 10px 30px 30px", background: "#E6EFEA" }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ position: "absolute", left: 1755, top: 645, width: 34, height: 140, borderRadius: "50%", background: i % 2 ? "#7DB394" : "#5D9577", transformOrigin: "50% 100%", transform: `translate(-50%, -100%) rotate(${-40 + i * 20 + wobble(t, i + 70, 3, 0.6)}deg)` }} />
      ))}
      <Clara t={t} x={600} y={500} scale={1.12} flip expr={smile ? "sourire" : "neutre"} spots={0.35} hands={[{ x: -40, y: 168 }, { x: 10, y: 178 }]} tilt={smile ? -3 : 6} look={[-4, 5]} />
      {/* son téléphone, dans ses mains */}
      <div style={{ position: "absolute", left: 600 + 30 * 1.12 - 38, top: 500 + 120 * 1.12, width: 76, height: 130, borderRadius: 16, background: "#14201E", boxShadow: "inset 0 0 0 4px #26302E", transform: "rotate(8deg)" }}>
        <div style={{ position: "absolute", inset: 6, borderRadius: 11, background: LOCK_BG, opacity: 0.9 }} />
        {t >= recoit && <div style={{ position: "absolute", left: 10, right: 10, top: 18, height: 20, borderRadius: 6, background: "rgba(255,255,255,.92)" }} />}
      </div>
      {[0, 1].map((i) => (
        <div key={i} style={{ position: "absolute", left: 600 + (i ? -10 : 40) * 1.12 - 17, top: 500 + (i ? 178 : 168) * 1.12 - 15, width: 34, height: 30, borderRadius: 16, background: "#F2C9A9" }} />
      ))}
      {/* « Quelques jours plus tard » */}
      <Abs x={290} y={70}>
        <div style={{ opacity: prog(t, OFFRE_IN, 0.4) * (1 - prog(t, recoit, 0.4)), display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderRadius: 999, background: "rgba(255,255,255,.9)", ...tx(22, 800), whiteSpace: "nowrap" }}>
          <CalendarCheck size={24} color={MINT.green} /> Quelques jours plus tard
        </div>
      </Abs>
      {/* la pharmacie lance son offre */}
      {card > 0 && (
        <Abs x={from.x} y={from.y}>
          <div style={{ transform: `scale(${card})`, display: "flex", alignItems: "center", gap: 14, padding: "14px 24px 14px 14px", borderRadius: 22, background: PB.green, boxShadow: "0 24px 50px -24px rgba(15,43,38,.7)" }}>
            <span style={{ display: "inline-flex", width: 52, height: 52, borderRadius: 16, background: rgba(PB.citron, 0.16), alignItems: "center", justifyContent: "center", transform: `rotate(${Math.sin(t * 9) * 6}deg)` }}>
              <Megaphone size={30} color={PB.citron} />
            </span>
            <div>
              <div style={{ ...tx(14, 800, PB.citron), letterSpacing: "0.12em" }}>PHARMACIE DU CENTRE</div>
              <div style={{ ...tx(24, 800, "#FFFFFF"), whiteSpace: "nowrap" }}>Nouvelle offre de la semaine</div>
            </div>
          </div>
        </Abs>
      )}
      {fly > 0 && fly < 1 && (
        <div style={{ position: "absolute", left: fx - 14, top: fy - 14, width: 28, height: 28, borderRadius: 99, background: PB.citron, boxShadow: `0 0 24px ${PB.citron}, 0 0 0 6px ${rgba(PB.citron, 0.3)}` }} />
      )}
      <Ring t={t} at={recoit - 0.05} x={to.x} y={to.y + 40} max={360} color={MINT.green} />
      {/* le téléphone, en grand */}
      <Phone t={t} x={phone.x} y={phone.y} scale={phone.s * (0.92 + 0.08 * prog(t, OFFRE_IN, 0.6, SNAP))} tilt={-12} buzz={recoit - 0.05} screen={LOCK_BG} style={{ opacity: prog(t, OFFRE_IN, 0.4) }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 96 }}>
          <span style={tx(17, 700, "rgba(255,255,255,.92)")}>jeudi 19 novembre</span>
          <span style={{ ...tx(86, 800, "#FFFFFF"), letterSpacing: "-0.04em", lineHeight: 1.05 }}>18:42</span>
        </div>
        <Notification t={t} at={recoit} icon="robot" app="Pharmacie du Centre" title="L'offre de la semaine" body="−15 % sur votre soin hydratant, à retirer dans votre pharmacie." style={{ top: 250 }} />
        <Notification t={t} at={notif + 0.35} icon="calendar" app="Pharmacie du Centre" title="Votre bilan conseil" body="Votre routine et vos conseils, toujours ici." style={{ top: 370 }} />
      </Phone>
      <Sparkle t={t} at={recoit + 0.1} x={phone.x + 180} y={phone.y - 220} size={56} color={PB.citron} />
      {smile && <Sparkle t={t} at={recoit + 0.25} x={600 + 120} y={500 - 200} size={50} color={PB.gold} />}
      <Abs x={phone.x + 250} y={phone.y + 360}>
        <div style={{ opacity: prog(t, notif, 0.3) }}>
          <Example />
        </div>
      </Abs>
    </AbsoluteFill>
  );
}

// =====================================================================================================================
// C7 · Elle revient : « Maintenant, c'est ma pharmacie »
// =====================================================================================================================
function Facade({ t, open, glow }: { t: number; open: number; glow: number }) {
  const SHELF = ["#2C9AB7", "#0E8A7B", "#7A5BD0", "#F2A23A", "#1E88C8", "#D0485F", "#109C7C"];
  const vitrine = (left: number, wd: number) => (
    <div style={{ position: "absolute", left, top: 330, width: wd, height: 420, borderRadius: 12, background: "linear-gradient(160deg,#F4FFE8,#DFF5E8)", boxShadow: `inset 0 0 0 8px ${MINT.ink}`, overflow: "hidden" }}>
      {[0, 1, 2].map((r) => (
        <div key={r} style={{ position: "absolute", left: 24, right: 24, top: 120 + r * 110, height: 8, borderRadius: 4, background: rgba(MINT.ink, 0.22) }}>
          {Array.from({ length: Math.floor((wd - 60) / 44) }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: 6 + i * 44, bottom: 8, width: 32, height: 40 + ((i * 7 + r * 3) % 4) * 8, borderRadius: 5, background: SHELF[(i + r) % 7] }} />
          ))}
        </div>
      ))}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,.4) 40%, transparent 52%)" }} />
    </div>
  );
  const dl = 1120;
  const dw = 300;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: 720, top: 130, width: 1140, height: 750, background: "#FBF8F3", boxShadow: "0 40px 80px -40px rgba(15,43,38,.4)" }} />
      <div style={{ position: "absolute", left: 750, top: 170, width: 1080, height: 100, borderRadius: 16, background: MINT.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 22 }}>
        <Cross size={46} color="#2BD67B" glow={0.4 + 0.6 * glow} />
        <span style={{ ...tx(46, 800, "#FFFFFF"), letterSpacing: "0.2em" }}>PHARMACIE DU CENTRE</span>
      </div>
      <svg style={{ position: "absolute", left: 740, top: 270 }} width={1100} height={56} viewBox="0 0 1100 56">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M${i * 78.6} 0 h78.6 v32 a39.3 22 0 0 1 -78.6 0 Z`} fill={i % 2 ? "#FFFFFF" : MINT.green} stroke={rgba(MINT.ink, 0.08)} />
        ))}
      </svg>
      {vitrine(760, 330)}
      {vitrine(1450, 370)}
      {/* l'intérieur, derrière la porte */}
      <div style={{ position: "absolute", left: dl, top: 340, width: dw, height: 540, background: `linear-gradient(180deg, #FFF6DD, #FFE9B8)`, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: `radial-gradient(circle at 50% 40%, rgba(255,255,255,${0.6 * open}), transparent 70%)` }} />
        <div style={{ position: "absolute", left: -dl, top: -340, width: 1920, height: 1080 }}>
          <Pharmacienne t={t} mood="pb" expression="sourire" x={1270} y={700} scale={0.62} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 360, bottom: 0, background: "linear-gradient(180deg,#E7F0EC,#D5E4DE)", borderTop: "8px solid #FFFFFF" }} />
      </div>
      {/* les deux portes coulissantes */}
      {[0, 1].map((i) => (
        <div key={i} style={{ position: "absolute", left: dl + (i ? dw / 2 : 0) + (i ? 1 : -1) * open * (dw / 2 - 16), top: 340, width: dw / 2, height: 540, background: "rgba(214,236,230,.55)", boxShadow: `inset 0 0 0 7px ${MINT.ink}`, backdropFilter: "blur(1px)" }}>
          <div style={{ position: "absolute", left: i ? 18 : dw / 2 - 30, top: 250, width: 12, height: 70, borderRadius: 6, background: MINT.ink }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,.35) 42%, transparent 55%)" }} />
        </div>
      ))}
      <div style={{ position: "absolute", left: dl - 10, top: 326, width: dw + 20, height: 16, borderRadius: 4, background: MINT.ink }} />
      {/* la lumière qui sort */}
      <div style={{ position: "absolute", left: dl - 200, top: 760, width: dw + 400, height: 200, background: `radial-gradient(ellipse at 50% 20%, rgba(255,226,150,${0.5 * open}), transparent 65%)` }} />
    </div>
  );
}

function Retour({ t }: { t: number }) {
  const a = VAT.C7;
  const walkK = prog(t, RETOUR_IN, 1.0, IN_OUT);
  const X = lerp(-140, 470, walkK);
  const walk = 1 - prog(t, RETOUR_IN + 0.85, 0.25);
  const open = prog(t, a + 0.05, 0.8, IN_OUT);
  const ma = w("C7", "pharmacie");
  const ailleurs = w("C7", "nulle");
  const glow = prog(t, ma - 0.2, 0.5) ;
  const cam = 1 + 0.06 * prog(t, RETOUR_IN, 4, LINEAR);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${cam})`, transformOrigin: "800px 520px" }}>
        <AbsoluteFill style={{ background: "linear-gradient(180deg,#EAF6F0 0%,#F7F3EC 70%)" }} />
        {/* la rue */}
        <div style={{ position: "absolute", left: -40, top: 260, width: 640, height: 620, background: "#EDE7DE", filter: "saturate(.6)" }}>
          {[0, 1].map((r) =>
            [0, 1, 2, 3].map((c) => <div key={`${r}${c}`} style={{ position: "absolute", left: 60 + c * 140, top: 60 + r * 170, width: 80, height: 110, borderRadius: 8, background: "#D6DEDF" }} />),
          )}
        </div>
        <Facade t={t} open={open} glow={glow} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 880, height: 14, background: "#D9CFC3" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 894, bottom: 0, background: "linear-gradient(180deg,#EFE8DF,#E4DBD0)" }} />
        <Clara t={t} x={X} y={480} scale={1.18} flip expr="sourire" talk={[[a, end("C7")]]} spots={0} walk={walk} phase={t * 7.2} tilt={-3} look={[-3, -1]} />
      </div>
      <Ring t={t} at={ma - 0.1} x={1270} y={400} max={700} color={MINT.green} />
      {/* « Ma pharmacie » */}
      <Abs x={1270} y={66}>
        <div style={{ transform: `scale(${pop(t, ma - 0.15)})`, display: "flex", alignItems: "center", gap: 14, padding: "14px 28px", borderRadius: 999, background: "#FFFFFF", boxShadow: `0 20px 40px -20px rgba(15,43,38,.5), 0 0 0 3px ${rgba("#F08DA0", 0.5)}`, ...tx(34, 800), whiteSpace: "nowrap" }}>
          <Heart size={34} fill="#F08DA0" color="#F08DA0" style={{ transform: `scale(${1 + 0.12 * Math.max(0, Math.sin(t * 7))})` }} /> Ma pharmacie
        </div>
      </Abs>
      {Array.from({ length: 7 }, (_, i) => {
        const k = prog(t, ailleurs + i * 0.14, 1.6, LINEAR);
        if (k <= 0 || k >= 1) return null;
        return (
          <div key={i} style={{ position: "absolute", left: 520 + ((i * 53) % 140) - 40 + Math.sin(k * 6 + i) * 20, top: 300 - k * 260, opacity: Math.sin(Math.PI * k) }}>
            <Heart size={26 + (i % 3) * 8} fill={i % 2 ? "#F08DA0" : "#2BD67B"} color={i % 2 ? "#F08DA0" : "#2BD67B"} />
          </div>
        );
      })}
      <Sparkle t={t} at={ailleurs + 0.2} x={1700} y={300} size={70} color={PB.gold} />
      <Sparkle t={t} at={ailleurs + 0.4} x={800} y={360} size={50} color={MINT.green} />
    </AbsoluteFill>
  );
}

// =====================================================================================================================
// C8 · La montée : patiente fidèle, conseils vendus, chiffre d'affaires, équipe soulagée
// =====================================================================================================================
function Tile({ t, at, x, y, children, out }: { t: number; at: number; x: number; y: number; children: ReactNode; out: number }) {
  const k = pop(t, at);
  if (k <= 0) return null;
  return (
    <Abs x={x + (x < 960 ? -1 : 1) * out * 160} y={y + wobble(t, x + y, 3, 0.6)}>
      <div style={{ transform: `scale(${Math.min(1.03, k) * (1 - 0.3 * out)})`, opacity: 1 - out, transformOrigin: "50% 50%" }}>
        <Card style={{ position: "relative", width: 820, height: 360, boxSizing: "border-box", padding: "30px 36px", borderRadius: 32, overflow: "hidden" }}>{children}</Card>
      </div>
    </Abs>
  );
}

function Finale({ t }: { t: number }) {
  const fid = w("C8", "patiente") - 0.1;
  const cons = w("C8", "conseils") - 0.1;
  const ca = w("C8", "chiffre") - 0.1;
  const eq = w("C8", "équipe") - 0.1;
  const out = prog(t, PB_AT - 0.35, 0.35, EXIT);
  const visits = [0, 1, 2, 3, 4];
  const count = Math.round(lerp(0, 148, prog(t, cons + 0.1, 1.3, IN_OUT)));
  const caK = prog(t, ca + 0.1, 1.6, IN_OUT);
  const chart = [0.12, 0.18, 0.16, 0.3, 0.36, 0.48, 0.55, 0.7, 0.78, 0.95];
  const relief = prog(t, w("C8", "soulagée") - 0.05, 0.4, SNAP);
  return (
    <>
      <Tile t={t} at={fid} x={510} y={290} out={out}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, height: "100%" }}>
          <div style={{ position: "relative", width: 210, height: 210, borderRadius: 999, overflow: "hidden", flexShrink: 0, background: "radial-gradient(circle at 50% 35%, #FFF1E6, #F7D6C8)" }}>
            <Clara t={t} x={112} y={200} scale={0.92} expr="sourire" legs={false} spots={0} />
          </div>
          <div>
            <div style={{ ...tx(16, 800, MINT.green), letterSpacing: "0.12em" }}>FIDÉLITÉ</div>
            <div style={tx(40, 800)}>Une patiente fidèle</div>
            <div style={{ marginTop: 18, display: "flex", gap: 12 }}>
              {visits.map((i) => {
                const k = pop(t, fid + 0.3 + i * 0.16);
                return (
                  <span key={i} style={{ display: "inline-flex", width: 50, height: 50, borderRadius: 99, background: k > 0 ? MINT.green : "#EEF3F1", alignItems: "center", justifyContent: "center", transform: `scale(${k > 0 ? Math.min(1.1, k) : 1})` }}>
                    {k > 0 ? <Heart size={24} fill="#FFFFFF" color="#FFFFFF" /> : null}
                  </span>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={tx(20, 600, MINT.soft)}>5 visites · elle revient</span>
              <Example />
            </div>
          </div>
        </div>
      </Tile>
      <Tile t={t} at={cons} x={1410} y={290} out={out}>
        <div style={{ ...tx(16, 800, MINT.green), letterSpacing: "0.12em" }}>CE MOIS-CI</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <span style={{ ...tx(110, 800, MINT.ink), letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", lineHeight: 1.05 }}>{count}</span>
          <span style={tx(40, 800)}>conseils vendus</span>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center" }}>
          {ROUTINE.map((r, i) => {
            const k = pop(t, cons + 0.25 + i * 0.12);
            return (
              <div key={r.k} style={{ transform: `scale(${Math.max(0, Math.min(1.08, k))}) translateY(${(1 - Math.min(1, k)) * 30}px)` }}>
                <DupeTile kind={r.k} size={84} radius={20} />
              </div>
            );
          })}
          <span style={{ marginLeft: "auto" }}>
            <Example />
          </span>
        </div>
      </Tile>
      <Tile t={t} at={ca} x={510} y={705} out={out}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ ...tx(16, 800, MINT.green), letterSpacing: "0.12em" }}>CHIFFRE D&apos;AFFAIRES CONSEIL</span>
          <span style={{ marginLeft: "auto" }}>
            <Example />
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
          <span style={{ ...tx(76, 800), letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>+ {fmt(6240 * caK)} €</span>
          <TrendingUp size={56} color={MINT.green} style={{ transform: `translateY(${-6 * Math.sin(t * 4)}px)` }} />
        </div>
        <svg width={748} height={140} viewBox="0 0 748 140" style={{ position: "absolute", left: 36, bottom: 24 }}>
          <defs>
            <linearGradient id="f3ca" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={MINT.green} stopOpacity={0.35} />
              <stop offset="1" stopColor={MINT.green} stopOpacity={0} />
            </linearGradient>
            <clipPath id="f3clip">
              <rect x={0} y={0} width={748 * caK} height={140} />
            </clipPath>
          </defs>
          <g clipPath="url(#f3clip)">
            <path d={`M0,140 ${chart.map((v, i) => `L${(i / (chart.length - 1)) * 748},${130 - v * 120}`).join(" ")} L748,140 Z`} fill="url(#f3ca)" />
            <path d={`M${chart.map((v, i) => `${(i / (chart.length - 1)) * 748},${130 - v * 120}`).join(" L")}`} fill="none" stroke={MINT.green} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {caK > 0.02 && <circle cx={748 * caK} cy={130 - interp(chart, caK) * 120} r={10} fill="#FFFFFF" stroke={MINT.green} strokeWidth={5} />}
        </svg>
      </Tile>
      <Tile t={t} at={eq} x={1410} y={705} out={out}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Users size={30} color={MINT.green} />
          <span style={{ ...tx(16, 800, MINT.green), letterSpacing: "0.12em" }}>L&apos;ÉQUIPE</span>
        </div>
        <div style={{ marginTop: 4, ...tx(44, 800) }}>Une équipe soulagée</div>
        <div style={{ marginTop: 26, display: "flex", gap: 26 }}>
          {["#F0BAC6", "#9CC7F0", "#F6D98A", "#C9B8F0", "#8EEBD3"].map((c, i) => {
            const k = pop(t, eq + 0.15 + i * 0.08);
            const hop = relief * Math.max(0, Math.sin((t - w("C8", "soulagée") - i * 0.07) * 9)) * 10 * Math.exp(-Math.max(0, t - w("C8", "soulagée")) * 1.5);
            return (
              <div key={c} style={{ transform: `scale(${Math.max(0, Math.min(1.08, k))}) translateY(${-hop}px)` }}>
                <svg width={96} height={96} viewBox="0 0 96 96">
                  <circle cx={48} cy={48} r={46} fill={c} />
                  <circle cx={34} cy={42} r={5} fill="#0F2B26" />
                  <circle cx={62} cy={42} r={5} fill="#0F2B26" />
                  <path d={relief > 0.5 ? "M30,60 Q48,78 66,60" : "M32,64 Q48,62 64,64"} fill="none" stroke="#0F2B26" strokeWidth={5} strokeLinecap="round" />
                </svg>
              </div>
            );
          })}
        </div>
      </Tile>
      <Sparkle t={t} at={w("C8", "soulagée")} x={1700} y={600} size={64} color={PB.gold} />
      <Sparkle t={t} at={w("C8", "grandit")} x={760} y={590} size={56} color={MINT.green} />
    </>
  );
}
function interp(arr: number[], k: number) {
  const f = k * (arr.length - 1);
  const i = Math.min(arr.length - 2, Math.floor(f));
  return lerp(arr[i], arr[i + 1], f - i);
}

// =====================================================================================================================
// La fin de marque
// =====================================================================================================================
function Fin({ t }: { t: number }) {
  const pb = PB_AT;
  const finalIn = t >= FINAL_HIT - 0.05;
  const btn = ressort(t, FINAL_HIT + 0.3, { damping: 10, stiffness: 240, mass: 0.6 });
  const sloganOut = prog(t, FINAL_HIT - 0.3, 0.3, IN_OUT);
  const press = t > FINAL_HIT + 1.25 && t < FINAL_HIT + 1.4;
  return (
    <>
      <Flash t={t} at={pb - 0.05} dur={0.3} max={0.5} />
      <Flash t={t} at={FINAL_HIT} dur={0.35} max={0.5} />
      <Abs x={960} y={finalIn ? 320 : 330}>
        <PBLogo t={t} at={finalIn ? FINAL_HIT : pb} size={finalIn ? 130 : 120} tone="light" grad />
      </Abs>
      <Ring t={t} at={pb + 0.1} x={960} y={330} max={1000} color={MINT.green} />
      <Ring t={t} at={w("C8", "copilote") - 0.05} x={960} y={560} max={700} color={PB.citron} />
      <Sparkle t={t} at={w("C8", "copilote")} x={300} y={460} size={64} color={PB.gold} />
      <Sparkle t={t} at={w("C8", "copilote") + 0.12} x={1620} y={580} size={56} color={MINT.green} />
      {!finalIn && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - sloganOut }}>
          <Abs x={960} y={580}>
            <Rise t={t} at={w("C8", "le") - 0.1} text="Le copilote IA du comptoir *de votre pharmacie.*" size={66} style={{ width: 1600 }} />
          </Abs>
          <Abs x={960} y={760}>
            <div style={{ display: "flex", gap: 18 }}>
              {ROUTINE.map((r, i) => (
                <div key={r.k} style={{ transform: `scale(${Math.min(1, pop(t, w("C8", "comptoir") + i * 0.1))})` }}>
                  <DupeTile kind={r.k} size={86} radius={20} />
                </div>
              ))}
            </div>
          </Abs>
        </div>
      )}
      {finalIn && (
        <>
          <Confetti t={t} at={FINAL_HIT + 0.1} x={960} y={420} count={70} power={1500} />
          <Abs x={960} y={560}>
            <div style={{ opacity: prog(t, FINAL_HIT + 0.2, 0.45), ...tx(54, 800), letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
              Le copilote IA <span style={{ color: MINT.green }}>du comptoir de votre pharmacie.</span>
            </div>
          </Abs>
          <Abs x={960} y={740}>
            <div style={{ position: "relative", transform: `scale(${btn * (press ? 0.96 : 1)})`, display: "flex", alignItems: "center", gap: 16, padding: "26px 50px", borderRadius: 999, background: MINT.green, ...tx(42, 800, "#FFFFFF"), boxShadow: `0 24px 50px -20px ${rgba(MINT.green, 0.7)}`, whiteSpace: "nowrap" }}>
              <CalendarCheck size={44} /> Réserver une démonstration
              <span style={{ position: "absolute", inset: 0, borderRadius: 999, overflow: "hidden", pointerEvents: "none" }}>
                <span style={{ position: "absolute", top: 0, bottom: 0, width: 160, left: `${-30 + 160 * (((t - FINAL_HIT) * 0.7) % 1.6)}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent)" }} />
              </span>
            </div>
          </Abs>
          <Abs x={960 + 420 * (1 - prog(t, FINAL_HIT + 0.5, 0.7, IN_OUT)) + 140} y={780 + 160 * (1 - prog(t, FINAL_HIT + 0.5, 0.7, IN_OUT))}>
            <MousePointer2 size={58} fill="#0F2B26" color="#FFFFFF" strokeWidth={1.5} style={{ opacity: prog(t, FINAL_HIT + 0.45, 0.2), transform: `scale(${press ? 0.82 : 1})` }} />
          </Abs>
          <Ring t={t} at={FINAL_HIT + 1.28} x={1100} y={760} max={260} color={MINT.green} />
          <Abs x={960} y={862}>
            <div style={{ opacity: prog(t, FINAL_HIT + 0.7, 0.45), ...tx(36, 800, MINT.deep) }}>pharmaboost.app</div>
          </Abs>
          <Sparkle t={t} at={FINAL_HIT + 0.2} x={1240} y={320} size={80} color={PB.gold} />
        </>
      )}
    </>
  );
}

// =====================================================================================================================
// Sous-titres, musique, bruitages
// =====================================================================================================================
const LINES3 = linesOf(3);
type CapLine = { at: number; words: Word[]; quote: boolean };
const CAPTION_LINES: CapLine[] = [];
for (const l of LINES3) {
  const quote = l.who === "clemence";
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
      <div style={{ maxWidth: 1760, padding: "10px 24px", borderRadius: 16, background: "rgba(255,255,255,.94)", boxShadow: "0 10px 30px -18px rgba(15,43,38,.4)", textAlign: "center", ...tx(31, 700), lineHeight: 1.3, whiteSpace: "nowrap", fontStyle: line.quote ? "italic" : undefined }}>
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

// La musique de « Rembobinons » : l'intro calme sur la rue, le groove dès la plongée dans l'écran, la fin calée sur le coup final.
const DROP = VAT.C2 - 0.15;
const LOOP: [number, number] = [20, 58];
const TAIL_AT = FINAL_HIT - (66 - 58);
type Seg = { at: number; from: number; to: number; gain: (t: number) => number };
const SPANS = LINES3.map((l) => [VAT[l.id], end(l.id)] as const);
const duck = (t: number) => {
  let d = 0;
  for (const [a, b] of SPANS) if (t >= a - 0.2 && t <= b + 0.45) d = Math.max(d, Math.min(1, (t - (a - 0.2)) / 0.2, (b + 0.45 - t) / 0.45));
  return d;
};
const level = (t: number) => 0.3 + (0.1 - 0.3) * duck(t);
const MUSIC: Seg[] = [];
{
  MUSIC.push({ at: 0, from: 20 - DROP, to: 20, gain: (t) => Math.min(1, t / 0.8) * (0.2 + (0.1 - 0.2) * duck(t)) });
  let at = DROP;
  while (at < TAIL_AT - 0.01) {
    const len = Math.min(LOOP[1] - LOOP[0], TAIL_AT - at);
    MUSIC.push({ at, from: LOOP[0], to: LOOP[0] + len, gain: level });
    at += len;
  }
  MUSIC.push({ at: TAIL_AT, from: 58, to: 69, gain: (t) => Math.max(level(t), t > FINAL_HIT - 0.9 ? 0.42 : 0) * (1 - prog(t, TOTAL - 1.4, 1.3)) });
}

const SFX: Cue[] = [
  cue("air-woosh", 0.05, 0.25),
  cue("papier", w("C1", "prescrit") - 0.15, 0.5),
  cue("ui-ding", w("C1", "l'isotrétinoïne") + 0.1, 0.25),
  cue("bulle", w("C1", "peur") - 0.15, 0.4),
  cue("bulle", w("C1", "effets") - 0.1, 0.4, 1.08),
  cue("bulle", w("C1", "effets") + 0.12, 0.38, 1.16),
  cue("bulle", w("C1", "effets") + 0.3, 0.36, 1.24),
  cue("whoosh-pb", DIVE - 0.05, 0.45),
  cue("aspiration", DIVE + 0.05, 0.3),
  cue("whoosh-rapide", w("C2", "sa") - 0.1, 0.25),
  cue("scanner-bip", w("C2", "scannée") + 0.08, 0.6),
  cue("chrono", w("C2", "en") - 0.05, 0.3),
  cue("ui-ding", w("C2", "pharmaboost"), 0.35),
  cue("carte-depliee", w("C2", "bon") - 0.1, 0.35),
  cue("pop-leger", w("C2", "conseil") + 0.15, 0.3),
  cue("pop-leger", w("C2", "routine") - 0.12, 0.32, 1.08),
  cue("etincelle", w("C2", "routine"), 0.3),
  cue("whoosh-rapide", COMPTOIR_IN - 0.15, 0.3),
  cue("pharmacie-ambiance", COMPTOIR_IN, 0.3, 1, 7),
  ...[w("C3", "crème"), w("C3", "routine"), w("C3", "complète"), w("C3", "sécheresse")].map((at, i) => cue("boite-posee", at - 0.1, 0.42, 1 + i * 0.05)),
  cue("pop-leger", w("C3", "crème") + 0.05, 0.25),
  cue("pop-leger", w("C3", "routine") - 0.05, 0.25, 1.1),
  cue("etincelle-magique", w("C3", "exactement"), 0.3),
  cue("whoosh-cine", RADAR_IN - 0.1, 0.35),
  cue("radar", VAT.C4 + 0.1, 0.4),
  cue("orbite", w("C4", "croisé") - 0.2, 0.3),
  ...[w("C4", "stock"), w("C4", "date"), w("C4", "challenge"), w("C4", "laboratoire", 1)].map((at, i) => cue("carte-ping", at - 0.12, 0.45, 1 + i * 0.06)),
  ...[w("C4", "stock"), w("C4", "date"), w("C4", "challenge"), w("C4", "laboratoire", 1)].map((at) => cue("laser-ecrit", at + 0.1, 0.18)),
  cue("verrou-hud", w("C4", "titulaire") + 0.35, 0.4),
  cue("cloche-reussite", w("C4", "retenir") - 0.1, 0.35),
  cue("whoosh-rapide", BILAN_IN - 0.15, 0.3),
  cue("declencheur", w("C5", "scanné"), 0.45),
  cue("scan-laser", w("C5", "qr"), 0.3),
  cue("mail", w("C5", "bilan") - 0.2, 0.4),
  cue("pop-leger", w("C5", "arrivé"), 0.3),
  ...Array.from({ length: 7 }, (_, i) => cue("tic-sec", w("C5", "avec") + 0.1 + i * 0.1, 0.25, 1 + i * 0.03)),
  cue("notif-douce", w("C5", "rappel") - 0.05, 0.4),
  cue("telephone-vibre", w("C5", "fin") - 0.1, 0.35),
  cue("whoosh-cine", OFFRE_IN - 0.1, 0.3),
  cue("tic", OFFRE_IN + 0.2, 0.3),
  cue("pop-sec", w("C6", "lance") - 0.15, 0.3),
  cue("swoosh", w("C6", "offre") - 0.05, 0.4),
  cue("telephone-vibre", w("C6", "reçoit") - 0.05, 0.45),
  cue("notif-douce", w("C6", "reçoit"), 0.45),
  cue("notif-douce", w("C6", "notification") + 0.35, 0.3, 1.1),
  cue("whoosh-rapide", RETOUR_IN - 0.15, 0.3),
  cue("porte-carillon", VAT.C7 + 0.05, 0.45),
  cue("pop-long", w("C7", "pharmacie") - 0.15, 0.35),
  cue("etincelle-magique", w("C7", "nulle"), 0.35),
  cue("whoosh-cine", FINALE_IN - 0.1, 0.3),
  cue("pop-leger", w("C8", "patiente") - 0.1, 0.35),
  ...[0, 1, 2, 3, 4].map((i) => cue("pop-leger", w("C8", "patiente") + 0.2 + i * 0.16, 0.22, 1.05 + i * 0.05)),
  cue("pop-leger", w("C8", "conseils") - 0.1, 0.35, 1.05),
  cue("compteur", w("C8", "conseils"), 0.35),
  cue("pop-leger", w("C8", "chiffre") - 0.1, 0.35, 1.1),
  cue("montee", w("C8", "chiffre"), 0.3),
  cue("piece", w("C8", "grandit"), 0.35),
  cue("pop-leger", w("C8", "équipe") - 0.1, 0.35, 1.15),
  cue("cloche-reussite", w("C8", "soulagée"), 0.3),
  cue("impact-net", PB_AT - 0.05, 0.45),
  cue("etincelle", w("C8", "copilote"), 0.35),
  cue("confettis", FINAL_HIT + 0.1, 0.35),
  cue("ui-clic", FINAL_HIT + 1.28, 0.45),
];

function Film() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  return (
    <AbsoluteFill style={{ background: MINT.paper }}>
      <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 0%, #FFFFFF 0%, ${MINT.paper} 55%, #E2EEEA 100%)` }} />
      <Scene t={t} from={0} to={DIVE + 0.05}>
        <Rue t={t} />
      </Scene>
      <WipeBar t={t} at={DIVE - 0.25} dur={0.5} color={MINT.green} />
      <Plongee t={t} />
      <Scene t={t} from={SCREEN_IN - 0.25} to={COMPTOIR_IN}>
        <Ecran t={t} />
      </Scene>
      <Scene t={t} from={COMPTOIR_IN} to={RADAR_IN}>
        <Comptoir t={t} />
      </Scene>
      <Scene t={t} from={RADAR_IN} to={BILAN_IN}>
        <Radar t={t} />
      </Scene>
      <Scene t={t} from={BILAN_IN} to={OFFRE_IN}>
        <Bilan t={t} />
      </Scene>
      <Scene t={t} from={OFFRE_IN} to={RETOUR_IN}>
        <Offre t={t} />
      </Scene>
      <Scene t={t} from={RETOUR_IN} to={FINALE_IN}>
        <Retour t={t} />
      </Scene>
      <Scene t={t} from={FINALE_IN} to={TOTAL + 1}>
        <Finale t={t} />
        {t >= PB_AT - 0.2 && <Fin t={t} />}
      </Scene>
      <Captions t={t} />
      <Grain t={t} opacity={0.02} />
      <Vignette strength={0.12} />
      {LINES3.map((l) => (
        <Sequence key={`v-${l.id}`} from={Math.round(VAT[l.id] * FPS)} layout="none" name={`Voix ${l.id}`}>
          <Audio src={staticFile(`promo/voix/${l.id}.wav`)} volume={1} />
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

export const FILM = { Film, TOTAL_FRAMES };
export const FILM3_TIMES = { VAT, DIVE, SCREEN_IN, COMPTOIR_IN, RADAR_IN, BILAN_IN, OFFRE_IN, RETOUR_IN, FINALE_IN, PB_AT, FINAL_HIT, TOTAL };
