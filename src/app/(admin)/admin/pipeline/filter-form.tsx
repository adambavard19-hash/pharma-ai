import Link from "next/link";
import { Search } from "lucide-react";

const CONTROL = "h-9 rounded-lg border border-border-default bg-surface-card px-3 text-[13.5px] text-text-primary shadow-xs placeholder:text-text-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

/**
 * Les filtres de l'espace Commercial, par l'adresse (formulaire GET) :
 * partageables, et le bouton « précédent » fonctionne. `keep` conserve les
 * autres paramètres (vue, filtre…) au moment de filtrer.
 */
export function CommercialFilterForm({
  action,
  reps,
  values,
  fields,
  keep = {},
  repCounts,
}: {
  action: string;
  reps: { id: string; firstName: string; lastName: string; isActive: boolean }[];
  values: { q?: string | null; commercial?: string | null; ville?: string | null };
  fields: ("q" | "commercial" | "ville")[];
  keep?: Record<string, string | null | undefined>;
  /** Nombre de dossiers par commercial (`console` pour les dossiers sans commercial), affiché dans la liste. */
  repCounts?: Record<string, number>;
}) {
  const countOf = (key: string) => (repCounts ? ` (${repCounts[key] ?? 0})` : "");
  const active = fields.some((field) => values[field]);
  const clearHref = (() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(keep)) if (value && !fields.includes(key as never)) params.set(key, value);
    const query = params.toString();
    return query ? `${action}?${query}` : action;
  })();
  return (
    <form action={action} method="get" className="flex flex-wrap items-center gap-2" role="search">
      {Object.entries(keep).map(([key, value]) => (value && !fields.includes(key as never) ? <input key={key} type="hidden" name={key} value={value} /> : null))}
      {fields.includes("q") && (
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
          <input type="search" name="q" defaultValue={values.q ?? ""} placeholder="Pharmacie, titulaire, ville, e-mail" aria-label="Rechercher un dossier" className={`${CONTROL} w-full pl-9`} />
        </div>
      )}
      {fields.includes("commercial") && (
        <select name="commercial" defaultValue={values.commercial ?? ""} aria-label="Commercial" className={`${CONTROL} pr-8`}>
          <option value="">Tous les commerciaux</option>
          <option value="console">{`Console (sans commercial)${countOf("console")}`}</option>
          {reps.map((rep) => (
            <option key={rep.id} value={rep.id}>
              {`${rep.firstName} ${rep.lastName}${rep.isActive ? "" : " (inactif)"}${countOf(rep.id)}`}
            </option>
          ))}
        </select>
      )}
      {fields.includes("ville") && <input name="ville" defaultValue={values.ville ?? ""} placeholder="Ville" aria-label="Ville" className={`${CONTROL} w-36`} />}
      <button type="submit" className="h-9 rounded-lg bg-brand-600 px-3.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-brand-700">Filtrer</button>
      {active && <Link href={clearHref} className="text-[13px] text-text-tertiary underline underline-offset-2 hover:text-text-primary">Effacer</Link>}
    </form>
  );
}

/** La première valeur d'un paramètre d'adresse. */
export function param(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : null;
}
