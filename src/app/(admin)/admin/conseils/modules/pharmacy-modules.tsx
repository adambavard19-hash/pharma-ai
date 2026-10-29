"use client";

import { useMemo, useState } from "react";
import type { AdviceModuleCode } from "@/core/ai/advice-modules";
import { savePharmacyModulesAction } from "@/server/actions/advice-modules";
import { ModulePicker } from "@/components/advice/module-picker";
import { Input } from "@/components/ui/field";

type Pharmacy = { id: string; name: string; city: string | null; isDemo: boolean; modules: AdviceModuleCode[] };

/** Chaque pharmacie et ses modules, modifiables un par un. */
export function PharmacyModules({ pharmacies }: { pharmacies: Pharmacy[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? pharmacies.filter((item) => `${item.name} ${item.city ?? ""}`.toLowerCase().includes(needle)) : pharmacies;
  }, [pharmacies, query]);
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-text-primary">Les pharmacies</h2>
        <Input aria-label="Chercher une pharmacie" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher une pharmacie…" className="max-w-[260px]" />
      </div>
      <ul className="flex flex-col gap-3">
        {shown.map((pharmacy) => (
          <li key={pharmacy.id} className="rounded-lg border border-border-subtle bg-surface-page p-3">
            <p className="mb-2 text-[13.5px] font-semibold text-text-primary">
              {pharmacy.name}
              {pharmacy.city && <span className="font-normal text-text-tertiary"> · {pharmacy.city}</span>}
              {pharmacy.isDemo && <span className="ml-2 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10.5px] font-semibold text-text-tertiary">Démo</span>}
            </p>
            <ModulePicker compact initial={pharmacy.modules} onSave={(modules) => savePharmacyModulesAction({ pharmacyId: pharmacy.id, modules })} />
          </li>
        ))}
        {shown.length === 0 && <li className="text-[13px] text-text-secondary">Aucune pharmacie.</li>}
      </ul>
    </section>
  );
}
