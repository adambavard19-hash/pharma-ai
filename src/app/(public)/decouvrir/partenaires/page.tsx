import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Eye, ReceiptEuro, Store } from "lucide-react";
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
 * comprend rien », puis « encore trop compliqué ») : un titre, l'appli avec l'emplacement « Votre marque ici », trois mots
 * d'avantages, le formulaire court. Aucun partenaire, logo ni chiffre réel.
 */

const BENEFITS: { icon: ReactNode; title: string; line: string }[] = [
  { icon: <Eye className="size-6" />, title: "Vue", line: "Votre marque dans l'appli." },
  { icon: <Store className="size-6" />, title: "Achetée", line: "En pharmacie PharmaBoost." },
  { icon: <ReceiptEuro className="size-6" />, title: "Payée au résultat", line: "Rien si personne ne vient." },
];

export default function PartnersPage() {
  return (
    <>
      {/* ---- Accueil : un titre, l'image ----------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 pt-12 pb-16 md:pt-20 md:pb-24 lg:grid-cols-[1.1fr_1fr]">
          <div className="text-center lg:text-left">
            <h1 className="text-[46px] leading-[1.02] font-bold tracking-[-0.04em] text-text-primary md:text-[68px]">
              Mettez votre marque
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">dans notre appli.</span>
            </h1>
            <p className="mt-6 text-[19px] leading-7 text-text-secondary">Pour les laboratoires et les marques.</p>
            <Link href="#inscription" className="mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-full bg-brand-600 px-8 py-3.5 text-[16px] font-semibold text-white shadow-sm hover:bg-brand-700">
              Devenir partenaire <ArrowRight className="size-4" />
            </Link>
          </div>
          <PartnerOfferAnimation />
        </div>
      </section>

      {/* ---- Les avantages ------------------------------------------------ */}
      <section className="border-y border-border-subtle bg-surface-card">
        <div className="mx-auto grid max-w-5xl gap-4 px-5 py-14 sm:grid-cols-3 md:py-20">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i}>
              <div className="flex h-full flex-col items-center rounded-3xl border border-border-subtle bg-surface-app p-6 text-center transition-transform duration-300 hover:-translate-y-1">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white" aria-hidden="true">{b.icon}</span>
                <p className="mt-4 text-[22px] leading-tight font-bold tracking-[-0.02em] text-text-primary">{b.title}</p>
                <p className="mt-1.5 text-[15px] text-text-secondary">{b.line}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---- Inscription -------------------------------------------------- */}
      <section id="inscription" className="scroll-mt-20 border-t border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-2xl px-5 py-16 md:py-24">
          <SectionHead center title="Devenir partenaire." />
          <div className="mt-10">
            <PartnerQuickForm />
          </div>
        </div>
      </section>
    </>
  );
}
