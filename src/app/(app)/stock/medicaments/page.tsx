import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, PackageX, ScanLine, Upload } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { stockOverviewCounts } from "@/server/services/catalog";
import {
  getDrugStockSummary,
  listDrugStock,
  resolveScannedInput,
  type DrugCatalogResult,
  type ScanOutcome,
} from "@/server/services/drug-catalog";
import { getReferenceCatalogState } from "@/server/services/reference";
import { referenceAttribution } from "@/core/reference";
import { DRUG_STOCK_STATE_LABELS } from "@/core/stock";
import { PageHeader, Grid } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCents, formatDateTime } from "@/lib/format";
import { StockTabs } from "../stock-tabs";
import { DrugScanField } from "./scan-field";
import { DrugQuantityForm, RemoveDrugStockButton } from "./quantity-form";

export const metadata: Metadata = { title: "Stock — Médicaments" };

const PAGE_SIZE = 30;

/**
 * Le stock médicament de l'officine.
 *
 * Un pharmacien n'a pas à cocher vingt mille références : il scanne ce qui
 * passe au comptoir, ou il colle l'export de son logiciel de stock. Cet écran
 * ne demande donc jamais de créer un médicament — le catalogue national existe
 * déjà. Il demande une seule chose : combien vous en avez.
 */
export default async function DrugStockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.STOCK_VIEW);
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const canAdjust = session.permissions.has(PERMISSIONS.STOCK_ADJUST);
  const canImport = session.permissions.has(PERMISSIONS.PRODUCT_IMPORT);
  const canSeeCatalog = session.permissions.has(PERMISSIONS.PRODUCT_VIEW);
  const pharmacyId = session.scope.pharmacyId;

  const [reference, summary, stock, tabs, outcome] = await Promise.all([
    getReferenceCatalogState(),
    getDrugStockSummary(pharmacyId),
    listDrugStock({ pharmacyId, page, pageSize: PAGE_SIZE }),
    stockOverviewCounts(pharmacyId, canSeeCatalog),
    query ? resolveScannedInput(pharmacyId, query) : Promise.resolve(null),
  ]);

  const catalogLoaded = reference.status === "READY" || reference.status === "STALE";
  const totalPages = Math.max(1, Math.ceil(stock.total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock"
        description="Ce que l'officine détient du catalogue national. Une boîte à zéro reste référencée, mais n'est jamais proposée."
        actions={
          canImport && (
            <Button asChild variant="outline" leadingIcon={<Upload className="size-[18px]" />}>
              <Link href="/stock/medicaments/import">Import en masse</Link>
            </Button>
          )
        }
      />

      <StockTabs
        counts={{
          alerts: tabs.alerts,
          items: tabs.items,
          catalog: tabs.catalog,
          drugs: summary.referenced,
          movements: tabs.movements,
        }}
      />

      {!catalogLoaded ? (
        <Alert tone="warning" title="Le catalogue national n'est pas chargé">
          Sans lui, aucun code-barres ne peut être reconnu : c&apos;est lui qui sait ce qu&apos;est
          la boîte que vous scannez. Chargez-le depuis{" "}
          <Link href="/parametres?onglet=moteur" className="underline">
            Paramètres → Moteur Pharma.ai
          </Link>
          .
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Scanner ou chercher"
              description="Passez la douchette sur une boîte, ou tapez un nom de médicament ou de substance."
              action={<ScanLine className="size-[18px] text-text-tertiary" />}
            />
            <CardContent className="space-y-4">
              <DrugScanField initialQuery={query} />
              {outcome && <ScanAnswer outcome={outcome} canAdjust={canAdjust} />}
            </CardContent>
          </Card>

          <Grid cols={3}>
            <StatCard
              label="Références suivies"
              value={summary.referenced}
              sublabel="dans le catalogue national"
              icon={<Boxes className="size-4" />}
            />
            <StatCard
              label="Réellement en rayon"
              value={summary.inStock}
              sublabel={
                summary.empty > 0 ? `${summary.empty} épuisée(s), non proposées` : "aucune rupture"
              }
              icon={<PackageX className="size-4" />}
              emphasis="brand"
            />
            <StatCard
              label="Sous le seuil"
              value={summary.low}
              sublabel="seuil fixé par l'officine"
              icon={<AlertTriangle className="size-4" />}
            />
          </Grid>

          {/* La licence du catalogue national impose de mentionner la source et
              sa date de mise à jour partout où ses données sont affichées :
              cet écran montre des noms, des compositions et des prix publiés. */}
          <p className="text-[12px] leading-4 text-text-tertiary">
            {referenceAttribution(reference)}
          </p>

          {stock.results.length === 0 ? (
            <EmptyState
              icon={<Boxes className="size-6" />}
              title="Aucun médicament déclaré"
              description="Scannez une boîte ci-dessus, ou importez l'export de votre logiciel de stock : personne ne devrait saisir vingt mille références à la main."
            />
          ) : (
            <>
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>Médicament</TH>
                      <TH>Code CIP13</TH>
                      <TH>État</TH>
                      <TH numeric>En rayon</TH>
                      <TH>Dernier comptage</TH>
                      {canAdjust && <TH />}
                    </TR>
                  </THead>
                  <TBody>
                    {stock.results.map((result) => (
                      <TR key={result.presentationId}>
                        <TD>
                          {/* Certains noms de spécialité dépassent 150 caractères
                              (« AMOXICILLINE/ACIDE CLAVULANIQUE… ADULTES, poudre
                              pour suspension buvable en sachet-dose (rapport… ) »).
                              Sans largeur maximale, cette colonne repousse toutes
                              les autres hors de l'écran. */}
                          <div className="max-w-[22rem] min-w-0">
                            <div className="font-medium text-wrap text-text-primary">
                              {result.specialtyName}
                            </div>
                            <div className="text-[12.5px] text-wrap text-text-tertiary">
                              {result.label}
                            </div>
                          </div>
                        </TD>
                        <TD className="font-mono text-[12.5px] text-text-secondary">
                          {result.cip13}
                        </TD>
                        <TD>
                          <Badge tone={result.state === "IN_STOCK" ? "success" : "warning"}>
                            {DRUG_STOCK_STATE_LABELS[result.state]}
                          </Badge>
                        </TD>
                        <TD numeric className="tabular">
                          {canAdjust ? (
                            <DrugQuantityForm
                              cip13={result.cip13}
                              quantity={result.stock?.quantity ?? 0}
                              alertThreshold={result.stock?.alertThreshold ?? 0}
                              location={result.stock?.location ?? null}
                              compact
                            />
                          ) : (
                            (result.stock?.quantity ?? 0)
                          )}
                        </TD>
                        <TD className="text-text-secondary">
                          {result.stock?.lastCountedAt
                            ? formatDateTime(result.stock.lastCountedAt)
                            : "—"}
                        </TD>
                        {canAdjust && result.stock && (
                          <TD>
                            <RemoveDrugStockButton
                              id={result.stock.id}
                              label={result.specialtyName}
                            />
                          </TD>
                        )}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-[13px] text-text-secondary">
                  <span>
                    Page {page} sur {totalPages} · {stock.total} référence(s)
                  </span>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/stock/medicaments?page=${page - 1}`}>Précédente</Link>
                      </Button>
                    )}
                    {page < totalPages && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/stock/medicaments?page=${page + 1}`}>Suivante</Link>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Ce que le champ unique a compris, et ce qu'on peut en faire. */
function ScanAnswer({ outcome, canAdjust }: { outcome: ScanOutcome; canAdjust: boolean }) {
  switch (outcome.kind) {
    case "DRUG":
      return <DrugCard result={outcome.result} canAdjust={canAdjust} highlight />;

    case "DRUG_UNKNOWN":
      return (
        <Alert tone="warning" title="Ce code n'est pas dans le catalogue national">
          Le code {outcome.cip13} est bien formé mais ne correspond à aucune présentation connue.
          Il s&apos;agit peut-être d&apos;un médicament retiré, ou d&apos;un catalogue à
          resynchroniser. Aucune référence n&apos;est créée à partir d&apos;un code inconnu.
        </Alert>
      );

    case "PRODUCT":
      return (
        <Alert tone="info" title="Produit de l'officine, pas un médicament">
          {outcome.name} — {outcome.quantity} en stock.{" "}
          <Link href={`/stock/${outcome.productId}`} className="underline">
            Ouvrir la fiche
          </Link>
          .
        </Alert>
      );

    case "PRODUCT_UNKNOWN":
      return (
        <Alert tone="info" title="Code-barres hors catalogue médicament">
          {outcome.ean13} n&apos;est pas un code CIP. S&apos;il s&apos;agit d&apos;un produit de
          parapharmacie, il se déclare dans{" "}
          <Link href="/stock?onglet=catalogue" className="underline">
            le catalogue de l&apos;officine
          </Link>
          .
        </Alert>
      );

    case "INVALID":
      return (
        <Alert tone="danger" title="Lecture douteuse">
          {outcome.message}
        </Alert>
      );

    case "TEXT":
      if (outcome.results.length === 0) {
        return (
          <Alert tone="info" title="Aucun résultat">
            Aucun médicament du catalogue national ne correspond. Essayez un nom de substance, ou
            scannez directement la boîte.
          </Alert>
        );
      }
      return (
        <div className="space-y-2">
          {outcome.results.map((result) => (
            <DrugCard key={result.presentationId} result={result} canAdjust={canAdjust} />
          ))}
        </div>
      );
  }
}

function DrugCard({
  result,
  canAdjust,
  highlight,
}: {
  result: DrugCatalogResult;
  canAdjust: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-xl border border-brand-300 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/30"
          : "rounded-xl border border-border-subtle p-4"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text-primary">{result.specialtyName}</span>
            <Badge tone={result.state === "IN_STOCK" ? "success" : "neutral"}>
              {DRUG_STOCK_STATE_LABELS[result.state]}
            </Badge>
            {!result.marketed && <Badge tone="warning">Commercialisation arrêtée</Badge>}
          </div>
          <p className="text-[13px] text-text-secondary">{result.label}</p>
          <p className="text-[12.5px] text-text-tertiary">
            {result.substances.join(", ") || "Composition non renseignée"}
            {result.prescriptionConditions.length > 0 &&
              ` · ${result.prescriptionConditions.join(", ")}`}
          </p>
          <p className="font-mono text-[12px] text-text-tertiary">
            {result.cip13}
            {result.priceCents !== null && ` · ${formatCents(result.priceCents)}`}
            {result.reimbursementRateRaw && ` · remboursé ${result.reimbursementRateRaw}`}
          </p>
        </div>

        {canAdjust && (
          <DrugQuantityForm
            cip13={result.cip13}
            quantity={result.stock?.quantity ?? 0}
            alertThreshold={result.stock?.alertThreshold ?? 0}
            location={result.stock?.location ?? null}
            autoFocus={highlight}
          />
        )}
      </div>
    </div>
  );
}
