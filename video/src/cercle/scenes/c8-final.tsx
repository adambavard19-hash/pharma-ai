import { AbsoluteFill } from "remotion";
import { PBLogo } from "../../rembobine/kit/screens";
import { clamp01, cue, hash, IN_OUT, JAKARTA, lerp, LINEAR, PB, prog, pulse, rgba, Ring, rnd, SNAP, Sparkle, type Cue, type P2 } from "../kit";

/* ==========================================================================
 * C8 — LE CARTON FINAL (46,8 → 52,5). V16 « Réservez votre démo sur pharmaboost.app »
 * Le carton « Commentez CARTE » de la référence, aux couleurs de PharmaBoost :
 *
 *  46,8 → 47,0   sous la plongée de C7 : la nuit noir-vert, et au point CORE (540, 1000) un cœur de lumière citron où
 *                toutes les particules sont serrées (c'est la lumière de la pharmacie).
 *  47,00         le cœur ÉCLATE : les particules citron et or filent vers tout le cadre (onde), puis tombent en pluie
 *                lente et scintillent. Le robot PharmaBoost jaillit en haut du carton.
 *  47,05 / 47,57 / 47,91   « Réservez » « votre » « démo » montent l'un après l'autre (au mot dit).
 *  47,3          « pharmaboost.app » est déjà là en très grand, mais en TUBE DE NÉON ÉTEINT (contour) ;
 *  48,58         « pharmaboost » s'ALLUME (grésillement de néon, puis lueur citron) ; 49,24 (« point ») « .app » aussi.
 *  50,0          « Le copilote IA du comptoir de votre pharmacie. » ; étincelles sur les lettres ; tout respire.
 *  52,0 → 52,5   fondu au noir.
 * ======================================================================== */

const HIT = 47.0;
const CORE: P2 = [540, 1000];
const GOLD = "#F7C65A";
/** L'or des poussières : plus clair que GOLD, pour rester doré (et non brun) à faible opacité sur la nuit. */
const DUST_GOLD = "#FFD775";
const W = 1080;
const H = 1920;

type Mote = { hx: number; hy: number; d: number; gold: boolean; f: number; ph: number; ang: number; cr: number; big: boolean; lag: number };
const MOTES: Mote[] = Array.from({ length: 380 }, (_, i) => ({
  hx: rnd("c8x", i, -20, W + 20),
  hy: rnd("c8y", i, -20, H + 20),
  d: 0.25 + 0.75 * Math.pow(hash("c8d", i), 1.5),
  gold: hash("c8c", i) < 0.34,
  f: rnd("c8f", i, 1.1, 3.4),
  ph: rnd("c8p", i, 0, Math.PI * 2),
  ang: rnd("c8a", i, 0, Math.PI * 2),
  cr: Math.sqrt(hash("c8r", i)),
  big: hash("c8b", i) < 0.08,
  lag: hash("c8l", i),
}));

/** La pluie de particules : serrées dans le cœur avant HIT, elles éclatent puis tombent lentement en scintillant. */
function Rain({ t }: { t: number }) {
  const u = t - 46.8;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
      <defs>
        <radialGradient id="c8-halo-c">
          <stop offset="0%" stopColor={PB.citron} stopOpacity={0.42} />
          <stop offset="100%" stopColor={PB.citron} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="c8-halo-g">
          <stop offset="0%" stopColor={DUST_GOLD} stopOpacity={0.42} />
          <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
        </radialGradient>
      </defs>
      {MOTES.map((m, i) => {
        const fall = 22 + 46 * m.d;
        const span = H + 60;
        const ry = ((((m.hy + fall * u) % span) + span) % span) - 30;
        const rx = m.hx + Math.sin(t * (0.5 + 0.6 * m.d) + m.ph) * 16 * m.d;
        const k = SNAP(clamp01((t - HIT - m.lag * 0.06) / (1.15 + 0.7 * m.lag)));
        const cx = CORE[0] + Math.cos(m.ang) * 70 * m.cr;
        const cy = CORE[1] + Math.sin(m.ang) * 46 * m.cr;
        const x = lerp(cx, rx, k);
        const y = lerp(cy, ry, k);
        // des points nets et francs (la référence) : peu de halos, une opacité haute, un scintillement marqué
        const tw = 0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(t * m.f + m.ph), 2);
        const a = lerp(0.9, (0.6 + 0.4 * m.d) * tw, k);
        const r = (m.big ? 2.6 + 1.8 * m.d : 1.0 + 2.0 * m.d) * lerp(1.25, 1, k);
        const c = m.gold ? DUST_GOLD : PB.citron;
        return (
          <g key={i} opacity={a}>
            {m.big && <circle cx={x} cy={y} r={r * 4.2} fill={`url(#c8-halo-${m.gold ? "g" : "c"})`} />}
            <circle cx={x} cy={y} r={r} fill={c} />
          </g>
        );
      })}
    </svg>
  );
}

/** Un néon qui s'allume : 0 éteint, 1 allumé (grésillement court, puis montée). */
function ignite(t: number, at: number) {
  if (t < at) return 0;
  const u = t - at;
  if (u < 0.05) return 0.85;
  if (u < 0.09) return 0.12;
  if (u < 0.13) return 0.7;
  if (u < 0.2) return 0.18;
  return clamp01(0.62 + ((u - 0.2) / 0.18) * 0.38);
}

function NeonPart({ t, text, lit, base }: { t: number; text: string; lit: number; base: number }) {
  const breathe = 0.93 + 0.07 * Math.sin(t * 2.3);
  const g = lit * breathe;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span style={{ color: "transparent", WebkitTextStroke: `2px ${rgba(PB.citron, 0.32)}`, opacity: base }}>{text}</span>
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          color: PB.citron,
          opacity: lit,
          textShadow: `0 0 ${10 + 8 * g}px ${rgba(PB.citron, 0.75 * g)}, 0 0 ${40 + 20 * g}px ${rgba(PB.citron, 0.45 * g)}, 0 0 110px ${rgba(GOLD, 0.25 * g)}`,
        }}
      >
        {text}
      </span>
    </span>
  );
}

const WORDS: [string, number][] = [
  ["Réservez", 47.05],
  ["votre", 47.57],
  ["démo", 47.91],
];

export function Scene({ t }: { t: number }) {
  const core = t < HIT ? 1 : Math.pow(1 - prog(t, HIT, 0.4, LINEAR), 2);
  const coreR = t < HIT ? 260 : lerp(260, 760, prog(t, HIT, 0.4, SNAP));
  const push = 1 + 0.035 * prog(t, HIT, 5.5, LINEAR);
  const tubes = prog(t, 47.28, 0.5, IN_OUT);
  const litA = ignite(t, 48.58);
  const litB = ignite(t, 49.24);
  const urlGlow = Math.max(litA, litB);
  const tag = prog(t, 50.0, 0.5);
  const black = prog(t, 52.0, 0.5, LINEAR);
  const aurora = 0.6 + 0.4 * Math.sin(t * 0.9);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 60% at 50% 52%, #0B1F19 0%, #06120E 55%, #030806 100%)", overflow: "hidden" }}>
      {/* une lueur citron très douce derrière le carton */}
      <div style={{ position: "absolute", left: CORE[0] - 620, top: CORE[1] - 420, width: 1240, height: 840, borderRadius: "50%", pointerEvents: "none", opacity: prog(t, HIT, 0.8) * (0.55 + 0.45 * urlGlow) * aurora, background: `radial-gradient(ellipse, ${rgba(PB.citron, 0.1)} 0%, ${rgba(PB.citron, 0.03)} 45%, transparent 70%)` }} />
      <Rain t={t} />
      {/* le cœur de lumière (la pharmacie) qui éclate */}
      {core > 0 && (
        <div style={{ position: "absolute", left: CORE[0] - coreR, top: CORE[1] - coreR * 0.75, width: coreR * 2, height: coreR * 1.5, borderRadius: "50%", pointerEvents: "none", mixBlendMode: "screen", opacity: core, background: `radial-gradient(ellipse, ${rgba(PB.glow, 0.9)} 0%, ${rgba(PB.citron, 0.4)} 30%, transparent 70%)` }} />
      )}
      <Ring t={t} at={HIT} x={CORE[0]} y={CORE[1]} max={1500} color={PB.citron} width={5} life={0.9} />

      <div style={{ position: "absolute", inset: 0, transform: `scale(${push})`, transformOrigin: `${CORE[0]}px ${CORE[1]}px` }}>
        {/* le robot */}
        <PBLogo t={t} at={HIT} variant="icon" size={92} x={540} y={790} />
        {/* « Réservez votre démo » */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 888, display: "flex", justifyContent: "center", gap: 14 }}>
          {WORDS.map(([w, at]) => {
            const k = prog(t, at - 0.03, 0.26);
            return (
              <span key={w} style={{ display: "inline-block", fontFamily: JAKARTA, fontWeight: 800, fontSize: 52, letterSpacing: "-0.03em", lineHeight: 1.1, color: rgba("#FFFFFF", 0.94), opacity: Math.min(1, k * 1.5), transform: `translateY(${(1 - k) * 26}px)`, textShadow: "0 6px 30px rgba(0,0,0,.6)" }}>
                {w}
              </span>
            );
          })}
        </div>
        {/* « pharmaboost.app » : le néon */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 972, display: "flex", justifyContent: "center", whiteSpace: "nowrap", fontFamily: JAKARTA, fontWeight: 800, fontSize: 104, letterSpacing: "-0.045em", lineHeight: 1.15, transform: `scale(${1 + 0.025 * pulse(t, 48.58, 0.05, 0.05, 0.35) + 0.015 * pulse(t, 49.24, 0.05, 0.05, 0.3)})` }}>
          <NeonPart t={t} text="pharmaboost" lit={litA} base={tubes} />
          <NeonPart t={t} text=".app" lit={litB} base={tubes} />
        </div>
        {/* la phrase */}
        <div style={{ position: "absolute", left: 60, right: 60, top: 1132, textAlign: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 40, letterSpacing: "-0.01em", lineHeight: 1.25, color: rgba("#FFFFFF", 0.78), opacity: tag, transform: `translateY(${(1 - tag) * 18}px)` }}>
          Le copilote IA du comptoir de votre pharmacie.
        </div>
      </div>

      {/* des étincelles sur les lettres */}
      <Sparkle t={t} at={48.64} x={198} y={1012} size={64} color="#FFF4D6" />
      <Sparkle t={t} at={49.3} x={905} y={1020} size={56} color={PB.citron} />
      <Sparkle t={t} at={50.5} x={430} y={1004} size={44} color="#FFF4D6" />
      <Sparkle t={t} at={51.15} x={742} y={1100} size={50} color={GOLD} />
      <Sparkle t={t} at={51.7} x={300} y={1098} size={38} color={PB.citron} />

      {black > 0 && <AbsoluteFill style={{ background: "#000", opacity: black }} />}
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("impact-epique", HIT, 0.5), // le carton : le cœur de lumière éclate
  cue("scintillement", HIT + 0.12, 0.3), // la pluie de particules
  cue("neon", 48.56, 0.45), // « pharmaboost » s'allume
  cue("etincelle-magique", 49.24, 0.32), // « .app »
  cue("pop-leger", 50.0, 0.18), // la phrase
];
