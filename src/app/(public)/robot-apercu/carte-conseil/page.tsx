import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardTrials } from "./trials";

export const metadata: Metadata = { title: "La carte du conseil, essais", robots: { index: false, follow: false } };

/**
 * Essais de la carte du conseil de la bannière, plus épurée et plus aérée (fondateur, 22 oct. 2026, d'après Kontoir : « c'est
 * beaucoup plus épuré, on voit bien, c'est classe ») : sept propositions côte à côte (dont deux avec l'ADN vivant), sur le même conseil d'exemple, pour
 * choisir. Développement seulement (404 en production, jamais indexé).
 */
export default function CardTrialsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CardTrials />;
}
