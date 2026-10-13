import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPlatformSession } from "@/server/auth/platform-session";
import { Alert } from "@/components/ui/feedback";
import { AdminAuthShell } from "./admin-auth-shell";
import { PlatformLoginForm } from "./form";

export const metadata: Metadata = { title: "Administration PharmaBoost" };

export default async function PlatformLoginPage({ searchParams }: { searchParams: Promise<{ defini?: string }> }) {
  const session = await getPlatformSession();
  if (session) redirect("/admin");
  const { defini } = await searchParams;

  return (
    <AdminAuthShell
      title="Administration PharmaBoost"
      intro="Espace réservé à l'éditeur du logiciel. Aucun accès aux données médicales des patients des officines clientes."
    >
      {defini === "1" && <Alert tone="success">Mot de passe enregistré. Connectez-vous.</Alert>}
      <PlatformLoginForm />
    </AdminAuthShell>
  );
}
