import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Permet à `forbidden()` de rendre une vraie page 403 : sans cela, une
    // permission manquante remonte en erreur 500, ce qui donne à un
    // collaborateur l'impression d'une panne plutôt que d'un accès réservé.
    authInterrupts: true,
    serverActions: {
      /**
       * Les ordonnances passent par un Route Handler, qui n'a pas de plafond.
       * Cette valeur couvre le reste : par défaut une Server Action refuse
       * tout corps de plus de 1 Mo, avec une page d'erreur Next brute. On
       * garde de la marge au-delà des 10 Mo utiles, car l'encodage multipart
       * ajoute quelques kilo-octets de bornes et d'en-têtes.
       */
      bodySizeLimit: "12mb",
    },
  },
  /**
   * Le générateur de PDF pilote un Chromium via Playwright : un paquet natif
   * que le bundler ne doit pas tenter d'empaqueter.
   */
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
