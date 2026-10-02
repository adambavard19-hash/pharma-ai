import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Plus, SearchX } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listPharmacyTrainings, listTrainings, teamProgress } from "@/server/services/training";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Progress } from "@/components/ui/feedback";
import { LinkTabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CatalogFilters } from "./_components/catalog-filters";
import { TrainingCard } from "./_components/training-card";
import { TeamProgress } from "./_components/team-progress";
import { PharmacyTrainingsManager } from "./_components/pharmacy-trainings-manager";

export const metadata: Metadata = { title: "Formation" };

/**
 * Le centre de formation de l'équipe.
 *
 * Chacun y retrouve les contenus publiés par PharmaBoost et par son
 * titulaire — liens officiels des laboratoires, vidéos, fiches courtes — et
 * sa propre progression. Le titulaire y suit en plus l'équipe et publie ses
 * contenus. Rien ici n'est inventé : sans contenu publié, la page le dit.
 */
export default async function FormationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.TRAINING_VIEW);
  // Un paramètre répété (?q=a&q=b) arrive en tableau : on garde le premier.
  const raw = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const params = { q: one(raw.q), labo: one(raw.labo), univers: one(raw.univers), statut: one(raw.statut), onglet: one(raw.onglet) };
  const canSeeTeam = session.permissions.has(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE) || session.permissions.has(PERMISSIONS.TEAM_MANAGE);
  const canManage = session.permissions.has(PERMISSIONS.TRAINING_MANAGE);
  const tab = params.onglet === "equipe" && canSeeTeam ? "equipe" : params.onglet === "contenus" && canManage ? "contenus" : "catalogue";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formation"
        description="Vidéos, fiches courtes et liens officiels des laboratoires pour bien connaître les produits de l'officine. À son rythme, entre deux patients."
      />

      {(canSeeTeam || canManage) && (
        <LinkTabs
          basePath="/formation"
          items={[
            { key: "catalogue", label: "Mes formations" },
            ...(canSeeTeam ? [{ key: "equipe", label: "Équipe" }] : []),
            ...(canManage ? [{ key: "contenus", label: "Contenus de l'officine" }] : []),
          ]}
        />
      )}

      {tab === "equipe" ? (
        <TeamProgress data={await teamProgress(session.scope)} />
      ) : tab === "contenus" ? (
        <PharmacyContents scope={session.scope} />
      ) : (
        <Catalogue scope={session.scope} params={params} canManage={canManage} />
      )}
    </div>
  );
}

async function Catalogue({
  scope,
  params,
  canManage,
}: {
  scope: { pharmacyId: string; userId: string };
  params: { q?: string; labo?: string; univers?: string; statut?: string };
  canManage: boolean;
}) {
  const catalog = await listTrainings(scope, { q: params.q, laboratory: params.labo, universe: params.univers, status: params.statut });

  if (catalog.total === 0) {
    return (
      <Card>
        <EmptyState
          icon={<GraduationCap className="size-5" />}
          title="Aucune formation publiée pour l'instant"
          description="Les contenus sont ajoutés par PharmaBoost ou par votre titulaire, à partir de liens officiels et de contenus autorisés."
          action={
            canManage ? (
              <Button asChild variant="outline" leadingIcon={<Plus className="size-4" />}>
                <Link href="/formation?onglet=contenus">Ajouter un contenu pour l&apos;équipe</Link>
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  const { summary } = catalog;
  return (
    <div className="space-y-4">
      {summary.total > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="min-w-0 sm:w-56">
              <p className="text-[11.5px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">Votre avancée</p>
              <p className="text-[22px] leading-7 font-semibold text-text-primary tabular">{summary.percent} %</p>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Progress value={summary.percent} max={100} tone={summary.percent === 100 ? "success" : "brand"} label={`Votre avancée : ${summary.percent} %`} />
              <p className="text-[12.5px] text-text-secondary">
                {summary.done} terminée{summary.done > 1 ? "s" : ""} · {summary.inProgress} en cours · {summary.todo} à faire
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <CatalogFilters laboratories={catalog.facets.laboratories} universes={catalog.facets.universes} />

      {catalog.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SearchX className="size-5" />}
            title="Aucune formation ne correspond"
            description="Essayez un autre mot, ou effacez les filtres."
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.items.map((item) => (
            <li key={item.id}>
              <TrainingCard training={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function PharmacyContents({ scope }: { scope: { pharmacyId: string; userId: string } }) {
  const rows = await listPharmacyTrainings(scope);
  return (
    <PharmacyTrainingsManager
      rows={rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        kind: row.kind,
        url: row.url,
        body: row.body,
        laboratory: row.laboratory,
        brandKey: row.brandKey,
        rangeName: row.rangeName,
        universe: row.universe,
        durationMinutes: row.durationMinutes,
        sourceLabel: row.sourceLabel,
        productCodes: row.productCodes,
        products: row.products,
        isActive: row.isActive,
        updatedAt: row.updatedAt.toISOString(),
        learners: row.learners,
        completed: row.completed,
      }))}
    />
  );
}
