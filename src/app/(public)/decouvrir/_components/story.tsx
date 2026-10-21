"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ScanLine, Sparkles } from "lucide-react";
import { Robot } from "@/components/robot/robot";
import { cn } from "@/lib/utils";

/**
 * Les animations du fil de l'accueil (fondateur, 20 oct. 2026 : « pas trop de texte, des animations ») : la charge du
 * pharmacien au comptoir, le chemin scan → conseils → associations, le choix du produit (stock, laboratoire, date courte,
 * challenge). Chacune se joue quand elle entre à l'écran, une fois. Sans mouvement si le système le demande.
 */

/** Vrai dès que l'élément entre à l'écran (une fois). */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setSeen(true), 0);
      return () => window.clearTimeout(id);
    }
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && (setSeen(true), observer.disconnect()), { threshold: 0.3 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, seen] as const;
}

const step = (seen: boolean, index: number, gap = 280) => ({
  className: cn("transition-all duration-700 ease-out motion-reduce:transition-none", seen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100"),
  style: { transitionDelay: seen ? `${index * gap}ms` : "0ms" },
});

/** Le texte et le visuel d'une section qui montent doucement à l'arrivée. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const s = step(seen, delay, 150);
  return (
    <div ref={ref} className={cn(s.className, className)} style={s.style}>
      {children}
    </div>
  );
}

/** Ce que le pharmacien doit avoir en tête à chaque patient : les pensées s'empilent, puis le robot les prend en charge. */
const LOAD = ["Ordonnance de 6 lignes", "Patient pressé", "File d'attente", "Posologie à rappeler", "Date courte en réserve", "Challenge du laboratoire", "Le bon conseil ?", "Quel produit en stock ?"];

export function LoadVisual() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const relief = LOAD.length;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[520px] rounded-[28px] border border-border-subtle bg-surface-card p-6 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.45)] sm:p-8" aria-hidden="true">
      <div className="flex flex-wrap gap-2">
        {LOAD.map((label, index) => (
          <span
            key={label}
            {...step(seen, index, 220)}
            className={cn(step(seen, index, 220).className, "rounded-full border border-warning-200 bg-warning-50 px-3.5 py-2 text-[13.5px] font-semibold text-warning-900")}
          >
            {label}
          </span>
        ))}
      </div>
      <div {...step(seen, relief + 1, 220)} className={cn(step(seen, relief + 1, 220).className, "mt-6 flex items-center gap-4 rounded-2xl bg-[#0F2F2A] p-4 text-white")}>
        <Robot size={52} mood="happy" label="Le robot PharmaBoost" />
        <div>
          <p className="text-[16px] font-bold">PharmaBoost y pense pour vous.</p>
          <p className="mt-0.5 text-[13.5px] text-[#BFD9D0]">Au scan, le bon conseil, pris dans votre rayon.</p>
        </div>
      </div>
    </div>
  );
}

/** Scan → conseils → associations, en trois cartes qui s'allument l'une après l'autre. */
export function FlowSteps() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const steps = [
    { icon: <ScanLine className="size-5" />, title: "Le scan", text: "Vous scannez la boîte, comme d'habitude." },
    { icon: <Sparkles className="size-5" />, title: "Un ou plusieurs conseils", text: "Chaque médicament appelle le conseil qui l'accompagne." },
    { icon: <Check className="size-5" />, title: "Les associations", text: "Un conseil en appelle un autre, même sans ordonnance." },
  ];
  return (
    <div ref={ref} className="mt-10 grid gap-4 md:grid-cols-3">
      {steps.map((s, index) => (
        <div key={s.title} {...step(seen, index, 350)} className={cn(step(seen, index, 350).className, "relative rounded-[24px] border border-border-subtle bg-surface-card p-6")}>
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-[#0796b4] text-white">{s.icon}</span>
          <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-text-tertiary uppercase">Étape {index + 1}</p>
          <p className="mt-1 text-[19px] font-bold tracking-[-0.02em] text-text-primary">{s.title}</p>
          <p className="mt-1.5 text-[14.5px] leading-6 text-text-secondary">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Le choix du produit : deux produits répondent au même besoin ; les critères s'allument et celui de la pharmacie passe devant.
 * Dans l'ordre du départage du moteur (stock, puis laboratoire préféré, date courte, challenge), jamais devant le besoin du patient.
 */
const CRITERIA = ["En stock", "Votre laboratoire préféré", "Date courte à écouler", "Challenge en cours"];

export function ChoiceVisual() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (!seen || lit >= CRITERIA.length) return;
    const id = window.setTimeout(() => setLit((n) => n + 1), lit === 0 ? 600 : 650);
    return () => window.clearTimeout(id);
  }, [seen, lit]);
  const picked = lit >= CRITERIA.length;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[520px] rounded-[28px] border border-border-subtle bg-surface-card p-6 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.45)] sm:p-8" aria-hidden="true">
      <p className="flex items-center gap-2 font-mono text-[12px] text-text-secondary">
        <ScanLine className="size-4 text-brand-600" /> Scan · AMOXICILLINE
        <span className="ml-auto font-mono text-[10.5px] tracking-[0.12em] text-text-tertiary uppercase">Exemple</span>
      </p>
      <p className="mt-4 text-[13px] text-text-secondary">Deux ferments lactiques répondent au besoin du patient :</p>
      <div className="mt-3 space-y-2.5">
        {[
          { name: "Ferments lactiques · Laboratoire A", win: true },
          { name: "Ferments lactiques · Laboratoire B", win: false },
        ].map((product) => (
          <div
            key={product.name}
            className={cn(
              "rounded-2xl border p-4 transition-all duration-500",
              product.win && picked ? "border-brand-500 bg-brand-50 shadow-[0_16px_40px_-24px_rgba(36,112,97,0.8)]" : "border-border-subtle bg-surface-app",
              !product.win && picked && "opacity-50",
            )}
          >
            <p className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
              {product.name}
              {product.win && picked && <span className="ml-auto rounded-full bg-brand-600 px-2.5 py-0.5 text-[11.5px] font-bold text-white">Proposé en premier</span>}
            </p>
            {product.win && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {CRITERIA.map((label, index) => (
                  <span key={label} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-all duration-300", index < lit ? "bg-[#E8FF9C] text-[#3D4F00]" : "bg-surface-sunken text-text-tertiary")}>
                    {index < lit && <Check className="size-3" />}
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
