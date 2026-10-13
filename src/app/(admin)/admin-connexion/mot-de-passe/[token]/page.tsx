import type { Metadata } from "next";
import Link from "next/link";
import { peekPasswordToken } from "@/server/services/platform-admin";
import { AUTH_LINK_STRONG } from "@/components/app/helix/helix-auth-layout";
import { AdminAuthShell } from "../../admin-auth-shell";
import { SetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Définir mon mot de passe — PharmaBoost" };

/**
 * La page du lien reçu par e-mail. Un GET n'écrit rien : le jeton n'est
 * consommé qu'à la soumission du formulaire.
 */
export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const account = await peekPasswordToken(token);

  return (
    <AdminAuthShell
      title="Définir mon mot de passe"
      intro={
        account ? (
          <p>
            Compte administrateur <span className="font-medium text-text-primary">{account.email}</span>. Douze caractères au minimum.
          </p>
        ) : (
          <p>
            Ce lien n&apos;est plus valide : il a été utilisé, ou il a expiré.{" "}
            <Link href="/admin-connexion/oubli" className={AUTH_LINK_STRONG}>
              Demander un nouveau lien
            </Link>
          </p>
        )
      }
    >
      {account && <SetPasswordForm token={token} />}
    </AdminAuthShell>
  );
}
