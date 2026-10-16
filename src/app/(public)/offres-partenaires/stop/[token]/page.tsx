import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekPartnerUnsubscribe } from "@/server/services/partner-emails";
import { WithdrawForm } from "./withdraw-form";

export const metadata: Metadata = { title: "Offres partenaires", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

/** Ne plus recevoir d'offres partenaires, sans compte. Seul le clic sur le bouton désinscrit (un antivirus visite les liens). */
export default async function PartnerStopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const state = await peekPartnerUnsubscribe(decoded);
  if (!state) notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <h1 className="text-xl leading-7 font-bold tracking-[-0.025em] text-text-primary">Offres de nos marques partenaires</h1>
        <WithdrawForm token={decoded} unsubscribed={state.unsubscribed} />
      </div>
    </main>
  );
}
