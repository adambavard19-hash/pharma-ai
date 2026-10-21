import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { PatientTabs } from "./_components/tabs";

/**
 * PharmaBoost — l'appli des patients (phase 1, 21 oct. 2026). Une section à part, comme /m (l'appli des pharmaciens) :
 * elle n'importe aucun élément de mise en page du site ni du comptoir. Pensée pour un téléphone (coque iPhone
 * `application-patients/`) ; sur un ordinateur, la colonne reste à la largeur d'un téléphone.
 * Phase 1 : rien n'est enregistré (aucun compte, aucune donnée de santé).
 * Mise de côté par le fondateur (21 oct. 2026) : visible dans l'aperçu seulement, introuvable sur pharmaboost.app.
 */
export const metadata: Metadata = {
  title: { default: "PharmaBoost", template: "%s · PharmaBoost" },
  description: "Scannez un médicament ou un produit de pharmacie : sa fiche officielle, et le conseil qui l'accompagne.",
  applicationName: "PharmaBoost",
  appleWebApp: { capable: true, title: "PharmaBoost", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F3F8F6" };

export default function PatientAppLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="min-h-dvh bg-[#E4EEEA]">
      <div className="relative mx-auto flex min-h-dvh max-w-[440px] flex-col bg-[#F3F8F6] text-[#0F2F2A] shadow-[0_0_60px_-30px_rgba(15,47,42,.4)]">
        <main className="m-safe-top flex-1 pb-24">{children}</main>
        <PatientTabs />
      </div>
    </div>
  );
}
