import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DnaBanners } from "./dna";

export const metadata: Metadata = { title: "Bannière et ADN du site", robots: { index: false, follow: false } };

/** La bannière avec l'encre ADN du site public, plusieurs façons, à côté de l'actuelle (fondateur, 19 oct. 2026). Développement seulement. */
export default function DnaBannersPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DnaBanners />;
}
