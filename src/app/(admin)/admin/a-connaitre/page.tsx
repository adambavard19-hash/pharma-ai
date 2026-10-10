import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listGaps } from "@/server/services/knowledge-gaps";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import { AdminPageHeader } from "@/components/admin/page-header";
import { GapsBoard, type GapCard } from "./gaps-board";

export const metadata: Metadata = { title: "Produits à connaître" };

/**
 * Ce que PharmaBoost n'a pas su ranger dans le stock des pharmacies. Visible ici seulement : le titulaire ne voit rien de tout cela.
 * La pharmacienne répond une fois ; la réponse vaut pour toutes les pharmacies et le sujet ne revient plus.
 */
export default async function GapsPage() {
  await requirePlatformSession();
  const { open, recent } = await listGaps();
  const card = (gap: (typeof open)[number]): GapCard => ({ ...gap, answeredAt: gap.answeredAt ? gap.answeredAt.toISOString() : null, createdAt: gap.createdAt.toISOString() });
  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Produits à connaître"
        description="Quand une pharmacie envoie son stock, PharmaBoost range chaque produit et classe chaque médicament. Ce qu'il ne sait pas ranger arrive ici : vous répondez une fois, et c'est appris pour toutes les pharmacies."
      />
      <GapsBoard open={open.map(card)} recent={recent.map(card)} categories={PRODUCT_CATEGORIES.map((code) => ({ code, label: PRODUCT_CATEGORY_LABELS[code] }))} tags={[...ADVICE_VOCABULARY]} />
    </>
  );
}
