import type { Metadata } from "next";
import Link from "next/link";
import { peekDirectorPasswordToken } from "@/server/services/sales/director-auth";
import { DirectorAuthShell } from "../../auth-shell";
import { SetDirectorPasswordForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Définir mon mot de passe — PharmaBoost" }, robots: { index: false, follow: false, nocache: true } };

export default async function DirectorSetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const account = await peekDirectorPasswordToken(token);
  return (
    <DirectorAuthShell
      title={`Bienvenue${account ? ` ${account.firstName}` : ""}`}
      intro={
        account ? (
          <>Compte <span className="text-white">{account.email}</span>. Choisissez un mot de passe : douze caractères au minimum, avec une majuscule et un chiffre.</>
        ) : (
          <>Ce lien n&apos;est plus valide. <Link href="/directeur/oubli" className="text-brand-300 underline underline-offset-2">Demander un nouveau lien</Link></>
        )
      }
    >
      {account && <SetDirectorPasswordForm token={token} />}
    </DirectorAuthShell>
  );
}
