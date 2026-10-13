import type { Metadata } from "next";
import Link from "next/link";
import { peekSalesPasswordToken } from "@/server/services/sales/reps";
import { AUTH_LINK_STRONG } from "@/components/app/helix/helix-auth-layout";
import { SalesAuthShell } from "../../sales-auth-shell";
import { SetSalesPasswordForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Définir mon mot de passe — PharmaBoost" } };

export default async function SalesSetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const account = await peekSalesPasswordToken(token);
  return (
    <SalesAuthShell
      title={`Bienvenue${account ? ` ${account.firstName}` : ""}`}
      intro={
        account ? (
          <p>Compte <span className="font-medium text-text-primary">{account.email}</span>. Choisissez un mot de passe : douze caractères au minimum, avec une majuscule et un chiffre.</p>
        ) : (
          <p>
            Ce lien n&apos;est plus valide. <Link href="/extranet/oubli" className={AUTH_LINK_STRONG}>Demander un nouveau lien</Link>
          </p>
        )
      }
    >
      {account && <SetSalesPasswordForm token={token} />}
    </SalesAuthShell>
  );
}
