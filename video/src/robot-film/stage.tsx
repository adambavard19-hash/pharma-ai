import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Volume2, Wifi } from "lucide-react";
import { C, FONT } from "../theme";
import { MENTION } from "./data";

/* ==========================================================================
 * LE DÉCOR DU FILM « ROBOT », façon Coucou : UN SEUL ENDROIT.
 *
 * Un bureau Windows neutre (fond sombre sans logo, barre des tâches générique, horloge, l'icône « stock.csv » dans
 * un coin), et derrière l'île, une fenêtre : le logiciel de gestion de l'officine (« Logiciel de gestion —
 * Délivrance », sans marque, le modèle LgoBackdrop du site), puis le logiciel PharmaBoost, flouté, côté titulaire.
 * Seule la fenêtre change ; l'île reste au même point du cadre du début à la fin.
 *
 * Deux cadrages, mêmes scènes : 16:9 (le site, caméra serrée sur la bande haute) et 9:16 (Instagram : l'île au
 * milieu, le contenu utile entre x 60 et x 900, entre y 250 et y 1540, la mention en haut à droite).
 * ======================================================================== */

export type Format = "16:9" | "9:16";

export type Layout = {
  W: number;
  H: number;
  /**
   * L'île : centre, bord haut, agrandissement — `close` quand elle n'est qu'une capsule (l'ouverture, les tapes, les
   * robots de comptoir), `zoom` pour la vente et le logiciel, `alertZoom` sur le seul plan de la mise en garde.
   */
  island: { cx: number; top: number; zoom: number; close: number; alertZoom: number };
  /** La fenêtre du logiciel de gestion, et le haut de la ligne scannée (en coordonnées de l'image). */
  lgo: { x: number; y: number; w: number; h: number; rowY: number; rowH: number; font: number };
  /** La fenêtre de PharmaBoost : son bandeau (où l'île se pose) et la page floutée. */
  app: { x: number; y: number; w: number; h: number; header: number };
  /** L'icône « stock.csv » du bureau (centre de l'icône). */
  icon: { x: number; y: number; size: number };
  taskbar: number;
  /** Les sous-titres : taille, largeur, centre, bas à ne pas dépasser. */
  caption: { size: number; width: number; cx: number; maxBottom: number };
  mention: { right: number; top: number; size: number };
  /** La notification du logiciel (en bas à droite de la fenêtre). */
  toast: { right: number; bottom: number; scale: number };
  cursor: number;
};

export function layoutFor(format: Format): Layout {
  if (format === "9:16") {
    return {
      W: 1080,
      H: 1920,
      island: { cx: 480, top: 900, zoom: 1.45, close: 1.9, alertZoom: 1.45 },
      lgo: { x: 40, y: 330, w: 1000, h: 1460, rowY: 786, rowH: 84, font: 30 },
      app: { x: 40, y: 822, w: 1000, h: 968, header: 176 },
      icon: { x: 150, y: 600, size: 96 },
      taskbar: 60,
      caption: { size: 66, width: 840, cx: 480, maxBottom: 1700 },
      mention: { right: 40, top: 262, size: 24 },
      toast: { right: 60, bottom: 1920 - 1640, scale: 1.5 },
      cursor: 1.25,
    };
  }
  return {
    W: 1920,
    H: 1080,
    island: { cx: 960, top: 34, zoom: 2.2, close: 2.5, alertZoom: 1.8 },
    lgo: { x: 250, y: 214, w: 1420, h: 794, rowY: 320, rowH: 66, font: 24 },
    app: { x: 250, y: -24, w: 1420, h: 1032, header: 178 },
    icon: { x: 128, y: 132, size: 84 },
    taskbar: 56,
    caption: { size: 58, width: 1600, cx: 960, maxBottom: 1010 },
    mention: { right: 22, top: 16, size: 18 },
    toast: { right: 1920 - 1640, bottom: 1080 - 960, scale: 1.55 },
    cursor: 1.1,
  };
}

// ---- Le bureau ----------------------------------------------------------------------------------------------

/** Le fond d'écran : sombre, neutre, quelques rubans de lumière flous. Immobile (l'œil reste sur l'île). */
export function Wallpaper({ L }: { L: Layout }) {
  const v = L.H > L.W;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #0A1624 0%, #0D2433 46%, #0A1420 100%)", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(60% 50% at 18% 12%, rgba(40,161,145,.30), transparent 70%), radial-gradient(55% 60% at 88% 85%, rgba(52,66,214,.22), transparent 72%), radial-gradient(40% 35% at 70% 20%, rgba(7,150,180,.18), transparent 70%)" }} />
      <svg width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} style={{ position: "absolute", inset: 0, filter: "blur(18px)", opacity: 0.55 }}>
        <defs>
          <linearGradient id="rib1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#36E8C8" stopOpacity="0" />
            <stop offset=".5" stopColor="#36E8C8" stopOpacity=".55" />
            <stop offset="1" stopColor="#4FB3FF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="rib2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#9B7BFF" stopOpacity="0" />
            <stop offset=".55" stopColor="#9B7BFF" stopOpacity=".35" />
            <stop offset="1" stopColor="#36E8C8" stopOpacity="0" />
          </linearGradient>
        </defs>
        {v ? (
          <>
            <path d="M -100 520 C 300 380, 700 760, 1180 560" stroke="url(#rib1)" strokeWidth={70} fill="none" />
            <path d="M -100 1500 C 340 1340, 760 1720, 1180 1460" stroke="url(#rib2)" strokeWidth={90} fill="none" />
          </>
        ) : (
          <>
            <path d="M -100 760 C 400 560, 900 980, 2020 640" stroke="url(#rib1)" strokeWidth={80} fill="none" />
            <path d="M -100 900 C 500 760, 1100 1080, 2020 820" stroke="url(#rib2)" strokeWidth={110} fill="none" />
          </>
        )}
      </svg>
    </AbsoluteFill>
  );
}

/** La barre des tâches : générique, sans logo ; l'horloge à droite. */
export function Taskbar({ L }: { L: Layout }) {
  const h = L.taskbar;
  const s = h / 56;
  const icons = ["#2B6CB0", "#F0F4F8", "#28A191", "#9B7BFF", "#E7B62D"];
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: "rgba(14,20,28,.9)", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ display: "flex", gap: 14 * s }}>
        <div style={{ width: 34 * s, height: 34 * s, borderRadius: 9 * s, background: "linear-gradient(135deg, #5B6A72, #2C3840)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }} />
        {icons.map((c, i) => (
          <div key={i} style={{ width: 34 * s, height: 34 * s, borderRadius: 9 * s, background: `linear-gradient(160deg, ${c}, ${c}AA)`, opacity: 0.9, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }} />
        ))}
      </div>
      <div style={{ position: "absolute", right: 18 * s, display: "flex", alignItems: "center", gap: 14 * s, color: "rgba(255,255,255,.9)" }}>
        <Wifi size={18 * s} strokeWidth={2} />
        <Volume2 size={18 * s} strokeWidth={2} />
        <div style={{ textAlign: "right", fontSize: 14 * s, lineHeight: 1.25, fontWeight: 500 }}>
          <div>09:42</div>
          <div>12/10/2026</div>
        </div>
      </div>
    </div>
  );
}

/** L'icône « stock.csv » du bureau. `lift` : soulevée (le fichier glisse avec le pointeur). */
export function DesktopIcon({ L, dim = 0 }: { L: Layout; dim?: number }) {
  const { x, y, size } = L.icon;
  return (
    <div style={{ position: "absolute", left: x - size * 0.7, top: y - size * 0.62, width: size * 1.4, textAlign: "center", fontFamily: FONT, opacity: 1 - 0.45 * dim }}>
      <FileGlyph size={size} />
      <div style={{ marginTop: size * 0.1, fontSize: size * 0.22, fontWeight: 600, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,.7)" }}>stock.csv</div>
    </div>
  );
}

/** Le document du fichier exporté : une page, le coin plié, la bande « CSV ». */
export function FileGlyph({ size, style }: { size: number; style?: CSSProperties }) {
  const w = size * 0.78;
  return (
    <svg width={w} height={size} viewBox="0 0 78 100" style={{ display: "block", margin: "0 auto", filter: "drop-shadow(0 6px 10px rgba(0,0,0,.35))", ...style }}>
      <path d="M6 2 H52 L76 26 V94 a4 4 0 0 1 -4 4 H6 a4 4 0 0 1 -4 -4 V6 a4 4 0 0 1 4 -4 Z" fill="#F7FAFC" />
      <path d="M52 2 V22 a4 4 0 0 0 4 4 H76 Z" fill="#D5DEE6" />
      {[40, 50, 60].map((y) => (
        <rect key={y} x={14} y={y} width={50} height={4} rx={2} fill="#C9D3DC" />
      ))}
      <rect x={10} y={70} width={58} height={20} rx={4} fill="#1D8174" />
      <text x={39} y={85} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill="#fff">
        CSV
      </text>
    </svg>
  );
}

// ---- La fenêtre du logiciel de gestion ----------------------------------------------------------------------

const SCANNED = "DOXYCYCLINE 100 mg — 1 boîte";

/** Le logiciel de gestion de l'officine : un décor générique, pas une copie. La ligne scannée s'inscrit à `scanAt`. */
export function LgoWindow({ L, t, scanAt, style }: { L: Layout; t: number; scanAt: number; style?: CSSProperties }) {
  const { x, y, w, h, rowY, rowH, font } = L.lgo;
  const v = L.H > L.W;
  const bar = font * 1.85;
  const typed = Math.max(0, Math.min(SCANNED.length, Math.floor(((t - scanAt) / 0.32) * SCANNED.length)));
  const flash = t >= scanAt ? Math.max(0, 1 - (t - scanAt) / 1.4) : 0;
  const pad = font * 1.15;
  const leftW = v ? w - pad * 2 : w * 0.66;
  const row = (top: number, children: ReactNode, extra?: CSSProperties) => (
    <div style={{ position: "absolute", left: pad, top, width: leftW, height: rowH, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", padding: `0 ${font * 0.7}px`, boxSizing: "border-box", fontSize: font, color: "#4A5A68", fontWeight: 500, ...extra }}>{children}</div>
  );
  const rel = rowY - y;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 12, overflow: "hidden", background: "#E9EEF2", boxShadow: "0 30px 80px -20px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06)", fontFamily: FONT, ...style }}>
      <div style={{ height: bar, background: "#D3DBE2", display: "flex", alignItems: "center", padding: `0 ${font * 0.7}px`, gap: font * 0.55 }}>
        <div style={{ width: font * 0.95, height: font * 0.95, borderRadius: font * 0.25, background: "#1E6F8A", boxShadow: "inset 0 0 0 2px rgba(255,255,255,.35)" }} />
        <div style={{ fontSize: font * 0.8, fontWeight: 600, color: "#3B4A56" }}>Logiciel de gestion — Délivrance</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: font * 1.2, alignItems: "center", color: "#3B4A56" }}>
          <div style={{ width: font * 0.6, height: 2, background: "currentColor" }} />
          <div style={{ width: font * 0.55, height: font * 0.55, border: "2px solid currentColor", borderRadius: 2 }} />
          <div style={{ fontSize: font * 0.8, lineHeight: 1 }}>✕</div>
        </div>
      </div>
      <div style={{ height: font * 2.1, background: "#DFE6EC", display: "flex", alignItems: "center", gap: font * 0.5, padding: `0 ${pad}px` }}>
        <div style={{ height: font * 1.35, padding: `0 ${font * 0.7}px`, borderRadius: 7, background: "#fff", display: "flex", alignItems: "center", fontSize: font * 0.72, fontWeight: 600, color: "#1E6F8A" }}>Délivrance</div>
        {[5.2, 4.4, 4.8].map((k, i) => (
          <div key={i} style={{ width: font * k, height: font * 0.5, borderRadius: 4, background: "#C5D0D9" }} />
        ))}
      </div>
      {/* Les lignes de la délivrance : la ligne scannée s'inscrit, surlignée un instant. */}
      {v ? (
        <>
          {row(rel - (rowH + 14) * 3, "Ordonnance du jour")}
          {row(rel - (rowH + 14) * 2, "Tiers payant")}
          {row(rel - (rowH + 14), <div style={{ width: "40%", height: font * 0.45, borderRadius: 4, background: "#E2E8ED" }} />)}
          {row(rel, typed > 0 ? SCANNED.slice(0, typed) : <span style={{ color: "#A5B2BC" }}>Produit…</span>, { boxShadow: flash > 0 ? `inset 0 0 0 2px rgba(54,232,200,${0.9 * flash}), 0 0 ${30 * flash}px rgba(54,232,200,${0.5 * flash})` : undefined, background: flash > 0 ? `rgba(226,250,245,${0.4 + 0.6 * flash})` : "#fff" })}
          <div style={{ position: "absolute", left: pad, top: rel + rowH + 14, width: leftW, height: h - rel - rowH - 40, borderRadius: 8, background: "#fff" }} />
        </>
      ) : (
        <>
          {row(rel, typed > 0 ? SCANNED.slice(0, typed) : <span style={{ color: "#A5B2BC" }}>Produit…</span>, { boxShadow: flash > 0 ? `inset 0 0 0 2px rgba(54,232,200,${0.9 * flash}), 0 0 ${30 * flash}px rgba(54,232,200,${0.5 * flash})` : undefined, background: flash > 0 ? `rgba(226,250,245,${0.4 + 0.6 * flash})` : "#fff" })}
          {row(rel + rowH + 12, "Ordonnance du jour")}
          {row(rel + (rowH + 12) * 2, "Tiers payant")}
          <div style={{ position: "absolute", left: pad, top: rel + (rowH + 12) * 3, width: leftW, height: h - rel - (rowH + 12) * 3 - pad, borderRadius: 8, background: "#fff" }} />
          <div style={{ position: "absolute", left: pad * 2 + leftW, top: rel, right: pad }}>
            {[1, 1].map((_, i) => (
              <div key={i} style={{ height: rowH * 1.9, borderRadius: 8, background: "#fff", marginBottom: 12, padding: font * 0.7, boxSizing: "border-box" }}>
                <div style={{ width: "62%", height: font * 0.45, borderRadius: 4, background: "#DDE4EA" }} />
                <div style={{ width: "40%", height: font * 0.45, borderRadius: 4, background: "#E6ECF0", marginTop: font * 0.55 }} />
              </div>
            ))}
            <div style={{ height: rowH, borderRadius: 8, background: "#1E6F8A", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: font * 0.85, fontWeight: 600 }}>Valider</div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- La fenêtre de PharmaBoost (floutée) --------------------------------------------------------------------

/** Le logiciel PharmaBoost côté titulaire, flouté : le bandeau où se pose l'île, le menu, des cartes. */
export function AppWindow({ L, style }: { L: Layout; style?: CSSProperties }) {
  const { x, y, w, h, header } = L.app;
  const v = L.H > L.W;
  const side = v ? 0 : 290;
  const k = v ? 1.25 : 1;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 14, overflow: "hidden", background: C.app, boxShadow: "0 30px 80px -20px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.06)", fontFamily: FONT, ...style }}>
      <div style={{ position: "absolute", inset: 0, filter: "blur(9px)", transform: "scale(1.02)" }}>
        {side > 0 && (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: side, background: "#fff", borderRight: `1px solid ${C.ink200}` }}>
            <div style={{ margin: "56px 28px 40px", fontSize: 34, fontWeight: 700, letterSpacing: "-0.025em" }}>
              <span style={{ color: C.ink900 }}>Pharma</span>
              <span style={{ color: C.brand700 }}>Boost</span>
            </div>
            {[0.7, 0.55, 0.8, 0.6, 0.5, 0.65, 0.58].map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, margin: "0 24px 22px", padding: "14px 16px", borderRadius: 12, background: i === 0 ? C.brand50 : "transparent" }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: i === 0 ? C.brand500 : C.ink300 }} />
                <div style={{ width: `${p * 100}%`, height: 14, borderRadius: 7, background: i === 0 ? C.brand300 : C.ink200 }} />
              </div>
            ))}
          </div>
        )}
        <div style={{ position: "absolute", left: side, right: 0, top: 0, height: header, background: "#fff", borderBottom: `1px solid ${C.ink200}` }}>
          <div style={{ position: "absolute", right: 40, top: header / 2 - 24, width: 48, height: 48, borderRadius: 24, background: C.brand200 }} />
          {v && (
            <div style={{ position: "absolute", left: 36, top: header / 2 - 22, fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em" }}>
              <span style={{ color: C.ink900 }}>Pharma</span>
              <span style={{ color: C.brand700 }}>Boost</span>
            </div>
          )}
        </div>
        <div style={{ position: "absolute", left: side + 48 * k, right: 48 * k, top: header + 48 * k, display: "grid", gridTemplateColumns: v ? "1fr 1fr" : "1fr 1fr 1fr", gap: 28 * k }}>
          {[C.brand500, C.sky, C.accent400, C.brand400, C.leaf500, C.brand600].slice(0, v ? 4 : 3).map((c, i) => (
            <div key={i} style={{ height: 150 * k, borderRadius: 18, background: "#fff", boxShadow: "0 4px 24px -4px rgba(30,133,120,.14)", padding: 26 * k }}>
              <div style={{ width: "45%", height: 14, borderRadius: 7, background: C.ink200 }} />
              <div style={{ width: "60%", height: 34, borderRadius: 10, background: c, opacity: 0.85, marginTop: 24 * k }} />
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1", height: 360 * k, borderRadius: 18, background: "#fff", boxShadow: "0 4px 24px -4px rgba(30,133,120,.14)", padding: 30, display: "flex", alignItems: "flex-end", gap: 22 }}>
            {[0.35, 0.5, 0.42, 0.68, 0.55, 0.8, 0.62, 0.9, 0.74].map((p, i) => (
              <div key={i} style={{ flex: 1, height: `${p * 100}%`, borderRadius: 10, background: i === 7 ? C.brand500 : C.brand200 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- La mention, le pointeur --------------------------------------------------------------------------------

export function Mention({ L, opacity = 1 }: { L: Layout; opacity?: number }) {
  return (
    <div style={{ position: "absolute", right: L.mention.right, top: L.mention.top, padding: `${L.mention.size * 0.32}px ${L.mention.size * 0.75}px`, borderRadius: 999, background: "rgba(5,10,16,.55)", color: "rgba(255,255,255,.86)", fontFamily: FONT, fontSize: L.mention.size, fontWeight: 500, letterSpacing: "0.01em", opacity, whiteSpace: "nowrap", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}>
      {MENTION}
    </div>
  );
}

/** Le pointeur de la souris : la flèche, son appui, l'onde du clic ; en glissant, le fichier sous la flèche. */
export function Pointer({ x, y, scale, press, click, opacity, dragging }: { x: number; y: number; scale: number; press: number; click: number; opacity: number; dragging?: number }) {
  if (opacity <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none" }}>
      {click >= 0 && click <= 1 && (
        <div style={{ position: "absolute", left: -46 * click * scale, top: -46 * click * scale, width: 92 * click * scale, height: 92 * click * scale, borderRadius: "50%", border: `${3 * scale}px solid rgba(144,217,205,.95)`, opacity: 1 - click }} />
      )}
      {dragging !== undefined && dragging > 0 && (
        <div style={{ position: "absolute", left: 18 * scale, top: 26 * scale, opacity: 0.88 * dragging, transform: `scale(${0.7 + 0.3 * dragging}) rotate(-6deg)`, transformOrigin: "0 0" }}>
          <FileGlyph size={64 * scale} />
        </div>
      )}
      <svg width={40 * scale} height={52 * scale} viewBox="0 0 20 26" style={{ position: "absolute", left: 0, top: 0, transform: `scale(${1 - 0.14 * press})`, transformOrigin: "0 0", filter: "drop-shadow(0 4px 6px rgba(15,23,42,.45))" }}>
        <path d="M1 1 L1 20 L6 15.5 L9.5 23.5 L13 22 L9.5 14 L16 14 Z" fill="#fff" stroke="#172126" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const EASE_MOVE = Easing.bezier(0.45, 0, 0.2, 1);

/** Un trajet du pointeur : des étapes (temps en secondes, position), un mouvement doux de l'une à l'autre. */
export type PointerStop = { t: number; x: number; y: number };
export function pointerAt(stops: PointerStop[], t: number): { x: number; y: number } {
  if (t <= stops[0].t) return { x: stops[0].x, y: stops[0].y };
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (t <= b.t) {
      const k = interpolate(t, [a.t, b.t], [0, 1], { easing: EASE_MOVE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      // Une légère courbe, comme une main : le trajet s'arrondit vers le haut.
      const bow = Math.sin(Math.PI * k) * Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.08);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - bow };
    }
  }
  const last = stops[stops.length - 1];
  return { x: last.x, y: last.y };
}
