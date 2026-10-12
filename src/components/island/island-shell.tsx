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

export type IslandTone = "neutral" | "accent" | "warning" | "success";

const TONE_RING: Record<IslandTone, string> = {
  neutral: "0 0 0 1px rgba(255,255,255,0.07)",
  accent: "0 0 0 1px rgba(54,232,200,0.35), 0 0 28px -6px rgba(54,232,200,0.45)",
  warning: "0 0 0 1.5px rgba(245,166,35,0.75), 0 0 32px -6px rgba(245,166,35,0.55)",
  success: "0 0 0 1px rgba(34,200,143,0.6), 0 0 30px -6px rgba(34,200,143,0.55)",
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
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        "relative overflow-hidden bg-[#0B0F14] text-white",
        "transition-[width,height,border-radius,box-shadow] duration-[560ms] ease-[cubic-bezier(.3,1.45,.5,1)] motion-reduce:transition-none",
        className,
      )}
      style={style}
    >
      <div ref={inner}>
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
@keyframes isl-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
.isl-pop { animation: isl-pop .42s cubic-bezier(.3,1.5,.5,1) both; }
.isl-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
.isl-scroll::-webkit-scrollbar { width: 5px; }
.isl-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.22); border-radius: 99px; }
@media (prefers-reduced-motion: reduce) { .isl-in, .isl-line, .isl-pop { animation: none; } .isl-spin, .isl-scanbar { animation: none; } }
`;
