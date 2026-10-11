import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, spring, useCurrentFrame } from "remotion";
import { noise2D } from "@remotion/noise";
import { loadFont } from "@remotion/google-fonts/PlusJakartaSans";
import { BANNER } from "../../../agent/src/banner-design";
import { C, EASE_IN_OUT, FPS, tw, useF } from "../theme";
import { rgba } from "../ui/stage";

/* ==========================================================================
 * LE PLATEAU VERTICAL DU REEL (1080 × 1920).
 *
 * Le fond est celui des temps sombres des films : le bleu-vert profond de la
 * bannière (cardTop → cardBottom) et sa lueur menthe — jamais un aplat de vert
 * foncé. Les zones d'Instagram restent libres de texte : en haut 220 px (nom du
 * compte), en bas 380 px (légende, musique), et la colonne des boutons à
 * droite dans la moitié basse.
 * ======================================================================== */

export const W = 1080;
export const H = 1920;
/** Les zones sûres d'Instagram : le texte reste entre SAFE.top et SAFE.bottom. */
export const SAFE = { top: 220, bottom: 1920 - 380, side: 72 };

/** Le menthe de la mascotte (yeux, lampe) : la couleur des mots clés. */
export const MINT = BANNER.colors.eye;
/** L'ambre, réservé à la valeur créée (le chiffre d'affaires). */
export const GOLD = C.accent300;

/** Les sous-titres : Plus Jakarta Sans en 800, la graisse la plus forte que la marque autorise pour un titre court. */
const heavy = loadFont("normal", { weights: ["800"], subsets: ["latin", "latin-ext"] });
export const HEAVY = heavy.fontFamily;

/** Le fond, sous toutes les scènes : dégradé de la bannière, lueur qui respire, trame de points, poussière lumineuse. */
export function ReelStage({ children }: { children?: ReactNode }) {
  const frame = useCurrentFrame();
  const t = frame / 60;
  const K = BANNER.colors;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(172deg, ${K.cardTop} 0%, ${K.cardBottom} 72%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(70% 42% at ${50 + Math.sin(t / 2.2) * 8}% ${40 + Math.cos(t / 3) * 4}%, ${rgba(K.glow, 0.16)}, transparent 72%), radial-gradient(60% 30% at 0% 0%, ${rgba(K.glow, 0.1)}, transparent 70%), radial-gradient(60% 34% at 100% 100%, rgba(7,150,180,.22), transparent 70%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1.6px, transparent 1.8px)",
          backgroundSize: "44px 44px",
          backgroundPosition: `0 ${-t * 6}px`,
          maskImage: "radial-gradient(70% 60% at 50% 45%, black, transparent 88%)",
          WebkitMaskImage: "radial-gradient(70% 60% at 50% 45%, black, transparent 88%)",
        }}
      />
      {Array.from({ length: 54 }, (_, i) => {
        const x = (noise2D("rx", i * 0.41, t * 0.06) * 0.5 + 0.5) * W;
        const y = (noise2D("ry", i * 0.67, t * 0.06) * 0.5 + 0.5) * H;
        const r = 1.6 + ((i * 7) % 5) * 0.8;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: "50%", background: K.muted, opacity: 0.08 + 0.1 * (((i * 3) % 4) / 3) }} />;
      })}
      {children}
    </AbsoluteFill>
  );
}

/** Une lueur de couleur qui monte derrière une scène (l'ambre du chiffre d'affaires). */
export function Glow({ color, x = 50, y = 50, size = 70, opacity = 1 }: { color: string; x?: number; y?: number; size?: number; opacity?: number }) {
  return <AbsoluteFill style={{ opacity, background: `radial-gradient(${size}% ${size * 0.56}% at ${x}% ${y}%, ${rgba(color, 0.26)}, transparent 70%)` }} />;
}

/** Ressort de « pop » : arrive vite, dépasse un peu, se pose. */
export function pop(frame: number, at: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  return spring({ frame: frame - at, fps: FPS, config: { damping: 11, stiffness: 210, mass: 0.7, ...config } });
}

/** Le temps d'une phrase, vu depuis sa scène : en images de scène (30/s), 0 = la voix commence. */
export type SceneLine = {
  /** La durée de la voix. */
  len: number;
  /** Les sous-titres : début et fin. */
  chunks: { text: string; at: number; end: number }[];
  /** L'image où la scène suivante commence à entrer (Infinity pour la dernière). */
  exit: number;
  /** Combien d'images la scène entre avant sa voix. */
  intro: number;
};

/** L'entrée en « coup de zoom » et la sortie en fondu de chaque scène. */
export function SceneFrame({ L, children, punch = 1, fadeIn = true }: { L: SceneLine; children: ReactNode; punch?: number; fadeIn?: boolean }) {
  const f = useF();
  // La première scène est déjà là à l'image 0 : c'est l'image que le fil d'Instagram montre avant la lecture.
  const enter = fadeIn ? tw(f, [-L.intro, -L.intro + 7], [0, 1], EASE_IN_OUT) : 1;
  const exit = Number.isFinite(L.exit) ? tw(f, [L.exit, L.exit + 6], [0, 1], EASE_IN_OUT) : 0;
  const scale = (1 + 0.1 * punch * (1 - enter)) * (1 - 0.05 * exit);
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `scale(${scale})`, filter: enter < 1 ? `blur(${(1 - enter) * 10}px)` : exit > 0 ? `blur(${exit * 8}px)` : undefined }}>
      {children}
    </AbsoluteFill>
  );
}

/** Un éclair blanc très bref sur une coupe franche. */
export function Flash({ at, strength = 0.22 }: { at: number; strength?: number }) {
  const f = useF();
  const o = Math.max(0, tw(f, [at - 2, at], [0, strength]) - tw(f, [at, at + 9], [0, strength]));
  return o > 0 ? <AbsoluteFill style={{ background: C.white, opacity: o }} /> : null;
}

/**
 * Les sous-titres incrustés : un groupe de 2 à 4 mots à la fois, chaque mot qui « saute » en place, le mot clé en
 * couleur. Centrés sur `y`, dans la largeur `width`, toujours dans les zones sûres.
 */
export function Captions({ L, y, size = 86, accent = MINT, width = 900, color = C.white, style }: { L: SceneLine; y: number; size?: number; accent?: string; width?: number; color?: string; style?: CSSProperties }) {
  const f = useF();
  let j = -1;
  L.chunks.forEach((c, k) => {
    if (f >= c.at - 1) j = k;
  });
  if (j < 0) return null;
  const leaving = j > 0 && f < L.chunks[j].at + 3 ? j - 1 : -1;
  return (
    <>
      {leaving >= 0 && <Chunk text={L.chunks[leaving].text} at={L.chunks[leaving].at} out={L.chunks[j].at - 1} y={y} size={size} accent={accent} width={width} color={color} style={style} />}
      <Chunk text={L.chunks[j].text} at={L.chunks[j].at} y={y} size={size} accent={accent} width={width} color={color} style={style} />
    </>
  );
}

/**
 * « Avec *PharmaBoost*, » → des mots, chacun en morceaux colorés ou non : la ponctuation reste collée à son mot
 * (« PharmaBoost, »), le mot clé prend la couleur d'accent.
 */
export function tokens(text: string) {
  const out: { parts: { t: string; on: boolean }[]; key: boolean }[] = [];
  let on = false;
  // Seules les espaces ordinaires séparent les mots : une espace insécable (« en plus », « 7 € ») garde ensemble.
  for (const raw of text.split(/[ \t\n]+/).filter(Boolean)) {
    const parts: { t: string; on: boolean }[] = [];
    for (const piece of raw.split(/(\*)/)) {
      if (piece === "*") on = !on;
      else if (piece) parts.push({ t: piece, on });
    }
    if (parts.length) out.push({ parts, key: parts.some((p) => p.on) });
  }
  return out;
}

export function Chunk({ text, at, out, y, size, accent, width, color, style, stagger = 1.6 }: { text: string; at: number; out?: number; y: number; size: number; accent: string; width: number; color: string; style?: CSSProperties; stagger?: number }) {
  const f = useF();
  const ws = tokens(text);
  const gone = out === undefined ? 0 : tw(f, [out, out + 3], [0, 1], EASE_IN_OUT);
  if (gone >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: (W - width) / 2,
        width,
        top: y,
        transform: `translateY(-50%) translateY(${-gone * 70}px) scale(${1 - 0.12 * gone})`,
        opacity: 1 - gone,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "baseline",
        columnGap: size * 0.27,
        rowGap: size * 0.02,
        fontFamily: HEAVY,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.08,
        letterSpacing: "-0.03em",
        color,
        textAlign: "center",
        ...style,
      }}
    >
      {ws.map((w, i) => {
        const p = pop(f, at - 1 + i * stagger);
        // Le rebond reste dans la montée ; l'échelle dépasse à peine 1, sinon les mots se chevauchent un instant.
        const grow = Math.min(p, 1) + 0.15 * Math.max(0, p - 1);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "nowrap",
              opacity: Math.min(1, p * 2.2),
              transform: `translateY(${(1 - p) * size * 0.5}px) scale(${0.35 + 0.65 * grow}) rotate(${(1 - p) * (i % 2 ? 6 : -6)}deg)`,
              textShadow: "0 6px 22px rgba(2,18,30,.6), 0 2px 4px rgba(2,18,30,.45)",
            }}
          >
            {w.parts.map((part, k) => (
              <span key={k} style={part.on ? { color: accent, textShadow: `0 0 ${size * 0.4}px ${rgba(accent, 0.45)}, 0 6px 22px rgba(2,18,30,.55)` } : undefined}>
                {part.t}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

/** Une gerbe de particules (confettis ronds) qui part d'un point. */
export function Burst({ x, y, at, count = 14, radius = 220, colors = [MINT, C.accent300, C.white], size = 14 }: { x: number; y: number; at: number; count?: number; radius?: number; colors?: string[]; size?: number }) {
  const f = useF();
  if (f < at || f > at + 30) return null;
  const p = tw(f, [at, at + 26], [0, 1]);
  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const ang = (k / count) * Math.PI * 2 + 0.3;
        const r = radius * (0.65 + 0.35 * ((k * 7) % 3) / 2) * p;
        const s = size * (1 - 0.6 * p) * (0.7 + 0.3 * (k % 3));
        return <div key={k} style={{ position: "absolute", left: x + Math.cos(ang) * r - s / 2, top: y + Math.sin(ang) * r - s / 2 + 60 * p * p, width: s, height: s, borderRadius: k % 4 === 0 ? 3 : "50%", background: colors[k % colors.length], opacity: 1 - p }} />;
      })}
    </>
  );
}

/** Une onde qui part d'un point (scan, clic, logo). */
export function Ring({ x, y, at, max = 520, color = MINT, width = 4 }: { x: number; y: number; at: number; max?: number; color?: string; width?: number }) {
  const f = useF();
  if (f < at || f > at + 40) return null;
  return (
    <>
      {[0, 6].map((d) => {
        const p = tw(f, [at + d, at + d + 28], [0, 1]);
        return <div key={d} style={{ position: "absolute", left: x - (max * p) / 2, top: y - (max * p) / 2, width: max * p, height: max * p, borderRadius: "50%", border: `${width}px solid ${color}`, opacity: (1 - p) * 0.9 }} />;
      })}
    </>
  );
}
