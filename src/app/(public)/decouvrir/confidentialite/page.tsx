import type { Metadata } from "next";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

export const metadata: Metadata = { title: "Confidentialité et données" };

export default function PrivacyPage() {
  const email = PUBLIC_CONTACT_EMAIL;
  const blocks: { t: string; p: string[] }[] = [
    { t: "Sur ce site", p: ["Les formulaires de démonstration et d'abonnement collectent le nom de l'officine, le nom du contact, un e-mail, un téléphone et une ville. Ces données servent uniquement à vous répondre et à préparer votre espace. Elles ne sont ni revendues ni partagées.", `Le formulaire « Devenir partenaire » collecte la société, la marque, le nom, la fonction et les coordonnées du contact, et les informations données sur l'offre du laboratoire. Elles servent uniquement à étudier la candidature et à recontacter la marque ; une candidature non retenue est supprimée sur simple demande à ${email}.`, "Ce site ne dépose aucun traceur publicitaire."] },
    { t: "Dans l'application", p: ["PharmaBoost traite, pour le compte de l'officine, des données de délivrance et, lorsque le pharmacien les saisit, des données patient. L'officine est responsable de traitement ; PharmaBoost agit comme sous-traitant, dans le cadre d'un contrat écrit.", "Les données sont isolées par officine, chiffrées en transit et au repos, hébergées chez Vercel (application) et Neon (base de données). Chaque accès et chaque décision de conseil sont journalisés."] },
    { t: "Ce que l'intelligence artificielle voit", p: ["Le modèle lit le texte d'une ordonnance pour en extraire les lignes et classer les médicaments. Il ne reçoit ni le nom du patient, ni le stock, ni les prix. Il ne nomme jamais un produit et ne rédige aucun conseil : les règles de conseil et les vigilances sont écrites et relues par des pharmaciens.", "Un e-mail envoyé à un patient ne contient aucune donnée de santé : seul un lien protégé mène à son plan."] },
    { t: "Vos droits", p: [`Accès, rectification, effacement, opposition : écrivez à ${email}. Pour les données traitées dans l'application, adressez-vous d'abord à votre pharmacie, responsable de traitement.`] },
  ];
  return (
    <article className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-text-primary">Confidentialité et données</h1>
      <p className="mt-4 text-[15px] leading-7 text-text-secondary">Le patient voit sa pharmacie, pas un logiciel. Le pharmacien décide. Aucune donnée n&apos;est revendue. Voici, concrètement, ce que cela veut dire.</p>
      {blocks.map((block) => (
        <section key={block.t} className="mt-10">
          <h2 className="text-[20px] font-semibold text-text-primary">{block.t}</h2>
          {block.p.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-[14.5px] leading-7 text-text-secondary">{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
