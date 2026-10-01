import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./_components/site-shell";
import { loadCompanyProfile, DEFAULT_CONTACT_EMAIL } from "@/server/services/site-leads";

export const metadata: Metadata = {
  title: { default: "PharmaBoost — Le copilote de comptoir de l'officine", template: "%s · PharmaBoost" },
  description:
    "Au bip de la douchette, PharmaBoost vérifie le traitement, la réglementation et le stock, puis propose le bon conseil sur l'écran du comptoir. Sans changer de logiciel. Le pharmacien décide.",
  robots: { index: true, follow: true },
  openGraph: {
    images: [{ url: "/logo-1200.png", width: 1200, height: 1200, alt: "PharmaBoost" }],
    title: "PharmaBoost — Le copilote de comptoir de l'officine",
    description: "Le conseil associé, vérifié avant d'être proposé, directement au comptoir.",
    locale: "fr_FR",
    type: "website",
  },
};

/** Le site public : aucune session, aucune donnée d'officine, aucun compteur. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const company = await loadCompanyProfile();
  return (
    <div className="min-h-dvh bg-surface-app text-text-primary">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter contactEmail={company?.representativeEmail ?? DEFAULT_CONTACT_EMAIL} />
    </div>
  );
}
