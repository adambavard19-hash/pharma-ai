import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listGlobalTrainings } from "@/server/services/training";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Alert } from "@/components/ui/feedback";
import { GlobalTrainingsManager } from "./global-trainings-manager";

export const metadata: Metadata = { title: "Formations" };

/**
 * Les formations publiées par PharmaBoost pour toutes les officines.
 *
 * Des liens officiels et des contenus autorisés par leur auteur, rattachés à
 * un laboratoire, une marque, une gamme, des codes produit ou un univers. La
 * console ne voit que des agrégats de suivi (combien l'ont commencé, dans
 * combien d'officines), jamais qui.
 */
export default async function AdminTrainingsPage() {
  await requirePlatformSession();
  const trainings = await listGlobalTrainings();
  return (
    <div className="space-y-5">
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Formations"
        description="Les contenus proposés à toutes les officines dans leur centre de formation. Un contenu désactivé disparaît des catalogues ; la progression des équipes est conservée."
      />
      <Alert tone="warning" icon={<ShieldCheck className="size-[18px]" aria-hidden="true" />} title="Uniquement des liens officiels ou des contenus autorisés">
        N&apos;ajoutez que des pages publiées par le laboratoire lui-même, une autorité de santé, ou un contenu dont l&apos;auteur a donné son accord. Indiquez toujours la provenance.
      </Alert>
      <GlobalTrainingsManager
        rows={trainings.map((training) => ({
          id: training.id,
          title: training.title,
          summary: training.summary,
          kind: training.kind,
          url: training.url,
          body: training.body,
          laboratory: training.laboratory,
          brandKey: training.brandKey,
          rangeName: training.rangeName,
          universe: training.universe,
          durationMinutes: training.durationMinutes,
          sourceLabel: training.sourceLabel,
          productCodes: training.productCodes,
          isActive: training.isActive,
          updatedAt: training.updatedAt.toISOString(),
          learners: training.learners,
          completed: training.completed,
          pharmacies: training.pharmacies,
        }))}
      />
    </div>
  );
}
