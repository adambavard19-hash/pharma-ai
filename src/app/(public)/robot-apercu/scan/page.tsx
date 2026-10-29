import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScanTrials } from "./trials";

export const metadata: Metadata = { title: "Le scan sur la bannière, essais", robots: { index: false, follow: false } };

/**
 * Essais du moment du scan (fondateur, 29 oct. 2026 : « un changement lors du scan, une animation à la place des trucs
 * d'habitude, plus moderne, plus pro, plus pharmacie ») : cinq animations, chacune suivie de la vraie bannière. Développement
 * seulement (404 en production, jamais indexé).
 */
export default function ScanTrialsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ScanTrials />;
}
