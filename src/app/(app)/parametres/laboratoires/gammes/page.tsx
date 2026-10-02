import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { brandSuggestions, listPreferredRanges } from "@/server/services/preferred-ranges";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { SettingsTabs } from "../../settings-tabs";
import { LabTabs } from "../lab-tabs";
import { RangesManager } from "./ranges-manager";

export const metadata: Metadata = { title: "Gammes privilégiées" };

/**
 * Les gammes privilégiées de l'officine, univers par univers.
 *
 * Réservé au titulaire. Tous les univers sont affichés, même vides, pour que
 * l'on voie d'un coup d'œil où l'officine a fait un choix et où elle n'en a
 * pas fait. Les marques proposées à la saisie viennent du stock réel.
 */
export default async function GammesPage() {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const [ranges, brands] = await Promise.all([listPreferredRanges(session.scope), brandSuggestions(session.scope)]);

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Officine, équipe, règles de conseil, moteur et conformité — tout ce qui se règle une fois, pas à chaque patient." />
      <SettingsTabs canSeeTeam={session.permissions.has(PERMISSIONS.TEAM_VIEW)} canSeeRules={session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)} canSeePrograms canSeeAudit={session.permissions.has(PERMISSIONS.AUDIT_VIEW)} />
      <LabTabs canManagePrograms canManageBrands={session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)} />
      <SectionHeader
        title="Gammes privilégiées"
        description="Une gamme privilégiée sert uniquement à départager des produits également pertinents et sûrs pour le patient. Elle n'est jamais affichée au comptoir comme la raison d'un conseil."
      />
      <RangesManager ranges={ranges} brands={brands} />
    </div>
  );
}
