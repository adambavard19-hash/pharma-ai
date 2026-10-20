import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BannerBackgrounds } from "./backgrounds";

export const metadata: Metadata = { title: "Fonds de bannière", robots: { index: false, follow: false } };

/** La bannière du poste avec plusieurs couleurs de fond, à comparer (fondateur, 19 oct. 2026). Développement seulement. */
export default function BannerBackgroundsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BannerBackgrounds />;
}
