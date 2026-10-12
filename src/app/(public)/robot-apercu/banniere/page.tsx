import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HERO_ITEMS } from "../../decouvrir/_components/visuals";
import { VIGILANCE_RULES } from "@/core/ai/engines/vigilance";
import { BannerIslandDemo } from "./demo";

export const metadata: Metadata = { title: "La bannière en île, en aperçu", robots: { index: false, follow: false } };

const DOXY = "DOXYCYCLINE 100 mg";

/**
 * Le prototype de la bannière du comptoir en « île » (façon Coucou), avec notre robot dedans : pour le développement
 * seulement (404 en production, jamais indexé). Les conseils d'exemple sont ceux de l'accueil du site (deux vraies règles
 * du moteur pour une doxycycline, produits du catalogue de démonstration) ; la mise en garde est une vraie règle de
 * vigilance du moteur (cyclines et minéraux, Thésaurus de l'ANSM).
 */
export default function BannerIslandPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const rule = VIGILANCE_RULES.find((r) => r.key === "cycline-quinolone-chelation");
  const alert = rule ? { title: rule.title, text: rule.explanationTemplate.replaceAll("{drug}", DOXY) } : null;
  return <BannerIslandDemo items={HERO_ITEMS.map((item) => ({ ...item, outcome: undefined }))} drug={DOXY} alert={alert} />;
}
