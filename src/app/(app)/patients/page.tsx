import type { Metadata } from "next";
import Link from "next/link";
import { Plus, UserRound } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatAge, formatDate, formatRelative } from "@/lib/format";
import { initials } from "@/lib/utils";
import { PatientSearchBar } from "./search-bar";

export const metadata: Metadata = { title: "Patients" };

const PAGE_SIZE = 25;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PATIENT_VIEW);
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where = {
    pharmacyId: session.scope.pharmacyId,
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" as const } },
            { lastName: { contains: query, mode: "insensitive" as const } },
            { reference: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        email: true,
        phone: true,
        city: true,
        createdAt: true,
        _count: { select: { prescriptions: true, sales: true } },
        prescriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, reference: true },
        },
        consents: {
          where: { type: "ADVICE_SHARING" },
          select: { granted: true, revokedAt: true },
        },
      },
    }),
    prisma.patient.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        description="Le CRM de votre officine : historique des traitements, conseils donnés et documents remis."
        actions={
          session.permissions.has(PERMISSIONS.PATIENT_CREATE) ? (
            <Button asChild leadingIcon={<Plus className="size-[18px]" />}>
              <Link href="/patients/nouveau">Nouveau patient</Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PatientSearchBar initialQuery={query} />
        <p className="text-[13px] text-text-tertiary tabular">
          {total} patient{total > 1 ? "s" : ""}
          {query && " correspondant à votre recherche"}
        </p>
      </div>

      {patients.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserRound className="size-5" />}
            title={query ? "Aucun patient trouvé" : "Aucun patient enregistré"}
            description={
              query
                ? `Aucun résultat pour « ${query} ». Vérifiez l'orthographe ou créez une fiche.`
                : "Créez votre première fiche patient pour commencer à suivre les traitements et les conseils."
            }
            action={
              session.permissions.has(PERMISSIONS.PATIENT_CREATE) ? (
                <Button asChild leadingIcon={<Plus className="size-4" />}>
                  <Link href="/patients/nouveau">Créer un patient</Link>
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Patient</TH>
                  <TH>Référence</TH>
                  <TH>Âge</TH>
                  <TH>Contact</TH>
                  <TH numeric>Ordonnances</TH>
                  <TH>Dernière visite</TH>
                  <TH>Fiche conseil</TH>
                </TR>
              </THead>
              <TBody>
                {patients.map((patient) => {
                  const consent = patient.consents[0];
                  const hasConsent = Boolean(consent?.granted && !consent.revokedAt);
                  return (
                    <TR key={patient.id} interactive>
                      <TD>
                        <Link
                          href={`/patients/${patient.id}`}
                          className="flex items-center gap-3 hover:underline"
                        >
                          <Avatar
                            size="sm"
                            initials={initials(patient.firstName, patient.lastName)}
                            name={`${patient.firstName} ${patient.lastName}`}
                          />
                          <span className="font-medium">
                            {patient.firstName} {patient.lastName.toUpperCase()}
                          </span>
                        </Link>
                      </TD>
                      <TD className="font-mono text-[12px] text-text-tertiary">
                        {patient.reference}
                      </TD>
                      <TD className="text-text-secondary">{formatAge(patient.birthDate)}</TD>
                      <TD className="text-text-secondary">
                        <span className="block max-w-[200px] truncate">
                          {patient.email ?? patient.phone ?? "—"}
                        </span>
                        {patient.city && (
                          <span className="block text-[12px] text-text-tertiary">
                            {patient.city}
                          </span>
                        )}
                      </TD>
                      <TD numeric>{patient._count.prescriptions}</TD>
                      <TD className="text-text-secondary">
                        {patient.prescriptions[0]
                          ? formatRelative(patient.prescriptions[0].createdAt)
                          : formatDate(patient.createdAt)}
                      </TD>
                      <TD>
                        <Badge tone={hasConsent ? "success" : "neutral"}>
                          {hasConsent ? "Accepté" : "Non accordé"}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between" aria-label="Pagination">
              <p className="text-[13px] text-text-tertiary">
                Page {page} sur {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                >
                  <Link href={`/patients?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page - 1) })}`}>
                    Précédent
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                >
                  <Link href={`/patients?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page + 1) })}`}>
                    Suivant
                  </Link>
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
