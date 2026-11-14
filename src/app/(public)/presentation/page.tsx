import type { Metadata } from "next";
import { Deck } from "./deck";

/**
 * La présentation de la conférence des titulaires (fondateur, 14 nov. 2026), jouée par Donna sur son iPad : une page à part,
 * hors du menu du site et jamais indexée. Tout est exemple : aucune pharmacie, aucune donnée réelle.
 */
export const metadata: Metadata = {
  title: "Présentation PharmaBoost",
  robots: { index: false, follow: false },
};

export const viewport = { themeColor: "#EAF3EF" };

export default function PresentationPage() {
  return <Deck />;
}
