import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveDna } from "./live-dna";

export const metadata: Metadata = { title: "ADN vivant dans la bannière", robots: { index: false, follow: false } };

/** L'ADN vivant derrière la bannière du scan, trois essais (fondateur, 21 oct. 2026). Développement seulement. */
export default function LiveDnaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LiveDna />;
}
