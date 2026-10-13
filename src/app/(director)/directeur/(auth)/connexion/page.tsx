import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDirectorSession } from "@/server/auth/director-session";
import { DIRECTOR_HOME } from "@/core/sales/director/nav";
import { AUTH_LINK } from "@/components/app/helix/helix-auth-layout";
import { DirectorAuthShell } from "../auth-shell";
import { DirectorLoginForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Direction commerciale — PharmaBoost" } };

export default async function DirectorLoginPage() {
  const session = await getDirectorSession();
  if (session) redirect(DIRECTOR_HOME);
  return (
    <DirectorAuthShell title="Direction commerciale" intro="PharmaBoost — votre équipe, ses commissions, ses factures, ses challenges.">
      <DirectorLoginForm />
      <p className="text-center text-[13px]">
        <Link href="/directeur/oubli" className={AUTH_LINK}>
          Mot de passe oublié ou premier accès
        </Link>
      </p>
    </DirectorAuthShell>
  );
}
