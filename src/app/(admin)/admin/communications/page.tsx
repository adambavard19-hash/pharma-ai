import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, BellRing, Briefcase, Inbox, Mail, Repeat, X } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import {
  COMMUNICATION_NATURES,
  COMMUNICATION_STATUS_FILTERS,
  COMMUNICATION_TRIGGERS,
  COMMUNICATION_TYPES,
  loadCommunications,
  parseCommunicationFilters,
  pharmacyOptions,
  statusFiltersFor,
  type CommunicationEntry,
  type CommunicationType,
} from "@/server/services/admin/communications";
import { CommunicationViews } from "../_communication/views";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { FilterChips, SearchBox, hrefWith } from "@/components/admin/filters";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { PharmacySelect } from "./pharmacy-select";

export const metadata: Metadata = { title: "Historique des communications" };

const BASE = "/admin/communications";

const TYPE_STYLE: Record<CommunicationType, { label: string; Icon: typeof Mail; className: string }> = {
  email: { label: "E-mail", Icon: Mail, className: "bg-info-50 text-info-700 dark:bg-info-700/20 dark:text-info-500" },
  notification: { label: "Notification", Icon: BellRing, className: "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500" },
  relance: { label: "Relance", Icon: Repeat, className: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300" },
  commercial: { label: "Commercial", Icon: Briefcase, className: "bg-accent-50 text-accent-800 dark:bg-accent-900/40 dark:text-accent-200" },
};

const PERIOD_OPTIONS = [
  { value: null, label: "30 jours" },
  { value: "3m", label: "3 mois" },
  { value: "12m", label: "12 mois" },
];

function TypeCell({ entry }: { entry: CommunicationEntry }) {
  const style = TYPE_STYLE[entry.type];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${style.className}`} aria-hidden="true">
        <style.Icon className="size-3.5" />
      </span>
      <span className="text-[12.5px] font-medium text-text-secondary">{style.label}</span>
    </span>
  );
}

/**
 * L'historique des communications : tout ce qui est parti, ou a été signalé,
 * au même endroit. Filtres dans l'adresse ; chaque ligne mène à l'élément
 * concerné (fiche officine, dossier, notification).
 */
export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const filters = parseCommunicationFilters(await searchParams);
  const [result, pharmacies] = await Promise.all([loadCommunications(filters), pharmacyOptions()]);

  // Les filtres « déclencheur » et « nature » viennent des tuiles du centre des relances : ils suivent l'utilisateur d'un filtre à l'autre.
  const keep = { type: filters.type, statut: filters.statut, periode: filters.periode === "30j" ? null : filters.periode, officine: result.officine?.id ?? null, q: filters.q, declencheur: filters.declencheur, nature: filters.nature };
  const total = Object.values(result.counts).reduce((sum, n) => sum + n, 0);
  const selectOptions = result.officine && !pharmacies.some((p) => p.id === result.officine!.id) ? [{ id: result.officine.id, name: result.officine.name, city: null }, ...pharmacies] : pharmacies;
  const statusOptions = statusFiltersFor(filters.type);
  const shownCount = filters.type ? result.counts[filters.type] : total;
  const filtered = Boolean(filters.type || filters.statut || filters.q || result.officine || filters.periode !== "30j" || filters.declencheur || filters.nature);

  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Historique des communications"
        description="Les e-mails partis (relances, envois manuels, tests, e-mails système), les notifications de l'équipe, les relances internes et les actions commerciales, du plus récent au plus ancien."
      />
      <CommunicationViews active="historique" />

      <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-card p-4">
        <FilterChips
          basePath={BASE}
          param="type"
          label="Type de communication"
          current={filters.type}
          keep={{ periode: keep.periode, officine: keep.officine, q: keep.q, declencheur: keep.declencheur, nature: keep.nature }}
          options={[{ value: null, label: "Tout", count: total }, ...(Object.keys(COMMUNICATION_TYPES) as CommunicationType[]).map((type) => ({ value: type, label: COMMUNICATION_TYPES[type], count: result.counts[type] }))]}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips basePath={BASE} param="statut" label="Statut" current={filters.statut} keep={{ ...keep, statut: null }} options={[{ value: null, label: "Tous statuts" }, ...statusOptions.map((key) => ({ value: key, label: COMMUNICATION_STATUS_FILTERS[key].label }))]} />
          <FilterChips basePath={BASE} param="periode" label="Période" current={filters.periode === "30j" ? null : filters.periode} keep={{ ...keep, periode: null }} options={PERIOD_OPTIONS} />
        </div>
        <FilterChips
          basePath={BASE}
          param="nature"
          label="Famille d'e-mails"
          current={filters.nature}
          keep={{ ...keep, nature: null }}
          options={[{ value: null, label: "Toutes les familles" }, ...(Object.keys(COMMUNICATION_NATURES) as (keyof typeof COMMUNICATION_NATURES)[]).map((key) => ({ value: key, label: COMMUNICATION_NATURES[key].label }))]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <PharmacySelect options={selectOptions} current={result.officine?.id ?? null} keep={{ ...keep, officine: null }} />
          <SearchBox action={BASE} defaultValue={filters.q} placeholder="Destinataire, objet, dossier…" keep={{ ...keep, q: null }} />
        </div>
      </div>

      {result.officineUnknown && <Alert tone="warning">Officine introuvable : le filtre par officine est ignoré.</Alert>}

      <AdminSection
        padded={false}
        title={result.officine ? `Communications — ${result.officine.name}` : "Communications"}
        description={`${shownCount.toLocaleString("fr-FR")} élément${shownCount > 1 ? "s" : ""} sur la période${filters.statut ? ` · ${COMMUNICATION_STATUS_FILTERS[filters.statut].label.toLowerCase()}` : ""}${filters.q ? ` · « ${filters.q} »` : ""}`}
        action={
          <span className="flex flex-wrap items-center gap-2">
            {filters.declencheur && (
              <Link href={hrefWith(BASE, keep, { declencheur: null, page: null })} className="inline-flex items-center gap-1 rounded-full border border-border-default px-2.5 py-1 text-[12px] text-text-secondary hover:border-brand-300 hover:text-text-primary">
                {COMMUNICATION_TRIGGERS[filters.declencheur].label}
                <X className="size-3.5" aria-label="Retirer le filtre" />
              </Link>
            )}
            {filters.nature && (
              <Link href={hrefWith(BASE, keep, { nature: null, page: null })} className="inline-flex items-center gap-1 rounded-full border border-border-default px-2.5 py-1 text-[12px] text-text-secondary hover:border-brand-300 hover:text-text-primary">
                {COMMUNICATION_NATURES[filters.nature].label}
                <X className="size-3.5" aria-label="Retirer le filtre" />
              </Link>
            )}
            {result.officine && (
              <Link href={hrefWith(BASE, keep, { officine: null })} className="inline-flex items-center gap-1 rounded-full border border-border-default px-2.5 py-1 text-[12px] text-text-secondary hover:border-brand-300 hover:text-text-primary">
                {result.officine.name}
                <X className="size-3.5" aria-label="Retirer le filtre" />
              </Link>
            )}
            {filtered && (
              <Link href={BASE} className="text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
                Réinitialiser les filtres
              </Link>
            )}
          </span>
        }
      >
        {result.rows.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title={filtered ? "Aucune communication pour ces filtres" : "Aucune communication pour l'instant"} description={filtered ? "Élargissez la période ou retirez un filtre." : "Les e-mails, notifications et relances apparaîtront ici dès le premier envoi."} />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1080px]">
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Objet</TH>
                  <TH>Destinataire</TH>
                  <TH>Déclencheur</TH>
                  <TH>Statut</TH>
                  <TH>Officine</TH>
                  <TH>
                    <span className="sr-only">Ouvrir</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {result.rows.map((entry) => (
                  <TR key={entry.id} interactive>
                    <TD className="text-[12.5px] whitespace-nowrap text-text-secondary tabular-nums">{formatDateTime(entry.at)}</TD>
                    <TD>
                      <TypeCell entry={entry} />
                    </TD>
                    <TD className="w-[34%] whitespace-normal">
                      {entry.href ? (
                        <Link href={entry.href} className="line-clamp-2 text-[13.5px] leading-5 font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">
                          {entry.title}
                        </Link>
                      ) : (
                        <span className="line-clamp-2 text-[13.5px] leading-5 font-medium text-text-primary">{entry.title}</span>
                      )}
                      {entry.detail && (
                        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-text-tertiary" title={entry.detail}>
                          {entry.detail}
                        </span>
                      )}
                      {entry.actor && <span className="mt-0.5 block text-[12px] text-text-tertiary">par {entry.actor}</span>}
                    </TD>
                    <TD className="text-[13px] text-text-secondary">
                      <span className="block max-w-[220px] truncate" title={entry.recipient ?? undefined}>
                        {entry.recipient ?? <span className="text-text-tertiary">—</span>}
                      </span>
                    </TD>
                    <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">
                      {entry.trigger ?? <span className="text-text-tertiary">—</span>}
                      {entry.ruleLabel && <span className="block text-[11.5px] text-text-tertiary">{entry.ruleLabel}</span>}
                    </TD>
                    <TD>
                      <StatusBadge status={entry.status} />
                    </TD>
                    <TD className="text-[13px]">
                      {entry.pharmacyId ? (
                        <Link href={hrefWith(BASE, keep, { officine: entry.pharmacyId, page: null })} className="block max-w-[200px] truncate text-text-secondary hover:text-text-primary hover:underline" title="Voir les communications de cette officine">
                          {entry.pharmacyName ?? "Officine"}
                        </Link>
                      ) : entry.type === "commercial" && entry.detail ? (
                        <Badge tone="neutral">Prospect</Badge>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {entry.href && (
                        <Link href={entry.href} className="inline-flex size-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary" aria-label={`Ouvrir : ${entry.title}`}>
                          <ArrowUpRight className="size-4" aria-hidden="true" />
                        </Link>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        {(result.page > 1 || result.hasMore) && (
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
            <span className="text-[12.5px] text-text-tertiary">Page {result.page}</span>
            <span className="flex gap-2">
              {result.page > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefWith(BASE, keep, { page: result.page > 2 ? String(result.page - 1) : null })}>
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Plus récents
                  </Link>
                </Button>
              )}
              {result.hasMore && (
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefWith(BASE, keep, { page: String(result.page + 1) })}>
                    Plus anciens
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </span>
          </nav>
        )}
      </AdminSection>
    </>
  );
}
