import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Camera, Hourglass, History, Sparkles, Tag, Upload, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { countProductsWithoutImageLookup } from "@/server/services/product-images";
import { countLotsNeedingAction } from "@/server/services/stock-lots";
import { Button } from "@/components/ui/button";
import { formatCents, formatNumber } from "@/lib/format";
import { ClassifyProductsButton } from "../classify-button";
import { FetchPhotosButton } from "../photos-button";

export const metadata: Metadata = { title: "Qualité du catalogue" };

const LIST_SIZE = 20;

/**
 * Qualité du catalogue — l'espace de ce qui améliore les conseils sans être le stock : les produits que PharmaBoost n'a pas
 * encore compris, les photos de boîtes, les prix à renseigner, les dates courtes, l'historique des mouvements, l'import
 * avec aperçu des colonnes.
 *
 * Aucun de ces sujets n'est une rupture : un produit « à comprendre » ou sans photo est en stock, avec sa quantité.
 * Ils vivent ici pour que « Mon stock » reste un écran simple.
 */
export default async function CatalogQualityPage() {
  const session = await requirePermission(PERMISSIONS.STOCK_VIEW);
  const pharmacyId = session.scope.pharmacyId;
  const canManage = session.permissions.has(PERMISSIONS.PRODUCT_MANAGE);
  const canImport = session.permissions.has(PERMISSIONS.PRODUCT_IMPORT);

  const where = { pharmacyId, deletedAt: null, isActive: true, salePriceCents: { lte: 0 } };
  const [unclassified, withoutImage, noPriceCount, noPrice, shortDates] = await Promise.all([
    prisma.product.count({ where: { pharmacyId, deletedAt: null, classifiedAt: null } }),
    countProductsWithoutImageLookup(pharmacyId),
    prisma.product.count({ where }),
    prisma.product.findMany({ where, select: { id: true, name: true, brand: true, salePriceCents: true }, orderBy: { name: "asc" }, take: LIST_SIZE }),
    countLotsNeedingAction(session.scope),
  ]);
  const urgentDates = shortDates.urgent + shortDates.expired;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-20">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Mon stock</Link>
      </Button>

      <header className="space-y-1">
        <h1 className="text-[28px] leading-9 font-bold tracking-[-0.025em] text-text-primary">Qualité du catalogue</h1>
        <p className="text-[15px] leading-6 text-text-secondary">Ce qui rend les conseils plus justes. Aucun de ces sujets n&apos;est une rupture de stock : ces produits sont bien en rayon.</p>
      </header>

      <Topic icon={Sparkles} title="Produits à comprendre" count={unclassified} done="Tous vos produits sont compris." text="PharmaBoost n'a pas encore compris ces produits : il ne peut pas leur associer de conseil.">
        {unclassified > 0 && canManage && <ClassifyProductsButton pending={unclassified} />}
      </Topic>

      <Topic icon={Camera} title="Photos de boîtes" count={withoutImage} done="Toutes les boîtes ont leur photo, ou n'en ont pas dans les bases ouvertes." text="Les photos s'affichent avec les conseils. Un produit sans photo reste en stock.">
        {withoutImage > 0 && canManage && <FetchPhotosButton pending={withoutImage} />}
      </Topic>

      <Topic icon={Tag} title="Produits sans prix" count={noPriceCount} done="Tous vos produits ont un prix." text="Sans prix de vente, PharmaBoost ne peut pas chiffrer un conseil.">
        {noPrice.length > 0 && (
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle">
            {noPrice.map((product) => (
              <li key={product.id}>
                <Link href={`/stock/${product.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] hover:bg-surface-sunken/60">
                  <span className="min-w-0 truncate font-medium text-text-primary">
                    {product.name}
                    {product.brand && <span className="font-normal text-text-tertiary"> · {product.brand}</span>}
                  </span>
                  <span className="shrink-0 text-text-tertiary tabular">{formatCents(product.salePriceCents)}</span>
                </Link>
              </li>
            ))}
            {noPriceCount > noPrice.length && <li className="px-4 py-2.5 text-[13px] text-text-tertiary">… et {formatNumber(noPriceCount - noPrice.length)} autres.</li>}
          </ul>
        )}
      </Topic>

      <section className="space-y-2 rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-5">
        <h2 className="text-[17px] leading-6 font-semibold text-text-primary">Aller plus loin</h2>
        <ul className="divide-y divide-border-subtle">
          <ToolLink href="/stock/dates-courtes" icon={Hourglass} label="Dates courtes" hint={urgentDates > 0 ? `${shortDates.expired} expiré${shortDates.expired > 1 ? "s" : ""} · ${shortDates.urgent} urgent${shortDates.urgent > 1 ? "s" : ""}` : "Rien d'urgent"} warn={urgentDates > 0} />
          <ToolLink href="/stock/historique" icon={History} label="Historique des mouvements de stock" hint="Qui a changé quoi, et quand" />
          {canImport && <ToolLink href="/stock/import" icon={Upload} label="Importer un fichier avec l'aperçu des colonnes" hint="Pour un fichier dont les colonnes ne sont pas reconnues" />}
        </ul>
      </section>
    </div>
  );
}

function Topic({ icon: Icon, title, count, done, text, children }: { icon: LucideIcon; title: string; count: number; done: string; text: string; children?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] leading-6 font-semibold text-text-primary">{title}</h2>
          <p className="text-[14px] leading-5 text-text-secondary">{count === 0 ? done : text}</p>
        </div>
        <span className={count === 0 ? "text-[22px] leading-7 font-semibold text-success-600 tabular dark:text-success-500" : "text-[22px] leading-7 font-semibold text-text-primary tabular"}>{formatNumber(count)}</span>
      </div>
      {children}
    </section>
  );
}

function ToolLink({ href, icon: Icon, label, hint, warn = false }: { href: string; icon: LucideIcon; label: string; hint: string; warn?: boolean }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-3 hover:underline">
        <Icon className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-medium text-text-primary">{label}</span>
          <span className={warn ? "block text-[12.5px] text-warning-700 dark:text-warning-400" : "block text-[12.5px] text-text-tertiary"}>{hint}</span>
        </span>
      </Link>
    </li>
  );
}
