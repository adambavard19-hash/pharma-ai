import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpCircle, Cable, Cpu, Monitor } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadTechnicalOverview } from "@/server/services/admin/clients";
import { loadDemoPharmacyIds } from "@/server/services/admin/cockpit";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { AttentionCard } from "@/components/admin/kpis";
import { FilterChips } from "@/components/admin/filters";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatEuros } from "@/core/billing/subscription";
import { lgoLabel } from "@/core/stock/connectors";
import { LATEST_AGENT_VERSION } from "@/core/admin/agent-version";
import { technicalErrors } from "@/core/admin/metrics";
import { searchParam, truncate } from "@/core/admin/clients";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Stack, TechText, When } from "../pharmacies/client-ui";
import { ResolveIncidentButton } from "./resolve-incident-button";

export const metadata: Metadata = { title: "État technique" };

const SEVERITY = { CRITICAL: { label: "Critique", tone: "danger" }, WARNING: { label: "Attention", tone: "warning" }, INFO: { label: "Information", tone: "info" } } as const;

/**
 * L'état technique du parc : connecteurs LGO, postes de comptoir, versions de
 * l'agent, incidents ouverts, consommation IA. Des états et des volumes,
 * jamais un contenu d'officine.
 */
export default async function TechnicalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const errorsOnly = searchParam(params, "filtre") === "erreurs";
  const now = new Date();
  const [data, demoIds] = await Promise.all([loadTechnicalOverview(now), loadDemoPharmacyIds()]);

  // Les erreurs se comptent sans les officines de démonstration, comme la carte « Alertes techniques » du cockpit.
  const errors = technicalErrors(data, demoIds);
  const connectorsToCheck = errors.connectors;
  const postsInError = errors.posts;
  const outdated = data.connectors.filter((c) => c.version.state === "OUTDATED").length + data.counterPosts.filter((p) => p.version.state === "OUTDATED").length;
  const errorCount = errors.total;
  const connectors = errorsOnly ? connectorsToCheck : data.connectors;
  const posts = errorsOnly ? postsInError : data.counterPosts;
  // Un incident d'officine de démonstration reste visible dans « Tout », signalé, mais n'est pas une erreur à traiter.
  const incidents = errorsOnly ? errors.incidents : data.incidents;
  const demoIncidents = data.incidents.length - errors.incidents.length;

  return (
    <>
      <AdminPageHeader space={{ label: "Clients", href: "/admin/pharmacies" }} title="État technique" description={`Connecteurs, postes de comptoir, incidents et consommation IA. Dernière version publiée de PharmaBoost Connect : ${LATEST_AGENT_VERSION}.`} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AttentionCard count={connectorsToCheck.length} title="Connecteurs à vérifier" description="En erreur, déconnectés, hors ligne ou en retard." href="/admin/technique?filtre=erreurs" tone="danger" icon={<Cable className="size-4" />} />
        <AttentionCard count={postsInError.length} title="Postes en erreur d'export" description="Le stock n'est plus relu depuis le poste." href="/admin/technique?filtre=erreurs" tone="warning" icon={<Monitor className="size-4" />} />
        <AttentionCard
          count={errors.incidents.length}
          title="Incidents ouverts"
          description={`${data.resolvedRecently} résolu${data.resolvedRecently > 1 ? "s" : ""} ces 30 derniers jours${demoIncidents > 0 ? ` · ${demoIncidents} en démonstration, non comptés` : ""}.`}
          href="/admin/technique#incidents"
          tone="danger"
          icon={<AlertTriangle className="size-4" />}
        />
        <AttentionCard count={outdated} title="Agents à mettre à jour" description={`Version antérieure à ${LATEST_AGENT_VERSION}.`} href="/admin/technique#connecteurs" tone="info" icon={<ArrowUpCircle className="size-4" />} />
      </div>

      <FilterChips
        label="Filtrer l'état technique"
        basePath="/admin/technique"
        param="filtre"
        current={errorsOnly ? "erreurs" : null}
        options={[
          { value: null, label: "Tout" },
          { value: "erreurs", label: "Erreurs", count: errorCount },
        ]}
      />

      <AdminSection
        id="incidents"
        title="Incidents ouverts"
        description={errorsOnly ? "Seulement ceux à traiter (hors officines de démonstration). Marquer résolu consigne la date et votre commentaire." : "Signalés par la plateforme, sans donnée patient. Marquer résolu consigne la date et votre commentaire."}
      >
        {incidents.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">{errorsOnly && data.incidents.length > 0 ? "Aucun incident ouvert hors officines de démonstration." : "Aucun incident ouvert."}</p>
        ) : (
          <ul className="-my-2 divide-y divide-border-subtle">
            {incidents.map((incident) => (
              <li key={incident.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={SEVERITY[incident.severity]} />
                    {incident.pharmacyId && demoIds.has(incident.pharmacyId) && <Badge tone="neutral">Démo</Badge>}
                    <span className="text-[12px] text-text-tertiary">
                      {formatDateTime(incident.createdAt)} · code {incident.code}
                    </span>
                  </span>
                  <span className="block text-[13.5px] font-medium text-text-primary">{incident.title}</span>
                  <span className="block text-[12.5px] text-text-secondary">{truncate(incident.detail, 240)}</span>
                  {incident.pharmacyId && (
                    <span className="block text-[12px]">
                      {incident.pharmacyName ? (
                        <Link href={`/admin/pharmacies/${incident.pharmacyId}?onglet=technique`} className="font-medium text-brand-700 hover:underline dark:text-brand-400">
                          {incident.pharmacyName}
                        </Link>
                      ) : (
                        <span className="text-text-tertiary">Officine supprimée</span>
                      )}
                    </span>
                  )}
                </span>
                <ResolveIncidentButton incidentId={incident.id} title={incident.title} />
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection id="connecteurs" title="Connecteurs du logiciel de gestion" description={errorsOnly ? "Seulement ceux qui demandent une vérification (hors officines de démonstration)." : "Toutes les liaisons LGO, appairées ou en attente."} padded={connectors.length === 0}>
        {connectors.length === 0 ? (
          data.connectors.length === 0 ? (
            <EmptyState icon={<Cable className="size-5" />} title="État non disponible" description="Aucun connecteur n'a encore été relié : les officines importent leur stock par fichier." />
          ) : (
            <p className="text-[13px] text-text-tertiary">Aucun connecteur en erreur, déconnecté ou en retard.</p>
          )
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Officine</TH>
                  <TH>État</TH>
                  <TH>Version de l&apos;agent</TH>
                  <TH>Dernière synchro</TH>
                  <TH>Dernière activité</TH>
                  <TH>Dernier message</TH>
                </TR>
              </THead>
              <TBody>
                {connectors.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/admin/pharmacies/${c.pharmacy.id}?onglet=technique`} className="block font-medium text-text-primary hover:underline">
                        {c.pharmacy.name}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-tertiary">
                        {lgoLabel(c.lgo)}
                        {c.hostname ? ` · ${c.hostname}` : ""}
                        {c.pharmacy.isDemo && <Badge tone="neutral">Démo</Badge>}
                        {!c.pharmacy.isActive && <Badge tone="danger">Suspendue</Badge>}
                      </span>
                    </TD>
                    <TD>
                      <StatusBadge status={c.state} />
                    </TD>
                    <TD>
                      <StatusBadge status={c.version} />
                    </TD>
                    <TD>
                      <Stack primary={<When date={c.lastSyncAt} empty="Jamais" />} secondary={c.lastSyncLines !== null ? `${formatNumber(c.lastSyncLines)} lignes` : undefined} />
                    </TD>
                    <TD>
                      <When date={c.lastSeenAt} empty="Jamais" className="text-[13px]" />
                    </TD>
                    <TD>
                      <TechText text={c.lastError} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </AdminSection>

      <AdminSection title="Postes de comptoir" description={errorsOnly ? "Seulement les postes en erreur d'export (hors officines de démonstration)." : "Les postes de caisse reliés (hors révoqués). En ligne s'ils se sont signalés il y a moins de 3 minutes."} padded={posts.length === 0}>
        {posts.length === 0 ? (
          data.counterPosts.length === 0 ? (
            <EmptyState icon={<Monitor className="size-5" />} title="État non disponible" description="Aucun poste de comptoir n'est encore relié." />
          ) : (
            <p className="text-[13px] text-text-tertiary">Aucun poste en erreur d&apos;export.</p>
          )
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Officine</TH>
                  <TH>Poste</TH>
                  <TH>État</TH>
                  <TH>Version</TH>
                  <TH>Vu</TH>
                  <TH>Douchette</TH>
                  <TH>Export du stock</TH>
                </TR>
              </THead>
              <TBody>
                {posts.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/admin/pharmacies/${p.pharmacy.id}?onglet=technique`} className="text-[13px] font-medium text-text-primary hover:underline">
                        {p.pharmacy.name}
                      </Link>
                      {p.pharmacy.isDemo && (
                        <span className="mt-1 block">
                          <Badge tone="neutral">Démo</Badge>
                        </span>
                      )}
                    </TD>
                    <TD>
                      <Stack primary={p.label ?? p.hostname} secondary={p.label ? p.hostname : undefined} />
                    </TD>
                    <TD>
                      <StatusBadge status={p.state} />
                    </TD>
                    <TD>
                      <StatusBadge status={p.version} />
                    </TD>
                    <TD>
                      <When date={p.lastSeenAt} empty="Jamais" className="text-[13px]" />
                    </TD>
                    <TD>
                      <Stack primary={`${formatNumber(p.scanCount)} lecture${p.scanCount > 1 ? "s" : ""}`} secondary={p.lastScanAt ? <When date={p.lastScanAt} /> : undefined} />
                    </TD>
                    <TD>{p.lastExportError ? <TechText text={p.lastExportError} max={120} /> : <When date={p.lastExportAt} empty="Aucun export" className="text-[13px]" />}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </AdminSection>

      {!errorsOnly && (
        <AdminSection title="Consommation IA sur 30 jours" description="Appels aux modèles enregistrés par la plateforme : volumes et coûts, sans aucun contenu.">
          {data.ai.calls === 0 ? (
            <EmptyState icon={<Cpu className="size-5" />} title="Aucun appel enregistré sur 30 jours" description="Le suivi s'alimente à chaque appel à un modèle : jetons consommés, durée et coût, par officine." />
          ) : (
            <div className="space-y-5">
              <FactList
                className="lg:grid-cols-4"
                items={[
                  { label: "Appels", value: formatNumber(data.ai.calls), hint: data.ai.failed > 0 ? `${formatNumber(data.ai.failed)} en échec` : "Aucun échec" },
                  { label: "Jetons en entrée", value: formatNumber(data.ai.inputTokens) },
                  { label: "Jetons en sortie", value: formatNumber(data.ai.outputTokens) },
                  { label: "Coût enregistré", value: formatEuros(data.ai.costCents), hint: data.ai.costCents === 0 ? "Les fournisseurs branchés ne déclarent pas encore de coût." : undefined },
                ]}
              />
              <div className="grid items-start gap-5 lg:grid-cols-2">
                <TableWrapper>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Opération</TH>
                        <TH numeric>Appels</TH>
                        <TH numeric>Jetons</TH>
                        <TH numeric>Coût</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.ai.byOperation.map((o) => (
                        <TR key={o.operation}>
                          <TD className="font-mono text-[12.5px]">{o.operation}</TD>
                          <TD numeric>{formatNumber(o.calls)}</TD>
                          <TD numeric>{formatNumber(o.tokens)}</TD>
                          <TD numeric>{formatEuros(o.costCents)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrapper>
                <TableWrapper>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Officines les plus consommatrices</TH>
                        <TH numeric>Appels</TH>
                        <TH numeric>Coût</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.ai.topPharmacies.map((p) => (
                        <TR key={p.pharmacyId}>
                          <TD>
                            <Link href={`/admin/pharmacies/${p.pharmacyId}`} className="text-[13px] text-text-primary hover:underline">
                              {p.name}
                            </Link>
                          </TD>
                          <TD numeric>{formatNumber(p.calls)}</TD>
                          <TD numeric>{formatEuros(p.costCents)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrapper>
              </div>
            </div>
          )}
        </AdminSection>
      )}
    </>
  );
}
