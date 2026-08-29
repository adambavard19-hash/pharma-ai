import { redirect } from "next/navigation";

/**
 * Ancienne adresse du scan, conservée en redirection.
 *
 * Des liens, des favoris et des captures d'écran la citent encore : la casser
 * ne ferait gagner personne. Le paramètre `patient` est préservé, sans quoi un
 * pharmacien parti de la fiche patient devrait re-sélectionner son patient.
 */
export default async function LegacyNewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient } = await searchParams;
  redirect(patient ? `/vente/nouvelle?patient=${encodeURIComponent(patient)}` : "/vente/nouvelle");
}
