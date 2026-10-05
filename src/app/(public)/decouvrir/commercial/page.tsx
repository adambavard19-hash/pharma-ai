import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { ArrowRight, BadgeCheck, Banknote, Store, TrendingUp } from "lucide-react";
import { HAIRLINE, SectionHead } from "../_components/site-shell";
import { SalesApplicationForm } from "./sales-application-form";
import { cvUploadAvailable } from "@/server/services/sales-applications/intake";
import { getStandardCommissionCents } from "@/server/services/standard-commission";
import { formatPriceEuros, resolveStandardCommissionCents } from "@/core/pricing/official-offer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Devenir commercial",
  description: "Rejoignez l'équipe commerciale de PharmaBoost : vous développez le logiciel auprès des officines, avec une commission pour chaque nouvelle pharmacie activée.",
};

/**
 * La page de recrutement des commerciaux. Le montant de la commission est lu
 * dans la console (réglage « commission standard »), jamais recopié ici ; les
 * bonus, eux, ne sont pas chiffrés. Rien de plus n'est promis : ni fixe, ni
 * statut, ni territoire.
 */
async function loadCommissionCents(): Promise<number> {
  try {
    return await getStandardCommissionCents();
  } catch {
    // La base ne répond pas : la page reste lisible avec la commission officielle.
    return resolveStandardCommissionCents(undefined);
  }
}

export default async function BecomeSalesPage() {
  // Le montant vient de la console : la page est rendue à chaque visite, pas figée à la construction.
  await connection();
  const commission = formatPriceEuros(await loadCommissionCents());
  const cvEnabled = cvUploadAvailable();

  const blocks: { icon: ReactNode; title: string; line: string }[] = [
    { icon: <Store className="size-5" />, title: "Un logiciel pour les pharmacies", line: "PharmaBoost est un logiciel destiné aux pharmacies. Vous le faites connaître aux officines." },
    { icon: <Banknote className="size-5" />, title: "La même commission pour toutes", line: "Quelle que soit la taille de la pharmacie, la commission est la même." },
    { icon: <TrendingUp className="size-5" />, title: "Des bonus possibles", line: "Des bonus de performance ou de volume peuvent s'ajouter à la commission." },
    { icon: <BadgeCheck className="size-5" />, title: "Une pharmacie « activée »", line: "Une pharmacie est considérée comme activée une fois les conditions prévues par PharmaBoost validées : contrat, activation et règlement." },
  ];

  return (
    <>
      {/* ---- Accueil ------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-border-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border-subtle)_1px,transparent_1px)] [mask-image:radial-gradient(70%_70%_at_30%_30%,black,transparent_75%)] bg-[size:64px_64px] opacity-70"
          aria-hidden="true"
        />
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-14 px-5 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1.5 text-[13px] font-medium text-text-secondary">
              <span className="size-1.5 rounded-full bg-brand-500" /> PharmaBoost · équipe commerciale
            </p>
            <h1 className="mt-7 text-[44px] leading-[1.02] font-semibold tracking-[-0.04em] text-text-primary text-balance md:text-[68px]">
              Développez PharmaBoost auprès des{" "}
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">officines.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-text-secondary">
              PharmaBoost est un logiciel destiné aux pharmacies. En rejoignant l&apos;équipe commerciale, vous le présentez aux officines et vous touchez une commission de {commission} pour chaque nouvelle pharmacie activée.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="#candidature" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
                Rejoindre l&apos;équipe <ArrowRight className="size-4" />
              </Link>
              <Link href="#remuneration" className="inline-flex h-12 items-center justify-center rounded-full border border-border-default px-7 text-[15px] font-semibold text-text-primary hover:border-brand-400">
                La rémunération
              </Link>
            </div>
          </div>
          <CommissionCard amount={commission} />
        </div>
      </section>

      {/* ---- La rémunération ------------------------------------------ */}
      <section id="remuneration" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Rémunération" title="Simple, et la même pour toutes les pharmacies." />
          <ul className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
            {blocks.map((block) => (
              <li key={block.title} className="bg-surface-app p-5 sm:p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800" aria-hidden="true">{block.icon}</span>
                <h3 className="mt-4 text-[17px] leading-snug font-semibold text-text-primary">{block.title}</h3>
                <p className="mt-2 text-[14.5px] leading-6 text-text-secondary">{block.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Candidature ---------------------------------------------- */}
      <section id="candidature" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Candidature" title="Rejoindre l'équipe commerciale.">
            Une question à la fois, quelques minutes. Notre équipe étudie chaque candidature.
          </SectionHead>
          <div className="mt-10">
            <SalesApplicationForm cvEnabled={cvEnabled} />
          </div>
        </div>
      </section>
    </>
  );
}

/** La commission, en grand : le seul chiffre de la page. Les bonus n'ont aucun barème affiché. */
function CommissionCard({ amount }: { amount: string }) {
  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:max-w-none">
      <div className="absolute -inset-x-10 -inset-y-12 -z-10 bg-[radial-gradient(55%_55%_at_65%_45%,var(--color-brand-100),transparent_72%)] opacity-90" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[22px] border border-border-subtle bg-surface-card p-6 shadow-[0_30px_80px_-44px_rgba(15,23,42,0.45)] sm:p-9">
        <div className={cn("absolute inset-x-8 top-0 h-px", HAIRLINE)} aria-hidden="true" />
        <p className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">Commission standard</p>
        <p className="mt-4 text-[64px] leading-none font-semibold tracking-[-0.04em] text-text-primary tabular-nums sm:text-[88px]">{amount}</p>
        <p className="mt-4 text-[18px] leading-6 font-semibold text-text-primary">par nouvelle pharmacie activée</p>
      </div>
    </div>
  );
}
