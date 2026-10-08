import { commercialWorkspaceCounts, listOpenProspectOptions, listRepOptions } from "@/server/services/admin/commercial";
import { defaultDemoInput, defaultFollowUpInput } from "@/core/sales/board";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ViewSwitch, type ViewSwitchItem } from "@/components/admin/view-switch";
import { NewProspect } from "../pipeline/new-prospect";
import { ScheduleDemoButton } from "../demonstrations/demo-dialog";
import { FollowUpButton } from "../relances-commerciales/follow-up-dialog";

export type CommercialView = "pipeline" | "liste" | "demos" | "relances";

/** Les paramètres d'adresse qui ouvrent une fenêtre de création : `?nouveau=prospect|demo`, `?dossier=` (démo d'un dossier). */
export type WorkspaceParams = { nouveau?: string | null; dossier?: string | null };

/**
 * L'en-tête du suivi commercial : UN espace de travail, quatre vues du même suivi — le tableau des dossiers, la liste, les
 * démonstrations, les relances — et les trois gestes de tous les jours (nouveau dossier, programmer une démo, fixer une
 * relance) disponibles où qu'on soit. Les vues gardent leurs adresses et leurs filtres ; seul l'en-tête est commun.
 */
export async function CommercialWorkspaceHeader({ active, description, params = {} }: { active: CommercialView; description: string; params?: WorkspaceParams }) {
  const now = new Date();
  const [counts, reps, options] = await Promise.all([commercialWorkspaceCounts(now), listRepOptions(), listOpenProspectOptions()]);

  const views: ViewSwitchItem[] = [
    { key: "pipeline", label: "Tableau", href: "/admin/pipeline", count: counts.open },
    { key: "liste", label: "Liste", href: "/admin/prospects" },
    { key: "demos", label: "Démonstrations", href: "/admin/demonstrations", ...(counts.demosToday > 0 ? { badge: { text: `${counts.demosToday} aujourd'hui`, tone: "brand" as const } } : {}) },
    { key: "relances", label: "Relances", href: "/admin/relances-commerciales", ...(counts.followUpsLate > 0 ? { badge: { text: `${counts.followUpsLate} en retard`, tone: "warning" as const } } : {}) },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Suivi commercial"
        description={description}
        actions={
          <>
            {/* La clé suit `?nouveau=` : la fenêtre s'ouvre aussi quand on est déjà sur la page, et à chaque nouvel usage. */}
            <NewProspect key={`prospect:${params.nouveau ?? "aucun"}`} reps={reps.filter((rep) => rep.isActive)} defaultOpen={params.nouveau === "prospect"} />
            <ScheduleDemoButton key={`demo:${params.nouveau ?? "aucun"}:${params.dossier ?? ""}`} prospects={options} defaultAt={defaultDemoInput(now)} defaultOpen={params.nouveau === "demo"} initialProspectId={params.dossier ?? null} variant="outline" label="Programmer une démo" />
            <FollowUpButton prospects={options} defaultDue={defaultFollowUpInput(now)} variant="outline" label="Fixer une relance" />
          </>
        }
      />
      <ViewSwitch label="Vues du suivi commercial" active={active} items={views} />
    </div>
  );
}
