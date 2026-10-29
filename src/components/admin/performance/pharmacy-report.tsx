import Link from "next/link";
import { Check, ChevronDown, Download, Euro, Percent, ScanLine, Sparkles, Store, UserRound, X } from "lucide-react";
import type { AdviceRow } from "@/server/services/counter-history";
import { ATTACH_TARGET, euros, percent, type SalesReport } from "@/core/counter/sales-report";
import { TIME_ZONE } from "@/config/constants";
import { cn } from "@/lib/utils";

/**
 * La performance d'UNE pharmacie, pour la console de PharmaBoost (fondateur, 16 oct. 2026 : « simple, on comprend tout
 * directement ») : quatre chiffres (conseils proposés, conseils vendus, taux de vente, chiffre d'affaires ajouté), la liste
 * des conseils — chacun se déplie —, les produits qui se vendent, et le PDF de la même période. Aucun graphique compliqué.
 * Source : les ventes terminées au comptoir (core/counter/sales-report.ts), les conseils tranchés (Vendu / Non vendu).
 */

export type AdviceFilter = "tous" | "vendus" | "non-vendus" | "sans-reponse";
export const ADVICE_FILTERS: { value: AdviceFilter; label: string; status: AdviceRow["status"] | null }[] = [
  { value: "tous", label: "Tous", status: null },
  { value: "vendus", label: "Vendus", status: "SOLD" },
  { value: "non-vendus", label: "Non vendus", status: "NOT_SOLD" },
  { value: "sans-reponse", label: "Sans réponse", status: "NONE" },
];

const STATUS_STYLE: Record<AdviceRow["status"], { label: string; className: string }> = {
  SOLD: { label: "Vendu", className: "bg-success-50 text-success-700 ring-success-200 dark:bg-success-950 dark:text-success-400" },
  NOT_SOLD: { label: "Non vendu", className: "bg-surface-sunken text-text-secondary ring-border-default" },
  NONE: { label: "Sans réponse", className: "bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-950 dark:text-warning-400" },
};

const time = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dayTime = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Figure({ label, value, hint, icon, tone = "default" }: { label: string; value: string; hint?: string; icon: React.ReactNode; tone?: "default" | "brand" | "success" }) {
  return (
    <div data-chiffre={label} className="rounded-2xl bg-surface-card p-5 ring-1 ring-border-subtle">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-text-secondary">{label}</p>
        <span className={cn("grid size-8 place-items-center rounded-xl", tone === "success" ? "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-400" : "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300")}>{icon}</span>
      </div>
      <p className={cn("mt-3 text-[34px] leading-10 font-bold tracking-[-0.03em] tabular-nums", tone === "success" ? "text-success-700 dark:text-success-400" : "text-text-primary")}>{value}</p>
      {hint && <p className="mt-1 text-[12.5px] leading-5 text-text-tertiary">{hint}</p>}
    </div>
  );
}

/** Les conseils d'une période, regroupés par collaborateur (celui qui a fait la vente), le plus de conseils vendus d'abord. */
export function adviceByPerson(rows: AdviceRow[]): { who: string; proposed: number; sold: number; revenueCents: number }[] {
  const people = new Map<string, { who: string; proposed: number; sold: number; revenueCents: number }>();
  for (const row of rows) {
    const person = people.get(row.who) ?? { who: row.who, proposed: 0, sold: 0, revenueCents: 0 };
    person.proposed += 1;
    if (row.status === "SOLD") {
      person.sold += 1;
      person.revenueCents += row.priceCents ?? 0;
    }
    people.set(row.who, person);
  }
  return [...people.values()].sort((a, b) => b.sold - a.sold || b.revenueCents - a.revenueCents || a.who.localeCompare(b.who, "fr"));
}

export function PharmacyReport({
  report,
  rows,
  filter,
  filterHref,
  person = null,
  personHref,
  pdfHref,
  exportHref,
  figures = true,
  updatedAt,
}: {
  report: SalesReport;
  rows: AdviceRow[];
  filter: AdviceFilter;
  /** L'adresse d'un filtre, en gardant le collaborateur choisi. */
  filterHref: (filter: AdviceFilter) => string;
  /** Le collaborateur choisi : la liste ne montre que SES conseils. */
  person?: string | null;
  /** L'adresse qui choisit un collaborateur (ses conseils vendus), ou qui revient à toute l'équipe (`null`). */
  personHref: (who: string | null) => string;
  /** Absent : pas de bouton PDF. */
  pdfHref?: string;
  /** Le fichier Excel de tous les conseils proposés (ceux du collaborateur choisi, s'il y en a un) ; absent : pas de bouton. */
  exportHref?: string;
  /** Faux : seulement les collaborateurs et la liste (la page a déjà ses chiffres). */
  figures?: boolean;
  updatedAt: Date;
}) {
  const rate = report.proposed > 0 ? report.sold / report.proposed : null;
  const people = adviceByPerson(rows);
  const mine = person ? rows.filter((row) => row.who === person) : rows;
  const counts = { SOLD: 0, NOT_SOLD: 0, NONE: 0 } as Record<AdviceRow["status"], number>;
  for (const row of mine) counts[row.status] += 1;
  const wanted = ADVICE_FILTERS.find((entry) => entry.value === filter)?.status ?? null;
  const shown = wanted ? mine.filter((row) => row.status === wanted) : mine;
  const byScan = rows.filter((row) => row.soldByScan).length;
  const sameDay = report.byHour;
  // Sans ses chiffres (page du titulaire), un rapport vide ne montre rien : l'écran du comptoir le dit déjà.
  if (!figures && rows.length === 0) return null;

  return (
    <div className="space-y-6" data-rapport-performance="">
      {figures && (
      <>
      {/* Les quatre chiffres. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Conseils proposés" value={String(report.proposed)} hint={`dans ${report.sales} vente${report.sales > 1 ? "s" : ""} terminée${report.sales > 1 ? "s" : ""}`} icon={<Sparkles className="size-4" />} />
        <Figure label="Conseils vendus" value={String(report.sold)} hint={`sur ${report.proposed} proposé${report.proposed > 1 ? "s" : ""}${byScan > 0 ? ` · ${byScan} par le scan` : ""}`} icon={<Check className="size-4" />} tone="success" />
        <Figure label="Taux de vente" value={percent(rate)} hint="conseils vendus ÷ conseils proposés" icon={<Percent className="size-4" />} tone="brand" />
        <Figure label="Chiffre d'affaires ajouté" value={euros(report.revenueCents)} hint={report.marginCents > 0 ? `dont ${euros(report.marginCents)} de marge HT` : "TTC, prix de vente de l'officine"} icon={<Euro className="size-4" />} tone="success" />
      </div>

      {/* Une ligne pour le reste, sans graphique. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-card px-5 py-3.5 ring-1 ring-border-subtle">
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px] text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Store className="size-4 text-text-tertiary" aria-hidden="true" />
            <strong className="font-semibold text-text-primary tabular-nums">{report.withAdvice}</strong> vente{report.withAdvice > 1 ? "s" : ""} sur {report.sales} avec un conseil vendu ({percent(report.attachRate)}
            {report.meetsTarget === null ? ")" : report.meetsTarget ? " · objectif atteint)" : ` · objectif ${percent(ATTACH_TARGET)})`}
          </span>
          {byScan > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <ScanLine className="size-4 text-text-tertiary" aria-hidden="true" />
              {byScan} vendu{byScan > 1 ? "s" : ""} en bipant le produit
            </span>
          )}
        </p>
        {pdfHref && (
          <a href={pdfHref} data-pdf="" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-[13.5px] font-semibold text-white shadow-xs transition-colors hover:bg-brand-800">
            <Download className="size-4" aria-hidden="true" />
            Télécharger le PDF · {report.label}
          </a>
        )}
      </div>
      </>
      )}

      {/* Les collaborateurs : un clic montre tous les conseils vendus de la personne. */}
      {people.length > 0 && (
        <section className="rounded-2xl bg-surface-card p-5 ring-1 ring-border-subtle" aria-labelledby="par-collaborateur" data-par-collaborateur="">
          <h2 id="par-collaborateur" className="text-[15px] font-semibold text-text-primary">Par collaborateur · {report.label}</h2>
          <p className="text-[12.5px] text-text-tertiary">Cliquez sur une personne pour voir tous ses conseils vendus.</p>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {people.map((entry) => {
              const active = entry.who === person;
              return (
                <Link
                  key={entry.who}
                  href={active ? personHref(null) : personHref(entry.who)}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  data-collaborateur={entry.who}
                  className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors", active ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100 dark:bg-brand-950" : "border-border-subtle hover:border-brand-300 hover:bg-surface-sunken/60")}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white" aria-hidden="true">
                    <UserRound className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-text-primary">{entry.who}</span>
                    <span className="block text-[12.5px] text-text-secondary tabular-nums">
                      {entry.sold} vendu{entry.sold > 1 ? "s" : ""} sur {entry.proposed} proposé{entry.proposed > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14px] font-bold text-success-700 tabular-nums dark:text-success-400">{euros(entry.revenueCents)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* La liste des conseils : chacun se déplie. */}
      <section className="overflow-hidden rounded-2xl bg-surface-card ring-1 ring-border-subtle" aria-labelledby="liste-conseils">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 id="liste-conseils" className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-text-primary">
              {person ? `Les conseils de ${person}` : "Les conseils"} · {report.label}
              {person && (
                <Link href={personHref(null)} scroll={false} className="inline-flex h-7 items-center gap-1 rounded-full border border-border-default px-2.5 text-[12px] font-medium text-text-secondary hover:border-brand-300">
                  <X className="size-3.5" aria-hidden="true" /> Toute l&apos;équipe
                </Link>
              )}
            </h2>
            <p className="text-[12.5px] text-text-tertiary">Cliquez sur un conseil pour voir la vente. Mis à jour à {time.format(updatedAt)}, toutes les minutes.</p>
            {exportHref && mine.length > 0 && (
              <a href={exportHref} data-export-conseils="" className="mt-2 inline-flex h-9 items-center gap-2 rounded-xl border border-brand-600 px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300">
                <Download className="size-4" aria-hidden="true" />
                Télécharger {person ? `les conseils de ${person}` : "tous les conseils proposés"} (Excel) · {mine.length}
              </a>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer les conseils">
            {ADVICE_FILTERS.map((entry) => {
              const count = entry.status ? counts[entry.status] : mine.length;
              const active = entry.value === filter;
              return (
                <Link
                  key={entry.value}
                  href={filterHref(entry.value)}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium", active ? "border-brand-600 bg-brand-600 text-white" : "border-border-default text-text-secondary hover:border-brand-300")}
                >
                  {entry.label}
                  <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-white/20" : "bg-surface-sunken text-text-tertiary")}>{count}</span>
                </Link>
              );
            })}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-text-tertiary">Aucun conseil {filter === "tous" ? "" : "de ce type "}sur la période.</p>
        ) : (
          <ul className="divide-y divide-border-subtle" data-liste-conseils="">
            {shown.map((row) => (
              <li key={row.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-surface-sunken/60 [&::-webkit-details-marker]:hidden">
                    <span className="w-14 shrink-0 text-[12.5px] text-text-tertiary tabular-nums">{sameDay ? time.format(row.at) : dayTime.format(row.at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-text-primary">{row.product}</span>
                        {row.kind && row.kind !== "CONSEIL" && (
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold", row.kind === "ROUTINE" ? "bg-[#EDE9FF] text-[#5B45C6]" : "bg-[#FFF1DE] text-[#9A5B00]")}>{row.kind === "ROUTINE" ? "Routine" : "Association"}</span>
                        )}
                      </span>
                      <span className="block truncate text-[12.5px] text-text-tertiary">
                        {row.forDrug ? `pour ${row.forDrug}` : "conseil de la vente"} · {row.who}
                      </span>
                    </span>
                    {row.priceCents !== null && <span className="shrink-0 text-[13.5px] font-semibold text-text-primary tabular-nums">{euros(row.priceCents)}</span>}
                    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold ring-1", STATUS_STYLE[row.status].className)}>
                      {row.status === "SOLD" && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
                      {STATUS_STYLE[row.status].label}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-text-tertiary transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="grid gap-3 bg-surface-sunken/40 px-5 py-4 text-[13px] sm:grid-cols-3" data-detail-conseil="">
                    <div>
                      <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Pourquoi ce conseil</p>
                      <p className="mt-1 text-text-primary">{row.reason ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">La vente</p>
                      <p className="mt-1 text-text-primary">
                        Vente {row.saleReference.replace(/^[A-Z]+-0*/, "")} · terminée le {dayTime.format(row.at)}
                      </p>
                      <p className="mt-0.5 text-text-secondary">{row.boxes.length > 0 ? row.boxes.join(" · ") : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Résultat</p>
                      <p className="mt-1 text-text-primary">
                        {row.status === "SOLD"
                          ? `Vendu${row.soldByScan ? " en bipant le produit" : " (déclaré au comptoir)"}${row.priceCents !== null ? ` · ${euros(row.priceCents)} TTC` : ""}`
                          : row.status === "NOT_SOLD"
                            ? "Non vendu"
                            : "Sans réponse"}
                      </p>
                      <p className="mt-0.5 text-text-secondary">{row.who}</p>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Les produits qui se vendent : une liste, pas un graphique. */}
      {report.topProducts.length > 0 && (
        <section className="rounded-2xl bg-surface-card p-5 ring-1 ring-border-subtle" aria-labelledby="top-produits">
          <h2 id="top-produits" className="text-[15px] font-semibold text-text-primary">Les conseils les plus vendus</h2>
          <ol className="mt-3 space-y-2">
            {report.topProducts.map((product, index) => (
              <li key={product.name} className="flex items-center gap-3 text-[13.5px]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[11.5px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-text-primary">{product.name}</span>
                <span className="text-text-secondary tabular-nums">{product.sold} vendu{product.sold > 1 ? "s" : ""}</span>
                <span className="w-24 text-right font-semibold text-text-primary tabular-nums">{euros(product.revenueCents)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
