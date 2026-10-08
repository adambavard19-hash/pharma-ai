import { Cable, Monitor } from "lucide-react";
import { loadTechniqueTab, type Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { AdminSection, FactList } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatFrenchDate } from "@/core/billing/subscription";
import { lgoLabel } from "@/core/stock/connectors";
import { LATEST_AGENT_VERSION } from "@/core/admin/agent-version";
import { truncate } from "@/core/admin/clients";
import { formatDateTime } from "@/lib/format";
import { InstallGuideButton } from "../install-guide-button";
import { Stack, TechText, When } from "../client-ui";
import { ResolveIncidentButton } from "../../technique/resolve-incident-button";
import { EmptyLine } from "./shared";
import { AssistancePanel } from "./assistance/panel";

const SEVERITY = { CRITICAL: { label: "Critique", tone: "danger" }, WARNING: { label: "Attention", tone: "warning" }, INFO: { label: "Information", tone: "info" } } as const;

/** Connecteur LGO, postes de comptoir, incidents, installation : des états, jamais un contenu. */
export async function TechniqueTab({ base, now }: { base: Pharmacy360; now: Date }) {
  const { pharmacy, connector } = base;
  const connection = pharmacy.stockConnection;
  const data = await loadTechniqueTab(base, now);
  const activePosts = data.posts.filter((p) => !p.revokedAt);
  const revokedPosts = data.posts.length - activePosts.length;

  return (
    <div className="space-y-5">
      <AdminSection title="Connecteur du logiciel de gestion" description={`PharmaBoost Connect, installé sur le serveur de l'officine. Dernière version publiée : ${LATEST_AGENT_VERSION}.`}>
        {connection ? (
          <div className="space-y-4">
            <FactList
              className="lg:grid-cols-3"
              items={[
                { label: "Logiciel", value: lgoLabel(connection.lgo) },
                { label: "État", value: <StatusBadge status={connector} /> },
                { label: "Version de l'agent", value: <StatusBadge status={connector.version} /> },
                { label: "Dernière synchronisation", value: <When date={connection.lastSyncAt} empty="Jamais" />, hint: connection.lastSyncLines !== null ? `${connection.lastSyncLines} ligne${connection.lastSyncLines > 1 ? "s" : ""} lue${connection.lastSyncLines > 1 ? "s" : ""}` : undefined },
                { label: "Dernière activité de l'agent", value: <When date={connection.lastSeenAt} empty="Jamais" />, hint: `Intervalle : ${Math.round(connection.intervalSeconds / 60)} min` },
                { label: "Machine", value: connection.hostname, hint: connection.pairedAt ? `Appairée le ${formatFrenchDate(connection.pairedAt)}` : "Pas encore appairée" },
              ]}
            />
            <div>
              <p className="text-[12px] font-medium text-text-tertiary">{connection.status === "ERROR" ? "Dernière erreur" : "Dernier message de l'agent"}</p>
              <div className="mt-1">
                <TechText text={connection.lastError} max={300} />
              </div>
            </div>
          </div>
        ) : (
          <EmptyLine>Aucun connecteur relié : le stock arrive par import de fichier, ou n&apos;a pas encore été importé.</EmptyLine>
        )}
      </AdminSection>

      <AdminSection title="Postes de comptoir" description={`En ligne s'ils se sont signalés il y a moins de 3 minutes.${revokedPosts > 0 ? ` ${revokedPosts} poste${revokedPosts > 1 ? "s" : ""} révoqué${revokedPosts > 1 ? "s" : ""} masqué${revokedPosts > 1 ? "s" : ""}.` : ""}`} padded={activePosts.length === 0}>
        {activePosts.length === 0 ? (
          <EmptyState icon={<Monitor className="size-5" />} title="Aucun poste relié" description="Les postes de caisse s'appairent depuis l'application de l'officine." />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Poste</TH>
                  <TH>État</TH>
                  <TH>Version</TH>
                  <TH>Vu</TH>
                  <TH>Douchette</TH>
                  <TH>Export du stock</TH>
                </TR>
              </THead>
              <TBody>
                {activePosts.map((post) => (
                  <TR key={post.id}>
                    <TD>
                      <Stack primary={<span className="font-medium">{post.label ?? post.hostname}</span>} secondary={post.label ? post.hostname : undefined} />
                    </TD>
                    <TD>
                      <StatusBadge status={post.state} />
                    </TD>
                    <TD>
                      <StatusBadge status={post.version} />
                    </TD>
                    <TD>
                      <When date={post.lastSeenAt} empty="Jamais" className="text-[13px]" />
                    </TD>
                    <TD>
                      <Stack primary={`${post.scanCount} lecture${post.scanCount > 1 ? "s" : ""}`} secondary={post.lastScanAt ? <When date={post.lastScanAt} /> : "Aucune lecture"} />
                    </TD>
                    <TD>
                      {post.lastExportError ? <TechText text={post.lastExportError} max={120} /> : <Stack primary={post.exportPath ? "Configuré" : "Non configuré"} secondary={post.lastExportAt ? <When date={post.lastExportAt} /> : undefined} />}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </AdminSection>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <AdminSection title="Incidents" description="Signalés par la plateforme pour cette officine.">
          {data.incidents.length === 0 ? (
            <EmptyLine>Aucun incident enregistré pour cette officine.</EmptyLine>
          ) : (
            <ul className="-my-2 divide-y divide-border-subtle">
              {data.incidents.map((incident) => (
                <li key={incident.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={SEVERITY[incident.severity]} />
                      {incident.resolvedAt ? <Badge tone="success">Résolu le {formatFrenchDate(incident.resolvedAt)}</Badge> : <Badge tone="neutral">Ouvert</Badge>}
                    </span>
                    <span className="block text-[13.5px] font-medium text-text-primary">{incident.title}</span>
                    <span className="block text-[12.5px] text-text-secondary">{truncate(incident.detail, 220)}</span>
                    <span className="block text-[12px] text-text-tertiary">
                      {formatDateTime(incident.createdAt)} · code {incident.code}
                    </span>
                  </span>
                  {!incident.resolvedAt && <ResolveIncidentButton incidentId={incident.id} title={incident.title} />}
                </li>
              ))}
            </ul>
          )}
        </AdminSection>

        <AdminSection title="Installation" action={<InstallGuideButton pharmacyId={pharmacy.id} />}>
          <FactList
            className="sm:grid-cols-1"
            items={[
              { label: "Accueil du titulaire", value: pharmacy.onboardingCompletedAt ? `Terminé le ${formatFrenchDate(pharmacy.onboardingCompletedAt)}` : <Badge tone="warning">En cours</Badge> },
              { label: "Stock importé", value: pharmacy.stockSyncedAt ? <When date={pharmacy.stockSyncedAt} /> : <Badge tone="warning">Jamais importé</Badge> },
              { label: "Références au catalogue de stock", value: data.catalogCount, hint: data.unclassified > 0 ? `${data.unclassified} produit${data.unclassified > 1 ? "s" : ""} à classer` : "Aucun produit à classer" },
              { label: "Guide d'installation", value: data.lastGuide ? `Envoyé le ${formatFrenchDate(data.lastGuide.createdAt)}` : "Jamais envoyé" },
              { label: "Connecteur", value: connection ? lgoLabel(connection.lgo) : <span className="inline-flex items-center gap-1.5 text-text-tertiary"><Cable className="size-3.5" aria-hidden="true" />Aucun</span> },
            ]}
          />
        </AdminSection>
      </div>

      {/* Tout le technique de la connexion, retiré de l'écran du pharmacien : réservé à l'assistance. */}
      <AssistancePanel pharmacyId={pharmacy.id} />
    </div>
  );
}
