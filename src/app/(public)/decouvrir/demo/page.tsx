import type { Metadata } from "next";
import { LeadForm } from "../_components/lead-form";

export const metadata: Metadata = { title: "Réserver une démo", description: "Une démonstration de PharmaBoost sur votre poste : analyse d'ordonnance, conseil au scan, stock et marge." };

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-10 pb-16 md:pt-14 md:pb-24">
      <div className="mb-7 max-w-2xl">
        <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Démonstration</p>
        <h1 className="mt-2 text-[30px] leading-[1.08] font-bold tracking-[-0.03em] text-text-primary text-balance md:text-[38px]">Réserver une démo.</h1>
        <p className="mt-3 text-[15.5px] leading-7 text-text-secondary">Sept questions, une minute. En visio ou par téléphone, sur votre poste : nous vous rappelons sous un jour ouvré.</p>
      </div>
      <LeadForm />
    </div>
  );
}
