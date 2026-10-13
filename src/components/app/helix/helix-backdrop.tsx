"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { DnaInkScene } from "./helix-scene";

/**
 * Le fond de la page « Au comptoir » : l'hélice d'ADN qui lâche son encre, en WebGL — adaptée de Dantora (domaine
 * public, licence Unlicense) : src/components/scene/dna-ink/dna-ink.tsx et le montage du héros
 * (src/views/home/sections/hero.tsx). La scène elle-même (helix-scene.ts, helix-shaders.ts, helix-config.ts) est
 * recopiée telle quelle.
 *
 * Comme dans le héros Dantora, le canvas couvre tout le fond (ici : toute la fenêtre, en position fixe, derrière le
 * menu, la barre du haut et le contenu) et l'hélice est décalée à droite (la boîte du canvas déborde à droite, coupée). Il ne reçoit aucun
 * clic (`pointer-events: none`) : le pointeur est lu sur `window` et ramené au rectangle du canvas, si bien que le
 * contenu posé par-dessus reste cliquable et que l'hélice se déforme sous la souris partout.
 *
 * Rien au rendu serveur ni dans les tests (jsdom), rien en mode sombre (l'encre se mélange en MULTIPLY sur un papier
 * clair) ; three.js n'est chargé qu'après la première peinture. Une image fixe pour qui a demandé moins d'animations et
 * sur écran tactile (pas de curseur à suivre). Aucune image quand l'onglet est caché ou le canvas hors de l'écran.
 */

/**
 * Le cadrage de la boîte du canvas (débordante, coupée par la couche) :
 *  - `hero` : celui du héros Dantora, boîte de 1140 px à x = 361 sur 1440 (25 % / 79 %) — l'hélice à droite du texte
 *    (page de connexion) ;
 *  - `app` : toute la fenêtre décalée de 12 % vers la gauche sur grand écran — l'hélice reste à droite du menu de
 *    320 px et son extrémité inclinée, avec son encre, passe derrière le menu de verre (« Au comptoir »).
 */
const FRAMING = {
  hero: "lg:left-[25%] lg:w-[79%]",
  app: "lg:-left-[12%]",
} as const;

/**
 * Garde-fou d'un poste d'officine lent (non mesurable ici : la mise au point s'est faite sur un Apple M4, où une image
 * pleine fenêtre coûte ~8 ms). Sur 90 images, si l'intervalle médian dépasse 40 ms (moins de 25 i/s — au-dessus de
 * la limitation à 30 i/s qu'un navigateur impose à une fenêtre masquée), on allège d'un cran : d'abord la densité de
 * pixels à 1, puis les points de moitié (20 000 hélice / 80 000 encre), puis encore de moitié. Jamais d'aller-retour.
 */
const SLOW_MEDIAN_MS = 40;
const SAMPLE_FRAMES = 90;

/**
 * Les options du site public (/decouvrir), toutes facultatives : sans elles, le fond reste exactement celui de la
 * connexion et d'« Au comptoir » (couche fixe sur toute la fenêtre, montée dès la première peinture).
 *  - `position="contained"` : la couche couvre son parent positionné (une section) au lieu de la fenêtre ;
 *  - `lazy` : la scène ne se monte que lorsque le parent arrive à moins d'un écran de la vue, et se démonte (WebGL
 *    libéré) quand il s'en éloigne — une seconde apparition plus bas ne coexiste ainsi jamais avec la première ;
 *  - `desktopOnly` : rien sous 1024 px (ni three.js, ni canvas) — la seconde apparition, comme le bloc Contact Dantora ;
 *  - `lightWhenStill` : figée (pointeur grossier, moins d'animations), la scène dessine une seule image avec deux fois
 *    moins de points et une densité de pixels de 1 — l'image fixe des téléphones.
 */
type HelixBackdropProps = {
  className?: string;
  framing?: keyof typeof FRAMING;
  position?: "fixed" | "contained";
  lazy?: boolean;
  desktopOnly?: boolean;
  lightWhenStill?: boolean;
};

export function HelixBackdrop({ className, framing = "app", position = "fixed", lazy = false, desktopOnly = false, lightWhenStill = false }: HelixBackdropProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer) return;
    if (/jsdom/i.test(navigator.userAgent)) return;
    if (document.documentElement.classList.contains("dark")) return;
    if (typeof WebGLRenderingContext === "undefined") return;
    if (desktopOnly && !window.matchMedia("(min-width: 1024px)").matches) return;

    // Un pointeur grossier n'a pas de curseur à suivre (Dantora n'écoute alors rien) ; ici la scène s'y fige aussi.
    const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
    const still = !hasFinePointer || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Chaque montage a son numéro : un chargement parti avant un démontage (lazy) ne monte jamais une seconde scène.
    let generation = 0;
    let cleanup: (() => void) | undefined;

    const start = async (gen: number) => {
      const [{ DnaInkScene: Scene }, { DNA_INK_CONFIG }] = await Promise.all([import("./helix-scene"), import("./helix-config")]);
      if (gen !== generation) return;
      layer.hidden = false;
      let config =
        still && lightWhenStill
          ? { ...DNA_INK_CONFIG, maxPixelRatio: 1, helixCount: DNA_INK_CONFIG.helixCount / 2, inkCount: DNA_INK_CONFIG.inkCount / 2 }
          : DNA_INK_CONFIG;
      const scene: DnaInkScene = new Scene(canvas, config);
      scene.setFrozen(still);
      if (process.env.NODE_ENV === "development") (window as unknown as { __helix?: DnaInkScene }).__helix = scene;

      // Redimensionnement au pixel entier seulement (Dantora) : les dérives sous-pixel ne touchent pas la caméra.
      let lastWidth = 0;
      let lastHeight = 0;
      let dirty = true;
      const syncSize = () => {
        const rect = canvas.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        scene.setSize(width, height);
        dirty = true;
      };
      syncSize();
      const resizeObserver = new ResizeObserver(syncSize);
      resizeObserver.observe(canvas);

      let visible = true;
      const handlePointerMove = (event: PointerEvent) => {
        if (!visible) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        scene.setPointer(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
      };
      const handlePointerLeave = () => scene.clearPointer();
      if (!still) {
        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        document.documentElement.addEventListener("mouseleave", handlePointerLeave);
      }

      // La boucle : visibilité lue sur le rectangle à chaque image (Dantora : un IntersectionObserver « collait »).
      let frame = 0;
      const tick = () => {
        frame = requestAnimationFrame(tick);
        if (document.hidden) return;
        const rect = canvas.getBoundingClientRect();
        const onScreen = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
        if (!onScreen) {
          if (visible) {
            visible = false;
            scene.resetClock();
          }
          return;
        }
        visible = true;
        if (still && !dirty) return;
        if (!scene.render()) return;
        dirty = false;
        if (!still) watchSpeed();
      };

      // Le garde-fou (voir SLOW_MEDIAN_MS) : un intervalle au-delà de 250 ms (onglet repris, compilation) ne compte pas.
      let intervals: number[] = [];
      let lastDrawn = 0;
      let downgrades = 0;
      const watchSpeed = () => {
        if (downgrades >= 3) return;
        const now = performance.now();
        const gap = now - lastDrawn;
        lastDrawn = now;
        if (gap > 0 && gap < 250) intervals.push(gap);
        if (intervals.length < SAMPLE_FRAMES) return;
        const median = [...intervals].sort((a, b) => a - b)[SAMPLE_FRAMES >> 1];
        intervals = [];
        if (median <= SLOW_MEDIAN_MS) {
          downgrades = 3; // assez rapide : on ne mesure plus
          return;
        }
        downgrades += 1;
        config =
          config.maxPixelRatio > 1
            ? { ...config, maxPixelRatio: 1 }
            : { ...config, helixCount: Math.round(config.helixCount / 2), inkCount: Math.round(config.inkCount / 2) };
        scene.applyConfig(config);
      };
      frame = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        window.removeEventListener("pointermove", handlePointerMove);
        document.documentElement.removeEventListener("mouseleave", handlePointerLeave);
        scene.dispose();
      };
    };

    // Après la première peinture : l'hélice ne prend jamais la main pendant l'ouverture de la page.
    const hasIdle = typeof window.requestIdleCallback === "function";
    let idle = 0;
    const schedule = () => {
      const gen = ++generation;
      const run = () => void start(gen).catch(() => {});
      idle = hasIdle ? window.requestIdleCallback(run, { timeout: 1200 }) : window.setTimeout(run, 300);
    };
    const stop = () => {
      generation += 1;
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cleanup?.();
      cleanup = undefined;
    };

    if (!lazy) {
      schedule();
      return stop;
    }

    // `lazy` : la couche elle-même est masquée tant que la scène dort (aucune boîte à observer) — on observe son parent.
    const target = layer.parentElement;
    if (!target) return;
    // Le démontage attend 2 s hors de vue : un défilement rapide qui traverse la zone ne libère pas une scène encore en
    // préparation (three.js lève une erreur si l'on jette un programme pendant `compileAsync`), ni ne la reconstruit.
    let mounted = false;
    let unmountTimer = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.isIntersecting) {
          window.clearTimeout(unmountTimer);
          if (!mounted) {
            mounted = true;
            schedule();
          }
        } else if (mounted) {
          window.clearTimeout(unmountTimer);
          unmountTimer = window.setTimeout(() => {
            mounted = false;
            stop();
            layer.hidden = true;
          }, 2000);
        }
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      window.clearTimeout(unmountTimer);
      stop();
    };
  }, [lazy, desktopOnly, lightWhenStill]);

  return (
    // Toute la fenêtre, sous tout le reste (z-index négatif, dans le contexte d'empilement racine : la page ne doit pas
    // l'isoler). Le fond menthe #eff4f2 est celui de la scène ; globals.css efface alors le fond de l'espace et la
    // feuille blanche, et allège le verre du menu et de la barre du haut. `m-0!` : le conteneur de la page espace ses
    // enfants (space-y), ce qui raccourcissait la couche fixe d'autant.
    <div
      ref={layerRef}
      aria-hidden="true"
      hidden
      data-helix-fond=""
      className={cn(
        "pointer-events-none inset-0 -z-10 overflow-hidden bg-mint-50 print:hidden",
        position === "fixed" ? "fixed m-0!" : "absolute",
        className,
      )}
    >
      <canvas ref={canvasRef} className={cn("absolute inset-y-0 left-0 block h-full w-full", FRAMING[framing])} />
    </div>
  );
}
