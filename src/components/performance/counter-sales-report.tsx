"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Target, TrendingUp } from "lucide-react";
import { ATTACH_TARGET, euros, percent, SALES_REPORT_PERIODS, type SalesReportPeriod, type SalesReportView } from "@/core/counter/sales-report";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";


/**
 * La performance du comptoir : les ventes terminées de la période (aujourd'hui, 7 jours, 30 jours), la part qui repart avec au
 * moins un conseil vendu face à l'objectif de 10 %, les conseils vendus et le chiffre d'affaires ajouté — un graphique qu'on
 * survole jour par jour (ou heure par heure), par collaborateur, par produit — et le PDF à télécharger. Même écran pour le
 * titulaire et pour la console de PharmaBoost.
 */
export function CounterSalesReport({ report, hrefs, pdfHref }: { report: SalesReportView; /** L'adresse de chaque période (calculée côté serveur). */ hrefs: Record<SalesReportPeriod, string>; pdfHref: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...report.buckets.map((bucket) => bucket.sales));
  const focus = hover !== null ? report.buckets[hover] : null;

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-text-primary">Performance du comptoir</h2>
            <p className="text-[13px] text-text-secondary">Chaque « Vente terminée » au poste compte. Les conseils comptent quand ils sont marqués « Vendu ».</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Période" className="inline-flex rounded-full bg-surface-sunken p-1">
              {SALES_REPORT_PERIODS.map((period) => (
                <Link
                  key={period.key}
                  href={hrefs[period.key]}
                  scroll={false}
                  aria-current={report.period === period.key ? "page" : undefined}
                  className={cn("rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors", report.period === period.key ? "bg-brand-600 text-white" : "text-text-secondary hover:text-text-primary")}
                >
                  {period.label}
                </Link>
              ))}
            </div>
            <a href={pdfHref} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-default px-3.5 text-[13px] font-semibold text-text-primary hover:border-brand-400">
              <Download className="size-4" aria-hidden="true" /> Télécharger le PDF
            </a>
          </div>
        </div>

        {/* Le verdict : l'objectif des 10 % */}
        <div className={cn("flex items-center gap-3 rounded-xl border p-3.5", report.meetsTarget === false ? "border-warning-300 bg-warning-50 dark:bg-warning-700/10" : "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30")}>
          <Target className={cn("size-5 shrink-0", report.meetsTarget === false ? "text-warning-700" : "text-brand-700 dark:text-brand-300")} aria-hidden="true" />
          <p className="text-[13.5px] leading-5 text-text-primary">
            {report.attachRate === null ? (
              "Aucune vente terminée sur la période : les chiffres apparaîtront dès la première."
            ) : (
              <>
                <strong>{percent(report.attachRate)}</strong> des ventes terminées repartent avec au moins un conseil vendu{" "}
                <span className="text-text-secondary">(objectif : {percent(ATTACH_TARGET)} minimum)</span>{" "}
                {report.meetsTarget ? <Badge tone="success">Objectif atteint</Badge> : <Badge tone="warning">En dessous de l&apos;objectif</Badge>}
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Tile label="Ventes terminées" value={String(report.sales)} />
          <Tile label="Avec un conseil vendu" value={String(report.withAdvice)} sub={percent(report.attachRate)} />
          <Tile label="Conseils vendus" value={String(report.sold)} sub={`sur ${report.proposed} proposés`} />
          <Tile label="Chiffre d'affaires ajouté" value={euros(report.revenueCents)} accent />
          <Tile label="Marge ajoutée (HT)" value={report.marginCents > 0 ? euros(report.marginCents) : "—"} />
          <Tile label="CA ajouté par vente" value={report.revenuePerSaleCents === null ? "—" : euros(report.revenuePerSaleCents)} />
        </div>

        {/* Le graphique, qu'on survole */}
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold text-text-primary">{report.period === "day" ? "Heure par heure" : "Jour par jour"}</p>
            <p className="text-[12.5px] text-text-secondary" aria-live="polite">
              {focus ? (
                <>
                  <strong className="text-text-primary">{focus.label}</strong> · {focus.sales} vente{focus.sales > 1 ? "s" : ""} · {focus.withAdvice} avec conseil · {focus.sold} conseil{focus.sold > 1 ? "s" : ""} · {euros(focus.revenueCents)}
                </>
              ) : (
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-border-default" /> ventes terminées</span>
                  <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-brand-600" /> avec un conseil vendu</span>
                </span>
              )}
            </p>
          </div>
          <div className="flex h-40 items-end gap-1 border-b border-border-subtle" onMouseLeave={() => setHover(null)}>
            {report.buckets.map((bucket, index) => (
              <button
                key={bucket.key}
                type="button"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                aria-label={`${bucket.label} : ${bucket.sales} ventes, ${bucket.withAdvice} avec conseil vendu, ${euros(bucket.revenueCents)}`}
                className={cn("group relative flex h-full flex-1 items-end rounded-t-sm", hover === index && "bg-surface-sunken")}
              >
                <span className="relative block w-full rounded-t-sm bg-border-default transition-all" style={{ height: `${(bucket.sales / max) * 100}%` }}>
                  <span className="absolute inset-x-0 bottom-0 block rounded-t-sm bg-brand-600" style={{ height: bucket.sales ? `${(bucket.withAdvice / bucket.sales) * 100}%` : 0 }} />
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {report.buckets.map((bucket, index) => (
              <span key={bucket.key} className="flex-1 truncate text-center text-[10px] text-text-tertiary">
                {report.buckets.length > 16 && index % 3 !== 0 ? "" : bucket.label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <List
            title="Par collaborateur"
            empty="Aucune vente terminée."
            rows={report.byPerson.map((person) => ({
              key: person.who,
              label: person.who,
              detail: `${person.sales} vente${person.sales > 1 ? "s" : ""} · ${person.withAdvice} avec conseil (${percent(person.sales ? person.withAdvice / person.sales : null)})`,
              value: euros(person.revenueCents),
            }))}
          />
          <List
            title="Conseils les plus vendus"
            empty="Aucun conseil vendu pour l'instant."
            rows={report.topProducts.map((product) => ({ key: product.name, label: product.name, detail: `${product.sold} vendu${product.sold > 1 ? "s" : ""}`, value: euros(product.revenueCents) }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", accent ? "border-brand-300 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/20" : "border-border-subtle")}>
      <p className="text-[11.5px] font-medium text-text-tertiary">{label}</p>
      <p className="mt-1 flex items-center gap-1 text-[19px] font-semibold tracking-tight text-text-primary tabular-nums">
        {accent && <TrendingUp className="size-4 text-brand-600" aria-hidden="true" />}
        {value}
      </p>
      {sub && <p className="text-[11.5px] text-text-secondary">{sub}</p>}
    </div>
  );
}

function List({ title, rows, empty }: { title: string; rows: { key: string; label: string; detail: string; value: string }[]; empty: string }) {
  return (
    <div className="rounded-xl border border-border-subtle">
      <p className="border-b border-border-subtle px-3.5 py-2.5 text-[13px] font-semibold text-text-primary">{title}</p>
      {rows.length === 0 ? (
        <p className="px-3.5 py-4 text-[12.5px] text-text-tertiary">{empty}</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-text-primary">{row.label}</span>
                <span className="block truncate text-[12px] text-text-tertiary">{row.detail}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-text-primary">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
