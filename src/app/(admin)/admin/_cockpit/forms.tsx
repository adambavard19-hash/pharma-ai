import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formKind } from "@/core/admin/form-submissions";
import { formatDayShort, formatTime } from "@/core/admin/metrics";
import { DismissFormButton } from "./dismiss-form";

export type FormSubmission = { id: string; type: string; title: string; body: string; linkUrl: string | null; readAt: Date | null; createdAt: Date };

/**
 * Les formulaires remplis sur le site, du plus récent au plus ancien : démonstration, pharmacie recommandée, candidature,
 * partenariat, abonnement, parrainage. Chaque ligne ouvre ce que le formulaire a créé (le dossier ou la candidature), où
 * tout ce que la personne a écrit est lisible.
 */
export function FormsBlock({ items, now }: { items: FormSubmission[]; now: Date }) {
  const fresh = items.filter((item) => !item.readAt).length;
  return (
    <section aria-labelledby="cockpit-formulaires" data-formulaires-recus="" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cockpit-formulaires" className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-text-primary">
          Formulaires reçus
        </h2>
        {fresh > 0 && <p className="text-[12.5px] font-medium text-brand-700 tabular-nums dark:text-brand-300">{fresh > 1 ? `${fresh} nouveaux` : "1 nouveau"}</p>}
      </div>

      {items.length === 0 ? (
        <p className="flex items-center gap-2.5 rounded-2xl bg-surface-sunken/70 px-4 py-3.5 text-[13.5px] text-text-secondary">
          <Inbox className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          Aucun formulaire rempli sur le site pour l&apos;instant.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-card shadow-xs ring-1 ring-border-subtle">
          {items.map((item) => {
            const kind = formKind(item.type, item.title);
            const sameDay = item.createdAt.toDateString() === now.toDateString();
            const row = (
              <>
                <span className="w-[68px] shrink-0 pt-0.5 text-[12.5px] leading-5 font-semibold text-text-primary tabular-nums">{sameDay ? formatTime(item.createdAt) : formatDayShort(item.createdAt, now)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={kind.tone}>{kind.label}</Badge>
                    {!item.readAt && <Badge tone="danger">Nouveau</Badge>}
                  </span>
                  <span className="mt-1 block truncate text-[13.5px] leading-5 font-medium text-text-primary">{item.title}</span>
                  {item.body && <span className="block truncate text-[12.5px] leading-5 text-text-tertiary">{item.body}</span>}
                </span>
                {item.linkUrl && <ChevronRight className="mt-1 size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
              </>
            );
            return (
              <li key={item.id} className="flex items-center gap-1 pr-2">
                {item.linkUrl ? (
                  <Link href={item.linkUrl} className="group flex min-w-0 flex-1 items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken/60 focus-visible:outline-none">
                    {row}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">{row}</div>
                )}
                <DismissFormButton id={item.id} title={item.title} />
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[12.5px]">
        <Link href="/admin/notifications" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
          Toutes les notifications
        </Link>
      </p>
    </section>
  );
}
