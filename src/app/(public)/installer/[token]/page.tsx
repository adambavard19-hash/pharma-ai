import type { Metadata } from "next";
import { peekPostInstallLink } from "@/server/services/stock-sync";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: { absolute: "Installer PharmaBoost sur ce poste" }, robots: { index: false, follow: false, nocache: true } };

const CONTACT = "contact@pharmaboost.app";

/**
 * La page du lien d'installation d'un poste de comptoir : le titulaire la reçoit
 * par e-mail (ou la prend dans PharmaBoost, Stock → Connecter mon logiciel),
 * l'ouvre sur l'ordinateur de la douchette, et télécharge un seul fichier à
 * double-cliquer. Aucun compte demandé : le jeton long et daté du lien suffit.
 *
 * La page n'écrit rien et ne consomme pas le lien : un aperçu de messagerie ou
 * un antivirus qui l'ouvre ne le grille pas. Le jeton est consommé par
 * l'installateur, quand le poste se relie.
 */
export default async function InstallPostPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await peekPostInstallLink(token);

  return (
    <div className="min-h-dvh bg-[#eef1f4] px-4 py-8">
      <main className="mx-auto max-w-[640px] space-y-4">
        <header className="rounded-2xl bg-white p-6 shadow-lg">
          <p className="text-[12px] font-bold tracking-[0.1em] text-[#0F766E] uppercase">PharmaBoost</p>
          {link ? (
            <>
              <h1 className="mt-1 text-[24px] leading-8 font-bold text-[#111827]">Installer PharmaBoost sur ce poste</h1>
              <p className="mt-2 text-[15px] leading-6 text-[#374151]">
                {link.pharmacyName}
                {link.label ? ` · poste « ${link.label} »` : ""}. À ouvrir sur l&apos;ordinateur Windows où la douchette est branchée.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a href={`/api/agent/installateur/${token}`} className="inline-flex rounded-xl bg-[#0F766E] px-5 py-3 text-[15px] font-semibold text-white">
                  Télécharger l&apos;installateur
                </a>
                <span className="text-[13px] text-[#4b5563]">Windows 10 ou 11 · lien valable jusqu&apos;au {formatDateTime(link.expiresAt)} · un seul poste</span>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-1 text-[24px] leading-8 font-bold text-[#111827]">Ce lien n&apos;est plus valable</h1>
              <p className="mt-2 text-[15px] leading-6 text-[#374151]">
                Un lien d&apos;installation dure sept jours et ne sert qu&apos;une fois : celui-ci a expiré ou a déjà installé un poste.
              </p>
              <p className="mt-3 rounded-lg bg-[#f0faf8] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#0b5c56]">
                Dans PharmaBoost, ouvrez <strong>Stock → Connecter mon logiciel</strong>, cliquez <strong>« Ajouter un poste »</strong> : un nouveau lien est prêt en quelques secondes. Sinon, écrivez-nous : <a href={`mailto:${CONTACT}`} className="font-semibold underline">{CONTACT}</a>.
              </p>
            </>
          )}
        </header>

        {link && (
          <>
            <section className="rounded-2xl bg-white p-6 shadow-lg">
              <h2 className="text-[16px] font-bold text-[#111827]">Ce qui va se passer</h2>
              <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-[14.5px] leading-6 text-[#1f2937]">
                <li>Téléchargez le fichier, puis ouvrez-le d&apos;un double-clic.</li>
                <li>Suivez l&apos;assistant : environ une minute, Internet requis. Aucun mot de passe administrateur, rien à taper.</li>
                <li>L&apos;icône PharmaBoost apparaît près de l&apos;horloge, avec un point vert quand le poste est relié.</li>
                <li>Passez une boîte à la douchette dans votre logiciel : elle arrive dans PharmaBoost, et l&apos;avis s&apos;affiche en bas de l&apos;écran.</li>
              </ol>
            </section>

            <section className="space-y-2 rounded-2xl bg-white p-6 shadow-lg">
              <details className="group">
                <summary className="cursor-pointer text-[14.5px] font-semibold text-[#111827]">Windows affiche un avertissement ?</summary>
                <p className="mt-2 text-[14px] leading-6 text-[#374151]">
                  C&apos;est normal pour un programme qu&apos;il ne connaît pas encore. Dans le navigateur, choisissez <strong>« Conserver »</strong>. À l&apos;ouverture, si « Windows a protégé votre ordinateur » apparaît, cliquez <strong>« Informations complémentaires »</strong>, puis <strong>« Exécuter quand même »</strong>.
                </p>
              </details>
              <details className="group">
                <summary className="cursor-pointer text-[14.5px] font-semibold text-[#111827]">Que fait ce programme sur le poste ?</summary>
                <p className="mt-2 text-[14px] leading-6 text-[#374151]">
                  Il écoute la douchette et envoie à PharmaBoost le code-barres de chaque boîte, à l&apos;instant du bip, puis affiche l&apos;avis. Il ne touche pas à votre logiciel de gestion, n&apos;ouvre aucun de ses fichiers et ne garde aucune frappe au clavier : seuls les codes-barres lus par une douchette sont transmis. Il s&apos;installe dans votre session, sans droits d&apos;administrateur, et se retire depuis « Applications installées ».
                </p>
              </details>
              <details className="group">
                <summary className="cursor-pointer text-[14.5px] font-semibold text-[#111827]">Ça ne marche pas</summary>
                <p className="mt-2 text-[14px] leading-6 text-[#374151]">
                  L&apos;installateur dit lui-même ce qui bloque (Internet, antivirus, lien expiré). Écrivez-nous à <a href={`mailto:${CONTACT}`} className="font-semibold underline">{CONTACT}</a> en disant ce qu&apos;il affiche : nous vous rappelons et nous le faisons avec vous, à distance.
                </p>
              </details>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
