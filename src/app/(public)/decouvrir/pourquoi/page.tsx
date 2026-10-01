import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, HelpCircle, Home, Pill, Users } from "lucide-react";
import { BeforeAfter } from "../_components/before-after";
import { KeyCell, SectionHead } from "../_components/site-shell";
import { VideoButton } from "../_components/video-dialog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pourquoi PharmaBoost", description: "Au comptoir, l'information utile au moment du scan. À la maison, une posologie claire. Le pharmacien décide." };

/**
 * Pourquoi PharmaBoost : deux moments, montrés en « sans / avec ». Peu de
 * texte, aucun jugement sur l'équipe : le sujet est l'information disponible
 * au bon moment, pas la compétence de ceux qui conseillent.
 */
export default function WhyPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="max-w-3xl">
        <SectionHead as="h1" kicker="Pourquoi PharmaBoost" title="Au comptoir, puis à la maison." />
      </div>

      {/* ---- Au comptoir --------------------------------------------- */}
      <section className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <SectionHead n="01" kicker="Au comptoir" title="Votre expertise, augmentée.">
            Le produit en rayon et les vigilances, affichés au moment du scan.
          </SectionHead>
        </div>
        <BeforeAfter
          before={<Counter tone="before" bubbles={["Quel produit avons-nous en rayon ?", "Une vigilance à rappeler ?", "La file d'attente…"]} footer="Tout repose sur la mémoire, en pleine affluence." />}
          after={<Counter tone="after" bubbles={["Flore Équilibre 10 milliards · 34 en rayon", "Contrôles de sécurité faits", "Phrase prête : « votre antibiotique peut perturber la flore… »"]} footer="La suggestion arrive au scan. Le pharmacien décide." />}
        />
      </section>
      <dl className="mt-8 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-3">
        <KeyCell label="Analyse" value="Le traitement délivré" className="bg-surface-card" />
        <KeyCell label="Stock" value="Le rayon à portée" className="bg-surface-card" />
        <KeyCell label="Sécurité" value="Avant toute suggestion" className="bg-surface-card" />
      </dl>

      {/* ---- À la maison --------------------------------------------- */}
      <section className="mt-24 grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="order-2 lg:order-1">
          <BeforeAfter
            before={<HomeScene tone="before" items={["Celui-là, c'est matin ou soir ?", "Pourquoi deux boîtes ?", "Jusqu'à quand ?"]} footer="Les questions arrivent une fois rentré." />}
            after={<HomeScene tone="after" items={["Matin : AMOXICILLINE 1 g · 1 comprimé", "Soir : AMOXICILLINE 1 g · 1 comprimé", "Pendant 6 jours"]} footer="Par QR code, e-mail ou papier. Rien n'est conservé sur le patient." />}
          />
        </div>
        <div className="order-1 lg:order-2">
          <SectionHead n="02" kicker="À la maison" title="Une posologie claire.">
            Le plan de prise et les rappels, sur le téléphone du patient.
          </SectionHead>
        </div>
      </section>
      <dl className="mt-8 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-3">
        <KeyCell label="Posologie" value="QR code, e-mail ou papier" className="bg-surface-card" />
        <KeyCell label="Rappels" value="Dans l'agenda du téléphone" className="bg-surface-card" />
        <KeyCell label="Données" value="Aucune conservée" className="bg-surface-card" />
      </dl>

      {/* ---- Appel ----------------------------------------------------- */}
      <section className="mt-24 rounded-[32px] border border-border-subtle bg-surface-card px-7 py-12 sm:px-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <h2 className="text-[30px] leading-[1.08] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[40px]">L&apos;information utile, au bon moment.</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">Réserver une démo <ArrowRight className="size-4" /></Link>
            <VideoButton />
          </div>
        </div>
      </section>
    </div>
  );
}

/** Le comptoir : une file, le pharmacien, ce qu'il doit avoir en tête. */
function Counter({ bubbles, tone, footer }: { bubbles: string[]; tone: "before" | "after"; footer: string }) {
  const after = tone === "after";
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("flex size-8 items-center justify-center rounded-full", i === 0 ? "bg-brand-100 text-brand-800" : "bg-surface-sunken text-text-tertiary")}><Users className="size-4" /></span>
          ))}
        </div>
        <span className={cn("flex size-10 items-center justify-center rounded-full", after ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-700")} aria-hidden="true"><Pill className="size-5" /></span>
      </div>
      <ul className="mt-4 space-y-2">
        {bubbles.map((text) => (
          <li key={text} className={cn("ml-auto flex w-[92%] items-center gap-2 rounded-2xl rounded-tr-sm px-4 py-2.5 text-[14px] sm:w-[82%]", after ? "bg-brand-50 text-brand-900" : "bg-surface-sunken text-text-secondary italic")}>
            {after ? <Check className="size-4 shrink-0 text-success-600" /> : <HelpCircle className="size-4 shrink-0 text-warning-600" />}
            {text}
          </li>
        ))}
      </ul>
      <p className={cn("mt-4 text-[14px]", after ? "font-semibold text-text-primary" : "text-text-secondary")}>{footer}</p>
    </div>
  );
}

/** La maison : les questions, ou la posologie sur le téléphone. */
function HomeScene({ items, tone, footer }: { items: string[]; tone: "before" | "after"; footer: string }) {
  const after = tone === "after";
  return (
    <div>
      <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase" aria-hidden="true"><Home className="size-4" /> À la maison</div>
      <div className={cn("mt-3 rounded-2xl p-4", after ? "border border-brand-200 bg-surface-card" : "bg-surface-sunken")}>
        {after && <p className="font-mono text-[11px] tracking-[0.12em] text-brand-700 uppercase">Posologie · votre pharmacie</p>}
        <ul className={cn("space-y-2", after && "mt-2")}>
          {items.map((text) => (
            <li key={text} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-[14px]", after ? "bg-brand-50 text-text-primary" : "bg-surface-card text-text-secondary italic")}>
              {after ? <Check className="size-4 shrink-0 text-success-600" /> : <HelpCircle className="size-4 shrink-0 text-warning-600" />}
              {text}
            </li>
          ))}
        </ul>
        {after && (
          <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full bg-brand-600 px-2.5 py-1 font-medium text-white">Rappels dans l&apos;agenda</span>
            <span className="rounded-full border border-border-subtle px-2.5 py-1 text-text-secondary">Rappel de fin de traitement</span>
          </div>
        )}
      </div>
      <p className={cn("mt-4 text-[14px]", after ? "font-semibold text-text-primary" : "text-text-secondary")}>{footer}</p>
    </div>
  );
}
