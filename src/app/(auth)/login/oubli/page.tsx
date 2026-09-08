import type { Metadata } from "next";
import Link from "next/link";
import { PharmaWordmark } from "@/components/app/logo";
import { RequestLinkForm } from "./form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-6 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-3">
          <PharmaWordmark />
          <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">Recevoir un lien de connexion</h1>
          <p className="text-[13.5px] leading-5 text-text-secondary">
            Indiquez l&apos;adresse e-mail de votre compte : un lien pour définir un nouveau mot de passe lui sera envoyé.
          </p>
        </div>
        <RequestLinkForm />
        <p className="text-center text-[13px]">
          <Link href="/login" className="text-text-tertiary underline underline-offset-2 hover:text-text-secondary">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}
