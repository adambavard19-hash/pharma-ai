import { CalendarCheck2, CalendarClock, CalendarDays, Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isOverdue } from "@/core/sales/board";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DemoActions } from "../../demonstrations/demo-actions";
import { ScheduleDemoButton } from "../../demonstrations/demo-dialog";
import { FollowUpButton, FollowUpDoneButton } from "../../relances-commerciales/follow-up-dialog";

/**
 * La démonstration et les relances d'un dossier, sur sa fiche : programmer,
 * marquer réalisée, annuler une démo ; fixer une relance, la marquer faite.
 * Avec un commercial, démo et relances entrent dans son agenda.
 */
export function DossierCommercialPanel({
  prospect,
  tasks,
  now,
  defaultDemoAt,
  defaultDue,
}: {
  prospect: { id: string; name: string; status: string; demoAt: Date | null; demoDoneAt: Date | null; nextActionAt: Date | null; nextActionLabel: string | null; repName: string | null };
  tasks: { id: string; label: string; dueAt: Date }[];
  now: Date;
  defaultDemoAt: string;
  defaultDue: string;
}) {
  const closed = prospect.status === "ACTIVATED" || prospect.status === "LOST";
  const fixed = { id: prospect.id, name: prospect.name };
  const dossierAction = tasks.length === 0 && prospect.nextActionAt ? { label: prospect.nextActionLabel ?? "Relancer", dueAt: prospect.nextActionAt } : null;
  return (
    <Card>
      <CardHeader
        title="Démonstration et relances"
        description={prospect.repName ? `Suivies par ${prospect.repName} : chaque démo et relance entre dans son agenda.` : "Dossier tenu par la console : la relance devient la prochaine action du dossier."}
      />
      <CardContent className="grid gap-5 pb-5 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Démonstration</p>
          {prospect.demoDoneAt ? (
            <p className="flex items-start gap-2 text-[13.5px] text-success-700 dark:text-success-500">
              <CalendarCheck2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Réalisée le {formatDate(prospect.demoDoneAt)}
                {prospect.demoAt && <span className="block text-[12px] text-text-tertiary">prévue le {formatDateTime(prospect.demoAt)}</span>}
              </span>
            </p>
          ) : prospect.demoAt ? (
            <p className="flex items-start gap-2 text-[13.5px] text-text-primary">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
              <span>
                Programmée le {formatDateTime(prospect.demoAt)}
                {isOverdue(prospect.demoAt, now) && <span className="block text-[12px] font-medium text-warning-700 dark:text-warning-500">Date passée : marquez-la réalisée, ou reprogrammez-la.</span>}
              </span>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-[13.5px] text-text-secondary">
              <CalendarDays className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              Aucune démonstration programmée.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {prospect.demoAt && !prospect.demoDoneAt ? (
              <DemoActions prospect={fixed} demoAt={prospect.demoAt.toISOString()} done={false} defaultAt={defaultDemoAt} />
            ) : (
              <ScheduleDemoButton fixedProspect={fixed} defaultAt={defaultDemoAt} label={prospect.demoDoneAt ? "Programmer une autre démo" : "Programmer une démo"} variant="outline" size="sm" />
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Relances</p>
          {tasks.length === 0 && !dossierAction && <p className="text-[13.5px] text-text-secondary">Aucune relance prévue.</p>}
          {(tasks.length > 0 || dossierAction) && (
            <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
              {tasks.map((task) => (
                <FollowUpRow key={task.id} label={task.label} dueAt={task.dueAt} late={isOverdue(task.dueAt, now)}>
                  <FollowUpDoneButton taskId={task.id} />
                </FollowUpRow>
              ))}
              {dossierAction && (
                <FollowUpRow label={dossierAction.label} dueAt={dossierAction.dueAt} late={isOverdue(dossierAction.dueAt, now)}>
                  <FollowUpDoneButton prospectId={prospect.id} />
                </FollowUpRow>
              )}
            </ul>
          )}
          {closed ? <p className="text-[12.5px] text-text-tertiary">Dossier clos : plus de relance à fixer.</p> : <FollowUpButton fixedProspect={fixed} defaultDue={defaultDue} variant="outline" size="sm" />}
        </div>
      </CardContent>
    </Card>
  );
}

function FollowUpRow({ label, dueAt, late, children }: { label: string; dueAt: Date; late: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Clock className={cn("size-4 shrink-0", late ? "text-warning-600" : "text-text-tertiary")} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-text-primary">{label}</span>
        <span className={cn("block text-[12px]", late ? "font-medium text-warning-700 dark:text-warning-500" : "text-text-tertiary")}>{formatDate(dueAt)}{late ? " · en retard" : ""}</span>
      </span>
      {children}
    </li>
  );
}
