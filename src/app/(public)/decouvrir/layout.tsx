import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./_components/site-shell";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

export const metadata: Metadata = {
  title: { default: "PharmaBoost — Le copilote de comptoir de l'officine", template: "%s · PharmaBoost" },
  description:
    "PharmaBoost analyse l'ordonnance et les produits scannés, croise le stock de l'officine et propose au comptoir les conseils complémentaires. Le pharmacien décide.",
  robots: { index: true, follow: true },
  openGraph: {
    images: [{ url: "/logo-1200.png", width: 1200, height: 1200, alt: "PharmaBoost" }],
    title: "PharmaBoost — Le copilote de comptoir de l'officine",
    description: "Analyse. Conseil. Suivi. Le copilote du comptoir officinal.",
    locale: "fr_FR",
    type: "website",
  },
};

/** Le site public : aucune session, aucune donnée d'officine, aucun compteur. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface-app text-text-primary">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter contactEmail={PUBLIC_CONTACT_EMAIL} />
    </div>
  );
}
