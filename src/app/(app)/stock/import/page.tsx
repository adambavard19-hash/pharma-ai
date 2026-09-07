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
import { formatDateTime } from "@/lib/format";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importer mon stock" };

/**
 * L'import du stock — déposer, vérifier, valider.
 *
 * Rien n'est écrit avant l'aperçu : le titulaire voit ce qui est reconnu, ce
 * qui demande une décision, ce qui est invalide, puis valide en une fois.
 */
export default async function StockImportPage() {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);

  const jobs = await prisma.importJob.findMany({
    where: { pharmacyId: session.scope.pharmacyId, kind: { in: ["STOCK", "PRODUCTS"] }, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: 6,
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Retour au stock</Link>
      </Button>

      <PageHeader
        title="Importer mon stock"
        description="Déposez l'export de votre logiciel (CSV ou Excel). Pharma.ai reconnaît les colonnes et les produits, vous vérifiez, puis vous validez."
      />

      <ImportWizard />

      {jobs.length > 0 && (
        <Card>
          <CardHeader title="Imports précédents" />
          <CardContent className="pt-0">
            <ul className="divide-y divide-border-subtle">
              {jobs.map((job) => (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
