import type { Metadata } from "next";
import Link from "next/link";
import { Network, Tags } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listConsoleBrands, listPartnerOptions, listPilotCandidates } from "@/server/services/partners/brands";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AUDIENCE_LABELS } from "@/core/partners/status";
import { universeLabel } from "@/config/universes";
import { formatNumber } from "@/lib/format";
import { PublicationBadge } from "./_components/publication-badge";
import { CreateBrandButton } from "./brand-create";
import { PilotGroupCard } from "./pilot-group";

export const metadata: Metadata = { title: "Marques partenaires" };

/**
 * Les marques des partenaires, leurs gammes et leur diffusion.
 *
 * Une marque est une fiche centrale : les officines la lisent depuis la
 * plateforme selon son statut, son audience et le groupe pilote ; rien n'est
 * copié chez elles. « Officines qui la voient » applique la règle de
 * diffusion des officines elles-mêmes, sur les vraies officines actives.
 */
export default async function PartnerBrandsPage() {
  await requirePlatformSession();
  const [{ brands, realPharmacies }, partners, candidates] = await Promise.all([listConsoleBrands(), listPartnerOptions(), listPilotCandidates()]);

  const universes = (keys: string[]) => (keys.length ? keys.map(universeLabel).join(", ") : "—");
  const reach = (count: number) => `${formatNumber(count)} / ${formatNumber(realPharmacies)}`;

  return (
    <>
      <PageHeader
        title="Marques"
        description="Un partenaire, ses marques, leurs gammes et leurs produits. Chaque marque est créée en brouillon, puis testée auprès du groupe pilote avant d'être diffusée."
        actions={<CreateBrandButton partners={partners} />}
      />

      <Alert tone="info" icon={<Network className="size-[18px]" aria-hidden="true" />} title="Diffusion centrale">
        Une seule fiche par marque, lue par les officines éligibles au moment où elles l&apos;ouvrent : aucune copie dans les officines. Suspendre une marque la retire partout, immédiatement.
      </Alert>

      <PilotGroupCard candidates={candidates} />

      {partners.length === 0 && (
        <Alert tone="neutral" title="Aucun partenaire">
          Une marque appartient à un partenaire : créez d&apos;abord la fiche partenaire dans l&apos;onglet{" "}
          <Link href="/admin/partenaires/liste" className="font-medium text-text-primary underline">
            Partenaires
          </Link>
          .
        </Alert>
      )}

      {brands.length === 0 ? (
        <Card>
          <EmptyState icon={<Tags className="size-5" />} title="Aucune marque" description="Les marques des partenaires apparaîtront ici, avec leur statut, leur audience et le nombre d'officines qui les voient." />
        </Card>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {brands.map((brand) => (
              <li key={brand.id}>
                <Link href={`/admin/partenaires/marques/${brand.id}`} className="block space-y-1.5 rounded-xl border border-border-subtle bg-surface-card p-4 transition-colors hover:bg-surface-sunken/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-text-primary">{brand.name}</p>
                      <p className="truncate text-[12px] text-text-tertiary">{brand.partner.name}</p>
                    </div>
                    <PublicationBadge status={brand.status} />
                  </div>
                  <p className="text-[12.5px] text-text-secondary">{universes(brand.universes)}</p>
                  <p className="text-[12.5px] text-text-secondary">
                    {AUDIENCE_LABELS[brand.audience]} · {brand.ranges} gamme{brand.ranges > 1 ? "s" : ""} · {brand.products} produit{brand.products > 1 ? "s" : ""}
                  </p>
                  <p className="text-[12.5px] font-medium text-text-primary">Vue par {reach(brand.reach.catalog)} officines</p>
                </Link>
              </li>
            ))}
          </ul>

          <TableWrapper className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Marque</TH>
                  <TH>Partenaire</TH>
                  <TH>Univers</TH>
                  <TH>Statut</TH>
                  <TH>Audience</TH>
                  <TH numeric>Gammes</TH>
                  <TH numeric>Produits</TH>
                  <TH numeric>Officines qui la voient</TH>
                </TR>
              </THead>
              <TBody>
                {brands.map((brand) => (
                  <TR key={brand.id} interactive>
                    <TD>
                      <Link href={`/admin/partenaires/marques/${brand.id}`} className="block text-[13.5px] font-medium text-text-primary hover:underline">
                        {brand.name}
                      </Link>
                      <span className="block text-[12px] text-text-tertiary">/{brand.slug}</span>
                    </TD>
                    <TD className="text-[13px] text-text-secondary">
                      {brand.partner.name}
                      {brand.partner.status !== "ACTIVE" && brand.partner.status !== "TEST" && <span className="block text-[11.5px] text-warning-700">partenaire non publié</span>}
                    </TD>
                    <TD className="max-w-[220px] truncate text-[12.5px] text-text-secondary" title={universes(brand.universes)}>
                      {universes(brand.universes)}
                    </TD>
                    <TD>
                      <PublicationBadge status={brand.status} />
                    </TD>
                    <TD className="text-[12.5px] text-text-secondary">{AUDIENCE_LABELS[brand.audience]}</TD>
                    <TD numeric>{brand.ranges}</TD>
                    <TD numeric>{brand.products}</TD>
                    <TD numeric className="font-medium">
                      {reach(brand.reach.catalog)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
          <p className="text-[12px] text-text-tertiary">Officines qui la voient : sur les {formatNumber(realPharmacies)} officines réelles actives, hors démonstration, en appliquant statut du partenaire, statut de la marque, audience, groupe pilote et refus des officines.</p>
        </>
      )}
    </>
  );
}
