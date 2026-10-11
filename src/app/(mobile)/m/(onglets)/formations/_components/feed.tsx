"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Info, ListChecks, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { recordWatchAction } from "@/server/actions/mobile-academy";
import type { AcademyCard } from "@/server/services/mobile/academy";
import { AuthorBadge, PartnerLabel, TopicPill, VerifiedLine } from "./labels";

/**
 * « Pour vous » : le fil vertical de micro-vidéos, une par écran, aimanté comme les applications de vidéos courtes.
 *
 * - La vidéo visible se lance d'elle-même, en muet (règle des navigateurs) ; un toucher met en pause ou relance ; le
 *   bouton du son vaut pour tout le fil. Avec « réduire les animations », rien ne se lance seul.
 * - L'anneau autour du bouton lecture montre ce qui a été vu ; l'avancée est enregistrée par paliers (25, 50, 75 %,
 *   fin, et à la pause), jamais en continu.
 * - À la fin : le quiz, s'il y en a un, sinon la vidéo suivante.
 * - Clavier : flèches haut/bas pour changer de vidéo, espace pour lecture/pause.
 */
export function Feed({ cards }: { cards: AcademyCard[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // La carte la plus visible devient la carte active.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) setActive(Number((entry.target as HTMLElement).dataset.index ?? 0));
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll<HTMLElement>("[data-feed-card]").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [cards.length]);

  const goTo = useCallback((index: number) => {
    const root = scroller.current;
    const target = root?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (target) target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      goTo(Math.min(cards.length - 1, active + 1));
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      goTo(Math.max(0, active - 1));
    }
  };

  return (
    <div className="relative mx-auto w-full lg:max-w-[460px]">
      <div
        ref={scroller}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Fil de micro-vidéos. Flèches haut et bas pour changer de vidéo."
        className="h-[calc(100dvh-216px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-h-[420px] snap-y snap-mandatory overflow-y-auto overscroll-y-contain rounded-[28px] [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 lg:h-[calc(100dvh-196px)] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card, index) => (
          <FeedCard
            key={card.id}
            card={card}
            index={index}
            total={cards.length}
            active={index === active}
            muted={muted}
            autoplay={!reduced}
            onToggleMute={() => setMuted((value) => !value)}
            onNext={index < cards.length - 1 ? () => goTo(index + 1) : null}
          />
        ))}
      </div>
      {/* Repères de navigation pour la souris (ordinateur) */}
      <div className="pointer-events-none absolute top-1/2 -right-14 hidden -translate-y-1/2 flex-col gap-2 lg:flex">
        <button type="button" onClick={() => goTo(Math.max(0, active - 1))} disabled={active === 0} className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-white text-ink-800 shadow-md transition disabled:opacity-40" aria-label="Vidéo précédente">
          <ChevronUp className="size-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => goTo(Math.min(cards.length - 1, active + 1))} disabled={active >= cards.length - 1} className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-white text-ink-800 shadow-md transition disabled:opacity-40" aria-label="Vidéo suivante">
          <ChevronDown className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const RING = 2 * Math.PI * 26;

function FeedCard({ card, index, total, active, muted, autoplay, onToggleMute, onNext }: { card: AcademyCard; index: number; total: number; active: boolean; muted: boolean; autoplay: boolean; onToggleMute: () => void; onNext: (() => void) | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [time, setTime] = useState(0);
  const [watched, setWatched] = useState(card.status === "DONE" ? 100 : card.percent);
  const [embedOpen, setEmbedOpen] = useState(false);
  const saved = useRef(card.status === "DONE" ? 100 : card.percent);
  const [announce, setAnnounce] = useState("");

  const save = useCallback(
    (percent: number) => {
      const rounded = Math.round(percent);
      if (rounded <= saved.current) return;
      saved.current = rounded;
      void recordWatchAction({ contentId: card.id, percent: rounded }).then((result) => {
        if (result.ok && result.data.status === "DONE" && result.data.newBadges.length > 0) setAnnounce(`Badge gagné : ${result.data.newBadges.map((badge) => badge.title).join(", ")}`);
      });
    },
    [card.id],
  );

  // Lecture automatique de la carte active, pause des autres.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (active && autoplay) {
      element.play().catch(() => setPlaying(false));
    } else if (!active) {
      element.pause();
    }
  }, [active, autoplay]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) {
      if (ended) {
        element.currentTime = 0;
        setEnded(false);
      }
      void element.play().catch(() => undefined);
    } else element.pause();
  };

  const onTime = () => {
    const element = video.current;
    if (!element || !element.duration) return;
    const percent = (element.currentTime / element.duration) * 100;
    setTime(percent);
    setWatched((value) => Math.max(value, percent));
    for (const step of [25, 50, 75]) if (percent >= step && saved.current < step) save(step);
  };

  const onEnded = () => {
    setEnded(true);
    setPlaying(false);
    setWatched(100);
    save(100);
  };

  const hasQuiz = card.quizCount > 0;
  const fileVideo = card.video?.type === "file" ? card.video.src : null;
  const embed = card.video?.type === "embed" ? card.video : null;

  return (
    <article
      data-feed-card
      data-index={index}
      aria-label={`${card.title} — vidéo ${index + 1} sur ${total}`}
      className="relative h-full snap-start snap-always overflow-hidden bg-ink-950 text-white first:rounded-t-[28px] last:rounded-b-[28px]"
    >
      {/* L'image d'attente floutée derrière une vidéo horizontale : l'écran reste plein. */}
      {card.posterUrl && !card.vertical && (
        // eslint-disable-next-line @next/next/no-img-element -- image servie par la route contrôlée de l'Académie
        <img src={card.posterUrl} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" />
      )}

      {fileVideo && (
        <video
          ref={video}
          src={fileVideo}
          poster={card.posterUrl ?? undefined}
          playsInline
          muted={muted}
          preload={active ? "auto" : "metadata"}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            const element = video.current;
            if (element?.duration) save((element.currentTime / element.duration) * 100);
          }}
          onTimeUpdate={onTime}
          onEnded={onEnded}
          onClick={toggle}
          className={cn("absolute inset-0 size-full cursor-pointer", card.vertical ? "object-cover" : "object-contain")}
        />
      )}

      {embed && (
        <div className="absolute inset-0 flex items-center justify-center">
          {embedOpen ? (
            <iframe src={`${embed.src}?autoplay=1&playsinline=1`} title={card.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="aspect-video w-full" />
          ) : (
            <button type="button" onClick={() => setEmbedOpen(true)} className="flex size-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-md" aria-label={`Lire « ${card.title} »`}>
              <Play className="size-9 fill-white" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Dégradés de lisibilité */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

      {/* En haut : thème et partenaire */}
      <div className="absolute inset-x-0 top-0 flex flex-wrap items-center gap-1.5 p-4 pr-16">
        <TopicPill topic={card.topic} onDark />
        <PartnerLabel partnerName={card.partnerName} isSponsored={card.isSponsored} onDark />
        {card.durationLabel && <span className="rounded-full bg-black/35 px-2.5 py-1 text-[11.5px] font-semibold text-white/90 backdrop-blur-md">{card.durationLabel}</span>}
      </div>

      {/* Lecture / pause au centre, avec l'anneau de ce qui a été vu */}
      {fileVideo && (!playing || ended) && (
        <button
          type="button"
          onClick={toggle}
          className="absolute top-1/2 left-1/2 flex size-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 backdrop-blur-md transition-transform active:scale-90"
          aria-label={ended ? "Revoir la vidéo" : `Lire « ${card.title} »`}
        >
          <svg viewBox="0 0 60 60" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
            <circle cx="30" cy="30" r="26" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="3.5" />
            <circle cx="30" cy="30" r="26" fill="none" stroke="var(--color-brand-300)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - Math.min(100, watched) / 100)} />
          </svg>
          {ended ? <RotateCcw className="size-8" aria-hidden="true" /> : <Play className="ml-1 size-8 fill-white" aria-hidden="true" />}
        </button>
      )}

      {/* La colonne d'actions, à droite */}
      <div className="absolute right-3 bottom-36 flex flex-col items-center gap-3">
        {fileVideo && (
          <RoundAction label={muted ? "Activer le son" : "Couper le son"} onClick={onToggleMute}>
            {muted ? <VolumeX className="size-5" aria-hidden="true" /> : <Volume2 className="size-5" aria-hidden="true" />}
          </RoundAction>
        )}
        {fileVideo && playing && (
          <RoundAction label="Mettre en pause" onClick={toggle}>
            <Pause className="size-5 fill-white" aria-hidden="true" />
          </RoundAction>
        )}
        {hasQuiz && (
          <RoundLink href={`/m/formations/${card.id}/quiz`} label={`Quiz : ${card.quizCount} question${card.quizCount > 1 ? "s" : ""}`} highlight={!card.quizPassed}>
            <ListChecks className="size-5" aria-hidden="true" />
          </RoundLink>
        )}
        <RoundLink href={`/m/formations/${card.id}`} label="Détails de la formation">
          <Info className="size-5" aria-hidden="true" />
        </RoundLink>
      </div>

      {/* En bas : auteur, titre, relecture */}
      <div className="absolute inset-x-0 bottom-0 space-y-2.5 p-4 pr-[72px] pb-5">
        <AuthorBadge name={card.author} role={card.authorRole} onDark size="sm" />
        <Link href={`/m/formations/${card.id}`} className="block">
          <h2 className="text-[19px] leading-[1.2] font-bold tracking-[-0.02em] text-balance drop-shadow-sm">{card.title}</h2>
        </Link>
        {/* Pendant la lecture, le texte s'efface : la vidéo a souvent ses propres sous-titres. */}
        {card.summary && !playing && <p className="line-clamp-2 text-[13.5px] leading-[1.4] text-white/85">{card.summary}</p>}
        <VerifiedLine className={playing ? "opacity-70" : undefined} reviewedBy={card.reviewedBy} reviewedAt={card.reviewedAt} reviewerIsPharmacist={card.reviewerIsPharmacist} validUntil={card.validUntil} onDark />
        {embed && !embedOpen && card.status !== "DONE" && !hasQuiz && (
          <button type="button" onClick={() => { setWatched(100); save(100); }} className="mt-1 inline-flex h-11 items-center rounded-full bg-white/18 px-4 text-[13.5px] font-semibold ring-1 ring-white/30 backdrop-blur-md">
            J&apos;ai regardé
          </button>
        )}
      </div>

      {/* La fin : le quiz ou la suite */}
      {ended && (hasQuiz || onNext) && (
        <div className="absolute inset-x-4 bottom-[132px] flex justify-center">
          {hasQuiz && !card.quizPassed ? (
            <Link href={`/m/formations/${card.id}/quiz`} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-[14.5px] font-bold text-brand-800 shadow-lg active:scale-95">
              <ListChecks className="size-5" aria-hidden="true" />
              Valider avec le quiz · {card.quizCount} question{card.quizCount > 1 ? "s" : ""}
            </Link>
          ) : onNext ? (
            <button type="button" onClick={onNext} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-[14.5px] font-bold text-brand-800 shadow-lg active:scale-95">
              Vidéo suivante
              <ChevronDown className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      )}

      {/* La barre de temps de la lecture en cours */}
      {fileVideo && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15" aria-hidden="true">
          <div className="h-full bg-brand-300 transition-[width] duration-200 ease-linear" style={{ width: `${time}%` }} />
        </div>
      )}
      <p className="sr-only" aria-live="polite">{announce}</p>
    </article>
  );
}

function RoundAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-11 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/20 backdrop-blur-md transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-white">
      {children}
    </button>
  );
}

function RoundLink({ href, label, children, highlight = false }: { href: string; label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <Link href={href} aria-label={label} title={label} className={cn("flex size-11 items-center justify-center rounded-full ring-1 backdrop-blur-md transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-white", highlight ? "bg-brand-500 text-white ring-white/30" : "bg-black/35 text-white ring-white/20")}>
      {children}
    </Link>
  );
}
