import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Award, ListChecks, Route } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { academyViewer, loadContentDetail } from "@/server/services/mobile/academy";
import { ACADEMY_KIND_LABELS, isAcademyKind } from "@/core/academy/content";
import { MCard } from "../../../_components/ui";
import { AuthorBadge, NotDpcNote, PartnerLabel, StatusPill, TopicPill, VerifiedLine } from "../_components/labels";
import { DetailPlayer, SheetDoneButton } from "../_components/player";

export const metadata: Metadata = { title: "Formation" };

/**
 * Le détail d'une formation : la vidéo (ou la fiche), qui l'a faite, qui l'a relue et quand, le quiz, et la place dans
 * son parcours. Un contenu que la personne ne peut pas voir (brouillon, échu, réservé aux équipes…) : 404.
 */
export default async function FormationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser();
  const content = await loadContentDetail(await academyViewer(session), id);
  if (!content) notFound();

  const path = content.modules[0] ?? null;
  const hasQuiz = content.quizCount > 0;
  const done = content.status === "DONE";

  return (
    <div className="space-y-5">
      <Link href={path ? `/m/formations/parcours/${path.slug}` : "/m/formations"} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold text-brand-700">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {path ? path.title : "Formations"}
      </Link>

      {content.video ? (
        <DetailPlayer contentId={content.id} video={content.video} posterUrl={content.posterUrl} vertical={content.vertical} title={content.title} initialPercent={content.percent} done={done} hasQuiz={hasQuiz} />
      ) : null}

      <header className="space-y-3 px-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <TopicPill topic={content.topic} />
          <PartnerLabel partnerName={content.partnerName} isSponsored={content.isSponsored} />
          <span className="text-[12.5px] font-medium text-text-tertiary">
            {isAcademyKind(content.kind) ? ACADEMY_KIND_LABELS[content.kind] : "Formation"}
            {content.durationLabel ? ` · ${content.durationLabel}` : ""}
          </span>
        </div>
        <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.03em] text-ink-950 text-balance">{content.title}</h1>
        {content.summary && <p className="text-[15px] leading-[1.55] text-text-secondary">{content.summary}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AuthorBadge name={content.author} role={content.authorRole} />
          <StatusPill status={content.status} percent={content.percent} quizPassed={content.quizPassed} />
        </div>
        <VerifiedLine reviewedBy={content.reviewedBy} reviewedAt={content.reviewedAt} reviewerIsPharmacist={content.reviewerIsPharmacist} validUntil={content.validUntil} />
      </header>

      {content.kind === "SHEET" && content.body && (
        <MCard className="space-y-4">
          <div className="text-[15.5px] leading-[1.65] whitespace-pre-line text-ink-800">{content.body}</div>
          {!hasQuiz && <SheetDoneButton contentId={content.id} done={done} />}
        </MCard>
      )}

      {hasQuiz && (
        <MCard className="flex items-center gap-4">
          <span className={content.quizPassed ? "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-success-50 text-success-700" : "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-md"}>
            {content.quizPassed ? <Award className="size-6" aria-hidden="true" /> : <ListChecks className="size-6" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-bold text-ink-900">{content.quizPassed ? "Quiz réussi" : "Validez avec le quiz"}</p>
            <p className="text-[13px] text-text-tertiary">
              {content.quizCount} question{content.quizCount > 1 ? "s" : ""}
              {content.bestScore !== null ? ` · meilleur score ${content.bestScore} %` : " · moins d'une minute"}
            </p>
          </div>
          <Link href={`/m/formations/${content.id}/quiz`} className="inline-flex h-11 shrink-0 items-center rounded-full bg-ink-900 px-4 text-[14px] font-bold text-white active:scale-95">
            {content.attempts > 0 ? "Refaire" : "Commencer"}
          </Link>
        </MCard>
      )}

      {path && (
        <MCard className="space-y-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-brand-700">
            <Route className="size-4" aria-hidden="true" />
            Parcours · étape {path.position} sur {path.count}
          </p>
          <p className="text-[15.5px] font-bold text-ink-900">{path.title}</p>
          <div className="flex gap-2">
            {path.previousId && (
              <Link href={`/m/formations/${path.previousId}`} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink-50 text-[14px] font-semibold text-ink-700">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Précédente
              </Link>
            )}
            {path.nextId && (
              <Link href={`/m/formations/${path.nextId}`} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-50 text-[14px] font-semibold text-brand-800">
                Suivante
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </MCard>
      )}

      {content.sourceLabel && <p className="px-1 text-[12.5px] text-text-tertiary">Source : {content.sourceLabel}</p>}
      <NotDpcNote />
    </div>
  );
}
