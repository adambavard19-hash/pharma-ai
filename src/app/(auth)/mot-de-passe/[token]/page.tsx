import type { Metadata } from "next";
import Link from "next/link";
import { PharmaWordmark } from "@/components/app/logo";
import { peekUserPasswordToken } from "@/server/services/user-password";
import { SetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Définir mon mot de passe" };

/**
 * La page du lien reçu par e-mail (accueil d'un titulaire, ou oubli).
 * Un GET n'écrit rien : le jeton n'est consommé qu'à la soumission.
 */
export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const account = await peekUserPasswordToken(token);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-6 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-3">
          <PharmaWordmark />
          <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">Définir mon mot de passe</h1>
          {account ? (
            <p className="text-[13.5px] leading-5 text-text-secondary">
              Bonjour {account.firstName}. Compte <span className="font-medium text-text-primary">{account.email}</span>. Douze caractères au minimum, avec une majuscule et un chiffre.
            </p>
          ) : (
            <p className="text-[13.5px] leading-5 text-text-secondary">
              Ce lien n&apos;est plus valide : il a été utilisé, ou il a expiré.{" "}
              <Link href="/login/oubli" className="text-brand-700 underline underline-offset-2 dark:text-brand-400">
                Demander un nouveau lien
              </Link>
            </p>
          )}
        </div>
        {account && <SetPasswordForm token={token} />}
      </div>
    </main>
  );
}
