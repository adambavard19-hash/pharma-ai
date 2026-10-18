"use client";

import { useEffect, useRef, useState } from "react";
import { ISLAND_WINDOW } from "../../../../../agent/src/notice-host-ile";
import type { HostEntry } from "../../../../../agent/src/notice-center";

export type DonnaSale = { label: string; kind: string; count: number; entry: HostEntry };

const KIND: Record<string, string> = { ATC: "Classe", FAMILY: "Famille", MEDICINE: "Médicament" };

/** Choisir une association de Donna : la fenêtre du poste joue le scan puis montre ses conseils. Survoler un conseil ouvre le menu. */
export function DonnaAdvicePreview({ sales }: { sales: DonnaSale[] }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [picked, setPicked] = useState(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if ((event.data as { pbIslandOut?: { type: string } } | null)?.pbIslandOut?.type === "ready") setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready || !sales[picked]) return;
    const post = (command: unknown) => frame.current?.contentWindow?.postMessage({ pbIsland: JSON.stringify(command) }, window.location.origin);
    post({ op: "init", look: 3, position: "haut-centre", postLabel: "Comptoir 1" });
    post({ op: "scan" });
    const id = setTimeout(() => post({ op: "show", entry: sales[picked].entry }), 900);
    return () => clearTimeout(id);
  }, [ready, picked, sales]);

  if (sales.length === 0) return <p className="p-6">Aucune association : lancer les scripts .live/conseils-base.mjs puis .live/conseils-pitch.mts.</p>;
  return (
    <div className="min-h-dvh bg-[#2B3540] p-6 text-white">
      <div className="mx-auto flex max-w-[1300px] gap-5">
        <aside className="w-[300px] shrink-0">
          <p className="text-[15px] font-bold">Les associations de Donna</p>
          <p className="mt-1 text-[12.5px] text-white/60">Prix, marge et stock réels de Docteur Nicolas. Choisissez une vente, puis passez la souris sur un conseil.</p>
          <ul className="mt-3 max-h-[78dvh] space-y-1 overflow-y-auto pr-1">
            {sales.map((sale, index) => (
              <li key={sale.entry.signature}>
                <button type="button" onClick={() => setPicked(index)} className={`w-full rounded-lg px-3 py-2 text-left text-[13px] ${index === picked ? "bg-[#58F2D8] text-[#04261A]" : "bg-white/5 hover:bg-white/10"}`}>
                  <span className="block font-semibold">{sale.label}</span>
                  <span className={`text-[11.5px] ${index === picked ? "text-[#04261A]/70" : "text-white/55"}`}>{KIND[sale.kind] ?? sale.kind} · {sale.count} conseil{sale.count > 1 ? "s" : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10" style={{ height: ISLAND_WINDOW.height + 40, background: "linear-gradient(#DCE3E8 0 38px, #F4F6F8 38px)" }}>
          <div className="absolute inset-x-0 top-0 flex h-[38px] items-center gap-4 bg-[#1F4E79] px-4 text-[12px] text-white/90">
            <span className="font-bold">LGPI</span><span>Délivrance</span><span>Stock</span><span>Patients</span>
          </div>
          <div className="absolute top-[60px] right-6 left-6 space-y-2">
            {Array.from({ length: 14 }, (_, i) => <div key={i} className="h-6 rounded bg-white shadow-sm" />)}
          </div>
          <div className="absolute top-[6px] left-1/2 -translate-x-1/2" style={{ width: ISLAND_WINDOW.width, height: ISLAND_WINDOW.height }}>
            <iframe ref={frame} src="/poste/ile" title="Île du poste" className="absolute inset-0 size-full border-0" style={{ background: "transparent", colorScheme: "normal" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
