import type { Metadata, ResolvingMetadata } from "next";

/**
 * Ce qu'affiche un lien du site collé dans une messagerie, LinkedIn ou un e-mail.
 *
 * Next.js fusionne les métadonnées en SURFACE : une page qui déclare son `openGraph` remplace tout celui du layout — nom du
 * site, langue, type, et même l'image de `opengraph-image.jpg`, qui n'est rattachée qu'au dossier du site. Vérifié : déclarés
 * seuls, le titre et la phrase de la page faisaient disparaître og:image. Chaque page reprend donc ici le nom du site, la
 * langue et le type, et l'image déjà résolue par le layout.
 */
export const SHARE_BASE = { siteName: "PharmaBoost", locale: "fr_FR", type: "website" } as const;

/**
 * Le partage propre à une page : son titre, sa phrase, l'image du site, et son adresse de référence (`canonical`), relative à
 * `metadataBase` (https://pharmaboost.app, dans le layout racine). Jamais dans le layout du site : chaque page s'y déclarerait
 * copie de l'accueil. À appeler depuis `generateMetadata`, qui seul reçoit les métadonnées du layout (`parent`).
 */
export async function pageShare(
  parent: ResolvingMetadata,
  { path, title, description }: { path: string; title: string; description: string },
): Promise<Pick<Metadata, "alternates" | "openGraph" | "twitter">> {
  const images = (await parent).openGraph?.images ?? [];
  return {
    alternates: { canonical: path },
    openGraph: { ...SHARE_BASE, title, description, url: path, images },
    // Sans image déclarée, Next.js reprend celle d'openGraph pour la carte Twitter / X.
    twitter: { card: "summary_large_image", title, description },
  };
}
