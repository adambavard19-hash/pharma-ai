import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PatientApp } from "./patient-app";

export const metadata: Metadata = { title: "PharmaBoost, l'appli des patients", robots: { index: false, follow: false } };

/** La maquette cliquable de l'appli grand public PharmaBoost (fondateur, 21 oct. 2026). Développement seulement. */
export default function PatientAppPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PatientApp />;
}
