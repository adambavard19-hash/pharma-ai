import type { Metadata } from "next";
import Link from "next/link";
import { PRESENTATION_VIDEO_POSTER, PRESENTATION_VIDEO_SRC } from "@/core/platform/presentation-video";

export const metadata: Metadata = { title: "Vidéo de présentation", description: "En une minute, ce que PharmaBoost fait au comptoir de l'officine." };

/**
 * La page qui lit le film de présentation : celle où mènent la vignette et le bouton des e-mails (invitation d'un collaborateur,
 * bienvenue et mise en service du titulaire). Publique, sans session ; le film se lance au clic, avec le son.
 */
export default function PresentationVideoPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:py-16">
      <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Vidéo de présentation · 1 min</p>
      <h1 className="mt-2 text-[30px] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-text-primary md:text-[38px]">PharmaBoost, en une minute</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-7 text-text-secondary">Au comptoir, vous scannez les boîtes comme d&apos;habitude : PharmaBoost montre ce qu&apos;il est utile de conseiller en plus, pris dans le stock de l&apos;officine. Le pharmacien décide.</p>
      <div className="mt-8 overflow-hidden rounded-2xl border border-border-subtle bg-black shadow-sm">
        <video className="aspect-video w-full" src={PRESENTATION_VIDEO_SRC} poster={PRESENTATION_VIDEO_POSTER} controls playsInline preload="metadata" aria-label="Vidéo de présentation de PharmaBoost">
          Votre navigateur ne lit pas cette vidéo. <a href={PRESENTATION_VIDEO_SRC}>Télécharger le film</a>.
        </video>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/decouvrir" className="inline-flex h-11 items-center rounded-xl border border-border-default px-5 text-[14.5px] font-medium text-text-primary hover:bg-surface-sunken">
          Découvrir PharmaBoost
        </Link>
        <Link href="/login" className="inline-flex h-11 items-center rounded-xl px-5 text-[14.5px] font-medium text-brand-700 hover:bg-surface-sunken">
          Se connecter
        </Link>
      </div>
    </div>
  );
}
