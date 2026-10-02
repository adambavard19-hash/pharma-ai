import type { Metadata } from "next";
import Link from "next/link";
import { Cable, KeyRound } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listIntegrations } from "@/server/services/partners/partners";
import { CONNECTOR_CAPABILITIES, CONNECTOR_CAPABILITY_LABELS, MODE_CAPABILITIES, type ConnectorCapability } from "@/core/partners/connector";
import { INTEGRATION_MODE_LABELS, INTEGRATION_MODES } from "@/core/partners/status";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { PublicationBadge } from "../liste/_components/publication-badge";
import { CapabilityComparison } from "../liste/_components/capabilities";

export const metadata: Metadata = { title: "Intégrations partenaires" };

/** Ce que recouvre chaque opération du contrat commun des connecteurs. */
const CAPABILITY_EXPLAINED: Record<ConnectorCapability, string> = {
  CATALOG: "Récupérer les références du partenaire (noms, codes, conditionnements) sans saisie manuelle.",
  AVAILABILITY: "Savoir si une référence est disponible chez le partenaire au moment de la commande.",
  PRO_PRICE: "Lire le prix professionnel en vigueur pour l'officine.",
  ORDER_CREATE: "Transmettre une commande de l'officine au partenaire.",
  ORDER_STATUS: "Suivre la commande chez le partenaire (reçue, confirmée, expédiée).",
  ATTRIBUTION: "Joindre l'identifiant PharmaBoost qui prouve que l'affaire vient de PharmaBoost, sans rien du patient.",
};

/**
 * Vue d'ensemble des intégrations partenaires : pour chacune, le mode, s'il
 * est actif, les capacités annoncées par le partenaire face à ce que le mode
 * fait réellement aujourd'hui. Rien n'est simulé : une capacité que le mode
 * ne couvre pas attend l'API du partenaire.
 */
export default async function PartnerIntegrationsPage() {
  await requirePlatformSession();
  const rows = await listIntegrations();
  const active = rows.filter((row) => row.isActive).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intégrations"
        description="Comment chaque partenaire reçoit les commandes et prises de contact venues des officines. Elles se configurent depuis la fiche de chaque partenaire."
      />

      <Alert tone="info" icon={<KeyRound className="size-[18px]" aria-hidden="true" />} title="Aucune clé d'API n'est stockée ici">
        Les modes sans API (lien B2B, formulaire, e-mail, import / export, manuel) fonctionnent dès aujourd&apos;hui. Le mode API attend l&apos;API du partenaire : tant qu&apos;elle n&apos;est pas branchée, aucune donnée n&apos;est échangée.
      </Alert>

      <section className="space-y-3">
        <SectionHeader
          title={rows.length === 0 ? "Intégrations configurées" : `Intégrations configurées · ${active} active${active > 1 ? "s" : ""} sur ${rows.length}`}
        />
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Cable className="size-5" />}
              title="Aucune intégration configurée"
              description="Ouvrez la fiche d'un partenaire, section Intégrations, pour déclarer son mode : lien B2B, formulaire, e-mail, import / export, manuel ou API."
            />
          </Card>
        ) : (
          <>
            <ul className="space-y-2.5 md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="space-y-2 rounded-xl border border-border-subtle bg-surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/admin/partenaires/liste/${row.partner.id}`} className="block truncate text-[14px] font-semibold text-text-primary hover:underline">
                        {row.partner.name}
                      </Link>
                      <p className="text-[12.5px] text-text-tertiary">{INTEGRATION_MODE_LABELS[row.mode]}</p>
                    </div>
                    <Badge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="text-[12.5px] leading-5 text-text-secondary">{MODE_CAPABILITIES[row.mode].howItWorks}</p>
                  <CapabilityComparison mode={row.mode} declared={row.capabilities} isActive={row.isActive} />
                </li>
              ))}
            </ul>

            <TableWrapper className="hidden md:block">
              <Table className="min-w-[860px]">
                <THead>
                  <TR>
                    <TH>Partenaire</TH>
                    <TH>Mode</TH>
                    <TH>État</TH>
                    <TH>Capacités</TH>
                    <TH>Modifiée le</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD className="max-w-[200px] align-top">
                        <Link href={`/admin/partenaires/liste/${row.partner.id}`} className="block truncate text-[13px] font-medium text-text-primary hover:underline">
                          {row.partner.name}
                        </Link>
                        <span className="mt-1 block">
                          <PublicationBadge status={row.partner.status} />
                        </span>
                      </TD>
                      <TD className="max-w-[260px] align-top whitespace-normal">
                        <span className="block text-[13px] text-text-primary">{INTEGRATION_MODE_LABELS[row.mode]}</span>
                        <span className="block text-[12px] leading-5 text-text-tertiary">{MODE_CAPABILITIES[row.mode].howItWorks}</span>
                      </TD>
                      <TD className="align-top">
                        <Badge tone={row.isActive ? "success" : "neutral"}>{row.isActive ? "Active" : "Inactive"}</Badge>
                      </TD>
                      <TD className="max-w-[340px] align-top whitespace-normal">
                        <CapabilityComparison mode={row.mode} declared={row.capabilities} isActive={row.isActive} />
                      </TD>
                      <TD className="align-top text-[12.5px] whitespace-nowrap text-text-secondary">{formatDate(row.updatedAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Le contrat commun des connecteurs" description="Chaque mode d'intégration ne déclare que ce qu'il sait vraiment faire. Une opération absente répond « non pris en charge », jamais une réponse inventée." />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Opérations" description="Toutes optionnelles : un connecteur n'implémente que celles du partenaire." />
            <CardContent>
              <dl className="space-y-2.5">
                {CONNECTOR_CAPABILITIES.map((capability) => (
                  <div key={capability}>
                    <dt className="text-[13px] font-medium text-text-primary">{CONNECTOR_CAPABILITY_LABELS[capability]}</dt>
                    <dd className="text-[12.5px] leading-5 text-text-secondary">{CAPABILITY_EXPLAINED[capability]}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Ce que chaque mode fait aujourd'hui" description="Sans API partenaire branchée." />
            <CardContent>
              <ul className="space-y-3">
                {INTEGRATION_MODES.map((mode) => {
                  const today = MODE_CAPABILITIES[mode].capabilities;
                  return (
                    <li key={mode} className="space-y-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-text-primary">
                        {INTEGRATION_MODE_LABELS[mode]}
                        {today.length === 0 ? (
                          <Badge tone="warning">En attente de l&apos;API du partenaire</Badge>
                        ) : (
                          today.map((capability) => (
                            <Badge key={capability} tone="neutral">
                              {CONNECTOR_CAPABILITY_LABELS[capability]}
                            </Badge>
                          ))
                        )}
                      </p>
                      <p className="text-[12.5px] leading-5 text-text-secondary">{MODE_CAPABILITIES[mode].howItWorks}</p>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
