import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { ArrowRight, BookOpen, Infinity as InfinityIcon, LayoutDashboard, TrendingUp } from "lucide-react";
import { HAIRLINE, Kicker, SectionHead, fr } from "../_components/site-shell";
import { AffiliateSimulator } from "@/components/affiliation/affiliate-simulator";
import { SalesApplicationForm } from "./sales-application-form";
import { cvUploadAvailable } from "@/server/services/sales-applications/intake";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { formatPriceEuros, resolvePublicPricing } from "@/core/pricing/official-offer";
import { AFFILIATE_MAX_RATE_LABEL, AFFILIATE_RATE_LABEL, AFFILIATE_SIGNUP_BONUS_CENTS, AFFILIATE_TIERS, AFFILIATE_TIERS_SENTENCE, monthlyAffiliateCommissionCents } from "@/core/affiliation/terms";

export const metadata: Metadata = {
  title: "Affiliation",
  description: `Programme d'affiliation PharmaBoost : recommandez PharmaBoost aux pharmacies et touchez jusqu'à ${AFFILIATE_MAX_RATE_LABEL} de l'abonnement de chaque pharmacie, chaque mois, aussi longtemps qu'elle reste abonnée, plus ${formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} de prime par pharmacie.`,
  alternates: { canonical: "/decouvrir/affiliation" },
};

/**
 * Le programme d'affiliation (18 oct. 2026, à la place de « Devenir commercial ») : la structure de la page partenaires de
 * Limova, pour PharmaBoost. Les paliers (10 à 20 %) et la prime d'arrivée viennent de `core/affiliation/terms`, le prix de l'abonnement de l'offre publiée dans la
 * console (sinon l'offre officielle) : aucun montant n'est écrit ici. Rien d'inventé : ni avis, ni logo, ni témoignage, ni
 * montant déjà versé. Les ressources citées existent dans l'extranet commercial (plaquette personnalisée, lien de
 * démonstration, pipeline, commissions). Les candidatures arrivent au même endroit qu'avant : console et directeur.
 */
async function loadMonthlyPriceCents(): Promise<number> {
  try {
    return (await loadPublicPricing()).monthlyPriceCents;
  } catch {
    // La base ne répond pas : la page reste lisible avec l'offre officielle.
    return resolvePublicPricing(null).monthlyPriceCents;
  }
}

const STEPS = [
  { title: "Vous postulez", line: "Quelques questions, quelques minutes : qui vous êtes, où vous êtes, votre profil." },
  { title: "Étude et accès", line: "Notre équipe étudie votre candidature. Si elle est acceptée, vous recevez votre espace affilié : votre lien personnel, votre plaquette, vos pharmacies et vos commissions." },
  { title: "Commissions récurrentes", line: `Vous recommandez PharmaBoost aux pharmacies et vous touchez de ${AFFILIATE_RATE_LABEL} à ${AFFILIATE_MAX_RATE_LABEL} de leur abonnement, chaque mois, tant qu'elles restent abonnées, plus ${formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} de prime par pharmacie.` },
];

export default async function AffiliationPage() {
  // Le prix vient de la console : la page est rendue à chaque visite, pas figée à la construction.
  await connection();
  const monthlyPriceCents = await loadMonthlyPriceCents();
  const price = formatPriceEuros(monthlyPriceCents);
  const bonus = formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS);
  // « 12,60 € par pharmacie à 10 %, 15,12 € à 12 %… » : ce que rapporte une pharmacie chaque mois, palier par palier.
  const perPharmacyByTier = AFFILIATE_TIERS.map((tier) => `${formatPriceEuros(monthlyAffiliateCommissionCents(monthlyPriceCents, tier.ratePercent / 100))} à ${tier.ratePercent} %`).join(", ");
  const cvEnabled = cvUploadAvailable();

  const benefits: { icon: ReactNode; title: string; line: string }[] = [
    { icon: <InfinityIcon className="size-5" />, title: "Récurrent à vie", line: `Un pourcentage de l'abonnement de chaque pharmacie que vous apportez, aussi longtemps qu'elle reste abonnée : un revenu qui dure, plus ${bonus} de prime par pharmacie une fois sa mise en service réglée.` },
    { icon: <TrendingUp className="size-5" />, title: `Jusqu'à ${AFFILIATE_MAX_RATE_LABEL}, payé chaque mois`, line: `Plus vous apportez de pharmacies, plus votre taux monte, sur toutes : ${AFFILIATE_TIERS_SENTENCE}. Pour un abonnement à ${price} HT, une pharmacie vous rapporte chaque mois ${perPharmacyByTier}.` },
    { icon: <LayoutDashboard className="size-5" />, title: "Un espace affilié", line: "Votre lien personnel à partager, les pharmacies que vous avez apportées, votre palier et vos commissions, au même endroit." },
    { icon: <BookOpen className="size-5" />, title: "Des ressources prêtes à l'emploi", line: "La plaquette de présentation à vos coordonnées, à envoyer ou imprimer, et votre lien de démonstration : la pharmacie choisit son créneau." },
  ];

  const faq: { q: string; a: string }[] = [
    { q: "Comment rejoindre le programme ?", a: "Remplissez la candidature en bas de cette page. Notre équipe étudie chaque candidature ; si elle est acceptée, vous recevez votre accès à l'espace affilié." },
    { q: "Combien puis-je gagner ?", a: `Un pourcentage de l'abonnement mensuel HT de chaque pharmacie apportée, chaque mois, tant qu'elle reste abonnée. Ce pourcentage dépend du nombre de vos pharmacies abonnées à la fin du mois et s'applique à toutes : ${AFFILIATE_TIERS_SENTENCE}. Pour un abonnement à ${price} HT, une pharmacie vous rapporte chaque mois ${perPharmacyByTier}. En plus, ${bonus} de prime par pharmacie, une fois sa mise en service réglée. Le simulateur donne une estimation, avant impôts et charges.` },
    { q: "Comment suivre mes commissions ?", a: "Dans votre espace affilié : votre lien personnel, les pharmacies que vous avez apportées et vos commissions, mois par mois." },
    { q: "Quels outils sont fournis ?", a: "Une plaquette de présentation à vos coordonnées, à envoyer en PDF ou à imprimer, et un lien de démonstration personnel : une pharmacie qui réserve par ce lien vous est attribuée." },
    { q: "Faut-il être expert en pharmacie ?", a: "Non. Il suffit de connaître des pharmacies et de leur présenter PharmaBoost ; la démonstration et la mise en service sont assurées par notre équipe." },
    { q: "À qui s'adresse le programme ?", a: "À celles et ceux qui côtoient des pharmacies : délégués et visiteurs pharmaceutiques, consultants en officine, groupements et réseaux, pharmaciens et préparateurs, experts-comptables d'officines, commerciaux indépendants." },
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
            <h1 className="mt-7 text-[44px] leading-[1.02] font-bold tracking-[-0.04em] text-text-primary text-balance md:text-[68px]">
              Jusqu&apos;à <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">{AFFILIATE_MAX_RATE_LABEL}</span> de revenus récurrents à vie.
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-text-secondary">
              {fr(`Recommandez PharmaBoost aux pharmacies : vous touchez de ${AFFILIATE_RATE_LABEL} à ${AFFILIATE_MAX_RATE_LABEL} de l'abonnement de chaque pharmacie, chaque mois, aussi longtemps qu'elle reste abonnée, plus ${bonus} de prime par pharmacie. Plus vous en apportez, plus votre taux monte.`)}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="#candidature" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
                Postuler maintenant <ArrowRight className="size-4" />
              </Link>
              <Link href="#comment" className="inline-flex h-12 items-center justify-center rounded-full border border-border-default px-7 text-[15px] font-semibold text-text-primary hover:border-brand-400">
                Comment ça marche
              </Link>
            </div>
          </div>
          <AffiliateSimulator monthlyPriceCents={monthlyPriceCents} />
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
          <SectionHead kicker="Candidature" title="Postuler au programme d'affiliation.">
            Une question à la fois, quelques minutes. Notre équipe étudie chaque candidature.
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
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-7 text-text-secondary">{fr(`Jusqu'à ${AFFILIATE_MAX_RATE_LABEL} de leur abonnement, chaque mois, tant qu'elles restent abonnées, et ${bonus} de prime par pharmacie.`)}</p>
            <div className="mt-9 flex justify-center">
              <Link href="#candidature" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">
                Postuler maintenant <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
