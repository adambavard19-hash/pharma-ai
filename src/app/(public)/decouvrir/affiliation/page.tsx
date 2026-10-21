import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { ArrowRight, BookOpen, Handshake, LayoutDashboard, PenLine } from "lucide-react";
import { HAIRLINE, Kicker, SectionHead, fr } from "../_components/site-shell";
import { AffiliateSimulator } from "@/components/affiliation/affiliate-simulator";
import { SalesApplicationForm } from "./sales-application-form";
import { RecommendationForm } from "./recommendation-form";
import { cvUploadAvailable } from "@/server/services/sales-applications/intake";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { AFFILIATE_SIGNUP_BONUS_CENTS } from "@/core/affiliation/terms";

export const metadata: Metadata = {
  title: "Affiliation",
  description: `Programme d'affiliation PharmaBoost : indiquez-nous une pharmacie que vous connaissez ; si elle signe, vous touchez ${formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)}.`,
  alternates: { canonical: "/decouvrir/affiliation" },
};

/**
 * Le programme d'affiliation (18 oct. 2026, à la place de « Devenir commercial ») : la structure de la page partenaires de
 * Limova, pour PharmaBoost. Depuis le 20 oct. 2026 (fondateur) : 100 € par pharmacie apportée et signée, plus de
 * pourcentage mensuel, et un formulaire « Recommander une pharmacie ». La prime vient de `core/affiliation/terms` :
 * aucun montant n'est écrit ici. Rien d'inventé : ni avis, ni logo, ni témoignage, ni
 * montant déjà versé. Les ressources citées existent dans l'extranet commercial (plaquette personnalisée, lien de
 * démonstration, pipeline, commissions). Les candidatures arrivent au même endroit qu'avant : console et directeur.
 */
const STEPS = [
  { title: "Vous nous écrivez la pharmacie", line: "Son nom, sa ville, et vos coordonnées : une minute, avec le formulaire ci-dessous." },
  { title: "Nous la contactons", line: "Notre équipe appelle la pharmacie et lui fait la démonstration de PharmaBoost. Vous n'avez rien à vendre." },
  { title: "Elle signe : vous êtes payé", line: `Dès que la pharmacie a signé et réglé sa mise en service, vos ${formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} vous sont versés.` },
];

export default async function AffiliationPage() {
  await connection();
  const bonus = formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS);
  const cvEnabled = cvUploadAvailable();

  const benefits: { icon: ReactNode; title: string; line: string }[] = [
    { icon: <PenLine className="size-5" />, title: "Une minute suffit", line: "Vous nous écrivez le nom et la ville de la pharmacie : c'est tout ce qu'on vous demande." },
    { icon: <Handshake className="size-5" />, title: "Nous faisons la vente", line: "La démonstration, la signature et la mise en service sont assurées par notre équipe." },
    { icon: <LayoutDashboard className="size-5" />, title: `${bonus} par pharmacie signée`, line: `Pas de plafond : chaque pharmacie apportée qui signe vous rapporte ${bonus}, versés dès sa mise en service réglée.` },
    { icon: <BookOpen className="size-5" />, title: "Un espace pour les plus actifs", line: "Vous apportez souvent des pharmacies ? Demandez votre espace affilié : votre lien de démonstration, votre plaquette et le suivi de vos primes." },
  ];

  const faq: { q: string; a: string }[] = [
    { q: "Combien puis-je gagner ?", a: `${bonus} HT pour chaque pharmacie que vous nous apportez et qui signe, sans plafond. La prime est versée une seule fois par pharmacie, dès que sa mise en service est réglée.` },
    { q: "Comment vous indiquer une pharmacie ?", a: "Avec le formulaire « Recommander une pharmacie » de cette page : le nom de la pharmacie, sa ville, et vos coordonnées pour vous verser la prime." },
    { q: "Faut-il être expert en pharmacie ?", a: "Non. Il suffit de connaître des pharmacies ; la démonstration, la signature et la mise en service sont assurées par notre équipe." },
    { q: "Et si la pharmacie ne signe pas ?", a: "Rien ne vous est demandé : la prime n'est due que pour une pharmacie qui signe et règle sa mise en service." },
  ];

  return (
    <>
      {/* ---- Accueil : la promesse et le simulateur --------------------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-border-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border-subtle)_1px,transparent_1px)] [mask-image:radial-gradient(70%_70%_at_30%_30%,black,transparent_75%)] bg-[size:64px_64px] opacity-70"
          aria-hidden="true"
        />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-5 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-[1fr_0.95fr]">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1.5 text-[13px] font-medium text-text-secondary">
              <span className="size-1.5 rounded-full bg-brand-500" /> Programme d&apos;affiliation
            </p>
            <h1 className="mt-7 text-[40px] leading-[1.04] font-bold tracking-[-0.04em] text-text-primary text-balance md:text-[56px]">
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">{bonus}</span> pour chaque pharmacie que vous nous apportez.
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-text-secondary">
              {fr(`Vous connaissez une pharmacie ? Écrivez-nous son nom : notre équipe s'occupe de tout. Si elle signe, vous touchez ${bonus}.`)}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="#recommander" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
                Recommander une pharmacie <ArrowRight className="size-4" />
              </Link>
              <Link href="#comment" className="inline-flex h-12 items-center justify-center rounded-full border border-border-default px-7 text-[15px] font-semibold text-text-primary hover:border-brand-400">
                Comment ça marche
              </Link>
            </div>
          </div>
          <AffiliateSimulator />
        </div>
      </section>

      {/* ---- Pourquoi devenir affilié ----------------------------------- */}
      <section id="avantages" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Avantages" title="Pourquoi devenir affilié ?" />
          <ul className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => (
              <li key={benefit.title} className="bg-surface-app p-5 sm:p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800" aria-hidden="true">{benefit.icon}</span>
                <h3 className="mt-4 text-[17px] leading-snug font-semibold text-text-primary">{benefit.title}</h3>
                <p className="mt-2 text-[14.5px] leading-6 text-text-secondary">{fr(benefit.line)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Comment ça marche ----------------------------------------- */}
      <section id="comment" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Comment ça marche" title="Trois étapes." />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative rounded-2xl border border-border-subtle bg-surface-app p-6">
                <span className="flex size-9 items-center justify-center rounded-full bg-brand-600 text-[14px] font-semibold text-white">{i + 1}</span>
                <h3 className="mt-4 text-[17px] leading-snug font-semibold text-text-primary">{step.title}</h3>
                <p className="mt-2 text-[14.5px] leading-6 text-text-secondary">{fr(step.line)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Recommander une pharmacie ------------------------------------ */}
      <section id="recommander" className="scroll-mt-20">
        <div className="mx-auto max-w-4xl px-5 py-20 md:py-28">
          <SectionHead kicker="Recommander" title="Recommander une pharmacie.">
            {fr(`Écrivez-nous la pharmacie que vous connaissez. Si elle signe, ${bonus} pour vous.`)}
          </SectionHead>
          <div className="mt-10">
            <RecommendationForm bonus={bonus} />
          </div>
        </div>
      </section>

      {/* ---- Questions -------------------------------------------------- */}
      <section id="faq" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Questions" title="Vos questions." />
          <dl className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
            {faq.map((item) => (
              <div key={item.q}>
                <dt className="text-[17px] font-semibold text-text-primary">{fr(item.q)}</dt>
                <dd className="mt-2 text-[15px] leading-6 text-text-secondary">{fr(item.a)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Candidature ------------------------------------------------ */}
      <section id="candidature" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Espace affilié" title="Vous apportez souvent des pharmacies ?">
            Demandez votre espace affilié : votre lien de démonstration, votre plaquette et le suivi de vos primes. Une question à la fois, quelques minutes.
          </SectionHead>
          <div className="mt-10">
            <SalesApplicationForm cvEnabled={cvEnabled} />
          </div>
        </div>
      </section>

      {/* ---- Appel final ------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="relative overflow-hidden rounded-[32px] border border-border-subtle bg-surface-card px-7 py-14 text-center sm:px-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,var(--color-brand-100),transparent_70%)] opacity-70" aria-hidden="true" />
          <div className={`absolute inset-x-10 top-0 h-px ${HAIRLINE}`} aria-hidden="true" />
          <div className="relative">
            <Kicker className="justify-center">Affiliation</Kicker>
            <h2 className="mx-auto mt-4 max-w-2xl text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]">
              Vous connaissez des pharmacies ? Recommandez PharmaBoost.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-7 text-text-secondary">{fr(`${bonus} pour chaque pharmacie apportée qui signe.`)}</p>
            <div className="mt-9 flex justify-center">
              <Link href="#recommander" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">
                Recommander une pharmacie <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
