import { activityScope } from "@/server/db/demo-scope";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getOCRProvider } from "@/server/ai/registry";
import { Button } from "@/components/ui/button";
import { NewPrescriptionForm } from "./new-prescription-form";

export const metadata: Metadata = { title: "Nouvelle vente" };

export default async function NewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const params = await searchParams;

  const patients = await prisma.patient.findMany({
    where: {
      ...activityScope(),
 pharmacyId: session.scope.pharmacyId, deletedAt: null },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, reference: true, email: true },
    take: 500,
  });

  // L'écran ne promet une lecture automatique que si un lecteur est réellement
  // branché. Sinon il propose la saisie, sans expliquer pourquoi.
  const canReadPrescriptions = getOCRProvider().info.capability === "LIVE";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/">Retour</Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-text-primary">
          Nouvelle vente
        </h1>
        <p className="text-[14px] text-text-secondary">
          Scannez, saisissez ou joignez l&apos;ordonnance. Le patient peut être associé après.
        </p>
      </div>

      <NewPrescriptionForm
        patients={patients}
        preselectedPatientId={params.patient ?? null}
        canReadPrescriptions={canReadPrescriptions}
      />
    </div>
  );
}
