"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, FileText, Lightbulb, MessageSquareQuote, ShieldAlert } from "lucide-react";
import { adviceAnchor, adviceIdFromHash } from "../../../../../agent/src/sale-link";
import { cn } from "@/lib/utils";
import { buildAdviceSheet, sortForPatient, type SheetLine } from "./advice-sheet";
import type { AdviceView } from "./types";

/**
 * Le conseil « visé » de la page de vente : celui sur lequel on a cliqué dans la bannière du comptoir (lien
 * `/vente/<id>?conseil=<conseil>#conseil-<conseil>`, voir agent/src/sale-link.ts), ou dans l'île de l'écran. Sa carte
 * s'ouvre dépliée, se signale d'un liseré, et la page défile jusqu'à elle.
 *
 * Le paramètre est lu par le serveur (`initialId`) ; l'ancre est suivie ici, pour un clic sur la même page.
 */

type AdviceFocus = {
  focusedId: string | null;
  /** Change à chaque nouvelle visée, même sur le même conseil : la carte se rouvre et la page y retourne. */
  nonce: number;
  focus: (id: string) => void;
  /** La personne peut ouvrir la fiche produit (droit de consultation du catalogue de l'officine). */
  canOpenProduct: boolean;
};

const AdviceFocusContext = createContext<AdviceFocus>({ focusedId: null, nonce: 0, focus: () => undefined, canOpenProduct: false });

export function AdviceFocusProvider({ initialId, canOpenProduct, children }: { initialId: string | null; canOpenProduct: boolean; children: ReactNode }) {
  const [state, setState] = useState<{ id: string | null; nonce: number }>({ id: initialId, nonce: 0 });
  const focus = useCallback((id: string) => setState((current) => ({ id, nonce: current.nonce + 1 })), []);

  useEffect(() => {
    const follow = () => {
      const id = adviceIdFromHash(window.location.hash);
      if (id) focus(id);
    };
    // Une adresse qui ne porte que l'ancre (lien de l'île de l'écran, ou recopiée à la main) vise aussi son conseil.
    if (!initialId) follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [focus, initialId]);

  const value = useMemo(() => ({ focusedId: state.id, nonce: state.nonce, focus, canOpenProduct }), [state, focus, canOpenProduct]);
  return <AdviceFocusContext.Provider value={value}>{children}</AdviceFocusContext.Provider>;
}

export function useAdviceFocus(): AdviceFocus {
  return useContext(AdviceFocusContext);
}

/** Vrai quand l'un de ces conseils est le conseil visé (une routine porte plusieurs conseils). */
function useFocused(ids: string[]): { focused: boolean; nonce: number } {
  const { focusedId, nonce } = useContext(AdviceFocusContext);
  return { focused: focusedId !== null && ids.includes(focusedId), nonce };
}

/**
 * L'ancre d'une carte : `id="conseil-<id>"` pour chaque conseil qu'elle porte (le navigateur y descend tout seul), un
 * défilement doux quand la visée arrive après coup, et un liseré qui dit « c'est celui-ci ».
 */
export function AdviceAnchor({ ids, children }: { ids: string[]; children: ReactNode }) {
  const { focused, nonce } = useFocused(ids);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused) return;
    // Après le premier rendu (images, cartes au-dessus) : la position est alors stable.
    const id = setTimeout(() => box.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return () => clearTimeout(id);
  }, [focused, nonce]);
  return (
    <div ref={box} data-advice-focused={focused ? "" : undefined} className={cn("relative scroll-mt-24 rounded-2xl", focused && "outline-2 outline-offset-4 outline-brand-400 dark:outline-brand-600")}>
      {ids.map((id) => (
        <span key={id} id={adviceAnchor(id)} aria-hidden="true" className="absolute top-0 scroll-mt-24" />
      ))}
      {children}
    </div>
  );
}

/**
 * « Fiche complète du conseil » : repliée par défaut pour ne pas allonger le comptoir, DÉPLIÉE sur le conseil visé. Une
 * nouvelle visée la rouvre (la clé change), même si on l'avait refermée.
 */
export function AdviceSheetToggle({ recommendation, withScript = false, label }: { recommendation: AdviceView; withScript?: boolean; label?: string }) {
  const { focused, nonce } = useFocused([recommendation.id]);
  return <SheetDisclosure key={focused ? `vise-${nonce}` : "repos"} recommendation={recommendation} initiallyOpen={focused} withScript={withScript} label={label ?? "Fiche complète du conseil"} />;
}

function SheetDisclosure({ recommendation, initiallyOpen, withScript, label }: { recommendation: AdviceView; initiallyOpen: boolean; withScript: boolean; label: string }) {
  const [open, setOpen] = useState(initiallyOpen);
  const sheet = useMemo(() => buildAdviceSheet(recommendation), [recommendation]);
  const panel = `fiche-${recommendation.id}`;
  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panel}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border-subtle px-3.5 py-2.5 text-left transition-colors hover:border-border-default hover:bg-surface-sunken/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <FileText className="size-[18px] shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-text-primary">{label}</span>
          <span className="block text-[12.5px] text-text-secondary">
            Contre-indications{sheet.contraindications.length > 0 ? ` (${sheet.contraindications.length})` : ""} · Conseils d&apos;utilisation{sheet.usage.length > 0 ? ` (${sheet.usage.length})` : ""}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-text-tertiary transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div id={panel}>
          <AdviceSheet recommendation={recommendation} withScript={withScript} />
        </div>
      )}
    </div>
  );
}

const PATIENT: Record<NonNullable<SheetLine["patient"]>, { label: string; className: string }> = {
  CONCERNED: { label: "Concerne ce patient", className: "bg-danger-100 text-danger-800 dark:bg-danger-900/40 dark:text-danger-300" },
  UNKNOWN: { label: "À vérifier avec le patient", className: "bg-warning-100 text-warning-800 dark:bg-warning-900/40 dark:text-warning-400" },
  NOT_CONCERNED: { label: "Ne concerne pas ce patient", className: "bg-surface-sunken text-text-secondary" },
};

/**
 * Le conseil en entier : pourquoi il est proposé, ce que le pharmacien peut dire, les contre-indications et les conseils
 * d'utilisation, chaque ligne avec sa source. Rien n'est rédigé ici (voir advice-sheet.ts) : une rubrique vide dit
 * qu'elle n'est pas renseignée.
 */
export function AdviceSheet({ recommendation, withScript = false }: { recommendation: AdviceView; withScript?: boolean }) {
  const sheet = useMemo(() => buildAdviceSheet(recommendation), [recommendation]);
  const { canOpenProduct } = useAdviceFocus();
  const product = recommendation.product;
  const productHref = canOpenProduct && product && !product.presentationId ? `/stock/${product.id}` : null;

  return (
    <div className="space-y-4 rounded-xl border border-border-subtle bg-surface-sunken/40 px-4 py-4">
      <SheetBlock icon={<Lightbulb className="size-4" aria-hidden="true" />} title="Pourquoi il est proposé">
        {sheet.reasons.length > 0 ? (
          <div className="space-y-1.5">
            {sheet.reasons.map((reason) => (
              <p key={reason} className="text-[14px] leading-[1.55] text-text-primary">{reason}</p>
            ))}
          </div>
        ) : (
          <Missing>La raison de ce conseil n&apos;est pas renseignée.</Missing>
        )}
        {sheet.benefits.length > 0 && <p className="mt-2 text-[13px] text-text-secondary">Ce qu&apos;il apporte ici : {sheet.benefits.join(" · ")}</p>}
      </SheetBlock>

      {withScript && sheet.counterScript && (
        <SheetBlock icon={<MessageSquareQuote className="size-4" aria-hidden="true" />} title="Ce que vous pouvez dire">
          <p className="text-[15px] leading-[1.55] text-text-primary">{sheet.counterScript}</p>
        </SheetBlock>
      )}

      {sheet.patientReason && (
        <SheetBlock icon={<MessageSquareQuote className="size-4" aria-hidden="true" />} title="Ce que lira le patient">
          <p className="text-[14px] leading-[1.55] text-text-primary">{sheet.patientReason}</p>
        </SheetBlock>
      )}

      <SheetBlock icon={<ShieldAlert className="size-4" aria-hidden="true" />} title="Contre-indications" tone="danger">
        {sheet.contraindications.length > 0 ? (
          <SheetList lines={sortForPatient(sheet.contraindications)} />
        ) : (
          <Missing>Aucune contre-indication n&apos;est renseignée dans PharmaBoost pour ce produit : reportez-vous à sa notice.</Missing>
        )}
      </SheetBlock>

      <SheetBlock icon={<BookOpen className="size-4" aria-hidden="true" />} title="Conseils d'utilisation">
        {sheet.usage.length > 0 && <SheetList lines={sheet.usage} />}
        {sheet.description && (
          <div className={cn(sheet.usage.length > 0 && "mt-2")}>
            <p className="text-[11.5px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Description · fiche produit de l&apos;officine</p>
            <p className="mt-0.5 text-[13.5px] leading-[1.55] text-text-secondary">{sheet.description}</p>
          </div>
        )}
        {sheet.usage.length === 0 && !sheet.description && (
          <Missing>Aucun conseil d&apos;utilisation n&apos;est renseigné dans PharmaBoost pour ce produit : reportez-vous à sa notice.</Missing>
        )}
      </SheetBlock>

      {productHref && (
        <Link href={productHref} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
          <FileText className="size-3.5" aria-hidden="true" /> Ouvrir la fiche produit
        </Link>
      )}
    </div>
  );
}

function SheetBlock({ icon, title, tone, children }: { icon: ReactNode; title: string; tone?: "danger"; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h4 className={cn("flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] uppercase", tone === "danger" ? "text-danger-800 dark:text-danger-300" : "text-text-secondary")}>
        {icon}
        {title}
      </h4>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function SheetList({ lines }: { lines: SheetLine[] }) {
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li key={`${line.text}|${line.detail ?? ""}|${line.source}`} className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] leading-5 font-medium text-text-primary">
            {line.text}
            {line.patient && <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", PATIENT[line.patient].className)}>{PATIENT[line.patient].label}</span>}
          </p>
          {line.detail && <p className="mt-0.5 text-[13px] leading-5 text-text-secondary">{line.detail}</p>}
          <p className="mt-0.5 text-[11.5px] text-text-tertiary">{line.source}</p>
        </li>
      ))}
    </ul>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-5 text-text-tertiary italic">{children}</p>;
}
