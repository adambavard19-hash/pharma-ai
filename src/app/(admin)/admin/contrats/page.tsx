import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Download, Eye, FileCheck2, FileSignature, FolderOpen, History } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { CONTRACT_FILTER_KEYS, CONTRACT_FILTER_LABELS, listAffiliateContractsForAdmin, listContractsForAdmin, resolveContractFilter, signatureProviderState, type AdminAffiliateContractRow, type AdminContractRow } from "@/server/services/admin/contracts-admin";
import { loadCountersigner } from "@/server/services/sales/countersigner";
import { expiryHint } from "@/core/contracts/admin-view";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips, SearchBox, hrefWith } from "@/components/admin/filters";
import { StatusBadge } from "@/components/admin/status-badge";
import { RemindContractButton } from "@/components/admin/remind-contract-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SendDraftButton } from "./send-draft-button";
import { SignatureBanner } from "./signature-banner";
import { SignersCell } from "./signers-cell";
import { CountersignerForm, RefreshAffiliateButton, SendAffiliateContractForm } from "./countersign-controls";

export const metadata: Metadata = { title: "Contrats" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined): string | null => {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : null;
};

const date = (d: Date | null) => (d ? formatFrenchDate(d) : null);

/**
 * Le centre des contrats : chaque dossier par sa dernière version (ou toutes),
 * hors officines de démonstration, les filtres partagés avec le cockpit
 * (« En attente » est sa tuile « Contrats en attente »), et les gestes du quotidien — envoyer
 * un brouillon, relancer une signature, ouvrir le PDF, relire l'historique.
 */
export default async function ContractsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePlatformSession();
  const params = await searchParams;
  const statut = resolveContractFilter({ statut: one(params.statut), vue: one(params.vue) });
  const q = one(params.q);
  const versions = one(params.versions) === "toutes" ? "toutes" : "derniere";
  const now = new Date();
  const [list, affiliates, countersigner, signature] = await Promise.all([listContractsForAdmin({ statut, q, versions }, now), listAffiliateContractsForAdmin({ statut, q }, now), loadCountersigner(), Promise.resolve(signatureProviderState())]);
  const toCountersign = list.totals["a-contresigner"] + affiliates.totals["a-contresigner"];

  const keep = { q, versions: versions === "toutes" ? "toutes" : null, statut };
  const filtered = Boolean(statut || q);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Finances", href: "/admin/abonnements" }}
        title="Contrats"
        description="Tous les contrats : abonnements des pharmacies et contrats d'affiliation. Chacun est signé d'abord par le titulaire (ou l'affilié), puis contresigné par PharmaBoost ; il n'est signé qu'avec les deux signatures. Le PDF signé, le dossier et l'historique sont à un clic."
        actions={
          <Button asChild variant="outline" size="sm" leadingIcon={<Building2 className="size-4" />}>
            <Link href="/admin/societe">Société exploitante</Link>
          </Button>
        }
      />

      <SignatureBanner state={signature} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="À envoyer" value={list.totals.brouillon} hint="Brouillons prêts" href={hrefWith("/admin/contrats", { versions: keep.versions }, { statut: "brouillon" })} />
        <KpiTile label="À signer" value={list.totals["a-signer"]} hint="Envoyés ou consultés" tone={list.totals["a-signer"] > 0 ? "info" : "default"} href={hrefWith("/admin/contrats", { versions: keep.versions }, { statut: "a-signer" })} />
        <KpiTile label="Relance nécessaire" value={list.totals.relance} hint="Signalés ou expirant sous 7 jours" tone={list.totals.relance > 0 ? "warning" : "default"} href={hrefWith("/admin/contrats", { versions: keep.versions }, { statut: "relance" })} />
        <KpiTile label="À contresigner par moi" value={toCountersign} hint="Signés par le titulaire ou l'affilié" tone={toCountersign > 0 ? "brand" : "default"} href={hrefWith("/admin/contrats", { versions: keep.versions }, { statut: "a-contresigner" })} />
        <KpiTile label="Signés" value={list.totals.signes} hint="Finalisés par les deux parties" tone={list.totals.signes > 0 ? "success" : "default"} href={hrefWith("/admin/contrats", { versions: keep.versions }, { statut: "signes" })} />
      </div>

      <AdminSection padded={false}>
        <div className="space-y-3 border-b border-border-subtle px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchBox action="/admin/contrats" defaultValue={q} placeholder="Officine, signataire ou référence" keep={keep} />
            <FilterChips
              basePath="/admin/contrats"
              param="versions"
              label="Versions affichées"
              current={keep.versions}
              keep={{ q, statut }}
              options={[
                { value: null, label: "Dernière version de chaque dossier" },
                { value: "toutes", label: "Toutes les versions" },
              ]}
            />
          </div>
          <FilterChips
            basePath="/admin/contrats"
            param="statut"
            label="Statut du contrat"
            current={statut}
            keep={{ q, versions: keep.versions }}
            options={[{ value: null, label: "Tous", count: list.counters.tous }, ...CONTRACT_FILTER_KEYS.map((key) => ({ value: key, label: CONTRACT_FILTER_LABELS[key], count: list.counters[key] }))]}
          />
        </div>

        {list.truncated && (
          <div className="px-5 pt-4">
            <Alert tone="info">Seuls les {list.scanned} contrats les plus récents sont lus ici. Affinez par la recherche pour retrouver un contrat plus ancien.</Alert>
          </div>
        )}

        {list.rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<FileSignature className="size-6" />}
              title="Aucun contrat ici"
              description={q ? `Aucun contrat ne correspond à « ${q} »${statut ? " dans ce filtre" : ""}.` : "Aucun contrat ne correspond à ce filtre pour l'instant."}
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={hrefWith("/admin/contrats", { versions: keep.versions }, {})}>Voir tous les contrats</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<FileSignature className="size-6" />}
              title="Aucun contrat pour l'instant"
              description="Un contrat naît dans un dossier : complétez le dossier d'une officine, puis préparez et envoyez son contrat."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/prospects">Ouvrir les dossiers</Link>
                </Button>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Officine · dossier</TH>
                  <TH>Référence</TH>
                  <TH>Version</TH>
                  <TH numeric>Tarif mensuel</TH>
                  <TH>Statut</TH>
                  <TH>Envoyé le</TH>
                  <TH>Consulté le</TH>
                  <TH>Signatures</TH>
                  <TH>Relances</TH>
                  <TH>Expiration</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {list.rows.map((row) => (
                  <ContractRow key={row.id} row={row} now={now} signature={signature} showAllVersions={versions === "toutes"} />
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </AdminSection>
      <AdminSection
        padded={false}
        title="Contrats d'affiliation"
        description="Signés par l'affilié, puis contresignés par PharmaBoost. Rémunération imprimée : commission mensuelle par paliers sur l'abonnement et prime d'apport, lues depuis les conditions de l'affiliation."
      >
        <div className="border-b border-border-subtle px-5 py-4">
          <SendAffiliateContractForm affiliates={affiliates.eligible} signatureLive={signature.configured} />
        </div>
        {affiliates.rows.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-text-tertiary">{statut || q ? "Aucun contrat d'affiliation dans ce filtre." : "Aucun contrat d'affiliation pour l'instant."}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Affilié</TH>
                  <TH>Référence</TH>
                  <TH>Statut</TH>
                  <TH>Envoyé le</TH>
                  <TH>Signatures</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {affiliates.rows.map((row) => (
                  <AffiliateRow key={row.id} row={row} />
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </AdminSection>

      <AdminSection title="Signataire PharmaBoost" description="Qui contresigne les prochains contrats pour PharmaBoost. Un contrat déjà envoyé garde son signataire.">
        <CountersignerForm initial={{ name: countersigner.name, email: countersigner.email }} source={countersigner.source} />
      </AdminSection>

      <p className="text-[12.5px] text-text-tertiary">
        {list.rows.length} contrat{list.rows.length > 1 ? "s" : ""} affiché{list.rows.length > 1 ? "s" : ""}
        {versions === "toutes" ? ", toutes versions confondues" : ", dernière version de chaque dossier"}, hors officines de démonstration. La cadence des relances automatiques se règle dans le{" "}
        <Link href="/admin/relances" className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
          centre des relances
        </Link>
        .
      </p>
    </div>
  );
}

function ContractRow({ row, now, signature, showAllVersions }: { row: AdminContractRow; now: Date; signature: { configured: boolean; label: string }; showAllVersions: boolean }) {
  const expiry = expiryHint(row, now);
  const expired = Boolean(row.expiresAt && row.expiresAt.getTime() <= now.getTime());
  const awaiting = row.status === "SENT" || row.status === "OPENED";
  const canSend = row.status === "DRAFT" && row.latest && !row.blocked;
  const canRemind = awaiting && row.latest && !row.blocked && !expired;
  const iconLink = "inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

  return (
    <TR interactive>
      <TD className="max-w-[260px]">
        <Link href={`/admin/contrats/${row.id}`} className="block truncate font-medium text-text-primary hover:text-brand-700 dark:hover:text-brand-300">
          {row.pharmacyName}
        </Link>
        <span className="block truncate text-[12.5px] text-text-tertiary">
          {row.legalName && row.legalName.toLowerCase() !== row.pharmacyName.toLowerCase() ? `${row.legalName} · ` : ""}
          {row.signerName}
        </span>
      </TD>
      <TD>
        <span className="font-mono text-[12.5px] text-text-secondary">{row.reference}</span>
      </TD>
      <TD>
        <span className="tabular-nums">v{row.version}</span>
        {row.versionCount > 1 && !showAllVersions && <span className="block text-[12px] text-text-tertiary">{row.versionCount} versions</span>}
        {showAllVersions && !row.latest && <span className="block text-[12px] text-text-tertiary">ancienne version</span>}
      </TD>
      <TD numeric>
        <span className="whitespace-nowrap">{formatEuros(row.monthlyPriceCents)} HT</span>
      </TD>
      <TD>
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.display} />
          {row.blocked && <Badge tone="danger">Dossier suspendu</Badge>}
          {row.stale && <span className="text-[12px] text-warning-700 dark:text-warning-500">Dossier modifié depuis</span>}
          {awaiting && expired && row.latest && <span className="text-[12px] text-danger-700 dark:text-danger-500">Lien expiré : nouvelle version à préparer</span>}
        </div>
      </TD>
      <TD className="whitespace-nowrap text-text-secondary">{date(row.sentAt) ?? <Dash />}</TD>
      <TD className="whitespace-nowrap text-text-secondary">{date(row.openedAt) ?? <Dash />}</TD>
      <TD className="min-w-[220px]">
        <SignersCell
          status={row.status}
          firstParty={{ role: "PHARMACY", name: row.signerName, email: row.signerEmail }}
          firstPartySignedAt={row.pharmacySignedAt}
          companySignedAt={row.companySignedAt}
          company={{ name: row.companySignerName, email: row.companySignerEmail }}
          companySigningUrl={row.companySigningUrl}
        />
        {row.refusedAt && <span className="mt-1 block text-[12px] text-danger-700 dark:text-danger-500">Refusé le {formatFrenchDate(row.refusedAt)}</span>}
      </TD>
      <TD className="whitespace-nowrap">
        <span className="tabular-nums">{row.reminderCount}</span>
        {row.lastReminderAt && <span className="block text-[12px] text-text-tertiary">dernière le {formatFrenchDate(row.lastReminderAt)}</span>}
        {row.escalatedAt && <span className="block text-[12px] text-warning-700 dark:text-warning-500">signalé le {formatFrenchDate(row.escalatedAt)}</span>}
      </TD>
      <TD className="whitespace-nowrap">
        {row.expiresAt && (awaiting || row.status === "EXPIRED") ? (
          <>
            <span className="text-text-secondary">{formatFrenchDate(row.expiresAt)}</span>
            {expiry && (
              <Badge tone={expiry.tone} className="ml-1.5">
                {expiry.label}
              </Badge>
            )}
          </>
        ) : (
          <Dash />
        )}
      </TD>
      <TD>
        <div className="flex items-center justify-end gap-1">
          {canSend && (
            <SendDraftButton
              contractId={row.id}
              reference={row.reference}
              signerName={row.signerName}
              signerEmail={row.signerEmail}
              monthlyPrice={formatEuros(row.monthlyPriceCents)}
              generatedOn={formatFrenchDate(row.createdAt)}
              stale={row.stale}
              signatureLabel={signature.label}
              signatureLive={signature.configured}
            />
          )}
          {canRemind && <RemindContractButton contractId={row.id} signerEmail={row.signerEmail} reminderCount={row.reminderCount} />}
          <Link href={`/admin/dossiers/${row.prospectId}`} className={iconLink} title="Ouvrir le dossier" aria-label={`Ouvrir le dossier ${row.pharmacyName}`}>
            <FolderOpen className="size-4" aria-hidden="true" />
          </Link>
          <a href={`/api/contrats/apercu/${row.id}`} target="_blank" rel="noopener noreferrer" className={iconLink} title="Prévisualiser le PDF" aria-label={`Prévisualiser le PDF du contrat ${row.reference}`}>
            <Eye className="size-4" aria-hidden="true" />
          </a>
          {row.finalizedAt && row.signedArchived ? (
            <a href={`/api/contrats/apercu/${row.id}`} download={`${row.reference}-signe.pdf`} className={iconLink} title="Télécharger le PDF signé par les deux parties" aria-label={`Télécharger le PDF signé du contrat ${row.reference}`}>
              <FileCheck2 className="size-4 text-success-600" aria-hidden="true" />
            </a>
          ) : (
            <a href={`/api/contrats/apercu/${row.id}`} download={`${row.reference}.pdf`} className={iconLink} title="Télécharger le PDF" aria-label={`Télécharger le PDF du contrat ${row.reference}`}>
              <Download className="size-4" aria-hidden="true" />
            </a>
          )}
          <Link href={`/admin/contrats/${row.id}`} className={iconLink} title="Historique du contrat" aria-label={`Historique du contrat ${row.reference}`}>
            <History className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </TD>
    </TR>
  );
}

function AffiliateRow({ row }: { row: AdminAffiliateContractRow }) {
  const iconLink = "inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
  const signedPdf = Boolean(row.finalizedAt && row.signedArchived);
  return (
    <TR>
      <TD className="max-w-[240px]">
        <span className="block truncate font-medium text-text-primary">{row.affiliateName}</span>
        <span className="block truncate text-[12.5px] text-text-tertiary">{row.affiliateEmail}</span>
      </TD>
      <TD>
        <span className="font-mono text-[12.5px] text-text-secondary">{row.reference}</span>
      </TD>
      <TD>
        <StatusBadge status={row.display} />
      </TD>
      <TD className="whitespace-nowrap text-text-secondary">{date(row.sentAt) ?? <Dash />}</TD>
      <TD className="min-w-[220px]">
        <SignersCell
          status={row.status}
          firstParty={{ role: "AFFILIATE", name: row.affiliateName, email: row.affiliateEmail }}
          firstPartySignedAt={row.affiliateSignedAt}
          companySignedAt={row.companySignedAt}
          company={{ name: row.companySignerName, email: row.companySignerEmail }}
          companySigningUrl={row.companySigningUrl}
        />
      </TD>
      <TD>
        <div className="flex items-center justify-end gap-1">
          {row.status !== "DRAFT" && row.status !== "FINALIZED" && <RefreshAffiliateButton contractId={row.id} />}
          <a href={`/api/contrats/affilies/${row.id}`} target="_blank" rel="noopener noreferrer" className={iconLink} title={signedPdf ? "PDF signé par les deux parties" : "Prévisualiser le PDF"} aria-label={`PDF du contrat ${row.reference}`}>
            {signedPdf ? <FileCheck2 className="size-4 text-success-600" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </a>
        </div>
      </TD>
    </TR>
  );
}

function Dash() {
  return <span className="text-text-tertiary">—</span>;
}
