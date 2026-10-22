"use client";

import { useEffect, useState } from "react";
import { Check, Search, Store } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * L'image de l'accueil Partenaires, refaite le 22 oct. 2026 (« on ne comprend rien ») : l'appli PharmaBoost, avec un
 * emplacement en pointillés « Votre marque ici ». Il montre tour à tour la marque puis son offre. Rien d'autre à lire.
 * Immobile si le visiteur réduit les animations.
 */
export function PartnerOfferAnimation() {
  const [offer, setOffer] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setOffer((o) => !o), 2600);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="relative mx-auto w-full max-w-[340px]" aria-hidden="true">
      <div className="absolute -inset-12 -z-10 bg-[radial-gradient(55%_55%_at_50%_45%,var(--color-brand-100),transparent_72%)]" />
      <div className="mx-auto w-[260px] rounded-[40px] border border-black/10 bg-[#0B0F14] p-2 shadow-[0_40px_90px_-40px_rgba(15,23,42,0.6)]">
        <div className="h-[430px] overflow-hidden rounded-[33px] bg-[#F4F7F6] px-4 pt-6">
          <p className="text-[15px] font-bold text-[#0F2B26]">PharmaBoost</p>
          <div className="mt-3 flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-[12px] text-[#94A3B8]">
            <Search className="size-3.5" /> Rechercher un produit
          </div>
          <div className="relative mt-4 flex h-[150px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-500 bg-white text-center">
            <span className="absolute inset-0 animate-pulse rounded-2xl bg-brand-50/60" />
            <div className={cn("relative transition-all duration-500", offer ? "scale-90 opacity-0" : "scale-100 opacity-100")}>
              <p className="text-[24px] leading-7 font-extrabold tracking-[-0.02em] text-brand-700">Votre marque</p>
              <p className="mt-1 text-[13px] font-semibold text-brand-600">ici</p>
            </div>
            <div className={cn("absolute transition-all duration-500", offer ? "scale-100 opacity-100" : "scale-110 opacity-0")}>
              <p className="text-[40px] leading-none font-extrabold text-[#0F2B26]">-20 %</p>
              <p className="mt-2 text-[13px] font-semibold text-[#0F2B26]">sur votre gamme</p>
            </div>
          </div>
          <div className="mt-4 space-y-2.5 opacity-50">
            <div className="h-12 rounded-2xl bg-white" />
            <div className="h-12 rounded-2xl bg-white" />
          </div>
        </div>
      </div>
      <div className={cn("absolute -right-2 bottom-16 flex items-center gap-2 rounded-2xl bg-brand-600 px-3.5 py-2.5 text-white shadow-lg transition-all duration-500 sm:-right-10", offer ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")}>
        <Store className="size-4" />
        <span className="text-[13px] font-semibold">En pharmacie</span>
        <Check className="size-4" />
      </div>
    </div>
  );
}
