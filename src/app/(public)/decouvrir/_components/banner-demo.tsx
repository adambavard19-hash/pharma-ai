"use client";

import { useEffect, useRef } from "react";

/**
 * La bannière PharmaBoost du comptoir, VIVANTE : la même animation que sur le poste Windows (le robot qui respire et cligne des yeux,
 * « En attente de scan… », « Scan détecté ! », « 3 conseils disponibles », les conseils avec Challenge / Date courte / En stock,
 * Vendu / Non vendu, l'e-mail du patient, « Vente terminée ! »), qui recommence toute seule. Générée à partir du même design que la
 * bannière (agent/src/banner-design.ts) : public/site/banniere-demo.html.
 *
 * L'animation ne joue que lorsqu'elle est à l'écran. Un clic du visiteur lui rend la main : il peut essayer les boutons, ou aller à
 * l'une des six étapes.
 */
export function BannerDemo() {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const element = frame.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => element.contentWindow?.postMessage(entry.isIntersecting ? "pb-visible" : "pb-hidden", "*"),
      { threshold: 0.35 },
    );
    observer.observe(element);
    // Une page qui se charge après l'observateur reçoit quand même l'état courant.
    const onLoad = () => {
      const box = element.getBoundingClientRect();
      const shown = box.top < window.innerHeight * 0.65 && box.bottom > window.innerHeight * 0.35;
      if (shown) element.contentWindow?.postMessage("pb-visible", "*");
    };
    element.addEventListener("load", onLoad);
    return () => {
      observer.disconnect();
      element.removeEventListener("load", onLoad);
    };
  }, []);

  return (
    <iframe
      ref={frame}
      src="/site/banniere-demo.html?integre=1"
      title="La bannière PharmaBoost au comptoir : de « En attente de scan » à « Vente terminée »"
      loading="lazy"
      className="block h-[760px] w-full rounded-3xl border-0 sm:h-[700px]"
    />
  );
}
