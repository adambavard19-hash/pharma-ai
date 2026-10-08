import type { Metadata } from "next";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { SettingsTabs } from "../settings-tabs";
import { RulesManager } from "./rules-manager";

export const metadata: Metadata = { title: "Mes préférences de conseil" };

/**
 * Les préférences de conseil de l'officine : ce que SON titulaire veut privilégier ou ne plus proposer (une référence, une
 * catégorie, un laboratoire).
 *
 * Les règles de conseil elles-mêmes — leur liste, leur relecture, leur validation — ne sont pas ici : elles sont communes à
 * toutes les pharmacies et se gèrent UNE fois, dans la console de PharmaBoost (Conseils). Le titulaire ne voit que ce qu'il écrit
 * lui-même : ses préférences ici, ses associations dans « Mes associations ».
 */
export default async function PharmacyPreferencesPage() {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);

  const [rules, products] = await Promise.all([
    prisma.pharmacyRule.findMany({
      where: { pharmacyId: session.scope.pharmacyId },
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true, brand: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.product.findMany({
      where: { pharmacyId: session.scope.pharmacyId, deletedAt: null, isActive: true },
      select: { id: true, name: true, brand: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres"
        description="Officine, équipe, préférences de conseil, moteur et conformité — tout ce qui se règle une fois, pas à chaque patient."
      />

      <SettingsTabs
        canSeeTeam={session.permissions.has(PERMISSIONS.TEAM_VIEW)}
        canSeeRules
        canSeeAudit={session.permissions.has(PERMISSIONS.AUDIT_VIEW)}
      />

      <SectionHeader
        title="Mes préférences de conseil"
        description="Une référence, une catégorie ou un laboratoire à mettre en avant, ou à ne plus proposer dans votre officine. Les conseils eux-mêmes sont les mêmes pour toutes les pharmacies PharmaBoost."
      />

      <RulesManager
        rules={rules.map((rule) => ({
          id: rule.id,
          type: rule.type,
          productName: rule.product ? `${rule.product.name}${rule.product.brand ? ` (${rule.product.brand})` : ""}` : null,
          category: rule.category,
          brand: rule.brand,
          note: rule.note,
          isActive: rule.isActive,
          createdAt: rule.createdAt.toISOString(),
          createdBy: rule.createdBy ? `${rule.createdBy.firstName} ${rule.createdBy.lastName}` : null,
        }))}
        products={products.map((product) => ({
          id: product.id,
          label: `${product.name}${product.brand ? ` — ${product.brand}` : ""}`,
        }))}
        canManage={session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)}
      />
    </div>
  );
}
