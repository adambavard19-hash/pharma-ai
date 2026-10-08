import type { Metadata } from "next";

export const metadata: Metadata = {
  // Le patient voit sa pharmacie, pas un logiciel : le titre et la description hérités de l'application sont remplacés.
  title: { absolute: "Lien introuvable" },
  description: "Ce lien n'est plus valide.",
  applicationName: "Votre pharmacie",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Un lien de nouveautés introuvable, expiré ou falsifié : une page sobre, sans
 * détail technique et sans nom d'outil. Elle sert l'abonnement comme la
 * désinscription.
 */
export default function NewsNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <h1 className="text-xl leading-7 font-bold tracking-[-0.025em] text-text-primary">Ce lien n&apos;est plus valide</h1>
        <p className="text-[13.5px] leading-5 text-text-secondary">
          Il a peut-être expiré, ou il est incomplet. Votre pharmacie reste joignable directement : elle peut vous transmettre un nouveau lien
          pour recevoir ses nouveautés, ou supprimer votre adresse si vous ne souhaitez plus en recevoir.
        </p>
      </div>
    </main>
  );
}
