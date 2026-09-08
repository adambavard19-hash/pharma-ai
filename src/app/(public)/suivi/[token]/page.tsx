import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekFollowUpResponse } from "@/server/services/followup";
import { findAnswerBySlug } from "@/core/followup";
import { AnswerForm } from "./answer-form";

export const metadata: Metadata = {
  title: { absolute: "Comment allez-vous ?" },
  // Le patient voit sa pharmacie, pas un logiciel : les métadonnées héritées
  // de l'application sont remplacées ici.
  description: "Votre pharmacie prend de vos nouvelles.",
  applicationName: "Votre pharmacie",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * La réponse du patient à son suivi, sans compte ni mot de passe.
 *
 * Le lien de l'e-mail porte déjà la réponse choisie (`?r=mieux`), mais la page
 * n'écrit rien à l'arrivée : elle la présélectionne et demande un clic. Un GET
 * qui répondrait à la place du patient répondrait aussi pour les antivirus et
 * les aperçus de messagerie qui visitent les liens.
 */
export default async function FollowUpResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const state = await peekFollowUpResponse(token);
  if (!state) notFound();

  const preselected = findAnswerBySlug(query.r)?.code ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-[#eef1f4] px-4 py-10">
      <div className="space-y-6 rounded-[24px] bg-white p-7 shadow-lg">
        <div className="space-y-2">
          <p className="text-[12.5px] font-semibold tracking-[0.1em] text-[#6b7280] uppercase">
            {state.pharmacyName}
          </p>
          <h1 className="text-[24px] leading-[1.2] font-bold tracking-[-0.015em] text-[#111827]">
            Bonjour {state.patientFirstName},
          </h1>
          <p className="text-[16px] leading-6 text-[#374151]">
            La {state.pharmacyName} prend de vos nouvelles à la suite de votre dernier passage.
          </p>
        </div>

        <AnswerForm
          token={token}
          pharmacyName={state.pharmacyName}
          preselected={preselected}
          alreadyAnswered={state.answered}
        />

        <p className="border-t border-[#e5e7eb] pt-4 text-[12.5px] leading-5 text-[#6b7280]">
          Cette page ne contient aucune information sur votre santé et n&apos;en affiche aucune.
          Votre réponse est transmise à votre pharmacien, et à lui seul.
        </p>
      </div>
    </main>
  );
}
