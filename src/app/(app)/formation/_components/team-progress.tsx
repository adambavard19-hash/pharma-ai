import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, Progress } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ROLE_LABELS, type Role } from "@/server/rbac/permissions";
import { formatRelative } from "@/lib/format";
import type { TeamTrainingProgress } from "@/server/services/training";

/**
 * La progression de l'équipe, pour le titulaire. Nominative : elle sert à
 * accompagner chacun, pas à classer. Seuls les contenus actuellement proposés
 * comptent.
 */
export function TeamProgress({ data }: { data: TeamTrainingProgress }) {
  if (data.totalContents === 0) {
    return (
      <Card>
        <EmptyState icon={<Users className="size-5" />} title="Rien à suivre pour l'instant" description="La progression de l'équipe apparaîtra ici dès qu'une formation sera publiée." />
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-text-secondary">
        {data.totalContents} formation{data.totalContents > 1 ? "s" : ""} proposée{data.totalContents > 1 ? "s" : ""} à l&apos;équipe. Réservé aux personnes chargées de l&apos;équipe : de quoi accompagner chacun, pas le noter.
      </p>
      <TableWrapper>
        <Table>
          <THead>
            <tr>
              <TH>Membre</TH>
              <TH numeric>Terminées</TH>
              <TH numeric>En cours</TH>
              <TH numeric>À faire</TH>
              <TH className="min-w-[180px]">Avancée</TH>
              <TH>Dernière activité</TH>
            </tr>
          </THead>
          <TBody>
            {data.rows.map((row) => (
              <TR key={row.userId}>
                <TD>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-[12px] text-text-tertiary">{ROLE_LABELS[row.role as Role] ?? row.role}</p>
                </TD>
                <TD numeric>{row.summary.done}</TD>
                <TD numeric>{row.summary.inProgress}</TD>
                <TD numeric>{row.summary.todo}</TD>
                <TD>
                  <div className="flex items-center gap-2.5">
                    <Progress value={row.summary.percent} max={100} tone={row.summary.percent === 100 ? "success" : "brand"} className="w-28" label={`${row.name} : ${row.summary.percent} %`} />
                    <span className="text-[12.5px] text-text-secondary tabular">{row.summary.percent} %</span>
                  </div>
                </TD>
                <TD className="text-[13px] text-text-secondary">{row.lastActivityAt ? formatRelative(row.lastActivityAt) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrapper>
    </div>
  );
}
