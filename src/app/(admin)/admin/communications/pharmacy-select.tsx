"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { hrefWith } from "@/components/admin/filters";

/** Le filtre par officine : la liste des officines clientes, l'adresse fait foi. */
export function PharmacySelect({ options, current, keep }: { options: { id: string; name: string; city: string | null }[]; current: string | null; keep: Record<string, string | null> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="relative block w-full sm:w-72">
      <span className="sr-only">Filtrer par officine</span>
      <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
      <select
        value={current ?? ""}
        disabled={pending}
        onChange={(e) => start(() => router.push(hrefWith("/admin/communications", keep, { officine: e.target.value || null, page: null })))}
        className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-border-default bg-surface-card pr-8 pl-9 text-[13.5px] text-text-primary shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:opacity-60"
      >
        <option value="">Toutes les officines</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
            {option.city ? ` — ${option.city}` : ""}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-tertiary" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
