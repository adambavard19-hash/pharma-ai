import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/user-session";
import { academyViewer, loadModule } from "@/server/services/mobile/academy";
import { formatDateLong } from "@/lib/format";
import { MCardLink } from "../../../../_components/ui";
import { NotDpcNote, Thumb } from "../../_components/labels";
import { ModuleTile } from "../../_components/views";

export const metadata: Metadata = { title: "Parcours" };

/** Un parcours : ses étapes dans l'ordre, ce qui est fait, et la suite. */
export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireUser();
  const data = await loadModule(await academyViewer(session), slug);
  if (!data) notFound();
  const { module, items } = data;
  const next = items.find((item) => item.id === module.progress.nextContentId) ?? null;

  return (
    <div className="space-y-5">
      <Link href="/m/formations?vue=parcours" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Parcours
      </Link>
      <h1 className="sr-only">{module.title}</h1>
      <ModuleTile module={module} />
      {module.summary && <p className="px-1 text-[15px] leading-[1.55] text-text-secondary">{module.summary}</p>}
      {module.reviewedAt && (
        <p className="px-1 text-[12.5px] text-text-tertiary">
          Parcours vérifié le {formatDateLong(module.reviewedAt)}
          {module.reviewedBy ? ` par ${module.reviewedBy}` : ""}. Chaque étape porte sa propre relecture.
        </p>
      )}

      {next && (
        <Link href={`/m/formations/${next.id}`} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-gradient text-[16px] font-bold text-white shadow-lg active:scale-[0.99]">
          {module.progress.doneRequired > 0 ? "Continuer" : "Commencer"} : étape {next.position}
          <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
      )}

      <ol className="relative space-y-2.5" aria-label="Étapes du parcours">
        {items.map((item) => {
          const done = item.status === "DONE";
          const current = item.id === module.progress.nextContentId;
          return (
            <li key={item.id} className="relative">
              <MCardLink href={`/m/formations/${item.id}`} className={cn("flex items-center gap-3.5 p-3 sm:p-3", current && "ring-2 ring-brand-400")} aria-current={current ? "step" : undefined}>
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-[14px] font-bold", done ? "bg-success-600 text-white" : current ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600")}>
                  {done ? <Check className="size-5" strokeWidth={3} aria-label="Terminée" /> : item.position}
                </span>
                <Thumb posterUrl={item.posterUrl} kind={item.kind} className="w-[84px]" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[14.5px] leading-snug font-semibold text-ink-900">{item.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-text-tertiary">
                    {item.durationLabel}
                    {item.quizCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <ListChecks className="size-3.5" aria-hidden="true" />
                        {item.quizPassed ? "quiz réussi" : "quiz"}
                      </>
                    )}
                    {!item.isRequired && <span>· facultative</span>}
                  </span>
                </span>
              </MCardLink>
            </li>
          );
        })}
      </ol>
      <NotDpcNote />
    </div>
  );
}
