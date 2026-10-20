"use client";

import { useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

/**
 * La présentation de PharmaBoost, lancée d'elle-même sous le héros de l'accueil, comme sur limova.ai (fondateur, 20 oct. 2026).
 * Sans le son au départ (tout navigateur l'exige pour une lecture automatique).
 */
export function AutoVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (muted) video.currentTime = 0;
    video.muted = !muted;
    setMuted(!muted);
    void video.play().catch(() => undefined);
  };
  return (
    <div className="relative mx-auto mt-14 w-full max-w-[1100px] overflow-hidden rounded-[28px] border border-white/70 bg-[#0F2F2A] shadow-[0_40px_90px_-40px_rgba(15,47,42,0.6)]">
      <video ref={ref} src={src} poster={poster} autoPlay muted loop playsInline preload="metadata" className="block aspect-video w-full object-cover" />
      <button type="button" onClick={toggle} className="absolute top-4 right-4 inline-flex items-center gap-2 rounded-full bg-black/45 px-3.5 py-2 text-[13px] font-semibold text-white backdrop-blur-md hover:bg-black/60">
        {muted ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
        {muted ? "Activer le son" : "Couper le son"}
      </button>
    </div>
  );
}
