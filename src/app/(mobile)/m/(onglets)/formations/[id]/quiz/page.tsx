import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { X } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { academyViewer, loadPlayableQuiz } from "@/server/services/mobile/academy";
import { QuizPlayer } from "../../_components/quiz-player";

export const metadata: Metadata = { title: "Quiz" };

/** Le quiz d'une formation. Les questions arrivent sans leurs bonnes réponses. */
export default async function FormationQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser();
  const quiz = await loadPlayableQuiz(await academyViewer(session), id);
  if (!quiz) notFound();
  const path = quiz.content.modules[0] ?? null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-1">
        <Link href={`/m/formations/${id}`} className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-600 active:bg-ink-100" aria-label="Quitter le quiz">
          <X className="size-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-[0.04em] text-brand-700 uppercase">Quiz</p>
          <h1 className="truncate text-[16px] font-bold text-ink-900">{quiz.content.title}</h1>
        </div>
      </div>
      <QuizPlayer contentId={id} title={quiz.content.title} questions={quiz.questions} passPercent={quiz.passPercent} backHref={`/m/formations/${id}`} nextHref={path?.nextId ? `/m/formations/${path.nextId}` : null} />
    </div>
  );
}
