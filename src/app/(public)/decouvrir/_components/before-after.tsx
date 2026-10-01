"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Une scène « sans / avec » : le même décor, deux états. L'interrupteur se
 * clique ; sans clic, il bascule seul toutes les quatre secondes. C'est le
 * moyen le plus court de faire voir un problème et sa réponse.
 */
export function BeforeAfter({ before, after, beforeLabel = "Sans PharmaBoost", afterLabel = "Avec PharmaBoost" }: { before: ReactNode; after: ReactNode; beforeLabel?: string; afterLabel?: string }) {
  const [tick, setTick] = useState(0);
  const [manual, setManual] = useState<{ on: boolean; untilTick: number } | null>(null);
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, [reduced]);

  const on = manual && tick < manual.untilTick ? manual.on : reduced ? true : tick % 2 === 1;

  return (
    <div className="rounded-3xl border border-border-subtle bg-surface-card p-4 sm:p-5">
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-border-subtle bg-surface-sunken p-1" role="group" aria-label="Sans ou avec PharmaBoost">
          {[false, true].map((state) => (
            <button
              key={String(state)}
              type="button"
              aria-pressed={on === state}
              onClick={() => setManual({ on: state, untilTick: tick + 3 })}
              className={cn("rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors", on === state ? (state ? "bg-brand-600 text-white" : "bg-ink-700 text-white") : "text-text-secondary hover:text-text-primary")}
            >
              {state ? afterLabel : beforeLabel}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-4 min-h-[260px]">
        <div key={String(on)} className="animate-[fadein_.45s_ease]">{on ? after : before}</div>
        <style>{`@keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
      </div>
    </div>
  );
}
