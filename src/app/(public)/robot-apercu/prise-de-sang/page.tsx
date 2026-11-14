import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BloodPreview } from "./blood-preview";

export const metadata: Metadata = { title: "Ma prise de sang expliquée · maquette", robots: { index: false, follow: false } };

/** Maquette « Ma prise de sang expliquée » pour l'appli des patients (fondateur, 14 nov. 2026). Développement seulement. */
export default function BloodPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BloodPreview />;
}
