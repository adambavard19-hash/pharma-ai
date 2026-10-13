import type { Metadata } from "next";
import Link from "next/link";
import { Handshake, PackageSearch } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadAssortment } from "@/server/services/assortment-gaps";
import { GAP_CAUSE_LABELS, GAP_PERIODS, resolveGapPeriod, type GapCause } from "@/core/assortment/gaps";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SuggestLabForm } from "./suggest-lab-form";

export const metadata: Metadata = { title: "Produits manquants" };

/**
 * « Produits manquants » (ex « Mon assortiment », que personne ne comprenait) : les
 * conseils que PharmaBoost aurait proposés mais que le stock n'a pas pu servir — produit
 * absent ou en rupture —, et ce qui existe chez les laboratoires partenaires.
 *
 * Réservé au TITULAIRE (permission des partenaires : c'est une décision d'achat).
 * Ce n'est volontairement pas dans l'écran de l'équipe : à la fin de la journée,
 * le titulaire consulte, sans compter sur une remontée du comptoir. Rien ici ne
 * touche aux conseils du moteur.
 */
export default async function AssortmentPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const session = await requirePermission(PERMISSIONS.PARTNERS_MANAGE);
  const period = resolveGapPeriod((await searchParams).periode);
  const view = await loadAssortment(session.scope, period.days);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produits manquants"
        description="Les conseils que PharmaBoost aurait proposés à vos patients, mais que votre stock n'a pas pu servir : aucun produit adapté, ou en rupture. Ce sont les produits à référencer (ou à recommander) en priorité."
        actions={
          <nav className="flex items-center gap-1" aria-label="Période">
            {GAP_PERIODS.map((p) => (
              <Link key={p.key} href={`/assortiment?periode=${p.key}`} aria-current={p.key === period.key ? "page" : undefined} className={cn("rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors", p.key === period.key ? "bg-brand-700 text-white" : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary")}>
                {p.label}
              </Link>
            ))}
          </nav>
        }
      />

      <Alert tone="info">
        Cette page est réservée au titulaire : l&apos;équipe au comptoir ne la voit pas. Elle vient des analyses d&apos;ordonnance des {period.label === "3 mois" ? "3 derniers mois" : `${period.days} derniers jours`}, à partir de votre stock du moment.
      </Alert>

      {view.analysedPrescriptions === 0 ? (
        <Card>
          <EmptyState icon={<PackageSearch className="size-5" />} title="Aucune vente analysée sur cette période." description="Dès que l'équipe passera des ventes au comptoir, vous verrez ici les conseils que votre stock n'a pas pu servir." />
        </Card>
      ) : view.detected === 0 ? (
        <Card>
          <EmptyState
            icon={<PackageSearch className="size-5" />}
            title="Pas encore assez d'information sur cette période."
            description={`${view.analysedPrescriptions} ordonnance${view.analysedPrescriptions > 1 ? "s" : ""} analysée${view.analysedPrescriptions > 1 ? "s" : ""}, mais aucune ne porte encore l'information de couverture du stock : elle s'enregistre à chaque nouvelle analyse.`}
          />
        </Card>
      ) : (
        <>
          <section aria-label="Les chiffres de la période" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi label="Conseils possibles" value={String(view.detected)} hint={`sur ${view.analysedPrescriptions} ordonnance${view.analysedPrescriptions > 1 ? "s" : ""} analysée${view.analysedPrescriptions > 1 ? "s" : ""}`} />
            <Kpi label="Servis par votre stock" value={view.coveredRate === null ? "—" : `${view.coveredRate} %`} hint={`${view.covered} situation${view.covered > 1 ? "s" : ""}`} />
            <Kpi label="Manqués faute de produit" value={String(view.unmet)} hint="aucun produit adapté en stock, ou en rupture" tone={view.unmet > 0 ? "warning" : "success"} />
          </section>
          {view.withoutCoverage > 0 && <p className="text-[12.5px] text-text-tertiary">{view.withoutCoverage} analyse{view.withoutCoverage > 1 ? "s" : ""} de la période (antérieure{view.withoutCoverage > 1 ? "s" : ""} à cette fonction) ne portent pas l&apos;information et ne sont pas comptées.</p>}

          <section className="space-y-3" aria-labelledby="manques">
            <SectionHeader title="Ce qui vous a manqué" description="Du conseil le plus souvent manqué au moins fréquent, avec la raison : rien d'adapté en stock, ou en rupture." />
            {view.groups.length === 0 ? (
              <Card>
                <EmptyState icon={<Handshake className="size-5" />} title="Aucun conseil manqué sur cette période." description="Votre stock a pu servir chaque conseil proposé par PharmaBoost : rien à référencer." />
              </Card>
            ) : (
              <ul id="manques" className="space-y-3">
                {view.groups.map((gap) => (
                  <li key={gap.key}>
                    <Card>
                      <CardContent className="space-y-3 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-[15px] font-semibold text-text-primary">{gap.title}</h3>
                          <span className="text-[13px] font-medium text-text-secondary tabular-nums">{gap.count} fois</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.keys(GAP_CAUSE_LABELS) as GapCause[]).filter((cause) => gap.causes[cause] > 0).map((cause) => (
                            <Badge key={cause} tone={cause === "OUT_OF_STOCK" ? "warning" : "neutral"}>{GAP_CAUSE_LABELS[cause]} · {gap.causes[cause]}</Badge>
                          ))}
                        </div>
                        {gap.market.length > 0 ? (
                          <div className="rounded-xl bg-surface-sunken/60 px-4 py-3">
                            <p className="text-[12px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">Chez nos partenaires, que vous ne référencez pas encore</p>
                            <ul className="mt-2 flex flex-wrap gap-2">
                              {gap.market.map((brand) => (
                                <li key={brand.id}>
                                  <Link href={`/partenaires/${brand.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-card px-3 py-1 text-[13px] font-medium text-text-primary hover:border-brand-400">
                                    {brand.name}
                                    <span className="text-text-tertiary">· {brand.partnerName}</span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-[13px] text-text-secondary">Aucun laboratoire partenaire de PharmaBoost ne répond encore à ce besoin pour votre officine.</p>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="space-y-3" aria-labelledby="suggerer">
        <SectionHeader title="Un laboratoire manque ?" description="Signalez-le à PharmaBoost : nous étudions un partenariat avec les laboratoires qui répondent à vos besoins et ne sont pas encore référencés." />
        <Card>
          <CardContent className="py-4">
            <SuggestLabForm />
          </CardContent>
        </Card>
        <p className="text-xs text-text-tertiary">Depuis le {formatDate(view.since.toISOString())}. {view.groups.length > 0 ? "Aucune donnée patient n'apparaît sur cette page." : ""}</p>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint: string; tone?: "neutral" | "warning" | "success" }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3.5">
      <p className="text-[12px] font-medium text-text-secondary">{label}</p>
      <p className={cn("mt-1 text-[28px] leading-8 font-semibold tabular-nums tracking-[-0.02em]", tone === "warning" ? "text-warning-700 dark:text-warning-400" : tone === "success" ? "text-success-700 dark:text-success-500" : "text-text-primary")}>{value}</p>
      <p className="mt-0.5 text-[12px] text-text-tertiary">{hint}</p>
    </div>
  );
}
