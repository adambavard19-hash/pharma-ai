"use client";

import { useId, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Une aide courte, à la demande : un « ? » qui déplie deux phrases sous le titre. Rien n'est
 * lu tant qu'on ne le demande pas ; la page reste légère pour qui sait déjà.
 */
export function HelpTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Aide : ${label}`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-5 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none dark:hover:text-brand-400"
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="note" className="mt-1.5 block max-w-md rounded-lg bg-surface-sunken px-3 py-2 text-[13px] leading-5 font-normal text-text-secondary">
          {children}
        </span>
      )}
    </span>
  );
}
