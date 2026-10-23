import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SitePage from "../page";
import { FallingSupplement, type FallStyle } from "../_components/falling-supplement";

export const metadata: Metadata = { title: "Essai de la boîte qui flotte", robots: { index: false, follow: false } };

const STYLES: { id: FallStyle; label: string }[] = [
  { id: "feuille", label: "1 · Feuille" },
  { id: "apesanteur", label: "2 · Apesanteur" },
  { id: "bulle", label: "3 · Bulle" },
  { id: "trio", label: "4 · Trio" },
];

/**
 * L'accueil tel qu'il est, avec une boîte de complément alimentaire qui descend en flottant pendant qu'on défile
 * (fondateur, 23 oct. 2026). Quatre façons à comparer, choisies dans la pastille en bas. Développement seulement.
 */
export default async function BoiteEssaiPage({ searchParams }: { searchParams: Promise<{ style?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { style: asked } = await searchParams;
  const style = STYLES.find((s) => s.id === asked)?.id ?? "feuille";

  return (
    <>
      <SitePage />
      <FallingSupplement key={style} style={style} />
      <nav className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full border border-border-subtle bg-surface-raised/90 p-1 shadow-lg backdrop-blur">
        {STYLES.map((s) => (
          <Link
            key={s.id}
            href={`/decouvrir/apercu-boite?style=${s.id}`}
            scroll={false}
            className={`rounded-full px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap ${s.id === style ? "bg-brand-600 text-white" : "text-text-secondary hover:bg-surface-sunken"}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
