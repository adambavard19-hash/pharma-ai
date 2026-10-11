"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Minus, X } from "lucide-react";
import type { RobotMood } from "@/core/robot/mascot";
import { visibleTip, type RobotTip } from "@/core/robot/mascot-tips";
import { appCompanionAllowed, PENDING_CHEER_KEY } from "@/core/robot/companion";
import { cn } from "@/lib/utils";
import { ROBOT_EVENT, type RobotSignal } from "./bus";
import { Robot } from "./robot";
import { RobotSoundToggle } from "./sound-toggle";
import { dismissRobotTip, useDismissedTips } from "./tip-dismissal";

/**
 * Le petit robot compagnon du logiciel, posé en bas à droite de chaque page (sauf « Nouvelle vente », où le grand
 * robot est déjà en tête, et l'écran de vente, où il vit dans la barre du bas). Il reprend les humeurs du fil
 * (`emitRobotMood`) : curieux au bip, pensif pendant l'analyse, sérieux devant une mise en garde, content d'un conseil
 * vendu, en fête quand la vente est terminée. Touché, il glousse ; ouvert, il dit sa phrase utile du moment.
 *
 * Sons : ceux du comptoir (bas, amicaux seulement, jamais pour une mise en garde), coupables depuis sa bulle.
 */

const CHANNELS = new Set(["comptoir", "app"]);
const MINI_KEY = "pharmaboost:robot-compagnon-reduit";
const MINI_EVENT = "pharmaboost:robot-compagnon-reduit";

// Réduit ou non : retenu dans ce navigateur (au rendu serveur : non réduit).
function readMini(): boolean {
  try {
    return window.localStorage.getItem(MINI_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribeMini(onChange: () => void) {
  window.addEventListener(MINI_EVENT, onChange);
  return () => window.removeEventListener(MINI_EVENT, onChange);
}

/** Demande au compagnon de faire la fête sur la PROCHAINE page (la vente terminée ouvre la page de fin). */
export function cheerOnNextPage(): void {
  try {
    window.sessionStorage.setItem(PENDING_CHEER_KEY, String(Date.now()));
  } catch {
    // Stockage indisponible : pas de fête, rien d'autre ne change.
  }
}

export function AppRobotCompanion() {
  const pathname = usePathname() ?? "/";
  const allowed = appCompanionAllowed(pathname);

  const [signal, setSignal] = useState<{ mood: RobotMood; at: number; holdMs: number } | null>(null);
  const [open, setOpen] = useState(false);
  const mini = useSyncExternalStore(subscribeMini, readMini, () => false);
  const [tips, setTips] = useState<RobotTip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const dismissed = useDismissedTips();

  // Le fil : un bip, une analyse, une mise en garde, un conseil vendu.
  useEffect(() => {
    const onSignal = (event: Event) => {
      const detail = (event as CustomEvent<RobotSignal>).detail;
      if (detail && CHANNELS.has(detail.channel)) setSignal({ mood: detail.mood, at: detail.at, holdMs: detail.holdMs });
    };
    window.addEventListener(ROBOT_EVENT, onSignal);
    return () => window.removeEventListener(ROBOT_EVENT, onSignal);
  }, []);
  useEffect(() => {
    if (!signal) return;
    const id = setTimeout(() => setSignal(null), signal.holdMs);
    return () => clearTimeout(id);
  }, [signal]);

  // Une fête demandée avant de changer de page (vente terminée) : on la joue en arrivant.
  useEffect(() => {
    if (!allowed) return;
    let pending: string | null = null;
    try {
      pending = window.sessionStorage.getItem(PENDING_CHEER_KEY);
      if (pending) window.sessionStorage.removeItem(PENDING_CHEER_KEY);
    } catch {
      pending = null;
    }
    if (!pending || Date.now() - Number(pending) > 15_000) return;
    const id = setTimeout(() => setSignal({ mood: "celebrate", at: Date.now(), holdMs: 3200 }), 350);
    return () => clearTimeout(id);
  }, [allowed, pathname]);

  // Changer de page referme la bulle.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  const loadTips = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/robot/conseil", { cache: "no-store" });
      if (response.ok) setTips(((await response.json()) as { tips: RobotTip[] }).tips);
      else setTips([]);
    } catch {
      setTips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && tips === null && !loading) void loadTips();
  };

  // Échap referme la bulle.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const setMinimised = (value: boolean) => {
    setOpen(false);
    try {
      window.localStorage.setItem(MINI_KEY, value ? "1" : "0");
    } catch {
      // Stockage indisponible : le choix ne sera pas retenu.
    }
    window.dispatchEvent(new Event(MINI_EVENT));
  };

  if (!allowed) return null;

  const tip = tips ? visibleTip(tips, new Set(dismissed)) : null;
  const mood: RobotMood = signal?.mood ?? "idle";

  return (
    <div className="no-print pointer-events-none fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-2">
      {open && (
        <div
          id="robot-compagnon-bulle"
          role="dialog"
          aria-label="Le robot PharmaBoost"
          className="rbt-bubble pointer-events-auto relative w-[min(20rem,calc(100vw-2rem))] origin-bottom-right rounded-2xl rounded-br-md border border-border-subtle bg-surface-card px-4 pt-3 pb-2.5 shadow-lg"
        >
          <p className="pr-7 text-[14px] leading-5 text-text-primary">
            {loading || tips === null ? "Je regarde…" : tip ? tip.text : "Rien à signaler pour l'instant. Je suis là, au coin de l'écran !"}
          </p>
          {tip?.action && (
            <Link href={tip.action.href} className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
              {tip.action.label}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-1.5">
            <div className="flex items-center gap-0.5">
              <RobotSoundToggle where="counter" />
              <button
                type="button"
                onClick={() => setMinimised(true)}
                className="inline-flex size-8 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                aria-label="Réduire le robot"
                title="Réduire le robot"
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>
            </div>
            {tip?.dismissible && (
              <button
                type="button"
                onClick={() => dismissRobotTip(tip.key)}
                className="rounded-full px-2.5 py-1 text-[12.5px] font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              >
                Plus tard
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            aria-label="Fermer la bulle du robot"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={mini ? () => setMinimised(false) : toggle}
        aria-expanded={mini ? undefined : open}
        aria-controls={open ? "robot-compagnon-bulle" : undefined}
        aria-label={mini ? "Afficher le robot PharmaBoost" : open ? "Fermer la bulle du robot" : "Ouvrir le robot PharmaBoost"}
        title={mini ? "Afficher le robot" : undefined}
        className={cn(
          "rbt-arrive pointer-events-auto rounded-full focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none",
          mini && "flex size-11 items-center justify-center border border-border-subtle bg-surface-card shadow-md",
        )}
      >
        {mini ? (
          <Robot mood={mood} size={30} />
        ) : (
          <Robot
            mood={mood}
            cheerKey={signal?.at}
            floating
            interactive
            sound="counter"
            className="h-[60px] w-[50px] drop-shadow-[0_8px_14px_rgba(15,60,70,0.22)] sm:h-[68px] sm:w-[56px]"
          />
        )}
      </button>
    </div>
  );
}
