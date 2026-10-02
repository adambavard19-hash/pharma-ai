import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Hourglass, Package, Pill } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listLots } from "@/server/services/stock-lots";
import type { ExpiryLevel } from "@/core/stock/expiry";
import { describeDaysLeft, formatExpiry } from "@/core/stock/expiry-input";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PatientSearchBar } from "../../patients/search-bar";
import { ExpiryLevelBadge } from "./level-badge";
import { AddLotButton } from "./lot-form";
import { LotRowActions } from "./lot-actions";
import { ThresholdsForm } from "./thresholds-form";

export const metadata: Metadata = { title: "Dates courtes" };

const FILTERS: { key: string; label: string; level: ExpiryLevel | null }[] = [
  { key: "tous", label: "Tous", level: null },
  { key: "expire", label: "Expiré", level: "EXPIRED" },
  { key: "urgent", label: "Urgent", level: "URGENT" },
  { key: "bientot", label: "Bientôt", level: "SOON" },
];

/**
 * Les dates courtes de l'officine, lot par lot.
 *
 * Une question, une liste : quelles boîtes approchent de leur date, et
 * lesquelles faut-il sortir maintenant ? Les lots se saisissent à la main
 * (aucune source automatique n'existe aujourd'hui : l'édition d'inventaire
 * LGPI ne contient pas de dates). Suivre un lot ne change jamais la quantité
 * du stock.
 */
export default async function ShortDatesPage({ searchParams }: { searchParams: Promise<{ niveau?: string | string[]; q?: string | string[] }> }) {
  const session = await requirePermission(PERMISSIONS.STOCK_VIEW);
  const params = await searchParams;
  // Un paramètre répété (« ?q=a&q=b ») arrive en tableau : on ne garde que le premier.
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const filter = FILTERS.find((item) => item.key === first(params.niveau)) ?? FILTERS[0];
  const query = first(params.q).trim().slice(0, 80);
  const canAdjust = session.permissions.has(PERMISSIONS.STOCK_ADJUST);
  const canSetThresholds = session.permissions.has(PERMISSIONS.SETTINGS_MANAGE);

  const { lots, counts, thresholds, today, truncated } = await listLots(session.scope, { level: filter.level, query });
  const countOf = (level: ExpiryLevel | null) => (level ? counts[level] : counts.ALL);

  const href = (key: string) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (key !== "tous") search.set("niveau", key);
    const text = search.toString();
    return `/stock/dates-courtes${text ? `?${text}` : ""}`;
  };

  const nothingTracked = counts.ALL === 0 && !query;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Retour au stock</Link>
      </Button>

      <PageHeader
        title="Dates courtes"
        description="Les boîtes qui approchent de leur date de péremption, lot par lot. Suivre un lot ne change jamais la quantité du stock : votre logiciel de gestion reste la référence."
        actions={canAdjust ? <AddLotButton today={today} thresholds={thresholds} /> : undefined}
      />

      {nothingTracked ? (
        <Card>
          <EmptyState
            icon={<Hourglass className="size-5" />}
            title="Aucun lot suivi pour l'instant"
            description="Repérez une boîte proche de sa date, en rayon ou à la réception, et saisissez sa date telle qu'elle est imprimée. Elle apparaîtra ici, classée par urgence."
            action={canAdjust ? <AddLotButton today={today} thresholds={thresholds} label="Ajouter un premier lot" /> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((item) => {
                const count = countOf(item.level);
                const alert = (item.level === "EXPIRED" || item.level === "URGENT") && count > 0;
                return (
                  <Link
                    key={item.key}
                    href={href(item.key)}
                    scroll={false}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                      filter.key === item.key
                        ? "border-brand-600 bg-brand-600 text-white"
                        : alert
                          ? "border-danger-200 text-danger-700 hover:border-danger-300"
                          : "border-border-default text-text-secondary hover:border-border-strong",
                    )}
                  >
                    {item.label} <span className="tabular opacity-80">{count}</span>
                  </Link>
                );
              })}
            </div>
            <div className="ml-auto w-full sm:w-auto sm:min-w-[280px]">
              <PatientSearchBar initialQuery={query} basePath="/stock/dates-courtes" placeholder="Rechercher un produit ou un lot…" />
            </div>
          </div>
          <p className="text-[12.5px] text-text-tertiary">
            Urgent : à {thresholds.urgentDays} jours ou moins · Bientôt : à {thresholds.soonDays} jours ou moins · Expiré : date dépassée.
          </p>

          {lots.length === 0 ? (
            <Card>
              <p className="px-4 py-8 text-center text-[13.5px] text-text-secondary">
                {query ? "Aucun lot ne correspond à cette recherche." : "Aucun lot dans cette catégorie."}
              </p>
            </Card>
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Produit</TH>
                    <TH>Lot</TH>
                    <TH numeric>Quantité</TH>
                    <TH>Péremption</TH>
                    <TH>Restant</TH>
                    <TH>Niveau</TH>
                    {canAdjust && <TH className="text-right">Actions</TH>}
                  </TR>
                </THead>
                <TBody>
                  {lots.map((lot) => (
                    <TR key={lot.id}>
                      <TD className="max-w-[340px]">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-tertiary">
                            {lot.kind === "DRUG" ? <Pill className="size-4" /> : <Package className="size-4" />}
                          </span>
                          <span className="min-w-0">
                            {lot.href ? (
                              <Link href={lot.href} className="block truncate text-[14px] font-medium text-text-primary hover:underline">
                                {lot.label}
                              </Link>
                            ) : (
                              <span className="block truncate text-[14px] font-medium text-text-primary">{lot.label}</span>
                            )}
                            {lot.detail && <span className="block truncate text-[12px] text-text-tertiary">{lot.detail}</span>}
                          </span>
                        </div>
                      </TD>
                      <TD className="text-text-secondary">{lot.lotNumber ?? "—"}</TD>
                      <TD numeric>{lot.quantity ?? "—"}</TD>
                      <TD className="tabular">{formatExpiry(lot.expiresOn, lot.precision)}</TD>
                      <TD className={cn("whitespace-nowrap tabular", lot.level === "EXPIRED" ? "text-danger-700" : "text-text-secondary")}>{describeDaysLeft(lot.daysLeft)}</TD>
                      <TD>
                        <ExpiryLevelBadge level={lot.level} />
                      </TD>
                      {canAdjust && (
                        <TD>
                          <LotRowActions lot={lot} today={today} thresholds={thresholds} />
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
          {truncated && (
            <p className="flex items-center gap-2 text-[12.5px] text-warning-700">
              <AlertTriangle className="size-3.5" /> Seuls les 1 000 lots les plus proches sont affichés : affinez par une recherche.
            </p>
          )}
        </div>
      )}

      <Card>
        <CardHeader
          title="Seuils d'alerte"
          description="À partir de combien de jours une date devient « bientôt », puis « urgente ». Ils valent pour toute l'officine."
        />
        <CardContent>
          {canSetThresholds ? (
            <ThresholdsForm key={`${thresholds.soonDays}-${thresholds.urgentDays}`} thresholds={thresholds} />
          ) : (
            <p className="text-[13.5px] text-text-secondary">
              Bientôt à {thresholds.soonDays} jours ou moins · urgent à {thresholds.urgentDays} jours ou moins. Le titulaire les règle.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-[12.5px] text-text-tertiary">
        Source des dates : saisie manuelle. Import LGPI des péremptions : non connecté (l&apos;édition d&apos;inventaire LGPI ne contient pas de dates). Lecture du Datamatrix à la douchette : non connectée.
      </p>
    </div>
  );
}
