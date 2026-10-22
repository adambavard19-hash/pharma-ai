"use client";

import { useEffect, useState } from "react";
import { BadgePercent, Check, Eye, ScanLine, Store } from "lucide-react";
import { ean13Modules } from "@/core/patient-app/offers";
import { cn } from "@/lib/utils";

/** Un code d'exemple au bon format (préfixe 2990, clé juste) : jamais un code réel. */
const CODE = "2990000012340";

const STAGES = [
  { icon: Eye, label: "Votre offre, vue dans l'appli" },
  { icon: ScanLine, label: "Le patient ouvre son code" },
  { icon: Store, label: "Scannée en pharmacie PharmaBoost" },
] as const;

/**
 * Le parcours d'une offre de laboratoire, joué en boucle : publiée dans l'appli, ouverte par un patient, scannée au comptoir
 * d'une pharmacie PharmaBoost. Marque d'exemple (« Votre marque »), aucun chiffre réel. Immobile si le visiteur réduit les
 * animations.
 */
export function PartnerOfferAnimation() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setStage((s) => (s + 1) % STAGES.length), 2200);
    return () => window.clearInterval(id);
  }, []);
  const modules = ean13Modules(CODE);
  return (
    <div className="relative mx-auto w-full max-w-[520px]" aria-hidden="true">
      <div className="absolute -inset-10 -z-10 bg-[radial-gradient(55%_55%_at_55%_45%,var(--color-brand-100),transparent_72%)]" />
      <div className="grid grid-cols-[1fr_auto] items-center gap-5">
        <div className="mx-auto w-[230px] rounded-[38px] border border-black/10 bg-[#0B0F14] p-2 shadow-[0_40px_90px_-40px_rgba(15,23,42,0.6)]">
          <div className="h-[400px] overflow-hidden rounded-[31px] bg-[#F4F7F6] px-3.5 pt-5">
            <p className="text-[10.5px] font-semibold tracking-[0.08em] text-[#0E8A7B] uppercase">Offres</p>
            <div className={cn("mt-2 rounded-2xl bg-white p-3.5 shadow-sm transition-all duration-500", stage === 0 ? "translate-y-0 opacity-100 ring-2 ring-[#0E8A7B]/40" : "opacity-100")}>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E8FF9C] px-2 py-0.5 text-[10px] font-bold text-[#3D4F00]">
                <BadgePercent className="size-3" /> Votre marque
              </span>
              <p className="mt-1.5 text-[24px] leading-7 font-extrabold text-[#0F2B26]">-20 %</p>
              <p className="text-[12px] font-semibold text-[#0F2B26]">Sur votre gamme</p>
              <div className={cn("grid transition-all duration-500", stage >= 1 ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                  <svg viewBox="0 0 95 30" preserveAspectRatio="none" className="h-12 w-full">
                    {modules.split("").map((bit, x) => (bit === "1" ? <rect key={x} x={x} y={0} width={1} height={30} fill="#0F2B26" /> : null))}
                  </svg>
                  <p className="mt-1 text-center font-mono text-[10px] tracking-[0.16em] text-[#475569]">2990 0000 1234 0</p>
                </div>
              </div>
            </div>
            <div className={cn("mt-3 flex items-center gap-2 rounded-2xl bg-[#0E8A7B] px-3.5 py-3 text-white transition-all duration-500", stage === 2 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>
              <Check className="size-5 shrink-0" />
              <span className="text-[12.5px] leading-4 font-semibold">Offre utilisée en pharmacie PharmaBoost</span>
            </div>
            <div className="mt-3 space-y-2 opacity-60">
              <div className="h-14 rounded-2xl bg-white" />
              <div className="h-14 rounded-2xl bg-white" />
            </div>
          </div>
        </div>
        <ol className="hidden w-[190px] space-y-2.5 sm:block">
          {STAGES.map((s, i) => (
            <li key={s.label} className={cn("flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-[13px] leading-4 font-semibold transition-all duration-500", i === stage ? "border-brand-400 bg-surface-card text-text-primary shadow-md" : "border-border-subtle bg-surface-app/70 text-text-tertiary")}>
              <s.icon className={cn("size-4 shrink-0", i === stage ? "text-brand-600" : "")} />
              {s.label}
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-4 text-center text-[13px] font-semibold text-brand-700 sm:hidden">{STAGES[stage].label}</p>
    </div>
  );
}
