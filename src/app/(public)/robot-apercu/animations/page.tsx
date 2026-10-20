import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoEffects } from "./effects";

export const metadata: Metadata = { title: "Animations des photos", robots: { index: false, follow: false } };

/**
 * Les produits conseil de la bannière avec leur photo studio, et plusieurs animations à comparer (fondateur, 19 oct. 2026 :
 * « j'aimerais voir une animation dessus, envoie-moi plusieurs effets »). Développement seulement (404 en production).
 */
export default function PhotoEffectsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PhotoEffects />;
}
