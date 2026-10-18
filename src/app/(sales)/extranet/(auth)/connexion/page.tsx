import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSalesSession } from "@/server/auth/sales-session";
import { Alert } from "@/components/ui/feedback";
import { AUTH_LINK } from "@/components/app/helix/helix-auth-layout";
import { SalesAuthShell } from "../sales-auth-shell";
import { SalesLoginForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Espace affilié — PharmaBoost" } };

export default async function SalesLoginPage({ searchParams }: { searchParams: Promise<{ defini?: string }> }) {
  const [session, { defini }] = await Promise.all([getSalesSession(), searchParams]);
  if (session) redirect("/extranet");
  return (
    <SalesAuthShell title="Espace affilié" intro="PharmaBoost — vos pharmacies, vos contrats, vos commissions.">
      {defini === "1" && <Alert tone="success">Mot de passe enregistré. Connectez-vous.</Alert>}
      <SalesLoginForm />
      <p className="text-center text-[13px]">
        <Link href="/extranet/oubli" className={AUTH_LINK}>
          Mot de passe oublié ou premier accès
        </Link>
      </p>
    </SalesAuthShell>
  );
}
