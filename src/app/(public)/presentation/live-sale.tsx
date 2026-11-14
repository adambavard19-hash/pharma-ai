"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, RotateCcw, Check } from "lucide-react";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandAdvice } from "@/components/island/counter-island";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { ISLAND_CSS, IslandShell } from "@/components/island/island-shell";
import { LIVING_PILL_WIDTH, SCAN_CSS, SCAN_STEPS, WhitePill, WHITE_PILL_WIDTH } from "@/components/island/scan-capsule";
import { SITE_ENTRY, entryItems } from "../decouvrir/_components/banner-steps";

/**
 * La bannière d'aujourd'hui, jouée en direct sur la scène (présentation de Donna, 14 nov. 2026) : la même vente d'exemple que
 * le site (Imodium + Lactibiane, la routine peau), les mêmes composants que le poste. Petite bannière blanche au repos → scan →
 * recherche → « N conseils » → les cartes, vivantes (un toucher ouvre la fiche, « Vendu » se note). Jamais la marge : MixIsland
 * la retire elle-même.
 */
export const SALE_ITEMS: IslandAdvice[] = entryItems(SITE_ENTRY);
const COUNT = SALE_ITEMS.filter((item) => !item.sheet?.routine).length + (SALE_ITEMS.some((item) => item.sheet?.routine) ? 1 : 0);

type Phase = "idle" | "scan" | "analyse" | "found" | "cards";

export function LiveSale({ autoStart = false, onSold }: { autoStart?: boolean; onSold?: (count: number) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState(0);
  const [open, setOpen] = useState(true);
  const [outcomes, setOutcomes] = useState<(IslandOutcome | undefined)[]>([]);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  const run = () => {
    clear();
    setOutcomes([]);
    setOpen(true);
    setDone(0);
    setPhase("scan");
    at(1100, () => setPhase("analyse"));
    SCAN_STEPS.forEach((_, i) => at(1300 + i * 420, () => setDone(i + 1)));
    at(1300 + SCAN_STEPS.length * 420 + 200, () => setPhase("found"));
    at(1300 + SCAN_STEPS.length * 420 + 1700, () => setPhase("cards"));
  };

  useEffect(() => {
    if (autoStart) {
      const id = window.setTimeout(run, 700);
      return () => {
        window.clearTimeout(id);
        clear();
      };
    }
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un seul départ, au montage de la diapositive
  }, []);

  const sold = outcomes.filter((o) => o === "SOLD").length;
  // Au poste, un conseil passe « Vendu » quand sa boîte est bipée : ici, un bouton joue le bip.
  const nextToSell = SALE_ITEMS.findIndex((item, i) => !item.sheet?.routine && outcomes[i] !== "SOLD");
  const beep = () => {
    if (nextToSell < 0) return;
    setOutcomes((prev) => {
      const next = [...prev];
      next[nextToSell] = "SOLD";
      onSold?.(next.filter((o) => o === "SOLD").length);
      return next;
    });
  };

  return (
    <div className="flex w-full flex-col items-center gap-5" data-int="">
      <style>{`${ISLAND_CSS}\n${SCAN_CSS}`}</style>
      <div className="flex min-h-[64px] w-full justify-center">
        {phase !== "cards" && (
          <div className="pz-pop" style={{ zoom: 1.6 }}>
            <IslandShell width={phase === "idle" ? WHITE_PILL_WIDTH : LIVING_PILL_WIDTH} tone="accent" className="crd-white" contentKey={phase} label="La petite bannière PharmaBoost">
              <WhitePill phase={phase === "idle" ? "idle" : phase} done={done} drug="IMODIUM 2 mg gélules" total={COUNT} />
            </IslandShell>
          </div>
        )}
        {phase === "cards" && (
          <div className="pz-drop flex w-full justify-center" style={{ zoom: 1.4 }}>
            <MixIsland
              cards
              reduce="a"
              items={SALE_ITEMS}
              outcomes={outcomes}
              open={open}
              onOpen={() => setOpen(true)}
              onClose={() => setOpen(false)}
              onFinish={() => undefined}
              onAnswer={(index, outcome) =>
                setOutcomes((prev) => {
                  const next = [...prev];
                  next[index] = outcome;
                  onSold?.(next.filter((o) => o === "SOLD").length);
                  return next;
                })
              }
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {phase === "idle" && (
          <button type="button" onClick={run} className="pz-glow inline-flex h-14 items-center gap-2.5 rounded-full bg-brand-600 px-8 text-[18px] font-semibold text-white shadow-[0_18px_40px_-14px_var(--color-brand-600)] active:scale-95">
            <ScanLine className="size-5" /> Scanner une boîte
          </button>
        )}
        {phase === "cards" && nextToSell >= 0 && (
          <button type="button" onClick={beep} className="pz-glow inline-flex h-12 items-center gap-2.5 rounded-full bg-brand-600 px-6 text-[17px] font-semibold text-white shadow-lg active:scale-95">
            <ScanLine className="size-5" /> Biper {SALE_ITEMS[nextToSell].name.split(" ")[0]}
          </button>
        )}
        {phase !== "idle" && (
          <button type="button" onClick={run} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/80 bg-white/70 px-5 text-[15px] font-semibold text-text-secondary backdrop-blur-md active:scale-95">
            <RotateCcw className="size-4" /> Rejouer la vente
          </button>
        )}
        {sold > 0 && (
          <span className="pz-pop inline-flex h-11 items-center gap-2 rounded-full bg-[#E8FF9C] px-5 text-[15px] font-bold text-[#14302A]">
            <Check className="size-4" /> {sold} conseil{sold > 1 ? "s" : ""} vendu{sold > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/** La bannière en cartes, d'emblée ouverte sur la fiche (startAt) ou sur la routine. */
export function OpenCards({ startAt, panel }: { startAt?: number; panel?: "routine" }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex w-full justify-center" style={{ zoom: 1.45 }} data-int="">
      <style>{`${ISLAND_CSS}\n${SCAN_CSS}`}</style>
      <MixIsland cards reduce="a" items={SALE_ITEMS} outcomes={[]} open={open} startAt={startAt} initialPanel={panel} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} onFinish={() => undefined} onAnswer={() => undefined} />
    </div>
  );
}
