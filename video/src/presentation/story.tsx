import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { noise2D } from "@remotion/noise";
import { CircleUserRound, Package, Sparkles } from "lucide-react";
import { C, FONT } from "../theme";
import { Wordmark } from "../ui/product";
import { rgba } from "../ui/stage";
import { HEAVY, MINT } from "../reel/stage";
import { Mascot } from "./mascot";
import { clamp01, ramp, SITE_EASE } from "./anim";
import type { Plan, Tracks } from "./plan";

/* ==========================================================================
 * L'OUVERTURE DU FILM : LE PROBLÈME, PUIS LA RÉVÉLATION.
 *
 *  P1 « Au comptoir, tout va très vite. »        → l'horloge s'emballe, la file avance, le titre file.
 *  P2 « Un patient, une boîte, une file… »        → trois pastilles qui claquent, au mot près.
 *  P3 « Et le conseil qui aurait tout changé… »   → l'idée s'allume au-dessus du comptoir… et s'éteint : « trop tard ».
 *  P4 « Le patient repart… la pharmacie passe à côté. » → il s'en va, le produit reste en rayon, le compteur grimpe.
 *  P5 « Voici PharmaBoost… »                      → l'éclair, le robot pharmacien, le nom.
 *
 * Tout est une fonction du temps du film (en secondes) : identique à chaque rendu. Illustration, aucun chiffre réel.
 * ======================================================================== */

const W = 1920;
const H = 1080;
const WARM = "#F2A516";
const ROSE = "#FF6B7A";

const at = (P: Plan, line: number, chunk: number) => P.tl.lines[line].chunks[chunk].start;

/** Le fond du problème : une nuit chaude qui respire, légèrement granuleuse. */
function ProblemBackdrop({ t, tension }: { t: number; tension: number }) {
  const n = noise2D("fond", t * 0.15, 0) * 0.5 + 0.5;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(110% 80% at ${40 + 10 * n}% 30%, ${rgba("#3A2350", 0.9 - 0.3 * tension)} 0%, #171324 50%, #0B0A14 100%)`,
      }}
    >
      <AbsoluteFill style={{ background: `radial-gradient(60% 50% at 50% 110%, ${rgba(ROSE, 0.18 * tension)}, transparent 70%)` }} />
    </AbsoluteFill>
  );
}

/** L'horloge du comptoir : l'aiguille s'emballe pendant tout le problème. */
function Clock({ t, P, style }: { t: number; P: Plan; style?: CSSProperties }) {
  const appear = ramp(t, at(P, 0, 1) - 0.25, 0.4, SITE_EASE);
  const speed = 160 + 520 * clamp01((t - at(P, 0, 1)) / 6);
  const angle = (t * speed) % 360;
  const minute = (t * speed) / 12;
  return (
    <div style={{ position: "absolute", width: 230, height: 230, opacity: appear, transform: `scale(${0.6 + 0.4 * appear})`, ...style }}>
      <svg viewBox="0 0 100 100" width={230} height={230}>
        <circle cx={50} cy={50} r={46} fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.55)" strokeWidth={3} />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={50} y1={9} x2={50} y2={i % 3 === 0 ? 16 : 13} stroke="rgba(255,255,255,.6)" strokeWidth={i % 3 === 0 ? 3 : 1.6} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />
        ))}
        <line x1={50} y1={50} x2={50} y2={26} stroke="#fff" strokeWidth={4.5} strokeLinecap="round" transform={`rotate(${minute} 50 50)`} />
        <line x1={50} y1={56} x2={50} y2={14} stroke={ROSE} strokeWidth={2.4} strokeLinecap="round" transform={`rotate(${angle} 50 50)`} />
        <circle cx={50} cy={50} r={4} fill={ROSE} />
      </svg>
    </div>
  );
}

/** Une silhouette : tête et épaules, tout en douceur. */
function Person({ x, y, scale = 1, color = "rgba(255,255,255,.85)", opacity = 1, bob = 0 }: { x: number; y: number; scale?: number; color?: string; opacity?: number; bob?: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y + bob, width: 90 * scale, height: 150 * scale, opacity, transform: `translateX(-50%)` }}>
      <svg viewBox="0 0 90 150" width={90 * scale} height={150 * scale}>
        <circle cx={45} cy={34} r={26} fill={color} />
        <path d="M 6 150 C 6 96 24 72 45 72 C 66 72 84 96 84 150 Z" fill={color} />
      </svg>
    </div>
  );
}

/** La file qui avance vers le comptoir. */
function Queue({ t, P }: { t: number; P: Plan }) {
  const appear = ramp(t, at(P, 0, 1), 0.5, SITE_EASE);
  const advance = (t * 46) % 150;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: appear }}>
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const x = 1180 + k * 150 - advance;
        const fade = clamp01((x - 1060) / 120) * clamp01((1900 - x) / 160);
        const bob = Math.sin(t * 7 + k * 1.7) * 4;
        return <Person key={k} x={x} y={560 - k * 6} scale={1 - k * 0.06} color={`rgba(255,255,255,${0.78 - k * 0.1})`} opacity={fade} bob={bob} />;
      })}
    </div>
  );
}

/** Le comptoir, au premier plan. */
function Counter() {
  return (
    <div style={{ position: "absolute", left: 220, top: 700, width: 1480, height: 260, borderRadius: 28, background: "linear-gradient(180deg, #2B2540 0%, #1C1830 100%)", boxShadow: "0 -1px 0 rgba(255,255,255,.12) inset, 0 40px 80px -30px rgba(0,0,0,.8)" }}>
      <div style={{ position: "absolute", left: 40, top: 26, width: 1400, height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)" }} />
    </div>
  );
}

/** Le titre cinétique : chaque mot arrive en glissant, penché, puis se redresse. */
function KineticTitle({ t, words, start, step = 0.11, size = 132, top = 150, color = "#fff", accent }: { t: number; words: string[]; start: number; step?: number; size?: number; top?: number; color?: string; accent?: number }) {
  return (
    <div style={{ position: "absolute", left: 0, top, width: W, display: "flex", justifyContent: "center", gap: size * 0.28, fontFamily: HEAVY, fontWeight: 800, fontSize: size, letterSpacing: "-0.04em", lineHeight: 1 }}>
      {words.map((word, i) => {
        const p = ramp(t, start + i * step, 0.34, SITE_EASE);
        return (
          <span key={i} style={{ display: "inline-block", color: i === accent ? WARM : color, opacity: p, transform: `translateX(${(1 - p) * 120}px) skewX(${(1 - p) * -18}deg)`, filter: `blur(${(1 - p) * 8}px)`, textShadow: "0 10px 40px rgba(0,0,0,.45)" }}>
            {word}
          </span>
        );
      })}
    </div>
  );
}

/** Une pastille qui claque au mot dit : une icône, un mot. */
function Beat({ t, at: when, icon, label, x }: { t: number; at: number; icon: ReactNode; label: string; x: number }) {
  const p = ramp(t, when - 0.05, 0.28, SITE_EASE);
  if (p <= 0) return null;
  const pop = 1 + 0.18 * Math.sin(clamp01((t - when) / 0.35) * Math.PI);
  return (
    <div style={{ position: "absolute", left: x, top: 380, transform: `translateX(-50%) scale(${(0.5 + 0.5 * p) * pop})`, opacity: p, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <div style={{ width: 150, height: 150, borderRadius: 44, display: "grid", placeItems: "center", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", boxShadow: "0 30px 60px -20px rgba(0,0,0,.6)" }}>{icon}</div>
      <span style={{ fontFamily: HEAVY, fontWeight: 800, fontSize: 46, color: "#fff", letterSpacing: "-0.02em" }}>{label}</span>
    </div>
  );
}

/** L'idée du bon conseil : elle s'allume au-dessus du comptoir… puis s'éteint, faute de temps. */
function LostIdea({ t, P }: { t: number; P: Plan }) {
  const on = ramp(t, at(P, 2, 0) + 0.1, 0.45, SITE_EASE);
  const off = ramp(t, at(P, 2, 3) - 0.05, 0.5);
  if (on <= 0) return null;
  const ideas = ["Ultra-Levure ?", "Crème solaire ?", "Sérum physiologique ?"];
  const cycle = Math.floor(Math.max(0, t - at(P, 2, 0)) / 0.55) % ideas.length;
  const glow = 0.6 + 0.4 * Math.sin(t * 6);
  return (
    <div style={{ position: "absolute", left: W / 2, top: 300, transform: `translateX(-50%) scale(${(0.7 + 0.3 * on) * (1 - 0.15 * off)})`, opacity: on * (1 - 0.85 * off), filter: `grayscale(${off})` }}>
      <div style={{ position: "relative", padding: "36px 70px", borderRadius: 999, background: "#fff", boxShadow: `0 0 ${80 * glow}px ${rgba(WARM, 0.55 * (1 - off))}, 0 30px 60px -20px rgba(0,0,0,.6)`, fontFamily: HEAVY, fontWeight: 800, fontSize: 72, color: "#1B1630", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
        💡 {ideas[cycle]}
        <div style={{ position: "absolute", left: "50%", bottom: -34, width: 40, height: 40, background: "#fff", transform: "translateX(-50%) rotate(45deg)", borderRadius: 6 }} />
      </div>
      {off > 0 && (
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) rotate(-8deg) scale(${0.6 + 0.4 * off})`, opacity: off, fontFamily: HEAVY, fontWeight: 800, fontSize: 96, color: ROSE, letterSpacing: "-0.03em", textShadow: "0 8px 30px rgba(0,0,0,.6)", whiteSpace: "nowrap", border: `8px solid ${ROSE}`, borderRadius: 24, padding: "4px 36px", background: "rgba(11,10,20,.65)" }}>
          TROP TARD
        </div>
      )}
    </div>
  );
}

/** Le patient qui repart les mains vides, et le compteur de conseils oubliés qui grimpe. */
function Departure({ t, P }: { t: number; P: Plan }) {
  const go = ramp(t, at(P, 3, 0), 1.6);
  const appear = ramp(t, at(P, 3, 0) - 0.2, 0.3);
  const count = ramp(t, at(P, 3, 2) - 0.1, 1.2);
  const shown = Math.round(1 + 46 * count * count);
  const shelf = ramp(t, at(P, 3, 1), 0.5);
  return (
    <>
      <div style={{ opacity: appear * (1 - go * 0.9) }}>
        <Person x={W / 2 - go * 900} y={470} scale={1.35} color="rgba(255,255,255,.92)" bob={Math.sin(t * 9) * 6 * go} />
      </div>
      {/* Le produit qui l'aurait aidé, resté en rayon. */}
      <div style={{ position: "absolute", left: 1420, top: 420, opacity: shelf, transform: `scale(${0.8 + 0.2 * shelf})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ width: 210, height: 210, borderRadius: 34, background: "#fff", display: "grid", placeItems: "center", boxShadow: "0 30px 60px -20px rgba(0,0,0,.7)", filter: `grayscale(${count})` }}>
          <Package size={110} color="#7A4CC2" strokeWidth={1.6} />
        </div>
        <span style={{ fontFamily: FONT, fontSize: 30, fontWeight: 600, color: "rgba(255,255,255,.75)" }}>resté en rayon</span>
      </div>
      {count > 0 && (
        <div style={{ position: "absolute", left: 260, top: 380, opacity: Math.min(1, count * 3), fontFamily: HEAVY, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 200, lineHeight: 0.9, color: ROSE, letterSpacing: "-0.05em", textShadow: `0 0 60px ${rgba(ROSE, 0.4)}` }}>{shown}</span>
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 40, color: "#fff" }}>conseils oubliés aujourd&apos;hui</span>
        </div>
      )}
    </>
  );
}

export function ProblemScene({ t, P }: { t: number; P: Plan }) {
  const tension = clamp01((t - at(P, 1, 0)) / 9);
  // Le titre de P1 s'efface quand les pastilles arrivent ; les pastilles quand l'idée s'allume ; l'idée quand le patient part.
  const title = 1 - ramp(t, at(P, 1, 0) - 0.15, 0.3);
  const beats = 1 - ramp(t, at(P, 2, 0) - 0.1, 0.3);
  const shake = t > at(P, 0, 1) && t < at(P, 1, 0) ? noise2D("secousse", t * 4, 0) * 3 : 0;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <ProblemBackdrop t={t} tension={tension} />
      <div style={{ position: "absolute", inset: 0, transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
        <Queue t={t} P={P} />
        <Counter />
        <Clock t={t} P={P} style={{ left: 120, top: 90 }} />
        {title > 0 && (
          <div style={{ opacity: title }}>
            <KineticTitle t={t} words={["Au", "comptoir,"]} start={at(P, 0, 0) - 0.05} size={96} top={180} color="rgba(255,255,255,.75)" />
            <KineticTitle t={t} words={["tout", "va", "très", "vite."]} start={at(P, 0, 1) - 0.05} step={0.08} size={150} top={300} accent={2} />
          </div>
        )}
        {beats > 0 && (
          <div style={{ opacity: beats }}>
            <Beat t={t} at={at(P, 1, 0)} x={560} label="Un patient" icon={<CircleUserRound size={86} color="#fff" strokeWidth={1.6} />} />
            <Beat t={t} at={at(P, 1, 1)} x={960} label="Une boîte" icon={<Package size={86} color="#fff" strokeWidth={1.6} />} />
            <Beat t={t} at={at(P, 1, 2)} x={1360} label="Une file" icon={<span style={{ fontFamily: HEAVY, fontWeight: 800, fontSize: 70, color: WARM }}>+5</span>} />
          </div>
        )}
        <div style={{ opacity: 1 - ramp(t, at(P, 3, 0) - 0.1, 0.3) }}>
          <LostIdea t={t} P={P} />
        </div>
        <Departure t={t} P={P} />
      </div>
    </AbsoluteFill>
  );
}

/** Les éclats de la révélation : des étincelles qui partent du robot. */
function Sparks({ t, from }: { t: number; from: number }) {
  const since = t - from;
  if (since < 0 || since > 1.6) return null;
  return (
    <>
      {Array.from({ length: 18 }, (_, k) => {
        const angle = (k / 18) * Math.PI * 2 + k * 0.3;
        const dist = 120 + (k % 4) * 70;
        const p = clamp01(since / 1.2);
        const e = 1 - Math.pow(1 - p, 3);
        const x = W / 2 + Math.cos(angle) * dist * e;
        const y = 380 + Math.sin(angle) * dist * e;
        const color = [MINT, "#FFD65A", "#FF8FA3", "#fff"][k % 4];
        return <div key={k} style={{ position: "absolute", left: x, top: y, width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: k % 2 ? 7 : 3, background: color, opacity: 1 - p, transform: `rotate(${p * 200}deg) scale(${1.2 - 0.6 * p})` }} />;
      })}
    </>
  );
}

export function RevealScene({ t, P, tracks }: { t: number; P: Plan; tracks: Tracks }) {
  const enter = ramp(t, P.reveal, 0.35);
  const flash = Math.max(0, ramp(t, P.reveal, 0.08) - ramp(t, P.reveal + 0.08, 0.5));
  const robot = ramp(t, P.revealRobot - 0.25, 0.7, SITE_EASE);
  const name = ramp(t, P.revealName - 0.05, 0.5, SITE_EASE);
  const screen = ramp(t, P.revealScreen, 0.6, SITE_EASE);
  const halo = 0.5 + 0.5 * Math.sin(t * 2.4);
  return (
    <AbsoluteFill style={{ opacity: enter, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(90% 80% at 50% 40%, #0F5A52 0%, #093A36 45%, #04201E 100%)" }} />
      {/* Les rayons, qui tournent lentement derrière le robot. */}
      <div style={{ position: "absolute", left: W / 2 - 900, top: 380 - 900, width: 1800, height: 1800, opacity: 0.35 * robot, transform: `rotate(${t * 8}deg)`, background: `repeating-conic-gradient(from 0deg, ${rgba(MINT, 0.16)} 0deg 6deg, transparent 6deg 18deg)`, maskImage: "radial-gradient(circle, black 20%, transparent 62%)", WebkitMaskImage: "radial-gradient(circle, black 20%, transparent 62%)" }} />
      <div style={{ position: "absolute", left: W / 2 - 380, top: 380 - 380, width: 760, height: 760, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(MINT, 0.28 + 0.12 * halo)}, transparent 62%)` }} />
      <Sparks t={t} from={P.revealRobot} />
      {/* Le robot pharmacien : il arrive, salue ; puis il monte se poser sur l'écran du comptoir. */}
      <div style={{ position: "absolute", left: W / 2, top: 360, transform: `translate(-50%, -50%) translateY(${(1 - robot) * 200 - screen * 220}px) scale(${(0.3 + 0.7 * robot) * (1 - 0.6 * screen)}) rotate(${(1 - robot) * -14}deg)`, opacity: Math.min(1, robot * 2) }}>
        <Mascot track={tracks.pixel} t={t} size={400} floating />
      </div>
      <div style={{ position: "absolute", left: 0, top: 610, width: W, display: "flex", justifyContent: "center", opacity: name * (1 - screen), transform: `translateY(${(1 - name) * 40}px)`, clipPath: `inset(-20% ${(1 - name) * 100}% -20% 0)` }}>
        <Wordmark size={130} dark />
      </div>
      <div style={{ position: "absolute", left: 0, top: 780, width: W, textAlign: "center", fontFamily: FONT, fontSize: 40, fontWeight: 600, color: C.brand200, opacity: ramp(t, P.revealRobot + 0.2, 0.5) * (1 - screen), letterSpacing: "0.01em" }}>
        <Sparkles size={34} style={{ verticalAlign: "-4px", marginRight: 12 }} color={WARM} />
        le robot pharmacien de votre comptoir
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash * 0.9 }} />
    </AbsoluteFill>
  );
}
