import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/format";
import { listStockConnectors } from "@/core/stock/connectors";

export const metadata: Metadata = { title: "Historique du stock" };

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: "Réception",
  SALE: "Vente",
  ADJUSTMENT: "Correction",
  LOSS: "Perte",
  RETURN: "Retour",
  INVENTORY: "Inventaire",
  IMPORT: "Import",
};

/**
 * Ce qui a changé dans le stock : imports, corrections, ventes. Et ce qui
 * pourra le synchroniser demain — sans annoncer un connecteur qui n'existe pas.
 */
export default async function StockHistoryPage() {
  const session = await requirePermission(PERMISSIONS.STOCK_VIEW);
  const pharmacyId = session.scope.pharmacyId;

  const [imports, movements, pharmacy] = await Promise.all([
    prisma.importJob.findMany({
      where: { pharmacyId, kind: { in: ["STOCK", "PRODUCTS"] }, status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.stockMovement.findMany({
      where: { pharmacyId, type: { not: "IMPORT" } },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { product: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { stockSyncedAt: true } }),
  ]);

  const connectors = listStockConnectors();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Retour au stock</Link>
      </Button>
      <PageHeader
        title="Historique du stock"
        description={pharmacy?.stockSyncedAt ? `Dernière synchronisation : ${formatDateTime(pharmacy.stockSyncedAt)}.` : "Le stock n'a jamais été importé."}
      />

      <Card>
        <CardHeader title="Sources de synchronisation" description="Seul ce qui fonctionne réellement est annoncé comme branché." />
        <CardContent className="pt-0">
          <ul className="divide-y divide-border-subtle">
            {connectors.map((connector) => (
              <li key={connector.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-text-primary">{connector.label}</span>
                  <span className="block text-[12.5px] text-text-secondary">{connector.description}</span>
                </span>
                <Badge tone={connector.status === "AVAILABLE" ? "success" : "neutral"}>
                  {connector.status === "AVAILABLE" ? "Disponible" : "Non branché"}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Imports" />
        <CardContent className="pt-0">
          {imports.length === 0 ? (
            <EmptyState title="Aucun import" description="Importez l'export de votre logiciel pour que le comptoir propose ce que vous avez en rayon." />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {imports.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-primary">{job.fileName}</span>
                  <Badge tone={job.status === "COMPLETED" ? (job.errorRows > 0 ? "warning" : "success") : job.status === "FAILED" ? "danger" : "info"}>
                    {job.createdRows} créé(s) · {job.updatedRows} mis à jour · {job.errorRows} invalide(s)
                  </Badge>
                  <span className="text-[12px] text-text-tertiary">
                    {formatDateTime(job.finishedAt ?? job.createdAt)}
                    {job.user && ` · ${job.user.firstName} ${job.user.lastName}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Mouvements récents" description="Corrections, ventes, inventaires — hors imports." />
        <CardContent className="pt-0">
          {movements.length === 0 ? (
            <EmptyState title="Aucun mouvement" description="Les corrections de quantité et les ventes apparaîtront ici." />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {movements.map((movement) => (
                <li key={movement.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-text-primary">{movement.product?.name ?? "Produit supprimé"}</span>
                  <span className="text-text-secondary">{MOVEMENT_LABELS[movement.type] ?? movement.type}</span>
                  <span className={movement.quantityDelta >= 0 ? "tabular text-success-700" : "tabular text-danger-700"}>
                    {movement.quantityDelta >= 0 ? "+" : ""}
                    {movement.quantityDelta} → {movement.quantityAfter}
                  </span>
                  <span className="text-[12px] text-text-tertiary">
                    {formatDateTime(movement.createdAt)}
                    {movement.user && ` · ${movement.user.firstName} ${movement.user.lastName}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
