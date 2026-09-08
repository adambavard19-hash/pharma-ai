import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSalesSession } from "@/server/auth/sales-session";
import { SalesLoginForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Extranet commercial — PharmaBoost" } };

export default async function SalesLoginPage({ searchParams }: { searchParams: Promise<{ defini?: string }> }) {
  const [session, { defini }] = await Promise.all([getSalesSession(), searchParams]);
  if (session) redirect("/extranet");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1f1c] px-5 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-500 text-lg font-semibold text-white">✚</span>
          <h1 className="text-[20px] font-semibold text-white">Extranet commercial</h1>
          <p className="text-[13px] leading-5 text-white/60">PharmaBoost — vos dossiers, vos contrats, vos commissions.</p>
        </div>
        {defini === "1" && <p className="rounded-lg bg-success-700/30 px-3.5 py-3 text-center text-[13.5px] text-success-200">Mot de passe enregistré. Connectez-vous.</p>}
        <SalesLoginForm />
        <p className="text-center text-[13px]">
          <Link href="/extranet/oubli" className="text-white/60 underline underline-offset-2 hover:text-white">
            Mot de passe oublié ou premier accès
          </Link>
        </p>
      </div>
    </main>
  );
}
