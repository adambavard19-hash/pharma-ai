import type { Metadata } from "next";
import { SiteNudge } from "./_components/site-nudge";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./_components/site-shell";
import { SHARE_BASE } from "./_components/share-metadata";
import { PublicIslandLoader } from "@/components/island/public-island-loader";
import { HERO_ITEMS } from "./_components/visuals";
import { VIGILANCE_RULES } from "@/core/ai/engines/vigilance";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { VisitBeacon } from "./_components/visit-beacon";

/**
 * Le titre de l'accueil est ABSOLU : sans cela, le modèle « %s · PharmaBoost » de la racine s'y ajoutait et l'onglet affichait
 * « PharmaBoost — … · PharmaBoost ». Les pages du site gardent le leur (« Réserver une démo · PharmaBoost »).
 * L'image de partage est `opengraph-image.jpg`, à côté : Next.js l'ajoute seul, à l'accueil comme aux pages du site.
 * Titre et phrase de partage : ceux de l'accueil, sauf pour les pages qui déclarent les leurs (`pageShare`). Pas d'adresse de
 * référence ici : héritée, elle ferait de chaque page une copie de l'accueil.
 *
 * L'aperçu reprend le premier écran de l'accueil (fondateur, 25 oct. 2026 : WhatsApp montrait encore « Scan. Conseil.
 * Bilan. » et l'ancienne bannière). L'image est une composition fixe (le titre, le robot du titre et l'hélice capturés sur
 * l'accueil) en JPEG d'environ 110 Ko : WhatsApp n'affiche pas une image de partage trop lourde (au-delà de ~300 Ko), et la
 * version générée par code, en PNG, pesait 470 Ko avec l'hélice. À refaire si le premier écran change.
 */
const SHARE_TITLE = "PharmaBoost — Le copilote IA du comptoir de votre pharmacie.";
const SHARE_TEXT = "À chaque boîte scannée, PharmaBoost montre à votre équipe le bon produit à conseiller, pris dans votre stock. Plus de conseils vendus, sans changer votre logiciel.";

export const metadata: Metadata = {
  title: { absolute: "PharmaBoost — Le copilote IA du comptoir de votre pharmacie", template: "%s · PharmaBoost" },
  description: SHARE_TEXT,
  robots: { index: true, follow: true },
  openGraph: { title: SHARE_TITLE, description: SHARE_TEXT, ...SHARE_BASE },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: SHARE_TEXT },
};

/** Le site public : aucune session, aucune donnée d'officine, aucun compteur. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-public min-h-dvh bg-surface-app text-text-primary">
      {/* L'île PharmaBoost dans l'en-tête : le comptoir en démonstration, les raccourcis, le robot qui répond. Le robot
          vivant de la marque se tient, lui, à côté du nom « PharmaBoost ». */}
      <SiteHeader island={<PublicIslandLoader demo={islandDemo()} />} />
      <main>{children}</main>
      <SiteFooter contactEmail={PUBLIC_CONTACT_EMAIL} />
      <VisitBeacon />
      <SiteNudge />
    </div>
  );
}

const DOXY = "DOXYCYCLINE 100 mg";

/** L'exemple joué dans l'île : les deux conseils de l'accueil (vraies règles du moteur) et une vraie mise en garde. */
function islandDemo() {
  const rule = VIGILANCE_RULES.find((r) => r.key === "cycline-quinolone-chelation");
  return {
    items: HERO_ITEMS.map(({ name, price, margin, drug, reason, challenge, shortDate, stock, quantity, image, sheet }) => ({ name, price, margin, drug, reason, challenge, shortDate, stock, quantity, image, sheet })),
    drug: DOXY,
    alert: rule ? { title: rule.title, text: rule.explanationTemplate.replaceAll("{drug}", DOXY) } : null,
  };
}
