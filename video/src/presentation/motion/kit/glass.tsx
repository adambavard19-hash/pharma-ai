import type { CSSProperties, ReactNode } from "react";
import { PB, rgba } from "./palette";

/* ==========================================================================
 * VERRE DÉPOLI — panneaux, tuiles, pastilles.
 *
 *   <Glass tone="dark" | "light" active? radius={28} style={{ left, top, width, height }}>…</Glass>
 *     dark  : rgba(18,26,34,.88)
 *     light : rgba(255,255,255,.07) + backdrop blur 24 px, saturate 140 %
 *     bord 1 px blanc 14 %, reflet intérieur 135° (blanc 18 % → transparent 40 %), ombre 0 30px 80px rgba(0,0,0,.45)
 *     active : halo menthe en plus (0 0 40px rgba(54,232,200,.25)) ; active={0..1} pour le faire monter
 *     sheen  : 0..1, un reflet qui traverse le verre (vie permanente) — ex. sheen={(t * .4) % 1}
 *   glassStyle(tone, active) → CSSProperties à étaler sur n'importe quel élément (sans le reflet intérieur)
 *
 * Positionné en absolu par défaut : passer left/top/width/height dans style.
 * ======================================================================== */

export function glassStyle(tone: "dark" | "light" = "dark", active: number | boolean = 0): CSSProperties {
  const a = typeof active === "boolean" ? (active ? 1 : 0) : active;
  const glow = a > 0 ? `, 0 0 40px ${rgba(PB.mint, 0.25 * a)}` : "";
  return tone === "dark"
    ? { background: PB.glassDark, border: "1px solid rgba(255,255,255,.14)", boxShadow: `0 30px 80px rgba(0,0,0,.45)${glow}` }
    : {
        background: "rgba(255,255,255,.07)",
        backdropFilter: "blur(24px) saturate(140%)",
        WebkitBackdropFilter: "blur(24px) saturate(140%)",
        border: "1px solid rgba(255,255,255,.14)",
        boxShadow: `0 30px 80px rgba(0,0,0,.45)${glow}`,
      };
}

export function Glass({ tone = "dark", active = 0, radius = 28, sheen, style, children }: { tone?: "dark" | "light"; active?: number | boolean; radius?: number; sheen?: number; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div style={{ position: "absolute", borderRadius: radius, overflow: "hidden", ...glassStyle(tone, active), ...style }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: radius, background: "linear-gradient(135deg, rgba(255,255,255,.18), transparent 40%)", pointerEvents: "none" }} />
      {sheen !== undefined && sheen > 0 && sheen < 1 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `linear-gradient(110deg, transparent ${sheen * 160 - 40}%, rgba(255,255,255,.16) ${sheen * 160 - 25}%, transparent ${sheen * 160 - 10}%)`,
          }}
        />
      )}
      <div style={{ position: "relative", width: "100%", height: "100%" }}>{children}</div>
    </div>
  );
}
