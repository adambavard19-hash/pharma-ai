import type { CSSProperties, ReactNode } from "react";
import { FONT } from "../theme";
import { textWidth, wrapLines } from "../ui/banner";

/* ==========================================================================
 * LES PIÈCES DE L'ÎLE (counter-island.tsx, platform-island.tsx), en styles en ligne.
 *
 * Mêmes cotes que les classes Tailwind du site, en pixels de l'île (la capsule est agrandie d'un bloc par
 * `IslandShell`). Les textes longs sont coupés en lignes ICI (wrapLines, prudent) : la hauteur de l'île se calcule
 * sans mesurer, et rien ne déborde.
 * ======================================================================== */

export const WHITE = (a: number) => `rgba(255,255,255,${a})`;
export const GLOW = "#36E8C8";
export const AMBER = "#F5A623";
export const GREEN = "#22C88F";

/** Le texte de l'île : Plus Jakarta Sans, comme le site. */
export const islandFont: CSSProperties = { fontFamily: FONT, letterSpacing: 0, WebkitFontSmoothing: "antialiased" };

/** La ligne « robot · titre · sous-titre » (Row du site). `compact` : sans marge propre (dans un panneau). */
export function Row({ robot, title, sub, trailing, icon, compact, titleSize = 14.5 }: { robot: ReactNode; title: string; sub?: string; trailing?: ReactNode; icon?: ReactNode; compact?: boolean; titleSize?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 38, padding: compact ? 0 : "10px 12px", boxSizing: "content-box" }}>
      {robot}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: titleSize, lineHeight: "20px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {icon}
          {title}
        </div>
        {sub !== undefined && <div style={{ fontSize: 12.5, lineHeight: "18px", color: WHITE(0.6), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
      {trailing}
    </div>
  );
}

/** Une pastille de carte (Challenge, Date courte, En stock). */
export function Chip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 999, padding: "2px 8px", fontSize: 11, lineHeight: "16.5px", fontWeight: 600, whiteSpace: "nowrap", background: bg, color: fg }}>{children}</span>;
}

/** Un texte coupé en lignes explicites (largeur en pixels de l'île). */
export function wrap(text: string, size: number, width: number): string[] {
  return wrapLines(text, size, width);
}

export function Lines({ lines, size, lineHeight, style, render }: { lines: string[]; size: number; lineHeight: number; style?: CSSProperties; render?: (line: string, i: number) => ReactNode }) {
  return (
    <div style={{ fontSize: size, lineHeight: `${lineHeight}px`, ...style }}>
      {lines.map((line, i) => (
        <div key={i} style={{ whiteSpace: "nowrap" }}>
          {render ? render(line, i) : line}
        </div>
      ))}
    </div>
  );
}

/** La largeur d'un bouton à texte (padding compris), pour poser le pointeur dessus. */
export function buttonWidth(label: string, size: number, padX: number, icon = 0, gap = 0) {
  return Math.round(textWidth(label, size) * 0.93 + padX * 2 + (icon ? icon + gap : 0));
}
