import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listPriorityFamilies } from "@/server/services/advice-priorities";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import { PriorityBoard } from "./priority-board";

export const metadata: Metadata = { title: "Priorités des conseils" };

/**
 * Les priorités des conseils par famille de médicaments (fondateur, 26 oct. 2026) : « règle 1, règle 2, règle 3, et que je
 * puisse choisir ». Ce qui est enregistré ici vaut pour toutes les pharmacies, dès la vente suivante.
 */
export default async function AdvicePrioritiesPage() {
  await requirePlatformSession();
  const families = await listPriorityFamilies();
  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Priorités"
        description="Choisissez une famille de médicaments, puis rangez ses conseils avec les flèches : la règle 1 passe en premier au comptoir, puis la règle 2, la règle 3… Vous pouvez aussi ajouter un conseil, le modifier ou retirer ceux qui ne servent à rien. Valable pour toutes les pharmacies."
      />
      <PriorityBoard families={families} categories={PRODUCT_CATEGORIES.map((code) => ({ code, label: PRODUCT_CATEGORY_LABELS[code] }))} tags={[...ADVICE_VOCABULARY]} />
    </>
  );
}
