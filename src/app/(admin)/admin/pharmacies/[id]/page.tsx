import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { PageHeader, DataItem } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { formatDate, formatRelative } from "@/lib/format";
import { EditPharmacyButton } from "../pharmacy-form";
import { StatusToggle } from "../status-toggle";
import { AddOwnerButton } from "./owner-form";

export const metadata: Metadata = { title: "Officine cliente" };

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Titulaire",
  PHARMACIST: "Pharmacien",
  TECHNICIAN: "Préparateur",
  STUDENT: "Étudiant",
  VIEWER: "Consultation",
};

export default async function ClientPharmacyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformSession();
  const { id } = await params;

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      addressLine1: true,
      postalCode: true,
      city: true,
      finessNumber: true,
      siret: true,
      brandColor: true,
      isActive: true,
      createdAt: true,
      organization: { select: { name: true } },
      memberships: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          role: true,
          isActive: true,
          user: {
            select: { firstName: true, lastName: true, email: true, lastLoginAt: true },
          },
        },
      },
      // Compteurs seulement : aucun contenu de dossier n'est lu ici.
      _count: { select: { patients: true, products: true, prescriptions: true } },
    },
  });

  if (!pharmacy) notFound();

  const owners = pharmacy.memberships.filter((m) => m.role === "OWNER");
  const collaborators = pharmacy.memberships.filter((m) => m.role !== "OWNER");

  return (
    <>
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/admin/pharmacies">Officines clientes</Link>
      </Button>

      <PageHeader
        title={pharmacy.name}
        description={[pharmacy.city, `cliente depuis le ${formatDate(pharmacy.createdAt)}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <StatusToggle pharmacyId={pharmacy.id} isActive={pharmacy.isActive} size="md" />
            <EditPharmacyButton
              pharmacyId={pharmacy.id}
              initial={{
                name: pharmacy.name,
                email: pharmacy.email ?? "",
                phone: pharmacy.phone ?? "",
                addressLine1: pharmacy.addressLine1 ?? "",
                postalCode: pharmacy.postalCode ?? "",
                city: pharmacy.city ?? "",
                finessNumber: pharmacy.finessNumber ?? "",
                siret: pharmacy.siret ?? "",
                brandColor: pharmacy.brandColor,
              }}
            />
          </>
        }
      />

      {!pharmacy.isActive && (
        <Alert tone="warning" title="Officine suspendue">
          Les comptes de cette officine ne peuvent plus se connecter. Aucune donnée n&apos;a été
          supprimée : la réactivation restitue le dossier tel quel.
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Comptes"
              description="Qui peut se connecter à cette officine."
              action={<AddOwnerButton pharmacyId={pharmacy.id} />}
            />
            <CardContent className="p-0">
              {pharmacy.memberships.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-text-tertiary">
                  Aucun compte. Ajoutez un titulaire pour ouvrir l&apos;accès.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {[...owners, ...collaborators].map((membership) => (
                    <li
                      key={membership.user.email}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-text-primary">
                          {membership.user.firstName} {membership.user.lastName.toUpperCase()}
                        </span>
                        <span className="block truncate text-[12px] text-text-tertiary">
                          {membership.user.email}
                          {membership.user.lastLoginAt
                            ? ` · vu ${formatRelative(membership.user.lastLoginAt)}`
                            : " · jamais connecté"}
                        </span>
                      </span>
                      <Badge tone={membership.role === "OWNER" ? "brand" : "neutral"}>
                        {ROLE_LABELS[membership.role] ?? membership.role}
                      </Badge>
                      {!membership.isActive && <Badge tone="warning">Suspendu</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Coordonnées" />
            <CardContent className="grid gap-x-6 gap-y-4 pb-5 sm:grid-cols-2">
              <DataItem label="Adresse">
                {[pharmacy.addressLine1, [pharmacy.postalCode, pharmacy.city].filter(Boolean).join(" ")]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </DataItem>
              <DataItem label="Téléphone">{pharmacy.phone ?? "—"}</DataItem>
              <DataItem label="E-mail">{pharmacy.email ?? "—"}</DataItem>
              <DataItem label="FINESS">{pharmacy.finessNumber ?? "—"}</DataItem>
              <DataItem label="SIRET">{pharmacy.siret ?? "—"}</DataItem>
              <DataItem label="Organisation">{pharmacy.organization.name}</DataItem>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader title="Volumes" description="Des compteurs, jamais un contenu." />
          <CardContent className="space-y-3 pb-5">
            <Counter label="Patients au dossier" value={pharmacy._count.patients} />
            <Counter label="Références au catalogue" value={pharmacy._count.products} />
            <Counter label="Ordonnances traitées" value={pharmacy._count.prescriptions} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <span className="text-[18px] font-semibold tabular text-text-primary">{value}</span>
    </div>
  );
}
