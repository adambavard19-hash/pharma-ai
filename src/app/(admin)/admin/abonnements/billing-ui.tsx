import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { TIME_ZONE } from "@/config/constants";
import type { PriceSource } from "@/core/billing/contract-price";
import type { StatusLabel } from "@/core/admin/statuses";
import { cn } from "@/lib/utils";

/**
 * Petites pièces d'affichage partagées par les pages de l'espace Facturation
 * (abonnements, paiements, impayés, résiliations). Purement visuelles : aucune
 * lecture, aucun geste.
 */

const dateTime = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatDateTimeParis(date: Date): string {
  return dateTime.format(date).replace(",", " à");
}

/** Une date, ou un tiret discret. */
export function DateText({ date, fallback = "—" }: { date: Date | null | undefined; fallback?: string }) {
  if (!date) return <span className="text-text-tertiary">{fallback}</span>;
  return <span className="tabular-nums">{formatFrenchDate(date)}</span>;
}

/** Le tarif contractuel d'une ligne, avec l'écart au catalogue quand il existe. */
export function ContractPriceCell({ cents, source, catalogCents, differs }: { cents: number; source: PriceSource; catalogCents: number; differs: boolean }) {
  return (
    <div className="space-y-1">
      <p className="font-medium tabular-nums text-text-primary">
        {formatEuros(cents)}
        <span className="ml-1 text-[12px] font-normal text-text-tertiary">HT/mois</span>
      </p>
      {differs && (
        <Badge tone="info" title={`Tarif catalogue actuel : ${formatEuros(catalogCents)} HT/mois`}>
          Catalogue : {formatEuros(catalogCents)}
        </Badge>
      )}
      {source === "CATALOG_FALLBACK" && <p className="text-[11.5px] text-text-tertiary">Tarif non figé (catalogue)</p>}
    </div>
  );
}

/** Un statut avec un détail en dessous (« À jour » / « 290 € le 03/10/2026 »). */
export function StatusWithDetail({ status, detail }: { status: StatusLabel; detail?: string | null }) {
  return (
    <div className="space-y-0.5">
      <Badge tone={status.tone}>{status.label}</Badge>
      {detail && <p className="text-[11.5px] text-text-tertiary tabular-nums">{detail}</p>}
    </div>
  );
}

/** Le bandeau « Stripe non configuré » : dit ce qui ne marchera pas, sans rien simuler. */
export function StripeNotConfigured({ detail, children }: { detail: string; children?: ReactNode }) {
  return (
    <Alert tone="warning" title="Stripe non configuré">
      {detail} {children ?? "Les gestes qui passent par Stripe sont indisponibles ; rien n'est simulé."}
    </Alert>
  );
}

/** Une ligne « geste » d'un panneau d'actions : intitulé, explication, bouton. */
export function ActionRow({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-text-primary">{title}</p>
        {description && <p className="mt-0.5 text-[12.5px] leading-5 text-text-secondary">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Le lien d'une ligne de tableau vers une fiche, lisible au clavier. */
export function RowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-medium text-text-primary underline-offset-2 hover:text-brand-700 hover:underline focus-visible:underline", className)}>
      {children}
    </Link>
  );
}

/** Lecture d'un paramètre d'adresse (Next 16 : valeurs simples ou multiples). */
export function readParam(params: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = params[key];
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return null;
}
