"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { trackSponsoredEventsAction } from "@/server/actions/mobile-discover";
import type { SponsoredPlacement } from "@/core/sponsoring/campaign";

/**
 * Les compteurs des emplacements sponsorisés, côté écran.
 *
 * - Impression : la carte est visible à 50 % au moins pendant 1 seconde d'affilée (IntersectionObserver).
 * - Clic : un toucher sur la carte.
 * - Vue de détail : l'ouverture de la page d'une campagne (`SponsoredDetailView`).
 *
 * Les événements partent par lots (toutes les 2 s, et quand l'onglet passe en arrière-plan). Le serveur ne garde
 * qu'un +1 par jour, campagne et emplacement — jamais qui a vu ou cliqué. Utilisable par tous les onglets (l'Académie
 * l'emploie pour TRAINING_FEED).
 */

type Kind = "impression" | "click" | "view" | "info_request";
type QueuedEvent = { kind: Kind; campaignId: string; placement: SponsoredPlacement };

const queue: QueuedEvent[] = [];
const sentThisPage = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  void trackSponsoredEventsAction(batch).catch(() => undefined);
}

export function trackSponsored(event: QueuedEvent) {
  const key = `${event.kind}|${event.campaignId}|${event.placement}`;
  // Une fois par affichage de page suffit : le serveur dédoublonne de toute façon par jour.
  if (sentThisPage.has(key)) return;
  sentThisPage.add(key);
  queue.push(event);
  if (!listening && typeof document !== "undefined") {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
  }
  if (!timer) timer = setTimeout(flush, 2000);
}

/** Enveloppe une carte sponsorisée : compte son impression (≥ 50 % visible pendant ≥ 1 s) et ses clics. */
export function SponsoredImpression({ campaignId, placement, children, className }: { campaignId: string; placement: SponsoredPlacement; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let visibleTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (!visibleTimer) {
              visibleTimer = setTimeout(() => {
                trackSponsored({ kind: "impression", campaignId, placement });
                observer.disconnect();
              }, 1000);
            }
          } else if (visibleTimer) {
            clearTimeout(visibleTimer);
            visibleTimer = null;
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(node);
    return () => {
      if (visibleTimer) clearTimeout(visibleTimer);
      observer.disconnect();
    };
  }, [campaignId, placement]);

  return (
    <div ref={ref} className={className} onClickCapture={() => trackSponsored({ kind: "click", campaignId, placement })}>
      {children}
    </div>
  );
}

/** Sur la page de détail ouverte depuis une campagne : une « vue », comptée une fois. */
export function SponsoredDetailView({ campaignId, placement }: { campaignId: string; placement: SponsoredPlacement }) {
  useEffect(() => {
    trackSponsored({ kind: "view", campaignId, placement });
  }, [campaignId, placement]);
  return null;
}
