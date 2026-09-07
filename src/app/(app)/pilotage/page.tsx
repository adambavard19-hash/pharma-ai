import type { Metadata } from "next";
import { Check, Euro, ShoppingBag } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getCounterPerformance } from "@/server/services/analytics";
import { isPeriodKey, resolveCustomPeriod, resolvePeriod } from "@/core/analytics/periods";
import { ROLE_LABELS, type Role } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from "@/components/ui/table";
import { formatCents, formatPercent } from "@/lib/format";
import { PeriodPicker } from "./period-picker";

export const metadata: Metadata = { title: "Pilotage" };

/**
 * L'espace du titulaire.
 *
 * Il est séparé du comptoir pour une raison de fond : ces chiffres n'aident pas
 * à servir le patient qui est devant vous, et les afficher pendant l'acte
 * transformerait un conseil en objectif de vente. Ils vivent donc ici, derrière
 * une permission que seul le titulaire détient par défaut.
 */
export default async function PilotagePage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; du?: string; au?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const params = await searchParams;

  // Une période personnalisée invalide (bornes inversées, 31 février) ne fait
  // pas tomber l'écran : on retombe sur le mois et on le dit.
  const custom =
    params.periode === "custom" && params.du && params.au
      ? resolveCustomPeriod(params.du, params.au)
      : null;
  const invalidCustom = params.periode === "custom" && !custom;
  const period = custom ?? resolvePeriod(isPeriodKey(params.periode) ? params.periode : "month");

  const { global, collaborators } = await getCounterPerformance(session.scope, period);
  const active = collaborators.filter((row) => row.decided > 0 || row.attributedCents > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pilotage de l'officine"
        description="Ce que les conseils Pharma.ai ont produit au comptoir — au global et par collaborateur. Ces chiffres ne sont visibles que de vous."
      />

      <PeriodPicker
        activeKey={custom ? "custom" : (isPeriodKey(params.periode) ? params.periode : "month")}
        from={params.du ?? ""}
        to={params.au ?? ""}
      />

      {invalidCustom && (
        <Alert tone="warning" title="Période personnalisée invalide">
          Les dates saisies n&apos;ont pas pu être interprétées. Les chiffres ci-dessous portent
          sur le mois en cours.
        </Alert>
      )}

      <p className="text-[12.5px] text-text-tertiary">
        Période affichée : <span className="font-medium text-text-secondary">{period.label}</span>
      </p>

      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Taux d'acceptation"
          value={global.acceptanceRate === null ? "—" : formatPercent(global.acceptanceRate)}
          sublabel={
            global.decided === 0
              ? "aucun conseil tranché sur la période"
              : `${global.accepted} acceptés · ${global.declined} refusés`
          }
          icon={<Check className="size-[18px]" />}
          emphasis="brand"
        />
        <StatCard
          label="Panier additionnel moyen"
          value={global.averageBasketCents === null ? "—" : formatCents(global.averageBasketCents)}
          sublabel={
            global.attributedSalesCount === 0
              ? "aucune délivrance avec conseil acheté"
              : `sur ${global.attributedSalesCount} délivrance${global.attributedSalesCount > 1 ? "s" : ""}`
          }
          icon={<ShoppingBag className="size-[18px]" />}
        />
        <StatCard
          label="CA additionnel Pharma.ai"
          value={formatCents(global.attributedCents)}
          sublabel="uniquement les lignes issues d'un conseil"
          icon={<Euro className="size-[18px]" />}
          emphasis="accent"
        />
      </section>

      <Card>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-2 py-4 text-[13px]">
          <Figure label="Conseils proposés" value={global.proposed} />
          <Figure label="Tranchés au comptoir" value={global.decided} />
          <Figure label="Acceptés" value={global.accepted} tone="success" />
          <Figure label="Refusés" value={global.declined} tone="muted" />
          <Figure label="Jamais tranchés" value={global.undecided} tone="muted" />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold text-text-primary">Par collaborateur</h2>
          <p className="text-[12.5px] leading-5 text-text-secondary">
            La décision est attribuée à qui a tranché la carte au comptoir, le chiffre
            d&apos;affaires à qui a enregistré la délivrance. Rien n&apos;est reconstitué après
            coup.
          </p>
        </div>

        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Check className="size-5" />}
              title="Aucun conseil tranché sur cette période"
              description="Dès qu'un collaborateur accepte ou refuse un conseil au comptoir, sa ligne apparaît ici."
            />
          </Card>
        ) : (
          <>
            {/* Sur téléphone, un tableau à six colonnes se lit à la loupe. Les
                mêmes chiffres deviennent une carte par collaborateur, avec la
                ligne qui compte — le CA additionnel — en évidence. */}
            <ul className="space-y-2.5 md:hidden">
              {active.map((row) => (
                <li
                  key={row.userId}
                  className="rounded-xl border border-border-subtle bg-surface-card p-4"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[12px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                      {row.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-text-primary">
                        {row.fullName}
                      </span>
                      <span className="block text-[11.5px] text-text-tertiary">
                        {ROLE_LABELS[row.role as Role] ?? row.role}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[17px] leading-6 font-semibold tabular text-text-primary">
                        {formatCents(row.attributedCents)}
                      </span>
                      <span className="block text-[11px] text-text-tertiary">CA additionnel</span>
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-border-subtle pt-3 text-center">
                    <MobileFigure label="Acceptés" value={String(row.accepted)} />
                    <MobileFigure label="Refusés" value={String(row.declined)} />
                    <MobileFigure
                      label="Taux"
                      value={row.acceptanceRate === null ? "—" : formatPercent(row.acceptanceRate)}
                    />
                    <MobileFigure
                      label="Panier"
                      value={
                        row.averageBasketCents === null
                          ? "—"
                          : formatCents(row.averageBasketCents)
                      }
                    />
                  </dl>
                </li>
              ))}
            </ul>

            <TableWrapper className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Collaborateur</TH>
                  <TH numeric>Acceptés</TH>
                  <TH numeric>Refusés</TH>
                  <TH numeric>Taux d&apos;acceptation</TH>
                  <TH numeric>Panier additionnel</TH>
                  <TH numeric>CA additionnel</TH>
                </TR>
              </THead>
              <TBody>
                {active.map((row) => (
                  <TR key={row.userId}>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11.5px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                          {row.initials}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-text-primary">
                            {row.fullName}
                          </span>
                          <span className="block text-[11.5px] text-text-tertiary">
                            {ROLE_LABELS[row.role as Role] ?? row.role}
                          </span>
                        </span>
                      </span>
                    </TD>
                    <TD numeric>
                      {row.accepted}
                    </TD>
                    <TD numeric>
                      {row.declined}
                    </TD>
                    <TD numeric className="font-medium text-text-primary">
                      {row.acceptanceRate === null ? "—" : formatPercent(row.acceptanceRate)}
                    </TD>
                    <TD numeric>
                      {row.averageBasketCents === null
                        ? "—"
                        : formatCents(row.averageBasketCents)}
                    </TD>
                    <TD numeric className="font-semibold text-text-primary">
                      {formatCents(row.attributedCents)}
                    </TD>
                  </TR>
                ))}
              </TBody>
              </Table>
            </TableWrapper>
          </>
        )}
      </section>

      <p className="text-[11.5px] leading-4 text-text-tertiary">
        Indicateurs nominatifs : leur usage suppose l&apos;information préalable des personnes
        concernées et une finalité proportionnée. Ils mesurent l&apos;activité de conseil, pas la
        valeur d&apos;un collaborateur.
      </p>
    </div>
  );
}

function MobileFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] tracking-wide text-text-tertiary uppercase">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-semibold tabular text-text-primary">{value}</dd>
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "muted";
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span
        className={
          tone === "success"
            ? "text-[17px] font-semibold tabular text-success-700 dark:text-success-400"
            : tone === "muted"
              ? "text-[17px] font-semibold tabular text-text-tertiary"
              : "text-[17px] font-semibold tabular text-text-primary"
        }
      >
        {value}
      </span>
      <span className="text-[12.5px] text-text-secondary">{label}</span>
    </span>
  );
}
