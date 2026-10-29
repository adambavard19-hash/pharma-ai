import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BannerSuiteTrials } from "./trials";

export const metadata: Metadata = { title: "La bannière après le scan, essais", robots: { index: false, follow: false } };

/**
 * Essais de la bannière après le scan (fondateur, 29 oct. 2026 : « la A et la C, garde les deux ; améliore la suite de la
 * bannière, plusieurs exemples, avec la A et la C comme base de scan »). Développement seulement (404 en production).
 */
export default function BannerSuitePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BannerSuiteTrials />;
}
