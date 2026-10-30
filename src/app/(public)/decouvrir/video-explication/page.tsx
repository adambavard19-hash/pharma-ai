import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AutoVideo } from "../_components/auto-video";
import { SectionHead } from "../_components/site-shell";

export const metadata: Metadata = { title: "Vidéo d'explication", description: "PharmaBoost en bref : la bannière au comptoir, du scan au conseil." };

/**
 * L'onglet « Vidéo d'explication » (fondateur, 30 oct. 2026) : le film « PharmaBoost en bref », sorti de l'accueil. Il se lance
 * au clic, avec le son, et s'arrête à la fin (« Revoir »).
 */
export default function VideoExplicationPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <SectionHead as="h1" center kicker="Vidéo d'explication" title="PharmaBoost en bref." />
      <AutoVideo src="/video/pharmaboost-en-bref.mp4" poster="/video/pharmaboost-en-bref.jpg" />
      <div className="mt-10 flex justify-center">
        <Link href="/decouvrir/demo" className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-600 px-6 text-[15px] font-semibold text-white hover:bg-brand-700">
          Réserver une démo <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
