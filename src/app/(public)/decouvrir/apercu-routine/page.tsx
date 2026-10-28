import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoutinePresentations } from "./presentations";

export const metadata: Metadata = { title: "Essais : le conseil et la routine", robots: { index: false, follow: false } };

/**
 * Essais de présentation du site (fondateur, 28 oct. 2026 : « un peu comme limova, parle du conseil mais de la routine aussi,
 * montre-moi plusieurs types de présentations ») : quatre façons de dire le conseil et la routine, avec la vraie bannière du
 * comptoir. Développement seulement (404 en production, jamais indexé).
 */
export default function RoutinePresentationsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RoutinePresentations />;
}
