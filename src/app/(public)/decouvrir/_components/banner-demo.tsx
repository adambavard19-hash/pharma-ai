"use client";

import { useEffect, useRef } from "react";

/**
 * La bannière PharmaBoost du comptoir, VIVANTE : la même animation que sur le poste Windows (le robot qui respire et cligne des yeux),
 * en deux ventes courtes qui recommencent toutes seules. D'abord une ordonnance : la mise en garde du moteur en tête (3 g de paracétamol
 * par jour au maximum, un Fervex en contient déjà), les conseils avec Challenge / Date courte / stock exact, Vendu / Non vendu, l'e-mail
 * du patient, « Vente terminée ! ». Puis un DOLIPRANE seul : « Une question à poser » — pourquoi, puis où — avant de proposer la poche
 * de la bonne zone. Générée à partir du même design que la bannière (agent/src/banner-design.ts) : public/site/banniere-demo.html.
 *
 * L'animation ne joue que lorsqu'elle est à l'écran. Un clic du visiteur lui rend la main : il peut essayer les boutons, ou aller à
 * l'une des sept étapes. Elle annonce sa hauteur (message « pb-height », redemandée par « pb-mesure » quand elle s'est chargée avant
 * cette page) : le cadre la prend, sans barre de défilement intérieure ; les hauteurs des classes ne servent qu'en attendant.
 */
export function BannerDemo() {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    // Seule la démonstration elle-même (même origine, ce cadre-ci) règle la hauteur, et dans des bornes raisonnables.
    const onMessage = (event: MessageEvent) => {
      if (event.source !== element.contentWindow || event.origin !== window.location.origin) return;
      const data: unknown = event.data;
      if (typeof data !== "object" || data === null || (data as { type?: unknown }).type !== "pb-height") return;
      const height = (data as { height?: unknown }).height;
      if (typeof height === "number" && height >= 300 && height <= 1600) element.style.height = `${Math.ceil(height)}px`;
    };
    window.addEventListener("message", onMessage);
    element.contentWindow?.postMessage("pb-mesure", "*");
    if (typeof IntersectionObserver === "undefined") return () => window.removeEventListener("message", onMessage);
    const observer = new IntersectionObserver(
      ([entry]) => element.contentWindow?.postMessage(entry.isIntersecting ? "pb-visible" : "pb-hidden", "*"),
      { threshold: 0.35 },
    );
    observer.observe(element);
    // Une page qui se charge après l'observateur reçoit quand même l'état courant.
    const onLoad = () => {
      element.contentWindow?.postMessage("pb-mesure", "*");
      const box = element.getBoundingClientRect();
      const shown = box.top < window.innerHeight * 0.65 && box.bottom > window.innerHeight * 0.35;
      if (shown) element.contentWindow?.postMessage("pb-visible", "*");
    };
    element.addEventListener("load", onLoad);
    return () => {
      window.removeEventListener("message", onMessage);
      observer.disconnect();
      element.removeEventListener("load", onLoad);
    };
  }, []);

  return (
    <iframe
      ref={frame}
      src="/site/banniere-demo.html?integre=1"
      title="La bannière PharmaBoost au comptoir : une mise en garde, une question à poser, les conseils, jusqu'à « Vente terminée »"
      loading="lazy"
      className="block h-[540px] w-full rounded-3xl border-0 sm:h-[780px]"
    />
  );
}
