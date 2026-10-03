import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Briefcase, ChevronLeft, ChevronRight, ScrollText, ShieldCheck, Store, UserRound } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { JOURNAL_PAGE_SIZE, loadAuditJournal, type JournalAuthor, type JournalRow } from "@/server/services/admin/audit-journal";
import { groupByDay, JOURNAL_FAMILIES, parsePage } from "@/core/admin/journal";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { FilterChips, hrefWith, PERIODS, resolvePeriod, SearchBox } from "@/components/admin/filters";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TIME_ZONE } from "@/config/constants";

export const metadata: Metadata = { title: "Journal d'audit" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

const time = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

const TONE_DOT = {
  neutral: "bg-ink-300 dark:bg-ink-600",
  info: "bg-info-500",
  brand: "bg-brand-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
} as const;

const AUTHOR_ICON: Record<JournalAuthor["kind"], typeof UserRound> = {
  admin: ShieldCheck,
  commercial: Briefcase,
  officine: Store,
  systeme: Bot,
};

/**
 * Le journal d'audit : qui a fait quoi, quand, avec l'avant et l'après.
 * Uniquement les actions d'entreprise (plateforme, facturation, commercial,
 * partenaires, formations, challenges, connexions à la console) : aucune
 * action clinique n'est lue.
 */
export default async function AuditJournalPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePlatformSession();
  const params = await searchParams;
  const journal = await loadAuditJournal({
    famille: first(params.famille),
    admin: first(params.admin),
    period: resolvePeriod(first(params.periode)),
    q: first(params.q),
    page: parsePage(first(params.page)),
  });

  const basePath = "/admin/journal";
  const keep = { famille: journal.family?.key ?? null, admin: journal.adminId, periode: first(params.periode) ? journal.period.value : null, q: journal.q };
  const allCount = Object.values(journal.familyCounts).reduce((sum, n) => sum + n, 0);
  const filtered = Boolean(journal.family || journal.adminId || journal.q);
  const from = journal.total === 0 ? 0 : (journal.page - 1) * JOURNAL_PAGE_SIZE + 1;
  const to = Math.min(journal.total, journal.page * JOURNAL_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Administration", href: "/admin/societe" }}
        title="Journal d'audit"
        description="Qui a fait quoi, quand, avec l'avant et l'après. Seules les actions d'entreprise y figurent : aucune donnée patient, ordonnance ou document clinique."
      />

      <AdminSection padded>
        <div className="space-y-3.5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <FilterChips basePath={basePath} param="periode" label="Période" current={journal.period.value} keep={{ ...keep, periode: null }} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} />
            <SearchBox action={basePath} defaultValue={journal.q} placeholder="Identifiant, action (ex. tarif, contrat)…" keep={keep} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium text-text-tertiary">Famille</p>
            <FilterChips
              basePath={basePath}
              param="famille"
              label="Famille d'actions"
              current={journal.family?.key ?? null}
              keep={keep}
              options={[{ value: null, label: "Toutes", count: allCount }, ...JOURNAL_FAMILIES.map((f) => ({ value: f.key, label: f.label, count: journal.familyCounts[f.key] ?? 0 }))]}
            />
          </div>
          {journal.admins.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-text-tertiary">Auteur</p>
              <FilterChips
                basePath={basePath}
                param="admin"
                label="Administrateur"
                current={journal.adminId}
                keep={keep}
                options={[{ value: null, label: "Tout le monde" }, ...journal.admins.map((a) => ({ value: a.id, label: a.isActive ? a.name : `${a.name} (désactivé)` }))]}
              />
            </div>
          )}
        </div>
      </AdminSection>

      <AdminSection
        title={journal.total === 0 ? "Aucune action" : `${journal.total.toLocaleString("fr-FR")} action${journal.total > 1 ? "s" : ""}`}
        description={journal.total === 0 ? `Sur ${journal.period.label.toLowerCase()}.` : `Sur ${journal.period.label.toLowerCase()} · ${from} à ${to}, de la plus récente à la plus ancienne.`}
        action={
          filtered ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={hrefWith(basePath, {}, { periode: keep.periode })}>Effacer les filtres</Link>
            </Button>
          ) : undefined
        }
        padded={false}
      >
        {journal.rows.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="size-5" />}
            title={filtered ? "Aucune action ne correspond à ces filtres" : "Aucune action enregistrée sur cette période"}
            description={filtered ? "Élargissez la période ou retirez un filtre." : "Les gestes des administrateurs, des commerciaux et des tâches automatiques apparaîtront ici dès qu'ils auront lieu."}
          />
        ) : (
          <ol>
            {groupByDay(journal.rows, TIME_ZONE).map((group) => (
              <li key={group.day}>
                <p className="border-b border-border-subtle bg-surface-sunken/70 px-5 py-1.5 text-[12px] font-semibold tracking-[0.04em] text-text-tertiary uppercase first-letter:uppercase">
                  {group.label}
                </p>
                <ol className="divide-y divide-border-subtle">
                  {group.rows.map((row) => (
                    <JournalLine key={row.id} row={row} />
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}

        {journal.pageCount > 1 && (
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
            {journal.page > 1 ? (
              <Button asChild variant="secondary" size="sm" leadingIcon={<ChevronLeft className="size-4" />}>
                <Link href={hrefWith(basePath, keep, { page: String(journal.page - 1) })}>Plus récentes</Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-[12.5px] text-text-tertiary tabular-nums">
              Page {journal.page} sur {journal.pageCount}
            </span>
            {journal.page < journal.pageCount ? (
              <Button asChild variant="secondary" size="sm" trailingIcon={<ChevronRight className="size-4" />}>
                <Link href={hrefWith(basePath, keep, { page: String(journal.page + 1) })}>Plus anciennes</Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        )}
      </AdminSection>
    </div>
  );
}

/** Une ligne du journal : l'heure, l'action en clair, l'entité, l'avant / l'après, l'auteur. */
function JournalLine({ row }: { row: JournalRow }) {
  const AuthorIcon = AUTHOR_ICON[row.author.kind];
  const entityText = row.entity.name ?? row.entity.shortId;
  return (
    <li className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-surface-sunken/50 lg:grid-cols-[56px_minmax(0,1fr)_220px]">
      <time dateTime={row.at.toISOString()} title={formatDateTime(row.at)} className="pt-0.5 text-[12.5px] text-text-tertiary tabular-nums">
        {time.format(row.at)}
      </time>

      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[row.tone])} aria-hidden="true" />
          <span className="text-[13.5px] leading-5 font-medium text-text-primary">{row.label}</span>
          {row.family && <StatusBadge status={{ label: row.family.label, tone: row.family.tone }} />}
          {row.label === row.action ? null : <code className="hidden font-mono text-[11px] text-text-tertiary xl:inline">{row.action}</code>}
        </div>

        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-text-secondary">
          <span className="text-text-tertiary">{row.entity.typeLabel}</span>
          {entityText &&
            (row.entity.href ? (
              <Link href={row.entity.href} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                {entityText}
              </Link>
            ) : (
              <span className="font-medium text-text-primary">{entityText}</span>
            ))}
          {!entityText && row.entity.href && (
            <Link href={row.entity.href} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
              Ouvrir
            </Link>
          )}
          {row.pharmacy && (
            <>
              <span aria-hidden="true" className="text-text-tertiary">·</span>
              <span className="text-text-tertiary">Officine</span>
              <Link href={row.pharmacy.href} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                {row.pharmacy.name}
              </Link>
            </>
          )}
        </p>

        {row.diff.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-border-subtle bg-surface-sunken/60 px-3 py-2" aria-label="Avant et après">
            {row.diff.map((entry) => (
              <li key={entry.field} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px] leading-5">
                <span className="font-medium text-text-secondary">{entry.label}</span>
                <span className="text-text-tertiary line-through decoration-text-tertiary/60">{entry.from}</span>
                <ArrowRight className="size-3 shrink-0 self-center text-text-tertiary" aria-label="devient" />
                <span className="font-medium break-words text-text-primary">{entry.to}</span>
              </li>
            ))}
          </ul>
        )}

        {row.context.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Contexte">
            {row.context.map((entry) => (
              <li key={entry.field} className="max-w-full truncate rounded-md bg-surface-sunken px-2 py-0.5 text-[11.5px] text-text-secondary">
                <span className="text-text-tertiary">{entry.label} :</span> {entry.value}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="col-start-2 flex min-w-0 items-center gap-1.5 text-[12.5px] text-text-secondary lg:col-start-3 lg:items-start lg:justify-end lg:pt-0.5">
        <AuthorIcon className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
        {row.author.href ? (
          <Link href={row.author.href} className="truncate hover:text-text-primary hover:underline">
            {row.author.label}
          </Link>
        ) : (
          <span className="truncate">{row.author.label}</span>
        )}
      </div>
    </li>
  );
}
