import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AskTrials } from "./trials";

export const metadata: Metadata = { title: "Demander un conseil, essais", robots: { index: false, follow: false } };

/**
 * Essais de l'entrée « Demander un conseil » dans la bannière au repos, à la place de la case « Comptoir · Connecté »
 * (fondateur, 23 oct. 2026, photo du Comptoir 6) : plusieurs présentations et plusieurs noms, pour choisir.
 * Développement seulement (404 en production, jamais indexé).
 */
export default function AskTrialsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AskTrials />;
}
