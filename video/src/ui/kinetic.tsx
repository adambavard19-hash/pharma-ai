import type { CSSProperties } from "react";
import { C, EASE_IN_OUT, sp, tw, useF } from "../theme";

export type Word = { t: string; c?: string };

/** « le *bon conseil* » → mots, ceux entre astérisques dans la couleur d'accent. */
export function words(text: string, accent?: string): Word[] {
  const out: Word[] = [];
  let on = false;
  for (const part of text.split(/(\*)/)) {
    if (part === "*") { on = !on; continue; }
    for (const t of part.split(/\s+/).filter(Boolean)) out.push({ t, c: on ? accent : undefined });
  }
  return out;
}

/**
 * Typographie cinétique : chaque mot monte de sous sa ligne, net, avec un
 * léger flou de vitesse. Sortie optionnelle vers le haut à `out`.
 */
export function Kinetic({
  lines,
  at,
  out,
  size,
  color = C.ink900,
  weight = 600,
  stagger = 3,
  lineGap = 6,
  align = "flex-start",
  tracking = "-0.025em",
  style,
}: {
  lines: Word[][];
  at: number;
  out?: number;
  size: number;
  color?: string;
  weight?: number;
  stagger?: number;
  lineGap?: number;
  align?: "flex-start" | "center" | "flex-end";
  tracking?: string;
  style?: CSSProperties;
}) {
  const frame = useF();
  let k = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align, gap: lineGap, ...style }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "wrap", justifyContent: align, columnGap: size * 0.26, fontSize: size, fontWeight: weight, letterSpacing: tracking, lineHeight: 1.08, color }}>
          {line.map((w, wi) => {
            const i = k++;
            const p = sp(frame, at + i * stagger, { damping: 22, stiffness: 150 });
            const o = out === undefined ? 0 : tw(frame, [out + i * 1.2, out + 12 + i * 1.2], [0, 1], EASE_IN_OUT);
            return (
              <span key={wi} style={{ display: "inline-block", overflow: "hidden", padding: `${size * 0.06}px 0 ${size * 0.14}px`, margin: `${-size * 0.06}px 0 ${-size * 0.14}px` }}>
                <span
                  style={{
                    display: "inline-block",
                    transform: `translateY(${(1 - p) * 110 - o * 110}%)`,
                    opacity: Math.min(1, p * 1.6) * (1 - o),
                    filter: `blur(${Math.max(0, (1 - p) * 8)}px)`,
                    color: w.c ?? color,
                  }}
                >
                  {w.t}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Un surtitre en capitales espacées, comme le site. */
export function Eyebrow({ children, color = C.brand700, size = 22, style }: { children: string; color?: string; size?: number; style?: CSSProperties }) {
  return <div style={{ fontSize: size, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color, ...style }}>{children}</div>;
}
