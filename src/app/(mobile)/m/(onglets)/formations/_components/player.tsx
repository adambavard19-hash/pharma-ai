"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { recordWatchAction } from "@/server/actions/mobile-academy";

/**
 * Le lecteur du détail d'une formation : les commandes du navigateur (avance, plein écran, sous-titres de la plateforme),
 * plus l'enregistrement de ce qui a été vu, par paliers. Une vidéo intégrée (YouTube, Vimeo…) ne dit pas ce qui a été
 * vu : la personne le déclare (« J'ai regardé »).
 */
export function DetailPlayer({ contentId, video, posterUrl, vertical, title, initialPercent, done, hasQuiz }: { contentId: string; video: { type: "file"; src: string } | { type: "embed"; src: string; platform: string }; posterUrl: string | null; vertical: boolean; title: string; initialPercent: number; done: boolean; hasQuiz: boolean }) {
  const element = useRef<HTMLVideoElement>(null);
  const saved = useRef(done ? 100 : initialPercent);
  const [embedOpen, setEmbedOpen] = useState(false);
  const router = useRouter();

  const save = (percent: number) => {
    const rounded = Math.round(percent);
    if (rounded <= saved.current) return;
    saved.current = rounded;
    void recordWatchAction({ contentId, percent: rounded }).then((result) => {
      if (result.ok && (result.data.status === "DONE" || rounded >= 100)) router.refresh();
    });
  };

  const onTime = () => {
    const node = element.current;
    if (!node?.duration) return;
    const percent = (node.currentTime / node.duration) * 100;
    for (const step of [25, 50, 75, 90]) if (percent >= step && saved.current < step) save(step);
  };

  const frame = cn("relative mx-auto overflow-hidden rounded-[24px] bg-ink-950 shadow-[0_18px_40px_-20px_oklch(0.3_0.05_200/0.6)]", vertical ? "aspect-[9/16] max-h-[72dvh] w-auto max-w-full" : "aspect-video w-full");

  if (video.type === "file") {
    return (
      <div className={frame}>
        <video ref={element} src={video.src} poster={posterUrl ?? undefined} controls playsInline preload="metadata" onTimeUpdate={onTime} onEnded={() => save(100)} onPause={() => { const node = element.current; if (node?.duration) save((node.currentTime / node.duration) * 100); }} className="size-full bg-black object-contain" aria-label={title} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={cn(frame, "aspect-video w-full")}>
        {embedOpen ? (
          <iframe src={`${video.src}?autoplay=1&playsinline=1`} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="size-full" />
        ) : (
          <button type="button" onClick={() => setEmbedOpen(true)} className="group absolute inset-0 flex items-center justify-center" aria-label={`Lire « ${title} »`}>
            {posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- image servie par la route contrôlée de l'Académie
              <img src={posterUrl} alt="" className="absolute inset-0 size-full object-cover opacity-80" />
            )}
            <span className="relative flex size-[72px] items-center justify-center rounded-full bg-white/25 backdrop-blur-md transition-transform group-active:scale-90">
              <Play className="ml-1 size-8 fill-white text-white" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      {!done && !hasQuiz && embedOpen && (
        <button type="button" onClick={() => save(100)} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-50 px-4 text-[14px] font-semibold text-brand-800 ring-1 ring-brand-200 ring-inset">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          J&apos;ai regardé la vidéo
        </button>
      )}
    </div>
  );
}

/** La fiche se termine quand la personne dit l'avoir lue (sans quiz) ; sinon c'est le quiz qui la termine. */
export function SheetDoneButton({ contentId, done }: { contentId: string; done: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done">(done ? "done" : "idle");
  const router = useRouter();
  if (state === "done")
    return (
      <p className="inline-flex items-center gap-2 text-[14px] font-semibold text-success-800" role="status">
        <CheckCircle2 className="size-5" aria-hidden="true" />
        Fiche lue
      </p>
    );
  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={() => {
        setState("busy");
        void recordWatchAction({ contentId, percent: 100 }).then((result) => {
          setState(result.ok ? "done" : "idle");
          if (result.ok) router.refresh();
        });
      }}
      className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-gradient px-5 text-[15px] font-semibold text-white shadow-md active:scale-95 disabled:opacity-60"
    >
      <CheckCircle2 className="size-5" aria-hidden="true" />
      J&apos;ai lu cette fiche
    </button>
  );
}
