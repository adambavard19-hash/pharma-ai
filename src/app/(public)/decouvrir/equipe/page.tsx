import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

export const metadata: Metadata = { title: "Qui sommes-nous", description: "PharmaBoost est né dans une officine : une pharmacienne titulaire et un dirigeant, avec l'équipe qui l'utilise." };

const TEAM = [
  {
    name: "Donna Benveniste",
    role: "Présidente · Pharmacienne titulaire",
    body: [
      "Titulaire de la Pharmacie du Docteur Nicolas, où PharmaBoost a été installé en premier.",
      "Les règles de conseil et les vigilances viennent de sa pratique du comptoir.",
    ],
  },
  {
    name: "Adam Bavard",
    role: "Directeur général",
    body: [
      "Produit, technique, officines clientes et partenaires.",
      "Chaque fonction est vérifiée au comptoir de l'officine pilote avant d'être proposée à d'autres.",
    ],
  },
];

export default function TeamPage() {
  const email = PUBLIC_CONTACT_EMAIL;
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="max-w-2xl">
        <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Qui sommes-nous</p>
        <h1 className="mt-3 text-[34px] leading-[1.06] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[46px]">Né dans une officine.</h1>
        <p className="mt-4 text-[17px] leading-7 text-text-secondary">Construit et vérifié au comptoir, avec l&apos;équipe qui l&apos;utilise.</p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {TEAM.map((person) => (
          <article key={person.name} className="rounded-3xl border border-border-subtle bg-surface-card p-8">
            <div className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-[18px] font-semibold text-brand-800" aria-hidden="true">
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
        <dl className="grid gap-px self-start overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2">
          {[
            { k: "Décision", v: "Le pharmacien décide, toujours" },
            { k: "Sécurité", v: "Vérifiée avant toute suggestion" },
            { k: "Réalité", v: "Aucun chiffre estimé, aucun connecteur simulé" },
            { k: "Patient", v: "Aucune donnée de santé conservée" },
          ].map((item) => (
            <div key={item.k} className="bg-surface-card p-6">
              <dt className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{item.k}</dt>
              <dd className="mt-2 text-[16px] font-semibold text-text-primary">{item.v}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-3xl border border-border-subtle bg-surface-card p-8">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-text-primary">Nous contacter</h2>
          <p className="mt-3 text-[15px] leading-7 text-text-secondary">Réponse sous un jour ouvré.</p>
          <a href={`mailto:${email}`} className="mt-4 inline-block text-[18px] font-semibold text-brand-700 underline underline-offset-4">{email}</a>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/decouvrir/demo" className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-[14.5px] font-semibold text-white hover:bg-brand-700">Réserver une démo <ArrowRight className="size-4" /></Link>
            <Link href="/decouvrir#tarif"className="inline-flex h-11 items-center rounded-full border border-border-default px-5 text-[14.5px] font-medium text-text-primary hover:bg-surface-sunken">Voir le tarif</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
