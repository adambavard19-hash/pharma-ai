import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { campaignAdmin, campaignStatsDetail, sponsoringTargets } from "@/server/services/mobile/sponsoring-admin";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/page";
import { REGULATORY_CATEGORY_LABELS } from "@/core/discover/visibility";
import { nextCampaignStatuses, SPONSORED_FORMAT_LABELS, SPONSORED_PLACEMENT_LABELS } from "@/core/sponsoring/campaign";
import { isStatPeriod } from "@/core/sponsoring/stats";
import { centsToInput, formatDate, formatDateTime } from "@/lib/format";
import { BillingBadge, CampaignStatusBadge, RegulatoryBadge } from "../_components/labels";
import { CampaignEditor } from "../_components/campaign-editor";
import { DailyImpressions, PeriodChips, StatTiles, StatsTable } from "../_components/stats";
import { BillingForm, CampaignWorkflow, RegulatoryForm } from "./campaign-controls";

export const metadata: Metadata = { title: "Campagne sponsorisée" };

const AUDIENCE_LABELS: Record<string, string> = { ALL: "Tous", NEW_STAFF: "Nouveaux arrivants", STUDENT: "Étudiants", TECHNICIAN: "Préparateurs", PHARMACIST: "Pharmaciens", OWNER: "Titulaires" };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periode?: string }> }) {
  await requirePlatformSession();
  const [{ id }, { periode }] = await Promise.all([params, searchParams]);
  const period = isStatPeriod(periode) ? periode : "tout";
  const campaign = await campaignAdmin(id);
  if (!campaign) notFound();
  const [stats, targets] = await Promise.all([campaignStatsDetail(campaign.id, period), sponsoringTargets()]);
  const editable = campaign.status === "DRAFT" || campaign.status === "REJECTED";
  const target = campaign.launch ? `Nouveauté : ${campaign.launch.title}` : campaign.module ? `Parcours : ${campaign.module.title}` : campaign.brand ? `Fiche de la marque ${campaign.brand.name}` : "—";

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href="/admin/partenaires/campagnes" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Toutes les campagnes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <h1 className="font-bold tracking-[-0.02em] text-text-primary">{campaign.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <CampaignStatusBadge status={campaign.status} />
              <RegulatoryBadge validatedAt={campaign.regulatoryReviewedAt} validatedBy={campaign.regulatoryReviewedBy} />
              <BillingBadge status={campaign.billingStatus} />
            </div>
          </div>
          <CampaignEditor
            targets={targets}
            disabledReason={editable ? null : "Repassez la campagne en brouillon pour modifier son contenu."}
            initial={{
              id: campaign.id,
              partnerId: campaign.partner.id,
              brandId: campaign.brand?.id ?? "",
              launchId: campaign.launch?.id ?? "",
              moduleId: campaign.module?.id ?? "",
              name: campaign.name,
              format: campaign.format,
              placements: campaign.placements,
              audiences: campaign.audiences,
              startsAt: campaign.startsAt.toISOString().slice(0, 10),
              endsAt: campaign.endsAt.toISOString().slice(0, 10),
              regulatoryCategory: campaign.regulatoryCategory ?? "",
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-x-6 gap-y-3 pt-5 text-[13.5px] sm:grid-cols-2">
            <div>
              <p className="text-[12px] text-text-tertiary">Partenaire</p>
              <p className="font-medium">{campaign.partner.name}</p>
            </div>
            <div>
              <p className="text-[12px] text-text-tertiary">Format</p>
              <p className="font-medium">{SPONSORED_FORMAT_LABELS[campaign.format]}</p>
            </div>
            <div>
              <p className="text-[12px] text-text-tertiary">Mis en avant</p>
              <p className="font-medium">{target}</p>
            </div>
            <div>
              <p className="text-[12px] text-text-tertiary">Période</p>
              <p className="font-medium">
                du {formatDate(campaign.startsAt)} au {formatDate(campaign.endsAt)}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-text-tertiary">Emplacements</p>
              <p className="font-medium">{campaign.placements.map((p) => SPONSORED_PLACEMENT_LABELS[p]).join(", ")}</p>
            </div>
            <div>
              <p className="text-[12px] text-text-tertiary">Publics</p>
              <p className="font-medium">{campaign.audiences.length ? campaign.audiences.map((a) => AUDIENCE_LABELS[a] ?? a).join(", ") : "Tous"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-[13px] font-semibold text-text-primary">Étape suivante</p>
            <CampaignWorkflow id={campaign.id} next={nextCampaignStatuses(campaign.status)} />
            <p className="text-[12px] leading-[1.5] text-text-tertiary">Approuver et activer exigent la validation réglementaire. Une campagne active n&apos;est diffusée que pendant sa période.</p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <SectionHeader title="Validation réglementaire" description="Obligatoire avant approbation. Un médicament n'est jamais diffusé sans elle." />
        <Card>
          <CardContent className="space-y-4 pt-5">
            {campaign.regulatoryReviewedAt && campaign.regulatoryReviewedBy ? (
              <div className="space-y-1 text-[13.5px]">
                <p>
                  Validée par <strong>{campaign.regulatoryReviewedBy}</strong> le {formatDateTime(campaign.regulatoryReviewedAt)}
                  {campaign.regulatoryCategory ? ` · ${REGULATORY_CATEGORY_LABELS[campaign.regulatoryCategory]}` : ""}.
                </p>
                {campaign.regulatoryNotes && <p className="whitespace-pre-line text-text-secondary">{campaign.regulatoryNotes}</p>}
              </div>
            ) : (
              <RegulatoryForm id={campaign.id} category={campaign.regulatoryCategory} canValidate={campaign.status === "DRAFT" || campaign.status === "IN_REVIEW"} />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Devis et facturation" description="Montants saisis par l'équipe PharmaBoost. Aucun tarif par défaut." />
        <Card>
          <CardContent className="space-y-3 pt-5">
            {campaign.paidAt && <p className="text-[13px] text-success-700">Payée le {formatDate(campaign.paidAt)}.</p>}
            <BillingForm
              id={campaign.id}
              initial={{
                billingStatus: campaign.billingStatus,
                priceNote: campaign.priceNote ?? "",
                budget: campaign.budgetCents !== null ? centsToInput(campaign.budgetCents) : "",
                billed: campaign.billedCents !== null ? centsToInput(campaign.billedCents) : "",
                billingReference: campaign.billingReference ?? "",
                contractReference: campaign.contractReference ?? "",
              }}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Résultats" description="Agrégats par jour et emplacement : aucune personne n'est identifiable." action={<PeriodChips basePath={`/admin/partenaires/campagnes/${campaign.id}`} current={period} />} />
        <StatTiles totals={stats.totals} />
        <Card>
          <CardContent className="pt-5">
            <DailyImpressions days={stats.byDay} />
          </CardContent>
        </Card>
        <StatsTable firstColumn="Emplacement" rows={stats.byPlacement.map((row) => ({ key: row.placement, label: SPONSORED_PLACEMENT_LABELS[row.placement], totals: row.totals }))} empty="Aucun chiffre sur la période." />
        <StatsTable firstColumn="Jour" rows={stats.byDay.map((row) => ({ key: row.day.toISOString(), label: formatDate(row.day), totals: row.totals }))} empty="Aucun chiffre sur la période." />
      </section>
    </div>
  );
}
