import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { AddToStock } from "./add-to-stock";

export const metadata: Metadata = { title: "Ajouter un produit" };

export default async function AddToStockPage() {
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUST);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Retour au stock</Link>
      </Button>
      <PageHeader
        title="Ajouter un produit"
        description="Cherchez par nom, code CIP ou code-barres. Un produit déjà suivi est mis à jour, jamais dupliqué."
      />
      <AddToStock canManage={session.permissions.has(PERMISSIONS.PRODUCT_MANAGE)} />
    </div>
  );
}
