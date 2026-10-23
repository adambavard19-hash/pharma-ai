"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Une boîte de complément alimentaire, tirée au hasard, qui descend le long du site quand on défile : elle suit le
 * défilement avec du retard (elle flotte au lieu de tomber), se balance et respire. Décor seulement : aucun clic, rien sous
 * la souris, absente si le visiteur a demandé moins d'animations. Les photos sont les photos studio du catalogue, détourées.
 *
 * Essai du fondateur (23 oct. 2026), quatre façons de flotter à comparer sur /decouvrir/apercu-boite.
 */

export const SUPPLEMENTS = [
  { src: "/site/complements/mag2.png", alt: "Mag 2 24 H" },
  { src: "/site/complements/vitamine-c.png", alt: "Vitamine C UPSA" },
  { src: "/site/complements/collagene-marin.png", alt: "Collagène marin Nat&Form" },
  { src: "/site/complements/collagene-poudre.png", alt: "Collagène marin en poudre Nat&Form" },
  { src: "/site/complements/canneberge.png", alt: "Canneberge Nat&Form" },
  { src: "/site/complements/artichaut.png", alt: "Artichaut Nat&Form" },
  { src: "/site/complements/ergynatal.png", alt: "Ergynatal" },
] as const;

export type FallStyle = "feuille" | "apesanteur" | "bulle" | "trio";

type Body = { src: string; x: number; size: number; depth: number; phase: number };

export function FallingSupplement({ style }: { style: FallStyle }) {
  const [bodies, setBodies] = useState<Body[] | null>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  // Le tirage se fait à la première image affichée : le serveur et le navigateur dessinent donc la même page.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = requestAnimationFrame(() => {
      const pool = [...SUPPLEMENTS].sort(() => Math.random() - 0.5);
      const right = Math.random() < 0.5;
      setBodies(
        style === "trio"
          ? [
              { src: pool[0].src, x: right ? 0.93 : 0.07, size: 1, depth: 1, phase: 0 },
              { src: pool[1].src, x: right ? 0.06 : 0.94, size: 0.75, depth: 0.75, phase: 2.1 },
              { src: pool[2].src, x: right ? 0.965 : 0.035, size: 0.5, depth: 0.5, phase: 4.2 },
            ]
          : [{ src: pool[0].src, x: right ? 0.93 : 0.07, size: 1, depth: 1, phase: 0 }],
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [style]);

  useEffect(() => {
    if (!bodies) return;
    let smooth = bodies.map(() => 0);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const target = max > 0 ? window.scrollY / max : 0;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const base = Math.min(130, Math.max(64, vw * 0.075));
      smooth = smooth.map((s, i) => s + (target - s) * (0.025 + 0.03 * bodies[i].depth));
      bodies.forEach((b, i) => {
        const el = refs.current[i];
        if (!el) return;
        const s = smooth[i];
        // Le retard sur le défilement : c'est lui qui donne la chute lente, puis la boîte rattrape et se pose.
        const lag = target - s;
        const size = base * b.size;
        let x = b.x * vw - size / 2;
        let y = -size * 1.4 + s * (vh + size * 0.6) * 0.92;
        let transform = "";
        if (style === "feuille") {
          // Comme une feuille : elle glisse d'un côté à l'autre, penche dans le sens où elle glisse.
          const sway = Math.sin(s * 14 + t * 0.6);
          x += sway * Math.min(70, vw * 0.04);
          transform = `rotate(${sway * 16 + lag * 120}deg)`;
          y += Math.cos(s * 28 + t * 1.2) * 6;
        } else if (style === "apesanteur") {
          // En apesanteur : elle tourne lentement sur elle-même, en 3D, et respire.
          y += Math.sin(t * 1.1) * 10;
          transform = `perspective(700px) rotateY(${Math.sin(t * 0.5 + s * 6) * 38}deg) rotateX(${Math.cos(t * 0.4) * 10 + lag * 160}deg) rotate(${Math.sin(t * 0.3) * 6}deg)`;
        } else if (style === "bulle") {
          // Dans une bulle : elle remonte un peu quand on s'arrête, comme si l'air la portait.
          y += Math.sin(t * 0.9) * 14 - Math.abs(lag) * 60;
          x += Math.sin(t * 0.45) * 12;
          transform = `rotate(${Math.sin(t * 0.7) * 5 + lag * 60}deg) scale(${1 + Math.sin(t * 1.8) * 0.015})`;
        } else {
          // Le trio : trois boîtes à trois profondeurs, les plus petites plus lentes et plus floues.
          y = -size * 1.4 + s * (vh + size * 0.6) * (0.75 + 0.2 * b.depth) + Math.sin(t * (0.6 + b.depth * 0.5) + b.phase) * 10;
          x += Math.sin(t * 0.35 + b.phase) * 18 * b.depth;
          transform = `rotate(${Math.sin(t * 0.5 + b.phase) * 14 + lag * 90}deg)`;
        }
        el.style.width = `${size}px`;
        el.style.translate = `${x}px ${y}px`;
        el.style.transform = transform;
        el.style.opacity = s < 0.002 && target < 0.002 ? "0" : "1";
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bodies, style]);

  if (!bodies) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {bodies.map((b, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="absolute top-0 left-0 opacity-0 transition-opacity duration-700 will-change-transform"
          style={{ filter: b.depth < 0.6 ? "blur(1.5px)" : undefined }}
        >
          {style === "bulle" && (
            <div className="absolute top-1/2 left-1/2 aspect-square w-[165%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-gradient-to-br from-white/50 via-brand-100/30 to-brand-300/20 shadow-[inset_-10px_-14px_30px_rgba(7,150,180,0.18),inset_10px_10px_24px_rgba(255,255,255,0.7)] backdrop-blur-[1px]" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- décor animé à chaque image : une simple balise suffit */}
          <img src={b.src} alt="" draggable={false} className="relative block h-auto w-full drop-shadow-[0_18px_22px_rgba(15,40,40,0.28)]" />
        </div>
      ))}
    </div>
  );
}
