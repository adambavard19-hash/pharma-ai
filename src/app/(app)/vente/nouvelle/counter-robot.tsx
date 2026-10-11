"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, X } from "lucide-react";
import { Robot, RobotSoundToggle } from "@/components/robot";
import { dismissRobotTip, useDismissedTips } from "@/components/robot/tip-dismissal";
import { useCounterLook } from "@/components/robot/counter-look-context";
import { robotLook } from "@/core/robot/counter-look";
import type { RobotMood } from "@/core/robot/mascot";
import { recapIsDue, visibleTip, type RobotTip } from "@/core/robot/mascot-tips";
import { counterMoodLine } from "@/core/robot/companion";
import type { DayRecap } from "@/server/services/robot-tips";
import { TIME_ZONE } from "@/config/constants";
import { cn } from "@/lib/utils";

/**
 * Le robot de « Nouvelle vente », au centre de l'accueil du logiciel (demande du fondateur, 11 oct. 2026) : grand, en
 * tête de page, il dit bonjour par le prénom, salue d'un coucou une fois par session, suit le pointeur des yeux, rit
 * quand on le touche et a de petits sons amicaux (très bas, coupables d'un geste, jamais pour une mise en garde).
 *
 * Il dit au plus UNE chose utile (challenge proche d'un palier, dates courtes, stock à envoyer), qu'on peut écarter
 * pour la journée — sauf le stock, qui ne s'écarte pas (il remplace alors le bandeau du stock, pour ne pas le dire deux
 * fois). Sans phrase utile, il dit seulement ce qu'il fait (il guette le scan, il cherche). Il prépare aussi « Votre
 * journée » : d'elle-même à partir de 18 h, sinon à la demande.
 */

function parisHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

export function CounterRobot({ mood, tips, stockBanner, greeting }: { mood: RobotMood; tips: RobotTip[]; stockBanner: ReactNode; greeting: string }) {
  const dismissedNow = useDismissedTips();
  // Le robot de SON comptoir : on voit d'un coup d'œil si l'on est au bon endroit.
  const counterLook = useCounterLook();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const tip = visibleTip(tips, new Set<string>([...dismissedNow, ...hidden]));

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
  }, [setRecapOpen]);

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
      <section aria-label="Le robot PharmaBoost" data-robot-hero="" className="relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-card px-4 py-4 shadow-card sm:px-6 sm:py-5">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_50%,var(--color-brand-100),transparent_70%)] opacity-60 dark:opacity-20" />
        <div className="relative flex items-center gap-3 sm:gap-6">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <Robot
              mood={mood}
              listen="comptoir"
              sound="counter"
              floating
              track
              interactive
              greet="once"
              greetKey="comptoir"
              look={counterLook?.look}
              label={counterLook ? `Le robot de votre comptoir : ${counterLook.caption}` : undefined}
              className="h-[110px] w-[90px] sm:h-[140px] sm:w-[115px]"
            />
            {counterLook && (
              <p className="flex max-w-[150px] items-center gap-1.5 rounded-full border border-border-subtle bg-surface-card px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap text-text-primary shadow-card" title="Le robot de votre comptoir : si ce n'est pas le vôtre, vous êtes sur le comptoir d'un collègue.">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: robotLook(counterLook.look).palette.ear }} />
                <span className="truncate">{counterLook.caption}</span>
              </p>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-[20px] leading-7 font-bold tracking-[-0.02em] text-text-primary sm:text-[24px] sm:leading-8">{greeting}</p>
              <div className="flex shrink-0 items-center gap-1 max-sm:-ml-2.5">
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
            <div
              className="rbt-bubble relative mt-2 rounded-2xl rounded-tl-md border border-border-subtle bg-surface-card/95 px-4 py-2.5 shadow-card before:absolute before:top-3 before:-left-[7px] before:size-3 before:rotate-45 before:border-b before:border-l before:border-border-subtle before:bg-surface-card max-sm:before:hidden"
              role="status"
              key={tip?.key ?? `humeur:${mood}`}
            >
              <p className={cn("text-[14px] leading-5 text-text-primary", tip?.dismissible && "pr-6")}>{tip ? tip.text : counterMoodLine(mood)}</p>
              {tip?.action && (
                <Link href={tip.action.href} className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
                  {tip.action.label}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              )}
              {tip?.dismissible && (
                <button
                  type="button"
                  onClick={() => {
                    setHidden((current) => new Set(current).add(tip.key));
                    dismissRobotTip(tip.key);
                  }}
                  className="absolute top-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                  aria-label="Plus tard"
                  title="Plus tard"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
      {recapOpen && <RecapCard recap={recap} loading={loading} onClose={() => setRecapOpen(false)} />}
    </div>
  );
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
