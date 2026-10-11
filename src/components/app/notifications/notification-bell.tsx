"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Robot } from "@/components/robot";
import { useCounterLook } from "@/components/robot/counter-look-context";
import { markAllReadAction } from "@/server/actions/notifications";
import { badgeLabel } from "@/core/notifications/feed";
import { cn } from "@/lib/utils";
import { NotificationFeed, type FeedItemJson } from "./notification-feed";

/**
 * La cloche de l'en-tête : le nombre de notifications non lues POUR SOI, et, d'un clic, le fil des dernières (sans quitter
 * l'écran). « Tout marquer comme lu », « Voir tout ». Sans rien à dire : le petit robot, aux couleurs du comptoir.
 */
export function NotificationBell({ unread: initialUnread }: { unread: number }) {
  const router = useRouter();
  const counterLook = useCounterLook();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  // Le compteur du serveur fait foi à chaque navigation (état dérivé, recalé pendant le rendu).
  const [serverUnread, setServerUnread] = useState(initialUnread);
  if (serverUnread !== initialUnread) {
    setServerUnread(initialUnread);
    setUnread(initialUnread);
  }
  const [items, setItems] = useState<FeedItemJson[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { unread: number; items: FeedItemJson[] };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const badge = badgeLabel(unread);
  const markAll = () =>
    startTransition(async () => {
      await markAllReadAction().catch(() => undefined);
      setUnread(0);
      setItems((current) => current?.map((item) => ({ ...item, read: true })) ?? current);
      router.refresh();
    });

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open) void load();
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
        aria-label={`Notifications${unread > 0 ? ` — ${unread} non lue${unread > 1 ? "s" : ""}` : ""}`}
      >
        <Bell className="size-[18px]" />
        {badge && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[9.5px] font-semibold text-white tabular-nums">{badge}</span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-40 mt-2 flex max-h-[min(560px,calc(100dvh-80px))] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-card shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
            <p className="text-[14px] font-semibold text-text-primary">
              Notifications
              {unread > 0 && <span className="ml-1.5 text-[12.5px] font-medium text-text-tertiary">{unread} non lue{unread > 1 ? "s" : ""}</span>}
            </p>
            {unread > 0 && (
              <button type="button" onClick={markAll} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-60 dark:text-brand-300">
                <CheckCheck className="size-3.5" aria-hidden="true" />
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
            {items === null && !failed && <p className="px-4 py-6 text-center text-[13px] text-text-tertiary">Chargement…</p>}
            {failed && (
              <p className="px-4 py-6 text-center text-[13px] text-text-secondary">
                Les notifications n&apos;ont pas pu être chargées.{" "}
                <button type="button" onClick={() => void load()} className="font-medium text-brand-700 underline underline-offset-2">Réessayer</button>
              </p>
            )}
            {items && items.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                <Robot size={64} interactive look={counterLook?.look} />
                <p className="text-[14px] font-semibold text-text-primary">Rien de neuf pour l&apos;instant</p>
                <p className="text-[12.5px] leading-5 text-text-secondary">Les alertes de stock, l&apos;équipe et les réponses du support apparaîtront ici.</p>
              </div>
            )}
            {items && items.length > 0 && <NotificationFeed items={items} compact onNavigate={() => setOpen(false)} />}
          </div>

          <Link href="/notifications" onClick={() => setOpen(false)} className={cn("border-t border-border-subtle px-4 py-2.5 text-center text-[13px] font-medium text-brand-700 transition-colors hover:bg-surface-sunken dark:text-brand-300")}>
            Voir toutes les notifications
          </Link>
        </div>
      )}
    </div>
  );
}
