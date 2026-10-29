"use client";

import { useState, useTransition } from "react";
import { Check, Droplet, FlaskConical, Leaf } from "lucide-react";
import { ADVICE_MODULES, type AdviceModuleCode } from "@/core/ai/advice-modules";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const ICONS = { PHYTOTHERAPIE: Leaf, AROMATHERAPIE: Droplet, MEDICAMENT_CONSEIL: FlaskConical } as const;

/**
 * Le choix des modules de conseil (fondateur, 29 oct. 2026) : trois cartes à cocher, un bouton pour enregistrer. Sert au
 * titulaire (sa pharmacie) et à la console (une pharmacie choisie) : seule l'action d'enregistrement change.
 */
export function ModulePicker({
  initial,
  counts,
  onSave,
  compact = false,
}: {
  initial: AdviceModuleCode[];
  /** Le nombre de produits du stock de la pharmacie dans chaque module, quand on le connaît. */
  counts?: Partial<Record<AdviceModuleCode, number>>;
  onSave: (modules: AdviceModuleCode[]) => Promise<{ ok: boolean; message?: string; error?: string }>;
  compact?: boolean;
}) {
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(initial);
  const [chosen, setChosen] = useState(initial);
  const changed = [...chosen].sort().join() !== [...saved].sort().join();
  const toggle = (code: AdviceModuleCode) => setChosen((list) => (list.includes(code) ? list.filter((item) => item !== code) : [...list, code]));
  const save = () =>
    start(async () => {
      const result = await onSave(chosen);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré") : (result.error ?? "Enregistrement impossible") });
      if (result.ok) setSaved(chosen);
    });

  return (
    <div className={cn("flex flex-col gap-3", compact && "gap-2")}>
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-3" : "md:grid-cols-3")}>
        {ADVICE_MODULES.map((item) => {
          const Icon = ICONS[item.code];
          const on = chosen.includes(item.code);
          return (
            <button
              key={item.code}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(item.code)}
              className={cn(
                "relative flex items-start gap-3 rounded-xl border text-left transition-colors",
                compact ? "px-3 py-2" : "p-4",
                on ? "border-brand-500 bg-brand-50" : "border-border-subtle bg-surface-card hover:border-brand-300",
              )}
            >
              <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", on ? "bg-brand-600 text-white" : "bg-surface-sunken text-text-secondary", compact && "size-7")}>
                <Icon className={compact ? "size-3.5" : "size-4.5"} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-text-primary">{item.label}</span>
                {!compact && <span className="mt-0.5 block text-[12.5px] leading-5 text-text-secondary">{item.description}</span>}
                {counts && <span className="mt-1 block text-[11.5px] text-text-tertiary tabular-nums">{counts[item.code] ?? 0} produit{(counts[item.code] ?? 0) > 1 ? "s" : ""} dans le stock</span>}
              </span>
              <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-md border", on ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card")}>
                {on && <Check className="size-3.5" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={pending || !changed} onClick={save}>
          Enregistrer
        </Button>
        {!compact && <p className="text-[12.5px] text-text-tertiary">{chosen.length === 0 ? "Aucun module coché : PharmaBoost propose le meilleur produit, sans orientation." : "Au comptoir, un produit de ces modules passe devant, quand le stock en a un qui convient."}</p>}
      </div>
    </div>
  );
}
