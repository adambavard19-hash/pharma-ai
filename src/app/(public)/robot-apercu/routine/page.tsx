import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoutineTrials } from "./trials";

export const metadata: Metadata = { title: "La routine sur la bannière, essais", robots: { index: false, follow: false } };

/**
 * Essais de la routine sur la bannière du comptoir (fondateur, 28 oct. 2026 : « la voir déjà sur la petite bannière… le mot
 * routine dessus… au clic, une deuxième bannière à part avec la routine… le moins de place possible, le même visuel ») :
 * quatre présentations côte à côte, sur la vraie bannière. Développement seulement (404 en production, jamais indexé).
 */
export default function RoutineTrialsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RoutineTrials />;
}
