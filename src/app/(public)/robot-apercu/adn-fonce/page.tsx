import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DarkDna } from "./dark-dna";

export const metadata: Metadata = { title: "Bannière ADN sur fond foncé", robots: { index: false, follow: false } };

/** La bannière du poste avec l'ADN sur fond foncé, plusieurs couleurs (fondateur, 21 oct. 2026). Développement seulement. */
export default function DarkDnaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DarkDna />;
}
