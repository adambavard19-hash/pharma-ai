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
   * que le bundler ne doit pas tenter d'empaqueter. pdf.js, lui, charge son
   * « worker » comme un module à l'exécution : il doit rester dans
   * node_modules, tel quel, pour le retrouver.
   */
  serverExternalPackages: ["playwright", "playwright-core", "pdfjs-dist"],
  /**
   * Le « worker » de pdf.js n'est référencé par aucun import statique : sans
   * cette ligne, le traçage des fichiers ne l'embarque pas dans la fonction
   * déployée, et la lecture d'un PDF échoue en production.
   */
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
