import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getReferenceCatalogState } from "@/server/services/reference";
import { BDPM_SOURCE, referenceAttribution } from "@/core/reference";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { formatCents, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Fiche médicament" };

/**
 * La fiche d'un médicament du catalogue national.
 *
 * Uniquement ce que la source publie, avec sa provenance et sa date : nom,
 * forme, voies, substances et dosages, conditions de prescription, boîtes
 * (CIP, prix), groupe générique, avis de la HAS. Rien n'est rédigé ici.
 *
 * Ce que la BDPM ne contient PAS — et que cette fiche ne prétend donc pas
 * connaître : les interactions, les contre-indications détaillées, la
 * posologie. Ces informations sont dans le RCP publié par l'ANSM, accessible
 * par le lien officiel en bas de page.
 */
export default async function DrugSheetPage({ params }: { params: Promise<{ cis: string }> }) {
  const { cis } = await params;
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VIEW);

  const [specialty, state] = await Promise.all([
    prisma.drugSpecialty.findUnique({
      where: { cisCode: cis },
      include: {
        compositions: { orderBy: { nature: "asc" }, select: { element: true, substanceLabel: true, dosage: true, dosageReference: true, nature: true } },
        prescriptionConditions: { select: { label: true } },
        presentations: { orderBy: { cip13: "asc" }, select: { cip13: true, label: true, marketingStatus: true, priceCents: true, totalPriceCents: true, reimbursementRateRaw: true, withdrawnAt: true } },
        genericMemberships: { include: { group: { select: { label: true } } } },
        smrOpinions: { orderBy: { opinionDate: "desc" }, take: 5, select: { value: true, label: true, opinionDate: true, evaluationType: true } },
      },
    }),
    getReferenceCatalogState(),
  ]);
  if (!specialty) notFound();

  const stocks = await prisma.pharmacyDrugStock.findMany({
    where: { pharmacyId: session.scope.pharmacyId, presentation: { specialtyId: specialty.id } },
    select: { quantity: true, presentation: { select: { cip13: true } } },
  });
  const stockByCip = new Map(stocks.map((s) => [s.presentation.cip13, s.quantity]));
  const active = specialty.compositions.filter((c) => c.nature === "SA");
  const officialPage = `https://base-donnees-publique.medicaments.gouv.fr/extrait.php?specid=${specialty.cisCode}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Retour</Link>
      </Button>
      <PageHeader
        title={specialty.name}
        description={[specialty.pharmaceuticalForm, specialty.administrationRoutes.join(", ")].filter(Boolean).join(" · ")}
      />
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={specialty.marketingStatus === "Commercialisée" ? "success" : "warning"}>{specialty.marketingStatus ?? "Statut inconnu"}</Badge>
        {specialty.withdrawnAt && <Badge tone="danger">Retirée de la source le {formatDate(specialty.withdrawnAt)}</Badge>}
        {specialty.enhancedMonitoring && <Badge tone="warning">Surveillance renforcée</Badge>}
        <Badge tone="neutral">CIS {specialty.cisCode}</Badge>
      </div>

      <Card>
        <CardHeader title="Composition" description="Substances actives telles que publiées, avec leur dosage par unité de prise." />
        <CardContent className="pt-0">
          <ul className="divide-y divide-border-subtle">
            {active.map((c, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-3 py-2 text-[14px]">
                <span className="font-medium text-text-primary">{c.substanceLabel}</span>
                <span className="text-text-secondary">{c.dosage ?? "dosage non publié"}{c.dosageReference ? ` ${c.dosageReference}` : ""}</span>
                <span className="text-[12.5px] text-text-tertiary">{c.element}</span>
              </li>
            ))}
            {active.length === 0 && <li className="py-2 text-[13.5px] text-text-secondary">Composition non publiée par la source.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Prescription et délivrance" />
        <CardContent className="pt-0 text-[14px] text-text-secondary">
          {specialty.prescriptionConditions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {specialty.prescriptionConditions.map((c) => (
                <li key={c.label}>{c.label}</li>
              ))}
            </ul>
          ) : (
            <p>Aucune condition particulière publiée : médicament non listé.</p>
          )}
          {specialty.genericMemberships.length > 0 && (
            <p className="mt-3">
              <span className="font-medium text-text-primary">Groupe générique : </span>
              {specialty.genericMemberships.map((m) => m.group.label).join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Présentations" description="Les boîtes, avec le prix public et ce que votre officine en détient." />
        <CardContent className="pt-0">
          <ul className="divide-y divide-border-subtle">
            {specialty.presentations.map((p) => (
              <li key={p.cip13} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13.5px]">
                <span className="min-w-0 flex-1 text-text-primary">{p.label}</span>
                <span className="font-mono text-[12px] text-text-tertiary">CIP {p.cip13}</span>
                <span className="text-text-secondary">{p.priceCents !== null ? formatCents(p.totalPriceCents ?? p.priceCents) : "prix libre"}{p.reimbursementRateRaw ? ` · ${p.reimbursementRateRaw}` : ""}</span>
                <Badge tone={stockByCip.has(p.cip13) ? ((stockByCip.get(p.cip13) ?? 0) > 0 ? "success" : "warning") : "neutral"}>
                  {stockByCip.has(p.cip13) ? `${stockByCip.get(p.cip13)} en stock` : "non suivi"}
                </Badge>
                {p.marketingStatus !== "Déclaration de commercialisation" && <Badge tone="warning">{p.marketingStatus ?? "statut inconnu"}</Badge>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {specialty.smrOpinions.length > 0 && (
        <Card>
          <CardHeader title="Avis de la Haute Autorité de santé" description="Service médical rendu, tel que publié dans la source." />
          <CardContent className="pt-0">
            <ul className="divide-y divide-border-subtle text-[13.5px]">
              {specialty.smrOpinions.map((o, index) => (
                <li key={index} className="py-2">
                  <p className="text-text-primary">
                    <span className="font-medium">{o.value ?? "SMR"}</span>
                    {o.opinionDate ? ` · ${formatDate(o.opinionDate)}` : ""}
                    {o.evaluationType ? ` · ${o.evaluationType}` : ""}
                  </p>
                  {o.label && <p className="mt-0.5 text-[13px] leading-5 text-text-secondary">{o.label}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Alert tone="neutral" title="Ce que cette fiche ne contient pas">
        Les interactions, contre-indications et posologies ne sont pas publiées dans la base de données publique des médicaments. Elles
        figurent dans le résumé des caractéristiques du produit (RCP), consultable sur la page officielle.{" "}
        <a href={officialPage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
          Ouvrir la fiche officielle <ExternalLink className="size-3.5" />
        </a>
      </Alert>

      <p className="text-[12px] leading-5 text-text-tertiary">
        {referenceAttribution(state)} Dernière lecture de la source par PharmaBoost :{" "}
        {state.status === "READY" || state.status === "STALE" ? formatDate(state.importedAt) : "—"}. Page source : {BDPM_SOURCE.url}
      </p>
    </div>
  );
}
