import type { Metadata } from "next";
import Link from "next/link";
import { PRESENTATION_VIDEO_POSTER, PRESENTATION_VIDEO_SRC } from "@/core/platform/presentation-video";

export const metadata: Metadata = { title: "Vidéo de présentation", description: "La scène de tous les jours au comptoir, puis la même avec PharmaBoost." };

/**
 * La page qui lit le film de présentation : celle où mènent la vignette et le bouton des e-mails (invitation d'un collaborateur,
 * bienvenue et mise en service du titulaire). Publique, sans session ; le film se lance au clic, avec le son.
 */
/**
 * Les films lus ici : la présentation (par défaut) et les deux prises en main (fondateur, 18 oct. 2026 : le lien de l'e-mail du jour J
 * doit lancer la vidéo tout de suite, sans connexion).
 */
const FILMS = {
  presentation: { src: PRESENTATION_VIDEO_SRC, poster: PRESENTATION_VIDEO_POSTER, eyebrow: "Vidéo de présentation · 1 min 15", title: "« Il vous fallait autre chose ? »", text: "La scène de tous les jours au comptoir, puis la même avec PharmaBoost : à chaque boîte scannée, le bon conseil, pris dans le stock de l'officine. Le pharmacien décide." },
  pharmacien: { src: "/video/prise-en-main-pharmacien.mp4", poster: "/video/prise-en-main-pharmacien.jpg", eyebrow: "Utilisation du logiciel · 2 min", title: "PharmaBoost au comptoir", text: "Scanner, lire le conseil, poser les deux questions, proposer, puis le bilan par e-mail au patient." },
  titulaire: { src: "/video/prise-en-main-titulaire.mp4", poster: "/video/prise-en-main-titulaire.jpg", eyebrow: "Utilisation du logiciel · 2 min 40", title: "PharmaBoost pour le titulaire", text: "Les postes, l'équipe, les résultats et les conseils de la pharmacie." },
} as const;

export default async function PresentationVideoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).film;
  const key = (Array.isArray(raw) ? raw[0] : raw) as keyof typeof FILMS | undefined;
  const film = key && key in FILMS ? FILMS[key] : FILMS.presentation;
  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:py-16">
      <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">{film.eyebrow}</p>
      <h1 className="mt-2 text-[30px] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-text-primary md:text-[38px]">{film.title}</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-7 text-text-secondary">{film.text}</p>
      <div className="mt-8 overflow-hidden rounded-2xl border border-border-subtle bg-black shadow-sm">
        <video className="aspect-video w-full" key={film.src} src={film.src} poster={film.poster} controls playsInline preload="metadata" aria-label={film.title}>
          Votre navigateur ne lit pas cette vidéo. <a href={film.src}>Télécharger le film</a>.
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
