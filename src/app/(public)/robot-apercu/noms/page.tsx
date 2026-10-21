import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NameAnimations } from "./names";

export const metadata: Metadata = { title: "Animations du nom du conseil", robots: { index: false, follow: false } };

/** Le nom commercial du produit conseil animé, plusieurs essais sur la bannière d'aujourd'hui (fondateur, 21 oct. 2026). Développement seulement. */
export default function NameAnimationsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <NameAnimations />;
}
