import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { peekNewsOptIn } from "@/server/services/patient-news";
import { NEWS_RETENTION_MONTHS } from "@/core/patient-news";
import { safeColor } from "@/core/documents/email";
import { OptInForm } from "./opt-in-form";

export const metadata: Metadata = {
  // Le patient voit sa pharmacie, pas un logiciel : les métadonnées héritées de l'application sont remplacées.
  title: { absolute: "Nouveautés de votre pharmacie" },
  description: "Être prévenu(e) des nouveautés de votre pharmacie.",
  applicationName: "Votre pharmacie",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * L'abonnement aux nouveautés de la pharmacie, sans compte ni mot de passe.
 *
 * La page n'écrit rien : elle informe et demande confirmation. Le lien de
 * l'e-mail du plan est ouvert par des antivirus et des aperçus de messagerie ;
 * un GET qui abonnerait inscrirait des patients qui n'ont rien demandé. Le
 * jeton porte l'adresse chiffrée : elle n'est enregistrée qu'au clic.
 */
export default async function NewsOptInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await peekNewsOptIn(token);
  if (!state) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
        <div className="h-1.5" style={{ backgroundColor: safeColor(state.brandColor) }} aria-hidden="true" />
        <div className="space-y-5 p-7">
          <div className="space-y-2">
            <p className="text-[12.5px] font-semibold tracking-[0.1em] text-text-tertiary uppercase">{state.pharmacyName}</p>
            <h1 className="text-xl leading-7 font-bold tracking-[-0.025em] text-text-primary">Être prévenu(e) des nouveautés de votre pharmacie</h1>
            <p className="text-[13.5px] leading-5 text-text-secondary">
              {state.alreadySubscribed
                ? "Vous êtes déjà inscrit(e) : il n'y a rien à faire. Chaque message contient un lien pour vous désinscrire."
                : "C'est facultatif. Votre plan n'en dépend pas, et rien n'est enregistré tant que vous n'avez pas confirmé ci-dessous."}
            </p>
          </div>

          <section className="space-y-1" aria-labelledby="ce-que-vous-recevrez">
            <h2 id="ce-que-vous-recevrez" className="text-[13.5px] leading-5 font-semibold text-text-primary">
              Ce que vous recevrez
            </h2>
            <p className="text-[13px] leading-5 text-text-secondary">
              Un message de {state.pharmacyName} lorsqu&apos;une nouvelle gamme arrive en pharmacie, de temps en temps, au plus un par semaine.
            </p>
          </section>

          <section className="space-y-1" aria-labelledby="ce-qui-ny-figure-pas">
            <h2 id="ce-qui-ny-figure-pas" className="text-[13.5px] leading-5 font-semibold text-text-primary">
              Ce qui n&apos;y figure pas
            </h2>
            <p className="text-[13px] leading-5 text-text-secondary">
              Aucune information sur votre santé. Votre adresse n&apos;est reliée ni à votre ordonnance, ni à votre plan, ni à un médicament.
            </p>
          </section>

          <section className="space-y-1" aria-labelledby="vos-donnees">
            <h2 id="vos-donnees" className="text-[13.5px] leading-5 font-semibold text-text-primary">
              Vos données
            </h2>
            <p className="text-[13px] leading-5 text-text-secondary">
              {state.pharmacyName} est responsable de ce traitement. Votre adresse est conservée, chiffrée, {NEWS_RETENTION_MONTHS} mois au plus à compter
              de votre accord, puis supprimée. Elle n&apos;est transmise à aucun laboratoire ; seuls des prestataires techniques d&apos;hébergement et d&apos;envoi de
              messages la traitent. Vous vous désinscrivez à tout moment, sans compte, depuis chaque message : votre adresse est alors effacée. Pour vos
              droits d&apos;accès, de rectification ou de suppression, adressez-vous à votre pharmacie.
            </p>
          </section>

          {!state.alreadySubscribed && <OptInForm token={token} />}

          <p className="border-t border-border-subtle pt-4 text-[12px] leading-4 text-text-tertiary">
            Cette page ne contient aucune information sur votre santé et n&apos;en affiche aucune.
          </p>
        </div>
      </div>
    </main>
  );
}
