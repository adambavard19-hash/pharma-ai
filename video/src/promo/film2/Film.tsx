import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Bell, Boxes, CalendarCheck, CalendarClock, Check, Droplets, Heart, Megaphone, MousePointer2, QrCode, Smile, Sparkles, Store, Sun, TrendingUp, Trophy, Users } from "lucide-react";
import { AdnBackdrop, BannerCard, Confetti, Cues, DUPES, Douchette, Dupe, DupeTile, Flash, JAKARTA, MedBox, Notification, Ordonnance, PB, PBLogo, Phone, Ring, Sparkle, WipeBar, cue, rgba, type Cue, type DupeKind, type RxLine } from "../../rembobine/kit";
import { Grain, Vignette } from "../../presentation/motion/kit/grain";
import { EXIT, IN_OUT, SNAP, clamp01, keys, lerp, prog, ressort, wobble } from "../../presentation/motion/kit/ease";
import { Abs, Card, Cross, LOCK_BG, MINT, PASSANTS, Pill, Rise, Scene, Shop, Title, pop } from "../../lettre/Lettre";
import { FPS, M, linesOf, timeline, type Word } from "../kit";

/**
 * PRÉSENTATION N° 2 — « PharmaBoost, en 3 étapes » (fondateur, 6 nov. 2026). Façon keynote produit : une ordonnance qui se
 * décompose en potentiel de conseil, trois chiffres qui tombent puis se rangent en barre d'étapes ; chaque étape sort de sa
 * pastille en énorme chiffre (1 : la douchette, 2 : le moteur qui croise stock / dates courtes / challenges / laboratoire
 * préféré et sort la fiche du conseil sur l'écran du comptoir, 3 : la routine en escalier), puis « ce n'est pas fini » : le QR
 * code, le bilan et le rappel sur le téléphone, l'offre, le patient qui revient ; le tableau du titulaire ; la signature.
 * Voix B1–B7 (figées), temps de chaque mot : mots.json.
 */

// ---- Où tombe chaque réplique ----------------------------------------------------------------------------------------
const { VAT, end, w } = timeline();
VAT.B1 = 0.9;
VAT.B2 = end("B1") + 0.6;
VAT.B3 = end("B2") + 0.5;
VAT.B4 = end("B3") + 0.55;
VAT.B5 = end("B4") + 0.6;
VAT.B6 = end("B5") + 0.6;
VAT.B7 = end("B6") + 0.7;
const FINAL_HIT = end("B7") + 0.35;
const TOTAL = end("B7") + 3.3;
const TOTAL_FRAMES = Math.round(TOTAL * FPS);

const tx = (size: number, weight = 700, color: string = MINT.ink): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, color, letterSpacing: size > 24 ? "-0.02em" : 0 });
const GRAD = `linear-gradient(135deg, ${MINT.green} 0%, ${PB.cyan} 100%)`;
const ISO: RxLine[] = [{ name: "Isotrétinoïne 20 mg", dose: "1 capsule par jour, au repas" }];
const Example = () => <span style={{ ...tx(15, 700, MINT.soft), padding: "4px 12px", borderRadius: 99, background: "#EEF3F1" }}>Exemple</span>;

/** Un lent travelling avant sur toute la scène : l'image ne reste jamais figée. */
function Drift({ t, from, to, children, k = 0.035, origin = "50% 50%" }: { t: number; from: number; to: number; children: ReactNode; k?: number; origin?: string }) {
  const u = clamp01((t - from) / Math.max(0.1, to - from));
  return <AbsoluteFill style={{ transform: `scale(${1 + k * u})`, transformOrigin: origin }}>{children}</AbsoluteFill>;
}

// =====================================================================================================================
// LES TROIS ÉTAPES : elles tombent dans l'ouverture, se rangent en barre en haut de l'image, puis chacune sort en grand.
// =====================================================================================================================
const STEPS = [
  { l: "Scanner", id: "B2" },
  { l: "Conseiller", id: "B3" },
  { l: "Compléter", id: "B4" },
];
const FALL = [w("B1", "en"), w("B1", "trois"), w("B1", "étapes.")];
const DOCK = VAT.B2 - 0.6;
const STEP_ON = [w("B2", "vous"), w("B3", "pharmaboost"), w("B4", "il")];
const STEPS_OUT = VAT.B5 - 0.15;
const BIG = (i: number) => ({ x: 560 + 400 * i, y: 640 });
const CHIP = (i: number) => ({ x: 600 + 360 * i, y: 66 });
const CHIP_W = 320;

function Steps({ t }: { t: number }) {
  if (t < FALL[0] - 0.05) return null;
  const m = prog(t, DOCK, 0.6, IN_OUT);
  const gone = prog(t, STEPS_OUT, 0.4, EXIT);
  if (gone >= 1) return null;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translateY(${-140 * gone}px)`, opacity: 1 - gone }}>
      {/* Les traits entre les pastilles, qui se remplissent étape après étape */}
      {[0, 1].map((i) => {
        const a = CHIP(i).x + CHIP_W / 2 + 4;
        const b = CHIP(i + 1).x - CHIP_W / 2 - 4;
        const fill = prog(t, STEP_ON[i + 1] - 0.2, 0.5, IN_OUT);
        return (
          <div key={i} style={{ position: "absolute", left: a, top: 64, width: b - a, height: 5, borderRadius: 3, background: rgba(MINT.green, 0.18), opacity: prog(t, DOCK + 0.4, 0.3) }}>
            <div style={{ width: `${fill * 100}%`, height: "100%", borderRadius: 3, background: MINT.green }} />
          </div>
        );
      })}
      {STEPS.map((s, i) => {
        const f = t < FALL[i] ? 0 : ressort(t, FALL[i], { damping: 9, stiffness: 170, mass: 0.8 });
        if (f <= 0) return null;
        const big = BIG(i);
        const chip = CHIP(i);
        const cx = lerp(big.x, chip.x - CHIP_W / 2 + 33, m);
        const cy = lerp(big.y - 900 * (1 - f), chip.y, m);
        const d = lerp(230, 46, m);
        const act = prog(t, STEP_ON[i], 0.3) * (i < 2 ? 1 - prog(t, STEP_ON[i + 1], 0.3) : 1);
        const done = i < 2 ? prog(t, STEP_ON[i + 1], 0.3) : 0;
        // Le chiffre « sort » de sa pastille pendant que l'énorme chiffre est à l'écran.
        const out = t >= VAT[s.id] - 0.05 && t < STEP_ON[i] + 0.1 ? 1 - prog(t, STEP_ON[i] - 0.05, 0.3) : 0;
        const chipK = prog(t, DOCK + 0.3, 0.35);
        const pulseK = act > 0 ? 1 + 0.04 * Math.sin((t - STEP_ON[i]) * 5) * act : 1;
        return (
          <div key={i}>
            {chipK > 0 && (
              <div style={{ position: "absolute", left: chip.x - CHIP_W / 2, top: chip.y - 33, width: CHIP_W, height: 66, borderRadius: 999, background: "#FFFFFF", boxShadow: `0 16px 36px -20px rgba(15,43,38,.5), 0 0 0 2px ${rgba(MINT.green, 0.18 + 0.5 * act)}`, opacity: chipK, transform: `scale(${pulseK})`, overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: GRAD, opacity: act }} />
                <div style={{ position: "absolute", left: 70, top: 0, bottom: 0, display: "flex", alignItems: "center", ...tx(27, 800, act > 0.5 ? "#FFFFFF" : MINT.ink), opacity: prog(t, DOCK + 0.35, 0.25) }}>{s.l}</div>
              </div>
            )}
            {/* La pastille ronde : grande dans l'ouverture, petite dans la barre */}
            <div style={{ position: "absolute", left: cx - d / 2, top: cy - d / 2, width: d, height: d, borderRadius: 999, background: m < 0.5 ? GRAD : done > 0.5 ? MINT.green : act > 0.5 ? "#FFFFFF" : MINT.bg, boxShadow: m < 0.5 ? `0 40px 70px -30px ${rgba(MINT.green, 0.7)}` : undefined, display: "flex", alignItems: "center", justifyContent: "center", transform: `rotate(${(1 - Math.min(1, f)) * -40}deg)` }}>
              {done > 0.5 ? (
                <Check size={28} color="#FFFFFF" strokeWidth={3.4} style={{ transform: `scale(${pop(t, STEP_ON[i + 1])})` }} />
              ) : (
                <span style={{ ...tx(d * 0.6, 800, m < 0.5 ? "#FFFFFF" : MINT.green), letterSpacing: 0, lineHeight: 1, opacity: 1 - out }}>{i + 1}</span>
              )}
            </div>
            {m < 1 && (
              <div style={{ position: "absolute", left: big.x - 200, width: 400, top: big.y + 150 - 900 * (1 - f), textAlign: "center", ...tx(46, 800), opacity: (1 - prog(t, DOCK, 0.25)) * clamp01(f * 1.5) }}>{s.l}</div>
            )}
            <Ring t={t} at={FALL[i] + 0.12} x={big.x} y={big.y} max={420} color={MINT.green} />
          </div>
        );
      })}
    </div>
  );
}

/** L'énorme chiffre de l'étape : il sort de sa pastille, claque au centre, puis y retourne. */
function GiantNum({ t, i }: { t: number; i: number }) {
  const at = VAT[STEPS[i].id];
  const back = STEP_ON[i] - 0.05;
  if (t < at - 0.06) return null;
  const kOut = prog(t, at - 0.05, 0.42, SNAP);
  const kBack = prog(t, back, 0.4, IN_OUT);
  if (kBack >= 1) return null;
  const p = kOut * (1 - kBack);
  const chip = CHIP(i);
  const x = lerp(chip.x - CHIP_W / 2 + 33, 960, p);
  const y = lerp(chip.y, 470, p);
  const s = lerp(0.07, 1, p) * (1 + 0.06 * Math.max(0, pop(t, at + 0.25) - 1));
  return (
    <>
      <Flash t={t} at={at + 0.1} dur={0.3} max={0.35} color="#FFFFFF" />
      <Ring t={t} at={at + 0.18} x={960} y={470} max={1100} color={MINT.green} width={6} />
      <Abs x={x} y={y}>
        <div style={{ transform: `scale(${s})`, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 620, lineHeight: 0.9, letterSpacing: "-0.06em", background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: `drop-shadow(0 40px 60px ${rgba(MINT.green, 0.35)})` }}>{i + 1}</span>
          <span style={{ marginTop: 10, ...tx(64, 800), letterSpacing: "0.18em", textTransform: "uppercase", opacity: prog(t, at + 0.2, 0.3) }}>{STEPS[i].l}</span>
        </div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// B1 — « Et si chaque ordonnance donnait enfin tout son potentiel de conseil ? Voici PharmaBoost, en trois étapes. »
// =====================================================================================================================
const ROUTINE: { k: DupeKind; gest: string; Icon: typeof Sun }[] = [
  { k: "iso-nettoyant", gest: "Nettoyer", Icon: Droplets },
  { k: "iso-hydratant", gest: "Hydrater", Icon: Sparkles },
  { k: "iso-levres", gest: "Lèvres", Icon: Smile },
  { k: "iso-solaire", gest: "Soleil", Icon: Sun },
];

function Ouverture({ t }: { t: number }) {
  const fly = ressort(t, 0.1, { damping: 12, stiffness: 150, mass: 0.8 });
  const fan = prog(t, w("B1", "chaque") - 0.05, 0.6, SNAP);
  const pot = w("B1", "potentiel") - 0.05;
  const full = w("B1", "?");
  const fill = prog(t, pot + 0.2, full - pot - 0.1, IN_OUT);
  const voici = w("B1", "voici");
  const away = prog(t, voici - 0.1, 0.5, EXIT);
  const sweep = prog(t, pot, 0.7, IN_OUT);
  const glow = prog(t, w("B1", "donnait"), 0.4) * (1 - prog(t, pot + 0.6, 0.4));
  const ox = 640 - 900 * away;
  const gx = 1300 + 900 * away;
  const gaugeIn = pop(t, pot - 0.1);
  const bump = keys(t, [[full - 0.05, 1], [full + 0.08, 1.08, SNAP], [full + 0.4, 1, IN_OUT]]);
  return (
    <>
      <Title t={t} at={w("B1", "chaque") - 0.1} out={voici - 0.35} text="Tout le *potentiel de conseil* d'une ordonnance." y={130} size={66} />
      {/* L'ordonnance : elle tombe, deux autres s'éventaillent derrière (« chaque ordonnance ») */}
      {away < 1 && (
        <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - Math.min(1, fly)) * -900}px)`, opacity: 1 - away }}>
          {[-1, 1].map((s) => (
            <Ordonnance key={s} w={360} lines={[]} x={ox + s * 70 * fan} y={570 + 20 * fan} rotate={s * 9 * fan} write={1} style={{ opacity: 0.55 * fan }} />
          ))}
          <div style={{ position: "absolute", left: ox - 190, top: 570 - 262, width: 380, height: 524, borderRadius: 10, boxShadow: `0 0 0 ${6 * glow}px ${rgba(MINT.green, 0.6)}, 0 0 ${60 * glow}px ${rgba(MINT.green, 0.5)}` }} />
          <Ordonnance w={380} x={ox} y={570} lines={ISO} write={clamp01((t - 0.35) / 0.9)} />
          {/* Le balayage qui « lit » l'ordonnance */}
          {sweep > 0 && sweep < 1 && (
            <div style={{ position: "absolute", left: ox - 210, top: 570 - 262 + 524 * sweep - 3, width: 420, height: 6, borderRadius: 3, background: MINT.green, boxShadow: `0 0 26px 6px ${rgba(MINT.green, 0.6)}` }} />
          )}
        </div>
      )}
      {/* Les conseils qui s'en échappent vers la jauge */}
      {ROUTINE.map((r, i) => {
        const at = pot + 0.15 + i * 0.2;
        const u = prog(t, at, 0.6, IN_OUT);
        if (t < at || u >= 1) return null;
        const x = lerp(ox + 80, gx, u);
        const y = 570 - Math.sin(Math.PI * u) * (i % 2 ? 260 : -230) + (i - 1.5) * 40 * (1 - u);
        const s = lerp(1, 0.35, u * u);
        return (
          <Abs key={r.k} x={x} y={y}>
            <div style={{ transform: `scale(${s * Math.min(1, pop(t, at) * 1.2)}) rotate(${(1 - u) * (i % 2 ? 14 : -14)}deg)`, opacity: 1 - clamp01((u - 0.8) / 0.2), boxShadow: "0 20px 40px -20px rgba(15,43,38,.5)", borderRadius: 24 }}>
              <DupeTile kind={r.k} size={110} radius={24} />
            </div>
          </Abs>
        );
      })}
      {/* La jauge du potentiel de conseil */}
      {t >= pot - 0.1 && away < 1 && (
        <Abs x={gx} y={560}>
          <div style={{ position: "relative", width: 480, height: 480, transform: `scale(${Math.min(1.05, gaugeIn) * bump})`, opacity: 1 - away }}>
            <svg width={480} height={480} viewBox="0 0 480 480" style={{ position: "absolute", inset: 0 }}>
              <defs>
                <linearGradient id="f2gauge" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={MINT.green} />
                  <stop offset="100%" stopColor={PB.cyan} />
                </linearGradient>
              </defs>
              <circle cx={240} cy={240} r={200} fill="#FFFFFF" stroke={rgba(MINT.green, 0.12)} strokeWidth={38} />
              <circle cx={240} cy={240} r={200} fill="none" stroke="url(#f2gauge)" strokeWidth={38} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - fill} transform="rotate(-90 240 240)" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ ...tx(112, 800), fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em", lineHeight: 1 }}>
                {Math.round(100 * fill)}
                <span style={{ fontSize: 60, color: MINT.green }}> %</span>
              </span>
              <span style={{ marginTop: 10, ...tx(20, 800, MINT.soft), letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", lineHeight: 1.2 }}>Potentiel<br />de conseil</span>
            </div>
          </div>
        </Abs>
      )}
      <Ring t={t} at={full} x={1300} y={560} max={760} color={MINT.green} width={6} />
      <Sparkle t={t} at={full + 0.05} x={1500} y={340} size={70} color={PB.gold} />
      <Sparkle t={t} at={full + 0.15} x={1100} y={790} size={54} color={MINT.green} />
      {/* « Voici PharmaBoost, en trois étapes. » */}
      <Flash t={t} at={voici + 0.02} dur={0.3} max={0.4} color="#FFFFFF" />
      <WipeBar t={t} at={voici - 0.15} dur={0.55} color={rgba(MINT.green, 0.25)} />
      <Abs x={960} y={190}>
        <PBLogo t={t} at={w("B1", "pharmaboost,") - 0.1} size={64} tone="light" grad />
      </Abs>
      <Abs x={960} y={360}>
        <Rise t={t} at={w("B1", "pharmaboost,") + 0.15} text="PharmaBoost, *en 3 étapes.*" size={104} style={{ width: 1600 }} />
      </Abs>
    </>
  );
}

// =====================================================================================================================
// B2 — Étape 1 : « Vous scannez les médicaments de l'ordonnance, comme d'habitude. Ici, de l'isotrétinoïne. »
// =====================================================================================================================
function Etape1({ t }: { t: number }) {
  const b = VAT.B2;
  const rxIn = prog(t, b + 0.7, 0.6, SNAP);
  const gunIn = prog(t, b + 0.85, 0.6, SNAP);
  const boxAt = w("B2", "scannez") - 0.05;
  const boxIn = prog(t, boxAt, 0.4, SNAP);
  const settle = ressort(t, boxAt + 0.3, { damping: 8, stiffness: 260, mass: 0.5 });
  const beam = w("B2", "médicaments") + 0.1;
  const check = beam + 0.4;
  const mark = prog(t, check, 0.4, IN_OUT);
  const link = prog(t, beam + 0.1, 0.35, IN_OUT) * (1 - prog(t, check + 0.3, 0.3));
  const iso = w("B2", "l'isotrétinoïne.");
  const hero = keys(t, [[iso - 0.1, 1], [iso + 0.1, 1.1, SNAP], [iso + 0.5, 1, IN_OUT]]);
  const lit = t > beam ? Math.max(0, 1 - (t - beam) / 0.5) : 0;
  const RX = { x: 620, y: 540, w: 400 };
  const rxH = RX.w * 1.38;
  const rxTop = RX.y - rxH / 2;
  const sc = RX.w / 300;
  const lineY = rxTop + 132 * sc;
  const BOX = { x: 1330 + (1 - boxIn) * 700, y: 790 };
  return (
    <Drift t={t} from={b} to={VAT.B3}>
      {/* L'ordonnance */}
      <div style={{ position: "absolute", inset: 0, opacity: rxIn, transform: `translateX(${(1 - rxIn) * -260}px)` }}>
        <Ordonnance w={RX.w} x={RX.x} y={RX.y} lines={ISO} />
        {/* La ligne cochée : le surligneur vert puis la coche */}
        <div style={{ position: "absolute", left: RX.x - RX.w / 2 + 18 * sc, top: lineY - 26, height: 66, width: 270 * sc * mark, borderRadius: 10, background: rgba("#3DDC97", 0.28) }} />
        <Abs x={RX.x + RX.w / 2 - 34} y={lineY + 8}>
          <span style={{ display: "inline-flex", width: 64, height: 64, borderRadius: 99, background: MINT.green, alignItems: "center", justifyContent: "center", transform: `scale(${pop(t, check + 0.15)})`, boxShadow: `0 12px 30px -10px ${rgba(MINT.green, 0.8)}` }}>
            <Check size={40} color="#FFFFFF" strokeWidth={3.6} />
          </span>
        </Abs>
      </div>
      <Ring t={t} at={check + 0.18} x={RX.x + RX.w / 2 - 34} y={lineY + 8} max={240} color={MINT.green} />
      {/* Le fil entre la boîte bipée et sa ligne */}
      {link > 0 && (
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <path d={`M1180 640 C 1020 560, 960 ${lineY - 40}, ${RX.x + RX.w / 2 + 10} ${lineY + 8}`} fill="none" stroke={MINT.green} strokeWidth={6} strokeLinecap="round" strokeDasharray="14 12" strokeDashoffset={-t * 140} opacity={link} />
        </svg>
      )}
      {/* La douchette et la boîte */}
      <div style={{ position: "absolute", inset: 0, opacity: gunIn, transform: `translateY(${(1 - gunIn) * -320}px)` }}>
        <Douchette t={t} x={1330} y={440 + wobble(t, 4, 6, 0.8)} size={1.5} beamAt={[beam]} beamDur={0.38} beamLength={98} beamWidth={300} />
      </div>
      {t >= boxAt && (
        <div style={{ position: "absolute", left: BOX.x, top: BOX.y, width: 0, height: 0, transform: `scale(${hero})` }}>
          <MedBox kind="isotretinoine" w={300} x={0} y={0} rotate={(1 - boxIn) * -14 + (1 - clamp01(settle)) * 5} t={t} />
          {lit > 0 && <div style={{ position: "absolute", left: -200, top: -240, width: 400, height: 260, background: `radial-gradient(ellipse at 50% 55%, ${rgba("#FF3B3B", 0.25 * lit)} 0%, transparent 65%)` }} />}
        </div>
      )}
      <Sparkle t={t} at={iso + 0.05} x={1520} y={560} size={70} color={PB.gold} />
      {/* « comme d'habitude » / « Ici, de l'isotrétinoïne » */}
      <Abs x={RX.x} y={890}>
        <Pill t={t} at={w("B2", "comme") - 0.05} size={28}>
          <Check size={28} color={MINT.green} /> Comme d&apos;habitude, à votre comptoir
        </Pill>
      </Abs>
      <Abs x={1330} y={890}>
        <Pill t={t} at={w("B2", "ici,") - 0.05} size={28} color="#C8453B">
          <span style={{ width: 22, height: 22, borderRadius: 99, background: "#C8453B" }} /> Isotrétinoïne 20 mg · scannée
        </Pill>
      </Abs>
    </Drift>
  );
}

// =====================================================================================================================
// B3 — Étape 2 : le moteur croise stock, dates courtes, challenges laboratoires, laboratoire préféré → la fiche du conseil.
// =====================================================================================================================
const SCREEN = { x: 1450, y: 470, w: 780, h: 540 };

/** L'écran du comptoir : un moniteur, son pied ; le contenu passe en enfant (coordonnées de l'écran). */
function Monitor({ t, inAt, children }: { t: number; inAt: number; children: ReactNode }) {
  const k = prog(t, inAt, 0.6, SNAP);
  if (k <= 0) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: clamp01(k * 1.5), transform: `translateX(${(1 - k) * 300}px)` }}>
      <div style={{ position: "absolute", left: SCREEN.x - 70, top: SCREEN.y + SCREEN.h / 2 + 10, width: 140, height: 120, background: "linear-gradient(180deg,#C9D3D0,#AEBAB6)" }} />
      <div style={{ position: "absolute", left: SCREEN.x - 180, top: SCREEN.y + SCREEN.h / 2 + 118, width: 360, height: 22, borderRadius: 12, background: "#B5C0BC" }} />
      <div style={{ position: "absolute", left: SCREEN.x - SCREEN.w / 2 - 18, top: SCREEN.y - SCREEN.h / 2 - 18, width: SCREEN.w + 36, height: SCREEN.h + 36, borderRadius: 30, background: "#16201E", boxShadow: "0 50px 90px -40px rgba(11,21,19,.7)" }} />
      <div style={{ position: "absolute", left: SCREEN.x - SCREEN.w / 2, top: SCREEN.y - SCREEN.h / 2, width: SCREEN.w, height: SCREEN.h, borderRadius: 14, overflow: "hidden", background: "#EEF3F6" }}>
        {/* Le logiciel de la pharmacie, en fond */}
        <div style={{ height: 40, background: "linear-gradient(180deg,#3B5C8C,#2F4C77)", display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
          {["#F26B5B", "#F5C04A", "#5CC96A"].map((c) => (
            <span key={c} style={{ width: 11, height: 11, borderRadius: 99, background: c }} />
          ))}
          <span style={{ marginLeft: 10, ...tx(16, 800, "#FFFFFF") }}>Vente en cours · Comptoir 1</span>
        </div>
        {Array.from({ length: 9 }, (_, r) => (
          <div key={r} style={{ height: 44, borderBottom: "1px solid #DFE7EF", display: "flex", alignItems: "center", padding: "0 16px", background: r === 0 ? "#FFF6C9" : r % 2 ? "#F7FAFD" : "#FFFFFF" }}>
            <span style={{ height: 10, width: r === 0 ? 240 : 140 + ((r * 53) % 130), borderRadius: 5, background: r === 0 ? "#C8453B" : "#CBD6E2", opacity: r === 0 ? 0.8 : 1 }} />
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}

function Etape2({ t }: { t: number }) {
  const b = VAT.B3;
  const coreAt = w("B3", "pharmaboost") - 0.05;
  const screenAt = w("B3", "affiche") - 0.1;
  const creme = w("B3", "crème") - 0.15;
  const titulaire = w("B3", "titulaire.");
  const inputs = [
    { I: Boxes, l: "Votre stock", s: "6 boîtes en rayon", at: w("B3", "stock,") - 0.08, c: PB.stock },
    { I: CalendarClock, l: "Vos dates courtes", s: "à écouler en priorité", at: w("B3", "dates") - 0.08, c: PB.date },
    { I: Trophy, l: "Challenges laboratoires", s: "l'objectif du mois", at: w("B3", "challenges") - 0.08, c: PB.gold },
    { I: Heart, l: "Laboratoire préféré", s: "le choix du titulaire", at: w("B3", "laboratoire") - 0.08, c: "#D0485F" },
  ];
  const CORE = { x: 820, y: 500 };
  const coreK = pop(t, coreAt);
  const surge = prog(t, titulaire, 0.5, IN_OUT) * (1 - prog(t, creme + 0.3, 0.5));
  const spin = (t - coreAt) * (50 + 380 * surge);
  const dim = prog(t, creme, 0.5);
  const rowY = (i: number) => 260 + i * 160;
  const checklistOut = prog(t, creme - 0.1, 0.3);
  const beamOut = prog(t, creme - 0.3, 0.6, IN_OUT);
  const popK = prog(t, creme + 0.75, 0.6, SNAP);
  return (
    <Drift t={t} from={b} to={VAT.B4} k={0.03}>
      {/* Les fils données → PharmaBoost → écran */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {inputs.map((it, i) => {
          const draw = prog(t, it.at + 0.1, 0.4, IN_OUT);
          if (draw <= 0) return null;
          const y = rowY(i);
          return <path key={it.l} d={`M540 ${y} C 640 ${y}, 650 ${CORE.y}, ${CORE.x - 120} ${CORE.y}`} fill="none" stroke={it.c} strokeWidth={5 + 3 * surge} strokeDasharray="12 12" strokeDashoffset={-t * (120 + 300 * surge)} pathLength={undefined} opacity={0.75 * draw * (1 - 0.5 * dim)} />;
        })}
        {t > screenAt && <path d={`M${CORE.x + 120} ${CORE.y} L ${SCREEN.x - SCREEN.w / 2 - 20} ${CORE.y}`} fill="none" stroke={MINT.green} strokeWidth={8} strokeLinecap="round" strokeDasharray="18 14" strokeDashoffset={-t * 200} opacity={prog(t, screenAt, 0.4) * (0.5 + 0.5 * Math.max(surge, beamOut))} />}
      </svg>
      {/* Les quatre données, chacune sur son mot */}
      {inputs.map((it, i) => {
        const k = pop(t, it.at);
        if (k <= 0) return null;
        const hit = keys(t, [[titulaire + i * 0.06, 1], [titulaire + 0.12 + i * 0.06, 1.06, SNAP], [titulaire + 0.4 + i * 0.06, 1, IN_OUT]]);
        return (
          <Abs key={it.l} x={330} y={rowY(i)}>
            <div style={{ transform: `translateX(${(1 - Math.min(1, k)) * -200}px) scale(${Math.min(1.04, k) * hit})`, opacity: clamp01(k * 2) * (1 - 0.35 * dim) }}>
              <Card style={{ display: "flex", alignItems: "center", gap: 18, width: 420, padding: "16px 22px 16px 16px", borderRadius: 24 }}>
                <span style={{ display: "inline-flex", flexShrink: 0, width: 68, height: 68, borderRadius: 18, background: rgba(it.c, 0.14), alignItems: "center", justifyContent: "center" }}>
                  <it.I size={36} color={it.c} />
                </span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ ...tx(28, 800), whiteSpace: "nowrap" }}>{it.l}</span>
                  <span style={{ ...tx(19, 600, MINT.soft), whiteSpace: "nowrap" }}>{it.s}</span>
                </span>
              </Card>
            </div>
          </Abs>
        );
      })}
      {/* Le cœur PharmaBoost */}
      {coreK > 0 && (
        <Abs x={CORE.x} y={CORE.y}>
          <div style={{ position: "relative", width: 240, height: 240, transform: `scale(${Math.min(1.1, coreK) * (1 + 0.08 * surge)})` }}>
            <svg width={240} height={240} viewBox="0 0 240 240" style={{ position: "absolute", inset: 0, transform: `rotate(${spin}deg)` }}>
              <circle cx={120} cy={120} r={112} fill="none" stroke={MINT.green} strokeWidth={4} strokeDasharray="6 14" opacity={0.6} />
            </svg>
            <svg width={240} height={240} viewBox="0 0 240 240" style={{ position: "absolute", inset: 0, transform: `rotate(${-spin * 1.6}deg)` }}>
              <circle cx={120} cy={120} r={96} fill="none" stroke={PB.cyan} strokeWidth={6} strokeDasharray="60 40" strokeLinecap="round" opacity={0.5} />
            </svg>
            <div style={{ position: "absolute", inset: 34, borderRadius: 999, background: `radial-gradient(circle at 35% 30%, #2E5A50, ${PB.green})`, boxShadow: `0 30px 60px -20px rgba(15,47,42,.7), 0 0 ${30 + 60 * surge}px ${rgba(PB.mint, 0.3 + 0.5 * surge)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Cross size={78} color={PB.citron} glow={0.4 + surge} />
            </div>
          </div>
        </Abs>
      )}
      {coreK > 0 && (
        <Abs x={CORE.x} y={CORE.y + 170}>
          <span style={{ ...tx(24, 800, MINT.deep), letterSpacing: "0.22em", opacity: prog(t, coreAt + 0.2, 0.3) }}>PHARMABOOST</span>
        </Abs>
      )}
      <Flash t={t} at={titulaire + 0.45} dur={0.25} max={0.25} color="#FFFFFF" />
      {/* L'écran du comptoir : PharmaBoost croise… puis la fiche du conseil */}
      <div style={{ position: "absolute", inset: 0, opacity: 1 - 0.7 * popK, filter: popK > 0 ? `blur(${3 * popK}px)` : undefined }}>
      <Monitor t={t} inAt={screenAt}>
        {checklistOut < 1 && (
          <div style={{ position: "absolute", left: 120, top: 90, width: SCREEN.w - 240, opacity: 1 - checklistOut }}>
            <Card style={{ padding: "24px 28px", borderRadius: 26 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Cross size={26} />
                <span style={{ ...tx(20, 800, MINT.deep), letterSpacing: "0.18em" }}>PHARMABOOST</span>
                <span style={{ marginLeft: "auto", ...tx(18, 700, MINT.soft) }}>Le bon conseil…</span>
              </div>
              {inputs.map((it, i) => {
                const k = prog(t, it.at + 0.25, 0.3, SNAP);
                return (
                  <div key={it.l} style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14, height: 46, padding: "0 14px", borderRadius: 14, background: k > 0.5 ? rgba(it.c, 0.1) : "#F2F5F4" }}>
                    <it.I size={24} color={k > 0.5 ? it.c : "#B9C4C0"} />
                    <span style={{ ...tx(20, 700, k > 0.5 ? MINT.ink : "#9AA8A3") }}>{it.l}</span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", width: 30, height: 30, borderRadius: 99, background: MINT.green, alignItems: "center", justifyContent: "center", transform: `scale(${pop(t, it.at + 0.3)})` }}>
                      <Check size={18} color="#FFFFFF" strokeWidth={3.4} />
                    </span>
                  </div>
                );
              })}
            </Card>
          </div>
        )}
      </Monitor>
      </div>
        <BannerCard
          t={t}
          at={creme}
          product="Crème lavante apaisante"
          image="kind:iso-nettoyant"
          for="Isotrétinoïne 20 mg"
          tab="questions"
          questions={[{ text: "Le traitement vient-il de commencer ?", at: creme + 0.9 }, { text: "La peau tiraille-t-elle déjà ?", at: creme + 1.2 }]}
          discours={{ text: "Ce traitement peut provoquer une sécheresse à différents niveaux, dès les premières semaines.", at: creme + 0.4, dur: 1.3 }}
          chips={[
            { kind: "stock", text: "6 en stock", at: creme + 0.3 },
            { kind: "date", text: "Date courte", at: creme + 0.4 },
            { kind: "challenge", text: "Challenge laboratoire", at: creme + 0.5 },
            { kind: "plain", text: "Laboratoire préféré", at: creme + 0.6 },
          ]}
          x={lerp(SCREEN.x, 1350, popK)}
          y={lerp(SCREEN.y + 16, 500, popK)}
          scale={lerp(0.58, 0.84, popK)}
        />
      <Sparkle t={t} at={w("B3", "apaisante.")} x={1700} y={170} size={70} color={PB.gold} />
      <Ring t={t} at={creme + 0.8} x={1350} y={500} max={900} color={MINT.green} width={5} />
    </Drift>
  );
}

// =====================================================================================================================
// B4 — Étape 3 : « Il complète avec la routine : un soin hydratant, un baume à lèvres, une protection solaire. »
// =====================================================================================================================
function Etape3({ t }: { t: number }) {
  const b = VAT.B4;
  const at = [w("B4", "complète") - 0.1, w("B4", "soin") - 0.08, w("B4", "baume") - 0.08, w("B4", "protection") - 0.08];
  const solaire = w("B4", "solaire.");
  const pos = (i: number) => ({ x: 330 + 420 * i, base: 880 - 130 * i });
  return (
    <Drift t={t} from={b} to={VAT.B5} k={0.04} origin="70% 60%">
      <div style={{ position: "absolute", left: 120, top: 175, width: 860 }}>
        <Rise t={t} at={w("B4", "routine") - 0.1} text="La routine *complète.*" size={76} style={{ textAlign: "left" }} />
      </div>
      <div style={{ position: "absolute", left: 120, top: 290 }}>
        <Pill t={t} at={solaire + 0.3} size={26}>
          <Sparkles size={26} color={MINT.green} /> Routine isotrétinoïne · 4 produits · en stock
        </Pill>
      </div>
      {/* L'escalier */}
      {ROUTINE.map((r, i) => {
        const p = pos(i);
        const rise = prog(t, at[i] - 0.05, 0.45, SNAP);
        if (rise <= 0) return null;
        const drop = t < at[i] ? 0 : ressort(t, at[i] + 0.08, { damping: 10, stiffness: 190, mass: 0.7 });
        const blockH = 900 - p.base;
        const hl = i === 0 ? 0 : pop(t, at[i] + 0.1);
        return (
          <div key={r.k}>
            <div style={{ position: "absolute", left: p.x - 195, top: 900 - blockH * rise, width: 390, height: blockH * rise + 30, borderRadius: "18px 18px 0 0", background: `linear-gradient(180deg, ${rgba(MINT.green, 0.9 - i * 0.08)}, ${rgba(PB.cyan, 0.75 - i * 0.08)})`, boxShadow: "inset 0 6px 0 rgba(255,255,255,.25)" }}>
              {blockH > 60 && <span style={{ position: "absolute", left: 22, top: 14, ...tx(30, 800, "rgba(255,255,255,.9)"), opacity: rise }}>{i + 1}</span>}
            </div>
            <Abs x={p.x} y={p.base - 180 - (1 - Math.min(1, drop)) * 500}>
              <div style={{ opacity: clamp01(drop * 3), transform: `rotate(${(1 - Math.min(1, drop)) * (i % 2 ? 8 : -8)}deg)` }}>
                <Card style={{ width: 330, height: 340, borderRadius: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 22, boxSizing: "border-box", position: "relative", overflow: "hidden", boxShadow: `0 40px 80px -40px rgba(15,43,38,.5), 0 0 0 ${3 * Math.min(1, hl)}px ${rgba(MINT.green, 0.5)}` }}>
                  <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 210, background: `linear-gradient(160deg, ${DUPES[r.k].tile[0]}, ${DUPES[r.k].tile[1]})` }} />
                  <div style={{ position: "absolute", top: 18, left: 0, right: 0, display: "flex", justifyContent: "center", transform: `translateY(${wobble(t, i + 3, 4, 0.9)}px)` }}>
                    <Dupe kind={r.k} h={180} />
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 99, background: MINT.bg, ...tx(19, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    <r.Icon size={18} /> {r.gest}
                  </span>
                  <span style={{ marginTop: 8, ...tx(27, 800), whiteSpace: "nowrap" }}>{DUPES[r.k].short}</span>
                </Card>
              </div>
            </Abs>
            {i > 0 && <Sparkle t={t} at={at[i] + 0.3} x={p.x + 150} y={p.base - 340} size={54} color={i === 3 ? PB.gold : MINT.green} />}
          </div>
        );
      })}
    </Drift>
  );
}

// =====================================================================================================================
// B5 — « Et ce n'est pas fini. » : le QR code, le bilan et ses rappels, l'offre, la notification, le patient revient.
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

/** Le bilan conseil dans l'appli du patient : ses conseils, sa routine, son rappel de fin de cure. */
function AppBilan({ t, at, rappel }: { t: number; at: number; rappel: number }) {
  const st = (i: number): CSSProperties => ({ opacity: prog(t, at + 0.1 * i, 0.35), transform: `translateY(${(1 - prog(t, at + 0.1 * i, 0.35, SNAP)) * 18}px)` });
  const ring = prog(t, rappel - 0.1, 1.0, IN_OUT);
  const lit = prog(t, rappel - 0.1, 0.25) * (1 - prog(t, rappel + 1.2, 0.5));
  return (
    <div style={{ position: "absolute", inset: 0, background: "#EEF3F1", padding: "58px 16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...st(0) }}>
        <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 10, background: PB.green, alignItems: "center", justifyContent: "center" }}>
          <Cross size={18} color={PB.citron} />
        </span>
        <span style={tx(16, 800, "#101828")}>PharmaBoost</span>
        <span style={{ marginLeft: "auto", ...tx(12, 600, "#64748B") }}>Pharmacie du Centre</span>
      </div>
      <div style={{ marginTop: 16, ...tx(26, 800, "#0B3B47"), ...st(1) }}>Mon bilan conseil</div>
      <div style={{ ...tx(13, 600, "#64748B"), ...st(1) }}>Isotrétinoïne 20 mg · aujourd&apos;hui</div>
      <div style={{ marginTop: 12, borderRadius: 18, background: "#FFFFFF", padding: 12, ...st(2) }}>
        <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Ma routine</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {ROUTINE.map((r) => (
            <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <DupeTile kind={r.k} size={40} radius={10} />
              <span style={{ lineHeight: 1.1, ...tx(12, 700, "#101828") }}>{DUPES[r.k].short}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 12, ...st(3) }}>
        <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Mes gestes</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {ROUTINE.map(({ Icon, gest }) => (
            <span key={gest} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", borderRadius: 10, background: "#EAF5EF", ...tx(12.5, 700, MINT.deep) }}>
              <Icon size={14} /> {gest}
            </span>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 12, display: "flex", alignItems: "center", gap: 12, boxShadow: lit > 0 ? `0 0 0 ${3 * lit}px ${rgba(MINT.green, 0.6)}` : undefined, transform: `scale(${1 + 0.04 * lit})`, ...st(4) }}>
        <svg width={52} height={52} viewBox="0 0 56 56">
          <circle cx={28} cy={28} r={23} fill="none" stroke="#E3ECE8" strokeWidth={7} />
          <circle cx={28} cy={28} r={23} fill="none" stroke={MINT.green} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - 0.77 * ring} transform="rotate(-90 28 28)" />
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em", textTransform: "uppercase" }}>Mes rappels</div>
          <div style={tx(14, 800, "#101828")}>Fin de cure dans 7 jours</div>
        </div>
        <Bell size={22} color={MINT.green} style={{ transform: `rotate(${lit > 0 ? Math.sin(t * 30) * 16 * lit : 0}deg)` }} />
      </div>
    </div>
  );
}

/** Une silhouette de patient qui marche (tête, buste, jambes qui alternent). */
function Walker({ t, x, y, color, walking }: { t: number; x: number; y: number; color: string; walking: boolean }) {
  const sw = walking ? Math.sin(t * 11) * 16 : 0;
  const bob = walking ? Math.abs(Math.sin(t * 11)) * -6 : 0;
  return (
    <div style={{ position: "absolute", left: x - 50, top: y - 250 + bob, width: 100, height: 250 }}>
      <div style={{ position: "absolute", left: 30, top: 0, width: 46, height: 46, borderRadius: 99, background: "#F2C9A8" }} />
      <div style={{ position: "absolute", left: 24, top: -6, width: 56, height: 26, borderRadius: "28px 28px 8px 8px", background: "#4A3A32" }} />
      <div style={{ position: "absolute", left: 14, top: 52, width: 76, height: 104, borderRadius: "30px 30px 14px 14px", background: color }} />
      {[1, -1].map((s) => (
        <div key={s} style={{ position: "absolute", left: 34 + (s > 0 ? 18 : 0), top: 148, width: 18, height: 96, borderRadius: 9, background: MINT.ink, transformOrigin: "9px 6px", transform: `rotate(${s * sw}deg)` }} />
      ))}
    </div>
  );
}

function PasFini({ t }: { t: number }) {
  const b = VAT.B5;
  const words = M.B5.words.slice(0, 5);
  const zoom = prog(t, w("B5", "fini.") + 0.45, 0.45, EXIT);
  const phoneAt = w("B5", "le") - 0.25;
  const phoneIn = prog(t, phoneAt, 0.8, SNAP);
  const qrAt = w("B5", "patient") - 0.1;
  const qrIn = prog(t, qrAt, 0.5, SNAP);
  const scan = w("B5", "scanne") - 0.05;
  const found = w("B5", "code");
  const opens = w("B5", "bilan") - 0.15;
  const camera = prog(t, scan, 0.3, SNAP) * (1 - prog(t, opens, 0.3));
  const opened = prog(t, opens, 0.45, SNAP);
  const rappels = w("B5", "rappels.");
  const offre = w("B5", "offre") - 0.15;
  const swap = prog(t, offre - 0.2, 0.8, IN_OUT);
  const lock = prog(t, offre + 0.2, 0.4);
  const recoit = w("B5", "reçoit") - 0.1;
  const notif = w("B5", "notification,") - 0.05;
  const revient = w("B5", "revient");
  const fly = prog(t, recoit - 0.2, 0.6, IN_OUT);
  const offerK = pop(t, offre + 0.1);
  const shopIn = prog(t, notif + 0.35, 0.6, SNAP);
  const walk = prog(t, revient - 0.5, 1.1, IN_OUT);
  const doorOpen = prog(t, revient + 0.35, 0.3) * (1 - prog(t, revient + 1.0, 0.3));
  const inside = prog(t, revient + 0.6, 0.25);
  const beam = ((t - scan) % 1.1) / 1.1;
  const phoneX = lerp(1250, 560, swap);
  const SHOP_X = 1380;
  return (
    <>
      {/* « Et ce n'est pas fini. » — les mots claquent, puis l'image fonce dedans */}
      {zoom < 1 && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - zoom, transform: `scale(${1 + 2.5 * zoom})`, filter: zoom > 0 ? `blur(${zoom * 10}px)` : undefined }}>
          <div style={{ position: "absolute", left: 960 - 1100, top: 500 - 1100, width: 2200, height: 2200, borderRadius: "50%", background: `repeating-conic-gradient(${rgba(MINT.green, 0.08)} 0deg 8deg, transparent 8deg 20deg)`, transform: `rotate(${(t - b) * 20}deg)`, opacity: prog(t, b, 0.4) }} />
          <Abs x={960} y={500}>
            <div style={{ display: "flex", gap: 30, whiteSpace: "nowrap" }}>
              {words.map((x, i) => {
                const k = pop(t, b + x.at - 0.04);
                const accent = i >= 3;
                return (
                  <span key={i} style={{ display: "inline-block", ...tx(150, 800, accent ? MINT.green : MINT.ink), letterSpacing: "-0.045em", opacity: clamp01(k * 3), transform: `scale(${1 + (1 - k) * 1.4})` }}>
                    {x.w}
                  </span>
                );
              })}
            </div>
          </Abs>
        </div>
      )}
      <Flash t={t} at={w("B5", "fini.") + 0.6} dur={0.3} max={0.4} color="#FFFFFF" />
      <Title t={t} at={qrAt} out={offre - 0.4} text="Le bilan conseil, *sur son téléphone.*" y={110} size={62} />
      <Title t={t} at={offre - 0.1} out={revient - 0.3} text="Une offre de *votre pharmacie.*" y={110} size={62} />
      <Title t={t} at={revient - 0.15} text="Et il *revient chez vous.*" y={110} size={62} />
      {/* Le QR code sur l'écran du comptoir */}
      {qrIn > 0 && swap < 1 && (
        <Abs x={560 - 700 * swap} y={560}>
          <div style={{ opacity: qrIn * (1 - swap), transform: `scale(${0.85 + 0.15 * qrIn}) rotate(${(1 - qrIn) * -6}deg)` }}>
            <Card style={{ width: 440, padding: "28px 30px 24px", borderRadius: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, boxShadow: `0 40px 80px -40px rgba(15,43,38,.45), 0 0 0 ${4 * Math.min(1, pop(t, found))}px ${rgba(MINT.green, 0.5)}` }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, ...tx(18, 800, MINT.deep), letterSpacing: "0.16em" }}>
                <Cross size={22} /> BILAN DU PATIENT
              </span>
              <QrArt size={270} />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, ...tx(21, 700, MINT.soft) }}>
                <QrCode size={24} color={MINT.green} /> Sur l&apos;écran du comptoir
              </span>
            </Card>
          </div>
        </Abs>
      )}
      {/* Le faisceau entre le téléphone et le QR code */}
      {camera > 0.05 && swap < 0.2 && (
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <path d="M1075 560 L 785 470 L 785 650 Z" fill={rgba(MINT.green, 0.12 * camera)} />
          <line x1={785} y1={470 + 180 * beam} x2={1075} y2={560} stroke={MINT.green} strokeWidth={3} opacity={0.6 * camera} />
        </svg>
      )}
      <Ring t={t} at={found} x={560} y={560} max={600} color={MINT.green} />
      {/* L'offre de la pharmacie, qui part vers le téléphone */}
      {offerK > 0 && fly < 1 && (
        <Abs x={lerp(1340, phoneX, fly)} y={lerp(470, 400, fly) - Math.sin(Math.PI * fly) * 160}>
          <div style={{ transform: `scale(${Math.min(1.05, offerK) * lerp(1, 0.25, fly)}) rotate(${fly * -20}deg)`, opacity: 1 - clamp01((fly - 0.75) / 0.25) }}>
            <Card style={{ width: 640, padding: "24px 28px", borderRadius: 28, display: "flex", alignItems: "center", gap: 20, whiteSpace: "nowrap" }}>
              <span style={{ display: "inline-flex", flexShrink: 0, width: 84, height: 84, borderRadius: 22, background: GRAD, alignItems: "center", justifyContent: "center" }}>
                <Megaphone size={44} color="#FFFFFF" />
              </span>
              <div>
                <div style={{ ...tx(16, 800, MINT.green), letterSpacing: "0.14em", textTransform: "uppercase" }}>Campagne · Pharmacie du Centre</div>
                <div style={{ marginTop: 4, ...tx(30, 800) }}>−20 % sur la protection solaire</div>
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <DupeTile kind="iso-solaire" size={34} radius={9} />
                  <span style={tx(17, 600, MINT.soft)}>Envoyée à vos patients</span>
                </div>
              </div>
            </Card>
          </div>
        </Abs>
      )}
      {/* La pharmacie et le patient qui revient */}
      {shopIn > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: shopIn, transform: `translateY(${(1 - shopIn) * 120}px)` }}>
          <div style={{ position: "absolute", left: 1000, right: 0, top: 888, height: 10, borderRadius: 5, background: rgba(MINT.ink, 0.8) }} />
          <div style={{ position: "absolute", inset: 0, transform: "scale(0.86)", transformOrigin: `${SHOP_X}px 890px` }}>
            <Shop x={SHOP_X} lit={1} t={t} />
            {/* La porte qui s'ouvre */}
            <div style={{ position: "absolute", left: SHOP_X - 320 + 410, top: 580, width: 180, height: 310, borderRadius: "12px 12px 0 0", background: `rgba(15,43,38,${0.75 * doorOpen})` }} />
          </div>
          {inside < 1 && <Walker t={t} x={lerp(1880, SHOP_X + 150, walk)} y={890} color={PASSANTS[0]} walking={walk > 0 && walk < 1} />}
          <Ring t={t} at={revient + 0.55} x={SHOP_X + 150} y={720} max={360} color={MINT.green} />
          <Sparkle t={t} at={revient + 0.6} x={SHOP_X + 300} y={420} size={70} color={PB.gold} />
        </div>
      )}
      {/* Le téléphone du patient */}
      {phoneIn > 0 && (
        <Phone t={t} x={phoneX} y={545 + (1 - phoneIn) * 700} scale={0.9} tilt={lerp(50, -8, phoneIn) + 16 * swap} buzz={notif} screen={swap > 0.5 ? LOCK_BG : undefined}>
          <div style={{ position: "absolute", inset: 0 }}>
            {lock < 1 && (
              <div style={{ position: "absolute", inset: 0, opacity: 1 - lock }}>
                <div style={{ position: "absolute", inset: 0, background: "#EEF3F1" }} />
                {camera > 0.01 && (
                  <div style={{ position: "absolute", inset: 0, background: "#0B1714", opacity: camera, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ position: "relative", width: 230, height: 230, borderRadius: 24, border: `4px solid ${t > found ? "#5BFF9C" : MINT.green}` }}>
                      <div style={{ position: "absolute", inset: 18, opacity: 0.9 }}>
                        <QrArt size={186} light />
                      </div>
                      <div style={{ position: "absolute", left: 10, right: 10, top: `${10 + beam * 200}px`, height: 4, borderRadius: 4, background: MINT.green, boxShadow: `0 0 18px ${MINT.green}` }} />
                    </div>
                  </div>
                )}
                {opened > 0.01 && (
                  <div style={{ position: "absolute", inset: 0, opacity: opened }}>
                    <AppBilan t={t} at={opens} rappel={rappels} />
                  </div>
                )}
              </div>
            )}
            {lock > 0 && (
              <div style={{ position: "absolute", inset: 0, opacity: lock, background: LOCK_BG }}>
                <div style={{ position: "absolute", top: 120, left: 0, right: 0, textAlign: "center", fontFamily: JAKARTA, fontWeight: 300, fontSize: 84, color: "#FFFFFF", letterSpacing: "-0.03em" }}>9:41</div>
                <div style={{ position: "absolute", top: 215, left: 0, right: 0, textAlign: "center", ...tx(18, 600, "#FFFFFF") }}>samedi 14 novembre</div>
                <div style={{ position: "absolute", top: 270, left: 0, right: 0, height: 200 }}>
                  <Notification t={t} at={notif} icon="robot" app="Pharmacie du Centre" title="−20 % sur votre protection solaire" body="Votre routine vous attend à la Pharmacie du Centre, cette semaine." />
                </div>
              </div>
            )}
          </div>
        </Phone>
      )}
      {phoneIn > 0 && (
        <Abs x={phoneX + 290} y={300}>
          <div style={{ opacity: prog(t, rappels - 0.1, 0.3) * (1 - prog(t, offre - 0.3, 0.3)) }}>
            <Pill t={t} at={rappels - 0.1} size={26}>
              <Bell size={26} color={MINT.green} /> Rappel avant la fin de cure
            </Pill>
          </div>
        </Abs>
      )}
    </>
  );
}

// =====================================================================================================================
// B6 — Le tableau du titulaire : conseils, chiffre d'affaires, patients fidèles, équipe soulagée ; « qui se démarque ».
// =====================================================================================================================
function Resultats({ t }: { t: number }) {
  const b = VAT.B6;
  const boardIn = prog(t, b + 0.1, 0.6, SNAP);
  const demarque = w("B6", "une", 1) - 0.1;
  const out = prog(t, demarque, 0.55, IN_OUT);
  const T = {
    conseils: w("B6", "conseils,") - 0.1,
    ca: w("B6", "chiffre") - 0.1,
    fideles: w("B6", "patients") - 0.1,
    equipe: w("B6", "équipe") - 0.1,
    soulagee: w("B6", "soulagée,"),
    retenir: w("B6", "qui", 0),
  };
  const tile = (at: number): CSSProperties => {
    const k = pop(t, at);
    return { opacity: clamp01(k * 2.5), transform: `translateY(${(1 - Math.min(1, k)) * 50}px) scale(${0.9 + 0.1 * Math.min(1.05, k)})` };
  };
  const line = prog(t, T.conseils + 0.1, 1.0, IN_OUT);
  const ca = prog(t, T.ca + 0.1, 0.9, IN_OUT);
  const fid = prog(t, T.fideles + 0.1, 0.9, IN_OUT);
  const calm = prog(t, T.soulagee - 0.1, 0.9, IN_OUT);
  const stress = lerp(0.88, 0.22, calm);
  const PTS = [[0, 120], [50, 108], [100, 112], [150, 86], [200, 74], [250, 50], [300, 22]];
  const path = PTS.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const bars = [0.35, 0.42, 0.4, 0.55, 0.68, 0.86];
  const worries = ["Date courte ?", "Challenge ?", "Le bon produit ?"];
  const head: CSSProperties = { display: "flex", alignItems: "center", gap: 12, ...tx(24, 800) };
  const big: CSSProperties = { ...tx(64, 800, MINT.green), letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", lineHeight: 1 };
  const smile = 8 + 18 * calm;
  const lift = prog(t, demarque - 0.1, 0.4);
  return (
    <>
      <Title t={t} at={b + 0.02} out={demarque - 0.3} text="Résultat." y={110} size={68} />
      {out < 1 && (
        <Abs x={960} y={575 - 40 * out}>
          <div style={{ opacity: boardIn * (1 - out), transform: `translateY(${(1 - boardIn) * 80}px) scale(${(0.94 + 0.06 * boardIn) * (1 - 0.25 * out)})` }}>
            <Card style={{ width: 1640, height: 590, borderRadius: 34, padding: "26px 32px", boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Cross size={26} />
                <span style={tx(26, 800)}>Tableau de bord · Pharmacie du Centre</span>
                <Example />
                <span style={{ marginLeft: "auto", ...tx(20, 700, MINT.soft) }}>Ce trimestre</span>
              </div>
              <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 22 }}>
                {/* Conseils */}
                <div style={{ ...tile(T.conseils), borderRadius: 24, background: MINT.paper, padding: 24, height: 470, boxSizing: "border-box" }}>
                  <div style={head}>
                    <TrendingUp size={28} color={MINT.green} /> Conseils
                  </div>
                  <div style={{ marginTop: 22, ...big }}>+{Math.round(42 * line)} %</div>
                  <svg width={320} height={150} viewBox="-10 0 320 140" style={{ marginTop: 40, overflow: "visible" }}>
                    <path d={path} fill="none" stroke={MINT.green} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - line} />
                    {line > 0.98 && <circle cx={300} cy={22} r={10} fill={MINT.green} />}
                  </svg>
                </div>
                {/* Chiffre d'affaires */}
                <div style={{ ...tile(T.ca), borderRadius: 24, background: MINT.paper, padding: 24, height: 470, boxSizing: "border-box" }}>
                  <div style={head}>
                    <TrendingUp size={28} color={MINT.green} /> Chiffre d&apos;affaires
                  </div>
                  <div style={{ marginTop: 22, ...big }}>+{Math.round(18 * ca)} %</div>
                  <div style={{ marginTop: 40, height: 170, display: "flex", alignItems: "flex-end", gap: 14 }}>
                    {bars.map((h, i) => (
                      <div key={i} style={{ flex: 1, height: 170 * h * prog(t, T.ca + 0.1 + i * 0.07, 0.45, SNAP), borderRadius: "10px 10px 4px 4px", background: i === bars.length - 1 ? GRAD : rgba(MINT.green, 0.3) }} />
                    ))}
                  </div>
                </div>
                {/* Patients fidèles */}
                <div style={{ ...tile(T.fideles), borderRadius: 24, background: MINT.paper, padding: 24, height: 470, boxSizing: "border-box" }}>
                  <div style={head}>
                    <Users size={28} color={MINT.green} /> Patients fidèles
                  </div>
                  <div style={{ marginTop: 22, ...big }}>+{Math.round(27 * fid)} %</div>
                  <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                    {Array.from({ length: 15 }, (_, i) => {
                      const on = fid * 15 > i;
                      return (
                        <span key={i} style={{ display: "inline-flex", justifyContent: "center", transform: `scale(${on ? 1 : 0.85})` }}>
                          <svg width={40} height={46} viewBox="0 0 40 46">
                            <circle cx={20} cy={12} r={10} fill={on ? MINT.green : "#CBD8D3"} />
                            <path d="M2 46 C2 30 10 25 20 25 C30 25 38 30 38 46 Z" fill={on ? MINT.green : "#CBD8D3"} />
                          </svg>
                        </span>
                      );
                    })}
                  </div>
                </div>
                {/* L'équipe soulagée */}
                <div style={{ ...tile(T.equipe), borderRadius: 24, background: MINT.paper, padding: 24, height: 470, boxSizing: "border-box", position: "relative" }}>
                  <div style={head}>
                    <Smile size={28} color={MINT.green} /> Équipe
                  </div>
                  <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
                    <svg width={150} height={150} viewBox="0 0 150 150">
                      <circle cx={75} cy={75} r={68} fill={calm > 0.5 ? "#FDE7D6" : "#F6DCCB"} />
                      <path d={`M42 ${52 + 8 * (1 - calm)} Q 52 ${46 + 2 * calm} 62 ${50 - 6 * (1 - calm)}`} stroke={MINT.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
                      <path d={`M88 ${50 - 6 * (1 - calm)} Q 98 ${46 + 2 * calm} 108 ${52 + 8 * (1 - calm)}`} stroke={MINT.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
                      {calm > 0.6 ? (
                        <>
                          <path d="M46 72 Q 54 64 62 72" stroke={MINT.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
                          <path d="M88 72 Q 96 64 104 72" stroke={MINT.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
                        </>
                      ) : (
                        <>
                          <circle cx={54} cy={70} r={6} fill={MINT.ink} />
                          <circle cx={96} cy={70} r={6} fill={MINT.ink} />
                        </>
                      )}
                      <path d={`M50 ${104 - (smile - 8) * 0.3} Q 75 ${104 + smile - 14} 100 ${104 - (smile - 8) * 0.3}`} stroke={MINT.ink} strokeWidth={6} fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ marginTop: 18, ...tx(17, 800, MINT.soft), letterSpacing: "0.1em", textTransform: "uppercase" }}>Tout à retenir</div>
                  <div style={{ marginTop: 8, height: 22, borderRadius: 11, background: "#E3ECE8", overflow: "hidden" }}>
                    <div style={{ width: `${stress * 100}%`, height: "100%", borderRadius: 11, background: stress > 0.55 ? "linear-gradient(90deg,#F2A23A,#D9483B)" : GRAD }} />
                  </div>
                  <div style={{ marginTop: 14, ...tx(26, 800, calm > 0.5 ? MINT.green : "#D9483B") }}>{calm > 0.5 ? "Soulagée" : "Sous pression"}</div>
                </div>
              </div>
            </Card>
          </div>
        </Abs>
      )}
      {/* Ce que l'équipe n'a plus à retenir : ça surgit sur « équipe », ça s'envole sur « qui n'a plus à tout retenir » */}
      {worries.map((wd, i) => {
        const k = pop(t, T.equipe + 0.15 + i * 0.15);
        const gone = prog(t, T.retenir + 0.15 + i * 0.22, 0.6, IN_OUT);
        if (k <= 0 || gone >= 1) return null;
        return (
          <Abs key={wd} x={1290 + i * 215} y={200 - gone * 220 + (i % 2) * 18}>
            <div style={{ opacity: clamp01(k * 2) * (1 - gone) * (1 - out), transform: `scale(${Math.min(1.05, k)}) rotate(${(i - 1) * 5 + gone * 25}deg)`, padding: "10px 18px", borderRadius: 14, background: "#FFF3B0", boxShadow: "0 12px 24px -12px rgba(0,0,0,.35)", ...tx(22, 800, "#7A5A00"), whiteSpace: "nowrap" }}>
              {wd}
            </div>
          </Abs>
        );
      })}
      {/* « Une pharmacie qui se démarque. » */}
      {lift > 0 && (
        <>
          <Abs x={960} y={220}>
            <Rise t={t} at={demarque + 0.15} text="Une pharmacie *qui se démarque.*" size={84} style={{ width: 1700 }} />
          </Abs>
          {[-2, -1, 1, 2].map((s) => {
            const k = prog(t, demarque + 0.2 + Math.abs(s) * 0.08, 0.5, SNAP);
            return (
              <Abs key={s} x={960 + s * 330} y={620}>
                <div style={{ opacity: k * 0.9, transform: `translateY(${(1 - k) * 80}px)` }}>
                  <Store size={150} color="#C3CBC8" strokeWidth={1.6} />
                </div>
              </Abs>
            );
          })}
          <Abs x={960} y={600}>
            <div style={{ transform: `scale(${Math.min(1.08, pop(t, w("B6", "démarque.") - 0.15)) * 1})`, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 300, height: 300, borderRadius: 999, background: `radial-gradient(circle, ${rgba(MINT.green, 0.25)}, transparent 70%)`, position: "absolute", top: -40 }} />
              <Cross size={70} color="#2BD67B" glow={0.8 + 0.2 * Math.sin(t * 4)} />
              <Store size={230} color={MINT.green} strokeWidth={1.8} />
            </div>
          </Abs>
          <Abs x={960} y={870}>
            <div style={{ opacity: prog(t, w("B6", "démarque.") + 0.1, 0.4), ...tx(30, 800, MINT.deep) }}>Pharmacie du Centre</div>
          </Abs>
          <Ring t={t} at={w("B6", "démarque.") - 0.05} x={960} y={600} max={900} color={MINT.green} width={6} />
          <Sparkle t={t} at={w("B6", "démarque.")} x={1180} y={430} size={80} color={PB.gold} />
          <Sparkle t={t} at={w("B6", "démarque.") + 0.12} x={760} y={480} size={60} color={MINT.green} />
        </>
      )}
    </>
  );
}

// =====================================================================================================================
// B7 — La signature.
// =====================================================================================================================
function Fin({ t }: { t: number }) {
  const pb = VAT.B7;
  const btn = ressort(t, FINAL_HIT + 0.3, { damping: 10, stiffness: 240, mass: 0.6 });
  const click = FINAL_HIT + 1.3;
  const pressed = t > click && t < click + 0.15;
  const cur = prog(t, FINAL_HIT + 0.5, 0.7, IN_OUT);
  return (
    <>
      <Flash t={t} at={pb - 0.05} dur={0.3} max={0.5} />
      <Flash t={t} at={FINAL_HIT} dur={0.35} max={0.4} />
      <Abs x={960} y={290}>
        <PBLogo t={t} at={pb} size={120} tone="light" grad />
      </Abs>
      <Ring t={t} at={pb + 0.1} x={960} y={290} max={1000} color={MINT.green} />
      <Ring t={t} at={w("B7", "copilote") - 0.05} x={960} y={520} max={700} color={PB.cyan} />
      <Sparkle t={t} at={w("B7", "copilote")} x={300} y={460} size={64} color={PB.gold} />
      <Sparkle t={t} at={w("B7", "copilote") + 0.12} x={1620} y={560} size={56} color={MINT.green} />
      <Abs x={960} y={520}>
        <Rise t={t} at={w("B7", "le") - 0.1} text="Le copilote IA *du comptoir de votre pharmacie.*" size={64} style={{ width: 1700, whiteSpace: "nowrap" }} />
      </Abs>
      {t >= FINAL_HIT && (
        <>
          <Confetti t={t} at={FINAL_HIT + 0.1} x={960} y={420} count={70} power={1500} />
          <Abs x={960} y={720}>
            <div style={{ position: "relative", transform: `scale(${btn * (pressed ? 0.96 : 1)})`, display: "flex", alignItems: "center", gap: 16, padding: "26px 50px", borderRadius: 999, background: MINT.green, ...tx(42, 800, "#FFFFFF"), boxShadow: `0 24px 50px -20px ${rgba(MINT.green, 0.7)}`, whiteSpace: "nowrap" }}>
              <CalendarCheck size={44} /> Réserver une démonstration
              <span style={{ position: "absolute", inset: 0, borderRadius: 999, overflow: "hidden", pointerEvents: "none" }}>
                <span style={{ position: "absolute", top: 0, bottom: 0, width: 160, left: `${-30 + 160 * (((t - FINAL_HIT) * 0.7) % 1.6)}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent)" }} />
              </span>
            </div>
          </Abs>
          <Abs x={1240 + 420 * (1 - cur)} y={770 + 200 * (1 - cur)}>
            <MousePointer2 size={58} fill="#0F2B26" color="#FFFFFF" strokeWidth={1.5} style={{ opacity: prog(t, FINAL_HIT + 0.45, 0.2), transform: `scale(${pressed ? 0.82 : 1})` }} />
          </Abs>
          <Ring t={t} at={click} x={1230} y={750} max={260} color={MINT.green} />
          <Abs x={960} y={850}>
            <div style={{ opacity: prog(t, FINAL_HIT + 0.6, 0.5), ...tx(38, 800, MINT.deep) }}>pharmaboost.app</div>
          </Abs>
        </>
      )}
    </>
  );
}

// ---- Les sous-titres (le point d'interrogation isolé rejoint le mot qui précède) ------------------------------------
type CapLine = { at: number; words: Word[] };
const CAPTION_LINES: CapLine[] = [];
for (const l of linesOf(2)) {
  if (VAT[l.id] === undefined) continue;
  const merged: Word[] = [];
  for (const wd of M[l.id].words) {
    if (/^[?!:;]$/.test(wd.w) && merged.length) merged[merged.length - 1] = { ...merged[merged.length - 1], w: `${merged[merged.length - 1].w} ${wd.w}`, end: wd.end };
    else merged.push(wd);
  }
  let cur: Word[] = [];
  for (const wd of merged) {
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
      <div style={{ maxWidth: 1760, padding: "10px 24px", borderRadius: 16, background: "rgba(255,255,255,.92)", boxShadow: "0 10px 30px -18px rgba(15,43,38,.4)", textAlign: "center", ...tx(31, 700), lineHeight: 1.3, whiteSpace: "nowrap" }}>
        {line.words.map((wd, i) => (
          <span key={i} style={{ color: vt >= wd.at ? MINT.ink : rgba(MINT.ink, 0.3) }}>
            {wd.w}
            {i < line.words.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </Abs>
  );
}

// ---- La musique du film iso : la montée arrive sur « Voici PharmaBoost », groove bouclé, fin calée sur le dernier coup ----
const DROP = w("B1", "voici") - 0.1;
const LOOP: [number, number] = [20, 58];
const TAIL_AT = FINAL_HIT - (66 - 58);
type Seg = { at: number; from: number; to: number; gain: (t: number) => number };
const SPANS = linesOf(2).map((l) => [VAT[l.id], end(l.id)] as const);
const duck = (t: number) => {
  let d = 0;
  for (const [a, b] of SPANS) if (t >= a - 0.2 && t <= b + 0.45) d = Math.max(d, Math.min(1, (t - (a - 0.2)) / 0.2, (b + 0.45 - t) / 0.45));
  return d;
};
const level = (t: number) => 0.3 + (0.1 - 0.3) * duck(t);
const MUSIC: Seg[] = [];
MUSIC.push({ at: 0, from: 20 - DROP, to: 20, gain: (t) => Math.min(1, t / 0.6) * (0.22 + (0.11 - 0.22) * duck(t)) });
{
  let at = DROP;
  while (at < TAIL_AT - 0.01) {
    const l = Math.min(LOOP[1] - LOOP[0], TAIL_AT - at);
    MUSIC.push({ at, from: LOOP[0], to: LOOP[0] + l, gain: level });
    at += l;
  }
  MUSIC.push({ at: TAIL_AT, from: 58, to: 69, gain: (t) => Math.max(level(t), t > FINAL_HIT - 0.9 ? 0.4 : 0) * (1 - prog(t, TOTAL - 1.4, 1.3)) });
}

// ---- Les bruitages : un sur chaque temps fort -------------------------------------------------------------------------
const SFX: Cue[] = [
  cue("whoosh-impact", 0.25, 0.4),
  cue("papier", 0.5, 0.4),
  cue("pop-leger", w("B1", "chaque"), 0.28),
  cue("pop-leger", w("B1", "chaque") + 0.1, 0.24, 1.08),
  cue("scan-laser", w("B1", "potentiel") - 0.05, 0.25),
  ...ROUTINE.map((_, i) => cue("pop-leger", w("B1", "potentiel") + 0.15 + i * 0.2 + 0.55, 0.26, 1 + i * 0.06)),
  cue("jauge", w("B1", "potentiel") + 0.1, 0.3),
  cue("cloche-reussite", w("B1", "?"), 0.3),
  cue("whoosh-pb", w("B1", "voici") - 0.15, 0.4),
  cue("impact-revelation", w("B1", "pharmaboost,") - 0.05, 0.35),
  ...FALL.map((at, i) => cue("impact-net", at + 0.1, 0.3, 1 + i * 0.08)),
  cue("swoosh", DOCK, 0.3),
  // Étape 1
  cue("whoosh-lourd", VAT.B2 - 0.05, 0.35),
  cue("sub-boom", VAT.B2 + 0.12, 0.35),
  cue("swoosh", STEP_ON[0] - 0.05, 0.25),
  cue("boite-posee", w("B2", "scannez") + 0.3, 0.4),
  cue("scanner-bip", w("B2", "médicaments") + 0.1, 0.55),
  cue("ui-ding", w("B2", "médicaments") + 0.55, 0.35),
  cue("pop-leger", w("B2", "comme") - 0.05, 0.3),
  cue("pop-leger", w("B2", "ici,") - 0.05, 0.3, 1.08),
  cue("etincelle", w("B2", "l'isotrétinoïne."), 0.3),
  // Étape 2
  cue("whoosh-lourd", VAT.B3 - 0.05, 0.35),
  cue("sub-boom", VAT.B3 + 0.12, 0.35),
  cue("robot-allume", w("B3", "pharmaboost") - 0.05, 0.3),
  cue("swipe-tel", w("B3", "affiche") - 0.1, 0.3),
  cue("pop-leger", w("B3", "stock,") - 0.08, 0.3, 1),
  cue("pop-leger", w("B3", "dates") - 0.08, 0.3, 1.05),
  cue("pop-leger", w("B3", "challenges") - 0.08, 0.3, 1.1),
  cue("pop-leger", w("B3", "laboratoire") - 0.08, 0.3, 1.15),
  cue("orbite", w("B3", "titulaire."), 0.3),
  cue("carte-depliee", w("B3", "crème") - 0.15, 0.4),
  cue("cloche-reussite", w("B3", "crème"), 0.25),
  cue("etincelle", w("B3", "apaisante."), 0.3),
  // Étape 3
  cue("whoosh-lourd", VAT.B4 - 0.05, 0.35),
  cue("sub-boom", VAT.B4 + 0.12, 0.35),
  cue("boite-posee", w("B4", "complète") + 0.05, 0.3),
  cue("pop-long", w("B4", "soin"), 0.3, 1),
  cue("pop-long", w("B4", "baume"), 0.3, 1.08),
  cue("pop-long", w("B4", "protection"), 0.3, 1.16),
  cue("montee", w("B4", "solaire.") - 0.1, 0.25),
  // Pas fini → le téléphone
  ...M.B5.words.slice(0, 5).map((x, i) => cue("impact-net", VAT.B5 + x.at - 0.04, 0.22, 1 + i * 0.05)),
  cue("whoosh-cine", w("B5", "fini.") + 0.4, 0.4),
  cue("swipe-tel", w("B5", "le") - 0.2, 0.35),
  cue("radar", w("B5", "scanne"), 0.2),
  cue("ui-ding", w("B5", "code"), 0.35),
  cue("mail", w("B5", "bilan") - 0.15, 0.35),
  cue("notif-douce", w("B5", "rappels.") - 0.1, 0.35),
  cue("pop-leger", w("B5", "offre"), 0.3),
  cue("avion-papier", w("B5", "reçoit") - 0.2, 0.35),
  cue("telephone-vibre", w("B5", "notification,") - 0.05, 0.4),
  cue("notif-douce", w("B5", "notification,"), 0.3),
  cue("porte-carillon", w("B5", "revient") + 0.35, 0.35),
  // Résultats
  cue("whoosh-rapide", VAT.B6, 0.3),
  cue("pop-leger", w("B6", "conseils,") - 0.1, 0.3),
  cue("compteur", w("B6", "conseils,"), 0.2),
  cue("pop-leger", w("B6", "chiffre") - 0.1, 0.3, 1.05),
  cue("caisse", w("B6", "d'affaires,"), 0.25),
  cue("pop-leger", w("B6", "patients") - 0.1, 0.3, 1.1),
  cue("pop-leger", w("B6", "équipe") - 0.1, 0.3, 1.15),
  cue("bulle", w("B6", "qui", 0) + 0.25, 0.3),
  cue("bulle", w("B6", "qui", 0) + 0.5, 0.3, 1.1),
  cue("bulle", w("B6", "qui", 0) + 0.75, 0.3, 1.2),
  cue("whoosh-rapide", w("B6", "une", 1) - 0.1, 0.3),
  cue("impact-epique", w("B6", "démarque.") - 0.15, 0.35),
  // Fin
  cue("impact-net", VAT.B7 - 0.05, 0.45),
  cue("etincelle", w("B7", "copilote"), 0.35),
  cue("confettis", FINAL_HIT + 0.1, 0.35),
  cue("ui-clic", FINAL_HIT + 1.3, 0.45),
];

function Film() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  return (
    <AbsoluteFill style={{ background: MINT.paper }}>
      <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 0%, #FFFFFF 0%, ${MINT.paper} 55%, #E2EEEA 100%)` }} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.3 }}>
        <AdnBackdrop t={t} tone="paper" width={1920} focus={[0.82, 0.3]} style={{ background: "transparent" }} />
      </div>
      <Scene t={t} from={0} to={DOCK}>
        <Ouverture t={t} />
      </Scene>
      <Scene t={t} from={VAT.B2 + 0.6} to={VAT.B3 - 0.25}>
        <Etape1 t={t} />
      </Scene>
      <Scene t={t} from={VAT.B3 + 0.6} to={VAT.B4 - 0.25}>
        <Etape2 t={t} />
      </Scene>
      <Scene t={t} from={VAT.B4 + 0.6} to={VAT.B5 - 0.2}>
        <Etape3 t={t} />
      </Scene>
      <Scene t={t} from={VAT.B5 - 0.1} to={VAT.B6 - 0.25}>
        <PasFini t={t} />
      </Scene>
      <Scene t={t} from={VAT.B6 - 0.1} to={VAT.B7 - 0.25}>
        <Resultats t={t} />
      </Scene>
      <Scene t={t} from={VAT.B7 - 0.15} to={TOTAL + 1}>
        <Fin t={t} />
      </Scene>
      <Steps t={t} />
      {[0, 1, 2].map((i) => (
        <GiantNum key={i} t={t} i={i} />
      ))}
      <Captions t={t} />
      <Grain t={t} opacity={0.02} />
      <Vignette strength={0.12} />
      {linesOf(2).map((l) => (
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

export const FILM = { Film, TOTAL_FRAMES, TOTAL, VAT };
