import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./_components/site-shell";
import { SHARE_BASE } from "./_components/share-metadata";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

/**
 * Le titre de l'accueil est ABSOLU : sans cela, le modèle « %s · PharmaBoost » de la racine s'y ajoutait et l'onglet affichait
 * « PharmaBoost — … · PharmaBoost ». Les pages du site gardent le leur (« Réserver une démo · PharmaBoost »).
 * L'image de partage est `opengraph-image.tsx`, à côté : Next.js l'ajoute seul, à l'accueil comme aux pages du site.
 * Titre et phrase de partage : ceux de l'accueil, sauf pour les pages qui déclarent les leurs (`pageShare`). Pas d'adresse de
 * référence ici : héritée, elle ferait de chaque page une copie de l'accueil.
 */
export const metadata: Metadata = {
  title: { absolute: "PharmaBoost — Le copilote de comptoir de l'officine", template: "%s · PharmaBoost" },
  description:
    "Au comptoir, vous scannez les boîtes comme d'habitude : PharmaBoost montre ce qu'il est utile de conseiller en plus, pris dans le stock de l'officine. Le pharmacien décide.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "PharmaBoost — Scan. Conseil. Bilan.",
    description: "Scan. Conseil. Bilan. Le copilote du comptoir officinal : au scan, le conseil qui accompagne le traitement, pris dans votre rayon.",
    ...SHARE_BASE,
  },
  twitter: {
    card: "summary_large_image",
    title: "PharmaBoost — Scan. Conseil. Bilan.",
    description: "Le copilote du comptoir officinal : au scan, le conseil qui accompagne le traitement, pris dans votre rayon.",
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
