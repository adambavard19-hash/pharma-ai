import type { Metadata } from "next";
import { requireDirectorSession } from "@/server/auth/director-session";
import { getStandardCommissionCents } from "@/server/services/standard-commission";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { RepForm } from "./rep-form";

export const metadata: Metadata = { title: "Ajouter un commercial" };

/**
 * Ajouter un commercial à l'équipe. Le compte est créé dans la même table que
 * celle de la console : il y apparaît aussitôt. La commission proposée est le
 * montant standard de la plateforme, modifiable avant d'enregistrer.
 */
export default async function NewSalesRepPage() {
  await requireDirectorSession();
  const standardCommissionCents = await getStandardCommissionCents();

  return (
    <div className="space-y-5">
      <AdminPageHeader parent={{ label: "Commerciaux", href: "/directeur/commerciaux" }} title="Ajouter un commercial" description="Renseignez ses coordonnées et sa rémunération. Il reçoit ensuite un e-mail pour choisir son mot de passe et accéder à son espace." />
      <AdminSection className="max-w-3xl">
        <RepForm defaultCommissionCents={standardCommissionCents} />
      </AdminSection>
    </div>
  );
}
