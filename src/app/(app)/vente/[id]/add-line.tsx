"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { addPrescriptionLineAction } from "@/server/actions/prescriptions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { DrugLookupResult } from "@/app/api/medicaments/recherche/route";

/**
 * Ajouter un médicament sans quitter le comptoir.
 *
 * Indispensable quand l'ordonnance arrive vide — photo illisible, lecture non
 * activée, ordonnance papier saisie à la main. Sans ce champ, le pharmacien
 * devrait recommencer la délivrance depuis l'écran précédent.
 */
export function AddLine({ prescriptionId }: { prescriptionId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DrugLookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();

  useEffect(() => {
    const needle = query.trim();
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      if (needle.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(
          `/api/medicaments/recherche?q=${encodeURIComponent(needle)}`,
          { signal: controller.signal },
        );
        if (response.ok) {
          const data = (await response.json()) as { results: DrugLookupResult[] };
          setResults(data.results);
        }
      } catch {
        // Requête annulée.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const add = (drugName: string, form: string | null) => {
    startTransition(async () => {
      const result = await addPrescriptionLineAction({ prescriptionId, drugName, form: form ?? "" });
      if (!result.ok) {
        push({ tone: "error", title: result.error });
        return;
      }
      setQuery("");
      setResults([]);
      inputRef.current?.focus();
    });
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        className="w-full border-dashed"
        onClick={() => setOpen(true)}
        leadingIcon={<Plus className="size-[18px]" />}
      >
        Ajouter un médicament
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border-default p-3">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary">
          {loading || pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          autoFocus
          placeholder="Scanner ou taper un médicament"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (results.length === 1) add(results[0].name, results[0].form);
            else if (results.length === 0 && query.trim()) add(query.trim(), null);
          }}
          className={cn(
            "w-full rounded-lg border border-border-default bg-surface-card py-2.5 pr-3 pl-9",
            "text-[13.5px] text-text-primary placeholder:text-text-tertiary",
            "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none",
          )}
        />
      </div>

      {results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-border-default p-1">
          {results.map((result) => (
            <li key={result.presentationId}>
              <button
                type="button"
                onClick={() => add(result.name, result.form)}
                className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-sunken"
              >
                <span className="block truncate text-[13px] text-text-primary">{result.name}</span>
                <span className="block truncate text-[11.5px] text-text-tertiary">
                  {[result.form, result.substances.join(", ")].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && results.length === 0 && !loading && (
        <button
          type="button"
          onClick={() => add(query.trim(), null)}
          className="w-full rounded-lg border border-dashed border-border-default px-3 py-2.5 text-left text-[13px] text-text-secondary transition-colors hover:border-brand-400 hover:text-text-primary"
        >
          Ajouter « {query.trim()} » tel quel
        </button>
      )}
    </div>
  );
}
