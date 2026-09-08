import type { Metadata } from "next";
import Link from "next/link";
import { peekSalesPasswordToken } from "@/server/services/sales/reps";
import { SetSalesPasswordForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Définir mon mot de passe — PharmaBoost" } };

export default async function SalesSetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const account = await peekSalesPasswordToken(token);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1f1c] px-5 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-500 text-lg font-semibold text-white">✚</span>
          <h1 className="text-[20px] font-semibold text-white">Bienvenue{account ? ` ${account.firstName}` : ""}</h1>
          {account ? (
            <p className="text-[13px] leading-5 text-white/60">Compte <span className="text-white">{account.email}</span>. Choisissez un mot de passe : douze caractères au minimum, avec une majuscule et un chiffre.</p>
          ) : (
            <p className="text-[13px] leading-5 text-white/60">
              Ce lien n&apos;est plus valide. <Link href="/extranet/oubli" className="text-brand-300 underline underline-offset-2">Demander un nouveau lien</Link>
            </p>
          )}
        </div>
        {account && <SetSalesPasswordForm token={token} />}
      </div>
    </main>
  );
}
