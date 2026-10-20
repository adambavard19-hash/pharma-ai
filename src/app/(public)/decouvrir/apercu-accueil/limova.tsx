"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Les pièces animées de l'essai d'accueil inspiré de limova.ai (fondateur, 20 oct. 2026) : la boîte où s'écrit un vrai scan
 * puis son conseil, la vidéo de présentation qui se lance seule (sans le son, comme tout navigateur l'exige), les onglets,
 * les questions par thème.
 */

/** Un scan s'écrit lettre à lettre, puis le conseil apparaît ; et l'exemple suivant. Les exemples sont ceux du site. */
export function ScanPrompt({ examples }: { examples: { scan: string; shows: string; warning?: boolean }[] }) {
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState(0);
  const example = examples[at % examples.length];
  const done = typed >= example.scan.length;

  useEffect(() => {
    const id = window.setTimeout(
      () => {
        if (!done) setTyped((n) => n + 1);
        else {
          setTyped(0);
          setAt((n) => n + 1);
        }
      },
      done ? 2600 : 70,
    );
    return () => window.clearTimeout(id);
  }, [done, typed]);

  return (
    <div className="mx-auto mt-10 w-full max-w-[600px] rounded-[26px] border border-white/80 bg-white/70 p-4 text-left shadow-[0_24px_60px_-30px_rgba(15,47,42,0.45)] backdrop-blur-xl sm:p-5">
      <p className="flex min-h-[26px] items-center gap-2.5 font-mono text-[15px] text-text-primary">
        <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.1em] text-brand-700 uppercase">Scan</span>
        <span>
          {example.scan.slice(0, typed)}
          <span className="ml-0.5 inline-block h-[17px] w-[2px] translate-y-[3px] animate-pulse bg-brand-600" aria-hidden="true" />
        </span>
      </p>
      <p className={cn("mt-2 min-h-[24px] pl-[3.4rem] text-[15px] font-semibold transition-opacity duration-500", done ? "opacity-100" : "opacity-0", example.warning ? "text-warning-800" : "text-brand-700")}>
        {example.warning ? "⚠ " : "+ "}
        {example.shows}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
        <Link href="/decouvrir/demo" className="inline-flex h-11 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-[#0796b4] px-5 text-[14.5px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(7,150,180,0.7)] hover:opacity-95">
          Réserver une démo <ArrowRight className="size-4" />
        </Link>
        <Link href="/decouvrir/abonnement" className="inline-flex h-11 items-center rounded-full border border-border-default bg-white px-5 text-[14.5px] font-semibold text-text-primary hover:border-brand-400">
          S&apos;abonner
        </Link>
      </div>
    </div>
  );
}

/** La présentation se lance seule, sans le son ; « Activer le son » la reprend du début, avec le son. */
export function AutoVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (muted) video.currentTime = 0;
    video.muted = !muted;
    setMuted(!muted);
    void video.play().catch(() => undefined);
  };
  return (
    <div className="relative mx-auto mt-14 w-full max-w-[1100px] overflow-hidden rounded-[28px] border border-white/70 bg-[#0F2F2A] shadow-[0_40px_90px_-40px_rgba(15,47,42,0.6)]">
      <video ref={ref} src={src} poster={poster} autoPlay muted loop playsInline preload="metadata" className="block aspect-video w-full object-cover" />
      <button type="button" onClick={toggle} className="absolute top-4 right-4 inline-flex items-center gap-2 rounded-full bg-black/45 px-3.5 py-2 text-[13px] font-semibold text-white backdrop-blur-md hover:bg-black/60">
        {muted ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
        {muted ? "Activer le son" : "Couper le son"}
      </button>
    </div>
  );
}

export type FeatureTab = { id: string; label: string; icon: ReactNode; title: string; text: string; points: string[]; visual: ReactNode; more?: ReactNode };

/** Les onglets « tout ce que fait PharmaBoost » : un bouton par fonction, le visuel à gauche, la fonction à droite. */
export function FeatureTabs({ tabs }: { tabs: FeatureTab[] }) {
  const [current, setCurrent] = useState(tabs[0].id);
  const tab = tabs.find((t) => t.id === current) ?? tabs[0];
  return (
    <>
      <div role="tablist" aria-label="Fonctions" className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current}
            onClick={() => setCurrent(t.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[14px] font-semibold transition-colors",
              t.id === current ? "border-brand-600 bg-brand-600 text-white shadow-[0_8px_20px_-10px_rgba(36,112,97,0.8)]" : "border-border-subtle bg-white/80 text-text-secondary hover:border-brand-300 hover:text-text-primary",
            )}
          >
            <span className="[&>svg]:size-4" aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div key={tab.id} role="tabpanel" className="animate-slide-up mx-auto mt-10 grid max-w-6xl overflow-hidden rounded-[30px] border border-border-subtle bg-surface-card lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex items-center justify-center bg-[radial-gradient(80%_80%_at_30%_20%,var(--color-brand-50),transparent_70%)] p-6 sm:p-10 lg:border-r lg:border-border-subtle">
          <div className="w-full max-w-[520px]">{tab.visual}</div>
        </div>
        <div className="p-7 sm:p-10">
          <p className="text-[15px] text-text-secondary">Découvrez</p>
          <h3 className="mt-1 text-[30px] leading-[1.05] font-bold tracking-[-0.03em] text-text-primary">{tab.title}</h3>
          <p className="mt-4 text-[15.5px] leading-7 text-text-secondary">{tab.text}</p>
          {tab.points.length > 0 && <ul className="mt-7 space-y-2.5">
            {tab.points.map((p) => (
              <li key={p} className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface-app px-4 py-3 text-[14.5px] font-semibold text-text-primary">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
                {p}
              </li>
            ))}
          </ul>}
          {tab.more && <div className="mt-7">{tab.more}</div>}
        </div>
      </div>
    </>
  );
}

/** Les trois étapes : un clic sur une étape la met en avant, comme sur limova.ai. */
export function Steps({ steps }: { steps: { title: string; text: string }[] }) {
  const [current, setCurrent] = useState(0);
  return (
    <div className="mt-12 grid gap-4 md:grid-cols-3">
      {steps.map((s, i) => (
        <button
          key={s.title}
          type="button"
          onClick={() => setCurrent(i)}
          className={cn("rounded-[26px] border p-7 text-left transition-all", i === current ? "border-brand-500 bg-surface-card shadow-[0_24px_50px_-30px_rgba(36,112,97,0.7)]" : "border-border-subtle bg-white/60 hover:border-brand-300")}
        >
          <span className={cn("inline-flex size-10 items-center justify-center rounded-full text-[16px] font-bold", i === current ? "bg-gradient-to-br from-brand-600 to-[#0796b4] text-white" : "bg-brand-50 text-brand-700")}>{i + 1}</span>
          <p className="mt-5 text-[19px] font-bold tracking-[-0.02em] text-text-primary">{s.title}</p>
          <p className="mt-2 text-[14.5px] leading-6 text-text-secondary">{s.text}</p>
        </button>
      ))}
    </div>
  );
}

/** Les questions fréquentes, rangées par thème, qui s'ouvrent une à une. */
export function FaqTabs({ groups }: { groups: { label: string; items: { q: string; a: string }[] }[] }) {
  const [group, setGroup] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mx-auto mt-10 max-w-3xl">
      <div className="flex flex-wrap justify-center gap-2">
        {groups.map((g, i) => (
          <button key={g.label} type="button" onClick={() => setGroup(i)} className={cn("rounded-full px-4 py-2 text-[14px] font-semibold", i === group ? "bg-text-primary text-white" : "bg-white/80 text-text-secondary hover:text-text-primary")}>
            {g.label}
          </button>
        ))}
      </div>
      <dl className="mt-8 space-y-3">
        {groups[group].items.map((item) => (
          <div key={item.q} className="rounded-2xl border border-border-subtle bg-surface-card">
            <dt>
              <button type="button" aria-expanded={open === item.q} onClick={() => setOpen(open === item.q ? null : item.q)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[16px] font-semibold text-text-primary">
                {item.q}
                <ChevronDown className={cn("size-5 shrink-0 text-text-tertiary transition-transform", open === item.q && "rotate-180")} aria-hidden="true" />
              </button>
            </dt>
            {open === item.q && <dd className="px-5 pb-5 text-[15px] leading-6 text-text-secondary">{item.a}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
