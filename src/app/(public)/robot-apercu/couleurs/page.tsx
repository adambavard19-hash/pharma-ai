import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ColorTrials } from "./trials";

export const metadata: Metadata = { title: "Les couleurs de la bannière, essais", robots: { index: false, follow: false } };

/**
 * Essais de couleurs de la bannière en cartes (fondateur, 29 oct. 2026 : « c'est un peu léger, trop blanc dans le fond, pas assez
 * impactant »), sur un fond qui imite LGPI. Seule la couleur change. Développement seulement (404 en production).
 */
export default function ColorTrialsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ColorTrials />;
}
