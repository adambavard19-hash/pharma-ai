"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";

type SelectSpec = { name: string; label: string; allLabel: string; options: { value: string; label: string }[] };

/**
 * Des listes de choix (commercial, mois…) qui filtrent la page dès qu'on
 * choisit : l'adresse porte le filtre, donc il se partage et le bouton
 * « précédent » fonctionne. Les autres filtres de la page sont conservés ; la
 * pagination repart de la première page.
 */
export function FilterSelects({ basePath, current, selects }: { basePath: string; current: Record<string, string | null>; selects: SelectSpec[] }) {
  const router = useRouter();

  const change = (name: string, value: string) => {
    const params = new URLSearchParams();
    for (const [key, kept] of Object.entries({ ...current, [name]: value || null })) {
      if (kept && key !== "page") params.set(key, kept);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {selects.map((spec) => (
        <label key={spec.name} className="flex items-center gap-2 text-[12.5px] text-text-secondary">
          <span className="shrink-0">{spec.label}</span>
          <span className="block w-48 max-w-full">
            <Select value={current[spec.name] ?? ""} onChange={(event) => change(spec.name, event.target.value)} className="h-9 py-1.5 text-[13px]">
              <option value="">{spec.allLabel}</option>
              {spec.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </span>
        </label>
      ))}
    </div>
  );
}
