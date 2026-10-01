"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Barcode, Bell, Check, Mail, QrCode, ShieldCheck, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * La chaîne « bip → conseil → vente → tableau de bord ». Quatre temps qui
 * s'enchaînent seuls, et que l'on peut cliquer : l'image de droite montre le
 * temps choisi. Les montants sont ceux d'un exemple, et c'est écrit.
 */
const FRAMES = [
  { key: "bip", icon: Barcode, title: "La boîte est bipée", why: "Dans votre logiciel, comme d'habitude." },
  { key: "conseil", icon: ShieldCheck, title: "Le conseil s'affiche", why: "Vérifié, et pris dans votre rayon." },
  { key: "vente", icon: ShoppingBag, title: "Le patient dit oui", why: "Le pharmacien l'ajoute à la délivrance. Ou pas." },
  { key: "suivi", icon: Mail, title: "Le patient reçoit son plan", why: "Par e-mail ou QR code : les prises, les rappels, un signe le dernier jour." },
] as const;

const STEP_MS = 3000;
const MANUAL_PAUSE_TICKS = 4;
const SALE = "14,90 €";
const MARGIN = "5,60 €";

export function ProofStory() {
  const [tick, setTick] = useState(0);
  // Un clic fige l'image choisie pendant quelques tours, puis le défilement reprend.
  const [manual, setManual] = useState<{ frame: number; untilTick: number } | null>(null);
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), STEP_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const auto = tick % FRAMES.length;
  const manualActive = manual !== null && tick < manual.untilTick;
  const frame = manualActive ? manual.frame : auto;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
      <ol className="space-y-2" aria-label="La chaîne, du bip au patient">
        {FRAMES.map((item, index) => {
          const active = index === frame;
          const done = index < frame;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setManual({ frame: index, untilTick: tick + MANUAL_PAUSE_TICKS })}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition-all duration-500",
                  active ? "border-accent-400/80 bg-white/10" : done ? "border-white/10 bg-white/5 opacity-75 hover:opacity-100" : "border-white/10 opacity-50 hover:opacity-100",
                )}
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-500", active ? "bg-accent-400 text-brand-950" : "bg-white/10 text-white")}>
                  {done ? <Check className="size-5" strokeWidth={3} /> : <item.icon className="size-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-white">{index + 1}. {item.title}</span>
                  {active && <span className="block text-[13px] leading-5 text-brand-100">{item.why}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="relative min-h-[300px] overflow-hidden rounded-3xl bg-white p-5 text-ink-900 shadow-2xl" aria-live="polite">
        <div key={frame} className="animate-[fadein_.5s_ease]">
          {frame === 0 && <FrameBip />}
          {frame === 1 && <FrameConseil />}
          {frame === 2 && <FrameVente />}
          {frame === 3 && <FrameSuivi />}
        </div>
        <p className="absolute right-4 bottom-3 text-[11px] text-ink-400">exemple</p>
        <style>{`@keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
      </div>
    </div>
  );
}

/** 1 — l'écran du logiciel de gestion : une ligne vient d'être bipée. */
function FrameBip() {
  return (
    <div>
      <Screen title="Votre logiciel de gestion — Vente">
        <Row text="AMOXICILLINE 1 g cp · 1 boîte" tag="bip" highlight />
        <Row text="DOLIPRANE 1000 mg cp · 1 boîte" tag="bip" />
        <div className="h-10 rounded-md border border-dashed border-ink-200" />
      </Screen>
      <Legend icon={Barcode} text="Le code de la boîte part vers PharmaBoost. Rien d'autre." />
    </div>
  );
}

/** 2 — l'avis en coin d'écran, par-dessus le logiciel. */
function FrameConseil() {
  return (
    <div>
      <Screen title="Votre logiciel de gestion — Vente" dim>
        <Row text="AMOXICILLINE 1 g cp · 1 boîte" tag="bip" />
        <Row text="DOLIPRANE 1000 mg cp · 1 boîte" tag="bip" />
      </Screen>
      <div className="relative -mt-6 ml-auto w-[88%] rounded-xl bg-[#18211f] p-3.5 text-white shadow-xl">
        <p className="text-[11px] font-semibold text-brand-300">PharmaBoost · ORD-0042</p>
        <p className="mt-0.5 text-[13px] font-semibold">AMOXICILLINE 1 g · DOLIPRANE 1000 mg</p>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[#ffaa78]"><AlertTriangle className="size-3.5" /> Aucune interaction · ordonnance classique</p>
        <p className="mt-1.5 text-[12.5px]">• Probiotique 30 gélules · {SALE} · marge {MARGIN} · flore à protéger</p>
        <p className="text-[12.5px]">• Pastilles gorge · 5,90 € · marge 2,10 € · gorge irritée</p>
      </div>
      <Legend icon={ShieldCheck} text="Vérifié avant d'apparaître. Le pharmacien décide." />
    </div>
  );
}

/** 3 — la ligne de vente, marquée. */
function FrameVente() {
  return (
    <div>
      <Screen title="Délivrance">
        <Row text="AMOXICILLINE 1 g cp" tag="ordonnance" />
        <Row text="DOLIPRANE 1000 mg cp" tag="ordonnance" />
        <Row text={`Probiotique 30 gélules · ${SALE}`} tag="conseil PharmaBoost" accent highlight />
        <Row text="Mouchoirs · 1,20 €" tag="scanné, hors conseil" />
      </Screen>
      <Legend icon={ShoppingBag} text="Seule la ligne issue d'un conseil accepté est comptée." />
    </div>
  );
}

/** 4 — le patient a son plan : e-mail parti, rappels, dernier jour. */
function FrameSuivi() {
  return (
    <div>
      <div className="mx-auto w-[78%] rounded-[22px] border-[6px] border-ink-900 bg-white p-3 shadow-xl">
        <p className="text-[10.5px] font-semibold tracking-[0.08em] text-brand-700 uppercase">Votre plan · Pharmacie du Centre</p>
        <ul className="mt-2 space-y-1.5 text-[12px]">
          <li className="flex items-center justify-between rounded-lg bg-brand-50 px-2.5 py-1.5"><span>Matin · AMOXICILLINE 1 g</span><span className="text-ink-500">1 cp</span></li>
          <li className="flex items-center justify-between rounded-lg bg-brand-50 px-2.5 py-1.5"><span>Soir · AMOXICILLINE 1 g</span><span className="text-ink-500">1 cp</span></li>
          <li className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5"><span>Probiotique · à distance</span><span className="text-ink-500">1 gél.</span></li>
        </ul>
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10.5px]">
          <span className="flex items-center gap-1 rounded-full bg-brand-600 px-2 py-1 font-medium text-white"><Bell className="size-3" /> Rappels dans mon agenda</span>
          <span className="flex items-center gap-1 rounded-full border border-ink-200 px-2 py-1 text-ink-600"><QrCode className="size-3" /> reçu par QR code</span>
        </div>
        <p className="mt-2 text-[10.5px] text-ink-500">7 oct. — fin du traitement : comment allez-vous ?</p>
      </div>
      <Legend icon={Mail} text="Le patient sait quoi prendre, quand, et sa pharmacie reste présente." />
    </div>
  );
}

function Screen({ title, children, dim = false }: { title: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-ink-200 bg-ink-50 p-3", dim && "opacity-60")}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-500"><span className="size-2 rounded-full bg-ink-300" /><span className="size-2 rounded-full bg-ink-300" /> {title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ text, tag, highlight = false, accent = false }: { text: string; tag: string; highlight?: boolean; accent?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between rounded-md border bg-white px-3 py-2 text-[12.5px]", highlight ? "border-brand-400 ring-2 ring-brand-200" : "border-ink-200")}>
      <span className="font-mono text-ink-800">{text}</span>
      <span className={cn("ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium", accent ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500")}>{tag}</span>
    </div>
  );
}

function Legend({ icon: Icon, text }: { icon: typeof Barcode; text: string }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-ink-700"><Icon className="size-4 shrink-0 text-brand-600" /> {text}</p>
  );
}
