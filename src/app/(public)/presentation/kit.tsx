"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Les briques des diapositives : délai d'entrée, titres, verre, compteur animé. */

export const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Kick({ children, deep = false, delay = 0 }: { children: ReactNode; deep?: boolean; delay?: number }) {
  return (
    <p className={cn("pz-in inline-flex w-fit items-center gap-2 self-start rounded-full border px-5 py-2 text-[19px] font-semibold backdrop-blur-md", deep ? "border-white/15 bg-white/10 text-[#7FE0C4]" : "border-white/80 bg-white/65 text-brand-800")} style={d(delay)}>
      <span className={cn("size-1.5 rounded-full", deep ? "bg-[#7FE0C4]" : "bg-brand-500")} />
      {children}
    </p>
  );
}

export function Title({ children, className, delay = 120, deep = false }: { children: ReactNode; className?: string; delay?: number; deep?: boolean }) {
  return (
    <h2 className={cn("pz-in mt-5 text-[62px] leading-[1.03] font-bold tracking-[-0.045em] text-balance", deep ? "text-white" : "text-text-primary", className)} style={d(delay)}>
      {children}
    </h2>
  );
}

export function Grad({ children, deep = false }: { children: ReactNode; deep?: boolean }) {
  return <span className={cn("bg-clip-text text-transparent", deep ? "bg-gradient-to-r from-[#7FE0C4] to-[#E8FF9C]" : "bg-gradient-to-r from-brand-600 to-[#0796b4]")}>{children}</span>;
}

export function Lead({ children, className, delay = 240, deep = false }: { children: ReactNode; className?: string; delay?: number; deep?: boolean }) {
  return (
    <p className={cn("pz-in mt-5 text-[25px] leading-[1.5]", deep ? "text-white/75" : "text-text-secondary", className)} style={d(delay)}>
      {children}
    </p>
  );
}

export function Glass({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("pz-glass rounded-[32px]", className)} style={style}>
      {children}
    </div>
  );
}

/** Un point de liste, avec son icône dans une pastille menthe. */
export function Point({ icon, children, delay, deep = false }: { icon: ReactNode; children: ReactNode; delay: number; deep?: boolean }) {
  return (
    <li className={cn("pz-left flex items-center gap-4 rounded-full border px-5 py-3.5 text-[22px] font-medium", deep ? "border-white/15 bg-white/8 text-white" : "border-white/80 bg-white/60 text-text-primary backdrop-blur-md")} style={d(delay)}>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", deep ? "bg-[#7FE0C4]/15 text-[#7FE0C4]" : "bg-brand-50 text-brand-700")}>{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/** Un nombre qui monte jusqu'à sa valeur à l'arrivée (et à chaque changement de cible). */
export function useCountUp(target: number, ms = 1200, delay = 0): number {
  const [value, setValue] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const from = current.current;
    const timer = window.setTimeout(() => {
      const step = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / ms);
        const eased = 1 - Math.pow(1 - p, 3);
        current.current = from + (target - from) * eased;
        setValue(current.current);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, ms, delay]);
  return value;
}

export function Count({ to, format = (n) => Math.round(n).toLocaleString("fr-FR"), ms, delay, className }: { to: number; format?: (n: number) => string; ms?: number; delay?: number; className?: string }) {
  const value = useCountUp(to, ms, delay);
  return <span className={cn("tabular-nums", className)}>{format(value)}</span>;
}

export const euros = (n: number, decimals = 0) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} €`;

/** Un téléphone d'exemple, à la façon du site. */
export function Phone({ children, className, width = 330 }: { children: ReactNode; className?: string; width?: number }) {
  return (
    <div className={cn("relative rounded-[48px] border border-black/10 bg-[#0B0F14] p-3 shadow-[0_50px_100px_-40px_rgba(15,23,42,0.65)]", className)} style={{ width }}>
      <div className="relative overflow-hidden rounded-[38px] bg-[#F4F7F6]">
        <div className="flex items-center justify-between px-6 pt-4 text-[12px] font-semibold text-[#0F2B26]">
          <span>9:41</span>
          <span className="h-6 w-24 rounded-full bg-[#0B0F14]" />
          <span>100 %</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ExampleMark({ deep = false, className }: { deep?: boolean; className?: string }) {
  return <span className={cn("font-mono text-[12px] tracking-[0.12em] uppercase", deep ? "text-white/50" : "text-text-tertiary", className)}>Exemple</span>;
}
