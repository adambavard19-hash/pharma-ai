import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Building2, Check, Store, UserRound, X } from "lucide-react";
import { HAIRLINE, Kicker, SectionHead } from "../_components/site-shell";
import { PartnerApplicationForm } from "./partner-application-form";
import { PharmaLogo } from "@/components/app/logo";
import { INTEGRATION_MODE_LABELS, type IntegrationMode } from "@/core/partners/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Devenir partenaire",
  description:
    "Laboratoires et marques : présentez vos gammes aux officines qui utilisent PharmaBoost, dans un espace distinct et signalé comme tel. Le conseil au patient reste indépendant.",
};

/**
 * PharmaBoost Partenaires, côté laboratoires et marques : ce que c'est, ce
 * que ça ne change pas, comment candidater. Aucun partenaire, logo, chiffre
 * ni témoignage ici : rien de ce qui n'existe pas encore n'est affiché.
 */

const FOR_PHARMACY = [
  { label: "Découvrir", value: "Les gammes des laboratoires partenaires, dans un espace à part" },
  { label: "Conditions", value: "Les conditions professionnelles proposées par le partenaire" },
  { label: "Formations", value: "Les formations du partenaire sur ses gammes" },
  { label: "Commande", value: "Simple, selon le partenaire : lien B2B, formulaire ou e-mail" },
  { label: "Choix", value: "Le titulaire peut masquer ou refuser une marque" },
];

const FOR_PATIENT = [
  { label: "Conseil", value: "Guidé par sa situation et son traitement, jamais par un partenariat" },
  { label: "Sécurité", value: "Contre-indications et vigilances vérifiées avant toute suggestion" },
  { label: "Décision", value: "Le pharmacien valide chaque conseil" },
  { label: "Données", value: "Aucune information le concernant n'est transmise à un partenaire" },
];

const COMMITMENTS = [
  { title: "Un moteur de conseil indépendant", line: "Les suggestions viennent de la situation du patient, des règles de sécurité et du stock de l'officine. Le moteur ne lit aucune donnée partenaire." },
  { title: "Aucune recommandation à vendre", line: "Un partenaire ne peut ni faire entrer un produit dans un conseil, ni le faire passer devant une référence mieux adaptée." },
  { title: "La sécurité d'abord", line: "Contre-indications, vigilances et validation du pharmacien passent toujours avant une gamme partenaire." },
  { title: "Un espace distinct, signalé", line: "Une gamme partenaire apparaît à part, sous les conseils, et elle est signalée comme telle." },
  { title: "Aucune donnée patient", line: "Aucune information sur un patient ou une ordonnance n'est transmise à un partenaire." },
  { title: "Des statistiques agrégées", line: "Un partenaire ne reçoit que des chiffres d'ensemble. Une commande ou une demande de contact ne lui parvient que si l'officine la passe." },
];

const STEPS = [
  { n: "01", title: "Candidature", line: "Vous présentez votre société, vos gammes et vos outils. Un accusé de réception part aussitôt." },
  { n: "02", title: "Étude par l'équipe", line: "Notre équipe étudie chaque candidature. Rien n'est activé automatiquement." },
  { n: "03", title: "Échange", line: "Nous convenons ensemble des gammes, des conditions et de la façon de travailler." },
  { n: "04", title: "Diffusion aux officines", line: "Les gammes retenues sont présentées aux officines, dans leur espace partenaire." },
];

const MODES: { mode: IntegrationMode; line: string }[] = [
  { mode: "API", line: "Si vous publiez une API : catalogue, disponibilités ou commandes, selon ce qu'elle permet." },
  { mode: "B2B_LINK", line: "Un lien vers votre portail professionnel, porteur d'un code d'attribution." },
  { mode: "FORM", line: "La demande de l'officine vous parvient par un formulaire." },
  { mode: "EMAIL", line: "Les demandes des officines vous parviennent par e-mail." },
  { mode: "IMPORT_EXPORT", line: "Catalogue et commandes échangés par fichier." },
  { mode: "MANUAL", line: "Notre équipe fait le lien, le temps de démarrer." },
];

export default function PartnersPage() {
  return (
    <>
      {/* ---- Accueil ------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-border-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border-subtle)_1px,transparent_1px)] [mask-image:radial-gradient(70%_70%_at_30%_30%,black,transparent_75%)] bg-[size:64px_64px] opacity-70"
          aria-hidden="true"
        />
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-14 px-5 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1.5 text-[13px] font-medium text-text-secondary">
              <span className="size-1.5 rounded-full bg-brand-500" /> PharmaBoost Partenaires · laboratoires et marques
            </p>
            <h1 className="mt-7 text-[56px] leading-[0.98] font-semibold tracking-[-0.04em] text-text-primary md:text-[80px]">
              Référencer.
              <br />
              Former.
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">Commander.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-text-secondary">
              PharmaBoost Partenaires permet à un laboratoire ou à une marque de présenter ses gammes aux officines qui utilisent PharmaBoost : catalogue, conditions professionnelles, formations, commande. Dans un espace à part, signalé comme tel. Le conseil au patient, lui, ne change pas.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="#candidature" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
                Déposer une candidature <ArrowRight className="size-4" />
              </Link>
              <Link href="#engagements" className="inline-flex h-12 items-center justify-center rounded-full border border-border-default px-7 text-[15px] font-semibold text-text-primary hover:border-brand-400">
                Nos engagements
              </Link>
            </div>
          </div>
          <PartnerFlowVisual />
        </div>
      </section>

      {/* ---- Pour la pharmacie, pour le patient ---------------------- */}
      <section className="border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Au comptoir" title="Utile à l'officine. Neutre pour le patient.">
            Vos gammes rejoignent les outils de l&apos;équipe officinale. Le conseil au patient reste celui de son pharmacien.
          </SectionHead>
          <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Audience icon={<Store className="size-5" />} kicker="Pour la pharmacie" title="Découvrir, se former, commander." points={FOR_PHARMACY} />
            <Audience icon={<UserRound className="size-5" />} kicker="Pour le patient" title="Un conseil qui reste guidé par sa situation." points={FOR_PATIENT} />
          </div>
        </div>
      </section>

      {/* ---- Engagements ---------------------------------------------- */}
      <section id="engagements" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:py-28">
        <div className="relative rounded-[28px] border border-border-subtle bg-surface-card p-6 sm:p-9 md:p-12">
          <div className={cn("absolute inset-x-8 top-0 h-px", HAIRLINE)} aria-hidden="true" />
          <SectionHead kicker="Engagements" title="Ce qu'un partenariat ne change pas." />
          <ul className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-3">
            {COMMITMENTS.map((c) => (
              <li key={c.title} className="bg-surface-app p-5 sm:p-6">
                <p className="flex items-start gap-2.5 text-[17px] leading-snug font-semibold text-text-primary">
                  <Check className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" /> {c.title}
                </p>
                <p className="mt-2 text-[14.5px] leading-6 text-text-secondary">{c.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Comment ça se passe -------------------------------------- */}
      <section className="border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Comment ça se passe" title="De la candidature aux officines." />
          <ol className="relative mt-14 grid gap-8 sm:grid-cols-2 md:gap-5 lg:grid-cols-4">
            <div className={cn("absolute top-[-1px] right-0 left-0 hidden h-px lg:block", HAIRLINE)} aria-hidden="true" />
            {STEPS.map((step) => (
              <li key={step.n} className="flex flex-col lg:pt-6">
                <span className="font-mono text-[13px] text-brand-700">{step.n}</span>
                <h3 className="mt-1 text-[21px] leading-tight font-semibold tracking-[-0.02em] text-text-primary text-balance">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-6 text-text-secondary">{step.line}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Modes de travail ----------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <SectionHead kicker="Modes de travail" title="Selon vos outils.">
          Plusieurs façons de travailler sont possibles. Le mode retenu se décide avec vous, selon ce que vous utilisez déjà : aucune intégration n&apos;est supposée d&apos;avance.
        </SectionHead>
        <dl className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((m) => (
            <div key={m.mode} className="bg-surface-card p-5 sm:p-6">
              <dt className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{INTEGRATION_MODE_LABELS[m.mode]}</dt>
              <dd className="mt-2 text-[15.5px] leading-6 text-text-primary">{m.line}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---- Candidature ---------------------------------------------- */}
      <section id="candidature" className="scroll-mt-20 border-t border-border-subtle">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Candidature" title="Présentez votre marque.">
            Une question à la fois, quelques minutes. Notre équipe étudie chaque candidature et vous recontacte.
          </SectionHead>
          <div className="mt-10">
            <PartnerApplicationForm />
          </div>
        </div>
      </section>
    </>
  );
}

function Audience({ icon, kicker, title, points }: { icon: ReactNode; kicker: string; title: string; points: { label: string; value: string }[] }) {
  return (
    <div className="rounded-3xl border border-border-subtle bg-surface-app p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800" aria-hidden="true">{icon}</span>
        <Kicker>{kicker}</Kicker>
      </div>
      <h3 className="mt-5 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-text-primary text-balance md:text-[28px]">{title}</h3>
      <dl className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
        {points.map((p) => (
          <div key={p.label} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-4 py-4 sm:grid-cols-[8.5rem_1fr]">
            <dt className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{p.label}</dt>
            <dd className="text-[16px] font-semibold text-text-primary">{p.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Le circuit d'un partenariat, en schéma : qui transmet quoi, et ce qui ne circule jamais. Aucune marque, aucun chiffre. */
function PartnerFlowVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[580px] lg:max-w-none" aria-hidden="true">
      <div className="absolute -inset-x-10 -inset-y-12 -z-10 bg-[radial-gradient(55%_55%_at_65%_45%,var(--color-brand-100),transparent_72%)] opacity-90" />
      <div className="rounded-[22px] border border-border-subtle bg-surface-card p-4 shadow-[0_30px_80px_-44px_rgba(15,23,42,0.45)] sm:p-6">
        <p className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">Le circuit</p>
        <ol className="mt-4">
          <FlowStep icon={<Building2 className="size-5" />} title="Laboratoire ou marque" line="Gammes, conditions professionnelles, formations" />
          <FlowLink />
          <FlowStep icon={<PharmaLogo size={24} />} title="PharmaBoost" line="Étude de la candidature, diffusion validée par l'équipe" active />
          <FlowLink />
          <FlowStep icon={<Store className="size-5" />} title="Officines PharmaBoost" line="Un espace « gamme partenaire », à part des conseils" />
        </ol>
        <div className="mt-5 rounded-2xl bg-surface-app p-4">
          <p className="font-mono text-[10.5px] tracking-[0.12em] text-text-tertiary uppercase">Jamais</p>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {["Donnée patient transmise", "Ordonnance partagée", "Recommandation achetée"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-card px-2.5 py-1 text-[12px] font-medium text-text-secondary">
                <X className="size-3.5 text-danger-600" strokeWidth={2.5} /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FlowStep({ icon, title, line, active = false }: { icon: ReactNode; title: string; line: string; active?: boolean }) {
  return (
    <li className={cn("flex items-center gap-3.5 rounded-2xl border bg-surface-app px-4 py-3.5", active ? "border-brand-400 ring-2 ring-brand-100" : "border-border-subtle")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-text-primary">{title}</span>
        <span className="block text-[13px] leading-5 text-text-secondary">{line}</span>
      </span>
    </li>
  );
}

function FlowLink() {
  return <li className={cn("ml-9 h-5 w-px", "bg-gradient-to-b from-brand-400 to-[#0796b4]")} />;
}
