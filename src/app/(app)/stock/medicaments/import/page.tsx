import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getReferenceCatalogState } from "@/server/services/reference";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { DrugStockImportForm } from "./import-form";

export const metadata: Metadata = { title: "Importer le stock médicament" };

export default async function DrugStockImportPage() {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);

  const [reference, jobs] = await Promise.all([
    getReferenceCatalogState(),
    prisma.importJob.findMany({
      where: { pharmacyId: session.scope.pharmacyId, kind: "DRUG_STOCK" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const catalogLoaded = reference.status === "READY" || reference.status === "STALE";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock/medicaments">Retour au stock médicament</Link>
      </Button>

      <PageHeader
        title="Importer le stock médicament"
        description="Une grosse officine a des milliers de références : personne ne devrait les cocher une par une. Collez l'export de votre logiciel de stock, ou téléversez-le."
      />

      {!catalogLoaded && (
        <Alert tone="warning" title="Le catalogue national n'est pas chargé">
          Aucun code ne peut être reconnu tant qu&apos;il ne l&apos;est pas. Chargez-le depuis{" "}
          <Link href="/parametres?onglet=moteur" className="underline">
            Paramètres → Moteur Pharma.ai
          </Link>
          .
        </Alert>
      )}

      <Alert tone="info" title="Ce que l'import fait, et ce qu'il ne fait pas">
        Il rattache vos codes au catalogue national et enregistre vos quantités.{" "}
        <strong>Il ne crée aucun médicament</strong> : un code absent du catalogue officiel est
        signalé, jamais inventé. La connexion directe à votre logiciel de gestion officinale
        n&apos;existe pas encore — c&apos;est un import de fichier, pas une synchronisation.
      </Alert>

      <Card>
        <CardHeader
          title="Liste de codes"
          description="Codes CIP13 (le code-barres de la boîte) ou CIP7, un par ligne."
        />
        <CardContent>
          <DrugStockImportForm />
        </CardContent>
      </Card>

      {jobs.length > 0 && (
        <Card>
          <CardHeader title="Imports précédents" />
          <CardContent>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Source</TH>
                    <TH>État</TH>
                    <TH numeric>Ajoutées</TH>
                    <TH numeric>Mises à jour</TH>
                    <TH numeric>Refusées</TH>
                    <TH>Par</TH>
                  </TR>
                </THead>
                <TBody>
                  {jobs.map((job) => (
                    <TR key={job.id}>
                      <TD className="text-text-secondary">{formatDateTime(job.createdAt)}</TD>
                      <TD className="max-w-56 truncate">{job.fileName}</TD>
                      <TD>
                        <Badge tone={job.status === "COMPLETED" ? "success" : "warning"}>
                          {job.status === "COMPLETED" ? "Terminé" : job.status}
                        </Badge>
                      </TD>
                      <TD numeric className="tabular">
                        {job.createdRows}
                      </TD>
                      <TD numeric className="tabular">
                        {job.updatedRows}
                      </TD>
                      <TD numeric className="tabular">
                        {job.errorRows}
                      </TD>
                      <TD className="text-text-secondary">
                        {job.user ? `${job.user.firstName} ${job.user.lastName}` : "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
