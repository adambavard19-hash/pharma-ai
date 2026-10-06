import type { Metadata } from "next";
import { requireDirectorSession } from "@/server/auth/director-session";
import { getDirectorDashboard } from "@/server/services/sales/director-dashboard";
import { parseDirectorPeriod } from "@/core/sales/director/dashboard";
import { PageHeader } from "@/components/ui/page";
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
  const board = await getDirectorDashboard(session.director.id, period);

  return (
    <>
      <PageHeader title="Tableau de bord" description={`Bonjour ${session.director.firstName}. Voici votre équipe commerciale.`} actions={<PeriodSwitch current={period} />} />
      <SummaryCard board={board} />
      <KpiGrid board={board} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TodoCard board={board} />
        <ChallengesCard board={board} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <RankingCard board={board} />
        <ActivityCard board={board} />
      </div>
    </>
  );
}
