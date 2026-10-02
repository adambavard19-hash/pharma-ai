"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Les films, fabriqués dans video/ (Remotion) et exportés pour le web dans
 * public/video. Chacun s'ouvre dans une fenêtre, se lit avec le son, et se
 * ferme au clic hors du cadre ou avec Échap.
 */
export const FILMS = {
  presentation: { src: "/video/pharmaboost-presentation.mp4", poster: "/video/pharmaboost-presentation.jpg", duration: "42 s", title: "Présentation de PharmaBoost" },
  comment: { src: "/video/pharmaboost-comment-ca-marche.mp4", poster: "/video/pharmaboost-comment-ca-marche.jpg", duration: "39 s", title: "Comment ça marche" },
  pourquoi: { src: "/video/pharmaboost-pourquoi.mp4", poster: "/video/pharmaboost-pourquoi.jpg", duration: "34 s", title: "Pourquoi PharmaBoost" },
  avantages: { src: "/video/pharmaboost-avantages.mp4", poster: "/video/pharmaboost-avantages.jpg", duration: "34 s", title: "Les avantages" },
  sansOrdonnance: { src: "/video/pharmaboost-sans-ordonnance.mp4", poster: "/video/pharmaboost-sans-ordonnance.jpg", duration: "25 s", title: "Sans ordonnance" },
} as const;

export type FilmKey = keyof typeof FILMS;

export function VideoButton({ film = "presentation", className, label = "Voir la présentation", tone = "light" }: { film?: FilmKey; className?: string; label?: string; tone?: "light" | "dark" }) {
  const video = FILMS[film];
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group inline-flex h-12 items-center gap-3 rounded-full pr-5 pl-1.5 text-[15px] font-semibold transition-colors",
          tone === "light" ? "border border-border-default bg-surface-card text-text-primary hover:border-brand-400" : "border border-white/25 text-white hover:bg-white/10",
          className,
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-600 text-white transition-transform group-hover:scale-105">
          <Play className="size-4 translate-x-px fill-current" />
        </span>
        {label}
        <span className={cn("font-mono text-[12px] font-medium", tone === "light" ? "text-text-tertiary" : "text-brand-200")}>{video.duration}</span>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={video.title} className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Fermer la vidéo" className="absolute -top-12 right-0 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <X className="size-5" />
            </button>
            <video src={video.src} poster={video.poster} controls autoPlay playsInline preload="auto" className="aspect-video w-full rounded-2xl bg-black shadow-2xl">
              La lecture vidéo n&apos;est pas prise en charge par ce navigateur.
            </video>
          </div>
        </div>
      )}
    </>
  );
}
