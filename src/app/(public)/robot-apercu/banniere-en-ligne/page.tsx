import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OnlineBanner } from "./frames";

export const metadata: Metadata = { title: "La bannière en ligne, image par image", robots: { index: false, follow: false } };

/**
 * La bannière telle qu'elle est EN LIGNE aujourd'hui (fondateur, 29 oct. 2026 : « montre-moi les étapes 1 à 8 de ma bannière
 * actuelle, pour voir la différence »), image par image, figée. Développement seulement (404 en production).
 */
export default function OnlineBannerPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <OnlineBanner />;
}
