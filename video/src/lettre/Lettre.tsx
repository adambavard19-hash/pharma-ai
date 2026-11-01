import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { CalendarCheck, Mail, MonitorPlay, Play, TrendingUp, Video } from "lucide-react";
import { AdnBackdrop, BannerHead, Chip, Cues, Douchette, JAKARTA, MedBox, PB, PBLogo, cue, rgba, type BannerLine } from "../rembobine/kit";
import { IN_OUT, POP, SNAP, keys, prog, ressort } from "../presentation/motion/kit/ease";
import MOTS from "./mots.json";

/**
 * « Lettre sous la porte » (fondateur, 31 oct. 2026) : la vidéo d'excuse que le pharmacien voit en scannant le QR code de la
 * lettre. Yann dit le texte (src/lettre/tools/voix.mjs) ; chaque phrase a son image ; les mots s'affichent en bas, calés sur la
 * voix. Ensuite, sans coupure, le film de présentation (assemblé par tools/assembler.mjs).
 */
export const FPS = 60;
/** La voix commence à 0,8 s ; la carte de fin tient jusqu'à 39 s, puis vient le film. */
export const VOICE_AT = 0.8;
export const TOTAL = 39;
export const TOTAL_FRAMES = TOTAL * FPS;

const V = (s: number) => s + VOICE_AT; // temps de la voix → temps de la vidéo
const MINT = { bg: "#EAF6F0", deep: "#0E7C5A", green: "#0E8A7B", ring: "#3DBF8E", ink: "#0F2B26", soft: "#5B6B66", paper: "#F4F8F6" };

function Abs({ x, y, children, style }: { x: number; y: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", ...style }}>{children}</div>;
}

/** Une scène : elle entre en douceur à `from` et s'efface à `to`. */
function Scene({ t, from, to, children }: { t: number; from: number; to: number; children: ReactNode }) {
  if (t < from - 0.05 || t > to + 0.45) return null;
  const k = prog(t, from, 0.45, SNAP) * (1 - prog(t, to, 0.4, IN_OUT));
  return <AbsoluteFill style={{ opacity: k, transform: `scale(${0.985 + 0.015 * k})` }}>{children}</AbsoluteFill>;
}

function Title({ t, at, children, y = 170, size = 64 }: { t: number; at: number; children: ReactNode; y?: number; size?: number }) {
  const k = prog(t, at, 0.5, SNAP);
  return (
    <Abs x={960} y={y} style={{ opacity: k, transform: `translate(-50%, ${-50 + (1 - k) * 30}%)`, width: 1500, textAlign: "center", fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.035em", color: MINT.ink, lineHeight: 1.05 }}>
      {children}
    </Abs>
  );
}

const Accent = ({ children }: { children: ReactNode }) => <span style={{ color: MINT.green }}>{children}</span>;

// ---- 1. La lettre glissée sous la porte ------------------------------------------------------------------------------
function Door({ t }: { t: number }) {
  const slide = prog(t, 0.5, 1.4, SNAP);
  return (
    <>
      <Title t={t} at={V(0.7)}>
        Pardon pour cette <Accent>lettre</Accent>.
      </Title>
      {/* La porte vitrée de la pharmacie, la croix verte au-dessus. */}
      <Abs x={960} y={590} style={{ transform: "translate(-50%, -50%) scale(0.86)" }}>
        <div style={{ position: "relative", width: 620, height: 640 }}>
          <div style={{ position: "absolute", left: 250, top: -10, width: 120, height: 120 }}>
            <svg viewBox="0 0 40 40" width={120} height={120}>
              <path d="M14 2h12v12h12v12H26v12H14V26H2V14h12z" fill={MINT.green} />
            </svg>
          </div>
          <div style={{ position: "absolute", left: 60, top: 130, width: 500, height: 470, borderRadius: "18px 18px 0 0", background: "linear-gradient(180deg,#DCEFE7,#C7E6DA)", border: `10px solid ${MINT.ink}`, borderBottom: "none", boxShadow: "0 30px 60px -30px rgba(15,43,38,.5)" }}>
            <div style={{ position: "absolute", inset: 24, borderRadius: 8, background: "linear-gradient(135deg,rgba(255,255,255,.75),rgba(255,255,255,.15))" }} />
            <div style={{ position: "absolute", right: 34, top: 230, width: 16, height: 70, borderRadius: 8, background: MINT.ink }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: 70, textAlign: "center", fontFamily: JAKARTA, fontWeight: 800, fontSize: 30, letterSpacing: "0.2em", color: MINT.deep }}>PHARMACIE</div>
          </div>
          {/* Le seuil, et la lettre qui glisse dessous. */}
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

// ---- 2. Plutôt qu'un commercial ---------------------------------------------------------------------------------------
function NoSalesman({ t }: { t: number }) {
  const cross = prog(t, V(5.2), 0.45, SNAP);
  const stamp = ressort(t, V(5.6), { damping: 9, stiffness: 260, mass: 0.6 });
  return (
    <>
      <Title t={t} at={V(3.3)}>
        Plutôt qu&apos;un commercial <Accent>en pleine journée</Accent>.
      </Title>
      {/* La file d'attente du comptoir, et le commercial qui arrive : barré. */}
      <Abs x={960} y={610}>
        <div style={{ position: "relative", width: 1100, height: 520 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ position: "absolute", left: 120 + i * 150, top: 150, opacity: prog(t, V(3.4) + i * 0.15, 0.4) }}>
              <div style={{ width: 90, height: 90, borderRadius: 99, background: "#C9D8D2", margin: "0 auto" }} />
              <div style={{ width: 130, height: 210, borderRadius: "60px 60px 18px 18px", background: "#DCE7E2", marginTop: 10 }} />
            </div>
          ))}
          <div style={{ position: "absolute", left: 120, top: 470, fontFamily: JAKARTA, fontWeight: 700, fontSize: 26, color: MINT.soft, opacity: prog(t, V(4.2), 0.4) }}>Trois patients attendent…</div>
          {/* Le commercial, sa mallette. */}
          <div style={{ position: "absolute", left: 700 + (1 - prog(t, V(4.0), 0.8)) * 260, top: 120 }}>
            <div style={{ width: 100, height: 100, borderRadius: 99, background: "#8FA39C", margin: "0 auto" }} />
            <div style={{ width: 150, height: 240, borderRadius: "70px 70px 18px 18px", background: "#5E716B", marginTop: 10 }} />
            <div style={{ position: "absolute", left: 120, top: 250, width: 90, height: 66, borderRadius: 10, background: "#3E4A46" }} />
            <svg style={{ position: "absolute", left: -60, top: -40 }} width={300} height={440} viewBox="0 0 300 440">
              <path d="M30 30 L270 410" stroke="#E25B4B" strokeWidth={22} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - cross} />
              <path d="M270 30 L30 410" stroke="#E25B4B" strokeWidth={22} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog(t, V(5.4), 0.45, SNAP)} />
            </svg>
          </div>
          <div style={{ position: "absolute", left: 610, top: 400, transform: `rotate(-8deg) scale(${stamp})`, opacity: Math.min(1, stamp), padding: "14px 26px", border: `5px solid ${MINT.green}`, borderRadius: 16, fontFamily: JAKARTA, fontWeight: 800, fontSize: 40, color: MINT.green, background: "rgba(255,255,255,.85)" }}>
            Pas de démarchage
          </div>
        </div>
      </Abs>
    </>
  );
}

// ---- 3. PharmaBoost, à côté du LGO ------------------------------------------------------------------------------------
function NextToLgo({ t }: { t: number }) {
  const pill = ressort(t, V(10.6), { damping: 12, stiffness: 200, mass: 0.7 });
  return (
    <>
      <Abs x={960} y={190}>
        <PBLogo t={t} at={V(8.5)} size={92} tone="light" grad />
      </Abs>
      {/* L'écran du logiciel de gestion, et la petite bannière PharmaBoost posée à côté. */}
      <Abs x={960} y={640}>
        <div style={{ position: "relative", width: 1180, height: 600, opacity: prog(t, V(9.4), 0.5) }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: "#E7ECF1", border: "12px solid #1E2A33", boxShadow: "0 40px 80px -40px rgba(15,43,38,.6)" }}>
            <div style={{ height: 44, background: "#FFFFFF", borderBottom: "1px solid #D4DCE4", display: "flex", alignItems: "center", gap: 14, padding: "0 20px", fontFamily: JAKARTA, fontWeight: 800, fontSize: 18, color: "#2E6DA4" }}>
              Votre LGO <span style={{ fontWeight: 600, color: "#7A8A99" }}>Facturation</span>
            </div>
            <div style={{ margin: 22, height: 120, borderRadius: 10, background: "#C3CFDC" }} />
            <div style={{ margin: "0 22px", borderRadius: 10, background: "#FFFFFF", overflow: "hidden" }}>
              <div style={{ height: 38, background: "#3B5B7E" }} />
              {["AMOXICILLINE 1 g", "PARACÉTAMOL 1 g", ""].map((row, i) => (
                <div key={i} style={{ height: 44, borderTop: "1px solid #E3E8EE", display: "flex", alignItems: "center", padding: "0 18px", fontFamily: JAKARTA, fontWeight: 600, fontSize: 18, color: "#3F4E5C", background: i === 0 ? "#F6E6A6" : undefined }}>{row}</div>
              ))}
            </div>
          </div>
          <div style={{ position: "absolute", right: 70, top: 60, transform: `scale(${pill})`, transformOrigin: "100% 0", height: 72, padding: "0 30px", borderRadius: 999, background: "#FFFFFF", boxShadow: `0 20px 40px -18px rgba(15,43,38,.55), 0 0 0 2px ${rgba(MINT.green, 0.3)}`, display: "flex", alignItems: "center", gap: 14 }}>
            <svg viewBox="0 0 40 40" width={34} height={34}>
              <path d="M14 2h12v12h12v12H26v12H14V26H2V14h12z" fill={MINT.green} />
            </svg>
            <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 20, letterSpacing: "0.22em", color: MINT.ink }}>
              PHARMA<span style={{ color: MINT.green }}>BOOST</span>
            </span>
          </div>
          <div style={{ position: "absolute", right: 90, top: 150, opacity: prog(t, V(11.2), 0.4), fontFamily: JAKARTA, fontWeight: 700, fontSize: 24, color: MINT.deep }}>↑ à côté de votre logiciel, sans le modifier</div>
        </div>
      </Abs>
    </>
  );
}

// ---- 4. Au scan, le conseil et la routine -----------------------------------------------------------------------------
const LINES: BannerLine[] = [
  { n: 1, drug: "AMOXICILLINE 1 g", product: "Lactibiane Référence", image: "lactibiane-reference.jpg", price: "9,90 €", challenge: true, at: V(14.4), chips: [{ kind: "stock", text: "En stock · 8", at: V(17.6) }, { kind: "marge", text: "Marge 3,80 €", at: V(17.9) }] },
  { n: 2, drug: "AMOXICILLINE 1 g", product: "Routine digestion · 3 produits", image: "lactibiane-imedia.jpg", at: V(15.2), chips: [{ kind: "plain", text: "Routine" }] },
];

const DOUCHETTE = { x: 460, y: 425, angle: 12 };

function Scan({ t }: { t: number }) {
  const boxIn = prog(t, V(12.5), 0.5, SNAP);
  return (
    <>
      <Title t={t} at={V(12.6)} y={120} size={56}>
        À chaque boîte scannée : <Accent>le conseil et la routine</Accent>.
      </Title>
      <div style={{ position: "absolute", left: 210, top: 560, opacity: boxIn, transform: `translateY(${(1 - boxIn) * 40}px)` }}>
        <MedBox kind="amoxicilline" w={320} t={t} />
      </div>
      <Douchette t={t} x={DOUCHETTE.x} y={DOUCHETTE.y} angle={DOUCHETTE.angle} size={1.1} beamAt={V(13.2)} beamDur={0.6} />
      <BannerHead t={t} lines={LINES} x={1230} y={540} scale={0.95} highlight={{ n: 1, at: V(14.6) }} />
      <Abs x={1230} y={880}>
        <div style={{ opacity: prog(t, V(17.5), 0.4), fontFamily: JAKARTA, fontWeight: 700, fontSize: 26, color: MINT.deep }}>Pris dans votre stock</div>
      </Abs>
    </>
  );
}

// ---- 5. Selon votre marge, vos challenges, vos dates courtes, vos laboratoires --------------------------------------
function Criteria({ t }: { t: number }) {
  const items = [
    { kind: "marge" as const, text: "Votre marge", at: V(18.7) },
    { kind: "challenge" as const, text: "Vos challenges", at: V(19.3) },
    { kind: "date" as const, text: "Vos dates courtes", at: V(20.4) },
    { kind: "plain" as const, text: "♥ Vos laboratoires préférés", at: V(21.5) },
  ];
  return (
    <>
      <Title t={t} at={V(18.3)} y={230}>
        Choisi <Accent>pour votre pharmacie</Accent>.
      </Title>
      {items.map((item, i) => (
        <Chip key={item.text} t={t} kind={item.kind} text={item.text} at={item.at} size={44} x={i % 2 === 0 ? 690 : 1230} y={470 + Math.floor(i / 2) * 170} />
      ))}
    </>
  );
}

// ---- 6. La vidéo qui suit : une minute -------------------------------------------------------------------------------
function OneMinute({ t }: { t: number }) {
  const ring = prog(t, V(24.6), 1.6, IN_OUT);
  const pop = ressort(t, V(23.3), { damping: 11, stiffness: 220, mass: 0.6 });
  return (
    <>
      <Title t={t} at={V(23.2)}>
        Regardez la vidéo <Accent>qui suit</Accent>.
      </Title>
      <Abs x={960} y={600}>
        <div style={{ position: "relative", width: 380, height: 380, transform: `scale(${pop})` }}>
          <svg width={380} height={380} viewBox="0 0 380 380" style={{ position: "absolute", inset: 0 }}>
            <circle cx={190} cy={190} r={170} fill="none" stroke={rgba(MINT.green, 0.15)} strokeWidth={22} />
            <circle cx={190} cy={190} r={170} fill="none" stroke={MINT.green} strokeWidth={22} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ring} transform="rotate(-90 190 190)" />
          </svg>
          <div style={{ position: "absolute", inset: 60, borderRadius: 999, background: "#FFFFFF", boxShadow: "0 30px 60px -30px rgba(15,43,38,.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Play size={70} fill={MINT.green} color={MINT.green} style={{ marginLeft: 10 }} />
            <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 40, color: MINT.ink }}>1 minute</span>
          </div>
        </div>
      </Abs>
    </>
  );
}

// ---- 7. Une courte visio, pour votre croissance ----------------------------------------------------------------------
function Visio({ t }: { t: number }) {
  const win = ressort(t, V(28.4), { damping: 13, stiffness: 180, mass: 0.7 });
  const grow = prog(t, V(32.2), 1.8, SNAP);
  return (
    <>
      <Title t={t} at={V(27.2)} y={150}>
        Une courte <Accent>visioconférence</Accent>.
      </Title>
      <Abs x={700} y={590}>
        <div style={{ transform: `scale(${win})`, width: 760, height: 470, borderRadius: 26, background: "#13221F", padding: 18, boxShadow: "0 40px 80px -40px rgba(15,43,38,.7)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, height: 370 }}>
            <div style={{ borderRadius: 16, background: "linear-gradient(160deg,#BDEBD7,#8FDDBE)", display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
              <Img src={staticFile("lettre/robot.png")} style={{ width: 300 }} />
            </div>
            <div style={{ borderRadius: 16, background: "linear-gradient(160deg,#DCE7E2,#C9D8D2)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 0, overflow: "hidden" }}>
              <div style={{ width: 110, height: 110, borderRadius: 99, background: "#9FB3AC" }} />
              <div style={{ width: 210, height: 150, borderRadius: "100px 100px 0 0", background: "#FFFFFF", marginTop: 12, borderTop: `6px solid ${MINT.green}` }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
            {[Video, MonitorPlay, CalendarCheck].map((Icon, i) => (
              <span key={i} style={{ width: 52, height: 52, borderRadius: 99, background: i === 2 ? MINT.green : "#2A3A36", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={26} color="#FFFFFF" />
              </span>
            ))}
          </div>
        </div>
      </Abs>
      {/* La croissance : une courbe qui monte, sans chiffre inventé. */}
      <Abs x={1440} y={600}>
        <div style={{ width: 460, height: 400, borderRadius: 26, background: "#FFFFFF", boxShadow: "0 30px 60px -30px rgba(15,43,38,.45)", padding: 28, opacity: prog(t, V(31.0), 0.5) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: JAKARTA, fontWeight: 800, fontSize: 26, color: MINT.ink }}>
            <TrendingUp size={32} color={MINT.green} /> Votre croissance
          </div>
          <svg width={404} height={230} viewBox="0 0 404 230" style={{ marginTop: 18 }}>
            <path d="M10 210 C 110 200, 160 160, 220 120 S 330 40, 394 18" fill="none" stroke={MINT.green} strokeWidth={10} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - grow} />
          </svg>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            {["Pharmacie", "Patientèle"].map((label, i) => (
              <span key={label} style={{ opacity: prog(t, V(33.4) + i * 0.6, 0.4), padding: "6px 14px", borderRadius: 99, background: MINT.bg, fontFamily: JAKARTA, fontWeight: 700, fontSize: 20, color: MINT.deep }}>{label}</span>
            ))}
          </div>
        </div>
      </Abs>
    </>
  );
}

// ---- 8. La carte de fin ----------------------------------------------------------------------------------------------
function EndCard({ t }: { t: number }) {
  const btn = ressort(t, 36.6, { damping: 10, stiffness: 240, mass: 0.6 });
  return (
    <>
      <Abs x={960} y={380}>
        <PBLogo t={t} at={36.2} size={110} tone="light" grad />
      </Abs>
      <Abs x={960} y={600}>
        <div style={{ transform: `scale(${btn})`, padding: "24px 46px", borderRadius: 999, background: MINT.green, color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 40, boxShadow: "0 24px 50px -20px rgba(14,138,123,.7)" }}>Réserver une visio</div>
      </Abs>
      <Abs x={960} y={740}>
        <div style={{ opacity: prog(t, 37.2, 0.5), fontFamily: JAKARTA, fontWeight: 700, fontSize: 30, color: MINT.soft }}>La présentation, juste après ▶</div>
      </Abs>
    </>
  );
}

// ---- Les mots, en bas, calés sur la voix -----------------------------------------------------------------------------
type Word = { w: string; at: number; end: number };
const WORDS = MOTS as Word[];
/** Les phrases du sous-titre : une coupure après chaque « . : » (au plus ~12 mots par ligne). */
const LINES_OF_WORDS: Word[][] = (() => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of WORDS) {
    cur.push(w);
    if (/[.:]$/.test(w.w) || (cur.length >= 6 && /,$/.test(w.w)) || cur.length >= 12) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
})();

function Captions({ t }: { t: number }) {
  const vt = t - VOICE_AT;
  const line = LINES_OF_WORDS.find((l) => vt >= l[0].at - 0.15 && vt <= l[l.length - 1].end + 0.35);
  if (!line) return null;
  return (
    <Abs x={960} y={1000}>
      <div style={{ maxWidth: 1600, padding: "12px 26px", borderRadius: 18, background: "rgba(255,255,255,.88)", boxShadow: "0 10px 30px -18px rgba(15,43,38,.4)", textAlign: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 34, lineHeight: 1.3 }}>
        {line.map((w, i) => (
          <span key={i} style={{ color: vt >= w.at ? MINT.ink : rgba(MINT.ink, 0.28), transition: "none" }}>
            {w.w}{" "}
          </span>
        ))}
      </div>
    </Abs>
  );
}

export function LettreFilm() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const musicVol = (f: number) => interpolate(f / FPS, [0, 1.2, TOTAL - 2.5, TOTAL], [0, 0.13, 0.13, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 0%, #FFFFFF 0%, ${MINT.paper} 55%, #E2EEEA 100%)` }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <AdnBackdrop t={t} tone="paper" width={1920} focus={[0.8, 0.3]} style={{ background: "transparent" }} />
      </div>
      <Scene t={t} from={0} to={V(3.05)}>
        <Door t={t} />
      </Scene>
      <Scene t={t} from={V(3.1)} to={V(7.5)}>
        <NoSalesman t={t} />
      </Scene>
      <Scene t={t} from={V(7.55)} to={V(12.45)}>
        <NextToLgo t={t} />
      </Scene>
      <Scene t={t} from={V(12.5)} to={V(18.4)}>
        <Scan t={t} />
      </Scene>
      <Scene t={t} from={V(18.45)} to={V(23.05)}>
        <Criteria t={t} />
      </Scene>
      <Scene t={t} from={V(23.1)} to={V(26.95)}>
        <OneMinute t={t} />
      </Scene>
      <Scene t={t} from={V(27.0)} to={V(35.4)}>
        <Visio t={t} />
      </Scene>
      <Scene t={t} from={36.15} to={TOTAL + 1}>
        <EndCard t={t} />
      </Scene>
      <Captions t={t} />
      <Sequence from={Math.round(VOICE_AT * FPS)}>
        <Audio src={staticFile("lettre/voix.mp3")} volume={1} />
      </Sequence>
      <Audio src={staticFile("rembobine/music/musique.wav")} startFrom={20 * FPS} volume={musicVol} />
      <Cues
        cues={[
          cue("papier", 0.6, 0.5),
          cue("tampon", V(5.6), 0.5),
          cue("whoosh-pb", V(8.4), 0.45),
          cue("ui-pop", V(10.6), 0.4),
          cue("scanner-bip", V(13.3), 0.5),
          cue("carte-ping", V(14.4), 0.35),
          cue("pop-leger", V(18.7), 0.35),
          cue("pop-leger", V(19.3), 0.35),
          cue("pop-leger", V(20.4), 0.35),
          cue("pop-leger", V(21.5), 0.35),
          cue("ui-ding", V(23.3), 0.35),
          cue("notif-douce", V(28.4), 0.4),
          cue("montee", V(32.2), 0.3),
          cue("whoosh-impact", 36.2, 0.45),
        ]}
      />
    </AbsoluteFill>
  );
}

// Pour qu'aucun import ne reste inutilisé si une scène change.
void keys;
void POP;
