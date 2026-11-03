import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Bell, CalendarCheck, Clock, Eye, Heart, Mail, Phone as PhoneIcon, Printer, QrCode, ShieldCheck, Sparkles, Store, TrendingUp, Wind } from "lucide-react";
import {
  AdnBackdrop,
  BannerCard,
  BannerHead,
  Bubble,
  Burst,
  Chip,
  Confetti,
  Cues,
  Douchette,
  Flash,
  JAKARTA,
  LightLeak,
  MailBilan,
  MedBox,
  Monogram,
  Notification,
  Ordonnance,
  PB,
  PBLogo,
  Phone,
  Ring,
  Sparks,
  cue,
  rgba,
  type BannerLine,
  type Cue,
} from "../rembobine/kit";
import { SCENE_COMPONENTS } from "../rembobine/scenes";
import type { SceneId } from "../rembobine/timeline";
import { FilmClock } from "../presentation/motion/kit/clock";
import { Grain, Vignette } from "../presentation/motion/kit/grain";
import { IN_OUT, SNAP, prog, ressort, wobble } from "../presentation/motion/kit/ease";
import MOTS from "./mots.json";

/**
 * « Lettre sous la porte » — la vidéo que le pharmacien voit en scannant le QR code de la lettre A5.
 * 31 oct. 2026 : la première version (excuse de 36 s, puis le film de présentation).
 * 2 nov. 2026 (fondateur : « la vidéo envoyée à tous les pharmaciens de France, envoie du lourd ») : la vidéo ENTIÈRE, sur le
 * texte complet du fondateur dit par Yann (tools/voix.mjs) — environ 2 min 10, sans le film à la suite.
 *
 * Chaque tableau suit la voix : les temps sont pris sur les MOTS (mots.json, horodatage ElevenLabs) avec `w("mot")`, jamais
 * tapés à la main. Les plus belles scènes du film « Rembobinons » sont reprises (comptoir, scan, décision, application) en
 * rejouant leur propre temps (`Reprise`), le reste est dessiné ici.
 */
export const FPS = 60;
/** La voix commence à 0,8 s. */
export const VOICE_AT = 0.8;

type Word = { w: string; at: number; end: number };
const WORDS = MOTS as Word[];
const VOICE_END = WORDS[WORDS.length - 1].end + VOICE_AT;
/** Le dernier accord de la musique tombe ici : le logo final claque dessus. */
const FINAL_HIT = 126;
export const TOTAL = 131;
export const TOTAL_FRAMES = TOTAL * FPS;

const norm = (s: string) => s.toLowerCase().replace(/[.,:;?!…«»"]/g, "").replace(/’/g, "'");
/** Le temps VIDÉO où Yann dit ce mot (le premier après `after`, en temps vidéo). */
function w(word: string, after = 0): number {
  const hit = WORDS.find((x) => x.at + VOICE_AT >= after - 0.01 && norm(x.w) === norm(word));
  if (!hit) throw new Error(`Mot introuvable dans la voix : « ${word} » après ${after}`);
  return hit.at + VOICE_AT;
}
/** La fin du mot (temps vidéo). */
function wEnd(word: string, after = 0): number {
  const hit = WORDS.find((x) => x.at + VOICE_AT >= after - 0.01 && norm(x.w) === norm(word))!;
  return hit.end + VOICE_AT;
}

const MINT = { bg: "#EAF6F0", deep: "#0E7C5A", green: "#0E8A7B", ring: "#3DBF8E", ink: "#0F2B26", soft: "#5B6B66", paper: "#F4F8F6", night: "#06231E" };

// ---- Les repères de la voix (temps vidéo) ----------------------------------------------------------------------------
const T = {
  bonjour: w("bonjour"),
  lettre: w("lettre"),
  deranger: w("déranger"),
  chargee: w("chargée"),
  creePB: w("créé"),
  lgo: w("lgo"),
  gener: w("gêner"),
  comptoir: w("comptoir"),
  patients: w("patients"),
  produits: w("produits"),
  mais: w("mais"),
  ordonnances: w("ordonnances"),
  questions: w("questions"),
  interruptions: w("interruptions…"),
  comment: w("comment"),
  avecPB: w("avec", 26),
  scan: w("scan"),
  occasion: w("occasion"),
  scannez: w("scannez"),
  banniere: w("bannière"),
  choisis: w("choisis"),
  lesQuestions: w("questions", 41),
  interet: w("l'intérêt"),
  precautions: w("précautions"),
  bonne: w("bonne"),
  decidez: w("décidez"),
  exemple: w("exemple"),
  cetirizine: w("cétirizine"),
  conseillee: w("conseillée"),
  prescrite: w("prescrite"),
  routine: w("routine"),
  nez: w("nez"),
  yeux: w("yeux"),
  gorge: w("gorge"),
  selon: w("selon"),
  utilisation: w("d'utilisation"),
  fond: w("fond"),
  logique: w("logique"),
  peau: w("peau"),
  antibio: w("antibiotiques"),
  autres: w("d'autres"),
  memePatient: w("même", 72),
  memeOrdo: w("ordonnance", 72),
  plusComplet: w("complet"),
  gammes: w("gammes", 75),
  stock: w("stock", 75),
  priorites: w("priorités"),
  dates: w("dates"),
  labos: w("laboratoires"),
  challenges: w("challenges"),
  surstock: w("surstock"),
  dort: w("dort"),
  paye: w("payé"),
  lancez: w("lancez"),
  remet: w("remet"),
  titulaire: w("titulaire"),
  exploitees: w("exploitées"),
  avance: w("avance"),
  pourPatient: w("patient", 101),
  recap: w("récapitulatif"),
  imprime: w("imprimé"),
  email: w("e-mail"),
  qr: w("qr"),
  bientot: w("bientôt"),
  application: w("l'application"),
  telephone: w("téléphone"),
  pbFinal: w("pharmaboost", 114),
  expertise: w("expertise"),
  reservez: w("réservez"),
};

// ---- Les fenêtres des tableaux (temps vidéo) -------------------------------------------------------------------------
const CUTS = {
  ouverture: [0, T.creePB - 0.3],
  lgo: [T.creePB - 0.3, T.comptoir - 0.25],
  comptoir: [T.comptoir - 0.25, T.mais - 0.2],
  rush: [T.mais - 0.2, T.avecPB - 0.35],
  occasion: [T.avecPB - 0.35, T.scannez - 0.25],
  scan: [T.scannez - 0.25, T.lesQuestions - 0.3],
  fiche: [T.lesQuestions - 0.3, w("et", T.bonne + 0.5) - 0.15],
  decide: [w("et", T.bonne + 0.5) - 0.15, T.exemple - 0.2],
  exemple: [T.exemple - 0.2, T.routine - 0.3],
  routineBanniere: [T.routine - 0.3, T.nez - 0.35],
  routine: [T.nez - 0.35, T.logique - 0.45],
  themes: [T.logique - 0.45, T.memePatient - 0.25],
  meme: [T.memePatient - 0.25, w("pharmaboost", 75) - 0.2],
  gammes: [w("pharmaboost", 75) - 0.2, w("un", T.challenges) - 0.25],
  surstock: [w("un", T.challenges) - 0.25, w("pour", T.remet) - 0.2],
  titulaire: [w("pour", T.remet) - 0.2, T.pourPatient - 0.45],
  patient: [T.pourPatient - 0.45, T.bientot - 0.4],
  appli: [T.bientot - 0.4, T.pbFinal - 0.25],
  fin: [T.pbFinal - 0.25, TOTAL + 1],
} as const;

// ---- Les briques ------------------------------------------------------------------------------------------------------
function Abs({ x, y, children, style }: { x: number; y: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", ...style }}>{children}</div>;
}

/** Un tableau : il entre en douceur à `from` et s'efface à `to` (chevauchement de 0,4 s avec le suivant). */
function Scene({ t, win, children, still = false }: { t: number; win: readonly [number, number]; children: ReactNode; still?: boolean }) {
  const [from, to] = win;
  if (t < from - 0.05 || t > to + 0.45) return null;
  const k = from <= 0.01 ? 1 : prog(t, from, 0.42, SNAP);
  const out = prog(t, to, 0.4, IN_OUT);
  const s = still ? 1 : 0.985 + 0.015 * k + 0.02 * out;
  return <AbsoluteFill style={{ opacity: k * (1 - out), transform: `scale(${s})`, filter: out > 0 ? `blur(${out * 8}px)` : undefined }}>{children}</AbsoluteFill>;
}

/**
 * Une scène du film « Rembobinons », rejouée : son temps d'histoire = s0 + (t − début) × vitesse (`rate`, ou une suite de
 * paliers [temps vidéo, temps d'histoire] interpolés). Ses bruitages suivent, quand ils tombent dans la fenêtre.
 */
type Remap = { id: SceneId; win: readonly [number, number]; keys: [number, number][] };
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
function videoAt(keys: [number, number][], s: number) {
  for (let i = 1; i < keys.length; i++) {
    const [a, sa] = keys[i - 1];
    const [b, sb] = keys[i];
    if (s >= sa && s <= sb && sb > sa) return a + ((s - sa) / (sb - sa)) * (b - a);
  }
  return null;
}
function Reprise({ t, r }: { t: number; r: Remap }) {
  const Comp = SCENE_COMPONENTS[r.id].Scene;
  const st = storyAt(r.keys, t);
  return (
    <FilmClock offset={Math.round((st - t) * FPS)}>
      <Comp t={st} />
    </FilmClock>
  );
}
function repriseCues(r: Remap): Cue[] {
  const out: Cue[] = [];
  for (const c of SCENE_COMPONENTS[r.id].cues) {
    const at = videoAt(r.keys, c.at);
    if (at !== null && at >= r.win[0] && at <= r.win[1]) out.push({ ...c, at });
  }
  return out;
}

const Accent = ({ children, color = MINT.green }: { children: ReactNode; color?: string }) => <span style={{ color }}>{children}</span>;

/** Un titre dont les mots montent de leur ligne, un à un ; *entre étoiles* = couleur d'accent. */
function Rise({ t, at, text, size = 70, color = MINT.ink, accent = MINT.green, stagger = 0.07, align = "center", style }: { t: number; at: number; text: string; size?: number; color?: string; accent?: string; stagger?: number; align?: "center" | "left"; style?: CSSProperties }) {
  let on = false;
  const words = text.split(/\s+/).map((raw) => {
    const startOn = on;
    const starts = raw.startsWith("*");
    const ends = raw.endsWith("*") && raw.length > 1;
    if (starts) on = true;
    const isAccent = on || startOn;
    if (ends) on = false;
    return { w: raw.replace(/\*/g, ""), accent: isAccent };
  });
  return (
    <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1.08, color, textAlign: align, ...style }}>
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

/** La petite étiquette au-dessus d'un titre (« EXEMPLE », « POUR LE TITULAIRE »). */
function Tag({ t, at, children, dark = false }: { t: number; at: number; children: ReactNode; dark?: boolean }) {
  const k = ressort(t, at, { damping: 12, stiffness: 240, mass: 0.6 });
  if (t < at) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: dark ? PB.citron : MINT.green, color: dark ? MINT.ink : "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", transform: `scale(${k})`, transformOrigin: "0 50%" }}>
      {children}
    </span>
  );
}

/** Une carte blanche douce. */
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ borderRadius: 28, background: "#FFFFFF", boxShadow: "0 40px 80px -40px rgba(15,43,38,.45), 0 0 0 1px rgba(15,43,38,.05)", ...style }}>{children}</div>;
}

const pop = (t: number, at: number) => (t < at ? 0 : ressort(t, at, { damping: 12, stiffness: 230, mass: 0.6 }));
const Cross = ({ size = 40, color = MINT.green }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 40 40" width={size} height={size}>
    <path d="M14 2h12v12h12v12H26v12H14V26H2V14h12z" fill={color} />
  </svg>
);

/** Un faux QR code (motif fixe, il n'est là que pour l'image). */
function QrArt({ size = 120, color = MINT.ink }: { size?: number; color?: string }) {
  const n = 21;
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (finder) continue;
      if ((x * 7 + y * 13 + x * y) % 3 === 0) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />);
    }
  const finderAt = (fx: number, fy: number) => (
    <g key={`${fx}${fy}`}>
      <rect x={fx} y={fy} width={7} height={7} fill={color} />
      <rect x={fx + 1} y={fy + 1} width={5} height={5} fill="#FFFFFF" />
      <rect x={fx + 2} y={fy + 2} width={3} height={3} fill={color} />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges">
      {cells}
      {finderAt(0, 0)}
      {finderAt(14, 0)}
      {finderAt(0, 14)}
    </svg>
  );
}

// =====================================================================================================================
// 1. Bonjour, Docteur — la lettre sort de l'enveloppe ; la journée chargée tourne autour
// =====================================================================================================================
function Ouverture({ t }: { t: number }) {
  const env = prog(t, 0.15, 0.9, SNAP);
  const flap = prog(t, T.lettre - 0.25, 0.5, IN_OUT);
  const out = prog(t, T.lettre + 0.15, 0.95, SNAP);
  const busy = prog(t, T.deranger - 0.2, 0.6, SNAP);
  const shake = t > T.chargee - 0.1 && t < T.chargee + 0.7 ? Math.sin((t - T.chargee) * 70) * 6 * (1 - (t - T.chargee) / 0.8) : 0;
  const lift = -230 * out;
  return (
    <>
      <Abs x={960} y={150}>
        {t < T.lettre - 0.1 ? (
          <Rise t={t} at={T.bonjour} text="Bonjour, *Docteur.*" size={92} />
        ) : t < T.deranger + 0.4 ? (
          <Rise t={t} at={T.lettre - 0.1} text="Une *lettre*, plutôt qu'une visite." size={72} />
        ) : (
          <Rise t={t} at={T.deranger + 0.4} text="Votre journée est *déjà bien remplie.*" size={72} />
        )}
      </Abs>
      {/* L'enveloppe C5, et la lettre A5 qui en sort. */}
      <Abs x={960} y={700 + (1 - env) * 300} style={{ opacity: env, transform: `translate(-50%, -50%) rotate(${-2 + 2 * env}deg)` }}>
        <div style={{ position: "relative", width: 640, height: 430 }}>
          {/* La lettre */}
          <div style={{ position: "absolute", left: 90, top: 20 + lift, width: 460, height: 560, borderRadius: 12, background: "#FFFFFF", boxShadow: "0 30px 60px -30px rgba(15,43,38,.45)", padding: "26px 30px", overflow: "hidden", zIndex: out > 0.35 ? 3 : 1, backgroundImage: "radial-gradient(120% 60% at 100% 0%, #E4F6EE 0%, #FFFFFF 55%)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: JAKARTA, fontWeight: 800, fontSize: 20, color: MINT.ink }}>
              <Cross size={18} /> Pharma<span style={{ color: MINT.green, marginLeft: -8 }}>Boost</span>
            </div>
            <div style={{ marginTop: 22, fontFamily: JAKARTA, fontWeight: 800, fontSize: 34, lineHeight: 1.05, letterSpacing: "-0.03em", color: MINT.ink }}>
              Bonjour !<br />
              <span style={{ color: MINT.green }}>Un petit mot pour votre pharmacie.</span>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ marginTop: i === 0 ? 18 : 9, height: 9, width: `${[96, 88, 70][i]}%`, borderRadius: 5, background: "#DCE7E2" }} />
            ))}
            <div style={{ marginTop: 22, display: "flex", gap: 16, alignItems: "center", padding: 16, borderRadius: 18, background: "linear-gradient(135deg,#0F2B26,#0E5C48 55%,#0E8A6B)" }}>
              <div style={{ padding: 8, borderRadius: 12, background: "#FFFFFF" }}>
                <QrArt size={92} />
              </div>
              <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 21, lineHeight: 1.12, color: "#FFFFFF" }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", color: "#8FDDBE", marginBottom: 6 }}>▶ VIDÉO · 2 MIN</div>
                Scannez avec <span style={{ color: "#8FDDBE" }}>votre téléphone.</span>
              </div>
            </div>
          </div>
          {/* Le dos de l'enveloppe et son rabat */}
          <div style={{ position: "absolute", left: 0, top: 150, width: 640, height: 280, zIndex: 2, borderRadius: "0 0 18px 18px", background: "linear-gradient(180deg,#F7F2E8,#EFE7D7)", boxShadow: "0 40px 70px -35px rgba(15,43,38,.55)" }}>
            <svg width={640} height={280} style={{ position: "absolute", inset: 0 }}>
              <path d="M0 0 L320 170 L640 0 L640 280 L0 280 Z" fill="#F3ECDF" />
              <path d="M0 280 L280 140 M640 280 L360 140" stroke="#E2D6C0" strokeWidth={2} />
            </svg>
            <div style={{ position: "absolute", left: 40, bottom: 30, fontFamily: JAKARTA, fontWeight: 700, fontSize: 20, color: "#8C7F67" }}>À l&apos;attention du pharmacien titulaire</div>
          </div>
          <svg width={640} height={200} style={{ position: "absolute", left: 0, top: 150 - 200 * (1 - flap) + 0, zIndex: flap < 0.5 ? 2 : 0, transformOrigin: "50% 100%", transform: `scaleY(${1 - 2 * flap})` }}>
            <path d="M0 200 L320 30 L640 200 Z" fill="#EADFCB" />
          </svg>
        </div>
      </Abs>
      {/* La journée : ordonnances, téléphone, file d'attente, horloge */}
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${shake}px)` }}>
        <Abs x={330} y={560} style={{ opacity: busy, transform: `translate(-50%, -50%) rotate(${-8 + wobble(t, 3, 2, 0.6)}deg) scale(${0.6 + 0.4 * busy})` }}>
          <Ordonnance w={230} />
        </Abs>
        <Abs x={1600} y={470} style={{ opacity: pop(t, T.deranger + 0.25) > 0 ? 1 : 0, transform: `translate(-50%, -50%) scale(${pop(t, T.deranger + 0.25)})` }}>
          <Card style={{ padding: "22px 28px", display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ width: 58, height: 58, borderRadius: 18, background: "#E3F6EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PhoneIcon size={30} color={MINT.green} style={{ transform: `rotate(${t > T.chargee - 0.3 ? Math.sin(t * 60) * 12 : 0}deg)` }} />
            </span>
            <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 26, color: MINT.ink }}>
              Appel entrant
              <div style={{ fontWeight: 600, fontSize: 20, color: MINT.soft }}>Grossiste · livraison</div>
            </div>
          </Card>
        </Abs>
        <Abs x={1560} y={760} style={{ transform: `translate(-50%, -50%) scale(${pop(t, T.deranger + 0.7)})` }}>
          <Card style={{ padding: "20px 30px", fontFamily: JAKARTA, fontWeight: 800, fontSize: 24, color: MINT.soft, textAlign: "center" }}>
            Patient suivant
            <div style={{ fontSize: 64, color: MINT.ink, letterSpacing: "-0.04em", lineHeight: 1 }}>N° {t < T.chargee ? 46 : 47}</div>
          </Card>
        </Abs>
        <Abs x={360} y={850} style={{ transform: `translate(-50%, -50%) scale(${pop(t, T.deranger + 1.1)})` }}>
          <Card style={{ padding: 22, borderRadius: 999, display: "flex" }}>
            <Clock size={64} color={MINT.green} style={{ transform: `rotate(${(t - T.deranger) * 220}deg)` }} />
          </Card>
        </Abs>
      </div>
    </>
  );
}

// =====================================================================================================================
// 2. PharmaBoost, à côté de votre LGO, sans jamais le gêner
// =====================================================================================================================
function ACoteDuLgo({ t }: { t: number }) {
  const a = CUTS.lgo[0];
  const screen = prog(t, a + 0.5, 0.6, SNAP);
  const pill = pop(t, T.lgo - 0.3);
  const check = pop(t, T.gener - 0.1);
  return (
    <>
      <Abs x={960} y={150}>
        <PBLogo t={t} at={a + 0.35} size={86} tone="light" grad />
      </Abs>
      <Abs x={960} y={600} style={{ opacity: screen, transform: `translate(-50%, -50%) translateY(${(1 - screen) * 60}px)` }}>
        <div style={{ position: "relative", width: 1180, height: 560 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: "#E7ECF1", border: "12px solid #1E2A33", boxShadow: "0 40px 80px -40px rgba(15,43,38,.6)", overflow: "hidden" }}>
            <div style={{ height: 46, background: "#FFFFFF", borderBottom: "1px solid #D4DCE4", display: "flex", alignItems: "center", gap: 18, padding: "0 22px", fontFamily: JAKARTA, fontWeight: 800, fontSize: 19, color: "#2E6DA4" }}>
              Votre LGO <span style={{ fontWeight: 600, color: "#7A8A99" }}>Facturation</span>
              <span style={{ fontWeight: 600, color: "#7A8A99" }}>Stock</span>
              <span style={{ fontWeight: 600, color: "#7A8A99" }}>Patients</span>
            </div>
            <div style={{ margin: 22, height: 110, borderRadius: 10, background: "#C3CFDC" }} />
            <div style={{ margin: "0 22px", borderRadius: 10, background: "#FFFFFF", overflow: "hidden" }}>
              <div style={{ height: 38, background: "#3B5B7E" }} />
              {["CÉTIRIZINE 10 mg", "PARACÉTAMOL 1 g", "AMOXICILLINE 1 g", ""].map((row, i) => (
                <div key={i} style={{ height: 46, borderTop: "1px solid #E3E8EE", display: "flex", alignItems: "center", padding: "0 18px", fontFamily: JAKARTA, fontWeight: 600, fontSize: 19, color: "#3F4E5C", background: i === 0 ? "#F6E6A6" : undefined }}>
                  {row}
                </div>
              ))}
            </div>
          </div>
          {/* La petite bannière PharmaBoost, posée par-dessus, dans le coin */}
          <div style={{ position: "absolute", right: 60, top: 70, transform: `scale(${pill})`, transformOrigin: "100% 0", height: 74, padding: "0 30px", borderRadius: 999, background: "#FFFFFF", boxShadow: `0 20px 40px -18px rgba(15,43,38,.55), 0 0 0 2px ${rgba(MINT.green, 0.3)}`, display: "flex", alignItems: "center", gap: 14 }}>
            <Cross size={34} />
            <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 21, letterSpacing: "0.22em", color: MINT.ink }}>
              PHARMA<span style={{ color: MINT.green }}>BOOST</span>
            </span>
          </div>
          <div style={{ position: "absolute", right: 60, top: 170, display: "flex", alignItems: "center", gap: 12, transform: `scale(${check})`, transformOrigin: "100% 0", padding: "12px 22px", borderRadius: 999, background: MINT.ink, color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 24 }}>
            <ShieldCheck size={28} color={PB.citron} /> Votre LGO reste intact
          </div>
        </div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 3. Au comptoir : vos patients, vos produits (scène « je veux bien » de Rembobinons, au ralenti) — titres par-dessus
// =====================================================================================================================
const R_COMPTOIR: Remap = { id: "S8", win: CUTS.comptoir, keys: [[CUTS.comptoir[0], 35.6], [CUTS.comptoir[1] + 0.5, 35.98]] };
function Comptoir({ t }: { t: number }) {
  return (
    <>
      <Reprise t={t} r={R_COMPTOIR} />
      <Abs x={520} y={150}>
        <Card style={{ padding: "22px 34px", background: "rgba(255,255,255,.92)" }}>
          <Rise t={t} at={T.patients - 0.15} text="Vos *patients.*" size={62} align="left" />
          <Rise t={t} at={T.produits - 0.15} text="Vos *produits.*" size={62} align="left" />
        </Card>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 4. Les ordonnances, les questions, les interruptions… comment penser à chaque conseil ?
// =====================================================================================================================
function Rush({ t }: { t: number }) {
  const dim = prog(t, T.comment - 0.1, 0.5, IN_OUT);
  const shake = t > T.interruptions && t < T.interruptions + 0.6 ? Math.sin((t - T.interruptions) * 80) * 7 * (1 - (t - T.interruptions) / 0.6) : 0;
  const ord = (i: number) => pop(t, T.ordonnances - 0.15 + i * 0.12);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${shake}px) scale(${1 - 0.06 * dim})`, filter: `blur(${dim * 7}px)`, opacity: 1 - 0.65 * dim }}>
        {[0, 1, 2].map((i) => (
          <Abs key={i} x={360 + i * 70} y={560 + i * 30} style={{ transform: `translate(-50%, -50%) rotate(${-14 + i * 9}deg) scale(${ord(i)})` }}>
            <Ordonnance w={250} />
          </Abs>
        ))}
        <Bubble t={t} at={T.questions - 0.1} text="Et pour ma toux ?" mood="pb" x={1000} y={330} size={46} side="left" />
        <Bubble t={t} at={T.questions + 0.35} text="C'est remboursé ?" mood="pb" x={1130} y={520} size={40} side="right" />
        <Notification t={t} at={T.interruptions - 0.25} icon="bell" app="Téléphone" title="Appel entrant" body="Le laboratoire, ligne 2" x={1560} y={300} scale={1.25} />
        <Notification t={t} at={T.interruptions + 0.15} icon="calendar" app="Livraison" title="Le grossiste est arrivé" body="12 caisses à ranger" x={1560} y={470} scale={1.25} />
        <Notification t={t} at={T.interruptions + 0.5} icon="mail" app="Mail" title="Rupture de stock" body="3 références indisponibles" x={1560} y={640} scale={1.25} />
        <Abs x={960} y={150}>
          <Rise t={t} at={T.mais} text="Mais entre tout *ça…*" size={68} />
        </Abs>
      </div>
      {t > T.comment - 0.2 && (
        <Abs x={960} y={500}>
          <Rise t={t} at={T.comment - 0.05} text="Comment penser à *chaque conseil,* à chaque délivrance ?" size={92} stagger={0.09} style={{ width: 1500 }} />
        </Abs>
      )}
    </>
  );
}

// =====================================================================================================================
// 5. Avec PharmaBoost, chaque scan devient une occasion — sur fond nuit
// =====================================================================================================================
function Occasion({ t }: { t: number }) {
  const a = CUTS.occasion[0];
  const sweep = prog(t, T.scan - 0.1, 0.7, IN_OUT);
  return (
    <AbsoluteFill style={{ background: MINT.night }}>
      <AdnBackdrop t={t} tone="night" width={1920} focus={[0.5, 0.5]} />
      <LightLeak t={t} at={a + 0.1} dur={1.6} color={PB.citron} x={0.8} y={0.2} />
      <Flash t={t} at={a + 0.05} dur={0.3} max={0.5} />
      <Abs x={960} y={330}>
        <PBLogo t={t} at={T.avecPB + 0.2} size={110} tone="dark" />
      </Abs>
      <Ring t={t} at={T.avecPB + 0.3} x={960} y={330} max={900} color={PB.citron} />
      <Burst t={t} at={T.avecPB + 0.3} x={960} y={330} radius={420} />
      <Abs x={960} y={640}>
        <Rise t={t} at={w("chaque", a)} text="Chaque scan devient une *occasion.*" size={96} color="#FFFFFF" accent={PB.citron} />
      </Abs>
      {/* Le faisceau du scanner balaie l'écran */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 120 + sweep * 840, height: 4, background: `linear-gradient(90deg, transparent, ${rgba("#FF4D4D", 0.9)}, transparent)`, boxShadow: "0 0 30px rgba(255,77,77,.8)", opacity: sweep > 0 && sweep < 1 ? 1 : 0 }} />
      <Sparks t={t} at={T.occasion + 0.1} x={960} y={640} count={30} color={PB.citron} />
      <Abs x={960} y={790}>
        <div style={{ opacity: prog(t, T.occasion + 0.3, 0.5), fontFamily: JAKARTA, fontWeight: 700, fontSize: 34, color: rgba("#FFFFFF", 0.8) }}>…de mieux accompagner votre patient.</div>
      </Abs>
    </AbsoluteFill>
  );
}

// =====================================================================================================================
// 6. Vous scannez comme d'habitude, la bannière propose, pris dans votre officine (scène « le bon conseil »)
// =====================================================================================================================
const R_SCAN: Remap = { id: "S6", win: CUTS.scan, keys: [[CUTS.scan[0], 26.2], [T.choisis, 29.3], [CUTS.scan[1] + 0.5, 29.95]] };
function Scan({ t }: { t: number }) {
  return (
    <>
      <Reprise t={t} r={R_SCAN} />
      <Abs x={960} y={70}>
        <span style={{ whiteSpace: "nowrap", opacity: prog(t, T.scannez, 0.4) * (1 - prog(t, T.banniere - 0.2, 0.3)), fontFamily: JAKARTA, fontWeight: 800, fontSize: 30, padding: "10px 22px", borderRadius: 999, background: MINT.ink, color: "#FFFFFF" }}>Vous scannez, comme d&apos;habitude</span>
      </Abs>
      <Abs x={960} y={70}>
        <span style={{ whiteSpace: "nowrap", opacity: prog(t, T.choisis, 0.4), fontFamily: JAKARTA, fontWeight: 800, fontSize: 30, padding: "10px 22px", borderRadius: 999, background: MINT.green, color: "#FFFFFF" }}>Parmi les produits de votre officine</span>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 7. Les questions à poser, l'intérêt du produit, les précautions — la fiche de la bannière
// =====================================================================================================================
function Fiche({ t }: { t: number }) {
  const a = CUTS.fiche[0];
  const tab = (tt: number) => (tt < T.interet - 0.1 ? "questions" : tt < T.precautions - 0.1 ? "discours" : "fiche");
  const items = [
    { Icon: Sparkles, text: "Les questions à poser", at: T.lesQuestions },
    { Icon: Heart, text: "L'intérêt du produit", at: T.interet },
    { Icon: ShieldCheck, text: "Les précautions à vérifier", at: T.precautions },
  ];
  return (
    <>
      <BannerCard t={t} at={a + 0.1} tab={tab} product="Probiotique" for="Amoxicilline 1 g" chips={[{ kind: "stock", text: "12 en stock" }]} x={600} y={500} scale={0.86} fiche={{ reason: "Avec un antibiotique, la flore intestinale peut être perturbée.", posology: "1 gélule par jour, à distance de l'antibiotique.", tell: ["Pendant toute la durée du traitement"] }} />
      <Abs x={1440} y={150}>
        <Tag t={t} at={a + 0.2}>Des repères pour l&apos;équipe</Tag>
      </Abs>
      {items.map((it, i) => {
        const k = pop(t, it.at - 0.1);
        const active = t >= it.at - 0.1 && (i === 2 || t < items[i + 1].at - 0.1);
        return (
          <Abs key={it.text} x={1440} y={330 + i * 150}>
            <div style={{ width: 680, display: "flex", alignItems: "center", gap: 22, padding: "22px 28px", borderRadius: 24, background: active ? MINT.ink : "#FFFFFF", color: active ? "#FFFFFF" : MINT.ink, boxShadow: "0 30px 60px -36px rgba(15,43,38,.5)", transform: `scale(${k}) translateX(${active ? 0 : 0}px)`, transformOrigin: "0 50%", fontFamily: JAKARTA, fontWeight: 800, fontSize: 38, letterSpacing: "-0.02em" }}>
              <span style={{ width: 62, height: 62, borderRadius: 18, background: active ? PB.citron : MINT.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <it.Icon size={32} color={active ? MINT.ink : MINT.green} />
              </span>
              {it.text}
            </div>
          </Abs>
        );
      })}
      <Abs x={1440} y={800}>
        <Rise t={t} at={T.bonne - 0.05} text="La bonne information, *au bon moment.*" size={44} />
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 8. Et c'est toujours vous qui décidez (scène « le pharmacien décide »)
// =====================================================================================================================
const R_DECIDE: Remap = { id: "S8", win: CUTS.decide, keys: [[CUTS.decide[0], 40.55], [CUTS.decide[1] + 0.5, 42.6]] };
const Decide = ({ t }: { t: number }) => <Reprise t={t} r={R_DECIDE} />;

// =====================================================================================================================
// 9. L'exemple : la cétirizine — scan, conseillée ou prescrite
// =====================================================================================================================
function Exemple({ t }: { t: number }) {
  const a = CUTS.exemple[0];
  const boxIn = prog(t, a + 0.4, 0.5, SNAP);
  return (
    <>
      <Abs x={960} y={110}>
        <Tag t={t} at={T.exemple}>Exemple · l&apos;allergie</Tag>
      </Abs>
      <Abs x={960} y={220}>
        <Rise t={t} at={T.exemple + 0.5} text="Un patient vient chercher sa *cétirizine.*" size={74} />
      </Abs>
      <div style={{ position: "absolute", left: 560, top: 600, opacity: boxIn, transform: `translateY(${(1 - boxIn) * 50}px)` }}>
        <MedBox kind="cetirizine" w={380} t={t} />
      </div>
      <Douchette t={t} x={750} y={610} angle={14} size={1.15} beamAt={T.cetirizine} beamDur={0.6} />
      <Abs x={1370} y={560}>
        <div style={{ display: "flex", gap: 26, alignItems: "center" }}>
          <div style={{ transform: `scale(${pop(t, T.conseillee)})` }}>
            <Card style={{ padding: "26px 34px", fontFamily: JAKARTA, fontWeight: 800, fontSize: 40, color: MINT.ink, display: "flex", gap: 14, alignItems: "center" }}>
              <Store size={40} color={MINT.green} /> Conseillée
            </Card>
          </div>
          <div style={{ opacity: pop(t, T.prescrite - 0.2) > 0 ? 1 : 0, fontFamily: JAKARTA, fontWeight: 800, fontSize: 34, color: MINT.soft }}>ou</div>
          <div style={{ transform: `scale(${pop(t, T.prescrite)})` }}>
            <Card style={{ padding: "26px 34px", fontFamily: JAKARTA, fontWeight: 800, fontSize: 40, color: MINT.ink, display: "flex", gap: 14, alignItems: "center" }}>
              <Ordonnance w={44} /> Prescrite
            </Card>
          </div>
        </div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 10. La bannière propose la routine allergie
// =====================================================================================================================
function RoutineBanniere({ t }: { t: number }) {
  const a = CUTS.routineBanniere[0];
  const lines: BannerLine[] = [
    { n: 1, drug: "CÉTIRIZINE 10 mg", product: "Routine allergie · nez, yeux, gorge", at: a + 0.3, chips: [{ kind: "plain", text: "Routine · 3 étapes" }] },
    { n: 2, drug: "CÉTIRIZINE 10 mg", product: "Lavage du nez à l'eau de mer", at: a + 0.55, chips: [{ kind: "stock", text: "En stock" }] },
  ];
  return (
    <>
      <Abs x={960} y={170}>
        <Rise t={t} at={T.routine - 0.1} text="Une *routine allergie* complète." size={80} />
      </Abs>
      <BannerHead t={t} lines={lines} x={960} y={560} scale={1.05} highlight={{ n: 1, at: a + 1.4 }} />
    </>
  );
}

// =====================================================================================================================
// 11. Le nez, les yeux, la gorge, selon ses symptômes ; les conseils d'utilisation ; un traitement de fond si possible
// =====================================================================================================================
function Visage({ t, lit }: { t: number; lit: { nez: number; yeux: number; gorge: number } }) {
  const glow = (k: number) => `drop-shadow(0 0 ${18 * k}px ${rgba(PB.citron, 0.9 * k)})`;
  return (
    <svg width={520} height={640} viewBox="0 0 520 640">
      {/* La tête et les épaules, en aplat menthe */}
      <path d="M60 640 C 70 520, 150 470, 260 470 C 370 470, 450 520, 460 640 Z" fill="#1F5FA8" />
      <path d="M215 470 L260 560 L305 470 Z" fill="#F4EFE6" /><rect x={215} y={400} width={90} height={100} rx={30} fill="#E8B48E" />
      <ellipse cx={95} cy={265} rx={24} ry={38} fill="#E2A985" /><ellipse cx={425} cy={265} rx={24} ry={38} fill="#E2A985" /><ellipse cx={260} cy={250} rx={165} ry={200} fill="#F1C3A0" />
      <path d="M88 250 C 70 -30, 450 -30, 432 250 C 415 125, 105 125, 88 250 Z" fill="#3B2A20" /><path d="M150 205 C 175 190, 215 190, 235 200 M285 200 C 305 190, 345 190, 370 205" stroke="#3B2A20" strokeWidth={9} fill="none" strokeLinecap="round" />
      {/* Les yeux */}
      <g style={{ filter: glow(lit.yeux) }}>
        <ellipse cx={195} cy={250} rx={30} ry={18} fill="#FFFFFF" stroke={lit.yeux > 0.05 ? PB.citron : "#9FB3AC"} strokeWidth={4} />
        <ellipse cx={325} cy={250} rx={30} ry={18} fill="#FFFFFF" stroke={lit.yeux > 0.05 ? PB.citron : "#9FB3AC"} strokeWidth={4} />
        <circle cx={195} cy={250} r={10} fill={MINT.ink} />
        <circle cx={325} cy={250} r={10} fill={MINT.ink} />
      </g>
      {/* Le nez */}
      <path d="M260 270 C 250 320, 240 335, 262 342 C 280 345, 285 335, 278 330" fill="none" stroke={lit.nez > 0.05 ? "#E0572E" : "#C98B66"} strokeWidth={6} strokeLinecap="round" style={{ filter: glow(lit.nez) }} />
      <path d="M215 380 C 240 398, 280 398, 305 380" fill="none" stroke="#B5654A" strokeWidth={6} strokeLinecap="round" />
      {/* La gorge */}
      <ellipse cx={260} cy={455} rx={34} ry={22} fill={lit.gorge > 0.05 ? rgba(PB.citron, 0.7) : "rgba(159,179,172,.35)"} style={{ filter: glow(lit.gorge) }} />
      {/* Les narines qui piquent : quelques pollens qui flottent */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx={80 + i * 75 + wobble(t, 3 + i, 14, 0.4)} cy={60 + (i % 3) * 40 + wobble(t, 9 + i, 10, 0.5)} r={5 + (i % 2) * 3} fill="#F2C94C" opacity={0.7} />
      ))}
    </svg>
  );
}

function Routine({ t }: { t: number }) {
  const lit = { nez: prog(t, T.nez - 0.1, 0.3), yeux: prog(t, T.yeux - 0.1, 0.3), gorge: prog(t, T.gorge - 0.1, 0.3) };
  const steps = [
    { at: T.nez, Icon: Wind, zone: "Nez", product: "Lavage du nez à l'eau de mer", y: 250, from: [600, 455] as const },
    { at: T.yeux, Icon: Eye, zone: "Yeux", product: "Collyre anti-allergique", y: 430, from: [640, 400] as const },
    { at: T.gorge, Icon: Sparkles, zone: "Gorge", product: "Pastilles adoucissantes", y: 610, from: [600, 600] as const },
  ];
  return (
    <>
      <Abs x={470} y={560} style={{ transform: `translate(-50%, -50%) scale(${0.92 + 0.08 * prog(t, CUTS.routine[0], 0.6, SNAP)})` }}>
        <Visage t={t} lit={lit} />
      </Abs>
      <Abs x={470} y={150}>
        <span style={{ opacity: prog(t, T.selon - 0.1, 0.4) }}>
          <Chip t={t} kind="plain" text="Selon ses symptômes" at={T.selon - 0.1} size={30} />
        </span>
      </Abs>
      {steps.map((s, i) => {
        const k = pop(t, s.at - 0.1);
        return (
          <Abs key={s.zone} x={1230} y={s.y}>
            <div style={{ transform: `scale(${k})`, transformOrigin: "0 50%", width: 720 }}>
              <Card style={{ padding: "20px 26px", display: "flex", alignItems: "center", gap: 20 }}>
                <span style={{ width: 70, height: 70, borderRadius: 20, background: MINT.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <s.Icon size={36} color={MINT.green} />
                </span>
                <Monogram name={s.product} size={70} radius={18} />
                <div style={{ fontFamily: JAKARTA }}>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "0.16em", textTransform: "uppercase", color: MINT.green }}>
                    Étape {i + 1} · {s.zone}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 32, color: MINT.ink, letterSpacing: "-0.02em" }}>{s.product}</div>
                </div>
              </Card>
            </div>
          </Abs>
        );
      })}
      <Abs x={1230} y={780}>
        <div style={{ transform: `scale(${pop(t, T.utilisation - 0.2)})`, transformOrigin: "0 50%", width: 720 }}>
          <div style={{ padding: "16px 24px", borderRadius: 20, background: MINT.ink, color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 700, fontSize: 26, display: "flex", gap: 14, alignItems: "center" }}>
            <CalendarCheck size={30} color={PB.citron} /> Les conseils d&apos;utilisation, prêts à dire
          </div>
        </div>
      </Abs>
      <Abs x={1230} y={900}>
        <div style={{ transform: `scale(${pop(t, T.fond - 0.4)})`, transformOrigin: "0 50%", width: 720 }}>
          <div style={{ padding: "14px 24px", borderRadius: 20, border: `3px dashed ${MINT.green}`, background: "rgba(255,255,255,.75)", color: MINT.deep, fontFamily: JAKARTA, fontWeight: 800, fontSize: 26 }}>+ Un traitement de fond, si la situation s&apos;y prête</div>
        </div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 12. Même logique pour la peau, les antibiotiques, et bien d'autres thèmes
// =====================================================================================================================
function Themes({ t }: { t: number }) {
  const list: { text: string; at: number; on?: boolean }[] = [
    { text: "Allergie", at: CUTS.themes[0] + 0.2, on: true },
    { text: "Peau", at: T.peau },
    { text: "Antibiotiques", at: T.antibio },
    { text: "Digestion", at: T.autres - 0.2 },
    { text: "Toux · gorge", at: T.autres - 0.05 },
    { text: "Douleur", at: T.autres + 0.1 },
    { text: "Sommeil", at: T.autres + 0.25 },
    { text: "Voyage", at: T.autres + 0.4 },
    { text: "Solaire", at: T.autres + 0.55 },
  ];
  return (
    <>
      <Abs x={960} y={200}>
        <Rise t={t} at={T.logique - 0.2} text="Même logique, *pour chaque thème.*" size={80} />
      </Abs>
      <Abs x={960} y={590}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center", width: 1500 }}>
          {list.map((it) => (
            <span key={it.text} style={{ transform: `scale(${pop(t, it.at)})`, padding: "22px 40px", borderRadius: 999, background: it.on ? MINT.green : "#FFFFFF", color: it.on ? "#FFFFFF" : MINT.ink, boxShadow: "0 24px 50px -30px rgba(15,43,38,.5)", fontFamily: JAKARTA, fontWeight: 800, fontSize: 44, letterSpacing: "-0.02em" }}>
              {it.on ? "✓ " : ""}
              {it.text}
            </span>
          ))}
        </div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 13. Même patient. Même ordonnance. Un conseil plus complet. (scène « même ordonnance »)
// =====================================================================================================================
const R_MEME: Remap = { id: "S5", win: CUTS.meme, keys: [[CUTS.meme[0], 21.45], [CUTS.meme[1] + 0.5, 23.0]] };
function Meme({ t }: { t: number }) {
  const k = pop(t, T.plusComplet - 0.5);
  return (
    <>
      <Reprise t={t} r={R_MEME} />
      <Abs x={960} y={860}>
        <div style={{ transform: `scale(${k})`, padding: "20px 40px", borderRadius: 999, background: MINT.ink, color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 52, letterSpacing: "-0.03em", boxShadow: "0 30px 60px -30px rgba(0,0,0,.6)" }}>
          Un conseil <span style={{ color: PB.citron }}>plus complet.</span>
        </div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 14. Vos gammes, votre stock — vos priorités remontent : date courte, laboratoire partenaire, challenge
// =====================================================================================================================
const GAMME_COLORS = ["#2C9AB7", "#0E8A7B", "#8448D0", "#E0884A", "#D0485F", "#3550C8"];
function Gammes({ t }: { t: number }) {
  const a = CUTS.gammes[0];
  const hl = prog(t, T.gammes - 0.1, 0.4);
  // Le classement : trois produits ; à « dates », le B passe premier ; à « laboratoires », le C gagne sa pastille ; etc.
  const rows = [
    { name: "Crème hydratante", chip: { kind: "date" as const, text: "Date courte", at: T.dates } },
    { name: "Gel lavant doux", chip: { kind: "plain" as const, text: "♥ Labo partenaire", at: T.labos } },
    { name: "Baume réparateur", chip: { kind: "challenge" as const, text: "Challenge en cours", at: T.challenges } },
  ];
  return (
    <>
      <Abs x={960} y={130}>
        <Rise t={t} at={a + 0.15} text="Vos gammes. Votre stock. *Un conseil adapté.*" size={68} />
      </Abs>
      {/* Le rayon de l'officine */}
      <Abs x={540} y={580}>
        <Card style={{ padding: 30, width: 780 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: JAKARTA, fontWeight: 800, fontSize: 24, color: MINT.ink, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            <Store size={28} color={MINT.green} /> Votre officine
          </div>
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
            {Array.from({ length: 18 }).map((_, i) => {
              const col = i % 6;
              const picked = col === 1 || col === 3;
              const k = prog(t, a + 0.3 + i * 0.025, 0.35, SNAP);
              return (
                <div key={i} style={{ height: 92, borderRadius: 12, background: GAMME_COLORS[col], opacity: (0.35 + 0.65 * k) * (picked ? 1 : 1 - 0.55 * hl), transform: `scale(${0.7 + 0.3 * k}) translateY(${picked ? -8 * hl : 0}px)`, boxShadow: picked ? `0 0 0 ${4 * hl}px ${PB.citron}` : undefined }} />
              );
            })}
          </div>
          <div style={{ marginTop: 18, opacity: hl, fontFamily: JAKARTA, fontWeight: 700, fontSize: 24, color: MINT.deep }}>✓ Vos gammes référencées, d&apos;abord</div>
        </Card>
      </Abs>
      {/* Vos priorités */}
      <Abs x={1420} y={590}>
        <div style={{ width: 640 }}>
          <div style={{ opacity: prog(t, T.priorites - 0.3, 0.4), fontFamily: JAKARTA, fontWeight: 800, fontSize: 24, letterSpacing: "0.16em", textTransform: "uppercase", color: MINT.green, marginBottom: 18 }}>Vos priorités</div>
          {rows.map((r, i) => (
            <div key={r.name} style={{ transform: `scale(${pop(t, T.priorites + i * 0.12)})`, transformOrigin: "0 50%", marginBottom: 18 }}>
              <Card style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 18 }}>
                <span style={{ width: 44, height: 44, borderRadius: 99, background: MINT.ink, color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                <Monogram name={r.name} size={62} radius={16} />
                <div>
                  <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 28, color: MINT.ink }}>{r.name}</div>
                  <div style={{ marginTop: 6, height: 38 }}>{t >= r.chip.at - 0.05 && <Chip t={t} kind={r.chip.kind} text={r.chip.text} at={r.chip.at - 0.05} size={22} />}</div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 15. Le surstock : payé, il dort en rayon ; une campagne, et PharmaBoost le remet en avant au comptoir
// =====================================================================================================================
function Surstock({ t }: { t: number }) {
  const a = CUTS.surstock[0];
  const on = prog(t, T.lancez + 0.35, 0.25, SNAP);
  const leaving = (i: number) => prog(t, T.remet + 0.1 + i * 0.12, 0.6, SNAP);
  const stamp = ressort(t, T.paye - 0.1, { damping: 9, stiffness: 260, mass: 0.6 });
  return (
    <>
      <Abs x={960} y={130}>
        <Rise t={t} at={a + 0.15} text="Valorisez votre stock grâce à un *conseil pertinent.*" size={64} />
      </Abs>
      {/* La pile qui dort */}
      <Abs x={520} y={620}>
        <div style={{ position: "relative", width: 640, height: 560 }}>
          {Array.from({ length: 15 }).map((_, i) => {
            const col = i % 5;
            const row = Math.floor(i / 5);
            const out = i >= 10 ? leaving(i - 10) : 0;
            return (
              <div key={i} style={{ position: "absolute", left: 40 + col * 116, top: 330 - row * 92 - out * 260, width: 104, height: 84, borderRadius: 10, background: "linear-gradient(160deg,#F2A65A,#E0884A)", boxShadow: "inset 0 -6px 0 rgba(0,0,0,.08)", opacity: 1 - out, transform: `rotate(${out * (col - 2) * 12}deg)` }}>
                <div style={{ margin: "14px 12px 0", height: 10, borderRadius: 4, background: "rgba(255,255,255,.75)" }} />
                <div style={{ margin: "8px 12px 0", width: 40, height: 8, borderRadius: 4, background: "rgba(255,255,255,.5)" }} />
              </div>
            );
          })}
          <div style={{ position: "absolute", left: 20, right: 20, top: 430, height: 16, borderRadius: 8, background: MINT.ink }} />
          {/* La poussière, et les « z » qui dorment */}
          {t < T.remet + 0.4 &&
            [0, 1, 2].map((i) => {
              const u = ((t - a) * 0.5 + i / 3) % 1;
              return (
                <div key={i} style={{ position: "absolute", left: 560 + i * 18, top: 120 - u * 120, opacity: Math.sin(u * Math.PI) * prog(t, T.dort - 0.1, 0.4), fontFamily: JAKARTA, fontWeight: 800, fontSize: 40 + i * 10, color: MINT.soft }}>z</div>
              );
            })}
          <div style={{ position: "absolute", left: 40, top: 480, transform: `scale(${pop(t, T.surstock - 0.1)})`, transformOrigin: "0 50%" }}>
            <Chip t={t} kind="plain" text="Surstock · 48 boîtes" size={28} />
          </div>
          <div style={{ position: "absolute", left: 300, top: 160, transform: `rotate(-10deg) scale(${stamp})`, opacity: t < T.paye - 0.1 ? 0 : Math.min(1, stamp), padding: "12px 24px", border: `5px solid #C23A2B`, borderRadius: 14, fontFamily: JAKARTA, fontWeight: 800, fontSize: 40, color: "#C23A2B", background: "rgba(255,255,255,.88)" }}>Déjà payé</div>
        </div>
      </Abs>
      {/* La campagne */}
      <Abs x={1400} y={430}>
        <div style={{ transform: `scale(${pop(t, T.lancez - 0.15)})` }}>
          <Card style={{ padding: "26px 30px", width: 640 }}>
            <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 22, letterSpacing: "0.16em", textTransform: "uppercase", color: MINT.green }}>Campagne surstock</div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 34, color: MINT.ink }}>{on > 0.5 ? "Activée" : "Désactivée"}</div>
              <div style={{ width: 110, height: 60, borderRadius: 99, background: on > 0.5 ? MINT.green : "#D5DFDB", position: "relative" }}>
                <div style={{ position: "absolute", top: 6, left: 6 + on * 50, width: 48, height: 48, borderRadius: 99, background: "#FFFFFF", boxShadow: "0 4px 10px rgba(0,0,0,.2)" }} />
              </div>
            </div>
          </Card>
        </div>
      </Abs>
      <Abs x={1400} y={680}>
        <div style={{ transform: `scale(${pop(t, T.remet - 0.2)})` }}>
          <Card style={{ padding: "18px 24px", width: 640, display: "flex", alignItems: "center", gap: 18, boxShadow: `0 0 0 3px ${PB.citron}, 0 40px 80px -40px rgba(15,43,38,.45)` }}>
            <Cross size={36} />
            <div style={{ fontFamily: JAKARTA }}>
              <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "0.16em", textTransform: "uppercase", color: MINT.green }}>Au comptoir · en premier</div>
              <div style={{ fontWeight: 800, fontSize: 32, color: MINT.ink }}>Votre produit en surstock</div>
            </div>
          </Card>
        </div>
      </Abs>
      <Sparks t={t} at={T.remet + 0.1} x={520} y={500} count={22} color={PB.citron} />
    </>
  );
}

// =====================================================================================================================
// 16. Pour le titulaire : des gammes mieux exploitées, une officine qui avance
// =====================================================================================================================
function Titulaire({ t }: { t: number }) {
  const a = CUTS.titulaire[0];
  const grow = prog(t, T.exploitees - 0.6, 1.8, SNAP);
  return (
    <>
      <Abs x={960} y={130}>
        <Tag t={t} at={a + 0.15}>Pour le titulaire</Tag>
      </Abs>
      <Abs x={960} y={240}>
        <Rise t={t} at={T.exploitees - 0.6} text="Des gammes *mieux exploitées.*" size={72} />
      </Abs>
      <Abs x={960} y={640}>
        <Card style={{ width: 1100, height: 520, padding: 40, position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: JAKARTA, fontWeight: 800, fontSize: 28, color: MINT.ink }}>
            <TrendingUp size={34} color={MINT.green} /> L&apos;activité de votre officine
          </div>
          <div style={{ position: "absolute", left: 60, right: 60, bottom: 50, height: 330, display: "flex", alignItems: "flex-end", gap: 26 }}>
            {[0.3, 0.38, 0.42, 0.5, 0.58, 0.66, 0.78, 0.92].map((h, i) => {
              const k = prog(t, a + 0.4 + i * 0.1, 0.6, SNAP) * (0.55 + 0.45 * grow);
              return <div key={i} style={{ flex: 1, height: `${h * 100 * k}%`, borderRadius: "12px 12px 4px 4px", background: i >= 6 ? `linear-gradient(180deg, ${PB.citron}, ${MINT.green})` : rgba(MINT.green, 0.25 + i * 0.06) }} />;
            })}
          </div>
          <div style={{ position: "absolute", right: 60, top: 90, transform: `scale(${pop(t, T.avance - 0.2)})`, transformOrigin: "100% 0", padding: "12px 24px", borderRadius: 999, background: MINT.ink, color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 30 }}>
            Une officine <span style={{ color: PB.citron }}>qui avance</span>
          </div>
        </Card>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 17. Pour le patient : le récapitulatif, imprimé, par e-mail ou en QR code
// =====================================================================================================================
function Patient({ t }: { t: number }) {
  const a = CUTS.patient[0];
  const ticket = prog(t, T.imprime - 0.1, 1.1, IN_OUT);
  const formats = [
    { at: T.imprime, Icon: Printer, text: "Imprimé" },
    { at: T.email, Icon: Mail, text: "Par e-mail" },
    { at: T.qr, Icon: QrCode, text: "En QR code" },
  ];
  return (
    <>
      <Abs x={1300} y={150}>
        <Rise t={t} at={a + 0.25} text="Des explications *pour le patient.*" size={66} />
      </Abs>
      <Phone t={t} x={520} y={560} scale={1.08}>
        <MailBilan t={t} at={a + 0.35} product="Routine allergie" />
      </Phone>
      <Abs x={1300} y={560}>
        <div style={{ display: "flex", gap: 30, alignItems: "flex-end" }}>
          {formats.map((f, i) => (
            <div key={f.text} style={{ transform: `scale(${pop(t, f.at - 0.1)})`, transformOrigin: "50% 100%" }}>
              <Card style={{ width: 280, height: 330, padding: 26, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 18, position: "relative", overflow: "hidden" }}>
                {i === 0 && (
                  <div style={{ position: "absolute", top: 24, width: 170, height: 200 * ticket, background: "#FBFAF6", borderRadius: 6, boxShadow: "inset 0 0 0 2px #E6E1D4", overflow: "hidden", padding: "14px 16px" }}>
                    {[80, 100, 60, 90, 70].map((wd, j) => (
                      <div key={j} style={{ height: 8, width: `${wd}%`, borderRadius: 4, background: j === 0 ? MINT.green : "#D8DED9", marginBottom: 12 }} />
                    ))}
                  </div>
                )}
                {i === 1 && <Mail size={110} color={MINT.green} strokeWidth={1.6} style={{ position: "absolute", top: 50 }} />}
                {i === 2 && (
                  <div style={{ position: "absolute", top: 40, padding: 10, borderRadius: 14, background: "#FFFFFF", boxShadow: "inset 0 0 0 3px #E3ECE8" }}>
                    <QrArt size={150} />
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: JAKARTA, fontWeight: 800, fontSize: 30, color: MINT.ink }}>
                  <f.Icon size={30} color={MINT.green} /> {f.text}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </Abs>
      <Abs x={1300} y={860}>
        <div style={{ opacity: prog(t, T.recap, 0.4), fontFamily: JAKARTA, fontWeight: 700, fontSize: 30, color: MINT.deep }}>Un récapitulatif personnalisé des conseils retenus</div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 18. Et bientôt, l'application PharmaBoost (scène « l'application »)
// =====================================================================================================================
const R_APPLI: Remap = { id: "S11", win: CUTS.appli, keys: [[CUTS.appli[0], 53.45], [CUTS.appli[1] + 0.5, 59.4]] };
const Appli = ({ t }: { t: number }) => <Reprise t={t} r={R_APPLI} />;

// =====================================================================================================================
// 19. La signature : PharmaBoost. Votre expertise, soutenue à chaque délivrance. Réservez une démonstration.
//     Puis les trois mots du fondateur, et le logo sur le dernier accord.
// =====================================================================================================================
function Fin({ t }: { t: number }) {
  const outro = VOICE_END + 0.5;
  const sloganOut = prog(t, outro - 0.2, 0.35, IN_OUT);
  const finalIn = t >= FINAL_HIT - 0.05;
  const btn = ressort(t, finalIn ? FINAL_HIT + 0.35 : T.reservez, { damping: 10, stiffness: 240, mass: 0.6 });
  const words = ["Vous scannez.", "Vous conseillez.", "Vous décidez."];
  const step = (FINAL_HIT - outro) / 3;
  return (
    <AbsoluteFill style={{ background: MINT.night }}>
      <AdnBackdrop t={t} tone="night" width={1920} focus={[0.5, 0.45]} />
      <Flash t={t} at={T.pbFinal - 0.05} dur={0.3} max={0.55} />
      <Flash t={t} at={FINAL_HIT} dur={0.35} max={0.6} />
      {!finalIn && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - sloganOut, filter: `blur(${sloganOut * 10}px)` }}>
          <Abs x={960} y={300}>
            <PBLogo t={t} at={T.pbFinal} size={120} tone="dark" />
          </Abs>
          <Ring t={t} at={T.pbFinal + 0.1} x={960} y={300} max={1000} color={PB.citron} />
          <Abs x={960} y={520}>
            <Rise t={t} at={T.expertise - 0.15} text="Votre expertise, *soutenue à chaque délivrance.*" size={76} color="#FFFFFF" accent={PB.citron} style={{ width: 1500 }} />
          </Abs>
          <Abs x={960} y={760}>
            <div style={{ transform: `scale(${t < T.reservez ? 0 : btn})`, display: "flex", alignItems: "center", gap: 16, padding: "26px 50px", borderRadius: 999, background: PB.citron, color: MINT.ink, fontFamily: JAKARTA, fontWeight: 800, fontSize: 42, boxShadow: `0 0 60px ${rgba(PB.citron, 0.45)}` }}>
              <CalendarCheck size={44} /> Réserver une démonstration
            </div>
          </Abs>
          <Abs x={960} y={880}>
            <div style={{ opacity: prog(t, T.reservez + 0.8, 0.5), fontFamily: JAKARTA, fontWeight: 700, fontSize: 32, color: rgba("#FFFFFF", 0.75) }}>pharmaboost.app/decouvrir</div>
          </Abs>
        </div>
      )}
      {/* Les trois mots, un à un */}
      {!finalIn &&
        words.map((wd, i) => {
          const at = outro + i * step;
          if (t < at - 0.02 || t > at + step) return null;
          const k = prog(t, at, 0.28, SNAP);
          const out = prog(t, at + step - 0.18, 0.18, IN_OUT);
          return (
            <Abs key={wd} x={960} y={540}>
              <div style={{ opacity: k * (1 - out), transform: `scale(${1.25 - 0.25 * k + 0.05 * (t - at)})`, filter: `blur(${(1 - k) * 12 + out * 10}px)`, fontFamily: JAKARTA, fontWeight: 800, fontSize: 170, letterSpacing: "-0.05em", color: i === 2 ? PB.citron : "#FFFFFF", whiteSpace: "nowrap" }}>{wd}</div>
            </Abs>
          );
        })}
      {finalIn && (
        <>
          <Abs x={960} y={360}>
            <PBLogo t={t} at={FINAL_HIT} size={140} tone="dark" />
          </Abs>
          <Ring t={t} at={FINAL_HIT + 0.05} x={960} y={360} max={1100} color={PB.citron} />
          <Confetti t={t} at={FINAL_HIT + 0.1} x={960} y={420} count={70} power={1500} />
          <Abs x={960} y={600}>
            <div style={{ opacity: prog(t, FINAL_HIT + 0.3, 0.5), fontFamily: JAKARTA, fontWeight: 800, fontSize: 52, letterSpacing: "-0.03em", color: "#FFFFFF" }}>
              Votre expertise, <span style={{ color: PB.citron }}>soutenue à chaque délivrance.</span>
            </div>
          </Abs>
          <Abs x={960} y={780}>
            <div style={{ transform: `scale(${btn})`, display: "flex", alignItems: "center", gap: 16, padding: "24px 46px", borderRadius: 999, background: PB.citron, color: MINT.ink, fontFamily: JAKARTA, fontWeight: 800, fontSize: 40 }}>
              <CalendarCheck size={42} /> Réserver une démonstration
            </div>
          </Abs>
          <Abs x={960} y={900}>
            <div style={{ opacity: prog(t, FINAL_HIT + 0.8, 0.5), fontFamily: JAKARTA, fontWeight: 700, fontSize: 32, color: rgba("#FFFFFF", 0.75) }}>pharmaboost.app/decouvrir</div>
          </Abs>
        </>
      )}
    </AbsoluteFill>
  );
}

// ---- Les mots, en bas, calés sur la voix -----------------------------------------------------------------------------
/** Les phrases du sous-titre : une coupure après « . : ? » (au plus ~11 mots par ligne). */
const LINES_OF_WORDS: Word[][] = (() => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const wd of WORDS) {
    cur.push(wd);
    if (/[.:?…]$/.test(wd.w) || (cur.length >= 6 && /,$/.test(wd.w)) || cur.length >= 11) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
})();

function Captions({ t }: { t: number }) {
  const vt = t - VOICE_AT;
  const line = LINES_OF_WORDS.find((l) => vt >= l[0].at - 0.15 && vt <= l[l.length - 1].end + 0.3);
  if (!line) return null;
  const dark = (t >= CUTS.occasion[0] && t < CUTS.occasion[1]) || t >= CUTS.fin[0];
  return (
    <Abs x={960} y={1010}>
      <div style={{ maxWidth: 1600, padding: "10px 24px", borderRadius: 16, background: dark ? "rgba(6,35,30,.7)" : "rgba(255,255,255,.9)", boxShadow: "0 10px 30px -18px rgba(15,43,38,.4)", textAlign: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 32, lineHeight: 1.3, whiteSpace: "nowrap" }}>
        {line.map((wd, i) => (
          <span key={i} style={{ color: vt >= wd.at ? (dark ? "#FFFFFF" : MINT.ink) : rgba(dark ? "#FFFFFF" : MINT.ink, 0.3) }}>
            {wd.w}{" "}
          </span>
        ))}
      </div>
    </Abs>
  );
}

// ---- La musique : le « groove » de Rembobinons, bouclé sur ses mesures, et sa fin sur le dernier accord -------------
// Le fichier (69 s) : le groove de 20 s à 58 s (19 mesures de 2 s), la fin de 58 s à 69 s, son dernier accord à 66 s.
const LOOP: [number, number] = [20, 58];
const TAIL_AT = FINAL_HIT - (66 - 58);
const MUSIC: { at: number; from: number; to: number }[] = (() => {
  const out: { at: number; from: number; to: number }[] = [];
  let at = 0;
  while (at < TAIL_AT - 0.01) {
    const len = Math.min(LOOP[1] - LOOP[0], TAIL_AT - at);
    out.push({ at, from: LOOP[0], to: LOOP[0] + len });
    at += len;
  }
  out.push({ at: TAIL_AT, from: 58, to: 69 });
  return out;
})();
/** Discrète sous la voix ; elle remonte pour la fin. */
function musicGain(t: number) {
  const fadeIn = Math.min(1, t / 1.5);
  const outro = prog(t, VOICE_END + 0.1, 0.6);
  const end = 1 - prog(t, TOTAL - 1.6, 1.5);
  return fadeIn * (0.12 + 0.3 * outro) * end;
}

const SFX: Cue[] = [
  cue("papier", 0.5, 0.5),
  cue("carte-depliee", T.lettre, 0.45),
  cue("telephone-vibre", T.deranger + 0.25, 0.35),
  cue("ui-pop", T.deranger + 0.7, 0.35),
  cue("tic", T.chargee - 0.2, 0.3),
  cue("whoosh-pb", CUTS.lgo[0] + 0.3, 0.45),
  cue("ui-pop", T.lgo - 0.3, 0.4),
  cue("ui-ding", T.gener - 0.1, 0.35),
  cue("pop-leger", T.patients - 0.15, 0.35),
  cue("pop-leger", T.produits - 0.15, 0.35),
  cue("papier", T.ordonnances - 0.15, 0.4),
  cue("bulle", T.questions - 0.1, 0.4),
  cue("bulle", T.questions + 0.35, 0.35),
  cue("telephone-vibre", T.interruptions - 0.25, 0.4),
  cue("notif-douce", T.interruptions + 0.15, 0.35),
  cue("notif-douce", T.interruptions + 0.5, 0.35),
  cue("whoosh-lourd", T.comment - 0.15, 0.35),
  cue("impact-revelation", CUTS.occasion[0], 0.45),
  cue("scan-laser", T.scan - 0.1, 0.4),
  cue("etincelle", T.occasion + 0.1, 0.4),
  cue("carte-depliee", CUTS.fiche[0] + 0.1, 0.4),
  cue("ui-pop", T.lesQuestions - 0.1, 0.35),
  cue("ui-pop", T.interet - 0.1, 0.35),
  cue("ui-pop", T.precautions - 0.1, 0.35),
  cue("whoosh-rapide", T.exemple - 0.2, 0.3),
  cue("scanner-bip", T.cetirizine + 0.1, 0.5),
  cue("pop-leger", T.conseillee, 0.35),
  cue("pop-leger", T.prescrite, 0.35),
  cue("carte-ping", CUTS.routineBanniere[0] + 0.3, 0.4),
  cue("ui-pop", T.nez - 0.1, 0.35),
  cue("ui-pop", T.yeux - 0.1, 0.35),
  cue("ui-pop", T.gorge - 0.1, 0.35),
  cue("ui-ding", T.utilisation - 0.2, 0.3),
  cue("pop-leger", T.fond - 0.4, 0.35),
  cue("pop-leger", T.peau, 0.35),
  cue("pop-leger", T.antibio, 0.35),
  ...[0, 1, 2, 3, 4, 5].map((i) => cue("pop-leger", T.autres - 0.2 + i * 0.15, 0.3)),
  cue("whoosh-pb", CUTS.gammes[0] + 0.1, 0.4),
  cue("pop-leger", T.dates, 0.35),
  cue("pop-leger", T.labos, 0.35),
  cue("etincelle", T.challenges, 0.35),
  cue("tampon", T.paye - 0.05, 0.5),
  cue("ui-clic", T.lancez + 0.35, 0.6),
  cue("whoosh-rapide", T.remet + 0.1, 0.35),
  cue("montee", T.exploitees - 0.6, 0.3),
  cue("ticket-imprime", T.imprime - 0.1, 0.4),
  cue("mail", T.email - 0.1, 0.45),
  cue("ui-pop", T.qr - 0.1, 0.4),
  cue("impact-net", T.pbFinal - 0.05, 0.45),
  cue("ui-ding", T.reservez, 0.35),
  cue("whoosh-rapide", VOICE_END + 0.45, 0.35),
  cue("tampon", VOICE_END + 0.5 + (FINAL_HIT - VOICE_END - 0.5) / 3, 0.35),
  cue("tampon", VOICE_END + 0.5 + (2 * (FINAL_HIT - VOICE_END - 0.5)) / 3, 0.4),
  cue("confettis", FINAL_HIT + 0.1, 0.35),
];

const REPRISES: Remap[] = [R_COMPTOIR, R_SCAN, R_DECIDE, R_MEME, R_APPLI];

export function LettreFilm() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 0%, #FFFFFF 0%, ${MINT.paper} 55%, #E2EEEA 100%)` }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <AdnBackdrop t={t} tone="paper" width={1920} focus={[0.8, 0.3]} style={{ background: "transparent" }} />
      </div>
      <Scene t={t} win={CUTS.ouverture}>
        <Ouverture t={t} />
      </Scene>
      <Scene t={t} win={CUTS.lgo}>
        <ACoteDuLgo t={t} />
      </Scene>
      <Scene t={t} win={CUTS.comptoir} still>
        <Comptoir t={t} />
      </Scene>
      <Scene t={t} win={CUTS.rush}>
        <Rush t={t} />
      </Scene>
      <Scene t={t} win={CUTS.occasion} still>
        <Occasion t={t} />
      </Scene>
      <Scene t={t} win={CUTS.scan} still>
        <Scan t={t} />
      </Scene>
      <Scene t={t} win={CUTS.fiche}>
        <Fiche t={t} />
      </Scene>
      <Scene t={t} win={CUTS.decide} still>
        <Decide t={t} />
      </Scene>
      <Scene t={t} win={CUTS.exemple}>
        <Exemple t={t} />
      </Scene>
      <Scene t={t} win={CUTS.routineBanniere}>
        <RoutineBanniere t={t} />
      </Scene>
      <Scene t={t} win={CUTS.routine}>
        <Routine t={t} />
      </Scene>
      <Scene t={t} win={CUTS.themes}>
        <Themes t={t} />
      </Scene>
      <Scene t={t} win={CUTS.meme} still>
        <Meme t={t} />
      </Scene>
      <Scene t={t} win={CUTS.gammes}>
        <Gammes t={t} />
      </Scene>
      <Scene t={t} win={CUTS.surstock}>
        <Surstock t={t} />
      </Scene>
      <Scene t={t} win={CUTS.titulaire}>
        <Titulaire t={t} />
      </Scene>
      <Scene t={t} win={CUTS.patient}>
        <Patient t={t} />
      </Scene>
      <Scene t={t} win={CUTS.appli} still>
        <Appli t={t} />
      </Scene>
      <Scene t={t} win={CUTS.fin} still>
        <Fin t={t} />
      </Scene>
      <Captions t={t} />
      <Grain t={t} opacity={0.025} />
      <Vignette strength={0.12} />
      <Sequence from={Math.round(VOICE_AT * FPS)}>
        <Audio src={staticFile("lettre/voix.mp3")} volume={1} />
      </Sequence>
      {MUSIC.map((m, i) => (
        <Sequence key={i} from={Math.round(m.at * FPS)} durationInFrames={Math.round((m.to - m.from) * FPS)}>
          <Audio src={staticFile("rembobine/music/musique.wav")} startFrom={Math.round(m.from * FPS)} endAt={Math.round(m.to * FPS)} volume={(f: number) => musicGain(m.at + f / FPS)} />
        </Sequence>
      ))}
      <Cues cues={[...SFX, ...REPRISES.flatMap(repriseCues)]} />
    </AbsoluteFill>
  );
}

void Bell;
