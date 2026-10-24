import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { Robot } from "@/components/robot";
import { AutoVideo } from "../_components/auto-video";

export const metadata: Metadata = { title: "Essai du titre de l'accueil", robots: { index: false, follow: false } };

/**
 * Essais du premier écran de l'accueil (fondateur, 24 oct. 2026, d'après limova.ai) : en arrivant, on comprend tout de suite
 * ce qu'est PharmaBoost — un grand titre centré, une phrase qui l'explique, deux boutons, puis la présentation. Rien n'est
 * promis au-delà de ce que fait l'application (pas de chiffre de gain inventé). Développement seulement.
 */

const G = "bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent";

function InlineRobot() {
  return (
    <span className="mx-2 inline-flex size-[0.95em] translate-y-[0.08em] items-center justify-center rounded-full bg-white/80 align-baseline shadow-[0_10px_30px_-12px_rgba(15,47,42,0.45)] ring-1 ring-white">
      <Robot size={56} mood="happy" />
    </span>
  );
}

const VERSIONS: { id: string; name: string; title: ReactNode; text: ReactNode }[] = [
  {
    id: "1",
    name: "Copilote",
    title: (
      <>
        Le copilote IA <InlineRobot /> du comptoir
        <br />
        <span className={G}>de votre pharmacie.</span>
      </>
    ),
    text: "À chaque boîte scannée, PharmaBoost montre à votre équipe le bon produit à conseiller, pris dans votre stock. Plus de conseils vendus, sans changer votre logiciel.",
  },
  {
    id: "2",
    name: "Vendre plus",
    title: (
      <>
        Vendez plus de conseils
        <br />
        <span className={G}>à chaque ordonnance.</span>
      </>
    ),
    text: "PharmaBoost lit chaque boîte scannée au comptoir et propose le produit qui accompagne le traitement, en stock chez vous. Le pharmacien décide, le patient repart mieux conseillé.",
  },
  {
    id: "3",
    name: "Chaque scan",
    title: (
      <>
        Chaque boîte scannée
        <br />
        devient <span className={G}>un conseil vendu.</span>
      </>
    ),
    text: "Au comptoir, rien ne change : vous scannez comme d'habitude. PharmaBoost vous souffle le conseil associé au traitement, choisi dans votre rayon, et envoie au patient son bilan.",
  },
  {
    id: "4",
    name: "Assistant",
    title: (
      <>
        Un assistant IA <InlineRobot />
        <br />
        <span className={G}>pour votre comptoir.</span>
      </>
    ),
    text: "Libérez votre équipe de la question « qu'est-ce que je peux conseiller ? ». À chaque scan, le bon produit, en stock, avec sa marge et ce qu'il faut dire au patient.",
  },
  {
    id: "5",
    name: "Scan. Conseil. Bilan.",
    title: (
      <>
        Scan. Conseil. <span className={G}>Bilan.</span>
      </>
    ),
    text: "Le copilote du comptoir officinal : à chaque boîte scannée, PharmaBoost propose le conseil qui accompagne le traitement, pris dans votre stock, et le patient repart avec son bilan.",
  },
];

export default async function TitreEssaiPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { v } = await searchParams;
  const version = VERSIONS.find((entry) => entry.id === v) ?? VERSIONS[0];

  return (
    <>
      <section className="relative -mt-16 overflow-hidden pt-16">
        <HelixBackdrop framing="hero" lightWhenStill className="opacity-60" />
        <div className="mx-auto flex max-w-5xl flex-col items-center px-5 pt-16 pb-12 text-center md:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3.5 py-1.5 text-[13px] font-medium text-text-secondary backdrop-blur-md dark:border-border-subtle dark:bg-surface-card">
            <span className="size-1.5 rounded-full bg-brand-500" /> À côté de votre logiciel de gestion · le pharmacien décide
          </p>
          <h1 className="mt-6 text-[42px] leading-[1.02] font-bold tracking-[-0.045em] text-text-primary min-[390px]:text-[46px] md:text-[76px]">{version.title}</h1>
          <p className="mt-6 max-w-2xl text-[18px] leading-7 text-text-secondary md:text-[21px] md:leading-8">{version.text}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/decouvrir/demo" className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(14,138,123,0.7)] hover:bg-brand-700">
              Réserver une démo <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/decouvrir#tarif" className="inline-flex h-12 items-center rounded-full border border-border-default bg-white/70 px-6 text-[15px] font-semibold text-text-primary backdrop-blur hover:bg-white">
              Voir le tarif
            </Link>
          </div>
        </div>
        <div className="px-5 pb-16">
          <AutoVideo src="/video/pharmaboost-presentation.mp4" poster="/video/pharmaboost-presentation.jpg" />
        </div>
      </section>

      <nav aria-label="Versions" className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-24px)] -translate-x-1/2 gap-1 overflow-x-auto rounded-full border border-border-subtle bg-surface-raised/90 p-1 shadow-lg backdrop-blur">
        {VERSIONS.map((entry) => (
          <Link
            key={entry.id}
            href={`/decouvrir/apercu-titre?v=${entry.id}`}
            scroll={false}
            className={`rounded-full px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap ${entry.id === version.id ? "bg-brand-600 text-white" : "text-text-secondary hover:bg-surface-sunken"}`}
          >
            {entry.id} · {entry.name}
          </Link>
        ))}
      </nav>
    </>
  );
}
