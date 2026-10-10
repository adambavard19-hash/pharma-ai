import type { Metadata } from "next";
import Link from "next/link";
import { PharmaWordmark } from "@/components/app/logo";
import { previewInvitation } from "@/server/services/team-access";
import { TEAM_ROLE_LABELS } from "@/core/team/rules";
import { AcceptInvitationForm } from "./form";

export const metadata: Metadata = { title: "Rejoindre mon officine" };

/**
 * La page du lien d'invitation. Un GET n'écrit rien : le lien n'est consommé qu'à la soumission. Un lien inconnu, périmé ou déjà utilisé
 * n'apprend rien à personne : même message.
 */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await previewInvitation(token);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-6 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-3">
          <PharmaWordmark />
          {invitation ? (
            <>
              <h1 className="text-[20px] leading-7 font-bold tracking-[-0.025em] text-text-primary">Rejoindre {invitation.pharmacyName}</h1>
              <p className="text-[13.5px] leading-5 text-text-secondary">
                Vous êtes invité(e) en tant que <span className="font-medium text-text-primary">{TEAM_ROLE_LABELS[invitation.role].toLowerCase()}</span>. Votre adresse :{" "}
                <span className="font-medium text-text-primary">{invitation.email}</span>.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[20px] leading-7 font-bold tracking-[-0.025em] text-text-primary">Ce lien n&apos;est plus valable</h1>
              <p className="text-[13.5px] leading-5 text-text-secondary">
                Il a déjà été utilisé, il a expiré ou le titulaire l&apos;a annulé. Demandez-lui de vous inviter à nouveau.{" "}
                <Link href="/login" className="text-brand-700 underline underline-offset-2 dark:text-brand-400">
                  Aller à la connexion
                </Link>
              </p>
            </>
          )}
        </div>
        {invitation && <AcceptInvitationForm token={token} existingAccount={invitation.existingAccount} firstName={invitation.firstName} lastName={invitation.lastName} />}
      </div>
    </main>
  );
}
