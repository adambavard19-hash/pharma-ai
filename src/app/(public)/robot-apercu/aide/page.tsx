import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpTrials } from "./trials";

export const metadata: Metadata = { title: "L'Aide de la fiche, essais", robots: { index: false, follow: false } };

/** Essais du bloc « Une question du patient ? Aide » dans la fiche menthe (fondateur, 29 oct. 2026). Développement seulement. */
export default function HelpTrialsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HelpTrials />;
}
