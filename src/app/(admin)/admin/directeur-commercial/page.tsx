import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listSalesDirectors, salesTeamCounts } from "@/server/services/sales/directors";
import { listDirectorBonuses } from "@/server/services/sales/director-bonuses";
import { DirectorsView } from "./directors-view";

export const metadata: Metadata = { title: "Directeur commercial" };

/**
 * Le compte du directeur commercial : on l'ajoute ici, l'invitation part
 * toute seule, puis il gère l'équipe depuis son propre espace
 * (`/directeur`). Les commerciaux sont les mêmes des deux côtés : ceux que
 * vous créez dans la console apparaissent chez lui, et inversement.
 */
export default async function SalesDirectorPage() {
  await requirePlatformSession();
  const [directors, team, bonuses] = await Promise.all([listSalesDirectors(), salesTeamCounts(), listDirectorBonuses()]);
  return <DirectorsView directors={directors} team={team} bonuses={bonuses} now={new Date()} />;
}
