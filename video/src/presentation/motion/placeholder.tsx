import { AbsoluteFill } from "remotion";
import { ACT1, Backdrop, Camera, DotGrid, PB, Word, digits, label, prog, SNAP } from "./kit";
import type { SceneProps } from "./types";

/* L'écran d'attente d'une scène pas encore construite : fond de l'acte, grille, nom de la scène, fenêtre et
 * segments de voix. À REMPLACER entièrement par le développeur de la scène. */

export function Placeholder({ t, time, win }: SceneProps) {
  const act1 = win.start < time.DROP - 0.01;
  const accent = act1 ? ACT1.g4 : PB.mint;
  const k = Math.max(0, Math.min(1, (t - win.start) / win.dur));
  const segs = win.lines.flatMap((id) => time.line(id).chunks.map((c, j) => ({ id, j, start: c.start, end: c.end })));
  const x0 = 360;
  const w = 1200;
  const px = (s: number) => x0 + ((s - win.start) / win.dur) * w;
  return (
    <AbsoluteFill>
      <Backdrop t={t} kind={act1 ? "act1" : "brand"} />
      <DotGrid t={t} opacity={time.look(t).dots} />
      <Camera t={t} zoom={1 + 0.03 * k}>
        <Word t={t} at={win.start} text={win.id} x={960} y={360} size={260} color={accent} enter="rise" />
        <Word t={t} at={win.start + 0.12} text={win.name} x={960} y={540} size={84} weight={800} tracking="-0.03em" enter="slide" />
        <div style={{ position: "absolute", left: 0, right: 0, top: 620, textAlign: "center", ...label(24), color: "rgba(255,255,255,.55)", opacity: prog(t, win.start + 0.2, 0.3, SNAP) }}>
          scène à construire · {win.file}
        </div>
      </Camera>
      {/* La fenêtre : barre de progression et segments de voix. */}
      <div style={{ position: "absolute", left: x0, top: 720, width: w, height: 6, borderRadius: 3, background: "rgba(255,255,255,.12)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${k * 100}%`, borderRadius: 3, background: accent }} />
      </div>
      {segs.map((s) => (
        <div key={`${s.id}-${s.j}`} style={{ position: "absolute", left: px(s.start), top: 740, width: Math.max(4, px(s.end) - px(s.start) - 4), height: 22, borderRadius: 6, background: t >= s.start && t < s.end ? accent : "rgba(255,255,255,.14)", color: t >= s.start && t < s.end ? "#0B0F14" : "rgba(255,255,255,.6)", ...digits(14, 600), lineHeight: "22px", textAlign: "center", overflow: "hidden" }}>
          {s.id}·{s.j}
        </div>
      ))}
      <div style={{ position: "absolute", left: x0, top: 780, width: w, display: "flex", justifyContent: "space-between", ...digits(20, 600), color: "rgba(255,255,255,.55)" }}>
        <span>{win.start.toFixed(2)} s</span>
        <span style={{ color: "#fff" }}>t = {t.toFixed(2)} s</span>
        <span>{win.end.toFixed(2)} s</span>
      </div>
    </AbsoluteFill>
  );
}
