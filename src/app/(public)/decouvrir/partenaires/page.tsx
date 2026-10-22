import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BadgePercent, Eye, Megaphone, ReceiptEuro, ScanLine, ShieldCheck, Store } from "lucide-react";
import { SectionHead } from "../_components/site-shell";
import { Reveal } from "../_components/story";
import { PartnerOfferAnimation } from "./partner-offer-animation";
import { PartnerQuickForm } from "./partner-quick-form";

export const metadata: Metadata = {
  title: "Partenaires",
  description:
    "Laboratoires et marques : votre gamme mise en avant dans l'appli PharmaBoost et au comptoir des pharmacies PharmaBoost. Vous payez à l'utilisation.",
};

/**
 * PharmaBoost Partenaires, pour les laboratoires et les marques (refaite le 22 oct. 2026 : « beaucoup trop de texte, on ne
 * comprend rien »). Une phrase, une animation, quatre avantages, trois étapes, le formulaire court. Aucun partenaire, logo
 * ni chiffre réel : la marque de l'animation est « Votre marque ».
 */

const BENEFITS: { icon: ReactNode; title: string; line: string }[] = [
  { icon: <Eye className="size-6" />, title: "De la visibilité", line: "Votre marque dans l'appli PharmaBoost, sous les yeux des patients." },
  { icon: <Store className="size-6" />, title: "Des clients en pharmacie", line: "Votre offre n'est valable qu'en pharmacie PharmaBoost." },
  { icon: <ReceiptEuro className="size-6" />, title: "Payé au résultat", line: "Vous payez à l'utilisation. Rien si personne ne vient." },
  { icon: <Megaphone className="size-6" />, title: "Mesuré", line: "Chaque mois : les utilisations, par pharmacie." },
];

const STEPS: { icon: ReactNode; title: string }[] = [
  { icon: <BadgePercent className="size-6" />, title: "Vous créez votre offre" },
  { icon: <Eye className="size-6" />, title: "Les patients la voient dans l'appli" },
  { icon: <ScanLine className="size-6" />, title: "Elle est scannée au comptoir" },
];

export default function PartnersPage() {
  return (
    <>
      {/* ---- Accueil : une phrase, l'animation --------------------------- */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-12 px-5 pt-12 pb-16 md:pt-20 md:pb-24 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1.5 text-[13px] font-medium text-text-secondary">
              <span className="size-1.5 rounded-full bg-brand-500" /> Laboratoires et marques
            </p>
            <h1 className="mt-6 text-[44px] leading-[1] font-bold tracking-[-0.04em] text-text-primary md:text-[64px]">
              Votre marque,
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">dans la poche des patients.</span>
            </h1>
            <p className="mt-6 max-w-lg text-[18px] leading-7 text-text-secondary">Une offre sur votre gamme dans l&apos;appli PharmaBoost. Les patients viennent l&apos;utiliser en pharmacie PharmaBoost.</p>
            <Link href="#inscription" className="mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-full bg-brand-600 px-8 py-3.5 text-[16px] font-semibold text-white shadow-sm hover:bg-brand-700">
              Devenir partenaire <ArrowRight className="size-4" />
            </Link>
          </div>
          <PartnerOfferAnimation />
        </div>
      </section>

      {/* ---- Les avantages ------------------------------------------------ */}
      <section className="border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <Reveal>
            <SectionHead center title="Ce que vous y gagnez." />
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((b, i) => (
              <Reveal key={b.title} delay={i}>
                <div className="h-full rounded-3xl border border-border-subtle bg-surface-app p-6 transition-transform duration-300 hover:-translate-y-1">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-600 text-white" aria-hidden="true">{b.icon}</span>
                  <p className="mt-5 text-[20px] leading-tight font-semibold tracking-[-0.02em] text-text-primary">{b.title}</p>
                  <p className="mt-2 text-[15px] leading-6 text-text-secondary">{b.line}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Comment ça marche -------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <Reveal>
          <SectionHead center title="Simple comme trois étapes." />
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i}>
              <div className="flex items-center gap-4 rounded-3xl border border-border-subtle bg-surface-card p-5">
                <span className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-800" aria-hidden="true">
                  {s.icon}
                  <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-brand-600 text-[12px] font-bold text-white">{i + 1}</span>
                </span>
                <p className="text-[17px] leading-snug font-semibold text-text-primary">{s.title}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {["Jamais de médicament", "Aucune donnée patient transmise", "Le pharmacien garde le conseil"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-card px-3.5 py-1.5 text-[13px] font-medium text-text-secondary">
              <ShieldCheck className="size-3.5 text-brand-600" aria-hidden="true" /> {t}
            </span>
          ))}
        </div>
      </section>

      {/* ---- Inscription -------------------------------------------------- */}
      <section id="inscription" className="scroll-mt-20 border-t border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-2xl px-5 py-16 md:py-24">
          <SectionHead center title="Devenir partenaire.">
            Dites-nous qui vous êtes et ce que vous cherchez. Nous revenons vers vous rapidement.
          </SectionHead>
          <div className="mt-10">
            <PartnerQuickForm />
          </div>
        </div>
      </section>
    </>
  );
}
