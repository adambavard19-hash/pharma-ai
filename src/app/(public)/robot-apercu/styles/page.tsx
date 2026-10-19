import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BannerStyles } from "./styles";

export const metadata: Metadata = { title: "Essais de la bannière", robots: { index: false, follow: false } };

/**
 * Les essais de couleurs et de polices de la bannière du comptoir (fondateur, 19 oct. 2026) : la même vente de deux boîtes,
 * menu du conseil ouvert, dans plusieurs habits — pour choisir. Pour le développement seulement (404 en production).
 */
export default function BannerStylesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BannerStyles />;
}
