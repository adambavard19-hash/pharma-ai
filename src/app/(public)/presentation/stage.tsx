"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Maximize2, X } from "lucide-react";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { cn } from "@/lib/utils";

/**
 * La scène de la présentation (conférence de Donna aux titulaires, 14 nov. 2026) : une toile fixe de 1600 × 900 mise à l'échelle
 * de l'écran (iPad en paysage, projecteur 1920 × 1080), l'encre ADN du site derrière. Diapositive suivante : glisser, toucher le
 * tiers droit, flèche droite ou espace ; précédente : l'inverse. Appui long ou bouton « Sommaire » : toutes les diapositives.
 * `#12` dans l'adresse ouvre la 12e. `?notes=1` montre les notes de l'orateur sous la scène (jamais sur la scène).
 */

export const STAGE_W = 1600;
export const STAGE_H = 900;

export type Slide = { id: string; title: string; notes: string; tone?: "light" | "deep"; render: () => ReactNode };

/** Ce qu'un toucher ne doit pas prendre pour « diapositive suivante ». */
const INTERACTIVE = "button, a, input, select, textarea, label, video, [data-int]";

export const STAGE_CSS = `
.pz-in{animation:pz-in .85s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}
@keyframes pz-in{from{opacity:0;transform:translateY(30px);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}
.pz-fade{animation:pz-fade 1s ease both;animation-delay:var(--d,0ms)}
@keyframes pz-fade{from{opacity:0}to{opacity:1}}
.pz-pop{animation:pz-pop .55s cubic-bezier(.2,.9,.3,1.35) both;animation-delay:var(--d,0ms)}
@keyframes pz-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.pz-drop{animation:pz-drop .7s cubic-bezier(.2,.9,.3,1.1) both}
@keyframes pz-drop{from{opacity:0;transform:translateY(-30px) scale(.94)}to{opacity:1;transform:none}}
.pz-left{animation:pz-left .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}
@keyframes pz-left{from{opacity:0;transform:translateX(-50px)}to{opacity:1;transform:none}}
.pz-right{animation:pz-right .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}
@keyframes pz-right{from{opacity:0;transform:translateX(50px)}to{opacity:1;transform:none}}
.pz-float{animation:pz-float 6s ease-in-out infinite}
@keyframes pz-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
.pz-glow{animation:pz-glow 2.4s ease-in-out infinite}
@keyframes pz-glow{0%,100%{box-shadow:0 0 0 0 rgba(14,138,123,.45)}50%{box-shadow:0 0 0 18px rgba(14,138,123,0)}}
.pz-pulse{animation:pz-pulse 1.8s ease-out infinite}
@keyframes pz-pulse{0%{transform:scale(.6);opacity:.8}100%{transform:scale(2.4);opacity:0}}
.pz-bar{transform-origin:left;animation:pz-bar 1.2s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}
@keyframes pz-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pz-draw{stroke-dasharray:var(--len,600);stroke-dashoffset:var(--len,600);animation:pz-draw 1.4s ease forwards;animation-delay:var(--d,0ms)}
@keyframes pz-draw{to{stroke-dashoffset:0}}
.pz-type::after{content:"";display:inline-block;width:2px;height:1em;margin-left:3px;vertical-align:-2px;background:currentColor;animation:pz-caret .8s steps(1) infinite}
@keyframes pz-caret{50%{opacity:0}}
.pz-glass{background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.85);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 30px 80px -40px rgba(15,47,42,.45)}
.pz-slide-enter{animation:pz-slide .6s cubic-bezier(.2,.8,.2,1) both}
@keyframes pz-slide{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.pz-in,.pz-fade,.pz-pop,.pz-drop,.pz-left,.pz-right,.pz-float,.pz-glow,.pz-pulse,.pz-bar,.pz-slide-enter{animation:none!important}.pz-draw{animation:none;stroke-dashoffset:0}}
`;

function readHash(count: number): number {
  const n = Number.parseInt(window.location.hash.replace("#", ""), 10);
  return Number.isFinite(n) && n >= 1 && n <= count ? n - 1 : 0;
}

export function Stage({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(0);
  const [grid, setGrid] = useState(false);
  const [notes, setNotes] = useState(false);
  const ready = useRef(false);
  const press = useRef<{ x: number; y: number; t: number; timer: number | null; long: boolean } | null>(null);
  const count = slides.length;

  const go = useCallback((n: number) => setIndex(Math.max(0, Math.min(count - 1, n))), [count]);

  // L'adresse : #n à l'arrivée, puis suivie à chaque diapositive (et l'inverse si l'on retape l'adresse).
  useEffect(() => {
    const onHash = () => setIndex(readHash(count));
    const first = requestAnimationFrame(() => {
      onHash();
      ready.current = true;
      setNotes(new URLSearchParams(window.location.search).get("notes") === "1");
    });
    window.addEventListener("hashchange", onHash);
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("hashchange", onHash);
    };
  }, [count]);
  useEffect(() => {
    const hash = `#${index + 1}`;
    if (ready.current && window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }, [index]);

  // L'échelle : la toile entière tient dans l'écran (moins la place des notes quand elles sont montrées).
  useEffect(() => {
    const fit = () => {
      const h = notes ? window.innerHeight * 0.68 : window.innerHeight;
      setScale(Math.min(window.innerWidth / STAGE_W, h / STAGE_H));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [notes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.key === "Escape") return setGrid(false);
      if (grid) return;
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(event.key)) {
        event.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "Home") go(0);
      else if (event.key === "End") go(count - 1);
      else if (event.key.toLowerCase() === "g") setGrid(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, grid, count]);

  const onPointerDown = (event: React.PointerEvent) => {
    const interactive = Boolean((event.target as HTMLElement).closest(INTERACTIVE));
    const timer = interactive ? null : window.setTimeout(() => {
      if (press.current) press.current.long = true;
      setGrid(true);
    }, 650);
    press.current = { x: event.clientX, y: event.clientY, t: Date.now(), timer, long: false };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const p = press.current;
    if (p?.timer && Math.hypot(event.clientX - p.x, event.clientY - p.y) > 12) {
      window.clearTimeout(p.timer);
      p.timer = null;
    }
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.timer) window.clearTimeout(p.timer);
    if (p.long) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    const interactive = Boolean((event.target as HTMLElement).closest(INTERACTIVE));
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if ((event.target as HTMLElement).closest("input")) return;
      go(index + (dx < 0 ? 1 : -1));
      return;
    }
    if (interactive || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const x = event.clientX / window.innerWidth;
    if (x > 2 / 3) go(index + 1);
    else if (x < 1 / 3) go(index - 1);
  };

  const fullscreen = () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  };

  const slide = slides[index];
  return (
    <div className="fixed inset-0 flex touch-pan-y flex-col items-center overflow-hidden bg-[#EAF3EF] text-text-primary select-none" style={{ WebkitTouchCallout: "none" }}>
      <style>{STAGE_CSS}</style>
      <HelixBackdrop framing="hero" lightWhenStill />
      <div className={cn("pointer-events-none absolute inset-0 transition-opacity duration-700", slide.tone === "deep" ? "opacity-100" : "opacity-0")} style={{ background: "radial-gradient(120% 90% at 30% 20%, #0F4A42 0%, #0B2F2A 55%, #071F1C 100%)" }} />

      <div className="relative flex flex-1 items-center justify-center" style={{ width: "100%" }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onContextMenu={(e) => e.preventDefault()}>
        {scale > 0 && (
          <div className="relative shrink-0" style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
            <div className="absolute top-0 left-0 origin-top-left" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
              <div key={slide.id} className="pz-slide-enter absolute inset-0">
                {slide.render()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* La barre de progression, discrète, et les commandes. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-black/5">
        <div className="h-full bg-gradient-to-r from-brand-500 to-[#0796b4] transition-[width] duration-500" style={{ width: `${((index + 1) / count) * 100}%` }} />
      </div>
      <div className={cn("absolute right-4 bottom-4 flex items-center gap-2 text-[13px] font-semibold", slide.tone === "deep" ? "text-white/70" : "text-text-tertiary")} style={notes ? { bottom: "calc(32vh + 12px)" } : undefined}>
        <button type="button" aria-label="Précédente" onClick={() => go(index - 1)} className="grid size-9 place-items-center rounded-full bg-white/50 backdrop-blur-md hover:bg-white/80">
          <ChevronLeft className="size-4" />
        </button>
        <span className="tabular-nums">
          {index + 1} / {count}
        </span>
        <button type="button" aria-label="Suivante" onClick={() => go(index + 1)} className="grid size-9 place-items-center rounded-full bg-white/50 backdrop-blur-md hover:bg-white/80">
          <ChevronRight className="size-4" />
        </button>
        <button type="button" aria-label="Sommaire" onClick={() => setGrid(true)} className="grid size-9 place-items-center rounded-full bg-white/50 backdrop-blur-md hover:bg-white/80">
          <LayoutGrid className="size-4" />
        </button>
        <button type="button" aria-label="Plein écran" onClick={fullscreen} className="grid size-9 place-items-center rounded-full bg-white/50 backdrop-blur-md hover:bg-white/80">
          <Maximize2 className="size-4" />
        </button>
      </div>

      {notes && (
        <div className="relative z-10 h-[32vh] w-full overflow-y-auto border-t border-black/10 bg-[#0B2F2A] px-8 py-5 text-[18px] leading-8 text-white/90 select-text">
          <p className="text-[12px] font-bold tracking-[0.16em] text-[#7FE0C4] uppercase">
            Notes · {index + 1}. {slide.title}
          </p>
          <p className="mt-2 max-w-5xl">{slide.notes}</p>
        </div>
      )}

      {grid && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-[#0B2F2A]/92 p-8 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <p className="text-[14px] font-bold tracking-[0.16em] text-[#7FE0C4] uppercase">Sommaire</p>
            <button type="button" aria-label="Fermer" onClick={() => setGrid(false)} className="grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <X className="size-5" />
            </button>
          </div>
          <ol className="mx-auto mt-6 grid max-w-6xl grid-cols-2 gap-3 md:grid-cols-4">
            {slides.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    go(i);
                    setGrid(false);
                  }}
                  className={cn("flex h-24 w-full flex-col justify-between rounded-2xl border p-4 text-left transition-colors", i === index ? "border-[#7FE0C4] bg-white/15" : "border-white/10 bg-white/5 hover:bg-white/10")}
                >
                  <span className="text-[12px] font-bold text-[#7FE0C4] tabular-nums">{i + 1}</span>
                  <span className="text-[15px] leading-tight font-semibold text-white">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
