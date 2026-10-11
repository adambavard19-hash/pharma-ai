"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { setConsentAction } from "@/server/actions/mobile-account";
import { CONSENT_KINDS, CONSENT_TEXTS, type ConsentKind } from "@/core/mobile/profile";
import { cn } from "@/lib/utils";

type HistoryEntry = { id: string; kind: ConsentKind; granted: boolean; at: string; source: string };

const SOURCE_WORDS: Record<string, string> = { MOBILE_SIGNUP: "à l'inscription", MOBILE_WELCOME: "à la bienvenue", MOBILE_SETTINGS: "dans Mon espace" };
const DATE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

/**
 * Les accords, en interrupteurs. Chaque changement est une ligne de plus dans le journal (rien n'est réécrit), et
 * l'historique est montré tel quel : date, sens, endroit.
 */
export function ConsentsPanel({ initial, history }: { initial: Record<ConsentKind, boolean>; history: HistoryEntry[] }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const toggle = (kind: ConsentKind) => {
    const next = !values[kind];
    setValues((current) => ({ ...current, [kind]: next }));
    setError(null);
    startTransition(async () => {
      const result = await setConsentAction({ kind, granted: next });
      if (!result.ok) {
        setValues((current) => ({ ...current, [kind]: !next }));
        setError(result.error);
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
      <ul className="divide-y divide-ink-100">
        {CONSENT_KINDS.map((kind) => (
          <li key={kind} className="flex gap-3 px-4 py-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[15px] font-semibold text-ink-900">{CONSENT_TEXTS[kind].title}</p>
              <p className="text-[12.5px] leading-[1.45] text-text-secondary">{CONSENT_TEXTS[kind].body}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={values[kind]}
              aria-label={CONSENT_TEXTS[kind].title}
              disabled={pending}
              onClick={() => toggle(kind)}
              className="relative mt-0.5 inline-flex h-11 w-14 shrink-0 items-center justify-center"
            >
              <span className={cn("absolute h-7 w-12 rounded-full transition-colors", values[kind] ? "bg-brand-600" : "bg-ink-300")} />
              <span className={cn("absolute left-1.5 size-6 rounded-full bg-white shadow-md transition-transform duration-200", values[kind] && "translate-x-5")} />
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="border-t border-danger-100 bg-danger-50 px-4 py-3 text-[13px] font-medium text-danger-800">{error}</p>}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-12 w-full items-center justify-between border-t border-ink-100 px-4 text-[13.5px] font-semibold text-brand-800">
        Historique de mes accords ({history.length})
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <ul className="space-y-2 border-t border-ink-100 bg-ink-50/60 px-4 py-3">
          {history.length === 0 && <li className="text-[13px] text-text-tertiary">Aucune décision enregistrée.</li>}
          {history.map((entry) => (
            <li key={entry.id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="text-ink-800">
                <span className={entry.granted ? "font-semibold text-success-700" : "font-semibold text-ink-600"}>{entry.granted ? "Accepté" : "Refusé"}</span> · {CONSENT_TEXTS[entry.kind].title} {SOURCE_WORDS[entry.source] ?? ""}
              </span>
              <time dateTime={entry.at} className="shrink-0 text-text-tertiary tabular">{DATE.format(new Date(entry.at))}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
