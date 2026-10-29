import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SaleEndTrials } from "./trials";

export const metadata: Metadata = { title: "La vente pas à pas, et sa fin : essais", robots: { index: false, follow: false } };

/**
 * La vente du poste, image par image, sans minuterie (fondateur, 29 oct. 2026 : « ça va trop vite, j'ai pas le temps de tout
 * voir »), puis des propositions pour la fin : l'e-mail du bilan et le « Bravo ». Développement seulement (404 en production).
 */
export default function SaleEndPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SaleEndTrials />;
}
