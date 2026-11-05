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
import { formatCents, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PatientSearchBar } from "../../patients/search-bar";
import { ExpiryLevelBadge } from "./level-badge";
import { AddLotButton } from "./lot-form";
import { LotRowActions } from "./lot-actions";
import { ThresholdsForm } from "./thresholds-form";

export const metadata: Metadata = { title: "Dates courtes" };

const FILTERS: { key: string; label: string; level: ExpiryLevel | null }[] = [
  { key: "tous", label: "Tous", level: null },
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
  // « Mon stock » est l'espace du titulaire : le reste de l'équipe arrive ici par son propre onglet « Dates courtes ».
  const canSeeStock = session.permissions.has(PERMISSIONS.MANAGEMENT_MENU);

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
      {canSeeStock && (
        <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
          <Link href="/stock">Retour au stock</Link>
        </Button>
      )}

      <PageHeader
        title="Dates courtes"
        description="Les boîtes qui approchent de leur date de péremption. Scannez une boîte et dites combien il y en a : à la date, le produit sort de la liste tout seul. Le stock de votre logiciel de gestion n'est jamais modifié."
        actions={canAdjust ? <AddLotButton today={today} thresholds={thresholds} label="Scanner un produit" /> : undefined}
      />

      {nothingTracked ? (
        <Card>
          <EmptyState
            icon={<Hourglass className="size-5" />}
            title="Aucune date courte pour l'instant"
            description="Repérez une boîte proche de sa date, en rayon ou à la réception : scannez-la à la douchette et indiquez le nombre de boîtes. Elle apparaîtra ici, classée par urgence, et PharmaBoost la proposera en priorité au comptoir."
            action={canAdjust ? <AddLotButton today={today} thresholds={thresholds} label="Scanner un premier produit" /> : undefined}
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
                        ? "border-brand-700 bg-brand-700 text-white"
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
            Urgent : à {thresholds.urgentDays} jours ou moins · Bientôt : à {thresholds.soonDays} jours ou moins · Le jour de la date, le produit sort de la liste tout seul.
          </p>

          {lots.length === 0 ? (
            <Card>
              <p className="px-4 py-8 text-center text-[13.5px] text-text-secondary">
                {query ? "Aucun lot ne correspond à cette recherche." : "Aucun lot dans cette catégorie."}
              </p>
            </Card>
          ) : (
            // Une carte par lot, comme les campagnes de Surstock (fondateur, 5 nov. 2026) : l'argent encore en rayon, et la
            // barre du temps écoulé entre le jour où le lot a été repéré et sa date de péremption.
            <ul className="grid gap-3 lg:grid-cols-2">
              {lots.map((lot) => {
                const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
                const span = Math.max(1, day(lot.expiresOn) - day(lot.trackedSince));
                const percent = Math.min(100, Math.max(0, Math.round(((span - Math.max(0, lot.daysLeft) * 86_400_000) / span) * 100)));
                const bar = lot.level === "EXPIRED" || lot.level === "URGENT" ? "bg-danger-600" : lot.level === "SOON" ? "bg-warning-500" : "bg-brand-600";
                return (
                  <li key={lot.id}>
                    <Card className="h-full">
                      <CardContent className="flex h-full flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-text-tertiary">
                              {lot.kind === "DRUG" ? <Pill className="size-4" /> : <Package className="size-4" />}
                            </span>
                            <div className="min-w-0">
                              <ExpiryLevelBadge level={lot.level} />
                              {lot.href ? (
                                <Link href={lot.href} className="mt-1.5 block text-[15px] leading-5 font-semibold text-text-primary hover:underline">
                                  {lot.label}
                                </Link>
                              ) : (
                                <p className="mt-1.5 text-[15px] leading-5 font-semibold text-text-primary">{lot.label}</p>
                              )}
                              {lot.detail && <p className="truncate text-[12.5px] text-text-tertiary">{lot.detail}</p>}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[11px] text-text-tertiary">{lot.valueCents !== null ? "Encore en rayon" : "Boîtes"}</p>
                            <p className={cn("text-[16px] font-semibold tabular-nums", lot.level === "EXPIRED" || lot.level === "URGENT" ? "text-danger-700" : "text-warning-700")}>
                              {lot.valueCents !== null ? formatCents(lot.valueCents) : (lot.quantity ?? "—")}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-baseline justify-between text-[12.5px] text-text-secondary">
                            <span>
                              <span className="font-semibold text-text-primary tabular-nums">{lot.quantity ?? "?"}</span> boîte{(lot.quantity ?? 0) > 1 ? "s" : ""} · périme {formatExpiry(lot.expiresOn, lot.precision)}
                            </span>
                            <span className={cn("tabular-nums font-medium", lot.level === "EXPIRED" ? "text-danger-700" : "text-text-primary")}>{describeDaysLeft(lot.daysLeft)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Temps écoulé avant la péremption">
                            <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${percent}%` }} />
                          </div>
                          <p className="text-[12.5px] text-text-tertiary">
                            Repéré le {formatDate(lot.trackedSince)}
                            {lot.lotNumber ? ` · lot ${lot.lotNumber}` : ""} · proposé en priorité au comptoir
                          </p>
                        </div>
                        {canAdjust && (
                          <div className="mt-auto flex justify-end pt-1">
                            <LotRowActions lot={lot} today={today} thresholds={thresholds} />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
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
