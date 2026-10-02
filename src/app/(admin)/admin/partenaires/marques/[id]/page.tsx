import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgePercent, EyeOff, Network, Package, Store, Ban, MonitorSmartphone } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getConsoleBrand, listAudienceCandidates, type ConsoleBrandDetail } from "@/server/services/partners/brands";
import { PageHeader, Grid } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { AUDIENCE_LABELS, PUBLICATION_STATUS_LABELS } from "@/core/partners/status";
import { formatDate, formatNumber } from "@/lib/format";
import { isLive, PublicationBadge, publicationEffect } from "../_components/publication-badge";
import { PublicationStatusControl } from "../_components/status-control";
import { BrandEditorCard } from "./brand-editor";
import { AudienceEditorCard } from "./audience-editor";
import { RangesCard } from "./ranges-editor";
import { DocumentsCard } from "./documents-editor";

export const metadata: Metadata = { title: "Marque partenaire" };

/** Pourquoi aucune officine ne voit la marque : la première condition qui bloque, dans l'ordre de la règle de diffusion. */
function whyInvisible(brand: ConsoleBrandDetail): string {
  if (brand.realPharmacies === 0) return "Aucune officine réelle active pour l'instant.";
  if (!isLive(brand.partner.status)) return `Le partenaire « ${brand.partner.name} » est en ${PUBLICATION_STATUS_LABELS[brand.partner.status].toLowerCase()} : tant qu'il n'est pas publié, aucune de ses marques n'est visible.`;
  if (!isLive(brand.status)) return `La marque est en ${PUBLICATION_STATUS_LABELS[brand.status].toLowerCase()} : elle n'est visible par aucune officine.`;
  if ((brand.status === "TEST" || brand.partner.status === "TEST") && brand.pilotPharmacies === 0) return "En test, seul le groupe pilote voit la marque, et il ne compte encore aucune officine.";
  if (brand.audience === "PILOT_GROUP" && brand.pilotPharmacies === 0) return "L'audience est le groupe pilote, qui ne compte encore aucune officine.";
  if (brand.audience === "SELECTED_PHARMACIES") return "Aucune officine réelle active n'est cochée dans l'audience.";
  return "Les officines éligibles l'ont refusée.";
}

export default async function PartnerBrandPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformSession();
  const { id } = await params;
  const [brand, candidates] = await Promise.all([getConsoleBrand(id), listAudienceCandidates()]);
  if (!brand) notFound();

  const plural = (count: number) => (count > 1 ? "s" : "");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
          <Link href="/admin/partenaires/marques">Marques</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" leadingIcon={<Package className="size-4" />}>
            <Link href={`/admin/partenaires/catalogues?marque=${brand.id}`}>Catalogue · {brand.products.total}</Link>
          </Button>
          <Button asChild variant="outline" size="sm" leadingIcon={<BadgePercent className="size-4" />}>
            <Link href={`/admin/partenaires/offres?marque=${brand.id}`}>Offres · {brand.offers}</Link>
          </Button>
        </div>
      </div>

      <PageHeader
        title={brand.name}
        description={[`Marque de ${brand.partner.name}`, `/${brand.slug}`, brand.publishedAt ? `publiée le ${formatDate(brand.publishedAt)}` : null].filter(Boolean).join(" · ")}
      />

      <Alert tone="info" icon={<Network className="size-[18px]" aria-hidden="true" />} title="Diffusion centrale">
        Cette fiche est la seule : les officines éligibles la lisent ici, aucune copie n&apos;est faite chez elles. Toute modification est visible chez elles au prochain affichage.
      </Alert>

      {!isLive(brand.partner.status) && (
        <Alert tone="warning" title={`Partenaire en ${PUBLICATION_STATUS_LABELS[brand.partner.status].toLowerCase()}`}>
          Tant que « {brand.partner.name} » n&apos;est pas publié (Test ou Actif), cette marque n&apos;est visible dans aucune officine, quel que soit son propre statut. Le statut du partenaire se règle dans l&apos;onglet{" "}
          <Link href="/admin/partenaires/liste" className="font-medium text-text-primary underline">
            Partenaires
          </Link>
          .
        </Alert>
      )}

      <Grid cols={4}>
        <StatCard
          label="Visible pour"
          value={`${formatNumber(brand.reach.catalog)} officine${plural(brand.reach.catalog)}`}
          sublabel={`sur ${formatNumber(brand.realPharmacies)} officine${plural(brand.realPharmacies)} réelle${plural(brand.realPharmacies)} active${plural(brand.realPharmacies)}`}
          icon={<Store className="size-4" />}
          emphasis="brand"
        />
        <StatCard label="Au comptoir" value={formatNumber(brand.reach.counter)} sublabel="peuvent la voir en carte « À découvrir »" icon={<MonitorSmartphone className="size-4" />} />
        <StatCard label="Masquée" value={formatNumber(brand.reach.hidden)} sublabel="officines : absente du comptoir, consultable au catalogue" icon={<EyeOff className="size-4" />} />
        <StatCard label="Refusée" value={formatNumber(brand.reach.refused)} sublabel="officines : absente partout chez elles" icon={<Ban className="size-4" />} />
      </Grid>
      {brand.reach.catalog === 0 && <p className="text-[13px] text-text-secondary">Personne ne la voit : {whyInvisible(brand)}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Statut de publication" description="Chaque passage prend effet immédiatement dans les officines." />
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <PublicationBadge status={brand.status} />
              <span className="text-[13px] text-text-secondary">· audience : {AUDIENCE_LABELS[brand.audience]}</span>
            </div>
            <p className="text-[13px] leading-5 text-text-secondary">{publicationEffect("brand", brand.status, brand.pilotPharmacies)}</p>
            <PublicationStatusControl target={{ kind: "brand", id: brand.id }} current={brand.status} name={brand.name} pilotCount={brand.pilotPharmacies} size="md" />
          </CardContent>
        </Card>

        <AudienceEditorCard
          key={`${brand.audience}-${brand.selectedPharmacyIds.join(",")}`}
          brandId={brand.id}
          initialAudience={brand.audience}
          initialSelected={brand.selectedPharmacyIds}
          candidates={candidates}
          pilotCount={brand.pilotPharmacies}
          isTest={brand.status === "TEST" || brand.partner.status === "TEST"}
        />
      </div>

      <RangesCard brandId={brand.id} ranges={brand.ranges} pilotCount={brand.pilotPharmacies} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BrandEditorCard
          key={brand.updatedAt}
          brandId={brand.id}
          partnerName={brand.partner.name}
          initial={{ name: brand.name, slug: brand.slug, brandKey: brand.brandKey, logoUrl: brand.logoUrl, description: brand.description, universes: brand.universes }}
        />
        <DocumentsCard brandId={brand.id} documents={brand.documents} />
      </div>

      <p className="text-[12px] text-text-tertiary">
        Catalogue : {brand.products.total} produit{plural(brand.products.total)} dont {brand.products.active} actif{plural(brand.products.active)}. Les chiffres de diffusion ne comptent que les vraies officines actives, hors démonstration.
      </p>
    </>
  );
}
