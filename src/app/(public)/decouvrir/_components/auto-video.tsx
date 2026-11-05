"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * La présentation de PharmaBoost sous le héros de l'accueil, comme sur limova.ai (fondateur, 20 oct. 2026) ; depuis le 30 oct. 2026,
 * elle ne se lance plus d'elle-même et ne tourne plus en boucle : un clic la lance, un clic la relance une fois finie.
 *
 * Lancée par un clic du visiteur, elle part avec le son ; un bouton le coupe.
 *
 * En bas, comme sur limova.ai (fondateur, 25 oct. 2026) : lecture / pause, le temps, et une barre pour revenir en arrière ou
 * avancer. `vertical` : un film 9:16 (le Reel « Le Cercle », page Pourquoi).
 */
export function AutoVideo({ src, poster, vertical = false, className, autoStart = false, frameClassName }: { src: string; poster: string; vertical?: boolean; className?: string; /** Lancée dès l'ouverture (la fenêtre « Voir la présentation », ouverte par un clic). */ autoStart?: boolean; frameClassName?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Plus de lecture automatique (fondateur, 30 oct. 2026 : « je veux qu'on puisse cliquer pour qu'elle se lance ») : la vidéo
  // attend un clic, et se lance alors avec le son (le clic du visiteur le permet). Finie, elle s'arrête : un clic la relance.
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // La barre du bas (fondateur, 5 nov. 2026) : elle part dès que la vidéo se lance ; toucher la vidéo la fait revenir, puis
  // elle repart seule au bout de 2,5 s. En pause, elle reste.
  const [barShown, setBarShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const peekBar = () => {
    clearHide();
    setBarShown(true);
    hideTimer.current = setTimeout(() => {
      if (ref.current && !ref.current.paused) setBarShown(false);
    }, 2500);
  };
  useEffect(() => clearHide, []);

  useEffect(() => {
    const video = ref.current;
    // Les métadonnées peuvent être lues avant l'hydratation : leur événement est alors déjà passé.
    if (video && video.readyState >= 1) setDuration(video.duration);
    if (video && autoStart) {
      setStarted(true);
      void video.play().catch(() => undefined);
    }
  }, [autoStart]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    video.muted = !muted;
    setMuted(!muted);
  };

  const togglePlay = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      setStarted(true);
      setEnded(false);
      void video.play().catch(() => undefined);
    } else video.pause();
  };

  const seek = (value: number) => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = value;
    setTime(value);
    if (!video.paused) peekBar();
  };

  // Toucher la vidéo : pendant la lecture, la barre revient un instant (on met en pause avec son bouton) ; à l'arrêt, elle se lance.
  const onVideoClick = () => {
    const video = ref.current;
    if (video && !video.paused) peekBar();
    else togglePlay();
  };

  return (
    <div className={cn("mx-auto w-full", vertical ? "max-w-[380px]" : "mt-14 max-w-[1100px]", className)}>
      {/* Le son, HORS de l'image, au-dessus à droite (fondateur, 5 nov. 2026 : il prenait trop de place sur la vidéo). */}
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={toggle}
          aria-label={muted ? "Activer le son" : "Couper le son"}
          title={muted ? "Activer le son" : "Couper le son"}
          className="inline-flex size-9 items-center justify-center rounded-full border border-border-subtle bg-white/80 text-[#0F2F2A] shadow-sm backdrop-blur-md hover:bg-white"
        >
          {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
        </button>
      </div>
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[28px] border border-white/70 bg-[#0F2F2A] shadow-[0_40px_90px_-40px_rgba(15,47,42,0.6)]",
        frameClassName,
      )}
    >
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        onClick={onVideoClick}
        onPlay={() => {
          setPlaying(true);
          clearHide();
          setBarShown(false);
        }}
        onPause={() => {
          setPlaying(false);
          clearHide();
          setBarShown(true);
        }}
        onEnded={() => setEnded(true)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        className={cn("block w-full cursor-pointer object-cover", vertical ? "aspect-[9/16]" : "aspect-video")}
      />
      {/* Avant le premier clic, et une fois finie : un grand bouton au centre (« Lire » ou « Revoir »). */}
      {(!started || ended) && (
        <button type="button" onClick={togglePlay} aria-label={ended ? "Revoir la vidéo" : "Lire la vidéo"} className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/10">
          <span className="inline-flex items-center gap-2.5 rounded-full bg-white/95 px-6 py-3.5 text-[15px] font-semibold text-[#0F2F2A] shadow-xl">
            {ended ? <RotateCcw className="size-5" aria-hidden="true" /> : <Play className="size-5 fill-current" aria-hidden="true" />}
            {ended ? "Revoir" : "Lire la vidéo"}
          </span>
        </button>
      )}
      <div
        onPointerDown={() => playing && peekBar()}
        aria-hidden={!barShown}
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 pt-8 pb-3 text-white transition-opacity duration-200",
          barShown ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button type="button" onClick={togglePlay} aria-label={playing ? "Mettre en pause" : "Lire la vidéo"} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur-md hover:bg-white/25">
          {playing ? <Pause className="size-4 fill-current" aria-hidden="true" /> : <Play className="size-4 translate-x-px fill-current" aria-hidden="true" />}
        </button>
        <span className="shrink-0 font-mono text-[12px] tabular-nums">
          {clock(time)} <span className="text-white/60">/ {clock(duration)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Avancer ou revenir en arrière dans la vidéo"
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-brand-400"
        />
      </div>
    </div>
    </div>
  );
}

/** 75 s → « 01:15 ». */
function clock(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
