import Link from "next/link";
import { Building2, CalendarDays, Repeat, Wallet } from "lucide-react";
import { AFFILIATE_RULE_SENTENCE, monthLabelOf } from "@/core/affiliation/monthly";
import { AFFILIATE_RATE_LABEL, AFFILIATE_SIGNUP_BONUS_CENTS } from "@/core/affiliation/terms";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import type { AffiliatePharmacy } from "@/server/services/sales/affiliate-commissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { CommissionStatusBadge } from "@/components/sales/status-badge";
import { formatDate } from "@/lib/format";

/** Une commission mensuelle telle que la page la lit. */
export type AffiliateRow = { id: string; periodMonth: string | null; amountCents: number; status: string; paidAt: Date | null; dueAt: Date | null; prospect: { id: string; name: string } };

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Les commissions mensuelles regroupées par mois, le plus récent d'abord, avec le total du mois. */
export function groupByMonth(rows: AffiliateRow[]): { month: string; totalCents: number; rows: AffiliateRow[] }[] {
  const months = new Map<string, AffiliateRow[]>();
  for (const row of rows) {
    const key = row.periodMonth ?? "";
    months.set(key, [...(months.get(key) ?? []), row]);
  }
  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, list]) => ({ month, totalCents: list.filter((row) => row.status !== "CANCELLED").reduce((total, row) => total + row.amountCents, 0), rows: list.sort((a, b) => a.prospect.name.localeCompare(b.prospect.name, "fr")) }));
}

/**
 * L'affiliation de l'affilié de la session : la règle (10 % chaque mois, à vie), ses revenus récurrents actuels, ses
 * pharmacies apportées, puis ses commissions mois par mois. Tout vient de ses vraies données.
 */
export function AffiliateEarnings({ pharmacies, recurringCents, activeCount, rows, signupRows = [], thisMonthCents, earnedCents, paidCents }: { pharmacies: AffiliatePharmacy[]; recurringCents: number; activeCount: number; rows: AffiliateRow[]; signupRows?: AffiliateRow[]; thisMonthCents: number; earnedCents: number; paidCents: number }) {
  const months = groupByMonth(rows);
  return (
    <>
      <Card>
        <CardContent className="space-y-1 py-5">
          <p className="text-[12px] font-semibold tracking-wide text-brand-700 uppercase">Programme d&apos;affiliation</p>
          <h2 className="text-[18px] leading-7 font-bold text-text-primary">{AFFILIATE_RULE_SENTENCE.charAt(0).toUpperCase() + AFFILIATE_RULE_SENTENCE.slice(1)}</h2>
          <p className="text-[13.5px] text-text-secondary">
            Pour chaque pharmacie que vous apportez, vous touchez {AFFILIATE_RATE_LABEL} de son abonnement mensuel HT, chaque mois, aussi longtemps qu&apos;elle reste abonnée, plus une prime d&apos;arrivée de {formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} HT une fois sa mise en service réglée. Les commissions d&apos;un mois sont calculées au début du mois suivant.
          </p>
        </CardContent>
      </Card>

      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenus récurrents" value={`${formatPriceEuros(recurringCents)} / mois`} sublabel={`${plural(activeCount, "pharmacie abonnée", "pharmacies abonnées")} × ${AFFILIATE_RATE_LABEL}`} icon={<Repeat className="size-4" aria-hidden="true" />} emphasis="brand" />
        <StatCard label="Ce mois-ci" value={formatPriceEuros(thisMonthCents)} sublabel="commissions acquises ce mois" icon={<CalendarDays className="size-4" aria-hidden="true" />} />
        <StatCard label="À recevoir" value={formatPriceEuros(earnedCents)} sublabel="acquises, pas encore payées" icon={<Wallet className="size-4" aria-hidden="true" />} />
        <StatCard label="Déjà payées" value={formatPriceEuros(paidCents)} sublabel="depuis le début" icon={<Building2 className="size-4" aria-hidden="true" />} />
      </section>

      <section aria-labelledby="mes-pharmacies" className="space-y-3">
        <div>
          <h2 id="mes-pharmacies" className="text-[16px] leading-6 font-semibold text-text-primary">Mes pharmacies</h2>
          <p className="text-[13px] text-text-secondary">Les pharmacies que vous avez apportées. Seules celles abonnées rapportent leur commission du mois.</p>
        </div>
        <Card><CardContent className="pt-0">
          {pharmacies.length === 0 ? <p className="py-6 text-[13.5px] text-text-secondary">Aucune pharmacie pour l&apos;instant : dès qu&apos;une pharmacie que vous apportez s&apos;abonne, elle apparaît ici avec sa commission mensuelle.</p> : (
            <ul className="divide-y divide-border-subtle">
              {pharmacies.map((pharmacy) => (
                <li key={pharmacy.prospectId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13.5px]">
                  <div className="min-w-0">
                    <Link href={`/extranet/dossiers/${pharmacy.prospectId}`} className="font-medium break-words text-text-primary hover:underline">{pharmacy.name}</Link>
                    <p className="text-[12px] text-text-tertiary">{pharmacy.subscriptionCents !== null ? `abonnement ${formatPriceEuros(pharmacy.subscriptionCents)} HT / mois` : "pas encore d'abonnement"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {pharmacy.oldRule ? <Badge tone="neutral">Ancienne règle</Badge> : pharmacy.active ? <Badge tone="success">Abonnée</Badge> : <Badge tone="neutral">Non abonnée</Badge>}
                    <span className="min-w-[88px] text-right font-semibold tabular text-text-primary">{pharmacy.monthlyCommissionCents > 0 ? `${formatPriceEuros(pharmacy.monthlyCommissionCents)} / mois` : "—"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pharmacies.some((pharmacy) => pharmacy.oldRule) && <p className="border-t border-border-subtle py-3 text-[12px] text-text-tertiary">« Ancienne règle » : pharmacie déjà rémunérée par une commission unique avant l&apos;affiliation ; elle n&apos;ouvre pas, en plus, la commission mensuelle.</p>}
        </CardContent></Card>
      </section>

      <section aria-labelledby="mes-primes" className="space-y-3">
        <div>
          <h2 id="mes-primes" className="text-[16px] leading-6 font-semibold text-text-primary">Mes primes d&apos;arrivée</h2>
          <p className="text-[13px] text-text-secondary">{formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} HT par pharmacie apportée, une seule fois, dès que sa mise en service est réglée.</p>
        </div>
        <Card><CardContent className="pt-0">
          {signupRows.length === 0 ? <p className="py-6 text-[13.5px] text-text-secondary">Aucune prime pour l&apos;instant.</p> : (
            <ul className="divide-y divide-border-subtle">
              {signupRows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13.5px]">
                  <div className="min-w-0">
                    <Link href={`/extranet/dossiers/${row.prospect.id}`} className="font-medium break-words text-text-primary hover:underline">{row.prospect.name}</Link>
                    <p className="text-[12px] text-text-tertiary">{row.paidAt ? `payée le ${formatDate(row.paidAt)}` : row.dueAt ? `prévue le ${formatDate(row.dueAt)}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular text-text-primary">{formatPriceEuros(row.amountCents)}</span>
                    <CommissionStatusBadge status={row.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </section>

      <section aria-labelledby="par-mois" className="space-y-3">
        <div>
          <h2 id="par-mois" className="text-[16px] leading-6 font-semibold text-text-primary">Mes commissions, mois par mois</h2>
          <p className="text-[13px] text-text-secondary">Une ligne par pharmacie abonnée et par mois, avec le total du mois.</p>
        </div>
        {months.length === 0 ? (
          <Card><CardContent className="py-6"><p className="text-[13.5px] text-text-secondary">Aucune commission mensuelle pour l&apos;instant : la première arrive au début du mois qui suit le premier mois payant d&apos;une de vos pharmacies.</p></CardContent></Card>
        ) : (
          months.map((month) => (
            <Card key={month.month}>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-3">
                  <h3 className="text-[14.5px] font-semibold text-text-primary first-letter:uppercase">{monthLabelOf(month.month) || "Mois inconnu"}</h3>
                  <span className="text-[14.5px] font-bold tabular text-text-primary">{formatPriceEuros(month.totalCents)}</span>
                </div>
                <ul className="divide-y divide-border-subtle">
                  {month.rows.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13.5px]">
                      <div className="min-w-0">
                        <Link href={`/extranet/dossiers/${row.prospect.id}`} className="font-medium break-words text-text-primary hover:underline">{row.prospect.name}</Link>
                        <p className="text-[12px] text-text-tertiary">{row.paidAt ? `payée le ${formatDate(row.paidAt)}` : row.dueAt ? `prévue le ${formatDate(row.dueAt)}` : ""}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold tabular text-text-primary">{formatPriceEuros(row.amountCents)}</span>
                        <CommissionStatusBadge status={row.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </>
  );
}
