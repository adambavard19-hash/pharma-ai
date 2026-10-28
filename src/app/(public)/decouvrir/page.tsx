import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { fr, Kicker, SectionHead } from "./_components/site-shell";
import { VideoButton } from "./_components/video-dialog";
import { AutoVideo } from "./_components/auto-video";
import { AppPhoneVisual } from "./_components/app-visual";
import { loadLiveProof } from "@/server/services/site-leads";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { formatEuros } from "@/core/billing/subscription";
import { PricingSection } from "./_components/pricing-section";
import { FeatureCarousel, type FeatureSlide } from "./_components/feature-carousel";
import { RoutineShowcase } from "./_components/routine-showcase";
import { BannerTwoStates } from "./_components/banner-two-states";
import { FlowSteps, LoadVisual, Reveal } from "./_components/story";
import { FAQ } from "./_components/site-content";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { Robot } from "@/components/robot";

/**
 * Le site public. Peu de texte : des mots-clés, les vrais écrans, de l’air.
 * Tout ce qui est affirmé ici existe dans l'application ; les montants des
 * visuels sont ceux du catalogue de démonstration et sont marqués « exemple ».
 * Les ventes au comptoir sont DÉCLARÉES (Vendu / Non vendu) : jamais présentées
 * comme lues dans le logiciel de gestion.
 */

/**
 * L'adresse de référence de l'accueil. Posée ici et non dans le layout : le layout la transmettrait à chaque page du site,
 * qui se déclarerait alors copie de l'accueil. Titre, description et image de partage viennent du layout.
 */
export const metadata: Metadata = { alternates: { canonical: "/decouvrir" } };

/** Les cartes des fonctions. Les points reprennent ce que le site disait déjà ; les échanges sont des exemples. */
const FEATURE_SLIDES: FeatureSlide[] = [
  {
    tab: "Le conseil parfait",
    name: "le conseil parfait",
    tagline: "Parmi les produits qui répondent au besoin du patient, je mets en premier celui qui arrange votre pharmacie.",
    mood: "happy",
    ask: "Augmentin et Doliprane pour ce patient : je lui propose quoi ?",
    answers: ["Un probiotique pendant l'antibiotique : vous en avez en stock, de votre laboratoire préféré.", "Il est en premier dans la bannière. Bipez-le s'il le prend : je le compte comme vendu."],
    points: ["En stock, avec la quantité", "Vos laboratoires préférés", "Vos dates courtes et vos challenges en cours"],
  },
  {
    tab: "Le bilan patient",
    name: "le bilan patient",
    tagline: "Pour la première fois, le patient repart avec un vrai bilan, au nom de votre pharmacie.",
    mood: "celebrate",
    ask: "La patiente veut garder les conseils, elle me donne son e-mail.",
    answers: ["C'est noté. À « Vente terminée », elle reçoit son bilan : ses produits, comment les prendre, les précautions.", "Et 7 jours avant la fin de sa cure, je lui envoie un rappel."],
    points: ["Bilan par e-mail, avec l'accord du patient", "Rappel 7 jours avant la fin de la cure", "Le patient revient à la pharmacie"],
  },
  {
    tab: "L'équipe",
    name: "l'équipe",
    tagline: "Les résultats de chacun. Toute l'équipe motivée.",
    mood: "celebrate",
    ask: "Comment s'en sort l'équipe cette semaine ?",
    answers: ["Les conseils vendus de chacun sont dans « Mon équipe », avec le classement et le challenge en cours.", "Le bilan de la semaine arrive dimanche par e-mail, avec le PDF."],
    points: ["Classement et challenges", "Bilan chaque dimanche par e-mail", "Chacun voit ses propres résultats"],
  },
  {
    tab: "Sans ordonnance",
    name: "le conseil sans ordonnance",
    tagline: "Le client décrit. Vous conseillez.",
    mood: "curious",
    ask: "Une cliente tousse depuis trois jours, toux sèche, pas de fièvre.",
    answers: ["Écrivez sa demande dans la bannière, sans scan : les conseils de votre stock arrivent.", "Une question de la cliente sur le produit ? Demandez à l'aide, elle répond en quelques phrases."],
    points: ["Sans scan : écrivez la demande du patient", "Les conseils de votre stock arrivent", "L'aide répond aux questions sur le conseil"],
  },
  {
    tab: "Surstock",
    name: "le surstock",
    tagline: "Les produits achetés en trop sortent en priorité, avant l'échéance de la facture.",
    mood: "thinking",
    ask: "J'ai trop de vitamines immunité en stock, il faut les écouler.",
    answers: ["Je les mets en campagne : proposées en premier sur les ordonnances que vous choisissez, comme les antibiotiques.", "Je vous montre le stock qui baisse et l'argent encore immobilisé, jusqu'à l'objectif."],
    points: ["Le produit passe en premier au comptoir", "Toujours derrière les contrôles de sécurité", "Arrêt automatique à l'objectif ou à la date"],
  },
];

export default async function SitePage() {
  const [pricing, live] = await Promise.all([loadPublicPricing(), loadLiveProof()]);

  return (
    <>
      {/* ---- Accueil ------------------------------------------------- */}
      {/* L'encre ADN de Dantora en fond du héros, comme sur la page de connexion : l'hélice à droite, son nuage qui déborde
          derrière le texte et les visuels, déformée par la souris. La section remonte sous l'en-tête translucide (-mt-16)
          pour que le fond commence en haut de la fenêtre ; `isolate` garde la couche (z-index négatif) dans la section.
          Le fond menthe est celui de la scène : rien ne bouge quand elle apparaît, après la première peinture. `lazy` :
          libérée à plus d'un écran de distance, elle ne coexiste jamais avec celle du bas de page. Sur téléphone, une
          image fixe allégée. */}
      <section id="accueil" className="relative -mt-16 overflow-hidden pt-16 lg:flex lg:min-h-[min(100dvh,1000px)] lg:flex-col lg:justify-center dark:bg-transparent">
        {/* Une seule encre pour tout le site (consigne du fondateur, 13 oct. 2026) : fixe sous la page, elle reste derrière chaque section jusqu'au bas ; globals.css rend les sections translucides. */}
        <HelixBackdrop framing="hero" lightWhenStill className="max-lg:opacity-70" />
        {/* Le premier écran façon limova.ai (fondateur, 24 oct. 2026, version 1 de /decouvrir/apercu-titre) : un grand titre
            centré qui dit tout de suite ce qu'est PharmaBoost, le robot dans le titre, une phrase qui l'explique, deux boutons. */}
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-5 pt-16 pb-12 text-center md:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3.5 py-1.5 text-[13px] font-medium text-text-secondary backdrop-blur-md dark:border-border-subtle dark:bg-surface-card">
            <span className="size-1.5 rounded-full bg-brand-500" /> À côté de votre logiciel de gestion · le pharmacien décide
          </p>
          <h1 className="mt-6 text-[42px] leading-[1.02] font-bold tracking-[-0.045em] text-text-primary min-[390px]:text-[46px] md:text-[76px]">
            Le copilote IA{" "}
            <span className="mx-2 inline-flex size-[0.95em] translate-y-[0.08em] items-center justify-center rounded-full bg-white/80 align-baseline shadow-[0_10px_30px_-12px_rgba(15,47,42,0.45)] ring-1 ring-white">
              <Robot size={56} mood="happy" />
            </span>{" "}
            du comptoir
            <br />
            <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">de votre pharmacie.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[18px] leading-7 text-text-secondary md:text-[21px] md:leading-8">
            À chaque boîte scannée, PharmaBoost montre à votre équipe le bon produit à conseiller, pris dans votre stock. Plus de conseils vendus, sans changer votre logiciel.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/decouvrir/demo" className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(14,138,123,0.7)] hover:bg-brand-700">
              Réserver une démo <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="#tarif" className="inline-flex h-12 items-center rounded-full border border-border-default bg-white/70 px-6 text-[15px] font-semibold text-text-primary backdrop-blur hover:bg-white">
              Voir le tarif
            </Link>
          </div>
        </div>
        {/* La présentation se lance seule sous le héros, sans le son (fondateur, 20 oct. 2026, d'après limova.ai). */}
        <div className="px-5 pb-16 md:pb-24">
          <AutoVideo src="/video/pharmaboost-presentation.mp4" poster="/video/pharmaboost-presentation.jpg" />
        </div>
      </section>

      {/* ---- Le fil de l'accueil (fondateur, 20 oct. 2026) : le problème, ce qu'est PharmaBoost, ce que le pharmacien y gagne,
           le bilan du patient. Peu de texte, une animation par idée. ---- */}

      {/* ---- 1. Le problème ------------------------------------------ */}
      <section id="probleme" className="scroll-mt-20 border-t border-border-subtle">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center md:py-28">
          <Reveal>
            <h2 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]">Le pharmacien ne peut pas penser à tout.</h2>
          </Reveal>
          <div className="mt-8">
            <LoadVisual />
          </div>
        </div>
      </section>

      {/* ---- 2. Qu'est-ce que PharmaBoost ? ---------------------------- */}
      <section id="banniere" className="scroll-mt-20 border-t border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <Reveal>
            <SectionHead title="PharmaBoost en trois étapes." center bodyClassName="text-[20px] leading-8 font-medium text-text-primary sm:text-[22px] sm:leading-9">
              La bannière PharmaBoost vous montre, dans la foulée du scan, ce qu&apos;il est utile de conseiller. Chaque médicament est suivi d&apos;un ou plusieurs conseils.
            </SectionHead>
          </Reveal>
          <div className="mt-8 flex justify-center">
            <VideoButton film="enBref" label="Voir PharmaBoost en vidéo" />
          </div>
          <FlowSteps />
          {/* La bannière d'aujourd'hui, deux conseils, la routine, le challenge et la date courte : petite, puis ouverte, sur un
              fond noir d'écran Windows (fondateur, 28 oct. 2026). */}
          <div className="mx-auto mt-12 max-w-[1100px]">
            <BannerTwoStates />
          </div>
          <p className="mt-8 text-center text-[13px] text-text-tertiary">La bannière PharmaBoost, reproduite pour le site : au scan, puis ouverte. Médicaments, produits et prix : exemples.</p>
          {/* Les nouveautés de la bannière (fondateur, 22 oct. 2026). */}
          <div className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-3" data-nouveautes-banniere="">
            {[
              { title: "Stock, marge, challenge", line: "Visibles avant même d'ouvrir le conseil, en couleurs." },
              { title: "Demander un conseil", line: "Sans scan : écrivez la demande du patient, les conseils de votre stock arrivent." },
              { title: "Aide", line: "Une question du patient sur le conseil ? Posez-la, l'aide répond en quelques phrases." },
            ].map((feature) => (
              <Reveal key={feature.title}>
                <div className="h-full rounded-2xl border border-border-subtle bg-surface-app p-5">
                  <p className="inline-flex items-center gap-2 text-[16px] font-semibold text-text-primary">
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-white uppercase">Nouveau</span>
                    {feature.title}
                  </p>
                  <p className="mt-2 text-[14.5px] leading-6 text-text-secondary">{feature.line}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- 3. Les fonctions, en cartes qui défilent (fondateur, 26 oct. 2026 : la présentation de limova.ai, aux couleurs
           de PharmaBoost) : le produit conseil parfait, le bilan du patient, l'équipe, la demande sans ordonnance, le surstock. ---- */}
      <section id="stock-marge" className="scroll-mt-20 border-t border-border-subtle">
        <div className="py-20 md:py-28">
          <Reveal>
            <div className="mx-auto mb-10 max-w-3xl px-5 text-center">
              <h2 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]">Un copilote pour tout le comptoir.</h2>
              <p className="mt-4 text-[17px] leading-7 text-text-secondary">Ce que PharmaBoost fait pour votre pharmacie, une fonction à la fois.</p>
            </div>
          </Reveal>
          <span id="suivi" className="block scroll-mt-20" />
          <span id="equipe" className="block scroll-mt-20" />
          <FeatureCarousel slides={FEATURE_SLIDES} />
          {live && (
            <div className="mx-auto mt-12 grid max-w-3xl grid-cols-3 gap-4 px-5">
              <Figure label="Officines" value={String(live.pharmacies)} />
              <Figure label="Conseils acceptés" value={live.acceptedAdvices.toLocaleString("fr-FR")} />
              <Figure label="Ventes additionnelles" value={formatEuros(live.attributedCents)} />
            </div>
          )}
        </div>
      </section>

      {/* ---- 4. La routine (fondateur, 28 oct. 2026 : l'essai B, l'onglet « La routine » seul) : plusieurs produits qui vont
           ensemble, la vraie bannière à gauche. ---- */}
      <section id="routine" className="scroll-mt-20 border-t border-border-subtle">
        <div className="px-5 py-20 md:py-28">
          <Reveal>
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]">Un conseil. Et maintenant, une routine.</h2>
              <p className="mt-4 text-[17px] leading-7 text-text-secondary">Plutôt qu&apos;un seul produit, une prise en charge complète, étape par étape.</p>
            </div>
          </Reveal>
          <Reveal delay={1}>
            <RoutineShowcase />
          </Reveal>
        </div>
      </section>

      {/* ---- 6. L'appli PharmaBoost : des patients qui choisissent une pharmacie PharmaBoost (fondateur, 22 oct. 2026) ---- */}
      <section id="appli" className="scroll-mt-20 border-t border-border-subtle bg-surface-card">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <Reveal>
            <SectionHead kicker="Bientôt · l'appli PharmaBoost" title="Des patients qui choisissent votre pharmacie.">
              {fr("Dans l'appli PharmaBoost, vos patients reçoivent vos offres et celles des laboratoires partenaires. Ces offres ne sont valables que dans les pharmacies PharmaBoost : pour en profiter, ils viennent chez vous.")}
            </SectionHead>
            <ul className="mt-8 grid gap-2.5">
              {["Vos campagnes : une nouvelle gamme à -20 % pour vos patients", "Les offres des laboratoires, seulement en pharmacie PharmaBoost", "Le code de l'offre scanné à votre comptoir, une seule fois", "Parapharmacie et compléments, jamais un médicament"].map((t) => (
                <li key={t} className="flex items-center gap-2.5 rounded-2xl border border-border-subtle bg-surface-app px-4 py-3 text-[15px] font-semibold text-text-primary">
                  <Check className="size-4 shrink-0 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
            <Link href="/decouvrir/application" className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">
              Découvrir l&apos;appli <ArrowRight className="size-4" />
            </Link>
          </Reveal>
          <Reveal delay={2}>
            <AppPhoneVisual />
          </Reveal>
        </div>
      </section>

      {/* ---- Tarif : deux formules, une source (console ou offre officielle) ---- */}
      <PricingSection pricing={pricing} />

      {/* ---- Questions ------------------------------------------------ */}
      <section id="faq" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Questions" title="L'essentiel, en bref." />
          <dl className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="text-[17px] font-semibold text-text-primary">{fr(item.q)}</dt>
                <dd className="mt-2 text-[15px] leading-6 text-text-secondary">{fr(item.a)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Appel final ---------------------------------------------- */}
      {/* La seconde apparition de l'encre, sur grand écran seulement (comme le bloc Contact de Dantora) : la scène ne se
          monte qu'à moins d'un écran de la vue et se démonte en s'éloignant — elle ne coexiste jamais avec celle du héros.
          La carte, en verre dépoli, se range à gauche : l'hélice se tient à sa droite, son encre passe derrière. */}
      <section id="appel-final" className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28 lg:py-36">
          <div className="relative overflow-hidden rounded-[32px] border border-border-subtle bg-surface-card px-7 py-14 text-center sm:px-14 lg:max-w-[38rem] lg:border-white/70 lg:text-left lg:bg-white/55 lg:backdrop-blur-xl dark:lg:border-border-subtle dark:lg:bg-surface-card">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,var(--color-brand-100),transparent_70%)] opacity-70" aria-hidden="true" />
            <div className="relative">
              <Kicker className="justify-center lg:justify-start">PharmaBoost</Kicker>
              <h2 className="mx-auto mt-4 max-w-2xl text-[34px] lg:mx-0 leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]">Voyez-le sur votre comptoir.</h2>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">
                  Réserver une démo <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary tabular">{value}</p>
      <p className="mt-1 font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">{label}</p>
    </div>
  );
}

