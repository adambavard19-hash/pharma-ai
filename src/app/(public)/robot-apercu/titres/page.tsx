import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TitleAnimations } from "./titles";

export const metadata: Metadata = { title: "Animations du titre", robots: { index: false, follow: false } };

/** Le titre du conseil animé, plusieurs essais, sur un fond ADN (fondateur, 19 oct. 2026). Développement seulement. */
export default function TitleAnimationsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TitleAnimations />;
}
