"use client";

import { Check } from "lucide-react";
import { DRUG_ROUTES, DRUG_ROUTE_LABELS, type DrugRoute } from "@/core/associations/routes";

/**
 * « Pour quelle forme du médicament ? » (fondateur, 10 nov. 2026) : un IPP ne suit un anti-inflammatoire que s'il est à
 * avaler — pas un gel, une crème ou un patch. Rien de coché : toutes les formes.
 */
export function RoutePicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (route: DrugRoute) => onChange(value.includes(route) ? value.filter((known) => known !== route) : DRUG_ROUTES.filter((known) => known === route || value.includes(known)));
  return (
    <fieldset className="space-y-2" data-route-picker="">
      <legend className="text-[13.5px] font-semibold text-text-primary">Forme du médicament</legend>
      <p className="text-[12.5px] text-text-tertiary">
        {value.length === 0
          ? "Toutes les formes déclenchent l'association. Cochez pour la limiter : par exemple « À avaler » pour un protecteur de l'estomac sous anti-inflammatoire."
          : "Seules les boîtes de ces formes déclenchent l'association. Un médicament dont la forme est inconnue ne la déclenche pas."}
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {DRUG_ROUTES.map((route) => {
          const checked = value.includes(route);
          return (
            <label
              key={route}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-[13px] transition-colors ${checked ? "border-brand-400 bg-brand-50/70 dark:border-brand-600 dark:bg-brand-950/30" : "border-border-subtle hover:bg-surface-sunken"}`}
            >
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(route)} />
              <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-brand-600 bg-brand-600 text-white" : "border-border-strong bg-surface-card"}`} aria-hidden>
                {checked && <Check className="size-3" />}
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-text-primary">{DRUG_ROUTE_LABELS[route].title}</span>
                <span className="block text-[12px] text-text-tertiary">{DRUG_ROUTE_LABELS[route].examples}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
