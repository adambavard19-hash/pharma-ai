import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { brandSuggestions, listPreferredRanges } from "@/server/services/preferred-ranges";
import { PageHeader, SectionHeader } from "@/components/ui/page";
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
      <PageHeader title="Laboratoires & gammes" description="Vos gammes privilégiées, les challenges des laboratoires et les marques que PharmaBoost met en avant ou écarte." />
      <LabTabs canManagePrograms canManageBrands={session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)} />
      <SectionHeader
        title="Gammes privilégiées"
        description="Une gamme privilégiée sert uniquement à départager des produits également pertinents et sûrs pour le patient. Elle n'est jamais affichée au comptoir comme la raison d'un conseil."
      />
      <RangesManager ranges={ranges} brands={brands} />
    </div>
  );
}
