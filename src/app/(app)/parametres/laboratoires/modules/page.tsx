import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadAdviceModules, stockModuleCounts } from "@/server/services/advice-modules";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { LabTabs } from "../lab-tabs";
import { MyModules } from "./my-modules";

export const metadata: Metadata = { title: "Mes modules de conseil" };

/**
 * Les modules de conseil de l'officine (fondateur, 29 oct. 2026) : phytothérapie, aromathérapie, médicaments conseil. Le
 * titulaire coche ceux qu'il veut travailler ; au comptoir, un produit de ces modules passe devant quand il convient.
 */
export default async function ModulesPage() {
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const [modules, counts] = await Promise.all([loadAdviceModules(session.scope.pharmacyId), stockModuleCounts(session.scope.pharmacyId)]);
  return (
    <div className="space-y-6">
      <PageHeader title="Laboratoires & gammes" description="Vos gammes privilégiées, les challenges des laboratoires et les marques que PharmaBoost met en avant ou écarte." />
      <LabTabs canManagePrograms canManageBrands={session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)} />
      <SectionHeader
        title="Mes modules de conseil"
        description="Plutôt plantes, huiles essentielles ou médicaments conseil ? Cochez ce que vous voulez mettre en avant : pour chaque médicament, PharmaBoost proposera d'abord un produit de vos modules, s'il en a un adapté et sûr pour ce patient dans votre stock. Les mises en garde (grossesse, enfant…) restent toujours appliquées."
      />
      <MyModules initial={modules} counts={counts} />
    </div>
  );
}
