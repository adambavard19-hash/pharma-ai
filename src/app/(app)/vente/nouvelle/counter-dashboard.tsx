"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, CircleCheck, Monitor, NotebookPen, TriangleAlert, Unplug } from "lucide-react";
import { describeSaleStage, ordonnanceTitle, summarizeProducts, type CounterDashboardData, type PillTone, type StageTone } from "@/core/counter/dashboard";
import { ADVICE_OUTCOME_LABEL, describeAdviceCount, type AdviceOutcome, type FinishedSale, type LiveSale } from "@/core/counter/board";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CounterResetButton } from "../counter-reset-button";
import { PageTitle } from "@/components/ui/page-title";

export type { LiveSale, FinishedSale } from "@/core/counter/board";

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
 * Le verre dépoli posé sur l'hélice d'ADN du fond (page.tsx) : blanc à 45-50 %, flou de 10 px — l'encre se voit
 * nettement derrière, le texte reste net.
 */
const GLASS = "rounded-[24px] border border-white/70 bg-(--glass-soft) p-4 shadow-[0_12px_32px_-20px_rgb(5_64_56/0.35)] backdrop-blur-[10px] sm:p-5 dark:border-white/10";

const OUTCOME: Record<AdviceOutcome, string> = {
  PROPOSED: "bg-brand-50 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300",
  SOLD: "bg-success-50 text-success-800 dark:bg-success-950/50 dark:text-success-300",
  NOT_SOLD: "bg-surface-sunken text-text-secondary",
  UNANSWERED: "bg-surface-sunken text-text-tertiary",
};

/**
 * « Au comptoir » (adresse /vente/nouvelle) : au comptoir, c'est la bannière du poste Windows qui fait tout ; cette page
 * sert à SUIVRE (demande du fondateur, 13 oct. 2026). Dans l'ordre :
 *  1. « Délivrances en cours » : chaque vente ouverte de mes comptoirs, ce qui a été scanné, les conseils proposés et
 *     leur état (Proposé / Vendu / Non vendu), en direct (toutes les 2,5 secondes) ;
 *  2. « Terminées aujourd'hui » : pour retrouver un patient (toutes les 15 secondes, et dès qu'une vente change) ;
 *  3. « Saisie à la main », repliée : le secours d'une pharmacie sans poste relié ou en panne.
 * Pas de robot, pas de bonjour, pas de liste d'ordonnances : un patient qui pose une question se conseille depuis la
 * « Discussion » du robot, dans l'île en haut de l'écran.
 */
export function CounterDashboard({
  dateLabel,
  initial,
  initialSales,
  initialFinished,
  canConfigure,
  manualOpen,
  notice,
  children,
}: {
  dateLabel: string;
  /** L'état des comptoirs (pastille Connecté / Hors ligne). */
  initial: CounterDashboardData;
  initialSales: LiveSale[];
  initialFinished: FinishedSale[];
  /** Peut relier un comptoir (la page « Mes comptoirs »). */
  canConfigure: boolean;
  /** Ouvre la saisie à la main d'emblée : un patient ou une demande de démonstration arrive déjà choisi. */
  manualOpen: boolean;
  /** Un bandeau sous le titre (rappel du stock pour le titulaire). */
  notice?: ReactNode;
  /** La saisie à la main : ordonnance, médicament, demande sans ordonnance. */
  children?: ReactNode;
}) {
  const [data, setData] = useState(initial);
  const [sales, setSales] = useState(initialSales);
  const [finished, setFinished] = useState(initialFinished);
  const [manual, setManual] = useState(manualOpen);
  const openedRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // L'état des comptoirs et les ventes terminées : plus rarement que les délivrances en cours.
  const refresh = useCallback(async () => {
    try {
      const [board, done] = await Promise.all([fetch("/api/comptoir/tableau", { cache: "no-store" }), fetch("/api/comptoir/en-cours?terminees=1", { cache: "no-store" })]);
      if (board.ok) setData((await board.json()) as CounterDashboardData);
      if (done.ok) {
        const body = (await done.json()) as { sales: LiveSale[]; finished?: FinishedSale[] };
        setSales(body.sales);
        if (body.finished) setFinished(body.finished);
      }
    } catch {
      // Une interruption réseau n'a rien à afficher : la prochaine lecture reprendra.
    }
  }, []);

  // Les délivrances en cours, en direct.
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

  useEffect(() => {
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);
  // Une vente apparaît, change d'état ou disparaît (terminée) : les terminées et la pastille se relisent tout de suite.
  const signature = sales.map((sale) => `${sale.id}:${sale.status}:${sale.advice.map((a) => a.outcome).join(",")}`).join("|");
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

  const { status } = data;

  return (
    <div className="space-y-6">
      {/* L'en-tête, posé directement sur l'hélice du fond (page.tsx) : le titre en grand et léger, sur une ligne, et l'état
          du comptoir sur une pastille de verre. */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-2 sm:pt-6">
        <div className="min-w-0 space-y-2">
          <p className="pb-surtitre">{dateLabel}</p>
          <PageTitle text="Au comptoir" className="text-[40px] leading-[1.1] font-light tracking-[-0.03em] whitespace-nowrap text-text-primary sm:text-[52px]" />
        </div>
        <div className="espace-verre-doux rounded-full border border-white/70 p-1.5 shadow-[0_8px_24px_-12px_rgb(5_64_56/0.25)] dark:border-white/10">
          <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13.5px] font-medium whitespace-nowrap", PILL[status.pill.tone])}>
            {status.pill.tone === "success" ? <CircleCheck className="size-4" /> : status.pill.tone === "warning" ? <TriangleAlert className="size-4" /> : <Unplug className="size-4" />}
            {status.pill.label}
          </span>
        </div>
      </header>

      {/* Le bandeau du stock passe lui aussi au verre léger (sa bordure et son icône gardent la couleur d'alerte). */}
      <div className="empty:hidden [&>div]:bg-(--glass-soft) [&>div]:backdrop-blur-[10px]">{notice}</div>

      <section aria-labelledby="titre-en-cours" className={cn(GLASS, "space-y-3")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titre-en-cours" className="flex items-center gap-2.5 text-[20px] leading-7 font-semibold text-text-primary">
            {sales.length > 0 && (
              <span className="relative flex size-2.5" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
              </span>
            )}
            Délivrances en cours
          </h2>
          {sales.length > 0 && <CounterResetButton />}
        </div>
        <div aria-live="polite">
          {sales.length > 0 ? (
            <ul className="space-y-2.5">
              {sales.map((sale) => (
                <LiveSaleCard key={sale.id} sale={sale} />
              ))}
            </ul>
          ) : (
            <NothingLive status={status} canConfigure={canConfigure} />
          )}
        </div>
      </section>

      <section aria-labelledby="titre-terminees" className={cn(GLASS, "space-y-3")}>
        <h2 id="titre-terminees" className="text-[20px] leading-7 font-semibold text-text-primary">
          Terminées aujourd&apos;hui
        </h2>
        {finished.length === 0 ? (
          <p className="rounded-xl border border-border-subtle px-4 py-4 text-[14px] text-text-secondary">Aucune vente terminée aujourd&apos;hui.</p>
        ) : (
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface-card">
            {finished.map((sale) => (
              <li key={sale.id}>
                <Link href={`/vente/${sale.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none focus-visible:ring-inset">
                  <span className="w-12 shrink-0 text-[14px] font-medium text-text-primary tabular">{formatTime(sale.finishedAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] text-text-primary">{summarizeProducts(sale.lines.map((line) => line.drugName))}</span>
                    <span className="block truncate text-[12.5px] text-text-secondary">{[describeAdviceCount(sale.soldCount, sale.adviceCount), sale.comptoir].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-text-tertiary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Saisie à la main" className={GLASS}>
        <button
          type="button"
          onClick={toggleManual}
          aria-expanded={manual}
          aria-controls="saisie-manuelle"
          className="inline-flex items-center gap-2 rounded-md px-1 py-1 text-[14px] text-text-secondary transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          <NotebookPen className="size-4" />
          Saisie à la main
          <ChevronDown className={cn("size-4 transition-transform", manual && "rotate-180")} />
        </button>
        <p className="mt-0.5 px-1 text-[12.5px] text-text-tertiary">Pour une pharmacie sans poste relié, ou en cas de panne.</p>
        {/* Toujours monté, seulement masqué : le formulaire garde ses réglages et sait recevoir une ordonnance glissée. */}
        <div id="saisie-manuelle" ref={panelRef} hidden={!manual} className="mt-4 scroll-mt-4 space-y-6">
          {children}
        </div>
      </section>
    </div>
  );
}

/** Une délivrance en cours : le comptoir, l'heure, l'étape, ce qui a été scanné, les conseils et leur état. */
function LiveSaleCard({ sale }: { sale: LiveSale }) {
  const stage = describeSaleStage(sale.status, sale.recommendations);
  return (
    <li>
      <Link href={`/vente/${sale.id}`} className="block rounded-2xl border border-border-subtle bg-surface-card px-4 py-3.5 shadow-card transition-colors hover:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none sm:px-5">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[13.5px] text-text-secondary">
            <span className="font-medium text-text-primary">{sale.comptoir ?? ordonnanceTitle(sale.reference)}</span> · <span className="tabular">{formatTime(sale.updatedAt)}</span>
          </span>
          <span className={cn("ml-auto shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium", STAGE[stage.tone])}>{stage.label}</span>
          <ArrowRight className="size-4 shrink-0 text-text-tertiary" />
        </span>
        {sale.lines.length > 0 && (
          <span className="mt-2 block space-y-0.5">
            {sale.lines.map((line, index) => (
              <span key={`${line.drugName}-${index}`} className="block truncate text-[15px] font-medium text-text-primary">
                {line.quantity > 1 ? `${line.quantity} × ` : ""}
                {line.drugName || "Produit non reconnu"}
              </span>
            ))}
          </span>
        )}
        {sale.advice.length > 0 && (
          <span className="mt-2.5 block border-t border-border-subtle pt-2.5">
            <span className="block text-[12px] font-medium tracking-[0.04em] text-text-tertiary uppercase">Conseils</span>
            <span className="mt-1 block space-y-1">
              {sale.advice.map((advice) => (
                <span key={advice.name} className="flex items-center gap-2 text-[14px] text-text-primary">
                  <span className="min-w-0 flex-1 truncate">{advice.name}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium", OUTCOME[advice.outcome])}>{ADVICE_OUTCOME_LABEL[advice.outcome]}</span>
                </span>
              ))}
            </span>
          </span>
        )}
      </Link>
    </li>
  );
}

/** Rien en cours : ce que fait le comptoir — et, honnêtement, ce qui l'empêche de voir arriver les délivrances. */
function NothingLive({ status, canConfigure }: { status: CounterDashboardData["status"]; canConfigure: boolean }) {
  const text =
    status.state === "READY"
      ? "Aucune délivrance en cours. Elles apparaissent ici dès qu'une boîte est scannée au comptoir."
      : status.state === "UNASSIGNED"
        ? "Ouvrez PharmaBoost depuis l'ordinateur de votre comptoir : vous voyez les délivrances du vôtre, et personne ne voit les vôtres."
        : status.state === "OFFLINE"
          ? "L'ordinateur du comptoir ne répond pas : vérifiez qu'il est allumé et relié à Internet. En attendant, la saisie à la main reste possible."
          : "Aucun poste relié : PharmaBoost ne voit pas vos délivrances. En attendant, la saisie à la main reste possible.";
  return (
    <div className="rounded-xl border border-border-subtle px-4 py-4">
      <p className="text-[14px] leading-5 text-text-secondary">{text}</p>
      {status.posts.length > 0 && (
        <ul aria-label="Vos comptoirs" className="mt-3 flex flex-wrap gap-2">
          {status.posts.map((post) => (
            <li key={post.id} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-sunken/70 py-1 pr-3 pl-2.5 text-[13px] text-text-primary">
              <Monitor className="size-3.5 text-text-tertiary" aria-hidden />
              <span>{post.label}{post.owner ? ` · ${post.owner}` : ""}</span>
              <span className={cn("size-2 rounded-full", post.online ? "bg-success-500" : "bg-warning-500")} role="img" aria-label={post.online ? "en ligne" : "hors ligne"} />
            </li>
          ))}
        </ul>
      )}
      {(status.state === "UNASSIGNED" || status.state === "NOT_CONNECTED") && canConfigure && (
        <Link href="/connexion" className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
          {status.state === "UNASSIGNED" ? "Voir qui est où" : "Connecter mon comptoir"}
          <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
