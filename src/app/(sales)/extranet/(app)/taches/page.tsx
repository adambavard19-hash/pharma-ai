import type { Metadata } from "next";
import Link from "next/link";
import { requireSalesSession } from "@/server/auth/sales-session";
import { listTasks } from "@/server/services/sales/prospects";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { CompleteTaskButton } from "./complete-button";

export const metadata: Metadata = { title: { absolute: "Relances — PharmaBoost" } };

export default async function SalesTasksPage() {
  const session = await requireSalesSession();
  const tasks = await listTasks(session.rep.id);
  const groups = [["En retard", tasks.late, "warning"], ["Aujourd'hui", tasks.today, "brand"], ["À venir", tasks.upcoming, "neutral"]] as const;
  return (
    <>
      <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">Relances</h1>
      {groups.map(([title, items, tone]) => (
        <section key={title} className="space-y-2">
          <h2 className={"text-[14px] font-semibold " + (tone === "warning" ? "text-warning-700 dark:text-warning-500" : "text-text-primary")}>{title} <span className="text-[12.5px] font-normal text-text-tertiary">{items.length}</span></h2>
          {items.length === 0 ? <p className="text-[13px] text-text-tertiary">Rien.</p> : (
            <Card><CardContent className="pt-0"><ul className="divide-y divide-border-subtle">
              {items.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1"><Link href={`/extranet/dossiers/${task.prospect.id}`} className="block truncate text-[14.5px] font-medium text-text-primary hover:underline">{task.prospect.name}</Link><span className="block text-[12.5px] text-text-secondary">{task.label} · {formatDate(task.dueAt)}</span></div>
                  {task.prospect.phone && <a href={`tel:${task.prospect.phone.replace(/\s+/g, "")}`} className="rounded-lg border border-border-default px-3 py-1.5 text-[12.5px] font-medium text-text-primary hover:bg-surface-sunken">Appeler</a>}
                  <CompleteTaskButton taskId={task.id} />
                </li>
              ))}
            </ul></CardContent></Card>
          )}
        </section>
      ))}
    </>
  );
}
