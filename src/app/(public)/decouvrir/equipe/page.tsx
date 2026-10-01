import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { loadCompanyProfile, DEFAULT_CONTACT_EMAIL } from "@/server/services/site-leads";

export const metadata: Metadata = { title: "Qui sommes-nous", description: "PharmaBoost est né dans une officine. Une pharmacienne titulaire et un dirigeant qui construisent le copilote de comptoir avec les équipes qui l'utilisent." };

const TEAM = [
  {
    name: "Donna Benveniste",
    role: "Présidente · Pharmacienne titulaire",
    body: [
      "Pharmacienne titulaire de la Pharmacie du Docteur Nicolas, Donna Benveniste dirige PharmaBoost avec le regard de celle qui tient un comptoir tous les jours.",
      "C'est dans son officine que PharmaBoost a été installé en premier, poste par poste, boîte par boîte. Les règles de conseil, les vigilances et la place de la réglementation dans le logiciel viennent de sa pratique : ce qu'un pharmacien doit vérifier avant de proposer quoi que ce soit, et ce qu'il peut dire au patient.",
      "Sa ligne : le logiciel aide, le pharmacien décide. Rien n'atteint le patient sans un professionnel qui l'a voulu.",
    ],
  },
  {
    name: "Adam Bavard",
    role: "Directeur général",
    body: [
      "Adam Bavard dirige PharmaBoost au quotidien : le produit, la technique, les officines clientes et les partenaires.",
      "Il a conçu PharmaBoost pour qu'il s'installe sans changer les habitudes du comptoir : le logiciel de gestion reste en place, la douchette reste la douchette, et le conseil arrive sur l'écran au moment du bip. Chaque fonction a été construite puis vérifiée au comptoir de l'officine pilote avant d'être proposée à d'autres.",
      "Sa ligne : une promesse ne vaut que si elle est tenue sur le poste du pharmacien. Pas de connecteur fictif, pas de chiffre estimé : ce que PharmaBoost affiche est constaté.",
    ],
  },
];

export default async function TeamPage() {
  const company = await loadCompanyProfile();
  const email = company?.representativeEmail ?? DEFAULT_CONTACT_EMAIL;
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="max-w-2xl">
        <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-700 uppercase dark:text-brand-400">Qui sommes-nous</p>
        <h1 className="mt-2 text-[36px] leading-[1.12] font-semibold tracking-[-0.02em] text-text-primary text-balance">Né dans une officine, construit avec ceux qui tiennent le comptoir.</h1>
        <p className="mt-4 text-[17px] leading-7 text-text-secondary">PharmaBoost n&apos;est pas un logiciel pensé de loin. Il a été installé, essayé et corrigé dans une pharmacie, avec son équipe, avant d&apos;être proposé à d&apos;autres. Deux personnes le portent.</p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {TEAM.map((person) => (
          <article key={person.name} className="rounded-3xl border border-border-subtle bg-surface-card p-8">
            <div className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-[18px] font-semibold text-brand-800 dark:bg-brand-950/40 dark:text-brand-300" aria-hidden="true">
                {person.name.split(" ").map((part) => part[0]).join("")}
              </span>
              <div>
                <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-text-primary">{person.name}</h2>
                <p className="text-[13.5px] text-text-secondary">{person.role}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {person.body.map((paragraph) => (
                <p key={paragraph} className="text-[15px] leading-7 text-text-secondary">{paragraph}</p>
              ))}
            </div>
          </article>
        ))}
      </div>

      <section className="mt-14 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl bg-brand-800 p-8 text-white">
          <h2 className="text-[24px] font-semibold tracking-[-0.015em]">Ce à quoi nous tenons</h2>
          <ul className="mt-5 space-y-3 text-[15px] leading-6 text-brand-100">
            <li><strong className="text-white">Le pharmacien décide.</strong> Chaque proposition est acceptée, modifiée ou retirée par un professionnel identifié. C&apos;est tracé.</li>
            <li><strong className="text-white">La sécurité passe avant la vente.</strong> Interactions, contre-indications, réglementation : vérifiées avant que le catalogue soit regardé. La marge n&apos;a pas voix au chapitre.</li>
            <li><strong className="text-white">Rien de fictif.</strong> Pas de connecteur simulé, pas de chiffre estimé. Ce que PharmaBoost affiche a été constaté au comptoir.</li>
            <li><strong className="text-white">Le patient voit sa pharmacie.</strong> Jamais un logiciel. Et PharmaBoost ne conserve aucune donnée de santé rattachée à une personne.</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-border-subtle bg-surface-card p-8">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-text-primary">Nous contacter</h2>
          <p className="mt-3 text-[15px] leading-7 text-text-secondary">Une question, une démonstration, un partenariat : écrivez-nous, nous répondons sous un jour ouvré.</p>
          <a href={`mailto:${email}`} className="mt-4 inline-block text-[18px] font-semibold text-brand-700 underline underline-offset-4 dark:text-brand-400">{email}</a>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/decouvrir/demo" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-[14.5px] font-semibold text-white hover:bg-brand-700">Réserver une démo <ArrowRight className="size-4" /></Link>
            <Link href="/decouvrir#tarifs" className="inline-flex h-11 items-center rounded-xl border border-border-default px-5 text-[14.5px] font-medium text-text-primary hover:bg-surface-sunken">Voir le tarif</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
