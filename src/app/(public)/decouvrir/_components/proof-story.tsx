"use client";

import { useEffect, useState } from "react";
import { Barcode, BadgeEuro, Check, LineChart, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * La chaîne « bip → conseil → vente → tableau de bord », animée. Quatre temps
 * qui s'enchaînent tout seuls ; le compteur du tableau de bord monte à chaque
 * tour. Les montants sont ceux d'un exemple, et c'est écrit.
 */
const FRAMES = [
  { key: "bip", icon: Barcode, title: "La boîte est bipée", caption: "AMOXICILLINE 1 g · dans votre logiciel, comme d'habitude" },
  { key: "conseil", icon: Check, title: "Le conseil s'affiche, vérifié", caption: "Probiotique 30 gélules · 14,90 € · marge 5,60 €" },
  { key: "vente", icon: ShoppingBag, title: "Le patient dit oui, c'est encaissé", caption: "La ligne porte la mention « conseil PharmaBoost »" },
  { key: "tableau", icon: LineChart, title: "Le tableau de bord compte, à l'euro près", caption: "Vente par vente, collaborateur par collaborateur" },
] as const;

const STEP_MS = 2600;
const SALE_EUROS = 14.9;
const MARGIN_EUROS = 5.6;

export function ProofStory() {
  // Un seul compteur de temps : l'image courante et le nombre de tours en
  // découlent. Le mouvement est réduit si le visiteur l'a demandé.
  const [tick, setTick] = useState(0);
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), STEP_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const frame = tick % FRAMES.length;
  const rounds = Math.floor(tick / FRAMES.length);
  const completedSales = rounds + (frame === 3 ? 1 : 0);
  const fmt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <ol className="space-y-2" aria-label="La chaîne, du bip au tableau de bord">
        {FRAMES.map((item, index) => {
          const active = reduced || index === frame;
          const done = !reduced && index < frame;
          return (
            <li
              key={item.key}
              className={cn(
                "flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-all duration-500",
                active ? "border-accent-400/70 bg-white/10 scale-[1.01]" : done ? "border-white/10 bg-white/5 opacity-70" : "border-white/10 bg-transparent opacity-45",
              )}
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-500", active ? "bg-accent-400 text-brand-950" : "bg-white/10 text-white")}>
                {done ? <Check className="size-5" strokeWidth={3} /> : <item.icon className="size-5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-white">{index + 1}. {item.title}</span>
                <span className="block truncate text-[13px] text-brand-100">{item.caption}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="rounded-3xl border border-white/10 bg-white p-5 text-ink-900 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold tracking-[0.08em] text-ink-500 uppercase">Tableau de bord · exemple</p>
          <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11.5px] font-medium text-success-700">constaté, pas estimé</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Tile label="Conseils acceptés" value={String(completedSales)} pulse={frame === 3} />
          <Tile label="Ventes additionnelles" value={fmt(completedSales * SALE_EUROS)} pulse={frame === 3} />
          <Tile label="Marge additionnelle" value={fmt(completedSales * MARGIN_EUROS)} pulse={frame === 3} accent />
          <Tile label="Taux d'acceptation" value={completedSales > 0 ? "71 %" : "—"} />
        </dl>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${Math.min(100, completedSales * 12)}%` }} />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-500"><BadgeEuro className="size-3.5" /> Abonnement couvert dès {Math.ceil(69 / MARGIN_EUROS)} conseils acceptés, dans cet exemple.</p>
      </div>
    </div>
  );
}

function Tile({ label, value, pulse = false, accent = false }: { label: string; value: string; pulse?: boolean; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl px-3.5 py-3 transition-colors duration-500", accent ? "bg-brand-50" : "bg-ink-50", pulse && "ring-2 ring-accent-400")}>
      <dt className="text-[11.5px] text-ink-500">{label}</dt>
      <dd className={cn("mt-0.5 text-[22px] font-semibold tabular", accent ? "text-brand-800" : "text-ink-900")}>{value}</dd>
    </div>
  );
}
