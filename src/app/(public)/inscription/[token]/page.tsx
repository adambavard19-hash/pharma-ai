import type { Metadata } from "next";
import { PharmaLogo } from "@/components/app/logo";
import { openInvitation } from "@/server/services/onboarding";
import { SignupForm } from "./signup-form";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

export const metadata: Metadata = {
  title: { absolute: "Configurer mon officine · PharmaBoost" },
  robots: { index: false, follow: false, nocache: true },
  // Le jeton est dans l'adresse : il ne part jamais vers un autre site.
  referrer: "no-referrer",
};

/**
 * L'inscription d'une officine par son titulaire, depuis le lien de
 * l'invitation. Aucun compte demandé : le lien ne donne accès qu'à ce dossier.
 */
export default async function SignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await openInvitation(token);

  return (
    <div className="min-h-dvh bg-surface-app">
      <header className="border-b border-border-subtle bg-surface-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2.5 px-5">
          <PharmaLogo size={28} />
          <span className="text-[16px] font-semibold tracking-[-0.01em] text-text-primary">
            Pharma<span className="text-brand-600">Boost</span>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 md:py-14">
        {invitation.state === "VALID" ? (
          <SignupForm token={token} prefill={invitation.prefill} expiresAt={invitation.expiresAt.toISOString()} />
        ) : (
          <Closed state={invitation.state} />
        )}
      </main>
    </div>
  );
}

function Closed({ state }: { state: string }) {
  const content =
    state === "EXPIRED"
      ? { title: "Ce lien a expiré.", body: "Pour des raisons de sécurité, un lien d'invitation est valable 7 jours. Demandez-en un nouveau : il vous parviendra par e-mail." }
      : state === "USED"
        ? { title: "Votre dossier est déjà enregistré.", body: "Les informations de votre officine nous sont bien parvenues. Votre contrat vous sera adressé par e-mail." }
        : { title: "Ce lien n'est pas valable.", body: "Il a peut-être été remplacé par un lien plus récent. Utilisez le dernier e-mail reçu, ou demandez un nouveau lien." };
  return (
    <div className="mx-auto max-w-3xl rounded-[28px] border border-border-subtle bg-surface-card p-8 text-center sm:p-12">
      <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Inscription</p>
      <h1 className="mt-3 text-[28px] leading-[1.1] font-bold tracking-[-0.025em] text-text-primary">{content.title}</h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-6 text-text-secondary">{content.body}</p>
      <p className="mt-6 text-[14px] text-text-secondary">
        Une question : <a href="mailto:contact@pharmaboost.app" className="font-semibold text-brand-700 underline underline-offset-2">{PUBLIC_CONTACT_EMAIL}</a>
      </p>
    </div>
  );
}
