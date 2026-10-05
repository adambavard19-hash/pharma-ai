import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Megaphone, Plus } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getMessagingProvider } from "@/server/ai/registry";
import { listCampaigns } from "@/server/services/admin/campaigns";
import { CAMPAIGN_KIND_KEYS, CAMPAIGN_KINDS, CAMPAIGN_STATUS_LABELS } from "@/core/admin/campaigns";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { FilterChips, hrefWith } from "@/components/admin/filters";
import { KpiTile } from "@/components/admin/kpis";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  CAMPAIGNS_PER_PAGE,
  CAMPAIGN_KIND_PARAMS,
  CAMPAIGN_STATUS_PARAMS,
  campaignStatusLabel,
  codeFromParam,
  dateLabel,
  firstParam,
  hasNextPage,
  kindLabel,
  pageParam,
  paramFromCode,
  recipientsLabel,
  resultLine,
} from "./view";

export const metadata: Metadata = { title: "Campagnes" };

const BASE = "/admin/campagnes";

const STATUS_ORDER = ["DRAFT", "SCHEDULED", "SENDING", "SENT", "CANCELED"] as const;

/**
 * Les campagnes de la console : ce qui est parti, ce qui est programmé, ce qui
 * attend en brouillon. Les compteurs sont ceux de la base ; un envoi simulé
 * (messagerie non configurée) se lit « simulée », jamais « envoyée ».
 */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const status = codeFromParam(CAMPAIGN_STATUS_PARAMS, firstParam(params.statut));
  const kind = codeFromParam(CAMPAIGN_KIND_PARAMS, firstParam(params.type));
  const page = pageParam(params.page);
  const messagingLive = getMessagingProvider().info.capability === "LIVE";

  let data: Awaited<ReturnType<typeof listCampaigns>> | null = null;
  let loadError: string | null = null;
  try {
    data = await listCampaigns({ status: status ?? undefined, kind: kind ?? undefined, page });
  } catch (error) {
    console.error("[campagnes] liste impossible", error);
    loadError = error instanceof Error ? error.message : "Erreur inconnue.";
  }

  const statusParam = paramFromCode(CAMPAIGN_STATUS_PARAMS, status);
  const kindParam = paramFromCode(CAMPAIGN_KIND_PARAMS, kind);
  const keep = { statut: statusParam, type: kindParam };
  const filtered = Boolean(status || kind);
  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const tile = (code: string) => hrefWith(BASE, { type: kindParam }, { statut: paramFromCode(CAMPAIGN_STATUS_PARAMS, code) });

  return (
    <>
      <AdminPageHeader
        space={{ label: "Communication", href: "/admin/communications" }}
        title="Campagnes"
        description="Les messages que l'équipe envoie aux officines et aux partenaires : offres bonus, parrainage, invitations, annonces. Maintenant ou à un jour choisi ; rien ne part sans confirmation."
        actions={
          <Button asChild size="md" leadingIcon={<Plus className="size-4" />}>
            <Link href={`${BASE}/nouvelle`}>Créer une campagne</Link>
          </Button>
        }
      />

      {!messagingLive && (
        <Alert tone="warning" title="Messagerie non configurée : les envois seront simulés">
          Aucun e-mail ne partira. Chaque destinataire sera marqué « simulé », et la campagne l&apos;indiquera partout, jamais « envoyée ».
        </Alert>
      )}

      {loadError && (
        <Alert tone="danger" title="Les campagnes n'ont pas pu être chargées">
          {loadError}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Envoyées" value={data ? (counts.SENT ?? 0) : "—"} hint="Terminées, envois simulés compris : voir la colonne Résultat" href={tile("SENT")} tone={(counts.SENT ?? 0) > 0 ? "success" : "default"} />
        <KpiTile label="Programmées" value={data ? (counts.SCHEDULED ?? 0) : "—"} hint="Partent au passage quotidien du jour choisi" href={tile("SCHEDULED")} tone={(counts.SCHEDULED ?? 0) > 0 ? "brand" : "default"} />
        <KpiTile label="Brouillons" value={data ? (counts.DRAFT ?? 0) : "—"} hint="Enregistrés, personne n'est contacté" href={tile("DRAFT")} />
        <KpiTile label="En cours d'envoi" value={data ? (counts.SENDING ?? 0) : "—"} hint="À reprendre si l'envoi s'est interrompu" href={tile("SENDING")} tone={(counts.SENDING ?? 0) > 0 ? "warning" : "default"} />
      </div>

      <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-card p-4">
        <FilterChips
          basePath={BASE}
          param="statut"
          label="Statut de la campagne"
          current={statusParam}
          keep={{ type: kindParam }}
          options={[{ value: null, label: "Toutes", count: data ? total : undefined }, ...STATUS_ORDER.map((code) => ({ value: paramFromCode(CAMPAIGN_STATUS_PARAMS, code), label: CAMPAIGN_STATUS_LABELS[code].label, count: data ? (counts[code] ?? 0) : undefined }))]}
        />
        <FilterChips
          basePath={BASE}
          param="type"
          label="Type de campagne"
          current={kindParam}
          keep={{ statut: statusParam }}
          options={[{ value: null, label: "Tous les types" }, ...CAMPAIGN_KIND_KEYS.map((code) => ({ value: paramFromCode(CAMPAIGN_KIND_PARAMS, code), label: CAMPAIGN_KINDS[code].label }))]}
        />
      </div>

      <AdminSection padded={false}>
        {!data ? (
          <EmptyState icon={<Megaphone className="size-5" />} title="Liste indisponible" description="Réessayez dans un instant. Si l'erreur persiste, elle est inscrite dans le journal du serveur." />
        ) : data.rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<Megaphone className="size-5" />}
              title="Aucune campagne pour ces filtres"
              description="Retirez un filtre pour revoir toutes les campagnes."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={BASE}>Réinitialiser les filtres</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Megaphone className="size-5" />}
              title="Aucune campagne pour l'instant"
              description="Une campagne écrit à plusieurs officines ou partenaires à la fois : une offre bonus, une offre de parrainage, une invitation à référencer une gamme, une annonce. Un brouillon ne contacte personne."
              action={
                <Button asChild leadingIcon={<Plus className="size-4" />}>
                  <Link href={`${BASE}/nouvelle`}>Créer une campagne</Link>
                </Button>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[980px]">
              <THead>
                <TR>
                  <TH>Campagne</TH>
                  <TH>Type</TH>
                  <TH numeric>Destinataires</TH>
                  <TH>Statut</TH>
                  <TH>Date</TH>
                  <TH>Résultat</TH>
                  <TH>
                    <span className="sr-only">Ouvrir</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((row) => {
                  const when = dateLabel(row);
                  const result = resultLine(row);
                  return (
                    <TR key={row.id} interactive>
                      <TD className="max-w-[320px] whitespace-normal">
                        <Link href={`${BASE}/${row.id}`} className="line-clamp-2 text-[13.5px] leading-5 font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">
                          {row.name}
                        </Link>
                        <span className="mt-0.5 line-clamp-1 block text-[12px] text-text-tertiary">{row.subject}</span>
                      </TD>
                      <TD className="text-[13px] whitespace-nowrap text-text-secondary">{kindLabel(row.kind)}</TD>
                      <TD numeric className="tabular-nums">
                        {recipientsLabel(row)}
                      </TD>
                      <TD>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={campaignStatusLabel(row)} />
                          {row.simulated && row.status !== "SENT" && row.status !== "SENDING" && <Badge tone="warning">Simulée</Badge>}
                        </span>
                      </TD>
                      <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">
                        <span className="block text-[11.5px] text-text-tertiary">{when.caption}</span>
                        {when.dayOnly ? formatDate(when.date) : formatDateTime(when.date)}
                      </TD>
                      <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{result ?? <span className="text-text-tertiary">—</span>}</TD>
                      <TD className="text-right">
                        <Link href={`${BASE}/${row.id}`} className="inline-flex size-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary" aria-label={`Ouvrir la campagne : ${row.name}`}>
                          <ArrowUpRight className="size-4" aria-hidden="true" />
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
        {data && (page > 1 || hasNextPage(page, CAMPAIGNS_PER_PAGE, data.total)) && (
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
            <span className="text-[12.5px] text-text-tertiary">
              Page {page} sur {Math.max(1, Math.ceil(data.total / CAMPAIGNS_PER_PAGE))} · {data.total.toLocaleString("fr-FR")} campagne{data.total > 1 ? "s" : ""}
            </span>
            <span className="flex gap-2">
              {page > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefWith(BASE, keep, { page: page > 2 ? String(page - 1) : null })}>
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Précédentes
                  </Link>
                </Button>
              )}
              {hasNextPage(page, CAMPAIGNS_PER_PAGE, data.total) && (
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefWith(BASE, keep, { page: String(page + 1) })}>
                    Suivantes
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
