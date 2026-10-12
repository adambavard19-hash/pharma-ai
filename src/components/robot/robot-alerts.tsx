"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { activeAlerts, moodForAlerts, SNOOZE_MS, type AlertAction, type RobotAlert } from "@/core/robot/alerts";
import type { RobotMood } from "@/core/robot/mascot";
import { approveJoinRequestAction, refuseJoinRequestAction } from "@/server/actions/team-access";
import { decideBonusAction } from "@/server/actions/mobile-personal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Les alertes du robot du logiciel, partagées par le robot du menu et le petit robot du coin : lues au chargement, puis
 * toutes les trois minutes, au retour sur l'onglet et à chaque changement de page (au plus une fois par minute).
 *
 * « Plus tard » met une alerte de côté 24 h ; « Compris » sur une bonne nouvelle, 30 jours. Ce qui a déjà été montré
 * n'ouvre plus la bulle de lui-même. Les deux sont gardés dans ce navigateur, par personne : une commodité, pas une
 * donnée. Les gestes (accepter, refuser, valider) passent par les actions serveur existantes, qui revérifient tout.
 */

const REFRESH_MS = 3 * 60_000;
const MIN_GAP_MS = 60_000;
const GOOD_NEWS_SNOOZE_MS = 30 * 24 * 3600 * 1000;
const STORE_EVENT = "pharmaboost:robot-alertes";

type Store = { snoozed: Record<string, number>; seen: string[] };
const EMPTY = '{"snoozed":{},"seen":[]}';

function storeKey(viewerKey: string) {
  return `pharmaboost:robot-alertes:${viewerKey}`;
}
function readRaw(viewerKey: string): string {
  try {
    return window.localStorage.getItem(storeKey(viewerKey)) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}
function parse(raw: string): Store {
  try {
    const value = JSON.parse(raw) as Partial<Store>;
    return { snoozed: value.snoozed && typeof value.snoozed === "object" ? value.snoozed : {}, seen: Array.isArray(value.seen) ? value.seen.filter((k) => typeof k === "string") : [] };
  } catch {
    return { snoozed: {}, seen: [] };
  }
}
function write(viewerKey: string, update: (store: Store) => Store) {
  try {
    const next = update(parse(readRaw(viewerKey)));
    const now = Date.now();
    // On ne garde que l'utile : les mises de côté encore valables, les 200 dernières alertes vues.
    next.snoozed = Object.fromEntries(Object.entries(next.snoozed).filter(([, until]) => until > now));
    next.seen = next.seen.slice(-200);
    window.localStorage.setItem(storeKey(viewerKey), JSON.stringify(next));
  } catch {
    // Stockage indisponible : l'alerte reviendra, rien de grave.
  }
  window.dispatchEvent(new Event(STORE_EVENT));
}

type RunState = { key: string; kind: AlertAction["kind"] } | null;

type RobotAlertsValue = {
  /** Toutes les alertes à montrer, de la plus importante à la moins importante. */
  alerts: RobotAlert[];
  /** Les alertes jamais montrées : elles ouvrent la bulle d'elles-mêmes. */
  unseen: RobotAlert[];
  mood: RobotMood;
  loaded: boolean;
  running: RunState;
  markSeen: (keys: string[]) => void;
  snooze: (alert: RobotAlert) => void;
  run: (alert: RobotAlert, action: AlertAction) => Promise<void>;
};

const RobotAlertsContext = createContext<RobotAlertsValue | null>(null);

export function useRobotAlerts(): RobotAlertsValue | null {
  return useContext(RobotAlertsContext);
}

export function RobotAlertsProvider({ viewerKey, children }: { viewerKey: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { push } = useToast();
  const [all, setAll] = useState<RobotAlert[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState<RunState>(null);
  const lastFetch = useRef(0);
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(STORE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(STORE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => readRaw(viewerKey), () => EMPTY);
  const store = useMemo(() => parse(raw), [raw]);

  const refresh = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch.current < MIN_GAP_MS) return;
    lastFetch.current = Date.now();
    try {
      const response = await fetch("/api/robot/alertes", { cache: "no-store" });
      if (response.ok) setAll(((await response.json()) as { alerts: RobotAlert[] }).alerts);
    } catch {
      // Hors ligne : on garde ce qu'on avait.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture réseau : l'état ne change qu'à la réponse
    void refresh();
  }, [refresh, pathname]);
  useEffect(() => {
    const id = setInterval(() => void refresh(true), REFRESH_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  // L'heure ne sert qu'à relire les mises de côté : relue à chaque changement du stockage ou des alertes.
  const [now, setNow] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'heure du filtre suit les alertes et le stockage
    setNow(Date.now());
  }, [all, raw]);
  const alerts = useMemo(() => (now ? activeAlerts(all, store.snoozed, now) : []), [all, store.snoozed, now]);
  const unseen = useMemo(() => {
    const seen = new Set(store.seen);
    return alerts.filter((alert) => !seen.has(alert.key));
  }, [alerts, store.seen]);

  const markSeen = useCallback((keys: string[]) => write(viewerKey, (s) => ({ ...s, seen: [...new Set([...s.seen, ...keys])] })), [viewerKey]);
  const snooze = useCallback(
    (alert: RobotAlert) => {
      const until = Date.now() + (alert.severity === "good" || alert.severity === "info" ? GOOD_NEWS_SNOOZE_MS : SNOOZE_MS);
      write(viewerKey, (s) => ({ snoozed: { ...s.snoozed, [alert.key]: until }, seen: [...new Set([...s.seen, alert.key])] }));
    },
    [viewerKey],
  );

  const run = useCallback(
    async (alert: RobotAlert, action: AlertAction) => {
      setRunning({ key: alert.key, kind: action.kind });
      try {
        const result =
          action.kind === "approve-join"
            ? await approveJoinRequestAction({ id: action.id, role: action.role })
            : action.kind === "refuse-join"
              ? await refuseJoinRequestAction({ id: action.id })
              : await decideBonusAction({ id: action.id, decision: "VALIDATE" });
        if (result.ok) {
          push({ tone: "success", title: result.message ?? "C'est fait." });
          setAll((current) => current.filter((entry) => entry.key !== alert.key));
          router.refresh();
          void refresh(true);
        } else push({ tone: "error", title: result.error });
      } catch {
        push({ tone: "error", title: "Le geste n'a pas pu aboutir. Réessayez dans un instant." });
      } finally {
        setRunning(null);
      }
    },
    [push, refresh, router],
  );

  const value = useMemo<RobotAlertsValue>(() => ({ alerts, unseen, mood: moodForAlerts(alerts), loaded, running, markSeen, snooze, run }), [alerts, unseen, loaded, running, markSeen, snooze, run]);
  return <RobotAlertsContext.Provider value={value}>{children}</RobotAlertsContext.Provider>;
}

const TONE: Record<RobotAlert["severity"], { dot: string; label: string }> = {
  problem: { dot: "bg-warning-500", label: "À régler" },
  todo: { dot: "bg-brand-600", label: "À faire" },
  good: { dot: "bg-success-500", label: "Bonne nouvelle" },
  info: { dot: "bg-ink-400", label: "Pour info" },
};

/** Le compte des alertes, en pastille sur le robot. Ambre s'il y a un problème. */
export function AlertBadge({ alerts, className }: { alerts: RobotAlert[]; className?: string }) {
  if (alerts.length === 0) return null;
  const problem = alerts.some((alert) => alert.severity === "problem");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute flex min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-[18px] font-bold text-white tabular-nums ring-2 ring-surface-sidebar",
        problem ? "bg-warning-500" : "bg-brand-600",
        className,
      )}
    >
      {alerts.length > 9 ? "9+" : alerts.length}
    </span>
  );
}

/**
 * La bulle : l'alerte du moment, ses gestes, et de quoi passer aux suivantes. `onClose` replie la bulle ; tout ce qui
 * a été montré est marqué vu (la bulle ne s'ouvrira plus d'elle-même pour cela).
 */
export function AlertBubble({ value, onClose, onNavigate, className }: { value: RobotAlertsValue; onClose: () => void; onNavigate?: () => void; className?: string }) {
  const { alerts, running, markSeen, snooze, run } = value;
  const [index, setIndex] = useState(0);
  const current = alerts[Math.min(index, Math.max(0, alerts.length - 1))];
  const currentKey = current?.key;
  useEffect(() => {
    if (currentKey) markSeen([currentKey]);
  }, [currentKey, markSeen]);

  if (!current) return null;
  const tone = TONE[current.severity];
  const position = Math.min(index, alerts.length - 1);
  const busy = running?.key === current.key;

  return (
    <div role="dialog" aria-label="Ce que le robot signale" className={cn("rbt-bubble relative rounded-2xl border border-border-subtle bg-surface-card px-3.5 pt-3 pb-2.5 text-left shadow-lg", className)}>
      <div className="flex items-center gap-1.5 pr-6">
        <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
        <span className="text-[11px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">{tone.label}</span>
        {alerts.length > 1 && <span className="ml-auto text-[11px] text-text-tertiary tabular-nums">{position + 1}/{alerts.length}</span>}
      </div>
      <p className="mt-1.5 text-[13.5px] leading-5 text-text-primary" aria-live="polite">
        {current.text}
      </p>

      {current.actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {current.actions.map((action, i) => (
            <button
              key={action.kind}
              type="button"
              disabled={busy}
              onClick={() => void run(current, action)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60",
                i === 0 ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-border-default bg-surface-card text-text-primary hover:bg-surface-sunken",
              )}
            >
              {i === 0 && <Check className="size-3.5" aria-hidden="true" />}
              {busy && running?.kind === action.kind ? "…" : action.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border-subtle pt-1.5">
        {current.link ? (
          <Link href={current.link.href} onClick={() => { onNavigate?.(); onClose(); }} className="inline-flex min-w-0 items-center gap-1 text-[12.5px] font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
            <span className="truncate">{current.link.label}</span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center">
          {current.snoozable && (
            <button type="button" onClick={() => snooze(current)} className="rounded-full px-2 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none">
              {current.severity === "good" || current.severity === "info" ? "Compris" : "Plus tard"}
            </button>
          )}
          {alerts.length > 1 && (
            <>
              <button type="button" onClick={() => setIndex((position - 1 + alerts.length) % alerts.length)} className="inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary" aria-label="Alerte précédente">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setIndex((position + 1) % alerts.length)} className="inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary" aria-label="Alerte suivante">
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
      <button type="button" onClick={onClose} className="absolute top-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-sunken hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none" aria-label="Replier la bulle du robot">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
