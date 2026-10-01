"use client";

import { useRef, type ReactNode } from "react";
import { Menu } from "lucide-react";

/** Le menu du site sur petit écran : se referme dès qu'on choisit un lien. */
export function MobileMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="group relative xl:hidden">
      <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full text-text-primary hover:bg-surface-sunken [&::-webkit-details-marker]:hidden" aria-label="Menu">
        <Menu className="size-5" />
      </summary>
      <div
        className="absolute top-12 right-0 w-64 rounded-2xl border border-border-subtle bg-surface-card p-2 shadow-xl"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a") && ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
