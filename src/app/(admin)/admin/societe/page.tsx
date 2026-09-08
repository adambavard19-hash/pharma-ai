import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getCompanyProfile } from "@/server/services/sales/contracts";
import { PageHeader } from "@/components/ui/page";
import { CompanyForm } from "./form";

export const metadata: Metadata = { title: "Société exploitante" };

export default async function CompanyPage() {
  await requirePlatformSession();
  const profile = await getCompanyProfile();
  return (
    <>
      <PageHeader title="Société exploitante" description="La partie signataire des contrats d'abonnement. Ces informations sont injectées dans chaque contrat généré." />
      <CompanyForm initial={profile ? { legalName: profile.legalName, legalForm: profile.legalForm ?? "", addressLine1: profile.addressLine1 ?? "", postalCode: profile.postalCode ?? "", city: profile.city ?? "", siren: profile.siren ?? "", representativeName: profile.representativeName, representativeTitle: profile.representativeTitle ?? "", representativeEmail: profile.representativeEmail } : null} />
    </>
  );
}
