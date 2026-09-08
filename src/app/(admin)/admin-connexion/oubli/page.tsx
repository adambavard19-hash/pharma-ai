import type { Metadata } from "next";
import Link from "next/link";
import { RequestLinkForm } from "./form";

export const metadata: Metadata = { title: "Mot de passe oublié — PharmaBoost" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-950 px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-semibold text-white">✚</span>
          <h1 className="text-[19px] font-semibold text-ink-50">Recevoir un lien de connexion</h1>
          <p className="text-[13px] leading-5 text-ink-400">Un lien pour définir un nouveau mot de passe sera envoyé à l&apos;adresse du compte.</p>
        </div>
        <RequestLinkForm />
        <p className="text-center text-[13px]">
          <Link href="/admin-connexion" className="text-ink-400 underline underline-offset-2 hover:text-ink-200">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}
