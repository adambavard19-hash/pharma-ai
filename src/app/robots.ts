import type { MetadataRoute } from "next";

/**
 * Ce que Google peut lire (fondateur, 10 nov. 2026 : « sur Google, PharmaBoost n'apparaît pas en premier ») : le site public
 * et l'appli des patients. Le logiciel des pharmacies, la console et les liens personnels restent fermés.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/decouvrir", "/app"], disallow: ["/admin", "/api", "/poste", "/robot-apercu", "/decouvrir/apercu-", "/decouvrir/lettre", "/decouvrir/merci", "/decouvrir/abonnement/confirmer"] }],
    sitemap: "https://pharmaboost.app/sitemap.xml",
    host: "https://pharmaboost.app",
  };
}
