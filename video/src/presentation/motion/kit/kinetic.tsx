import { useId, type CSSProperties, type ReactNode } from "react";
import { EXIT, F, POP, SNAP, WHIP, clamp01, prog } from "./ease";
import { JAKARTA } from "./fonts";
import { hash } from "./random";

/* ==========================================================================
 * TYPOGRAPHIE CINÉTIQUE.
 *
 * <Word t at text x y …/>  un mot (ou une ligne ; « \n » = ligne suivante), positionné en absolu.
 *   text      « Le *bon* conseil » : les morceaux entre astérisques prennent `accent`
 *   x, y      point d'ancrage (centre du texte par défaut) ; anchor "center" | "left" | "right"
 *   size=200 weight=800 color="#fff" accent="#36E8C8" tracking="-0.045em" lineHeight=.9 font=JAKARTA
 *   outline   { width: 2, color: "rgba(54,232,200,.35)" } : lettres contour sans remplissage (mots géants de fond)
 *   enter     "rise"    masque montant depuis la ligne de base (110 % → 0, 18 images SNAP, lettres à `stagger` = 2,5 images)
 *             "letters" lettre par lettre en POP (échelle .6 → 1, 3 images d'écart)
 *             "punch"   COUP DE POING : arrive de ×2,2 avec flou, claque à ×1 en 10 images (ajouter une secousse caméra)
 *             "slide"   GLISSÉ-PENCHÉ : chaque lettre glisse de la gauche, penchée de −25° → 0, 16 images SNAP
 *             "glitch"  lettres qui grésillent (apparitions, décalages, séparation RVB) pendant 12 images
 *             "type"    machine à écrire avec curseur (`stagger` images par lettre)
 *             "none"    déjà là
 *   exit, exitAt  sortie à exitAt (s) :
 *             "slice"   3 bandes qui filent en 10, 13 et 16 images (EXIT) — `dir` 1 droite / −1 gauche
 *             "strobe"  écho stroboscopique : 5 copies (1 / .5 / .3 / .18 / .1) qui filent en retard de 2 images
 *             "blurOut" échelle 1 → .9, flou 0 → 12 px, 10 images
 *             "fall"    les lettres tombent en briques (gravité, rotation, ordre à graine)
 *             "glitch"  séparation RVB + déchirure puis disparition, 10 images
 *             "bar"     compression en barre (scaleY → .05, scaleX → .6), 10 images
 *             "fade"    fondu 8 images
 *   letterStyle(i, n, ch) → CSSProperties   effet libre par lettre (ex. CONSEIL dévoré lettre par lettre)
 *   style     sur le bloc (ex. textShadow, filter: glowMint())
 *
 *   Ex. <Word t={t} at={time.A("P1", 0)} text="COMPTOIR" x={960} y={560} size={300} enter="rise" exit="slice" exitAt={time.A("P1", 1)} />
 *
 * <Enter t at kind="punch"|"slide"|"pop"|"blurIn"|"whip"|"rise" dur? from?>…</Enter>   même entrées, sur n'importe quel bloc
 * <Exit t at kind="slice"|"strobe"|"blurOut"|"glitch"|"bar"|"fade"|"whip" dir? dist?>…</Exit>  mêmes sorties, sur n'importe quel bloc
 * <Glitch t at dur={.4} amount={1}>…</Glitch>   COUPE GLITCH (acte 1 seulement) : séparation RVB + déchirures
 * glitchAmount(t, at, dur) → 0..1                intensité d'un glitch à l'instant t
 * ======================================================================== */

export type EnterKind = "rise" | "letters" | "punch" | "slide" | "glitch" | "type" | "none";
export type ExitKind = "slice" | "strobe" | "blurOut" | "fall" | "glitch" | "bar" | "fade";

type Glyph = { ch: string; accent: boolean; line: number };

function glyphs(text: string): Glyph[][] {
  const lines: Glyph[][] = [[]];
  let on = false;
  for (const ch of Array.from(text)) {
    if (ch === "*") {
      on = !on;
      continue;
    }
    if (ch === "\n") {
      lines.push([]);
      continue;
    }
    lines[lines.length - 1].push({ ch, accent: on, line: lines.length - 1 });
  }
  return lines;
}

export function glitchAmount(t: number, at: number, dur = 0.4) {
  if (t < at || t > at + dur) return 0;
  const u = (t - at) / dur;
  // Des à-coups : l'intensité saute d'une image à l'autre, plus forte au début.
  const step = Math.floor(t * 60 / 2);
  return (1 - u * 0.7) * (0.35 + 0.65 * hash("glitch", step));
}

/** Séparation RVB + déchirures horizontales sur n'importe quel bloc. */
export function Glitch({ t, at, dur = 0.4, amount = 1, children }: { t: number; at: number; dur?: number; amount?: number; children: ReactNode }) {
  const id = `gl${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const g = glitchAmount(t, at, dur) * amount;
  if (g <= 0.001) return <>{children}</>;
  const step = Math.floor(t * 30);
  const dx = 4 + 22 * g;
  const tears = [0, 1, 2].map((k) => {
    const top = hash(`tear${k}`, step) * 90;
    const h = 2 + hash(`tearh${k}`, step) * 9;
    const off = (hash(`tearx${k}`, step) - 0.5) * 120 * g;
    return { top, h, off };
  });
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={dx} dy={0} result="ro" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
          <feOffset in="gb" dx={-dx * 0.6} dy={0} result="gbo" />
          <feBlend in="ro" in2="gbo" mode="screen" />
        </filter>
      </svg>
      <div style={{ position: "absolute", inset: 0, filter: `url(#${id})` }}>{children}</div>
      {tears.map((tr, k) => (
        <div key={k} style={{ position: "absolute", inset: 0, clipPath: `inset(${tr.top}% 0 ${Math.max(0, 100 - tr.top - tr.h)}% 0)`, transform: `translateX(${tr.off}px)` }}>
          {children}
        </div>
      ))}
    </div>
  );
}

/** Une entrée sur n'importe quel bloc. `dur` en secondes (défaut selon le type). */
export function Enter({ t, at, kind = "punch", dur, from = 1, children, style }: { t: number; at: number; kind?: "punch" | "slide" | "pop" | "blurIn" | "whip" | "rise"; dur?: number; from?: number; children: ReactNode; style?: CSSProperties }) {
  if (t < at) return null;
  let s: CSSProperties = {};
  if (kind === "punch") {
    const k = prog(t, at, dur ?? 10 * F, SNAP);
    const sc = 1 + 1.2 * (1 - k) * from;
    s = { transform: `scale(${sc})`, filter: k < 1 ? `blur(${(1 - k) * 14}px)` : undefined, opacity: clamp01((t - at) / (3 * F)) };
  } else if (kind === "slide") {
    const k = prog(t, at, dur ?? 16 * F, SNAP);
    s = { transform: `translateX(${(1 - k) * -160 * from}px) skewX(${(1 - k) * -25}deg)`, opacity: clamp01(k * 1.6) };
  } else if (kind === "pop") {
    const k = prog(t, at, dur ?? 14 * F, POP);
    s = { transform: `scale(${0.6 + 0.4 * k})`, opacity: clamp01((t - at) / (5 * F)) };
  } else if (kind === "blurIn") {
    const k = prog(t, at, dur ?? 14 * F, SNAP);
    s = { transform: `scale(${1.08 - 0.08 * k})`, filter: k < 1 ? `blur(${(1 - k) * 12}px)` : undefined, opacity: k };
  } else if (kind === "whip") {
    const k = prog(t, at, dur ?? 10 * F, WHIP);
    s = { transform: `translateX(${(1 - k) * 1920 * from}px)` };
  } else if (kind === "rise") {
    const k = prog(t, at, dur ?? 18 * F, SNAP);
    return (
      <div style={{ overflow: "hidden", ...style }}>
        <div style={{ transform: `translateY(${(1 - k) * 110}%)` }}>{children}</div>
      </div>
    );
  }
  return <div style={{ ...s, ...style }}>{children}</div>;
}

/** Une sortie sur n'importe quel bloc (le bloc doit avoir sa taille : position absolue ou flux normal). */
export function Exit({ t, at, kind = "blurOut", dir = 1, dist = 1600, children, style }: { t: number; at: number; kind?: Exclude<ExitKind, "fall"> | "whip"; dir?: number; dist?: number; children: ReactNode; style?: CSSProperties }) {
  if (t < at) return <div style={style}>{children}</div>;
  const u = t - at;
  if (kind === "slice") {
    const durs = [10, 13, 16];
    if (u > 16 * F) return null;
    return (
      <div style={{ position: "relative", ...style }}>
        <div style={{ visibility: "hidden" }}>{children}</div>
        {durs.map((d, k) => {
          const p = prog(t, at, d * F, EXIT);
          return (
            <div key={k} style={{ position: "absolute", inset: 0, clipPath: `inset(${(k * 100) / 3}% 0 ${100 - ((k + 1) * 100) / 3}% 0)`, transform: `translateX(${dir * dist * p}px)`, opacity: 1 - p * 0.3 }}>
              {children}
            </div>
          );
        })}
      </div>
    );
  }
  if (kind === "strobe") {
    const ops = [1, 0.5, 0.3, 0.18, 0.1];
    if (u > 20 * F) return null;
    return (
      <div style={{ position: "relative", ...style }}>
        <div style={{ visibility: "hidden" }}>{children}</div>
        {ops.map((o, j) => {
          const p = prog(t - j * 2 * F, at, 12 * F, EXIT);
          return (
            <div key={j} style={{ position: "absolute", inset: 0, transform: `translateX(${dir * dist * p}px)`, opacity: o * (1 - p * 0.6) }}>
              {children}
            </div>
          );
        }).reverse()}
      </div>
    );
  }
  if (kind === "glitch") {
    if (u > 10 * F) return null;
    return (
      <div style={{ position: "relative", ...style, opacity: Math.floor(t * 60) % 3 === 2 ? 0.2 : 1 }}>
        <Glitch t={t} at={at} dur={10 * F} amount={1.4}>
          {children}
        </Glitch>
        <div style={{ visibility: "hidden" }}>{children}</div>
      </div>
    );
  }
  let s: CSSProperties = {};
  if (kind === "blurOut") {
    const p = prog(t, at, 10 * F, EXIT);
    if (p >= 1) return null;
    s = { transform: `scale(${1 - 0.1 * p})`, filter: `blur(${12 * p}px)`, opacity: 1 - p };
  } else if (kind === "bar") {
    const p = prog(t, at, 10 * F, EXIT);
    s = { transform: `scale(${1 - 0.4 * p}, ${1 - 0.95 * p})`, opacity: p >= 1 ? 0 : 1 };
  } else if (kind === "fade") {
    const p = prog(t, at, 8 * F, EXIT);
    if (p >= 1) return null;
    s = { opacity: 1 - p };
  } else if (kind === "whip") {
    const p = prog(t, at, 10 * F, WHIP);
    if (p >= 1) return null;
    s = { transform: `translateX(${-dir * 1920 * p}px)` };
  }
  return <div style={{ ...style, ...s }}>{children}</div>;
}

export type WordProps = {
  t: number;
  at: number;
  text: string;
  x: number;
  y: number;
  anchor?: "center" | "left" | "right";
  size?: number;
  weight?: number;
  color?: string;
  accent?: string;
  tracking?: string;
  lineHeight?: number;
  font?: string;
  outline?: { width: number; color: string };
  enter?: EnterKind;
  /** Écart entre deux lettres, en images. */
  stagger?: number;
  exit?: ExitKind;
  exitAt?: number;
  dir?: number;
  letterStyle?: (i: number, n: number, ch: string) => CSSProperties | undefined;
  style?: CSSProperties;
};

export function Word({
  t,
  at,
  text,
  x,
  y,
  anchor = "center",
  size = 200,
  weight = 800,
  color = "#FFFFFF",
  accent = "#36E8C8",
  tracking = "-0.045em",
  lineHeight = 0.9,
  font = JAKARTA,
  outline,
  enter = "rise",
  stagger,
  exit,
  exitAt,
  dir = 1,
  letterStyle,
  style,
}: WordProps) {
  if (t < at - 1 * F && enter !== "none") return null;
  const lines = glyphs(text);
  const n = lines.reduce((s, l) => s + l.length, 0);
  const st = (stagger ?? (enter === "letters" ? 3 : enter === "type" ? 2.5 : enter === "slide" ? 1.5 : 2.5)) * F;
  const exiting = exit !== undefined && exitAt !== undefined && t >= exitAt;
  const fall = exiting && exit === "fall";
  if (fall && t > exitAt! + 1.6) return null;

  let idx = 0;
  let typedUpTo = n;
  if (enter === "type") typedUpTo = Math.floor((t - at) / st) + 1;

  const tx = anchor === "center" ? "-50%" : anchor === "right" ? "-100%" : "0";
  const block: CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    transform: `translate(${tx}, -50%)`,
    fontFamily: font,
    fontWeight: weight,
    fontSize: size,
    letterSpacing: tracking,
    lineHeight,
    color: outline ? "transparent" : color,
    WebkitTextStroke: outline ? `${outline.width}px ${outline.color}` : undefined,
    whiteSpace: "pre",
    textAlign: anchor === "center" ? "center" : anchor,
  };

  // Entrée de bloc (punch) : appliquée autour des lettres.
  let blockFx: CSSProperties = {};
  if (enter === "punch") {
    const k = prog(t, at, 10 * F, SNAP);
    blockFx = { transform: `scale(${1 + 1.2 * (1 - k)})`, filter: k < 1 ? `blur(${(1 - k) * 14}px)` : undefined, opacity: clamp01((t - at) / (3 * F)) };
  }

  const renderLetters = () =>
    lines.map((line, li) => (
      <div key={li} style={{ display: "block", overflow: enter === "rise" && !fall ? "hidden" : undefined, padding: enter === "rise" ? `${size * 0.08}px ${size * 0.06}px ${size * 0.16}px` : undefined, margin: enter === "rise" ? `${-size * 0.08}px ${-size * 0.06}px ${-size * 0.16}px` : undefined }}>
        {line.map((g) => {
          const i = idx++;
          const a = at + i * st;
          let s: CSSProperties = {};
          if (enter === "rise") {
            const k = prog(t, a, 18 * F, SNAP);
            s = { transform: `translateY(${(1 - k) * 110}%)` };
          } else if (enter === "letters") {
            const k = prog(t, a, 12 * F, POP);
            s = { transform: `scale(${0.6 + 0.4 * k})`, opacity: clamp01((t - a) / (4 * F)) };
          } else if (enter === "slide") {
            const k = prog(t, a, 16 * F, SNAP);
            s = { transform: `translateX(${(1 - k) * -0.6 * size}px) skewX(${(1 - k) * -25}deg)`, opacity: clamp01(k * 1.8) };
          } else if (enter === "glitch") {
            const u = (t - a) / (12 * F);
            if (u < 1) {
              const step = Math.floor(t * 30);
              const on = hash(`gw${i}`, step) < 0.35 + 0.65 * u;
              const dx = (hash(`gx${i}`, step) - 0.5) * 0.3 * size * (1 - u);
              s = { opacity: u < 0 ? 0 : on ? 1 : 0.15, transform: `translateX(${dx}px)`, textShadow: `${0.04 * size * (1 - u)}px 0 rgba(255,60,60,.8), ${-0.04 * size * (1 - u)}px 0 rgba(60,220,255,.8)` };
            }
          } else if (enter === "type") {
            s = { opacity: i < typedUpTo ? 1 : 0 };
          }
          if (fall) {
            const order = hash("fall", i);
            const u = Math.max(0, t - exitAt! - order * 0.18);
            const g2 = 4200;
            const ry = 0.5 * g2 * u * u - 320 * u * (0.6 + order);
            const rx = (hash("fallx", i) - 0.5) * 300 * u;
            const rot = (hash("fallr", i) - 0.5) * 720 * u;
            s = { ...s, transform: `${s.transform ?? ""} translate(${rx}px, ${ry}px) rotate(${rot}deg)`, opacity: clamp01(1.4 - u) };
          }
          const extra = letterStyle?.(i, n, g.ch);
          return (
            <span key={i} style={{ display: "inline-block", whiteSpace: "pre", color: outline ? "transparent" : g.accent ? accent : color, ...s, ...extra }}>
              {g.ch}
            </span>
          );
        })}
        {enter === "type" && li === lines.length - 1 && t >= at && (Math.floor(t * 2.5) % 2 === 0 || typedUpTo < n) && (
          <span style={{ display: "inline-block", width: "0.08em", height: "0.9em", marginLeft: "0.06em", background: accent, verticalAlign: "-0.1em" }} />
        )}
      </div>
    ));

  const inner = <div style={blockFx}>{renderLetters()}</div>;
  if (exiting && exit !== "fall") {
    return (
      <div style={{ ...block, ...style }}>
        <Exit t={t} at={exitAt!} kind={exit} dir={dir}>
          {inner}
        </Exit>
      </div>
    );
  }
  return <div style={{ ...block, ...style }}>{inner}</div>;
}
