"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, CircleCheck, Clock, Monitor, NotebookPen, PlugZap, ScanLine, ShieldCheck, TriangleAlert, Unplug, UserRound } from "lucide-react";
import { counterFigures, describeSaleStage, ordonnanceTitle, type CounterDashboardData, type PillTone, type StageTone } from "@/core/counter/dashboard";
import { formatCents, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CounterResetButton } from "../counter-reset-button";

export type LiveSale = {
  id: string;
  reference: string;
  status: string;
  post: string | null;
  updatedAt: string;
  lines: { drugName: string; quantity: number }[];
  recommendations: number;
};

const PILL: Record<PillTone, string> = {
  success: "border-success-200 bg-success-50 text-success-800 dark:border-success-800 dark:bg-success-950/50 dark:text-success-300",
  warning: "border-warning-300 bg-warning-50 text-warning-800 dark:border-warning-800 dark:bg-warning-950/40 dark:text-warning-400",
  neutral: "border-border-default bg-surface-sunken text-text-secondary",
};

const STAGE: Record<StageTone, string> = {
  neutral: "bg-surface-sunken text-text-secondary",
  brand: "bg-brand-50 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300",
  success: "bg-success-50 text-success-800 dark:bg-success-950/50 dark:text-success-300",
  warning: "bg-warning-50 text-warning-800 dark:bg-warning-950/40 dark:text-warning-400",
};

/**
 * « Nouvelle vente » : le second écran du comptoir.
 *
 * Le pharmacien travaille dans son logiciel de pharmacie et bipe ses boîtes ; PharmaBoost intervient au bon
 * moment. L'écran dit donc si le poste est branché, attend la prochaine délivrance, et montre ce que la
 * journée a donné. Il se met à jour seul : les ventes de la douchette toutes les 2,5 secondes, l'état du
 * comptoir et les chiffres toutes les 15 secondes (et dès qu'une vente change). La saisie à la main reste
 * disponible derrière « Saisie manuelle » : elle n'est plus le point de départ, elle est le secours.
 */
export function CounterDashboard({
  dateLabel,
  initial,
  initialSales,
  canConfigure,
  manualOpen,
  children,
}: {
  dateLabel: string;
  initial: CounterDashboardData;
  initialSales: LiveSale[];
  /** Peut relier un comptoir (la page « Mes connexions »). */
  canConfigure: boolean;
  /** Ouvre la saisie manuelle d'emblée : un patient ou une demande de démonstration arrive déjà choisi. */
  manualOpen: boolean;
  /** La saisie à la main : ordonnance, médicament, demande sans ordonnance. */
  children: ReactNode;
}) {
  const [data, setData] = useState(initial);
  const [sales, setSales] = useState(initialSales);
  const [manual, setManual] = useState(manualOpen);
  const openedRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/comptoir/tableau", { cache: "no-store" });
      if (!response.ok) return;
      setData((await response.json()) as CounterDashboardData);
    } catch {
      // Une interruption réseau n'a rien à afficher : la prochaine lecture reprendra.
    }
  }, []);

  // Les ventes de la douchette, en direct.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/comptoir/en-cours", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { sales: LiveSale[] };
        if (active) setSales(body.sales);
      } catch {
        // Idem : rien à afficher, la lecture suivante reprendra.
      }
    };
    const id = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // L'état du comptoir et les chiffres : plus rarement, et tout de suite quand une vente apparaît ou change d'état.
  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);
  const signature = sales.map((sale) => `${sale.id}:${sale.status}:${sale.recommendations}`).join("|");
  const firstSignature = useRef(signature);
  useEffect(() => {
    if (signature === firstSignature.current) return;
    firstSignature.current = signature;
    void refresh();
  }, [signature, refresh]);

  // Un bip reçu il y a moins de dix secondes sur une vente à confirmer : on l'ouvre. Une seule fois par vente, pour ne pas voler l'écran.
  useEffect(() => {
    const fresh = sales.find((sale) => sale.status === "NEEDS_VERIFICATION" && Date.now() - new Date(sale.updatedAt).getTime() < 10_000);
    if (fresh && fresh.id !== openedRef.current) {
      openedRef.current = fresh.id;
      router.push(`/vente/${fresh.id}`);
    }
  }, [sales, router]);

  // Une ordonnance glissée sur l'écran ouvre la saisie : le formulaire sait la recevoir, la page seule non.
  useEffect(() => {
    const onDrag = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) setManual(true);
    };
    window.addEventListener("dragenter", onDrag);
    return () => window.removeEventListener("dragenter", onDrag);
  }, []);

  const toggleManual = () => {
    const next = !manual;
    setManual(next);
    if (next) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const { status, stats, activity } = data;
  const figures = counterFigures(stats, formatCents);

  return (
    <div className="space-y-5">
      <section aria-labelledby="titre-comptoir" className="rounded-2xl border border-border-subtle bg-surface-card p-5 shadow-card sm:p-8">
        {/* Le titre garde au moins onze rem : en dessous, la pastille passe sous lui plutôt que de l'étrangler. */}
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-3">
          <div className="min-w-0 grow basis-44 space-y-2">
            <p className="text-[12.5px] font-medium tracking-[0.08em] text-text-secondary uppercase">{dateLabel}</p>
            <h1 id="titre-comptoir" className="text-[28px] leading-[34px] font-bold tracking-[-0.025em] text-balance text-text-primary sm:text-[32px] sm:leading-10">
              {status.title}
            </h1>
          </div>
          <span className={cn("mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[14px] font-medium whitespace-nowrap", PILL[status.pill.tone])}>
            {status.pill.tone === "success" ? <CircleCheck className="size-4" /> : status.pill.tone === "warning" ? <TriangleAlert className="size-4" /> : <Unplug className="size-4" />}
            {status.pill.label}
          </span>
        </header>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-text-secondary">{status.subtitle}</p>
        {status.posts.length > 0 && (
          <ul aria-label="Vos comptoirs" className="mt-4 flex flex-wrap gap-2">
            {status.posts.map((post) => (
              <li key={post.id} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-sunken/70 py-1.5 pr-3 pl-2.5 text-[13.5px] text-text-primary">
                <Monitor className="size-4 text-text-tertiary" aria-hidden />
                <span className="font-medium">{post.label}</span>
                <span className="inline-flex items-center gap-1 text-text-secondary">
                  <UserRound className="size-3.5" aria-hidden />
                  {post.owner ?? "non attribué"}
                </span>
                <span className={cn("size-2 rounded-full", post.online ? "bg-success-500" : "bg-warning-500")} role="img" aria-label={post.online ? "en ligne" : "hors ligne"} />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 rounded-2xl bg-surface-sunken/70 px-5 py-8 sm:px-8" aria-live="polite">
          {sales.length > 0 ? <InProgress sales={sales} /> : <Waiting status={status} canConfigure={canConfigure} />}
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-4">
          <Figure label="Délivrances détectées" value={figures.detected} />
          <Figure label="Conseils acceptés" value={figures.accepted} />
          <Figure label="Ventes additionnelles" value={figures.additional} />
        </dl>

        <div className="mt-8 flex items-baseline justify-between gap-3">
          <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.01em] text-text-primary">Activité récente</h2>
          <span className="text-[14px] text-text-secondary">Votre comptoir, aujourd&apos;hui</span>
        </div>
        {activity.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-border-subtle px-5 py-8 text-center">
            <Clock className="size-5 text-text-tertiary" />
            <p className="text-[15px] text-text-secondary">Les dernières ordonnances de votre comptoir apparaîtront ici.</p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {activity.map((item) => (
              <li key={item.id}>
                <Link href={`/vente/${item.id}`} className="block rounded-xl border border-border-subtle bg-surface-card px-4 py-3.5 shadow-card transition-colors hover:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none sm:px-5">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[15px] font-semibold text-text-primary">{ordonnanceTitle(item.reference)}</span>
                    <span className="text-[13px] text-text-secondary tabular">{item.when}</span>
                    <span className={cn("ml-auto shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium", STAGE[item.stage.tone])}>{item.stage.label}</span>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-text-secondary">
                    {[item.comptoir, item.patient].filter(Boolean).join(" · ") || "Saisie à l'écran"}
                  </span>
                  {item.lines.length > 0 && (
                    <ul className="mt-2.5 space-y-1 border-l-2 border-border-subtle pl-3">
                      {item.lines.map((line, index) => (
                        <li key={`${line.name}-${index}`} className="text-[14px] leading-5 text-text-primary">
                          {line.quantity > 1 && <span className="mr-1 text-text-secondary tabular">{line.quantity} ×</span>}
                          {line.name}
                        </li>
                      ))}
                      {item.moreLines > 0 && <li className="text-[13px] text-text-secondary">et {item.moreLines} autre{item.moreLines > 1 ? "s" : ""}</li>}
                    </ul>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-right text-[12.5px]">
          <Link href="/ordonnances" className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
            Toutes les ordonnances
          </Link>
        </p>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <button
            type="button"
            onClick={toggleManual}
            aria-expanded={manual}
            aria-controls="saisie-manuelle"
            className="inline-flex h-11 items-center gap-2.5 rounded-md border border-border-default bg-surface-card px-6 text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            <NotebookPen className="size-4 text-text-secondary" />
            Saisie manuelle
            <ChevronDown className={cn("size-4 text-text-tertiary transition-transform", manual && "rotate-180")} />
          </button>
          <p className="inline-flex items-center gap-2 text-[14px] text-text-secondary">
            <ShieldCheck className="size-4.5 text-text-tertiary" />
            Conseils soumis à validation
          </p>
        </footer>
      </section>

      {/* Toujours monté, seulement masqué : le formulaire garde ses réglages et sait recevoir une ordonnance glissée. */}
      <div id="saisie-manuelle" ref={panelRef} hidden={!manual} className="scroll-mt-4 space-y-6">
        {children}
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse justify-end gap-1 rounded-xl border border-border-subtle px-4 py-4 shadow-card sm:px-5">
      <dt className="text-[13.5px] leading-[18px] text-text-secondary">{label}</dt>
      <dd className="text-[26px] leading-8 font-semibold tabular text-text-primary">{value}</dd>
    </div>
  );
}

/** L'attente : ce que le comptoir fait quand rien n'arrive — et, honnêtement, ce qui l'empêche de voir arriver. */
function Waiting({ status, canConfigure }: { status: CounterDashboardData["status"]; canConfigure: boolean }) {
  const ready = status.state === "READY";
  const unassigned = status.state === "UNASSIGNED";
  const Icon = ready ? ScanLine : status.state === "OFFLINE" ? Unplug : unassigned ? UserRound : PlugZap;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className={cn("flex size-16 items-center justify-center rounded-full", ready ? "bg-brand-100/70 text-brand-600 dark:bg-brand-900/50 dark:text-brand-400" : status.state === "OFFLINE" ? "bg-warning-100/70 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400" : "bg-surface-card text-text-tertiary")}>
        <Icon className="size-7" strokeWidth={1.75} />
      </span>
      <h2 className="text-[24px] leading-8 font-semibold tracking-[-0.01em] text-text-primary">
        {ready ? "En attente d'une délivrance" : status.state === "OFFLINE" ? "Aucune délivrance suivie pour l'instant" : unassigned ? "Choisissez votre comptoir" : "Aucun poste relié"}
      </h2>
      <p className="max-w-md text-[16px] leading-6 text-text-secondary">
        {ready
          ? "Continuez dans votre logiciel de pharmacie. Les conseils apparaîtront automatiquement lorsqu'une délivrance sera détectée."
          : unassigned
            ? "Chaque comptoir est un espace à part : vous ne voyez que les délivrances du vôtre, et personne ne voit les vôtres."
            : status.state === "OFFLINE"
            ? "Vérifiez que l'ordinateur du comptoir est allumé et relié à Internet. En attendant, vous pouvez saisir une vente à la main."
            : "Sans poste relié, PharmaBoost ne voit pas vos délivrances. En attendant, vous pouvez saisir une vente à la main."}
      </p>
      {status.posts.length > 0 && (
        <ul className="space-y-1.5">
          {status.posts.map((post) => (
            <li key={post.id} className="flex items-center justify-center gap-2.5 text-[16px] text-text-secondary">
              <Monitor className="size-5 text-text-tertiary" />
              <span>{post.label}{post.owner ? ` · ${post.owner}` : ""}</span>
              {post.online ? <CircleCheck className="size-5 text-success-600 dark:text-success-400" aria-label="en ligne" /> : <span className="inline-flex items-center gap-1 text-[13.5px] text-warning-700 dark:text-warning-400"><TriangleAlert className="size-4" />hors ligne</span>}
            </li>
          ))}
        </ul>
      )}
      {status.awaitingFirstScan && <p className="max-w-md text-[13.5px] leading-5 text-text-secondary">Aucun bip reçu pour l&apos;instant : bipez une boîte au comptoir pour vérifier que le suivi arrive.</p>}
      {(status.state === "UNASSIGNED" || status.state === "NOT_CONNECTED") && canConfigure && (
        <Link href="/connexion" className="inline-flex h-11 items-center gap-2 rounded-md bg-brand-gradient px-6 text-sm font-medium text-white shadow-xs transition-[filter] hover:brightness-[0.93] focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none">
          {status.state === "UNASSIGNED" ? "Attribuer les comptoirs" : "Connecter mon comptoir"}
          <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** Une délivrance est arrivée : la carte la montre, et mène aux conseils. */
function InProgress({ sales }: { sales: LiveSale[] }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[20px] leading-7 font-semibold text-text-primary">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
          </span>
          {sales.length > 1 ? "Délivrances en cours" : "Délivrance en cours"}
        </h2>
        <CounterResetButton />
      </div>
      <ul className="mt-4 space-y-2.5">
        {sales.map((sale) => {
          const stage = describeSaleStage(sale.status, sale.recommendations);
          return (
            <li key={sale.id}>
              <Link href={`/vente/${sale.id}`} className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-card px-4 py-3.5 transition-colors hover:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-text-secondary">
                    <span className="font-medium text-text-primary">{ordonnanceTitle(sale.reference)}</span> · {sale.post ? `${sale.post} · ` : ""}
                    {formatTime(sale.updatedAt)}
                  </span>
                  <span className="mt-1 block space-y-0.5">
                    {sale.lines.map((line, index) => (
                      <span key={`${line.drugName}-${index}`} className="block truncate text-[15px] font-medium text-text-primary">
                        {line.quantity > 1 ? `${line.quantity} × ` : ""}
                        {line.drugName}
                      </span>
                    ))}
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium", STAGE[stage.tone])}>{stage.label}</span>
                <ArrowRight className="size-4 shrink-0 text-text-tertiary" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
