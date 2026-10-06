import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { HEALTH_LABELS, HEALTH_TONES, pctText } from "@/core/performance";
import type { PortfolioHealth, PortfolioRow, SubscriptionReturn } from "@/core/performance/types";
import { formatCents, formatNumber, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Stack, When } from "../../pharmacies/client-ui";
import { tabHref } from "../../pharmacies/[id]/shared";

/**
 * Le portefeuille, officine par officine : un tableau sur grand écran, une
 * carte par officine sur mobile. Même contenu, même ordre (celui du calcul :
 * à voir en premier d'abord). Aucune donnée patient, aucun collaborateur :
 * des volumes, des montants et des dates.
 */

export function HealthBadge({ health }: { health: PortfolioHealth }) {
  return <Badge tone={HEALTH_TONES[health]}>{HEALTH_LABELS[health]}</Badge>;
}

/** Pourquoi cette classe, en phrases courtes : ce que l'équipe peut dire au titulaire. */
function Reasons({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12.5px] leading-5 text-text-secondary marker:text-text-tertiary">
      {reasons.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
}

function PharmacyLink({ row }: { row: PortfolioRow }) {
  return (
    <>
      {/* La fiche s'ouvre sur son onglet Performance : le détail de ce que la ligne résume. */}
      <Link href={tabHref(row.pharmacyId, "performance")} className="block font-medium text-text-primary hover:underline">
        {row.name}
      </Link>
      <span className="mt-0.5 block text-[12px] text-text-tertiary">{row.city ?? "Ville non renseignée"}</span>
    </>
  );
}

function AdviceCell({ row }: { row: PortfolioRow }) {
  if (row.proposed === 0) return <span className="text-[13px] text-text-tertiary">Aucun conseil ce mois-ci</span>;
  // Le même arrondi, au pourcent entier, que le tableau de bord et la narration : « 63 % » ici comme dans l'onglet de la fiche.
  const rate = row.acceptanceRate === null ? "" : ` · ${pctText(row.acceptanceRate)}`;
  return <Stack primary={`${formatNumber(row.proposed)} ${pluralize(row.proposed, "proposé")}`} secondary={`${formatNumber(row.accepted)} ${pluralize(row.accepted, "accepté")}${rate}`} />;
}

/**
 * Les conseils achetés (des conseils distincts, pas des tickets : un mot, une unité). Les lignes de vente
 * sans prix saisi sont dites à part, dans leur unité : elles ne sont jamais comptées dans le chiffre
 * d'affaires, et ne se lisent pas comme une partie du nombre de conseils.
 */
function SalesCell({ row }: { row: PortfolioRow }) {
  const unpriced = row.unpricedConfirmedLines;
  return <Stack primary={formatNumber(row.purchased)} secondary={unpriced > 0 ? `dont ${formatNumber(unpriced)} ${pluralize(unpriced, "ligne de vente", "lignes de vente")} sans prix (hors CA)` : undefined} />;
}

/**
 * La variation du chiffre d'affaires par rapport à la même période du mois
 * précédent. Jamais de pourcentage quand il n'y avait rien à comparer.
 */
export function Delta({ row }: { row: Pick<PortfolioRow, "deltaPct" | "confirmedTtcCents" | "previousConfirmedTtcCents"> }) {
  const { deltaPct, confirmedTtcCents, previousConfirmedTtcCents } = row;
  if (deltaPct === null) {
    if (confirmedTtcCents === 0 && previousConfirmedTtcCents === 0) return null;
    return <span className="text-[12px] text-text-tertiary">rien le mois dernier</span>;
  }
  const rounded = Math.round(deltaPct);
  const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const sign = direction === "up" ? "+" : direction === "down" ? "−" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums",
        direction === "up" && "text-success-700 dark:text-success-500",
        direction === "down" && "text-danger-700 dark:text-danger-500",
        direction === "flat" && "text-text-tertiary",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {sign}
      {formatNumber(Math.abs(rounded))} %<span className="font-normal text-text-tertiary"> vs mois dernier</span>
    </span>
  );
}

function RevenueCell({ row }: { row: PortfolioRow }) {
  return (
    <>
      <span className="block text-[13px] font-medium tabular-nums text-text-primary">{formatCents(row.confirmedTtcCents)}</span>
      <span className="mt-0.5 block">
        <Delta row={row} />
      </span>
    </>
  );
}

/** « 4,2 fois » quand le calcul est fiable ; sinon « Non mesurable », la raison au survol (et en clair sur mobile). */
export function RoiCell({ roi, showDetail = false }: { roi: SubscriptionReturn; showDetail?: boolean }) {
  if (roi.status === "shown") {
    return <Stack primary={<span className="font-semibold tabular-nums">{roi.ratioLabel}</span>} secondary={roi.trialing ? "le prix de l'abonnement après essai" : "le prix de l'abonnement"} />;
  }
  return (
    <>
      <span title={roi.detail} className="block cursor-help text-[13px] text-text-tertiary underline decoration-dotted underline-offset-2">
        Non mesurable
      </span>
      {showDetail ? <span className="mt-0.5 block text-[12px] leading-4 text-text-tertiary">{roi.detail}</span> : <span className="sr-only">{roi.detail}</span>}
    </>
  );
}

function LastActivity({ row }: { row: PortfolioRow }) {
  return (
    <>
      <span className="block text-[12.5px] text-text-secondary">
        Conseil : <When date={row.lastProposalAt} empty="aucun" />
      </span>
      <span className="mt-0.5 block text-[12.5px] text-text-secondary">
        Vente : <When date={row.lastSaleAt} empty="aucune" />
      </span>
    </>
  );
}

/** Grand écran : une ligne par officine. */
export function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  return (
    <TableWrapper className="hidden lg:block">
      <Table>
        <caption className="sr-only">Ce que PharmaBoost rapporte à chaque officine ce mois-ci</caption>
        <THead>
          <TR>
            <TH>Officine</TH>
            <TH>État</TH>
            <TH>Conseils</TH>
            <TH numeric>Conseils achetés</TH>
            <TH numeric>CA TTC du mois</TH>
            <TH>Retour sur abonnement</TH>
            <TH>Dernière activité</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.pharmacyId} interactive>
              <TD className="align-top">
                <PharmacyLink row={row} />
              </TD>
              <TD className="align-top">
                {/* Largeur fixe : le tableau garde sa largeur propre, les raisons passent à la ligne. */}
                <div className="w-72 max-w-full">
                  <HealthBadge health={row.health} />
                  <Reasons reasons={row.reasons} />
                </div>
              </TD>
              <TD className="align-top">
                <AdviceCell row={row} />
              </TD>
              <TD numeric className="align-top">
                <SalesCell row={row} />
              </TD>
              <TD numeric className="align-top">
                <RevenueCell row={row} />
              </TD>
              <TD className="align-top">
                <RoiCell roi={row.roi} />
              </TD>
              <TD className="align-top">
                <LastActivity row={row} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrapper>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-medium text-text-tertiary">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** Mobile et tablette : une carte par officine. */
export function PortfolioCards({ rows }: { rows: PortfolioRow[] }) {
  return (
    <ul className="space-y-3 lg:hidden" aria-label="Ce que PharmaBoost rapporte à chaque officine ce mois-ci">
      {rows.map((row) => (
        <li key={row.pharmacyId} className="rounded-2xl border border-border-subtle bg-surface-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <PharmacyLink row={row} />
            </div>
            <HealthBadge health={row.health} />
          </div>
          <Reasons reasons={row.reasons} />
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3">
            <Fact label="Conseils">
              <AdviceCell row={row} />
            </Fact>
            <Fact label="Conseils achetés">
              <SalesCell row={row} />
            </Fact>
            <Fact label="CA TTC du mois">
              <RevenueCell row={row} />
            </Fact>
            <Fact label="Retour sur abonnement">
              <RoiCell roi={row.roi} showDetail />
            </Fact>
            <Fact label="Dernière activité">
              <LastActivity row={row} />
            </Fact>
          </dl>
        </li>
      ))}
    </ul>
  );
}
