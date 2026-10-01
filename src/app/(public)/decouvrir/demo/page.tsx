import type { Metadata } from "next";
import { Check } from "lucide-react";
import { LeadForm } from "../_components/lead-form";

export const metadata: Metadata = { title: "Réserver une démo", description: "Vingt minutes, sur votre poste de comptoir, pour voir l'avis au bip, la lecture d'ordonnance et le stock relié." };

export default function DemoPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-700 uppercase dark:text-brand-400">Démonstration</p>
        <h1 className="mt-2 text-[34px] leading-[1.12] font-semibold tracking-[-0.02em] text-text-primary text-balance">Vingt minutes, sur votre poste, avec vos boîtes.</h1>
        <p className="mt-4 text-[16px] leading-7 text-text-secondary">Nous vous rappelons sous un jour ouvré pour fixer le créneau. En visio ou par téléphone, pendant que vous bipez une boîte dans votre logiciel : vous voyez l&apos;avis apparaître sur votre écran.</p>
        <ul className="mt-8 space-y-3 text-[14.5px] text-text-primary">
          {["L'avis au bip, par-dessus votre logiciel", "Une ordonnance lue en photo, ligne par ligne", "La sécurité et la réglementation avant le conseil", "Une demande sans ordonnance", "Comment le stock reste à jour"].map((item) => (
            <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" /> {item}</li>
          ))}
        </ul>
      </div>
      <div className="relative rounded-3xl border border-border-subtle bg-surface-card p-7 md:p-9">
        <LeadForm kind="DEMO" />
      </div>
    </div>
  );
}
