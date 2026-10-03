import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Params = Record<string, string | undefined | null>;

/** Construit une adresse en gardant les autres filtres. Une valeur vide retire le paramètre. */
export function hrefWith(basePath: string, current: Params, changes: Params): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Des pastilles de filtre pilotées par l'adresse : partageables, et le bouton
 * « précédent » du navigateur fonctionne. Le compteur dit ce qu'on trouvera.
 */
export function FilterChips({ basePath, param, options, current, keep = {}, label }: { basePath: string; param: string; options: { value: string | null; label: string; count?: number }[]; current: string | null | undefined; keep?: Params; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label ?? "Filtres"}>
      {options.map((option) => {
        const active = (current ?? null) === option.value;
        return (
          <Link
            key={option.value ?? "tous"}
            href={hrefWith(basePath, keep, { [param]: option.value })}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              active ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-secondary hover:border-brand-300 hover:text-text-primary",
            )}
          >
            {option.label}
            {option.count !== undefined && <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-white/20" : "bg-surface-sunken text-text-tertiary")}>{option.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}

/** Une recherche par l'adresse (formulaire GET) : les autres filtres sont conservés. */
export function SearchBox({ action, defaultValue, placeholder, keep = {}, name = "q" }: { action: string; defaultValue?: string | null; placeholder: string; keep?: Params; name?: string }) {
  return (
    <form action={action} method="get" className="relative w-full max-w-sm" role="search">
      {Object.entries(keep).map(([key, value]) => (value && key !== name ? <input key={key} type="hidden" name={key} value={value} /> : null))}
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-border-default bg-surface-card pr-3 pl-9 text-[13.5px] text-text-primary shadow-xs placeholder:text-text-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      />
    </form>
  );
}

export const PERIODS = [
  { value: "30j", label: "30 jours", days: 30 },
  { value: "3m", label: "3 mois", days: 91 },
  { value: "12m", label: "12 mois", days: 365 },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["value"];

export function resolvePeriod(value: string | null | undefined): (typeof PERIODS)[number] {
  return PERIODS.find((p) => p.value === value) ?? PERIODS[0];
}
