"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * La capsule de l'île : un ruban noir, très arrondi, qui change de taille en RESSORT (léger dépassement puis retour)
 * selon ce qu'elle contient. La largeur est donnée par l'étape ; la hauteur suit le contenu, mesurée à chaque
 * changement. Le contenu change en fondu court. Idée de l'île : Coucou (MIT, voir THIRD_PARTY_NOTICES.md) ; le dessin,
 * les couleurs et le robot sont ceux de PharmaBoost.
 *
 * Animations coupées si la personne a demandé de réduire les mouvements (`motion-reduce`).
 */

export type IslandTone = "neutral" | "accent" | "warning" | "success" | "danger";

const TONE_RING: Record<IslandTone, string> = {
  neutral: "0 0 0 1px rgba(255,255,255,0.07)",
  accent: "0 0 0 1px rgba(54,232,200,0.35), 0 0 28px -6px rgba(54,232,200,0.45)",
  warning: "0 0 0 1.5px rgba(245,166,35,0.75), 0 0 32px -6px rgba(245,166,35,0.55)",
  success: "0 0 0 1px rgba(34,200,143,0.6), 0 0 30px -6px rgba(34,200,143,0.55)",
  danger: "0 0 0 1.5px rgba(255,92,92,0.85), 0 0 32px -6px rgba(255,92,92,0.6)",
};

export function IslandShell({
  width,
  tone = "neutral",
  contentKey,
  children,
  className,
  onPointerEnter,
  onPointerLeave,
  label,
  backdrop,
}: {
  width: number;
  tone?: IslandTone;
  /** Change quand le contenu change de nature : déclenche le fondu d'entrée. */
  contentKey: string;
  children: ReactNode;
  className?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  label: string;
  /** Un fond vivant posé derrière le contenu, coupé à la forme de l'île (l'hélice d'ADN de la bannière « mix »). */
  backdrop?: ReactNode;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = inner.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties = {
    width: `min(${width}px, calc(100vw - 24px))`,
    height: height ?? undefined,
    boxShadow: `${TONE_RING[tone]}, 0 18px 40px -14px rgba(0,0,0,0.55)`,
    borderRadius: height !== null && height > 60 ? 22 : 999,
  };

  return (
    <section
      aria-label={label}
      data-tone={tone}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        "relative overflow-hidden bg-[var(--isl-bg,#0F2F2A)] text-white",
        "transition-[width,height,border-radius,box-shadow] duration-[560ms] ease-[cubic-bezier(.3,1.45,.5,1)] motion-reduce:transition-none",
        className,
      )}
      style={style}
    >
      {backdrop && <div className="pointer-events-none absolute inset-0">{backdrop}</div>}
      <div ref={inner} className="relative">
        <div key={contentKey} className="isl-in">
          {children}
        </div>
      </div>
    </section>
  );
}

/** Le fondu d'entrée du contenu et l'apparition des lignes cochées : à poser une fois sur la page. */
export const ISLAND_CSS = `
@keyframes isl-in { from { opacity: 0; transform: translateY(4px) scale(.985); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
.isl-in { animation: isl-in .32s cubic-bezier(.2,.8,.2,1) .06s both; }
@keyframes isl-line { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
.isl-line { animation: isl-line .28s ease-out both; }
@keyframes isl-spin { to { transform: rotate(360deg); } }
.isl-spin { animation: isl-spin .9s linear infinite; }
@keyframes isl-scan { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }
.isl-scanbar { animation: isl-scan 1.1s cubic-bezier(.65,0,.35,1) infinite; }
/* Le scan : le laser sur le code-barres, la barre d'avancement, l'étape en cours qui scintille, le point qui pulse. */
.isl-barcode { position: relative; display: inline-flex; align-items: stretch; gap: 1.5px; height: 22px; padding: 0 4px; border-radius: 4px; background: rgba(255,255,255,.92); overflow: hidden; }
[data-isl] .font-bold { font-weight: 800; }
.isl-barcode i { display: block; background: #0B0F14; margin: 3px 0; }
.isl-barcode b { position: absolute; left: 0; right: 0; top: 0; height: 2px; background: #FF4D5E; box-shadow: 0 0 6px 1px rgba(255,77,94,.85); animation: isl-laser 1.1s ease-in-out infinite alternate; }
@keyframes isl-laser { from { transform: translateY(1px); } to { transform: translateY(19px); } }
.isl-progress { position: relative; height: 4px; border-radius: 4px; background: rgba(255,255,255,.08); overflow: hidden; }
.isl-progress span { position: relative; display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #1FBF8F, #58F2D8); transition: width .55s cubic-bezier(.3,.8,.3,1); overflow: hidden; }
.isl-progress span::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent); transform: translateX(-100%); animation: isl-glint 1.2s ease-in-out infinite; }
@keyframes isl-glint { to { transform: translateX(100%); } }
.isl-shimmer { color: rgba(255,255,255,.55); background: linear-gradient(90deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,.5) 40%, #fff 50%, rgba(255,255,255,.5) 60%, rgba(255,255,255,.5) 100%); background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: isl-shimmer 1.4s linear infinite; }
@keyframes isl-shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
.isl-pulse { position: relative; display: inline-block; }
.isl-pulse::before, .isl-pulse::after { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: #58F2D8; }
.isl-pulse::after { inset: 2px; background: transparent; border: 2px solid #58F2D8; animation: isl-ring 1.1s ease-out infinite; }
@keyframes isl-ring { from { transform: scale(.6); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
@keyframes isl-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
.isl-pop { animation: isl-pop .42s cubic-bezier(.3,1.5,.5,1) both; }
/* La fête d'une vente avec conseil vendu : le robot saute deux fois, les confettis partent de lui. */
@keyframes isl-cheer { 0% { transform: scale(.5) translateY(6px); } 30% { transform: scale(1.08) translateY(-8px); } 50% { transform: scale(1) translateY(0); } 68% { transform: translateY(-5px); } 84%, 100% { transform: none; } }
.isl-cheer { animation: isl-cheer 1.3s cubic-bezier(.3,1.4,.5,1) both; }
.isl-burst { position: absolute; left: 50%; top: 45%; pointer-events: none; }
.isl-burst i { position: absolute; width: 6px; height: 6px; margin: -3px; border-radius: 2px; background: var(--c); opacity: 0; animation: isl-burst 1.1s cubic-bezier(.2,.8,.3,1) .15s both; }
.isl-burst i:nth-child(2n) { border-radius: 50%; }
@keyframes isl-burst { 0% { opacity: 1; transform: rotate(var(--a)) translateX(0) scale(.4); } 70% { opacity: 1; } 100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scale(1) rotate(120deg); } }
.isl-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
.isl-scroll::-webkit-scrollbar { width: 5px; }
.isl-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.22); border-radius: 99px; }
/* La carte blanche ouverte (essai « L ») : la barre de défilement se voit, en vert (fondateur, 22 oct. 2026). */
[data-ile-mix-l-corps] { scrollbar-color: rgba(14,138,123,0.6) rgba(14,138,123,0.08); overflow-y: scroll; }
[data-ile-mix-l-corps]::-webkit-scrollbar { width: 6px; }
[data-ile-mix-l-corps]::-webkit-scrollbar-track { background: rgba(14,138,123,0.08); border-radius: 99px; }
[data-ile-mix-l-corps]::-webkit-scrollbar-thumb { background: rgba(14,138,123,0.6); border-radius: 99px; }
/* La photo du produit conseil flotte doucement (fondateur, 19 oct. 2026 : effet « 1 · Flottement » de /robot-apercu/animations). */
@keyframes isl-float { 0%,100% { transform: translateY(2px); } 50% { transform: translateY(-4px); } }
.isl-float { animation: isl-float 2.8s ease-in-out infinite; }
/* Le nom du produit conseil tombe d'en haut et rebondit deux fois avant de se poser, une fois, à l'arrivée du conseil et à chaque
   conseil suivant (fondateur, 21 oct. 2026 : essai « 1 · Tombe et rebondit » de /robot-apercu/noms ; plus de trait sous le nom). */
[data-ile-mix-titre] { display: inline-block; position: relative; animation: isl-tombe 1s both; }
@keyframes isl-tombe { 0% { transform: translateY(-26px); opacity: 0; animation-timing-function: cubic-bezier(.5,0,1,.6); } 33% { transform: translateY(0); opacity: 1; animation-timing-function: cubic-bezier(0,.4,.5,1); } 54% { transform: translateY(-9px); animation-timing-function: cubic-bezier(.5,0,1,.6); } 75% { transform: translateY(0); animation-timing-function: cubic-bezier(0,.4,.5,1); } 87% { transform: translateY(-3px); animation-timing-function: cubic-bezier(.5,0,1,.6); } 100% { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { [data-ile-mix-titre] { animation: none; } .isl-float { animation: none; } .isl-in, .isl-line, .isl-pop, .isl-cheer { animation: none; } .isl-burst { display: none; } .isl-spin, .isl-scanbar, .isl-barcode b, .isl-progress span::after, .isl-shimmer, .isl-pulse::after { animation: none; } .isl-shimmer { -webkit-text-fill-color: currentColor; } }
`;
