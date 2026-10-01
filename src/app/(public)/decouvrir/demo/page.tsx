import type { Metadata } from "next";
import { Check } from "lucide-react";
import { LeadForm } from "../_components/lead-form";

export const metadata: Metadata = { title: "Réserver une démo", description: "Une démonstration de PharmaBoost sur votre poste : analyse d'ordonnance, conseil au scan, stock et marge." };

export default function DemoPage() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-16 md:py-24 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Démonstration</p>
        <h1 className="mt-2 text-[34px] leading-[1.08] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[42px]">Réserver une démo.</h1>
        <p className="mt-4 text-[16px] leading-7 text-text-secondary">En visio ou par téléphone, sur votre poste. Nous vous rappelons sous un jour ouvré.</p>
        <ul className="mt-8 space-y-3 text-[14.5px] text-text-primary">
          {["Le conseil au scan d'un produit", "L'analyse d'une ordonnance", "Stock et marge", "La demande sans ordonnance", "Le plan de prise du patient"].map((item) => (
            <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-600" /> {item}</li>
          ))}
        </ul>
      </div>
      <div className="relative rounded-[28px] border border-border-subtle bg-surface-card p-7 md:p-9">
        <LeadForm kind="DEMO" />
      </div>
    </div>
  );
}
