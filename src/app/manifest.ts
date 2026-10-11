import type { MetadataRoute } from "next";

/**
 * Le manifeste de PharmaBoost Mobile : ce qui rend /m installable sur l'écran d'accueil (« Ajouter à l'écran
 * d'accueil » sur iPhone, « Installer l'application » sur Android et Chrome).
 *
 * Portée limitée à /m : le comptoir (/, /vente, /stock…) n'est pas concerné — il reste un site, et aucune invite
 * d'installation n'apparaît sur ses écrans. Les icônes sont tirées du robot par `npx tsx scripts/logo-robot.ts --pwa`.
 * Couleur : le fond clair de l'application (#f6fafa, = viewport.themeColor de src/app/(mobile)/m/layout.tsx), qui
 * colore aussi la barre d'état et l'écran de lancement.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/m",
    name: "PharmaBoost Mobile",
    short_name: "PharmaBoost",
    description: "Formations courtes, nouveautés des laboratoires et challenges d'équipe pour les professionnels de l'officine.",
    lang: "fr",
    dir: "ltr",
    start_url: "/m",
    scope: "/m",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6fafa",
    theme_color: "#f6fafa",
    categories: ["education", "medical", "productivity"],
    icons: [
      { src: "/mobile/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/mobile/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/mobile/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
