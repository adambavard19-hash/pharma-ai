"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Briefcase, Building2, CornerDownLeft, FileSignature, RotateCcw, Sparkles, UserRound, UsersRound } from "lucide-react";
import { Robot, type RobotMood } from "@/components/robot";
import { cn } from "@/lib/utils";
import { ASSISTANT_SUGGESTIONS, looksLikeLookup, safeConsoleHref, type AssistantTurn } from "@/core/admin-assistant/assistant";
import type { AdminSearchResult } from "@/server/services/admin/search";

const ICONS = { pharmacy: Building2, prospect: Briefcase, contract: FileSignature, user: UserRound, rep: UsersRound } as const;
const GROUPS: Record<AdminSearchResult["type"], string> = { pharmacy: "Officines", prospect: "Dossiers commerciaux", contract: "Contrats", user: "Comptes d'officine", rep: "Commerciaux" };

type Turn = AssistantTurn & { status?: string; failed?: boolean };
type Row = { kind: "ask" } | { kind: "result"; result: AdminSearchResult };

/**
 * Le robot de la console, à la place de la barre de recherche (⌘K / Ctrl+K).
 *
 * Taper un nom, une ville, un SIRET ou un e-mail affiche aussitôt les résultats,
 * comme avant. Poser une question (« qui est en retard de paiement ? ») et
 * Entrée : le robot lit les données de la plateforme et répond, avec des liens
 * vers les écrans. La conversation reste ouverte tant que la console l'est.
 */
export function AdminAssistant() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [mood, setMood] = useState<RobotMood>("idle");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
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

  // La recherche instantanée, pendant la frappe (comme l'ancienne barre).
  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2 || trimmed.length > 80) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/admin/recherche?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { results: AdminSearchResult[] };
        setResults(data.results);
        setActiveIndex(looksLikeLookup(trimmed) && data.results.length ? 1 : 0);
      } catch {
        // Requête annulée ou réseau indisponible : rien plutôt qu'un résultat trompeur.
      } finally {
        setSearching(false);
      }
    }, 160);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  const trimmed = query.trim();
  const visibleResults = trimmed.length >= 2 && trimmed.length <= 80 ? results : [];
  const rows: Row[] = trimmed ? [{ kind: "ask" }, ...visibleResults.map((result) => ({ kind: "result" as const, result }))] : [];

  const close = () => setOpen(false);
  const go = (href: string) => {
    close();
    router.push(href);
  };

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || pending) return;
      const history: Turn[] = [...turns.filter((t) => !t.failed), { role: "user", text }];
      setTurns([...history, { role: "assistant", text: "", status: "Je réfléchis…" }]);
      setQuery("");
      setResults([]);
      setPending(true);
      setMood("thinking");
      const controller = new AbortController();
      abortRef.current = controller;
      const update = (patch: (last: Turn) => Turn) => setTurns((current) => [...current.slice(0, -1), patch(current[current.length - 1])]);
      try {
        const response = await fetch("/api/admin/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turns: history.map(({ role, text }) => ({ role, text })) }), signal: controller.signal });
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Le robot n'a pas pu répondre.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let failure: string | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as { type: string; delta?: string; label?: string; message?: string };
            if (event.type === "text" && event.delta) update((last) => ({ ...last, text: last.text + event.delta, status: undefined }));
            else if (event.type === "tool" && event.label) update((last) => ({ ...last, status: event.label, text: last.text ? `${last.text.trimEnd()}\n\n` : "" }));
            else if (event.type === "error") failure = event.message ?? "Le robot n'a pas pu répondre.";
          }
        }
        if (failure) throw new Error(failure);
        update((last) => ({ ...last, status: undefined, text: last.text.trim() || "Je n'ai rien trouvé à répondre." }));
        setMood("happy");
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          update((last) => ({ ...last, status: undefined, text: last.text || "Question arrêtée.", failed: !last.text }));
        } else {
          update((last) => ({ ...last, status: undefined, failed: true, text: error instanceof Error ? error.message : "Le robot n'a pas pu répondre." }));
          setMood("concerned");
        }
      } finally {
        setPending(false);
        abortRef.current = null;
        setTimeout(() => setMood("idle"), 2_500);
        inputRef.current?.focus();
      }
    },
    [pending, turns],
  );

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "ask") void ask(query);
    else go(row.result.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "ArrowDown" && rows.length) {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (event.key === "ArrowUp" && rows.length) {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (rows.length) choose(rows[Math.min(activeIndex, rows.length - 1)]);
    }
  };

  const grouped = visibleResults.reduce<Record<string, { result: AdminSearchResult; index: number }[]>>((acc, result, i) => {
    (acc[result.type] ??= []).push({ result, index: i + 1 });
    return acc;
  }, {});
  const conversation = turns.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-border-default bg-surface-app pr-3 pl-1.5 text-[13.5px] text-text-tertiary transition-colors hover:border-brand-300 hover:text-text-secondary"
      >
        <Robot size={28} mood={pending ? "thinking" : mood} className="shrink-0" label="Robot PharmaBoost" />
        <span className="flex-1 truncate text-left">Demande-moi n&apos;importe quoi…</span>
        <kbd className="hidden shrink-0 rounded border border-border-default bg-surface-card px-1.5 py-0.5 font-mono text-[10px] sm:block">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[6vh] sm:px-4">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={close} />
          <div role="dialog" aria-modal="true" aria-label="Robot de la console" className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-card shadow-2xl animate-[slide-up_0.15s_ease-out] motion-reduce:animate-none">
            {conversation && (
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-4 pb-2 sm:px-5">
                {turns.map((turn, i) =>
                  turn.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-[14px] leading-6 whitespace-pre-wrap text-white">{turn.text}</p>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-2.5">
                      <Robot size={30} mood={i === turns.length - 1 && pending ? "thinking" : turn.failed ? "concerned" : "idle"} className="mt-0.5 shrink-0" />
                      <div className={cn("min-w-0 flex-1 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[14px] leading-6", turn.failed ? "bg-warning-50 text-warning-900 dark:bg-warning-700/10 dark:text-warning-100" : "bg-surface-sunken text-text-primary")}>
                        {turn.text && <AssistantText text={turn.text} onNavigate={go} />}
                        {turn.status && (
                          <p className={cn("flex items-center gap-2 text-[13px] text-text-secondary", turn.text && "mt-2")}>
                            <span className="inline-flex gap-0.5" aria-hidden="true">
                              <span className="size-1.5 animate-pulse rounded-full bg-brand-500" />
                              <span className="size-1.5 animate-pulse rounded-full bg-brand-500 [animation-delay:150ms]" />
                              <span className="size-1.5 animate-pulse rounded-full bg-brand-500 [animation-delay:300ms]" />
                            </span>
                            {turn.status}
                          </p>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}

            <div className={cn("flex items-end gap-3 px-3 py-2.5 sm:px-4", conversation ? "border-t border-border-subtle" : "border-b border-border-subtle")}>
              {!conversation && <Robot size={40} mood={pending ? "thinking" : mood} className="mb-0.5 shrink-0" interactive />}
              <textarea
                ref={inputRef}
                rows={1}
                value={query}
                onChange={(e) => setQuery(e.target.value.slice(0, 1000))}
                onKeyDown={onKeyDown}
                placeholder={conversation ? "Une autre question ?" : "Demande-moi n'importe quoi, ou tape un nom, un SIRET, un e-mail…"}
                aria-label="Question au robot ou recherche"
                className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-6 text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              {pending ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="mb-1 flex h-9 shrink-0 items-center rounded-lg border border-border-default px-3 text-[13px] text-text-secondary hover:bg-surface-sunken">
                  Arrêter
                </button>
              ) : (
                <button type="button" onClick={() => void ask(query)} disabled={!trimmed} aria-label="Envoyer la question" className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-opacity disabled:opacity-35">
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {trimmed && !pending ? (
              <div className={cn("overflow-y-auto p-2", conversation ? "max-h-[30vh] border-t border-border-subtle" : "max-h-[55vh]")}>
                <button type="button" onClick={() => choose(rows[0])} onMouseEnter={() => setActiveIndex(0)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", activeIndex === 0 ? "bg-brand-50 dark:bg-brand-950/50" : "hover:bg-surface-sunken")}>
                  <Sparkles className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-primary">
                    Demander au robot : <span className="font-medium">« {trimmed} »</span>
                  </span>
                  {activeIndex === 0 && <CornerDownLeft className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />}
                </button>
                {Object.entries(grouped).map(([type, items]) => (
                  <div key={type} className="mt-1.5">
                    <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">{GROUPS[type as AdminSearchResult["type"]]}</p>
                    {items.map(({ result, index }) => {
                      const Icon = ICONS[result.type];
                      return (
                        <button key={`${result.type}-${result.id}`} type="button" onClick={() => go(result.href)} onMouseEnter={() => setActiveIndex(index)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", index === activeIndex ? "bg-brand-50 dark:bg-brand-950/50" : "hover:bg-surface-sunken")}>
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
                ))}
                {searching && visibleResults.length === 0 && <p className="px-3 py-2 text-[12.5px] text-text-tertiary">Recherche…</p>}
              </div>
            ) : (
              !conversation && (
                <div className="p-4">
                  <p className="mb-2.5 text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Par exemple</p>
                  <div className="flex flex-wrap gap-2">
                    {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => void ask(suggestion)} className="rounded-full border border-border-default bg-surface-app px-3 py-1.5 text-left text-[13px] text-text-secondary transition-colors hover:border-brand-300 hover:text-text-primary">
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 text-[12px] leading-5 text-text-tertiary">Le robot lit les données de la plateforme, sans rien modifier, et vous donne le lien de l&apos;écran où agir. Aucune donnée patient n&apos;est lue ici.</p>
                </div>
              )
            )}

            {conversation && !trimmed && !pending && (
              <div className="flex justify-end border-t border-border-subtle px-4 py-2">
                <button type="button" onClick={() => setTurns([])} className="flex items-center gap-1.5 text-[12.5px] text-text-tertiary hover:text-text-secondary">
                  <RotateCcw className="size-3.5" aria-hidden="true" /> Nouvelle conversation
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * La réponse du robot, en Markdown simple : paragraphes, listes, gras, liens.
 * Seuls les liens internes de la console deviennent cliquables ; le reste
 * s'affiche en texte (aucun HTML n'est interprété).
 */
function AssistantText({ text, onNavigate }: { text: string; onNavigate: (href: string) => void }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, b) => {
        const lines = block.split("\n").filter((line) => line.trim());
        const isTable = lines.length >= 2 && lines.every((line) => /^\s*\|.*\|\s*$/.test(line)) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[1]);
        if (isTable) {
          const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
          const [head, , ...body] = lines;
          return (
            <div key={b} className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>{cells(head).map((cell, c) => <th key={c} className="border-b border-border-default px-2 py-1.5 text-left font-semibold whitespace-nowrap text-text-secondary">{inline(cell, onNavigate)}</th>)}</tr>
                </thead>
                <tbody>
                  {body.map((line, r) => (
                    <tr key={r} className="border-b border-border-subtle last:border-0">
                      {cells(line).map((cell, c) => <td key={c} className="px-2 py-1.5 align-top">{inline(cell, onNavigate)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const isList = lines.length > 0 && lines.every((line) => /^\s*([-*•]|\d+[.)])\s+/.test(line));
        if (isList)
          return (
            <ul key={b} className="space-y-1 pl-1">
              {lines.map((line, l) => (
                <li key={l} className="flex gap-2">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-text-tertiary" aria-hidden="true" />
                  <span className="min-w-0">{inline(line.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), onNavigate)}</span>
                </li>
              ))}
            </ul>
          );
        const heading = /^#{1,4}\s+/.test(block);
        return (
          <p key={b} className={cn("whitespace-pre-wrap", heading && "font-semibold")}>
            {inline(block.replace(/^#{1,4}\s+/, ""), onNavigate)}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string, onNavigate: (href: string) => void): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      const href = safeConsoleHref(match[2]);
      parts.push(
        href ? (
          <a
            key={match.index}
            href={href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey) return;
              event.preventDefault();
              onNavigate(href);
            }}
            className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800 dark:text-brand-300"
          >
            {match[1]}
          </a>
        ) : (
          <Fragment key={match.index}>{match[1]}</Fragment>
        ),
      );
    } else if (match[3]) parts.push(<strong key={match.index} className="font-semibold">{match[3]}</strong>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
