import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DEMO_OUTCOME_LABELS, type DemoOutcome } from "@/core/sales/demo-outcome";
import { formatDate } from "@/lib/format";

type Row = { id: string; name: string; city: string | null; demoAt: Date | null; outcome: DemoOutcome; rep: { name: string } | null };

/** Les quatre chiffres d'un suivi des démos (commercial, directeur, console). */
export function DemoCounters({ counts }: { counts: { total: number; done: number; subscribed: number; lost: number; upcoming: number } }) {
  const tiles = [
    { label: "Démos obtenues", value: counts.total },
    { label: "À venir", value: counts.upcoming },
    { label: "Faites", value: counts.done },
    { label: "Abonnées", value: counts.subscribed, tone: "text-success-700 dark:text-success-400" },
    { label: "Pas allées au bout", value: counts.lost, tone: "text-danger-700 dark:text-danger-400" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-compteurs-demos="">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl bg-surface-sunken/60 px-3 py-2.5">
          <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">{tile.label}</p>
          <p className={`mt-1 text-[22px] leading-none font-bold tabular-nums ${tile.tone ?? "text-text-primary"}`}>{tile.value}</p>
        </div>
      ))}
    </div>
  );
}

/** La liste des démos, avec leur issue ; `href` mène au dossier dans l'espace de celui qui regarde. */
export function DemoList({ rows, href, showRep = false, empty }: { rows: Row[]; href: (id: string) => string; showRep?: boolean; empty: string }) {
  if (rows.length === 0) return <p className="py-3 text-[13.5px] text-text-secondary">{empty}</p>;
  return (
    <ul className="divide-y divide-border-subtle" data-liste-demos="">
      {rows.map((row) => {
        const outcome = DEMO_OUTCOME_LABELS[row.outcome];
        return (
          <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]">
            <Link href={href(row.id)} className="font-medium text-text-primary hover:underline">{row.name}</Link>
            {row.city && <span className="text-[12.5px] text-text-tertiary">{row.city}</span>}
            {showRep && <span className="text-[12.5px] text-text-secondary">· {row.rep?.name ?? "Site / console"}</span>}
            <span className="ml-auto flex items-center gap-2">
              {row.demoAt && <span className="text-[12.5px] text-text-tertiary">{formatDate(row.demoAt)}</span>}
              <Badge tone={outcome.tone}>{outcome.label}</Badge>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
