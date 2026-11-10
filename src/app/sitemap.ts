import type { MetadataRoute } from "next";

/** Les pages du site public que Google doit connaître (fondateur, 10 nov. 2026). L'accueil d'abord. */
const PAGES: { path: string; priority: number }[] = [
  { path: "/decouvrir", priority: 1 },
  { path: "/decouvrir/pourquoi", priority: 0.8 },
  { path: "/decouvrir/demo", priority: 0.8 },
  { path: "/decouvrir/abonnement", priority: 0.8 },
  { path: "/decouvrir/video", priority: 0.6 },
  { path: "/decouvrir/video-explication", priority: 0.6 },
  { path: "/decouvrir/application", priority: 0.6 },
  { path: "/decouvrir/partenaires", priority: 0.5 },
  { path: "/decouvrir/affiliation", priority: 0.5 },
  { path: "/decouvrir/commercial", priority: 0.4 },
  { path: "/decouvrir/mentions-legales", priority: 0.2 },
  { path: "/decouvrir/confidentialite", priority: 0.2 },
  { path: "/decouvrir/conditions", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority }) => ({ url: `https://pharmaboost.app${path}`, changeFrequency: "weekly", priority }));
}
