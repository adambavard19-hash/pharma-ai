import { AbsoluteFill } from "remotion";
import type { PresentationTimeline } from "../../timeline";
import { F, POP, SNAP, clamp01, prog } from "./ease";
import { JAKARTA } from "./fonts";
import { PB, rgba } from "./palette";

/* ==========================================================================
 * SOUS-TITRES PREMIUM — posés PAR L'ORCHESTRATEUR (les scènes n'ont rien à faire, sauf garder libre la bande basse).
 *
 *   <Captions t tl />
 *     pilule centrée, bas à 70 px (y de 934 à 1010), hauteur 76, padding 32, encre à 72 % + flou 16 px, rayon 999 ;
 *     Jakarta 700 44 px blanc ; mot-clé (*…*) en #58F2D8, en doré #F2A516 pour « challenge(s) » et « fête » ;
 *     entrée 8 images (échelle .9 → 1 POP, y +16 → 0), mots qui montent en cascade, soulignement du mot-clé ;
 *     sortie par fondu de 5 images. Phrases `silentCaptions` (P16, P18, P19) : rien.
 *   captionAt(t, tl) → { text, start, end } | null    le segment affiché à t (pour qu'une scène l'évite)
 *   CAPTION_BAND = { top: 920, bottom: 1010 }          aucun texte important de scène là quand une phrase est dite
 * ======================================================================== */

export const CAPTION_BAND = { top: 920, bottom: 1010 };
/** Le sous-titre apparaît un peu avant le mot. */
const LEAD = 0.05;
const FADE = 5 * F;

type Shown = { text: string; start: number; end: number; key: string };

function segments(tl: PresentationTimeline): Shown[] {
  const out: Shown[] = [];
  tl.lines.forEach((line, li) => {
    if (line.silentCaptions) return;
    const nextLine = tl.lines[li + 1];
    line.chunks.forEach((c, j) => {
      const isLast = j === line.chunks.length - 1;
      const end = isLast ? Math.min(line.end + 0.45, nextLine ? nextLine.start - LEAD - 0.02 : line.end + 0.6) : line.chunks[j + 1].start - LEAD;
      out.push({ text: c.text, start: c.start - LEAD, end, key: `${line.id}-${j}` });
    });
  });
  return out;
}

export function captionAt(t: number, tl: PresentationTimeline) {
  return segments(tl).find((s) => t >= s.start && t < s.end) ?? null;
}

const GOLD_WORDS = /(challenge|challenges|fête)/i;

type Tok = { parts: { t: string; on: boolean }[]; key: boolean; plain: string };
/** « Une *boîte*. » → mots ; dans chaque mot, seuls les morceaux entre astérisques sont colorés (pas la ponctuation). */
function words(text: string): Tok[] {
  const out: Tok[] = [];
  let on = false;
  // Seules les espaces ordinaires séparent les mots : l'espace insécable lie « conseil ? ».
  for (const raw of text.split(/[ \t\n]+/).filter(Boolean)) {
    const parts: { t: string; on: boolean }[] = [];
    for (const piece of raw.split(/(\*)/)) {
      if (piece === "*") on = !on;
      else if (piece) parts.push({ t: piece, on });
    }
    if (parts.length) out.push({ parts, key: parts.some((p) => p.on), plain: parts.map((p) => p.t).join("") });
  }
  return out;
}

function Pill({ s, t }: { s: Shown; t: number }) {
  const k = prog(t, s.start, 8 * F, POP);
  const out = t > s.end ? clamp01((t - s.end) / FADE) : 0;
  if (out >= 1) return null;
  const ws = words(s.text);
  const gold = GOLD_WORDS.test(s.text.replace(/\*/g, ""));
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 70,
        height: 76,
        transform: `translateX(-50%) translateY(${(1 - Math.min(1, k)) * 16}px) scale(${0.9 + 0.1 * k})`,
        transformOrigin: "50% 100%",
        opacity: clamp01((t - s.start) / (4 * F)) * (1 - out),
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 32px",
        borderRadius: 999,
        background: "rgba(11,15,20,.72)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,.08)",
        boxShadow: "0 18px 50px rgba(0,0,0,.35)",
        whiteSpace: "nowrap",
        fontFamily: JAKARTA,
        fontWeight: 700,
        fontSize: 44,
        letterSpacing: "-0.01em",
        color: "#FFFFFF",
      }}
    >
      {ws.map((w, i) => {
        const a = s.start + 1 * F + i * 1.6 * F;
        const p = prog(t, a, 9 * F, SNAP);
        const tint = w.key ? (gold ? PB.gold : PB.mint2) : undefined;
        const line = w.key ? prog(t, a + 4 * F, 12 * F, SNAP) : 0;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              transform: `translateY(${(1 - p) * 12}px)`,
              opacity: clamp01(p * 1.5),
            }}
          >
            {w.parts.map((part, j) =>
              part.on && tint ? (
                <span key={j} style={{ position: "relative", display: "inline-block", whiteSpace: "pre", color: tint, textShadow: `0 0 18px ${rgba(tint, 0.45)}` }}>
                  {part.t}
                  <span style={{ position: "absolute", left: 0, right: 0, bottom: -4, height: 3, borderRadius: 2, background: tint, opacity: 0.45, transform: `scaleX(${line})`, transformOrigin: "0 50%" }} />
                </span>
              ) : (
                <span key={j}>{part.t}</span>
              ),
            )}
          </span>
        );
      })}
    </div>
  );
}

export function Captions({ t, tl }: { t: number; tl: PresentationTimeline }) {
  const segs = segments(tl);
  const live = segs.filter((s) => t >= s.start && t < s.end + FADE);
  if (live.length === 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {live.map((s) => (
        <Pill key={s.key} s={s} t={t} />
      ))}
    </AbsoluteFill>
  );
}
