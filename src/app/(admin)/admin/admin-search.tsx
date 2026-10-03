"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, FileSignature, Loader2, Search, UserRound, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminSearchResult } from "@/server/services/admin/search";

const ICONS = { pharmacy: Building2, prospect: Briefcase, contract: FileSignature, user: UserRound, rep: UsersRound } as const;
const GROUPS: Record<AdminSearchResult["type"], string> = { pharmacy: "Officines", prospect: "Dossiers commerciaux", contract: "Contrats", user: "Comptes d'officine", rep: "Commerciaux" };

/**
 * Recherche globale de la console (⌘K / Ctrl+K) : une officine, un contact,
 * un contrat, un utilisateur, un commercial. Données d'entreprise seulement.
 */
export function AdminSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResult[]>([]);
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
          const response = await fetch(`/api/admin/recherche?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
          if (!response.ok) return;
          const data = (await response.json()) as { results: AdminSearchResult[] };
          setResults(data.results);
          setActiveIndex(0);
        } catch {
          // Requête annulée ou réseau indisponible : rien plutôt qu'un résultat trompeur.
        }
      });
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  const visible = query.trim().length < 2 ? [] : results;
  const close = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  };
  const go = (result: AdminSearchResult) => {
    close();
    router.push(result.href);
  };
  const onInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && visible[activeIndex]) {
      event.preventDefault();
      go(visible[activeIndex]);
    }
  };
  const grouped = visible.reduce<Record<string, AdminSearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});
  let flatIndex = -1;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-border-default bg-surface-app px-3 text-[13px] text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary">
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left">Officine, contact, contrat…</span>
        <kbd className="hidden shrink-0 rounded border border-border-default bg-surface-card px-1.5 py-0.5 font-mono text-[10px] sm:block">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={close} />
          <div role="dialog" aria-modal="true" aria-label="Recherche dans la console" className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-subtle bg-surface-card shadow-2xl animate-[slide-up_0.15s_ease-out] motion-reduce:animate-none">
            <div className="flex items-center gap-3 border-b border-border-subtle px-4">
              {pending ? <Loader2 className="size-4 animate-spin text-text-tertiary" aria-hidden="true" /> : <Search className="size-4 text-text-tertiary" aria-hidden="true" />}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Nom d'officine, ville, SIRET, e-mail, référence de contrat…"
                aria-label="Rechercher"
                className="h-12 flex-1 bg-transparent text-[14.5px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              <kbd className="rounded border border-border-default px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">Échap</kbd>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {query.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-[13px] text-text-tertiary">Tapez au moins deux caractères. Aucune donnée patient n&apos;est cherchée ici.</p>
              ) : visible.length === 0 && !pending ? (
                <p className="px-3 py-6 text-center text-[13px] text-text-tertiary">Aucun résultat pour « {query.trim()} ».</p>
              ) : (
                Object.entries(grouped).map(([type, items]) => (
                  <div key={type} className="mb-1.5">
                    <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">{GROUPS[type as AdminSearchResult["type"]]}</p>
                    {items.map((result) => {
                      flatIndex += 1;
                      const index = flatIndex;
                      const Icon = ICONS[result.type];
                      return (
                        <button key={`${result.type}-${result.id}`} type="button" onClick={() => go(result)} onMouseEnter={() => setActiveIndex(index)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", index === activeIndex ? "bg-brand-50 dark:bg-brand-950/50" : "hover:bg-surface-sunken")}>
                          <Icon className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-text-primary">{result.title}</span>
                            {result.subtitle && <span className="block truncate text-[12px] text-text-secondary">{result.subtitle}</span>}
                          </span>
                          {result.badge && <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-text-secondary">{result.badge}</span>}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
