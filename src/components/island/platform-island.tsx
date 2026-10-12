"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, CornerDownLeft, Home, MessageCircle, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { Robot } from "@/components/robot";
import type { RobotMood } from "@/core/robot/mascot";
import { registerTap } from "@/core/island/banner-flow";
import type { IslandHome, IslandHomeRow, IslandTone } from "@/core/island/home";
import { cn } from "@/lib/utils";
import { AssistantText } from "./assistant-text";
import { ISLAND_CSS, IslandShell } from "./island-shell";
import { useAssistantChat } from "./use-assistant-chat";

/**
 * L'île PharmaBoost, dans la bannière de chaque espace (logiciel, console, direction, extranet, site) : la capsule noire
 * avec NOTRE robot, qui s'ouvre en ressort sur des onglets — « Accueil » (les chiffres et ce qu'il y a à voir, avec les
 * gestes), « Discussion » (le robot de l'espace, qui répond avec les vraies données), et « + » quand l'espace en a un.
 * Idée de l'île : Coucou (MIT, voir THIRD_PARTY_NOTICES.md) ; le dessin, les couleurs et le robot sont ceux de PharmaBoost.
 *
 * La capsule au repos prend sa place dans la bannière (elle ne cache rien) ; ouverte, elle déborde par-dessus la page,
 * centrée sur sa place et gardée dans l'écran. Une page peut prendre l'île pour elle (l'écran de vente y joue le
 * parcours du comptoir) : voir `useIslandSlot`.
 */

// ---------------------------------------------------------------- La place de l'île, qu'une page peut prendre

type SlotValue = { slot: HTMLElement | null; setSlot: (node: HTMLElement | null) => void; claimed: number; claim: () => () => void };
const SlotContext = createContext<SlotValue | null>(null);

export function IslandSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [claimed, setClaimed] = useState(0);
  const claim = useCallback(() => {
    setClaimed((n) => n + 1);
    return () => setClaimed((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ slot, setSlot, claimed, claim }), [slot, claimed, claim]);
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
}

/**
 * Une page qui joue SA propre île (l'écran de vente) : tant qu'elle est montée, l'île de l'espace s'efface et la page
 * dessine la sienne à la même place. Renvoie la place où dessiner (portail), ou `null` hors d'une île.
 */
export function useIslandSlot(): HTMLElement | null {
  const value = useContext(SlotContext);
  const claim = value?.claim;
  useEffect(() => (claim ? claim() : undefined), [claim]);
  return value?.slot ?? null;
}

/** Dessine `children` dans la place de l'île (ou nulle part hors d'une île). */
export function IslandPortal({ children }: { children: ReactNode }) {
  const slot = useIslandSlot();
  return slot ? createPortal(children, slot) : null;
}

// ---------------------------------------------------------------- L'île

export type IslandChatConfig = {
  endpoint: string;
  suggestions: string[];
  safeHref: (href: string) => string | null;
  placeholder?: string;
  /** Une phrase sous les suggestions : ce que le robot lit, ce qu'il ne fait pas. */
  footnote?: string;
  /** La recherche instantanée pendant la frappe (console) : un nom, un SIRET… s'affichent aussitôt. */
  search?: (query: string, signal: AbortSignal) => Promise<IslandSearchResult[]>;
  /** Une saisie qui ressemble à une recherche (et non à une question) : le premier résultat est présélectionné. */
  looksLikeLookup?: (query: string) => boolean;
};

export type IslandSearchResult = { key: string; title: string; subtitle?: string | null; badge?: string | null; group: string; href: string };

type Tab = "home" | "chat" | "plus";

const TONE_DOT: Record<IslandTone, string> = { warning: "#F5A623", todo: "#36E8C8", good: "#22C88F", info: "rgba(255,255,255,0.4)" };

const OPEN_WIDTH = 540;
const CHAT_WIDTH = 580;
const RESTING_WIDTH = 236;
const COMPACT_WIDTH = 52;

export function PlatformIsland({
  label,
  look,
  mood,
  homeEndpoint,
  pollMs = 3 * 60_000,
  homeLead,
  homeExtra,
  chat,
  plus,
  plusLabel = "Déposer",
  badge,
  attention,
  autoOpenKey,
  hotkey = false,
  restingText,
  className,
}: {
  label: string;
  look?: number | null;
  mood?: RobotMood;
  homeEndpoint?: string;
  pollMs?: number;
  /** Ce qui ouvre l'Accueil (le scénario du comptoir sur le site). */
  homeLead?: ReactNode;
  /** Ce qui suit les pastilles (les alertes et leurs gestes, dans le logiciel). */
  homeExtra?: ReactNode;
  chat?: IslandChatConfig;
  plus?: ReactNode;
  plusLabel?: string;
  /** Le compte en pastille sur la capsule (alertes). */
  badge?: number;
  attention?: boolean;
  /** Quand cette clé change (et n'est pas vide), l'île s'ouvre d'elle-même sur l'Accueil (une alerte jamais vue). */
  autoOpenKey?: string | null;
  /** ⌘K / Ctrl+K ouvre la discussion. */
  hotkey?: boolean;
  /** La phrase de la capsule au repos, si l'espace n'a pas d'accueil chiffré. */
  restingText?: string;
  className?: string;
}) {
  const router = useRouter();
  const slotValue = useContext(SlotContext);
  const claimed = (slotValue?.claimed ?? 0) > 0;
  const anchor = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ cx: number; top: number; vw: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [home, setHome] = useState<IslandHome | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [grumpy, setGrumpy] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversation = useAssistantChat(chat?.endpoint ?? "");

  // La place de l'île, mesurée : l'île ouverte se centre dessus et reste dans l'écran.
  useLayoutEffect(() => {
    const node = anchor.current;
    if (!node) return;
    const measure = () => {
      const box = node.getBoundingClientRect();
      setRect({ cx: box.left + box.width / 2, top: box.top, vw: window.innerWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // L'accueil chiffré : lu à l'arrivée, à l'ouverture, puis de temps en temps (jamais à chaque seconde).
  const lastFetch = useRef(0);
  const refresh = useCallback(async (force = false) => {
    if (!homeEndpoint) return;
    if (!force && Date.now() - lastFetch.current < 30_000) return;
    lastFetch.current = Date.now();
    try {
      const response = await fetch(homeEndpoint, { cache: "no-store" });
      if (response.ok) setHome((await response.json()) as IslandHome);
    } catch {
      // Hors ligne : on garde ce qu'on avait.
    }
  }, [homeEndpoint]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture réseau : l'état ne change qu'à la réponse
    void refresh(true);
    const id = setInterval(() => void refresh(true), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture réseau à l'ouverture
    if (open) void refresh();
  }, [open, refresh]);

  // Une alerte jamais vue : l'île s'ouvre d'elle-même sur l'Accueil (comme la bulle d'avant).
  const lastAuto = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOpenKey || autoOpenKey === lastAuto.current) return;
    lastAuto.current = autoOpenKey;
    setTab("home");
    setOpen(true);
    setPinned(true);
  }, [autoOpenKey]);

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (hotkey && chat && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setTab("chat");
        setOpen(true);
        setPinned(true);
      } else if (event.key === "Escape") close();
    };
    const onOpen = (event: Event) => {
      const wanted = (event as CustomEvent<{ tab?: Tab }>).detail?.tab;
      if (wanted) setTab(wanted);
      setOpen(true);
      setPinned(true);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [hotkey, chat, close]);

  // Un clic hors de l'île la referme.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  useEffect(() => {
    if (!grumpy) return;
    const id = setTimeout(() => setGrumpy(false), 3000);
    return () => clearTimeout(id);
  }, [grumpy]);

  const compact = (rect?.vw ?? 1024) < 640;
  const restWidth = compact ? COMPACT_WIDTH : RESTING_WIDTH;
  const openWidth = tab === "chat" ? CHAT_WIDTH : OPEN_WIDTH;
  const width = grumpy ? 360 : open ? openWidth : restWidth;
  const shown = Math.min(width, (rect?.vw ?? 1200) - 24);
  const left = rect ? Math.min(Math.max(rect.cx, 12 + shown / 2), rect.vw - 12 - shown / 2) : null;
  // L'île d'une page (l'écran de vente) peut s'élargir à 560 px : sa place est gardée dans l'écran pour cette largeur.
  const slotHalf = Math.min(560, (rect?.vw ?? 1200) - 24) / 2;
  const slotLeft = rect ? Math.min(Math.max(rect.cx, 12 + slotHalf), rect.vw - 12 - slotHalf) : null;
  const tone = grumpy || (attention ?? home?.attention) ? "warning" : open ? "accent" : "neutral";
  const robotMood: RobotMood = grumpy ? "concerned" : conversation.pending ? "thinking" : tab === "chat" && open ? conversation.mood : (mood ?? "idle");
  const headline = restingText ?? home?.headline ?? "Je regarde ce qui se passe…";
  const count = badge ?? 0;

  const navigate = (href: string) => {
    close();
    router.push(href);
  };

  const onCapsuleClick = () => {
    const result = registerTap(taps, Date.now());
    setTaps(result.taps);
    if (result.tooMany) {
      setGrumpy(true);
      setTaps([]);
      setOpen(false);
      return;
    }
    if (open && pinned) close();
    else {
      // Ouverte au survol : le clic la garde ouverte.
      setOpen(true);
      setPinned(true);
    }
  };

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "home", label: "Accueil", icon: <Home className="size-3.5" aria-hidden="true" /> },
    ...(chat ? [{ key: "chat" as const, label: "Discussion", icon: <MessageCircle className="size-3.5" aria-hidden="true" /> }] : []),
    ...(plus ? [{ key: "plus" as const, label: plusLabel, icon: <Plus className="size-3.5" aria-hidden="true" /> }] : []),
  ];

  let body: ReactNode;
  if (grumpy) {
    body = <CapsuleRow robot={<Robot size={32} mood="concerned" look={look} label="Le robot PharmaBoost" />} title="Doucement !" sub="Trop de clics d'un coup — je reprends dans 3 secondes." />;
  } else if (!open) {
    body = (
      <button type="button" data-island-toggle="" onClick={onCapsuleClick} aria-expanded={false} aria-label={`${label} : ${headline}${count ? ` (${count})` : ""}`} className="flex h-11 w-full items-center gap-2.5 pr-3.5 pl-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#36E8C8]">
        <span className="relative shrink-0">
          <Robot size={32} mood={robotMood} look={look} label="Le robot PharmaBoost" />
          {count > 0 && (
            <span className={cn("absolute -top-1 -right-1.5 flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] leading-4 font-bold text-[#04261A] tabular-nums ring-2 ring-[#0B0F14]", tone === "warning" ? "bg-[#F5A623]" : "bg-[#36E8C8]")}>{count > 9 ? "9+" : count}</span>
          )}
        </span>
        {!compact && <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{headline}</span>}
        {!compact && <span className="size-2 shrink-0 rounded-full" style={{ background: tone === "warning" ? "#F5A623" : "#36E8C8", boxShadow: `0 0 8px ${tone === "warning" ? "#F5A623" : "#36E8C8"}` }} aria-hidden="true" />}
      </button>
    );
  } else {
    body = (
      <div className="px-3 pt-2.5 pb-3">
        <div className="flex items-center gap-2.5">
          <button type="button" data-island-toggle="" onClick={onCapsuleClick} className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-[#36E8C8]" aria-label="Replier l'île">
            <Robot size={34} mood={robotMood} look={look} label="Le robot PharmaBoost" />
          </button>
          <div role="tablist" aria-label={label} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#36E8C8]", tab === t.key ? "bg-white text-[#0B0F14]" : "text-white/70 hover:bg-white/[0.08] hover:text-white")}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={close} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-[#36E8C8]" aria-label="Fermer l'île">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2.5" role="tabpanel">
          {tab === "home" && <HomePanel home={home} lead={homeLead} extra={homeExtra} onNavigate={navigate} />}
          {tab === "chat" && chat && <ChatPanel chat={chat} conversation={conversation} onNavigate={navigate} />}
          {tab === "plus" && plus}
        </div>
      </div>
    );
  }

  const island = (
    <div
      ref={panelRef}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
        if (!open && !grumpy) enterTimer.current = setTimeout(() => setOpen(true), 160);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        if (enterTimer.current) clearTimeout(enterTimer.current);
        if (!pinned) leaveTimer.current = setTimeout(() => setOpen(false), 380);
      }}
      onFocus={() => {
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
      }}
      // Un geste dans l'île ouverte la garde ouverte (on ne perd pas sa question en sortant la souris).
      onPointerDown={(event) => {
        if (open && !(event.target as Element).closest("[data-island-toggle]")) setPinned(true);
      }}
    >
      <IslandShell width={width} tone={tone} contentKey={grumpy ? "grumpy" : open ? `open-${tab}` : "rest"} label={label}>
        {body}
      </IslandShell>
    </div>
  );

  // Au premier rendu (serveur), l'île se pose dans sa place ; mesurée, elle flotte au-dessus de la page, rendue à la
  // racine du document : un en-tête flouté (backdrop-filter) piégerait sinon une position « fixed ».
  const floating = (
    <div className="no-print">
      <div
        ref={slotValue?.setSlot}
        className={cn("z-[60]", !rect && "absolute top-0 left-1/2 -translate-x-1/2", claimed ? "" : "hidden")}
        style={rect ? { position: "fixed", top: rect.top, left: slotLeft ?? rect.cx, transform: "translateX(-50%)", width: "max-content" } : undefined}
      />
      {!claimed && (
        <div
          className={cn("z-[60] transition-[left] duration-[560ms] ease-[cubic-bezier(.3,1.45,.5,1)] motion-reduce:transition-none", !rect && "absolute top-0 left-1/2 -translate-x-1/2")}
          style={rect ? { position: "fixed", top: rect.top, left: left ?? rect.cx, transform: "translateX(-50%)", width: "max-content" } : undefined}
        >
          {island}
        </div>
      )}
    </div>
  );

  return (
    <div ref={anchor} className={cn("relative h-11 shrink-0", className)} style={{ width: restWidth }}>
      <style>{ISLAND_CSS}</style>
      {rect ? createPortal(floating, document.body) : floating}
    </div>
  );
}

/** Ouvre l'île de l'espace depuis n'importe où (le robot du menu, par exemple). */
export const OPEN_EVENT = "pharmaboost:ile-ouvrir";
export function openIsland(tab?: Tab) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { tab } }));
}

function CapsuleRow({ robot, title, sub }: { robot: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {robot}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-5 font-semibold" aria-live="polite">{title}</p>
        {sub && <p className="truncate text-[12.5px] leading-[18px] text-white/60">{sub}</p>}
      </div>
    </div>
  );
}

function HomePanel({ home, lead, extra, onNavigate }: { home: IslandHome | null; lead?: ReactNode; extra?: ReactNode; onNavigate: (href: string) => void }) {
  return (
    <div className="space-y-2.5">
      {lead}
      {home && home.pills.length > 0 && (
        <div className={cn("grid gap-2", home.pills.length >= 3 ? "grid-cols-3" : home.pills.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {home.pills.map((pill) => {
            const content = (
              <>
                <p className="truncate text-[10.5px] font-medium tracking-[0.04em] text-white/55 uppercase">{pill.label}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[14px] font-semibold tabular-nums">
                  {pill.tone && <span className="size-1.5 shrink-0 rounded-full" style={{ background: TONE_DOT[pill.tone] }} />}
                  {pill.value}
                </p>
              </>
            );
            return pill.href ? (
              <button key={pill.key} type="button" onClick={() => onNavigate(pill.href!)} className="isl-line min-w-0 rounded-2xl bg-white/[0.06] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.1] focus-visible:outline-2 focus-visible:outline-[#36E8C8]">
                {content}
              </button>
            ) : (
              <div key={pill.key} className="isl-line min-w-0 rounded-2xl bg-white/[0.06] px-2.5 py-2">{content}</div>
            );
          })}
        </div>
      )}
      {extra}
      {home && home.rows.length > 0 && (
        <ul className="space-y-1">
          {home.rows.map((row, i) => (
            <HomeRow key={row.key} row={row} index={i} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
      {!home && !lead && !extra && <p className="px-1 py-2 text-[12.5px] text-white/55">Je regarde ce qui se passe…</p>}
    </div>
  );
}

function HomeRow({ row, index, onNavigate }: { row: IslandHomeRow; index: number; onNavigate: (href: string) => void }) {
  const inner = (
    <>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: TONE_DOT[row.tone ?? "info"] }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-white/90">{row.title}</span>
        {row.detail && <span className="block truncate text-[11.5px] text-white/50">{row.detail}</span>}
      </span>
      {row.href && <ArrowRight className="size-3.5 shrink-0 text-white/40" aria-hidden="true" />}
    </>
  );
  return (
    <li className="isl-line" style={{ animationDelay: `${index * 40}ms` }}>
      {row.href ? (
        <button type="button" onClick={() => onNavigate(row.href!)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-[#36E8C8]">
          {inner}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-2.5 py-1.5">{inner}</div>
      )}
    </li>
  );
}

function ChatPanel({ chat, conversation, onNavigate }: { chat: IslandChatConfig; conversation: ReturnType<typeof useAssistantChat>; onNavigate: (href: string) => void }) {
  const { turns, pending, ask, stop, reset } = conversation;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IslandSearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();
  const search = chat.search;

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);
  useEffect(() => {
    if (!search || trimmed.length < 2 || trimmed.length > 80) return;
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const found = await search(trimmed, controller.signal);
        setResults(found);
        setActive(chat.looksLikeLookup?.(trimmed) && found.length ? 1 : 0);
      } catch {
        // Requête annulée : rien plutôt qu'un résultat trompeur.
      }
    }, 160);
    return () => {
      controller.abort();
      clearTimeout(id);
    };
  }, [search, trimmed, chat]);

  const visible = search && trimmed.length >= 2 && trimmed.length <= 80 ? results : [];
  const rows: ({ kind: "ask" } | { kind: "result"; result: IslandSearchResult })[] = trimmed && visible.length ? [{ kind: "ask" }, ...visible.map((result) => ({ kind: "result" as const, result }))] : [];
  const send = (text: string) => {
    if (!text.trim() || pending) return;
    setQuery("");
    setResults([]);
    void ask(text);
  };
  const choose = (index: number) => {
    const row = rows[index];
    if (!row || row.kind === "ask") send(query);
    else onNavigate(row.result.href);
  };

  return (
    <div className="flex flex-col gap-2">
      {turns.length > 0 && (
        <div ref={scrollRef} className="max-h-[min(52vh,420px)] space-y-3 overflow-y-auto pr-1">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#36E8C8] px-3 py-1.5 text-[13.5px] leading-[1.45] whitespace-pre-wrap text-[#04261A]">{turn.text}</p>
              </div>
            ) : (
              <div key={i} className={cn("rounded-2xl rounded-tl-md px-3 py-2 text-[13.5px] leading-[1.5]", turn.failed ? "bg-[#F5A623]/15 text-[#FFE2B0]" : "bg-white/[0.07] text-white/90")}>
                {turn.text && <AssistantText text={turn.text} safeHref={chat.safeHref} onNavigate={onNavigate} />}
                {turn.status && (
                  <p className={cn("flex items-center gap-2 text-[12.5px] text-white/60", turn.text && "mt-1.5")}>
                    <span className="inline-flex gap-0.5" aria-hidden="true">
                      <span className="size-1.5 animate-pulse rounded-full bg-[#36E8C8]" />
                      <span className="size-1.5 animate-pulse rounded-full bg-[#36E8C8] [animation-delay:150ms]" />
                      <span className="size-1.5 animate-pulse rounded-full bg-[#36E8C8] [animation-delay:300ms]" />
                    </span>
                    {turn.status}
                  </p>
                )}
              </div>
            ),
          )}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-2xl bg-white/[0.07] py-1 pr-1 pl-3 focus-within:ring-1 focus-within:ring-[#36E8C8]/60">
        <textarea
          ref={inputRef}
          rows={1}
          value={query}
          onChange={(event) => setQuery(event.target.value.slice(0, 1000))}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && rows.length) {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, rows.length - 1));
            } else if (event.key === "ArrowUp" && rows.length) {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (rows.length) choose(Math.min(active, rows.length - 1));
              else send(query);
            }
          }}
          placeholder={turns.length ? "Une autre question ?" : (chat.placeholder ?? "Demande-moi n'importe quoi…")}
          aria-label="Question au robot"
          className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] leading-5 text-white placeholder:text-white/40 focus:outline-none"
        />
        {pending ? (
          <button type="button" onClick={stop} className="mb-0.5 h-8 shrink-0 rounded-xl bg-white/10 px-3 text-[12.5px] font-medium text-white hover:bg-white/15">
            Arrêter
          </button>
        ) : (
          <button type="button" onClick={() => send(query)} disabled={!trimmed} aria-label="Envoyer la question" className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#36E8C8] text-[#04261A] transition-opacity disabled:opacity-30">
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {rows.length > 0 && !pending && (
        <div className="max-h-[38vh] overflow-y-auto rounded-2xl bg-white/[0.04] p-1">
          {rows.map((row, i) =>
            row.kind === "ask" ? (
              <button key="ask" type="button" onClick={() => choose(0)} onMouseEnter={() => setActive(0)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left", active === 0 ? "bg-white/[0.1]" : "hover:bg-white/[0.06]")}>
                <Sparkles className="size-4 shrink-0 text-[#36E8C8]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-white/90">Demander au robot : « {trimmed} »</span>
                {active === 0 && <CornerDownLeft className="size-3.5 shrink-0 text-white/40" aria-hidden="true" />}
              </button>
            ) : (
              <button key={row.result.key} type="button" onClick={() => choose(i)} onMouseEnter={() => setActive(i)} className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left", active === i ? "bg-white/[0.1]" : "hover:bg-white/[0.06]")}>
                <span className="w-20 shrink-0 truncate text-[10.5px] font-semibold tracking-[0.04em] text-white/45 uppercase">{row.result.group}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-white/90">{row.result.title}</span>
                  {row.result.subtitle && <span className="block truncate text-[11.5px] text-white/50">{row.result.subtitle}</span>}
                </span>
                {row.result.badge && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] text-white/70">{row.result.badge}</span>}
              </button>
            ),
          )}
        </div>
      )}

      {turns.length === 0 && !trimmed && (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {chat.suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => send(suggestion)} className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-left text-[12.5px] text-white/80 transition-colors hover:border-[#36E8C8]/60 hover:text-white">
                {suggestion}
              </button>
            ))}
          </div>
          {chat.footnote && <p className="mt-2.5 px-0.5 text-[11.5px] leading-[1.45] text-white/45">{chat.footnote}</p>}
        </div>
      )}
      {turns.length > 0 && !pending && !trimmed && (
        <button type="button" onClick={reset} className="flex items-center gap-1.5 self-end px-1 text-[12px] text-white/50 hover:text-white/80">
          <RotateCcw className="size-3.5" aria-hidden="true" /> Nouvelle conversation
        </button>
      )}
    </div>
  );
}
