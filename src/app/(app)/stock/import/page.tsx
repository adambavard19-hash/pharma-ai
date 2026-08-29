import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/format";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Importer le catalogue" };

export default async function ImportPage() {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);

  const jobs = await prisma.importJob.findMany({
    where: { pharmacyId: session.scope.pharmacyId, kind: "PRODUCTS" },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock?onglet=catalogue">Retour au stock</Link>
      </Button>

      <PageHeader
        title="Importer le catalogue"
        description="Chargez vos références depuis un fichier CSV. Les produits existants sont mis à jour d'après leur référence interne."
      />

      <Alert tone="info" title="Intégrations à venir">
        L&apos;import Excel, la synchronisation avec votre logiciel de gestion officinale et les
        catalogues fournisseurs sont prévus. Les interfaces correspondantes existent déjà dans
        l&apos;architecture ; aucune de ces intégrations n&apos;est branchée aujourd&apos;hui.
      </Alert>

      <Card>
        <CardHeader
          title="Fichier CSV"
          description="Séparateur point-virgule ou virgule. Première ligne : en-têtes."
          action={
            <Button asChild variant="outline" size="sm" leadingIcon={<Download className="size-4" />}>
              <a href="/modeles/catalogue-exemple.csv" download>
                Modèle
              </a>
            </Button>
          }
        />
        <CardContent>
          <ImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Colonnes attendues" />
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {COLUMNS.map((column) => (
              <div key={column.name} className="flex items-baseline gap-2">
                <dt className="font-mono text-[12px] text-brand-700 dark:text-brand-400">
                  {column.name}
                </dt>
                <dd className="text-[12.5px] text-text-secondary">{column.description}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {jobs.length > 0 && (
        <Card>
          <CardHeader title="Imports précédents" />
          <CardContent className="pt-0">
            <ul className="divide-y divide-border-subtle">
              {jobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-primary">
                    {job.fileName}
                  </span>
                  <Badge
                    tone={
                      job.status === "COMPLETED"
                        ? job.errorRows > 0
                          ? "warning"
                          : "success"
                        : job.status === "FAILED"
                          ? "danger"
                          : "info"
                    }
                  >
                    {job.createdRows} créé(s) · {job.updatedRows} mis à jour ·{" "}
                    {job.errorRows} erreur(s)
                  </Badge>
                  <span className="text-[12px] text-text-tertiary">
                    {formatDateTime(job.createdAt)}
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

const COLUMNS = [
  { name: "nom", description: "Obligatoire" },
  { name: "marque", description: "Facultatif" },
  { name: "categorie", description: "Code de catégorie (ex. PROBIOTIQUES)" },
  { name: "sous_categorie", description: "Facultatif" },
  { name: "reference", description: "Clé de mise à jour" },
  { name: "ean", description: "Code-barres" },
  { name: "prix_achat", description: "Format 6,20" },
  { name: "prix_vente", description: "Format 14,90" },
  { name: "tva", description: "2.1, 5.5, 10 ou 20" },
  { name: "quantite", description: "Stock initial" },
  { name: "seuil_alerte", description: "Défaut : 5" },
  { name: "description", description: "Facultatif" },
];
