import type { Metadata } from "next";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { SettingsTabs } from "../settings-tabs";
import { BrandsManager, type BrandRow } from "./brands-manager";
import { LabTabs } from "./lab-tabs";
import { brandLabelOf } from "@/core/catalog/brand";

export const metadata: Metadata = { title: "Laboratoires" };

/**
 * Les laboratoires que l'officine met en avant, ou écarte.
 *
 * Le titulaire ne tape pas des noms de mémoire : la liste vient de son stock,
 * telle qu'elle est, avec le nombre de références par marque. Un clic met en
 * avant, un autre écarte. La règle produite est la même que dans « Règles de
 * conseil » ; elle ne pèse qu'au départage entre références jugées
 * équivalentes — jamais contre la pertinence.
 */

export default async function LaboratoiresPage() {
  const session = await requirePermission(PERMISSIONS.RECOMMENDATION_RULES_MANAGE);
  const [products, rules] = await Promise.all([
    prisma.product.findMany({
      where: { pharmacyId: session.scope.pharmacyId, deletedAt: null, isActive: true },
      select: { name: true, brand: true, stockItem: { select: { quantity: true } } },
    }),
    prisma.pharmacyRule.findMany({
      where: { pharmacyId: session.scope.pharmacyId, type: { in: ["PREFER_BRAND", "EXCLUDE_BRAND"] }, isActive: true },
      select: { id: true, type: true, brand: true },
    }),
  ]);

  const counts = new Map<string, { references: number; inStock: number }>();
  for (const product of products) {
    const key = brandLabelOf(product.name, product.brand);
    if (!key) continue;
    const entry = counts.get(key) ?? { references: 0, inStock: 0 };
    entry.references += 1;
    if ((product.stockItem?.quantity ?? 0) > 0) entry.inStock += 1;
    counts.set(key, entry);
  }
  const ruleByBrand = new Map(rules.map((rule) => [rule.brand?.toUpperCase() ?? "", rule]));
  // Un petit stock montre toutes ses marques ; un grand ne montre que celles
  // qui reviennent, sinon la liste se noie dans les références isolées.
  const minReferences = products.length > 500 ? 3 : 1;
  const rows: BrandRow[] = [...counts.entries()]
    .filter(([brand, entry]) => entry.references >= minReferences || ruleByBrand.has(brand))
    .map(([brand, entry]) => {
      const rule = ruleByBrand.get(brand);
      const mode: BrandRow["mode"] = rule ? (rule.type === "PREFER_BRAND" ? "prefer" : "exclude") : "none";
      return { brand, references: entry.references, inStock: entry.inStock, mode, ruleId: rule?.id ?? null };
    })
    .sort((a, b) => b.references - a.references || a.brand.localeCompare(b.brand));
  // Une marque réglée qui n'est plus au stock reste visible : on doit pouvoir la retirer.
  for (const rule of rules) {
    const key = rule.brand?.toUpperCase() ?? "";
    if (key && !counts.has(key)) rows.push({ brand: key, references: 0, inStock: 0, mode: rule.type === "PREFER_BRAND" ? "prefer" : "exclude", ruleId: rule.id });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Officine, équipe, règles de conseil, moteur et conformité — tout ce qui se règle une fois, pas à chaque patient." />
      <SettingsTabs canSeeTeam={session.permissions.has(PERMISSIONS.TEAM_VIEW)} canSeeRules canSeePrograms={session.permissions.has(PERMISSIONS.LAB_PROGRAMS_MANAGE)} canSeeAudit={session.permissions.has(PERMISSIONS.AUDIT_VIEW)} />
      <LabTabs canManagePrograms={session.permissions.has(PERMISSIONS.LAB_PROGRAMS_MANAGE)} canManageBrands />
      <SectionHeader
        title="Laboratoires"
        description="Les marques de votre stock, telles qu'elles y figurent. Mettez en avant celles que vous voulez voir sortir en premier, écartez celles que vous ne voulez pas conseiller. Une préférence ne fait jamais passer une référence moins adaptée devant une meilleure : elle départage entre équivalentes."
      />
      <BrandsManager rows={rows} />
    </div>
  );
}
