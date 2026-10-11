"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleFavoriteAction } from "@/server/actions/mobile-discover";
import type { FavoriteType } from "@/core/discover/content";
import { cn } from "@/lib/utils";

/** Le cœur « favori » : bascule immédiate à l'écran, rétablie si le serveur refuse. */
export function FavoriteButton({ type, id, initial, label, onImage = false, withText = false, bordered = false }: { type: FavoriteType; id: string; initial: boolean; label: string; onImage?: boolean; withText?: boolean; bordered?: boolean }) {
  const [on, setOn] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const result = await toggleFavoriteAction({ type, id, on: next });
      if (!result.ok) {
        setOn(!next);
        setMessage(result.error);
        return;
      }
      setMessage(result.message ?? null);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? `Retirer « ${label} » de mes favoris` : `Ajouter « ${label} » à mes favoris`}
        disabled={pending}
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full transition-[transform,background-color] duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none",
          onImage ? "bg-white/92 shadow-[0_1px_8px_rgb(0_0_0/0.14)] backdrop-blur" : withText || bordered ? "border border-ink-200 bg-white" : "bg-transparent",
          bordered && "size-12 shrink-0",
          withText && "px-4 text-[14px] font-semibold text-ink-800",
        )}
      >
        <Heart className={cn("size-[19px] transition-colors", on ? "fill-danger-500 text-danger-500" : "text-ink-500")} aria-hidden="true" />
        {withText && <span>{on ? "Dans mes favoris" : "Favori"}</span>}
      </button>
      <span className="sr-only" aria-live="polite">
        {message}
      </span>
    </>
  );
}
