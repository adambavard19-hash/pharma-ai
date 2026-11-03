import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { AutoVideo } from "../_components/auto-video";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { LetterScan } from "./letter-scan";

export const metadata: Metadata = { title: "Un petit mot pour votre pharmacie", description: "Deux minutes pour découvrir PharmaBoost.", robots: { index: false, follow: false } };

/**
 * La page qu'ouvre le QR code de la lettre glissée sous la porte des pharmacies (fondateur, 31 oct. 2026) : la vidéo de la
 * lettre (refaite le 2 nov. 2026 : la présentation complète, environ 2 min, lancée au clic), puis « Réserver une démonstration », qui mène à la réservation du
 * site. Hors du menu ; chaque ouverture depuis la lettre (`?source=courrier`) est comptée dans Console → Site internet.
 */
export default async function LettrePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const source = (await searchParams).source;
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
      {source === "courrier" && <LetterScan />}
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-0.035em] text-balance text-text-primary md:text-[52px]">
          Bonjour, Docteur.
          <br />
          <span className="text-brand-700">Deux minutes pour découvrir PharmaBoost.</span>
        </h1>
      </div>
      <AutoVideo src="/video/pharmaboost-lettre.mp4" poster="/video/pharmaboost-lettre.jpg" />
      <div className="mt-10 flex flex-col items-center gap-4">
        <Link href="/decouvrir/demo" className="inline-flex h-14 items-center gap-2 rounded-full bg-brand-600 px-8 text-[17px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(14,138,123,0.7)] hover:bg-brand-700">
          Réserver une démonstration <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
        <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`} className="inline-flex items-center gap-2 text-[15px] font-medium text-text-secondary hover:text-text-primary">
          <Mail className="size-4" aria-hidden="true" /> {PUBLIC_CONTACT_EMAIL}
        </a>
      </div>
    </div>
  );
}
