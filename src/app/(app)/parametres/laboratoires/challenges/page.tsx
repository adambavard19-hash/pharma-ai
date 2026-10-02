import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listChallenges, listStockBrands } from "@/server/services/challenges";
import { challengeSourcesLine } from "@/server/services/challenge-sources";
import { PageHeader } from "@/components/ui/page";
import { SettingsTabs } from "../../settings-tabs";
import { LabTabs } from "../lab-tabs";
import { ChallengesBoard } from "./challenges-board";

export const metadata: Metadata = { title: "Challenges laboratoires" };

/**
 * Les challenges laboratoires de l'officine.
 *
 * Réservé au titulaire (LAB_PROGRAMS_MANAGE). Un challenge est un objectif
 * commercial : il se suit ici et dans le Pilotage, jamais au comptoir, et il
 * n'entre pas dans le moteur de conseil. La progression est mesurée sur les
 * ventes enregistrées et les saisies manuelles — aucune donnée inventée.
 */
export default async function ChallengesPage() {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const [{ rows, today }, brands] = await Promise.all([listChallenges(session.scope), listStockBrands(session.scope)]);

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Officine, équipe, règles de conseil, moteur et conformité — tout ce qui se règle une fois, pas à chaque patient." />
      <SettingsTabs canSeeTeam={session.permissions.has(PERMISSIONS.TEAM_VIEW)} canSeeRules={session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)} canSeePrograms canSeeAudit={session.permissions.has(PERMISSIONS.AUDIT_VIEW)} />
      <LabTabs canManagePrograms canManageBrands={session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)} />
      <ChallengesBoard rows={rows} brands={brands} today={today} sourcesLine={challengeSourcesLine()} />
    </div>
  );
}
