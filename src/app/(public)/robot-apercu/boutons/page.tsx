import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonHovers } from "./hovers";

export const metadata: Metadata = { title: "Boutons au survol", robots: { index: false, follow: false } };

/** Les boutons du site animés au survol, plusieurs essais (fondateur, 21 oct. 2026 : « comme Limova »). Développement seulement. */
export default function ButtonHoversPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ButtonHovers />;
}
