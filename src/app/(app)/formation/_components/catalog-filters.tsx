"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { Button, Spinner } from "@/components/ui/button";
import { universeLabel } from "@/config/universes";
import { TRAINING_STATUS_LABELS, TRAINING_STATUSES } from "@/core/training/progress";

/**
 * Recherche et filtres du catalogue, portés par l'adresse : un filtre se
 * partage et survit au rechargement. Les listes ne proposent que les valeurs
 * présentes dans le catalogue — pas de laboratoire « fantôme ».
 */
export function CatalogFilters({ laboratories, universes }: { laboratories: string[]; universes: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const laboratory = searchParams.get("labo") ?? "";
  const universe = searchParams.get("univers") ?? "";
  const status = searchParams.get("statut") ?? "";
  const active = !!(query || laboratory || universe || status);

  const apply = (changes: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const next = params.toString();
    start(() => router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false }));
  };

  const onQuery = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply({ q: value.trim() }), 300);
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setQuery("");
    apply({ q: "", labo: "", univers: "", statut: "" });
  };

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-0 flex-1 sm:min-w-[240px]">
        <Input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Rechercher une formation, un laboratoire, une gamme…"
          aria-label="Rechercher une formation"
          leadingIcon={pending ? <Spinner className="size-4" /> : <Search className="size-4" />}
        />
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:flex sm:flex-wrap">
        {laboratories.length > 0 && (
          <Select value={laboratory} onChange={(event) => apply({ labo: event.target.value })} aria-label="Laboratoire" className="sm:w-48">
            <option value="">Tous les laboratoires</option>
            {laboratories.map((lab) => (
              <option key={lab} value={lab}>{lab}</option>
            ))}
          </Select>
        )}
        {universes.length > 0 && (
          <Select value={universe} onChange={(event) => apply({ univers: event.target.value })} aria-label="Univers" className="sm:w-48">
            <option value="">Tous les univers</option>
            {universes.map((key) => (
              <option key={key} value={key}>{universeLabel(key)}</option>
            ))}
          </Select>
        )}
        <Select value={status} onChange={(event) => apply({ statut: event.target.value })} aria-label="Statut" className="sm:w-40">
          <option value="">Tous les statuts</option>
          {TRAINING_STATUSES.map((key) => (
            <option key={key} value={key}>{TRAINING_STATUS_LABELS[key]}</option>
          ))}
        </Select>
      </div>
      {active && (
        <Button variant="ghost" size="sm" leadingIcon={<X className="size-3.5" />} onClick={clear}>
          Effacer
        </Button>
      )}
    </div>
  );
}
