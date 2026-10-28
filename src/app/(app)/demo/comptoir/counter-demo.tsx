"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Inbox, Mail, RotateCcw, ScanLine, X } from "lucide-react";
import { simulateDeliveryStepAction } from "@/server/actions/demo";
import { demoCounterFinishAction, demoCounterNoticeAction, demoCounterSellAction, demoCounterWordAction, type DemoBilan } from "@/server/actions/demo-counter";
import { ISLAND_WINDOW } from "../../../../../agent/src/notice-host-ile";
import { greetingText } from "../../../../../agent/src/greeting-text";
import type { HostCommand, RegionRect } from "@/core/poste/island-bridge";
import type { HostEntry } from "../../../../../agent/src/notice-center";
import { cn } from "@/lib/utils";

export type CounterScenario = { id: string; title: string; situation: string; boxes: string[] };

/** Un bip de douchette : court, aigu, comme au comptoir. */
function beep() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 2400;
    gain.gain.value = 0.05;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.09);
    oscillator.onended = () => void context.close();
  } catch {
    // Sans son, la démonstration continue.
  }
}

/** La forme de l'île renvoyée par la page (ce que Windows garde au poste) : hors d'elle, les clics vont au logiciel derrière. */
function clipOf(rects: RegionRect[]): string {
  if (rects.length === 0) return "path('M0 0')";
  const shape = rects
    .map(({ x, y, w, h, r }) => {
      const radius = Math.max(0, Math.min(r, w / 2, h / 2));
      return `M${x + radius} ${y}H${x + w - radius}A${radius} ${radius} 0 0 1 ${x + w} ${y + radius}V${y + h - radius}A${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h}H${x + radius}A${radius} ${radius} 0 0 1 ${x} ${y + h - radius}V${y + radius}A${radius} ${radius} 0 0 1 ${x + radius} ${y}Z`;
    })
    .join("");
  return `path('${shape}')`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const WORDS = new Set(["VENDU", "NONVENDU", "ANNULER", "REPONSE", "EMAIL", "EMAIL_RETIRER", "SERVI"]);

/**
 * La démonstration au comptoir : le logiciel de gestion (un décor), la douchette (les boîtes du scénario, un clic = un bip),
 * la vraie île du poste par-dessus, et la boîte mail du patient quand la vente se termine.
 */
export function CounterDemo({ scenarios, initial, pharmacyName, firstName }: { scenarios: CounterScenario[]; initial: string; pharmacyName: string; firstName: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [rects, setRects] = useState<RegionRect[]>([]);
  const [scenarioId, setScenarioId] = useState(initial);
  const [scanned, setScanned] = useState<string[]>([]);
  const [entry, setEntry] = useState<HostEntry | null>(null);
  const [sold, setSold] = useState<string[]>([]);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [bilan, setBilan] = useState<DemoBilan | null>(null);
  const [mail, setMail] = useState<"hidden" | "notice" | "open">("hidden");
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const saleRef = useRef<string | null>(null);

  const post = useCallback((command: HostCommand) => {
    frame.current?.contentWindow?.postMessage({ pbIsland: JSON.stringify(command) }, window.location.origin);
  }, []);

  const show = useCallback(
    (next: HostEntry) => {
      setEntry(next);
      post({ op: "show", entry: next });
    },
    [post],
  );

  const finish = useCallback(
    async (id: string) => {
      const result = await demoCounterFinishAction({ prescriptionId: id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      post({ op: "done", info: result.data.done });
      setClosed(true);
      if (result.data.bilan) {
        setBilan(result.data.bilan);
        await wait(1800);
        setMail("notice");
      }
      await wait(7000);
      post({ op: "remove", id });
    },
    [post],
  );

  // Ce que l'île renvoie : sa forme (pour laisser passer les clics ailleurs) et les gestes du pharmacien.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const out = (event.data as { pbIslandOut?: { type: string; rects?: RegionRect[]; word?: string } } | null)?.pbIslandOut;
      if (!out) return;
      if (out.type === "ready") setReady(true);
      if (out.type === "region" && out.rects) setRects(out.rects);
      if (out.type !== "word" || !out.word) return;
      const [word, id = "", argument = ""] = out.word.split(" ");
      if (!id || id !== saleRef.current) return;
      if (word === "TERMINER") {
        void finish(id);
        return;
      }
      if (!WORDS.has(word)) return;
      void demoCounterWordAction({ prescriptionId: id, word: word as "VENDU", argument }).then((result) => {
        if (result.ok) show(result.data.entry);
        else setError(result.error);
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finish, show]);

  // L'île démarre comme au poste : le nom du comptoir, puis le bonjour du robot.
  useEffect(() => {
    if (!ready) return;
    post({ op: "init", look: 3, position: "haut-centre", postLabel: "Comptoir 1", pharmacyName });
    post({ op: "greet", text: greetingText(firstName) });
  }, [ready, post, pharmacyName, firstName]);

  const reset = (next = scenarioId) => {
    if (saleRef.current) post({ op: "remove", id: saleRef.current });
    saleRef.current = null;
    setSaleId(null);
    setScanned([]);
    setEntry(null);
    setSold([]);
    setClosed(false);
    setBilan(null);
    setMail("hidden");
    setError(null);
    setScenarioId(next);
  };

  /** Un clic sur la boîte suivante : le bip, la ligne dans le logiciel, puis, à la dernière, l'analyse et les conseils. */
  const scan = async () => {
    if (busy || closed || scanned.length >= scenario.boxes.length) return;
    setBusy(true);
    setError(null);
    beep();
    post({ op: "scan" });
    const step = scanned.length;
    const result = await simulateDeliveryStepAction({ scenarioId: scenario.id, step });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    saleRef.current = result.data.prescriptionId;
    setSaleId(result.data.prescriptionId);
    setScanned((list) => [...list, result.data.drugName]);
    if (result.data.done) {
      // Comme le poste : on redemande l'avis jusqu'à ce que l'analyse soit faite (elle attend le calme après le dernier bip).
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await wait(attempt === 0 ? 1300 : 1000);
        const notice = await demoCounterNoticeAction({ prescriptionId: result.data.prescriptionId });
        if (!notice.ok) {
          setError(notice.error);
          break;
        }
        if (notice.data.ready) {
          show(notice.data.entry);
          break;
        }
      }
    }
    setBusy(false);
  };

  /** Le produit conseillé, bipé : comme au comptoir, le bip le déclare « Vendu » dans l'île. */
  const sell = async (recommendationId: string) => {
    if (busy || closed || !saleId) return;
    setBusy(true);
    setError(null);
    beep();
    const result = await demoCounterSellAction({ prescriptionId: saleId, recommendationId });
    if (result.ok) {
      show(result.data.entry);
      setSold((list) => [...list, result.data.name]);
    } else setError(result.error);
    setBusy(false);
  };

  const advised = (entry?.items ?? []).filter((item) => item.id);
  const remaining = scenario.boxes.length - scanned.length;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#D9E1E8] font-sans text-[#22313F]">
      {/* Le logiciel de gestion de l'officine : un décor, pas une copie d'un logiciel existant. */}
      <div className="flex h-9 shrink-0 items-center gap-5 bg-[#1D4F7A] px-4 text-[12.5px] text-white/90">
        <span className="font-bold tracking-wide">Logiciel de gestion officinal</span>
        {["Délivrance", "Stock", "Commandes", "Patients", "Facturation", "Statistiques"].map((tab, index) => (
          <span key={tab} className={cn("px-1", index === 0 && "border-b-2 border-white font-semibold text-white")}>{tab}</span>
        ))}
        <span className="ml-auto text-white/70">{pharmacyName} · Comptoir 1</span>
      </div>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#B9C6D2] bg-[#EEF2F6] px-4 text-[12px]">
        {["Nouvelle vente", "Ordonnance", "Vente libre", "Tiers payant", "Avance"].map((label, index) => (
          <span key={label} className={cn("rounded border px-2.5 py-1", index === 1 ? "border-[#1D4F7A] bg-white font-semibold text-[#1D4F7A]" : "border-[#C5D0DA] bg-[#F7F9FB] text-[#4A5A68]")}>{label}</span>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_260px] gap-3 p-3">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid grid-cols-4 gap-3 rounded-md border border-[#C5D0DA] bg-white p-3 text-[12px]">
            {[["Client", "Client comptoir"], ["Carte Vitale", "Non lue"], ["Prescripteur", "—"], ["Date", new Date().toLocaleDateString("fr-FR")]].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10.5px] tracking-wide text-[#6B7C8B] uppercase">{label}</p>
                <p className="mt-0.5 font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[#C5D0DA] bg-white">
            <div className="grid grid-cols-[40px_1fr_70px_110px] border-b border-[#C5D0DA] bg-[#E6ECF2] px-3 py-2 text-[11px] font-semibold tracking-wide text-[#4A5A68] uppercase">
              <span>N°</span>
              <span>Désignation</span>
              <span>Qté</span>
              <span>État</span>
            </div>
            <ul>
              {scanned.map((name, index) => (
                <li key={`${name}-${index}`} className="grid animate-[pb-row_400ms_ease-out] grid-cols-[40px_1fr_70px_110px] items-center border-b border-[#EEF2F6] px-3 py-2 text-[13px] odd:bg-[#F9FBFC]">
                  <span className="text-[#6B7C8B] tabular-nums">{index + 1}</span>
                  <span className="truncate font-medium">{name}</span>
                  <span className="tabular-nums">1</span>
                  <span className="inline-flex items-center gap-1 text-[12px] text-[#1F7A4D]"><Check className="size-3.5" aria-hidden="true" /> Scanné</span>
                </li>
              ))}
              {sold.map((name, index) => (
                <li key={`vendu-${name}-${index}`} className="grid animate-[pb-row_400ms_ease-out] grid-cols-[40px_1fr_70px_110px] items-center border-b border-[#EEF2F6] bg-[#F3FBE0] px-3 py-2 text-[13px]">
                  <span className="text-[#6B7C8B] tabular-nums">{scanned.length + index + 1}</span>
                  <span className="truncate font-medium">{name}</span>
                  <span className="tabular-nums">1</span>
                  <span className="text-[12px] font-semibold text-[#1F7A4D]">Conseil vendu</span>
                </li>
              ))}
              {scanned.length === 0 && <li className="px-3 py-6 text-[13px] text-[#6B7C8B]">En attente du scan des boîtes…</li>}
            </ul>
          </div>
        </div>
        <div className="space-y-3 text-[12px]">
          <div className="rounded-md border border-[#C5D0DA] bg-white p-3">
            <p className="text-[10.5px] tracking-wide text-[#6B7C8B] uppercase">Lignes</p>
            <p className="mt-1 text-[26px] leading-none font-bold tabular-nums">{scanned.length + sold.length}</p>
          </div>
          {/* Le bouton de fin de vente du logiciel (fondateur, 28 oct. 2026) : comme au comptoir, valider la vente dans le
              logiciel termine la vente PharmaBoost, sans appuyer sur « Terminer » dans la bannière. */}
          <button
            type="button"
            data-demo-fin=""
            onClick={() => saleId && !closed && void finish(saleId)}
            disabled={!saleId || closed || busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-md border-2 border-[#1F7A4D] bg-[#2E9B5F] text-[15px] font-bold tracking-wide text-white shadow-sm transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:border-[#B9C6D2] disabled:bg-[#DCE4EA] disabled:text-[#8797A5]"
          >
            <Check className="size-5" strokeWidth={3} aria-hidden="true" />
            FIN · Valider
          </button>
          <div className="space-y-1.5 rounded-md border border-[#C5D0DA] bg-white p-3">
            {["Facturer", "Mettre en attente", "Imprimer"].map((label) => (
              <div key={label} className="rounded border border-[#C5D0DA] bg-[#F7F9FB] px-2.5 py-1.5 text-[#4A5A68]">{label}</div>
            ))}
          </div>
        </div>
      </div>

      {/* La douchette : les boîtes du patient, à biper dans l'ordre. */}
      <div className="shrink-0 border-t border-[#B9C6D2] bg-[#F3F6F9] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <ScanLine className="size-5 text-[#1D4F7A]" aria-hidden="true" />
          <label className="flex items-center gap-2 text-[13px]">
            <span className="font-semibold">Ordonnance :</span>
            <select value={scenarioId} onChange={(event) => reset(event.target.value)} disabled={busy} className="h-8 rounded-md border border-[#C5D0DA] bg-white px-2 text-[13px]">
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </label>
          <span className="text-[12.5px] text-[#6B7C8B]">{scenario.situation}</span>
          {error && <span role="alert" className="text-[12.5px] font-medium text-[#B42318]">{error}</span>}
        </div>
        <ul className="mt-3 flex flex-wrap gap-3" aria-label="Boîtes à biper">
          {scenario.boxes.map((box, index) => {
            const done = index < scanned.length;
            const next = index === scanned.length && !closed;
            return (
              <li key={`${box}-${index}`}>
                <button
                  type="button"
                  onClick={scan}
                  disabled={!next || busy}
                  data-boite={index}
                  className={cn(
                    "relative flex h-[74px] w-[190px] flex-col justify-between overflow-hidden rounded-lg border bg-white px-3 py-2 text-left shadow-sm transition",
                    done && "border-[#9FD3B7] opacity-60",
                    next && "border-[#1D4F7A] ring-4 ring-[#1D4F7A]/20 hover:-translate-y-0.5 hover:shadow-md",
                    !done && !next && "border-[#C5D0DA] opacity-70",
                  )}
                >
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-[#1D4F7A]" aria-hidden="true" />
                  <span className="line-clamp-2 pl-1.5 text-[12.5px] leading-4 font-semibold">{box}</span>
                  <span className={cn("pl-1.5 text-[11.5px]", done ? "text-[#1F7A4D]" : next ? "font-semibold text-[#1D4F7A]" : "text-[#6B7C8B]")}>
                    {done ? "✓ Bipée" : next ? (busy ? "Bip…" : "Cliquer pour biper") : "Ensuite"}
                  </span>
                </button>
              </li>
            );
          })}
          <li className="flex items-center gap-2 pl-2">
            <button type="button" onClick={() => reset()} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#C5D0DA] bg-white px-3 text-[13px] font-medium hover:bg-[#EEF2F6]">
              <RotateCcw className="size-3.5" aria-hidden="true" /> Client suivant
            </button>
            <Link href="/demo" className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] text-[#4A5A68] hover:bg-[#EEF2F6]">
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Quitter
            </Link>
          </li>
        </ul>
        {advised.length > 0 && !closed && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="w-full text-[12.5px] font-semibold text-[#1F5E3F]">Le patient prend le conseil ? Bipez le produit, il passe « Vendu » :</span>
            {advised.map((item) => {
              const isSold = item.outcome === "SOLD";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => sell(item.id)}
                  disabled={busy || isSold}
                  data-conseil={item.id}
                  className={cn("relative flex h-[60px] w-[210px] flex-col justify-between overflow-hidden rounded-lg border bg-white px-3 py-1.5 text-left shadow-sm transition", isSold ? "border-[#9FD3B7] opacity-70" : "border-[#1F8A5B] hover:-translate-y-0.5 hover:shadow-md")}
                >
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-[#1F8A5B]" aria-hidden="true" />
                  <span className="truncate pl-1.5 text-[12.5px] font-semibold">{item.name}</span>
                  <span className={cn("pl-1.5 text-[11.5px]", isSold ? "text-[#1F7A4D]" : "font-semibold text-[#1F8A5B]")}>{isSold ? "✓ Vendu" : `${item.price ? `${item.price} · ` : ""}Cliquer pour biper`}</span>
                </button>
              );
            })}
          </div>
        )}
        {remaining === 0 && !closed && !busy && saleId && advised.length === 0 && <p className="mt-2 text-[12.5px] text-[#4A5A68]">Toutes les boîtes sont passées : la suite se joue dans PharmaBoost, en haut de l&apos;écran.</p>}
      </div>

      {/* La vraie île du poste de caisse, à la taille de sa fenêtre Windows, posée en haut au centre. */}
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2" style={{ top: ISLAND_WINDOW.top, width: ISLAND_WINDOW.width, height: ISLAND_WINDOW.height }}>
        <iframe ref={frame} src="/poste/ile?tous-les-conseils=1" title="PharmaBoost au comptoir" className="pointer-events-auto absolute inset-0 size-full border-0" style={{ background: "transparent", colorScheme: "normal", clipPath: clipOf(rects) }} />
      </div>

      {/* Pendant ce temps, chez le patient : le bilan arrive dans sa boîte mail. */}
      {bilan && mail === "notice" && (
        <button type="button" onClick={() => setMail("open")} className="absolute right-5 bottom-[150px] flex w-[340px] animate-[pb-slide_500ms_ease-out] items-start gap-3 rounded-2xl border border-black/5 bg-white/95 p-3.5 text-left shadow-2xl backdrop-blur">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0F2F2A] text-[#E8FF9C]"><Mail className="size-5" aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="block text-[11.5px] text-[#6B7C8B]">Boîte mail du patient · maintenant</span>
            <span className="block truncate text-[13.5px] font-semibold">{bilan.from}</span>
            <span className="block truncate text-[13px]">{bilan.subject}</span>
            <span className="mt-1 block text-[12px] font-semibold text-[#1F8A5B]">Ouvrir le bilan →</span>
          </span>
        </button>
      )}
      {bilan && mail === "open" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0B1A17]/55 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Le bilan reçu par le patient">
          <div className="flex h-full max-h-[880px] w-full max-w-[460px] flex-col overflow-hidden rounded-[34px] border-[10px] border-[#111] bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-[#E5E9ED] px-4 py-3">
              <Inbox className="size-4 text-[#6B7C8B]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{bilan.subject}</p>
                <p className="truncate text-[11.5px] text-[#6B7C8B]">{bilan.from} · à {bilan.to}</p>
              </div>
              <button type="button" onClick={() => setMail("hidden")} aria-label="Fermer" className="rounded-full p-1.5 hover:bg-[#EEF2F6]"><X className="size-4" aria-hidden="true" /></button>
            </div>
            <iframe title="Bilan du patient" srcDoc={bilan.html} sandbox="" className="min-h-0 w-full flex-1 border-0" />
          </div>
        </div>
      )}

      <style>{`@keyframes pb-row{from{opacity:0;transform:translateY(-4px);background:#E8FF9C}to{opacity:1;transform:none}}@keyframes pb-slide{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
