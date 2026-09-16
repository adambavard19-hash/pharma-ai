import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { normalizeSearchText } from "@/core/reference";
import { BDM_IT_SOURCE } from "@/core/regulation/bdm-it";
import { evaluateRegulation, requiresAttention, type RegulationAlert } from "@/core/regulation/rules";
import { getCoverageSyncState, listRecentRegulationChanges, loadCoverageBySpecialty } from "@/server/services/regulation";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Réglementation" };

/**
 * L'onglet Réglementation.
 *
 * Trois choses, dans l'ordre où le pharmacien en a besoin : chercher un
 * médicament pour savoir ce qu'il impose (support d'ordonnance, document,
 * durée) ; les dernières évolutions constatées entre deux synchronisations
 * des sources ; et d'où viennent ces informations, avec leur date.
 *
 * Rien n'est rédigé de mémoire : les conditions viennent de l'ANSM, le statut
 * de médicament d'exception de l'Assurance Maladie. Quand une source n'a pas
 * encore été lue pour un médicament, l'écran le dit au lieu de se taire.
 */

const CHANGE_LABELS = {
  EXCEPTION_STATUS: "Statut « médicament d'exception »",
  COVERAGE_END: "Fin de prise en charge",
  CONDITION_ADDED: "Nouvelle condition de prescription",
  CONDITION_REMOVED: "Condition de prescription retirée",
} as const;

const SEVERITY_TONE = { BLOCKING: "danger", CHECK: "warning", INFO: "neutral" } as const;

type SearchHit = {
  cisCode: string;
  name: string;
  form: string | null;
  marketed: boolean;
  covered: boolean;
  alerts: RegulationAlert[];
};

async function searchSpecialties(query: string): Promise<SearchHit[]> {
  const needle = normalizeSearchText(query);
  if (needle.length < 2) return [];
  const isCip = /^\d{13}$/.test(query.trim());
  const rows = await prisma.drugSpecialty.findMany({
    where: isCip
      ? { presentations: { some: { cip13: query.trim() } } }
      : { withdrawnAt: null, OR: [{ searchName: { contains: needle } }, { name: { contains: query.trim(), mode: "insensitive" } }] },
    select: { id: true, cisCode: true, name: true, pharmaceuticalForm: true, marketingStatus: true, prescriptionConditions: { select: { label: true } } },
    orderBy: [{ marketingStatus: "asc" }, { name: "asc" }],
    take: 12,
  });
  const coverage = await loadCoverageBySpecialty(rows.map((row) => row.id));
  const today = new Date();
  return rows.map((row) => ({
    cisCode: row.cisCode,
    name: row.name,
    form: row.pharmaceuticalForm,
    marketed: row.marketingStatus === "Commercialisée",
    covered: coverage.has(row.id),
    alerts: evaluateRegulation({ conditions: row.prescriptionConditions.map((c) => c.label), coverage: coverage.get(row.id) ?? null, durationDays: null, today }),
  }));
}

export default async function RegulationPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission(PERMISSIONS.PRESCRIPTION_VIEW);
  const { q = "" } = await searchParams;
  const [hits, changes, sync] = await Promise.all([searchSpecialties(q), listRecentRegulationChanges(40), getCoverageSyncState()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Réglementation" description="Ce qu'un médicament impose avant d'être facturé : ordonnance d'exception, ordonnance sécurisée, prescription restreinte, durée. Et ce qui a changé récemment." />

      <form action="/reglementation" method="get" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" />
          <Input name="q" defaultValue={q} placeholder="Nom du médicament ou code CIP…" className="pl-9" aria-label="Rechercher un médicament" autoFocus />
        </div>
        <Button type="submit" variant="primary">Chercher</Button>
      </form>

      {q && (
        <section className="space-y-3">
          <SectionHeader title={`Résultats pour « ${q} »`} description={hits.length === 0 ? "Aucun médicament du catalogue national ne correspond." : `${hits.length} spécialité${hits.length > 1 ? "s" : ""}, les alertes de chacune.`} />
          <ul className="space-y-3">
            {hits.map((hit) => (
              <li key={hit.cisCode}>
                <Card>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/medicaments/${hit.cisCode}`} className="text-[14.5px] font-semibold text-text-primary hover:underline">{hit.name}</Link>
                      {hit.form && <span className="text-[12.5px] text-text-tertiary">{hit.form}</span>}
                      {!hit.marketed && <Badge tone="warning">Non commercialisée</Badge>}
                      {!hit.covered && <Badge tone="neutral">Base tarifaire non lue</Badge>}
                      {hit.alerts.length === 0 && <Badge tone="success">Aucune condition particulière publiée</Badge>}
                    </div>
                    {hit.alerts.length > 0 && (
                      <ul className="space-y-1.5">
                        {hit.alerts.map((alert, index) => (
                          <li key={`${alert.code}-${index}`} className="flex flex-wrap items-start gap-2 text-[13px] leading-5">
                            <Badge tone={SEVERITY_TONE[alert.severity]}>{alert.severity === "BLOCKING" ? "Rejet sans cela" : alert.severity === "CHECK" ? "À vérifier" : "Bon à savoir"}</Badge>
                            <span className="min-w-0 flex-1">
                              <span className="font-medium text-text-primary">{alert.title}</span>
                              <span className="text-text-secondary"> — {alert.action}</span>
                              {alert.basis && <span className="block text-[12.5px] italic text-text-tertiary">« {alert.basis} »</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {requiresAttention(hit.alerts) && (
                      <p className="text-[12px] text-text-tertiary">Sur une ordonnance, ces points s&apos;affichent dans l&apos;écran de vente avec une case « Vérifié ».</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Dernières évolutions" description="Ce qui a changé dans les sources entre deux synchronisations : statut d'exception, fin de prise en charge, condition de prescription ajoutée ou retirée." />
          <CardContent className="pt-0">
            {changes.length === 0 ? (
              <p className="text-[13.5px] leading-5 text-text-secondary">
                Aucune évolution constatée pour l&apos;instant. Le journal se remplit à chaque nouvelle lecture des sources : un statut qui bascule, une condition qui apparaît, une fin de prise en charge annoncée.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {changes.map((change) => (
                  <li key={change.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-[13.5px]">
                    <span className="w-24 shrink-0 text-[12.5px] text-text-tertiary">{formatDate(change.detectedAt)}</span>
                    <span className="min-w-0 flex-1">
                      {change.cisCode ? (
                        <Link href={`/medicaments/${change.cisCode}`} className="font-medium text-text-primary hover:underline">{change.drugName}</Link>
                      ) : (
                        <span className="font-medium text-text-primary">{change.drugName}</span>
                      )}
                      <span className="text-text-secondary"> · {CHANGE_LABELS[change.kind]}</span>
                      {(change.before || change.after) && (
                        <span className="block text-[12.5px] text-text-secondary">
                          {change.before ? `avant : ${change.before}` : ""}{change.before && change.after ? " → " : ""}{change.after ? `après : ${change.after}` : ""}
                        </span>
                      )}
                      <span className="block text-[11.5px] text-text-tertiary">{change.sourceName}{change.sourceDate ? ` · version du ${formatDate(change.sourceDate)}` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Sources" />
            <CardContent className="space-y-3 pt-0 text-[13px] leading-5 text-text-secondary">
              <p>
                <a href="https://base-donnees-publique.medicaments.gouv.fr" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-text-primary hover:underline">
                  Base de données publique des médicaments <ExternalLink className="size-3" />
                </a>
                <span className="block">Conditions de prescription et de délivrance publiées par l&apos;ANSM, reprises mot pour mot.</span>
              </p>
              <p>
                <a href={BDM_IT_SOURCE.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-text-primary hover:underline">
                  Base des médicaments et informations tarifaires <ExternalLink className="size-3" />
                </a>
                <span className="block">Assurance Maladie : statut de médicament d&apos;exception et homologation aux assurés sociaux, boîte par boîte.</span>
                <span className="block text-[12.5px] text-text-tertiary">
                  {sync.statuses === 0
                    ? "Pas encore lue."
                    : `${sync.statuses} boîtes lues, ${sync.exceptions} médicaments d'exception · version ${sync.sourceVersion ?? "?"} du ${formatDate(sync.sourceUpdatedAt)} · lue le ${formatDateTime(sync.checkedAt)}`}
                </span>
              </p>
              <p>
                <a href="https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006072665/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-text-primary hover:underline">
                  Code de la santé publique <ExternalLink className="size-3" />
                </a>
                <span className="block">Stupéfiants et assimilés (R. 5132-5 et suivants), listes I et II (R. 5132-21, R. 5132-22), prescription restreinte (R. 5121-77 et suivants).</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Les supports d'ordonnance" />
            <CardContent className="space-y-2 pt-0 text-[13px] leading-5 text-text-secondary">
              <p><span className="font-medium text-text-primary">Ordonnance de médicaments d&apos;exception</span> — formulaire à 4 volets (Cerfa 12708*02, volet 1 à l&apos;assuré, deux aux caisses, un au pharmacien). Exigée pour les médicaments au statut d&apos;exception ; sinon, rejet. Le prescripteur y atteste la conformité à la fiche d&apos;information thérapeutique de la HAS ; le pharmacien complète sa partie (identification, mentions obligatoires, date de délivrance).</p>
              <p><span className="font-medium text-text-primary">Ordonnance sécurisée</span> — papier filigrané, numéro de lot, carré de microlettres. Exigée pour les stupéfiants et les médicaments dont la condition publiée l&apos;impose.</p>
              <p><span className="font-medium text-text-primary">Ordonnance ordinaire</span> — pour le reste, avec les règles des listes I et II.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
