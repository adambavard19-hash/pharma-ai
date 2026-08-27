import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PRESCRIPTION_STATUS } from "@/config/statuses";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LinkTabs } from "@/components/ui/tabs";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { PrescriptionStatus } from "@/generated/prisma";

export const metadata: Metadata = { title: "Ordonnances" };

const TAB_FILTERS: Record<string, PrescriptionStatus[] | null> = {
  toutes: null,
  "a-verifier": ["NEEDS_VERIFICATION", "DRAFT", "EXTRACTING"],
  "a-valider": ["ANALYZED", "VERIFIED", "ANALYZING"],
  terminees: ["VALIDATED", "DELIVERED"],
};

export default async function PrescriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; statut?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_VIEW);
  const params = await searchParams;
  const tab = params.statut ?? params.onglet ?? "toutes";
  const filter = TAB_FILTERS[tab] ?? null;

  const baseWhere = { pharmacyId: session.scope.pharmacyId, deletedAt: null };

  const [prescriptions, counts] = await Promise.all([
    prisma.prescription.findMany({
      where: { ...baseWhere, ...(filter ? { status: { in: filter } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        lines: { select: { drugName: true }, orderBy: { position: "asc" } },
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { recommendations: true, documents: true } },
      },
    }),
    prisma.prescription.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: true,
    }),
  ]);

  const countFor = (statuses: PrescriptionStatus[] | null) =>
    statuses === null
      ? counts.reduce((sum, row) => sum + row._count, 0)
      : counts
          .filter((row) => statuses.includes(row.status))
          .reduce((sum, row) => sum + row._count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ordonnances"
        description="Chaque ordonnance importée suit le même parcours : vérification par un professionnel, analyse, validation des conseils, fiche patient."
        actions={
          session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE) ? (
            <Button asChild size="lg" leadingIcon={<Plus className="size-[18px]" />}>
              <Link href="/ordonnances/nouvelle">Nouvelle ordonnance</Link>
            </Button>
          ) : null
        }
      />

      <LinkTabs
        paramName="statut"
        items={[
          { key: "toutes", label: "Toutes", count: countFor(null) },
          { key: "a-verifier", label: "À vérifier", count: countFor(TAB_FILTERS["a-verifier"]) },
          { key: "a-valider", label: "Conseils à valider", count: countFor(TAB_FILTERS["a-valider"]) },
          { key: "terminees", label: "Terminées", count: countFor(TAB_FILTERS.terminees) },
        ]}
      />

      {prescriptions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="Aucune ordonnance"
            description="Importez une ordonnance pour lancer le parcours de conseil personnalisé."
            action={
              session.permissions.has(PERMISSIONS.PRESCRIPTION_CREATE) ? (
                <Button asChild leadingIcon={<Plus className="size-4" />}>
                  <Link href="/ordonnances/nouvelle">Nouvelle ordonnance</Link>
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Référence</TH>
                <TH>Patient</TH>
                <TH>Traitement</TH>
                <TH>Statut</TH>
                <TH numeric>Conseils</TH>
                <TH>Importée par</TH>
                <TH>Date</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {prescriptions.map((prescription) => {
                const status = PRESCRIPTION_STATUS[prescription.status];
                const nextStep =
                  prescription.status === "NEEDS_VERIFICATION" ||
                  prescription.status === "DRAFT"
                    ? { href: `/ordonnances/${prescription.id}/verification`, label: "Vérifier" }
                    : prescription.status === "ANALYZED" || prescription.status === "VERIFIED"
                      ? { href: `/ordonnances/${prescription.id}/copilote`, label: "Valider" }
                      : { href: `/ordonnances/${prescription.id}`, label: "Ouvrir" };

                return (
                  <TR key={prescription.id} interactive>
                    <TD className="font-mono text-[12px]">
                      <Link
                        href={`/ordonnances/${prescription.id}`}
                        className="text-text-primary hover:underline"
                      >
                        {prescription.reference}
                      </Link>
                    </TD>
                    <TD>
                      {prescription.patient ? (
                        <Link
                          href={`/patients/${prescription.patient.id}`}
                          className="hover:underline"
                        >
                          {prescription.patient.firstName}{" "}
                          {prescription.patient.lastName.toUpperCase()}
                        </Link>
                      ) : (
                        <span className="text-text-tertiary">Non rattachée</span>
                      )}
                    </TD>
                    <TD className="max-w-[280px] truncate text-text-secondary">
                      {prescription.lines.map((l) => l.drugName).filter(Boolean).join(" · ") ||
                        "—"}
                    </TD>
                    <TD>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </TD>
                    <TD numeric>{prescription._count.recommendations}</TD>
                    <TD className="text-text-secondary">
                      {prescription.createdBy
                        ? `${prescription.createdBy.firstName} ${prescription.createdBy.lastName}`
                        : "—"}
                    </TD>
                    <TD className="text-text-secondary">
                      <span className="block">{formatRelative(prescription.createdAt)}</span>
                      <span className="block text-[11.5px] text-text-tertiary">
                        {formatDateTime(prescription.createdAt)}
                      </span>
                    </TD>
                    <TD>
                      <Button asChild size="sm" variant="outline">
                        <Link href={nextStep.href}>{nextStep.label}</Link>
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrapper>
      )}
    </div>
  );
}
