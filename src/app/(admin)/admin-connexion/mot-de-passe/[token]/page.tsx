import type { Metadata } from "next";
import Link from "next/link";
import { peekPasswordToken } from "@/server/services/platform-admin";
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
    <main className="flex min-h-dvh items-center justify-center bg-ink-950 px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-semibold text-white">✚</span>
          <h1 className="text-[19px] font-semibold text-ink-50">Définir mon mot de passe</h1>
          {account ? (
            <p className="text-[13px] leading-5 text-ink-400">
              Compte administrateur <span className="text-ink-200">{account.email}</span>. Douze caractères au minimum.
            </p>
          ) : (
            <p className="text-[13px] leading-5 text-ink-400">
              Ce lien n&apos;est plus valide : il a été utilisé, ou il a expiré.{" "}
              <Link href="/admin-connexion/oubli" className="text-brand-400 underline underline-offset-2">
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
