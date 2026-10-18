import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercent, Building2, Gift, Wallet } from "lucide-react";
import { requireSalesSession } from "@/server/auth/sales-session";
import { commissionOverviewFor, listCommissionsFor, listInvoicesFor } from "@/server/services/sales/commissions";
import { bonusLabel, bonusStatusLine, rankLabel, rewardsFor, simulate, summarizeEarnings } from "@/core/sales/progressive-commission";
import { describeCommissionRule } from "@/core/sales/commission";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { CommissionStatusBadge } from "@/components/sales/status-badge";
import { InvoiceStatusBadge } from "@/components/sales/invoice-status-badge";
import { formatCents, formatDate } from "@/lib/format";
import { BonusProgress, EarningsHero, Rewards, TierGrid } from "./_components/dashboard";
import { EarningsSimulator } from "./_components/earnings-simulator";
import { AffiliateEarnings } from "./_components/affiliate";
import { affiliateOverviewFor } from "@/server/services/sales/affiliate-commissions";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { PricingAndPay } from "@/components/affiliation/pricing-and-pay";

export const metadata: Metadata = { title: { absolute: "Mes commissions — PharmaBoost" } };

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Les commissions ordinaires montrées d'emblée ; les plus anciennes se déplient (une page qui ne s'allonge pas sans fin). */
const VISIBLE_COMMISSIONS = 20;

type Row = Awaited<ReturnType<typeof listCommissionsFor>>["rows"][number];

/**
 * « Mes commissions & bonus » : les VRAIS gains du commercial de la session
 * (ses lignes de commission, ses pharmacies activées), sa progression dans la
 * grille progressive, ses récompenses, et un simulateur. Puis le détail de
 * ses commissions et ses factures, en lecture seule. Le périmètre est
 * toujours la session, jamais un paramètre d'URL.
 */
export default async function SalesCommissionsPage() {
  const session = await requireSalesSession();
  const [data, invoices, overview] = await Promise.all([listCommissionsFor(session.rep.id), listInvoicesFor(session.rep.id), commissionOverviewFor(session.rep.id)]);
  const progressive = overview.rule.type === "PROGRESSIVE";
  // L'affilié (18 oct. 2026) : 10 % de l'abonnement de chaque pharmacie, chaque mois, à vie. Ses anciennes commissions
  // (avant l'affiliation), s'il en a, restent listées plus bas, intactes.
  const affiliate = overview.rule.type === "AFFILIATE";
  const [affiliation, pricing] = affiliate ? await Promise.all([affiliateOverviewFor(session.rep.id), loadPublicPricing()]) : [null, null];
  const activated = overview.activations.length;
  const summary = summarizeEarnings(data.rows);
  const bonusRows = data.rows.filter((row) => row.type === "BONUS").sort((a, b) => (a.bonusTier ?? 0) - (b.bonusTier ?? 0));
  const affiliateRows = data.rows.filter((row) => row.type === "AFFILIATE");
  const signupRows = data.rows.filter((row) => row.type === "AFFILIATE_SIGNUP");
  const ordinaryRows = data.rows.filter((row) => row.type !== "BONUS" && row.type !== "AFFILIATE" && row.type !== "AFFILIATE_SIGNUP");
  const rewards = rewardsFor(activated, bonusRows, overview.beforeGridTiers ?? []);
  const simulation = simulate(activated);
  const rankOf = new Map(overview.activations.map((activation) => [activation.prospectId, activation.rank]));
  const firstSteps = progressive && activated === 0 && data.rows.length === 0;
  const visible = [...bonusRows, ...ordinaryRows.slice(0, VISIBLE_COMMISSIONS)];
  const older = ordinaryRows.slice(VISIBLE_COMMISSIONS);

  /** La précision sous le nom d'une commission de grille : son rang, ou ce que vaut encore son montant. */
  const progressiveNote = (row: Row): string => {
    const rank = rankOf.get(row.prospect.id);
    if (rank) return `${rankLabel(rank)} pharmacie activée`;
    if (row.prospect.activatedAt) return "montant figé : activation créditée à un autre commercial";
    return row.status === "FORECAST" ? "prévision, avant activation" : "montant provisoire, fixé à l'activation";
  };
  const subtitle = (row: Row): string => {
    if (row.type === "BONUS") return `${row.bonusTier ? `${plural(row.bonusTier, "pharmacie activée", "pharmacies activées")} · ` : ""}${row.prospect.name}`;
    if (row.type === "PROGRESSIVE") return progressiveNote(row);
    return row.prospect.contracts[0]?.finalizedAt ? `signé le ${formatDate(row.prospect.contracts[0].finalizedAt)}` : "";
  };

  return (
    <>
      {affiliation ? (
        <>
          <div>
            <h1 className="text-[22px] leading-7 font-bold tracking-[-0.025em] text-text-primary">Mes commissions</h1>
            <p className="mt-1 text-[13.5px] text-text-secondary">Vos vrais gains d&apos;affilié, calculés à partir de vos pharmacies et de leurs abonnements.</p>
          </div>
          {pricing && <PricingAndPay audience="affiliate" pricing={pricing} />}
          <AffiliateEarnings pharmacies={affiliation.pharmacies} recurringCents={affiliation.recurringCents} activeCount={affiliation.activeCount} rows={affiliateRows} signupRows={signupRows} thisMonthCents={data.thisMonthCents} earnedCents={data.earnedCents} paidCents={data.paidCents} />
        </>
      ) : (
        <>
        <div>
          <h1 className="text-[22px] leading-7 font-bold tracking-[-0.025em] text-text-primary">Mes commissions &amp; bonus</h1>
          <p className="mt-1 text-[13.5px] text-text-secondary">Vos vrais gains, vos paliers et vos prochains objectifs. Tout se calcule à partir de vos dossiers.</p>
        </div>

        <EarningsHero summary={summary} thisMonthCents={data.thisMonthCents} firstSteps={firstSteps} />

        <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Commissions" value={formatPriceEuros(summary.commissionsCents)} sublabel={summary.commissionsUpcomingCents > 0 ? `+${formatPriceEuros(summary.commissionsUpcomingCents)} prévues` : "acquises"} icon={<Wallet className="size-4" aria-hidden="true" />} />
          {progressive ? (
            <StatCard label="Bonus débloqués" value={formatPriceEuros(summary.bonusesCents)} sublabel={bonusStatusLine(rewards, formatPriceEuros)} icon={<Gift className="size-4" aria-hidden="true" />} />
          ) : (
            <StatCard label="Votre règle" value={<span className="text-[17px] leading-6">{describeCommissionRule(overview.rule)}</span>} sublabel="accord particulier" icon={<BadgePercent className="size-4" aria-hidden="true" />} />
          )}
          <StatCard label="Pharmacies activées" value={activated} sublabel="total historique" icon={<Building2 className="size-4" aria-hidden="true" />} emphasis="brand" />
          {progressive && (
            <StatCard
              label="Commission actuelle"
              value={formatPriceEuros(simulation.rateCents)}
              sublabel={`par pharmacie · ${simulation.nextTier ? `${formatPriceEuros(simulation.nextTier.rateCents)} dès la ${rankLabel(simulation.nextTier.from)}` : "palier maximal atteint"}`}
              icon={<BadgePercent className="size-4" aria-hidden="true" />}
            />
          )}
        </section>

        {progressive ? (
          <>
            <BonusProgress simulation={simulation} />
            <Rewards rewards={rewards} />
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <TierGrid count={activated} />
              {/* Sur un téléphone, le simulateur passe avant la grille : c'est le bloc qu'on manipule. */}
              <Card className="order-first lg:order-none">
                <CardContent className="space-y-4 py-5">
                  <div>
                    <h2 className="text-[16px] leading-6 font-semibold text-text-primary">Simulateur de gains</h2>
                    <p className="mt-0.5 text-[13px] text-text-secondary">Combien rapporterait votre total d&apos;activations ? Le calcul suit exactement la grille.</p>
                  </div>
                  <EarningsSimulator realCount={activated} realTotalCents={summary.totalCents} pendingBonusCents={summary.bonusesUpcomingCents} />
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="py-5">
              <h2 className="text-[16px] leading-6 font-semibold text-text-primary">Votre rémunération</h2>
              <p className="mt-1 text-[13.5px] text-text-secondary">
                Votre contrat prévoit un accord particulier : {describeCommissionRule(overview.rule).toLowerCase()}. La grille progressive et ses bonus de palier ne s&apos;appliquent pas à votre contrat ; parlez-en à la direction commerciale si vous souhaitez y passer.
              </p>
            </CardContent>
          </Card>
        )}
        </>
      )}

      {(!affiliate || visible.length > 0) && (
      <section aria-labelledby="detail-commissions" className="space-y-3">
        <div>
          <h2 id="detail-commissions" className="text-[16px] leading-6 font-semibold text-text-primary">{affiliate ? "Mes commissions d'avant l'affiliation" : "Détail de mes commissions"}</h2>
          <p className="text-[13px] text-text-secondary">{affiliate ? "Les commissions uniques acquises avant votre passage à l'affiliation : elles restent les vôtres, inchangées." : "Les bonus de palier d'abord, puis une ligne par pharmacie, la plus récente en premier."}</p>
        </div>
        <Card><CardContent className="pt-0">
          {data.rows.length === 0 ? <p className="py-6 text-[13.5px] text-text-secondary">Aucune commission pour l&apos;instant : elle apparaît à l&apos;envoi d&apos;un contrat.</p> : (
            <>
              <CommissionRows rows={visible} subtitle={subtitle} />
              {older.length > 0 && (
                <details className="group border-t border-border-subtle">
                  <summary className="flex min-h-11 cursor-pointer items-center py-2.5 text-[13.5px] font-medium text-brand-700 hover:underline">
                    Voir {older.length > 1 ? `les ${older.length} autres commissions` : "l'autre commission"}
                  </summary>
                  <CommissionRows rows={older} subtitle={subtitle} />
                </details>
              )}
            </>
          )}
        </CardContent></Card>
      </section>
      )}

      <section aria-labelledby="mes-factures" className="space-y-3">
        <div>
          <h2 id="mes-factures" className="text-[16px] leading-6 font-semibold text-text-primary">Mes factures</h2>
          <p className="text-[13px] text-text-secondary">Les factures que vous avez envoyées à PharmaBoost, une fois enregistrées.</p>
        </div>
        <Card><CardContent className="pt-0">
          {invoices.length === 0 ? <p className="py-6 text-[13.5px] text-text-secondary">Aucune facture enregistrée pour l&apos;instant.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase"><th className="py-2.5 pr-3">Facture</th><th className="py-2.5 pr-3">Date</th><th className="py-2.5 pr-3 text-right">Montant</th><th className="py-2.5">Statut</th></tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="py-2.5 pr-3 font-medium text-text-primary">{invoice.number}</td>
                    <td className="py-2.5 pr-3 text-text-secondary">{formatDate(invoice.issuedAt)}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular text-text-primary">{formatCents(invoice.amountCents)}</td>
                    <td className="py-2.5"><InvoiceStatusBadge status={invoice.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent></Card>
      </section>
    </>
  );
}

/**
 * Des lignes de commission : liste empilée sur un téléphone (un tableau à cinq
 * colonnes y serait illisible), tableau au-delà. Montants écrits comme dans le
 * tableau de bord (« 200 € », les centimes seulement s'il y en a).
 */
function CommissionRows({ rows, subtitle }: { rows: Row[]; subtitle: (row: Row) => string }) {
  return (
    <>
      <ul className="divide-y divide-border-subtle sm:hidden">
        {rows.map((row) => {
          const bonus = bonusLabel(row);
          const note = subtitle(row);
          return (
            <li key={row.id} className="flex items-start justify-between gap-3 py-3 text-[13.5px]">
              <div className="min-w-0">
                {bonus ? <p className="inline-flex items-center gap-1.5 font-semibold text-text-primary"><Gift className="size-3.5 text-brand-600" aria-hidden="true" />{bonus}</p> : <Link href={`/extranet/dossiers/${row.prospect.id}`} className="font-medium break-words text-text-primary hover:underline">{row.prospect.name}</Link>}
                {note && <p className="text-[12px] break-words text-text-tertiary">{note}</p>}
                <p className="text-[12px] text-text-tertiary">{row.paidAt ? `payée le ${formatDate(row.paidAt)}` : row.dueAt ? `prévue le ${formatDate(row.dueAt)}` : ""}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-semibold tabular text-text-primary">{formatPriceEuros(row.amountCents)}</span>
                <CommissionStatusBadge status={row.status} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto sm:block"><table className="w-full text-[13.5px]">
        <thead><tr className="text-left text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase"><th className="py-2.5 pr-3">Pharmacie</th><th className="py-2.5 pr-3">Date signature</th><th className="py-2.5 pr-3 text-right">Montant</th><th className="py-2.5 pr-3">Statut</th><th className="py-2.5">Date paiement</th></tr></thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((row) => {
            const bonus = bonusLabel(row);
            return (
              <tr key={row.id}>
                <td className="py-2.5 pr-3">
                  {bonus ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-text-primary"><Gift className="size-3.5 text-brand-600" aria-hidden="true" />{bonus}</span>
                      <span className="block text-[12px] text-text-tertiary">{row.bonusTier ? `${plural(row.bonusTier, "pharmacie activée", "pharmacies activées")} · ` : ""}<Link href={`/extranet/dossiers/${row.prospect.id}`} className="hover:underline">{row.prospect.name}</Link></span>
                    </>
                  ) : (
                    <>
                      <Link href={`/extranet/dossiers/${row.prospect.id}`} className="font-medium text-text-primary hover:underline">{row.prospect.name}</Link>
                      {row.type === "PROGRESSIVE" && <span className="block text-[12px] text-text-tertiary">{subtitle(row)}</span>}
                    </>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-text-secondary">{!bonus && row.prospect.contracts[0]?.finalizedAt ? formatDate(row.prospect.contracts[0].finalizedAt) : "—"}</td>
                <td className="py-2.5 pr-3 text-right font-semibold tabular text-text-primary">{formatPriceEuros(row.amountCents)}</td>
                <td className="py-2.5 pr-3"><CommissionStatusBadge status={row.status} /></td>
                <td className="py-2.5 text-text-secondary">{row.paidAt ? formatDate(row.paidAt) : row.dueAt ? `prévu ${formatDate(row.dueAt)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </>
  );
}
