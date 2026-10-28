import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listRoutines } from "@/server/services/central-advice";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import { RoutinesBoard } from "./routines-board";

export const metadata: Metadata = { title: "Routines" };

/**
 * Les routines du comptoir (fondateur, 28 oct. 2026) : « avoir la main pour créer mes propres routines sur des thèmes
 * différents, classées par médicament et par thème, avec des produits de gammes différentes ». Ce qui est créé ici vaut pour
 * toutes les pharmacies ; chacune prend les produits de son stock, ses gammes prioritaires d'abord.
 */
export default async function RoutinesPage() {
  await requirePlatformSession();
  const routines = await listRoutines();
  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Routines"
        description="Une routine propose plusieurs produits ensemble au comptoir (nettoyer, hydrater, traiter…), à la place d'un seul. Choisissez les médicaments qui la déclenchent et, pour chaque étape, le produit et sa gamme."
      />
      <RoutinesBoard routines={routines} types={[...ADVICE_VOCABULARY]} />
    </>
  );
}
