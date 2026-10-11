"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, X } from "lucide-react";
import { Robot, RobotSoundToggle } from "@/components/robot";
import type { RobotMood } from "@/core/robot/mascot";
import { recapIsDue, visibleTip, type RobotTip } from "@/core/robot/mascot-tips";
import type { DayRecap } from "@/server/services/robot-tips";
import { TIME_ZONE } from "@/config/constants";
import { cn } from "@/lib/utils";

/**
 * Le robot du comptoir, dans un coin de « Nouvelle vente » : petit, calme, sans suivre la souris, muet par défaut.
 *
 * Il dit au plus UNE chose utile (challenge proche d'un palier, dates courtes, stock à envoyer), qu'on peut écarter
 * pour la journée — sauf le stock, qui ne s'écarte pas (il remplace alors le bandeau du stock, pour ne pas le dire deux
 * fois). Il prépare aussi « Votre journée » : d'elle-même à partir de 18 h, sinon à la demande.
 */

const DISMISS_EVENT = "pharmaboost:robot-ecarte";

function parisDay(now = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function parisHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}
const dismissKey = () => `pharmaboost:robot-ecarte:${parisDay()}`;

// Ce qui a été écarté aujourd'hui, gardé dans ce navigateur seulement (une commodité, pas une donnée).
function readDismissed(): string {
  try {
    return window.localStorage.getItem(dismissKey()) ?? "[]";
  } catch {
    return "[]";
  }
}
function subscribeDismissed(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}
function dismiss(key: string) {
  try {
    const current = new Set<string>(JSON.parse(readDismissed()) as string[]);
    current.add(key);
    window.localStorage.setItem(dismissKey(), JSON.stringify([...current]));
  } catch {
    // Stockage indisponible : la phrase reviendra au prochain chargement, rien de grave.
  }
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

export function CounterRobot({ mood, tips, stockBanner }: { mood: RobotMood; tips: RobotTip[]; stockBanner: ReactNode }) {
  const dismissedRaw = useSyncExternalStore(subscribeDismissed, readDismissed, () => "[]");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const dismissed = new Set<string>([...safeParse(dismissedRaw), ...hidden]);
  const tip = visibleTip(tips, dismissed);

  const [recap, setRecap] = useState<DayRecap | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const openRecap = useCallback(async () => {
    setRecapOpen(true);
    setLoading(true);
    try {
      const response = await fetch("/api/comptoir/journee", { cache: "no-store" });
      if (response.ok) setRecap((await response.json()) as DayRecap);
    } catch {
      // Réseau coupé : la carte le dit, on réessaiera.
    } finally {
      setLoading(false);
    }
  }, []);

  // À partir de 18 h, la journée se récapitule d'elle-même (une fois).
  useEffect(() => {
    let done = false;
    const check = () => {
      if (!done && recapIsDue(parisHour())) {
        done = true;
        void openRecap();
      }
    };
    const first = setTimeout(check, 0);
    const id = setInterval(check, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [openRecap]);

  return (
    <div className="space-y-3">
      {tip?.kind !== "stock" && stockBanner}
      <div className="flex items-start gap-3">
        <Robot mood={mood} listen="comptoir" size={44} sound="counter" className="mt-0.5" />
        {tip ? (
          <div className="relative min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border-subtle bg-surface-card px-4 py-2.5 shadow-card" role="status">
            <p className="pr-6 text-[14px] leading-5 text-text-primary">{tip.text}</p>
            {tip.action && (
              <Link href={tip.action.href} className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
                {tip.action.label}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            )}
            {tip.dismissible && (
              <button
                type="button"
                onClick={() => {
                  setHidden((current) => new Set(current).add(tip.key));
                  dismiss(tip.key);
                }}
                className="absolute top-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                aria-label="Plus tard"
                title="Plus tard"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="flex shrink-0 items-center gap-1 pt-1.5">
          <button
            type="button"
            onClick={() => (recapOpen ? setRecapOpen(false) : void openRecap())}
            aria-expanded={recapOpen}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            <CalendarCheck className="size-4" aria-hidden="true" />
            Votre journée
          </button>
          <RobotSoundToggle where="counter" />
        </div>
      </div>
      {recapOpen && <RecapCard recap={recap} loading={loading} onClose={() => setRecapOpen(false)} />}
    </div>
  );
}

function safeParse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function RecapCard({ recap, loading, onClose }: { recap: DayRecap | null; loading: boolean; onClose: () => void }) {
  return (
    <section aria-label="Votre journée" className="relative rounded-2xl border border-border-subtle bg-surface-card px-5 py-4 shadow-card">
      <button type="button" onClick={onClose} className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken" aria-label="Fermer">
        <X className="size-4" aria-hidden="true" />
      </button>
      <h2 className="text-[16px] font-semibold text-text-primary">Votre journée</h2>
      {!recap ? (
        <p className="mt-2 text-[14px] text-text-secondary">{loading ? "Je fais le compte…" : "La journée n'a pas pu être lue. Réessayez dans un instant."}</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <RecapFigure label="Mes conseils validés" value={`${recap.mine.validated} / ${recap.mine.proposed}`} hint="validés / proposés" />
            <RecapFigure label="L'équipe" value={`${recap.team.validated} / ${recap.team.proposed}`} hint={recap.myRank ? `vous êtes ${recap.myRank === 1 ? "1er" : `${recap.myRank}e`}` : "validés / proposés"} />
            <RecapFigure label="Meilleur moment" value={recap.best ? recap.best.label : "—"} hint={recap.best ? `${recap.best.validated} conseil${recap.best.validated > 1 ? "s" : ""} validé${recap.best.validated > 1 ? "s" : ""}` : "pas encore de conseil validé"} className="col-span-2 sm:col-span-1" />
          </dl>
          <p className="mt-3 text-[13px] text-text-secondary">
            {recap.mine.validated > 0 ? "Belle journée au comptoir. À demain !" : recap.mine.proposed > 0 ? "Des conseils proposés aujourd'hui : demain, on en fait valider." : "Rien de proposé aujourd'hui pour l'instant."}
          </p>
        </>
      )}
    </section>
  );
}

function RecapFigure({ label, value, hint, className }: { label: string; value: string; hint: string; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-surface-sunken/70 px-3.5 py-2.5", className)}>
      <dt className="text-[12.5px] text-text-secondary">{label}</dt>
      <dd className="text-[20px] leading-7 font-semibold tabular text-text-primary">{value}</dd>
      <dd className="text-[12px] text-text-tertiary">{hint}</dd>
    </div>
  );
}
