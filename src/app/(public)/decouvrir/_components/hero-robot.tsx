"use client";

import { useEffect, useState } from "react";
import { Robot, RobotSoundToggle } from "@/components/robot";
import { HERO_LINE_MS, HERO_LINES } from "@/core/robot/companion";
import { cn } from "@/lib/utils";

/**
 * Le grand robot de l'accueil du site, à côté de « Scan. Conseil. Bilan. » : il flotte, salue d'un coucou à
 * l'arrivée, suit la souris des yeux, rit quand on le touche (et a le tournis si l'on insiste), et dit bonjour dans
 * sa bulle — une phrase à la fois, à tour de rôle. Ses sons partent après le premier geste de la personne (règle des
 * navigateurs) ; le haut-parleur à côté de lui les coupe.
 *
 * La première phrase est celle du rendu serveur : la rotation ne commence qu'après l'hydratation (aucun écart).
 */
export function HeroRobot({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIndex((current) => (current + 1) % HERO_LINES.length), HERO_LINE_MS);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <div data-robot-hero="" className={cn("relative flex flex-col items-center", className)}>
      <p
        key={index}
        aria-live="polite"
        className="rbt-bubble relative z-10 mb-1 w-max max-w-[10.5rem] rounded-2xl max-sm:absolute max-sm:right-0 max-sm:bottom-full max-sm:mb-0 max-sm:after:right-[49px] max-sm:after:left-auto max-sm:after:translate-x-0 sm:max-w-[13rem] border border-border-subtle bg-surface-card px-3.5 py-2 text-center text-[13.5px] leading-[1.3] font-medium text-text-primary shadow-card after:absolute after:-bottom-[7px] after:left-1/2 after:size-3 after:-translate-x-1/2 after:rotate-45 after:border-r after:border-b after:border-border-subtle after:bg-surface-card sm:text-[14.5px]"
      >
        {HERO_LINES[index]}
      </p>
      <div
        className="relative"
        onPointerDown={(event) => {
          // Toucher le robot fait passer à la phrase suivante (le haut-parleur, lui, ne fait que couper le son).
          if (!(event.target as Element).closest("button")) setIndex((index + 1) % HERO_LINES.length);
        }}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        <Robot
          floating
          track
          interactive
          greet="once"
          greetKey="site"
          sound="site"
          className="h-[134px] w-[110px] drop-shadow-[0_18px_24px_rgba(15,60,70,0.18)] sm:h-[176px] sm:w-[144px] lg:h-[220px] lg:w-[180px]"
        />
        <RobotSoundToggle where="site" className="absolute right-0 bottom-1 border border-border-subtle bg-surface-card/90 shadow-sm backdrop-blur-sm sm:-right-1" />
      </div>
    </div>
  );
}
