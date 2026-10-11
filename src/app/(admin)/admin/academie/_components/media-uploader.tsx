"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Film, ImageIcon, Trash2, Upload } from "lucide-react";
import { removeAcademyVideoAction } from "@/server/actions/platform-academy";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";

/**
 * L'envoi de la vidéo (MP4/WebM) et de l'image d'attente (JPEG/PNG/WebP), avec la barre d'avancement de l'envoi.
 * Passe par la route `/api/academie/upload` (une Server Action ne prend pas un fichier de cette taille).
 */
export function MediaUploader({ contentId, videoUrl, posterUrl, vertical, maxVideoMb }: { contentId: string; videoUrl: string | null; posterUrl: string | null; vertical: boolean; maxVideoMb: number }) {
  const [progress, setProgress] = useState<{ kind: "video" | "poster"; percent: number } | null>(null);
  const [pending, start] = useTransition();
  const videoInput = useRef<HTMLInputElement>(null);
  const posterInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { push } = useToast();

  const send = (kind: "video" | "poster", file: File) => {
    if (kind === "video" && file.size > maxVideoMb * 1024 * 1024) {
      push({ tone: "error", title: `Vidéo trop lourde : ${maxVideoMb} Mo au plus.` });
      return;
    }
    const form = new FormData();
    form.set("contentId", contentId);
    form.set("kind", kind);
    form.set("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/academie/upload");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress({ kind, percent: Math.round((event.loaded / event.total) * 100) });
    };
    request.onload = () => {
      setProgress(null);
      let body: { ok?: boolean; error?: string } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        body = { ok: false, error: "Réponse illisible du serveur." };
      }
      if (request.status === 200 && body.ok) {
        push({ tone: "success", title: kind === "video" ? "Vidéo envoyée. Le contenu repasse en brouillon." : "Image d'attente envoyée." });
        router.refresh();
      } else push({ tone: "error", title: body.error ?? `Envoi refusé (${request.status}).` });
    };
    request.onerror = () => {
      setProgress(null);
      push({ tone: "error", title: "Envoi interrompu : vérifiez la connexion et réessayez." });
    };
    setProgress({ kind, percent: 0 });
    request.send(form);
  };

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_200px]">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
          <Film className="size-4 text-brand-700" aria-hidden="true" />
          Vidéo hébergée
        </div>
        {videoUrl ? (
          <video src={videoUrl} poster={posterUrl ?? undefined} controls playsInline preload="metadata" className={vertical ? "aspect-[9/16] max-h-[420px] rounded-xl bg-black" : "aspect-video w-full rounded-xl bg-black"} />
        ) : (
          <p className="rounded-xl border border-dashed border-border-default px-4 py-6 text-center text-[13px] text-text-tertiary">Aucune vidéo envoyée. Un lien YouTube, Vimeo ou Dailymotion peut aussi servir.</p>
        )}
        {progress?.kind === "video" && <Progress value={progress.percent} max={100} label="Envoi en cours" />}
        <div className="flex flex-wrap gap-2">
          <input ref={videoInput} type="file" accept="video/mp4,video/webm" className="sr-only" id="ac-video-file" onChange={(e) => { const file = e.target.files?.[0]; if (file) send("video", file); e.target.value = ""; }} />
          <Button type="button" variant="secondary" size="sm" disabled={!!progress} onClick={() => videoInput.current?.click()} leadingIcon={<Upload className="size-4" aria-hidden="true" />}>
            {videoUrl ? "Remplacer la vidéo" : "Envoyer la vidéo"}
          </Button>
          {videoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={pending}
              disabled={!!progress}
              onClick={() =>
                start(async () => {
                  const result = await removeAcademyVideoAction({ contentId });
                  push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Retirée.") : result.error });
                  router.refresh();
                })
              }
              leadingIcon={<Trash2 className="size-4" aria-hidden="true" />}
            >
              Retirer
            </Button>
          )}
        </div>
        <p className="text-[12px] text-text-tertiary">MP4 ou WebM, {maxVideoMb} Mo au plus. Une nouvelle vidéo renvoie le contenu en relecture.</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
          <ImageIcon className="size-4 text-brand-700" aria-hidden="true" />
          Image d&apos;attente
        </div>
        <div className="aspect-[9/14] overflow-hidden rounded-xl bg-surface-sunken">
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- image servie par la route contrôlée de l'Académie
            <img src={posterUrl} alt="Image d'attente actuelle" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[12px] text-text-tertiary">Aucune</span>
          )}
        </div>
        {progress?.kind === "poster" && <Progress value={progress.percent} max={100} label="Envoi en cours" />}
        <input ref={posterInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="ac-poster-file" onChange={(e) => { const file = e.target.files?.[0]; if (file) send("poster", file); e.target.value = ""; }} />
        <Button type="button" variant="secondary" size="sm" disabled={!!progress} onClick={() => posterInput.current?.click()} leadingIcon={<Upload className="size-4" aria-hidden="true" />}>
          {posterUrl ? "Remplacer" : "Envoyer"}
        </Button>
      </div>
    </div>
  );
}
