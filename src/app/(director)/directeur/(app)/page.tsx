import type { Metadata } from "next";
import { requireDirectorSession } from "@/server/auth/director-session";
import { getDirectorDashboard } from "@/server/services/sales/director-dashboard";
import { parseDirectorPeriod } from "@/core/sales/director/dashboard";
import { PageHeader } from "@/components/ui/page";
import { demoBoard } from "@/server/services/sales/demo-tracking";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DemoCounters, DemoList } from "@/components/sales/demo-board";
import { ActivityCard, ChallengesCard, KpiGrid, PeriodSwitch, RankingCard, SummaryCard, TodoCard } from "./dashboard-sections";

export const metadata: Metadata = { title: "Tableau de bord" };

/**
 * L'accueil du directeur : une phrase, des chiffres cliquables, ce qui attend
 * une décision, les challenges, le classement, l'activité. La période se choisit
 * dans l'adresse (`?periode=`) : sans script, et on peut envoyer le lien.
 */
export default async function DirectorDashboardPage({ searchParams }: { searchParams: Promise<{ periode?: string | string[] }> }) {
  const session = await requireDirectorSession();
  const { periode } = await searchParams;
  const period = parseDirectorPeriod(periode);
  const [board, demos] = await Promise.all([getDirectorDashboard(session.director.id, period), demoBoard()]);

  return (
    <>
      <PageHeader title="Tableau de bord" description={`Bonjour ${session.director.firstName}. Voici votre équipe commerciale.`} actions={<PeriodSwitch current={period} />} />
      <SummaryCard board={board} />
      <KpiGrid board={board} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TodoCard board={board} />
        <ChallengesCard board={board} />
      </div>
      {/* Les démonstrations de toute l'équipe (17 oct. 2026) : qui les a obtenues, faites, transformées en abonnement. */}
      <Card>
        <CardHeader title="Démonstrations de l'équipe" description="Les démos obtenues par le lien de chaque commercial, et ce qu'elles sont devenues." />
        <CardContent className="space-y-4 pt-0" data-demos-directeur="">
          <DemoCounters counts={demos.total} />
          {demos.byRep.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13.5px]">
                <thead>
                  <tr className="text-left text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">
                    <th className="py-2">Commercial</th>
                    <th className="py-2 text-right">Démos</th>
                    <th className="py-2 text-right">À venir</th>
                    <th className="py-2 text-right">Faites</th>
                    <th className="py-2 text-right">Abonnées</th>
                    <th className="py-2 text-right">Pas au bout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {demos.byRep.map((rep) => (
                    <tr key={rep.id}>
                      <td className="py-2 font-medium text-text-primary"><a href={`/directeur/commerciaux/${rep.id}`} className="hover:underline">{rep.name}</a></td>
                      <td className="py-2 text-right tabular-nums">{rep.total}</td>
                      <td className="py-2 text-right tabular-nums">{rep.upcoming}</td>
                      <td className="py-2 text-right tabular-nums">{rep.done}</td>
                      <td className="py-2 text-right font-semibold text-success-700 tabular-nums dark:text-success-400">{rep.subscribed}</td>
                      <td className="py-2 text-right text-danger-700 tabular-nums dark:text-danger-400">{rep.lost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DemoList rows={demos.rows.slice(0, 15)} showRep href={(id) => { const row = demos.rows.find((r) => r.id === id); return row?.rep ? `/directeur/commerciaux/${row.rep.id}` : "/directeur"; }} empty="Aucune démonstration pour l'instant." />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <RankingCard board={board} />
        <ActivityCard board={board} />
      </div>
    </>
  );
}
