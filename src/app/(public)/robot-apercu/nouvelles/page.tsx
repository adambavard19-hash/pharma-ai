import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewBanners } from "./concepts";

export const metadata: Metadata = { title: "Nouvelles bannières", robots: { index: false, follow: false } };

/**
 * Quatre idées de bannière du comptoir, complètement différentes de l'actuelle (fondateur, 19 oct. 2026 : « des bannières
 * améliorées et super pratiques ») : maquettes cliquables sur un faux écran de LGPI, avec la même vente. Pour le développement
 * seulement (404 en production) ; rien n'est branché au poste.
 */
export default function NewBannersPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <NewBanners />;
}
