"use client";

import { useEffect, useRef, useState } from "react";
import { ISLAND_WINDOW } from "../../../../../agent/src/notice-host-ile";
import { ISLAND_SIDES, type IslandSide, type RegionRect } from "@/core/poste/island-bridge";
import { ESSAI_LENGTH_MS, ESSAI_SEQUENCE } from "@/core/poste/island-fixtures";

const SIDE_LABEL: Record<IslandSide, string> = { haut: "En haut", bas: "En bas", gauche: "À gauche", droite: "À droite" };
/** Où Windows pose la fenêtre de l'île sur l'écran, pour chaque place (agent/src/notice-host-ile.ts, Place). */
const WINDOW_PLACE: Record<IslandSide, string> = {
  haut: "top-[6px] left-1/2 -translate-x-1/2",
  bas: "bottom-[6px] left-1/2 -translate-x-1/2",
  gauche: "left-[4px] top-1/2 -translate-y-1/2",
  droite: "right-[4px] top-1/2 -translate-y-1/2",
};

/**
 * L'aperçu de la fenêtre Windows de l'île : le cadre a la taille de la fenêtre WebView2 (à 100 %), joue la vente
 * d'exemple de l'agent, affiche la forme renvoyée par la page (ce que Windows découpera) et les mots qui repartiraient
 * vers l'agent (Vendu, Non vendu, e-mail, Vente terminée).
 */
export function PosteWindowPreview() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [rects, setRects] = useState<RegionRect[]>([]);
  const [words, setWords] = useState<string[]>([]);
  const [keyboard, setKeyboard] = useState(false);
  const [ready, setReady] = useState(false);
  const [side, setSide] = useState<IslandSide>("haut");
  const [style, setStyle] = useState<"aurore" | "actuel">("aurore");

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const out = (event.data as { pbIslandOut?: { type: string; rects?: RegionRect[]; word?: string; on?: boolean } } | null)?.pbIslandOut;
      if (!out) return;
      if (out.type === "ready") setReady(true);
      if (out.type === "region" && out.rects) setRects(out.rects);
      if (out.type === "word" && out.word) setWords((list) => [out.word as string, ...list].slice(0, 8));
      if (out.type === "keyboard") setKeyboard(Boolean(out.on));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const post = (command: unknown) => frame.current?.contentWindow?.postMessage({ pbIsland: JSON.stringify(command) }, window.location.origin);
    const play = () => {
      for (const step of ESSAI_SEQUENCE) timers.push(setTimeout(() => post(step.command), step.at));
      timers.push(setTimeout(play, ESSAI_LENGTH_MS));
    };
    play();
    return () => timers.forEach(clearTimeout);
  }, [ready]);

  // Le menu « Place de la bannière » de l'icône PharmaBoost, au poste : la fenêtre se range contre ce bord, l'île s'y adapte.
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ pbIsland: JSON.stringify({ op: "place", side }) }, window.location.origin);
  }, [ready, side]);

  return (
    <div className="min-h-dvh bg-[#2B3540] p-6 text-white">
      <div className="mx-auto max-w-[1100px]">
        <p className="text-[13px] text-white/60">Aperçu de la fenêtre Windows de l&apos;île ({ISLAND_WINDOW.width} × {ISLAND_WINDOW.height} à 100 %), pilotée par les commandes de l&apos;agent.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]" role="radiogroup" aria-label="Place de la bannière">
          <span className="text-white/70">Place de la bannière :</span>
          {ISLAND_SIDES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={side === value}
              data-place={value}
              onClick={() => setSide(value)}
              className={`h-8 rounded-lg px-3 font-semibold ${side === value ? "bg-[#58F2D8] text-[#04261A]" : "bg-white/10 text-white hover:bg-white/15"}`}
            >
              {SIDE_LABEL[value]}
            </button>
          ))}
          <span className="ml-4 text-white/70">Style :</span>
          {(["aurore", "actuel"] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-style={value}
              onClick={() => {
                if (value === style) return;
                setReady(false);
                setStyle(value);
              }}
              className={`h-8 rounded-lg px-3 font-semibold ${style === value ? "bg-[#E8FF9C] text-[#03171A]" : "bg-white/10 text-white hover:bg-white/15"}`}
            >
              {value === "aurore" ? "Nouveau" : "Actuel"}
            </button>
          ))}
        </div>
        <div className="relative mt-4 overflow-hidden rounded-xl border border-white/10" style={{ height: ISLAND_WINDOW.height + 40, background: "linear-gradient(#DCE3E8 0 38px, #F4F6F8 38px)" }}>
          {/* Le faux logiciel de gestion, derrière. */}
          <div className="absolute inset-x-0 top-0 flex h-[38px] items-center gap-4 bg-[#1F4E79] px-4 text-[12px] text-white/90">
            <span className="font-bold">LGPI</span><span>Délivrance</span><span>Stock</span><span>Patients</span>
          </div>
          <div className="absolute top-[60px] left-6 right-6 space-y-2 text-[12px] text-[#33414D]">
            {Array.from({ length: 14 }, (_, i) => <div key={i} className="h-6 rounded bg-white shadow-sm" />)}
          </div>
          <div className={`absolute ${WINDOW_PLACE[side]}`} style={{ width: ISLAND_WINDOW.width, height: ISLAND_WINDOW.height }}>
            <iframe key={style} ref={frame} src={style === "actuel" ? "/poste/ile?style=actuel" : "/poste/ile"} title="Île du poste" className="absolute inset-0 size-full border-0" style={{ background: "transparent", colorScheme: "normal" }} />
            {/* La forme que Windows gardera : rien en dehors ne cache le logiciel ni ne prend ses clics. */}
            <svg className="pointer-events-none absolute inset-0" width={ISLAND_WINDOW.width} height={ISLAND_WINDOW.height} aria-hidden="true">
              <rect x={0.5} y={0.5} width={ISLAND_WINDOW.width - 1} height={ISLAND_WINDOW.height - 1} fill="none" stroke="rgba(31,78,121,0.35)" strokeDasharray="2 6" />
              {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={r.r} fill="none" stroke="#F2A516" strokeWidth={1.5} strokeDasharray="5 4" />)}
            </svg>
          </div>
        </div>
        <div className="mt-4 grid gap-4 text-[13px] sm:grid-cols-2">
          <div className="rounded-xl bg-white/5 p-3">
            <p className="font-semibold">Forme gardée par Windows</p>
            <p className="mt-1 font-mono text-[12px] text-white/70">{rects.map((r) => `${r.w}×${r.h} (r ${r.r})`).join(" + ") || "—"}</p>
            <p className="mt-1 text-white/60">Clavier : {keyboard ? "pris (e-mail du patient)" : "laissé au logiciel de gestion"}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <p className="font-semibold">Mots renvoyés à l&apos;agent</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[12px] text-white/70">{words.length ? words.map((w, i) => <li key={`${w}-${i}`}>{w}</li>) : <li>— cliquez Vendu, Non vendu, Vente terminée… dans l&apos;île</li>}</ul>
          </div>
        </div>
      </div>
    </div>
  );
}
