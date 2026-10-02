import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Inbox, Tags } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { dateInputOf, getPartner } from "@/server/services/partners/partners";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCents, formatDate, formatNumber } from "@/lib/format";
import { ApplicationStatusBadge } from "../../candidatures/_components/status-badge";
import { PublicationBadge } from "../_components/publication-badge";
import { PartnerIdentityForm } from "./partner-identity-form";
import { PartnerStatusPanel } from "./partner-status-panel";
import { PartnerContacts } from "./partner-contacts";
import { PartnerContracts } from "./partner-contracts";
import { PartnerIntegrations } from "./partner-integrations";

export const metadata: Metadata = { title: "Fiche partenaire" };

/**
 * La fiche d'un partenaire : identité, statut de publication (qui ouvre ou
 * ferme la diffusion de toutes ses marques), contacts, contrats internes avec
 * leur estimation indicative, intégrations, marques et candidature d'origine.
 * Un partenaire ne se supprime pas : il s'archive.
 */
export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformSession();
  const partner = await getPartner(id);
  if (!partner) notFound();

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/admin/partenaires/liste">Partenaires</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {partner.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- logo saisi par URL dans la console, domaine non connu à l'avance
            <img src={partner.logoUrl} alt="" className="size-12 shrink-0 rounded-lg border border-border-subtle bg-white object-contain p-1" />
          )}
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em] break-words text-text-primary">{partner.name}</h1>
            <p className="text-[13px] break-words text-text-secondary">
              {[partner.legalName && partner.legalName !== partner.name ? partner.legalName : null, `créé le ${formatDate(partner.createdAt)}`].filter(Boolean).join(" · ")}
              {partner.website && (
                <>
                  {" · "}
                  <a href={partner.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-400">
                    site
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
        <PublicationBadge status={partner.status} />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <aside className="space-y-4 lg:col-start-3 lg:row-start-1">
          <Card>
            <CardHeader title="Publication" description="Ce statut décide si ses marques peuvent être vues des officines." />
            <CardContent>
              <PartnerStatusPanel id={partner.id} status={partner.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Marques" description={partner.brands.length === 0 ? undefined : "Chaque marque a aussi son propre statut et son audience."} />
            <CardContent>
              {partner.brands.length === 0 ? (
                <p className="flex items-start gap-1.5 text-[13px] text-text-secondary">
                  <Tags className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                  Aucune marque pour l&apos;instant. Elles se créent dans l&apos;onglet Marques.
                </p>
              ) : (
                <ul className="space-y-2">
                  {partner.brands.map((brand) => (
                    <li key={brand.id} className="flex items-center justify-between gap-2">
                      <Link href={`/admin/partenaires/marques/${brand.id}`} className="min-w-0 truncate text-[13.5px] font-medium text-text-primary hover:underline">
                        {brand.name}
                      </Link>
                      <PublicationBadge status={brand.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Commandes attribuées" description="Transmises ou confirmées, toutes périodes." />
            <CardContent>
              {partner.attributedOrders.count === 0 ? (
                <p className="text-[13px] text-text-secondary">Aucune commande attribuée pour l&apos;instant.</p>
              ) : (
                <p className="text-[13px] text-text-primary">
                  {formatNumber(partner.attributedOrders.count)} commande{partner.attributedOrders.count > 1 ? "s" : ""} · {formatCents(partner.attributedOrders.amountCents)} HT · {formatNumber(partner.attributedOrders.units)} unité{partner.attributedOrders.units > 1 ? "s" : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Candidature d'origine" />
            <CardContent>
              {partner.applications.length === 0 ? (
                <p className="flex items-start gap-1.5 text-[13px] text-text-secondary">
                  <Inbox className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                  Partenaire créé à la main, sans candidature.
                </p>
              ) : (
                <ul className="space-y-2">
                  {partner.applications.map((application) => (
                    <li key={application.id} className="space-y-0.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/admin/partenaires/candidatures/${application.id}`} className="min-w-0 truncate text-[13.5px] font-medium text-text-primary hover:underline">
                          {application.brand}
                        </Link>
                        <ApplicationStatusBadge status={application.status} />
                      </div>
                      <p className="text-[12px] text-text-tertiary">
                        {application.company} · reçue le {formatDate(application.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader title="Identité" description="Ce qui décrit le partenaire. Les notes internes restent dans la console." />
            <CardContent>
              <PartnerIdentityForm
                key={partner.updatedAt.toISOString()}
                initial={{
                  id: partner.id,
                  name: partner.name,
                  legalName: partner.legalName ?? "",
                  website: partner.website ?? "",
                  logoUrl: partner.logoUrl ?? "",
                  description: partner.description ?? "",
                  universes: partner.universes,
                  startsAt: dateInputOf(partner.startsAt),
                  endsAt: dateInputOf(partner.endsAt),
                  notes: partner.notes ?? "",
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Contacts" />
            <CardContent>
              <PartnerContacts partnerId={partner.id} contacts={partner.contacts} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Contrats internes" description="Jamais montrés aux officines ni au partenaire. Aucune facturation : l'estimation est indicative." />
            <CardContent>
              <PartnerContracts
                partnerId={partner.id}
                contracts={partner.contracts.map((contract) => ({
                  id: contract.id,
                  type: contract.type,
                  startsAt: dateInputOf(contract.startsAt),
                  endsAt: dateInputOf(contract.endsAt),
                  fixedAmountCents: contract.fixedAmountCents,
                  commissionPercent: contract.commissionPercent,
                  commissionPerUnitCents: contract.commissionPerUnitCents,
                  minimumCents: contract.minimumCents,
                  notes: contract.notes,
                  isCurrent: contract.isCurrent,
                  volume: contract.volume,
                  estimate: contract.estimate,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Intégrations" description="Comment les commandes et prises de contact parviennent au partenaire." />
            <CardContent>
              <PartnerIntegrations
                partnerId={partner.id}
                integrations={partner.integrations.map((integration) => ({
                  id: integration.id,
                  mode: integration.mode,
                  isActive: integration.isActive,
                  b2bUrlTemplate: integration.b2bUrlTemplate,
                  orderEmail: integration.orderEmail,
                  formUrl: integration.formUrl,
                  capabilities: integration.capabilities,
                  notes: integration.notes,
                  updatedAt: integration.updatedAt.toISOString(),
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
