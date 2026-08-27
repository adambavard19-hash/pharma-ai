import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PatientForm } from "./patient-form";

export const metadata: Metadata = { title: "Nouveau patient" };

export default async function NewPatientPage() {
  await requirePermission(PERMISSIONS.PATIENT_CREATE);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/patients">Retour aux patients</Link>
      </Button>

      <PageHeader
        title="Nouveau patient"
        description="Seules les informations nécessaires au conseil sont collectées. Le profil de santé se renseigne ensuite, depuis la fiche."
      />

      <Card>
        <CardContent className="pt-5">
          <PatientForm />
        </CardContent>
      </Card>
    </div>
  );
}
