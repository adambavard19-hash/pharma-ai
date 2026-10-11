import type { Metadata } from "next";
import { Plaquette } from "@/components/plaquette/plaquette";
import { loadPublicPricing } from "@/server/services/public-pricing";

/**
 * La plaquette GÉNÉRIQUE, seule sur la page : c'est elle que `npm run plaquette:pdf` imprime dans
 * `public/plaquette/pharmaboost-plaquette.pdf`.
 *
 * Aucune session n'est lue et aucune donnée personnelle n'y figure : le contact est l'adresse publique de PharmaBoost, le tarif
 * celui que le site affiche. La page n'est liée nulle part et n'est pas indexée ; les commerciaux passent par l'extranet
 * (« Plaquette »), qui y ajoute leurs coordonnées.
 */
export const metadata: Metadata = {
  title: { absolute: "PharmaBoost — Plaquette de présentation" },
  robots: { index: false, follow: false },
};

export default async function GenericBrochurePage() {
  const pricing = await loadPublicPricing();
  return (
    <main className="min-h-dvh bg-surface-sunken py-8 print:bg-white print:py-0">
      <Plaquette pricing={pricing} />
    </main>
  );
}
