import type { Metadata } from "next";
import Link from "next/link";
import { RequestSalesLinkForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Mot de passe oublié — PharmaBoost" } };

export default function SalesForgotPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1f1c] px-5 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-500 text-lg font-semibold text-white">✚</span>
          <h1 className="text-[20px] font-semibold text-white">Recevoir un lien de connexion</h1>
          <p className="text-[13px] leading-5 text-white/60">Un lien pour définir votre mot de passe sera envoyé à l&apos;adresse de votre compte.</p>
        </div>
        <RequestSalesLinkForm />
        <p className="text-center text-[13px]"><Link href="/extranet/connexion" className="text-white/60 underline underline-offset-2 hover:text-white">Retour à la connexion</Link></p>
      </div>
    </main>
  );
}
