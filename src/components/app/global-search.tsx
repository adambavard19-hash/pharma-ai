"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Loader2,
  Package,
  Search,
  User,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/server/services/search";

const ICONS = {
  patient: User,
  prescription: ClipboardList,
  product: Package,
  user: UsersRound,
} as const;

const GROUP_LABELS: Record<SearchResult["type"], string> = {
  patient: "Patients",
  prescription: "Ordonnances",
  product: "Produits",
  user: "Équipe",
};

/**
 * Recherche globale, accessible partout via ⌘K / Ctrl+K.
 * La requête est exécutée côté serveur et strictement limitée à l'officine
 * de la session.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          const response = await fetch(
            `/api/recherche?q=${encodeURIComponent(trimmed)}`,
            { signal: controller.signal },
          );
          if (!response.ok) return;
          const data = (await response.json()) as { results: SearchResult[] };
          setResults(data.results);
          setActiveIndex(0);
        } catch {
          // Requête annulée ou réseau indisponible : on n'affiche rien plutôt
          // que d'afficher un résultat trompeur.
        }
      });
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  // L'état affiché est DÉRIVÉ de la saisie : une requête trop courte n'affiche
  // rien, sans qu'il soit nécessaire de vider `results` depuis un effet.
  const trimmedQuery = query.trim();
  const visibleResults = trimmedQuery.length < 2 ? [] : results;

  const close = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  };

  const go = (result: SearchResult) => {
    close();
    router.push(result.href);
  };

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visibleResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && visibleResults[activeIndex]) {
      event.preventDefault();
      go(visibleResults[activeIndex]);
    }
  };

  const grouped = visibleResults.reduce<Record<string, SearchResult[]>>((acc, result) => {
    (acc[result.type] ??= []).push(result);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-border-default bg-surface-app px-3",
          "text-[13px] text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary",
          "w-full max-w-md",
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Rechercher un patient, une ordonnance…</span>
        <kbd className="hidden shrink-0 rounded border border-border-default bg-surface-card px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary sm:block">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
          <div
            className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]"
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Recherche globale"
            className="relative flex max-h-[65vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-card shadow-xl animate-[slide-up_0.2s_cubic-bezier(0.16,1,0.3,1)]"
          >
            <div className="flex items-center gap-3 border-b border-border-subtle px-4">
              <Search className="size-[18px] shrink-0 text-text-tertiary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Patient, ordonnance, produit, référence, collaborateur…"
                className="h-13 flex-1 bg-transparent py-4 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
                aria-label="Recherche globale"
                autoComplete="off"
              />
              {pending && <Loader2 className="size-4 animate-spin text-text-tertiary" />}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {trimmedQuery.length < 2 ? (
                <p className="px-3 py-8 text-center text-[13px] text-text-tertiary">
                  Saisissez au moins deux caractères pour lancer la recherche.
                </p>
              ) : visibleResults.length === 0 && !pending ? (
                <p className="px-3 py-8 text-center text-[13px] text-text-tertiary">
                  Aucun résultat pour «&nbsp;{trimmedQuery}&nbsp;».
                </p>
              ) : (
                Object.entries(grouped).map(([type, items]) => (
                  <div key={type} className="mb-1">
                    <p className="px-3 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-text-tertiary uppercase">
                      {GROUP_LABELS[type as SearchResult["type"]]}
                    </p>
                    {items.map((result) => {
                      flatIndex += 1;
                      const index = flatIndex;
                      const Icon = ICONS[result.type];
                      return (
                        <button
                          key={`${result.type}-${result.id}`}
                          type="button"
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => go(result)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                            index === activeIndex
                              ? "bg-brand-50 dark:bg-brand-950"
                              : "hover:bg-surface-sunken",
                          )}
                        >
                          <Icon className="size-4 shrink-0 text-text-tertiary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] text-text-primary">
                              {result.title}
                            </span>
                            {result.subtitle && (
                              <span className="block truncate text-[12px] text-text-tertiary">
                                {result.subtitle}
                              </span>
                            )}
                          </span>
                          {result.badge && (
                            <span className="shrink-0 text-[11.5px] text-text-tertiary tabular">
                              {result.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-border-subtle bg-surface-sunken/40 px-4 py-2 text-[11px] text-text-tertiary">
              <span>↑↓ naviguer</span>
              <span>↵ ouvrir</span>
              <span>Échap fermer</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
