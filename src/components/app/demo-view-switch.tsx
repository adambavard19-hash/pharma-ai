"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, RotateCcw, Stethoscope } from "lucide-react";
import { setDemoViewAction } from "@/server/actions/demo-view";
import { resetDemoAction } from "@/server/actions/demo";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * « Espace titulaire / Espace pharmacien » (fondateur, 29 oct. 2026 : « pendant la vidéo de démonstration, montrer ce que verra
 * le pharmacien, pas seulement le titulaire »). Seulement sur le compte de démonstration.
 */
export function DemoViewSwitch({ view }: { view: "titulaire" | "pharmacien" }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  // Avant une vidéo : l'officine de démonstration repart de zéro, son historique recalé sur la date du jour.
  const reset = () =>
    start(async () => {
      setConfirming(false);
      const result = await resetDemoAction();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Démonstration remise à zéro.") : result.error });
      router.refresh();
    });
  const choose = (next: "titulaire" | "pharmacien") =>
    start(async () => {
      if (next === view) return;
      await setDemoViewAction(next);
      router.push("/");
      router.refresh();
    });
  return (
    <div className="mx-auto flex max-w-[1400px] items-center justify-center px-4 pt-2 lg:px-10" data-demo-espace={view}>
      <div role="tablist" aria-label="Espace montré dans la démonstration" className={cn("inline-flex items-center gap-1 rounded-full bg-white/80 p-1 shadow-[0_8px_24px_-14px_rgba(15,43,38,.5)] ring-1 ring-[#0E7C5A]/20 backdrop-blur", pending && "opacity-70")}>
        <span className="px-2.5 text-[11px] font-bold tracking-[0.12em] text-[#0E7C5A] uppercase">Démo</span>
        {([
          ["titulaire", "Espace titulaire", Crown],
          ["pharmacien", "Espace pharmacien", Stethoscope],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            disabled={pending}
            onClick={() => choose(key)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors", view === key ? "bg-[#0E7C5A] text-white" : "text-[#0F2F2A] hover:bg-[#0E7C5A]/10")}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-[#0E7C5A]/20" />
        {view === "titulaire" &&
          (confirming ? (
            <span className="flex items-center gap-1 pr-1 text-[12px] text-[#0F2F2A]">
              Tout remettre à zéro ?
              <button type="button" disabled={pending} onClick={reset} className="h-7 rounded-full bg-[#0E7C5A] px-3 text-[12px] font-semibold text-white">Oui</button>
              <button type="button" onClick={() => setConfirming(false)} className="h-7 rounded-full px-2 text-[12px] font-semibold text-[#4D6B64]">Non</button>
            </span>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirming(true)} title="Remettre la démonstration à zéro, avant une vidéo" className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-[#4D6B64] hover:bg-[#0E7C5A]/10 hover:text-[#0F2F2A]">
              <RotateCcw className="size-3.5" aria-hidden="true" /> {pending ? "Un instant…" : "Remettre à zéro"}
            </button>
          ))}
      </div>
    </div>
  );
}
