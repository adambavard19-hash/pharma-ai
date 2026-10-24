"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

/**
 * La présentation de PharmaBoost, lancée d'elle-même sous le héros de l'accueil, comme sur limova.ai (fondateur, 20 oct. 2026).
 *
 * Avec le son dès que possible (fondateur, 23 oct. 2026) : elle essaie d'abord de démarrer avec le son (certains navigateurs
 * l'acceptent, pour un visiteur qui revient souvent). Refusé — le cas le plus courant, aucun navigateur ne laisse une page
 * jouer du son avant un geste du visiteur —, elle tourne sans le son, et le son s'active au premier clic, toucher ou touche du
 * clavier n'importe où sur la page, la vidéo repartant du début. Le défilement seul ne compte pas comme un geste pour le
 * navigateur. Un visiteur qui a coupé le son lui-même n'est jamais contredit.
 */
export function AutoVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  // Le visiteur a choisi lui-même (bouton) : on ne touche plus au son.
  const chosen = useRef(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    const unmuteOnGesture = () => {
      events.forEach((name) => window.removeEventListener(name, unmuteOnGesture, true));
      if (chosen.current || !video.muted) return;
      video.currentTime = 0;
      video.muted = false;
      setMuted(false);
      void video.play().catch(() => {
        video.muted = true;
        setMuted(true);
      });
    };
    video.muted = false;
    video
      .play()
      .then(() => setMuted(false))
      .catch(() => {
        video.muted = true;
        setMuted(true);
        void video.play().catch(() => undefined);
        events.forEach((name) => window.addEventListener(name, unmuteOnGesture, { capture: true, passive: true }));
      });
    return () => events.forEach((name) => window.removeEventListener(name, unmuteOnGesture, true));
  }, []);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    chosen.current = true;
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
