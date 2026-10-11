"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { GraduationCap, Loader2, X } from "lucide-react";
import { dismissSuggestionAction } from "@/server/actions/mobile-personal";

/** Une formation suggérée par le coach : pourquoi, en clair ; l'ouvrir ; ou l'écarter (« Plus tard », 30 jours). */
export function SuggestionCard({ id, href, title, universe, message }: { id: string; href: string; title: string; universe: string | null; message: string }) {
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (hidden) return null;

  const dismiss = () =>
    startTransition(async () => {
      const result = await dismissSuggestionAction({ id });
      if (result.ok) setHidden(true);
      else setError(result.error);
    });

  return (
    <li className="space-y-3 rounded-[20px] border border-white/70 bg-white p-4 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <GraduationCap className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          {universe && <p className="text-[12px] font-semibold text-brand-700">{universe}</p>}
          <p className="text-[15px] leading-snug font-semibold text-ink-900">{title}</p>
          <p className="text-[13px] leading-[1.45] text-text-secondary">{message}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link href={href} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[14px] bg-brand-gradient px-4 text-[14px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
          Voir la formation
        </Link>
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] border border-ink-200 bg-white px-4 text-[14px] font-semibold text-ink-700 active:bg-ink-50 disabled:opacity-60"
          aria-label={`Écarter la suggestion « ${title} » pour 30 jours`}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
          Plus tard
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger-700">
          {error}
        </p>
      )}
    </li>
  );
}
