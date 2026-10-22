import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BadgePercent, Bell, Check, FlaskConical, MapPin, Megaphone, Pill, ScanLine, ShieldCheck, Store, Users } from "lucide-react";
import { HAIRLINE, Kicker, SectionHead, fr } from "../_components/site-shell";
import { AppPhoneVisual, StoreBadges } from "../_components/app-visual";
import { PLUS_PRICE_LABEL } from "@/core/patient-app/offers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "L'appli PharmaBoost",
  description:
    "L'appli PharmaBoost pour les patients : scanner une boîte, retrouver sa pharmacie, profiter des offres de sa pharmacie et des laboratoires partenaires, valables seulement dans les pharmacies PharmaBoost.",
};

/**
 * L'appli des patients, expliquée au patient et au pharmacien (fondateur, 22 oct. 2026). L'appli n'est pas encore sur les
 * magasins d'applications : « Bientôt », jamais un faux lien. Aucune pharmacie, aucun laboratoire, aucun chiffre réel.
 * Jamais « gratuit » ni « essai » (règle du fondateur) : on dit ce qui s'utilise sans abonnement.
 */

const FOR_PATIENT: { icon: ReactNode; title: string; line: string }[] = [
  { icon: <ScanLine className="size-5" />, title: "Scanner une boîte", line: "La fiche officielle du médicament, tirée des bases publiques, en un geste." },
  { icon: <Store className="size-5" />, title: "Ma pharmacie", line: "Le patient choisit sa pharmacie PharmaBoost et reçoit ses offres." },
  { icon: <BadgePercent className="size-5" />, title: "Les offres", line: "Celles de sa pharmacie et celles des laboratoires partenaires, avec un code-barres à montrer au comptoir." },
  { icon: <Pill className="size-5" />, title: "Mon armoire", line: "Ses boîtes à la maison et leurs dates de péremption. Elle reste sur son téléphone." },
  { icon: <MapPin className="size-5" />, title: "Trouver une pharmacie", line: "Les pharmacies PharmaBoost autour de lui, là où les offres sont valables." },
  { icon: <Bell className="size-5" />, title: "Prévenu des nouvelles offres", line: "Par e-mail, seulement s'il l'a demandé. Retirable d'un clic." },
];

const FOR_PHARMACY: { icon: ReactNode; title: string; line: string }[] = [
  { icon: <Megaphone className="size-5" />, title: "Vos campagnes", line: "Une nouvelle gamme ? Publiez « -20 % » pour vos patients ou pour vos abonnés, depuis PharmaBoost." },
  { icon: <FlaskConical className="size-5" />, title: "Les offres des laboratoires", line: "Proposées par les laboratoires partenaires, valables seulement dans les pharmacies PharmaBoost." },
  { icon: <Users className="size-5" />, title: "De nouveaux clients", line: "Pour profiter d'une offre, le patient vient dans une pharmacie PharmaBoost : la vôtre." },
  { icon: <ScanLine className="size-5" />, title: "Au comptoir, un scan", line: "Le code de l'offre se scanne au comptoir, une seule fois. Vous faites la remise en caisse." },
];

const STEPS = [
  { n: "01", title: "L'offre arrive", line: "Le patient la voit dans l'appli, ou reçoit un e-mail s'il l'a demandé." },
  { n: "02", title: "Son code-barres", line: "Il ouvre l'offre : un code à lui, valable une fois." },
  { n: "03", title: "Au comptoir", line: "Le pharmacien scanne le code et fait la remise." },
  { n: "04", title: "C'est compté", line: "L'offre passe « utilisée » sur le téléphone. Le titulaire et le laboratoire voient le nombre d'utilisations." },
];

const COMMITMENTS = [
  { title: "Jamais un médicament", line: "Les offres portent sur la parapharmacie, les soins et les compléments alimentaires. Jamais sur un médicament." },
  { title: "Aucune donnée de santé", line: "L'armoire reste sur le téléphone du patient. L'appli garde son adresse e-mail, chiffrée, et sa pharmacie." },
  { title: "Des e-mails demandés", line: "Le patient n'est prévenu des offres que s'il l'a coché, et l'arrête d'un clic." },
  { title: "Le pharmacien reste le conseil", line: "Une offre n'entre jamais dans un conseil du comptoir. Le pharmacien décide toujours." },
];

export default function ApplicationPage() {
  return (
    <>
      {/* ---- Accueil ------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-14 px-5 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1.5 text-[13px] font-medium text-text-secondary">
              <span className="size-1.5 rounded-full bg-brand-500" /> Bientôt sur iPhone et Android
            </p>
            <h1 className="mt-7 text-[48px] leading-[1] font-bold tracking-[-0.04em] text-text-primary md:text-[68px]">
              L&apos;appli PharmaBoost.
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">Vos patients reviennent.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-text-secondary">
              {fr("Pour le patient : scanner une boîte, retrouver sa pharmacie, profiter de ses offres. Pour la pharmacie : des offres de laboratoires valables seulement dans les pharmacies PharmaBoost, et des patients qui viennent chez vous pour en profiter.")}
            </p>
            <StoreBadges className="mt-9" />
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="#pharmacien" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
                Je suis pharmacien <ArrowRight className="size-4" />
              </Link>
              <Link href="/decouvrir/partenaires#appli" className="inline-flex h-12 items-center justify-center rounded-full border border-border-default px-7 text-[15px] font-semibold text-text-primary hover:border-brand-400">
                Je suis un laboratoire
              </Link>
            </div>
          </div>
          <AppPhoneVisual />
        </div>
      </section>

      {/* ---- Pour le patient ----------------------------------------- */}
      <section id="patient" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Pour le patient" title="Sa pharmacie, dans sa poche." />
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FOR_PATIENT.map((item) => (
              <Feature key={item.title} {...item} />
            ))}
          </ul>
          <div className="mt-10 rounded-3xl border border-brand-200 bg-brand-50 p-6 sm:p-8">
            <Kicker>PharmaBoost+</Kicker>
            <p className="mt-3 text-[22px] leading-tight font-semibold tracking-[-0.02em] text-text-primary md:text-[26px]">{PLUS_PRICE_LABEL}.</p>
            <p className="mt-2 max-w-2xl text-[15.5px] leading-6 text-text-secondary">
              {fr("Le scan, la fiche, l'armoire et les offres ouvertes à tous s'utilisent sans abonnement. PharmaBoost+ ouvre en plus les offres réservées aux abonnés : les nouvelles gammes de sa pharmacie, les meilleures remises des laboratoires.")}
            </p>
          </div>
        </div>
      </section>

      {/* ---- Pour le pharmacien -------------------------------------- */}
      <section id="pharmacien" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:py-28">
        <SectionHead kicker="Pour le pharmacien" title="Des patients qui choisissent une pharmacie PharmaBoost.">
          {fr("Les offres des laboratoires partenaires ne sont valables que dans les pharmacies PharmaBoost. Pour en profiter, le patient vient chez vous plutôt qu'ailleurs.")}
        </SectionHead>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {FOR_PHARMACY.map((item) => (
            <Feature key={item.title} {...item} />
          ))}
        </ul>
        <div className="mt-10 rounded-3xl border border-border-subtle bg-surface-card p-6 sm:p-8">
          <p className="text-[17px] font-semibold text-text-primary">Et la pharmacie qui n&apos;est pas encore PharmaBoost ?</p>
          <p className="mt-2 max-w-3xl text-[15.5px] leading-6 text-text-secondary">
            {fr("Le patient indique sa pharmacie et peut demander qu'elle rejoigne PharmaBoost. Ses patients voient les offres des laboratoires… et les trouvent dans les pharmacies PharmaBoost voisines.")}
          </p>
        </div>
      </section>

      {/* ---- Comment ça marche --------------------------------------- */}
      <section className="border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Comment ça marche" title="De l'offre au comptoir." />
          <ol className="relative mt-14 grid gap-8 sm:grid-cols-2 md:gap-5 lg:grid-cols-4">
            <div className={cn("absolute top-[-1px] right-0 left-0 hidden h-px lg:block", HAIRLINE)} aria-hidden="true" />
            {STEPS.map((step) => (
              <li key={step.n} className="flex flex-col lg:pt-6">
                <span className="font-mono text-[13px] text-brand-700">{step.n}</span>
                <h3 className="mt-1 text-[21px] leading-tight font-semibold tracking-[-0.02em] text-text-primary text-balance">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-6 text-text-secondary">{fr(step.line)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Engagements --------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <SectionHead kicker="Engagements" title="Ce que l'appli ne fera jamais." />
        <ul className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2">
          {COMMITMENTS.map((c) => (
            <li key={c.title} className="bg-surface-card p-5 sm:p-6">
              <p className="flex items-start gap-2.5 text-[17px] leading-snug font-semibold text-text-primary">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" /> {c.title}
              </p>
              <p className="mt-2 text-[14.5px] leading-6 text-text-secondary">{fr(c.line)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Télécharger --------------------------------------------- */}
      <section id="telecharger" className="scroll-mt-20 border-t border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center md:py-28">
          <SectionHead center kicker="Télécharger" title="Bientôt sur votre téléphone.">
            {fr("L'appli PharmaBoost arrive sur l'App Store et Google Play. Pharmaciens : équipez votre officine dès maintenant, vos patients la trouveront chez vous dès sa sortie.")}
          </SectionHead>
          <StoreBadges className="mt-9 flex justify-center" />
          <ul className="mx-auto mt-8 grid max-w-md gap-2 text-left">
            {["Une pharmacie PharmaBoost apparaît dans l'appli", "Vos campagnes publiées depuis PharmaBoost", "Les offres des laboratoires scannées à votre comptoir"].map((line) => (
              <li key={line} className="flex items-center gap-2.5 text-[15px] text-text-primary">
                <Check className="size-4 shrink-0 text-brand-600" aria-hidden="true" /> {line}
              </li>
            ))}
          </ul>
          <Link href="/decouvrir/demo" className="mt-9 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">
            Réserver une démo <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

function Feature({ icon, title, line }: { icon: ReactNode; title: string; line: string }) {
  return (
    <li className="rounded-2xl border border-border-subtle bg-surface-app p-5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800" aria-hidden="true">{icon}</span>
      <p className="mt-4 text-[17px] font-semibold text-text-primary">{title}</p>
      <p className="mt-1.5 text-[14.5px] leading-6 text-text-secondary">{fr(line)}</p>
    </li>
  );
}
