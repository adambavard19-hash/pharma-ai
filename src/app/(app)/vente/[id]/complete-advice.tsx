import { HelpCircle, Sparkles } from "lucide-react";
import { FAMILY_LABELS, type AdviceFamily } from "@/core/ai/family";
import { describePendingQuestions, familyMixOf, pendingQuestionsOf } from "./group-advice";
import type { AdviceView } from "./types";

/**
 * La pastille de famille d'un conseil : médicament conseil, complément
 * alimentaire ou parapharmacie. Neutre, lisible en clair comme en sombre —
 * jamais de rouge ni de vert : une famille n'est ni un risque ni une réussite.
 */
export function FamilyPill({ family }: { family: AdviceFamily }) {
  return (
    <span data-family={family} className="shrink-0 rounded-full border border-border-subtle bg-surface-sunken px-2.5 py-0.5 text-[12px] whitespace-nowrap text-text-secondary">
      {FAMILY_LABELS[family]}
    </span>
  );
}

/**
 * Le bandeau « Conseil complet », au-dessus des conseils.
 *
 * Il ne dit que ce que l'écran tient. Ligne 1 : ce que l'ordonnance reçoit tout
 * de suite, famille par famille (les conseils sans question en attente) ; une
 * famille sans conseil n'est pas écrite. Ligne 2, s'il y en a : les conseils de
 * plus qui dépendent d'une réponse du patient — leur carte est une question, le
 * produit n'est proposé qu'après un « oui ». Puis les questions elles-mêmes :
 * on les lit ici, on y répond sur la carte du conseil.
 * Sans aucun conseil à montrer, rien ne s'affiche.
 */
export function CompleteAdviceBanner({ recommendations }: { recommendations: AdviceView[] }) {
  const { open, conditional } = familyMixOf(recommendations);
  if (open.total + conditional.total === 0) return null;
  const questions = pendingQuestionsOf(recommendations);

  return (
    <section aria-label="Conseil complet" className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13.5px] leading-5 text-text-secondary">
        <Sparkles className="size-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
        <span className="font-semibold text-text-primary">Conseil complet{"\u00a0"}:</span>
        <span>{open.total > 0 ? open.summary : "aucun conseil sans question pour l'instant"}</span>
      </p>
      {conditional.total > 0 && (
        <p className="mt-1 pl-6 text-[13px] leading-5 text-text-secondary">{`+ ${conditional.total} de plus selon les réponses du patient (${conditional.summary})`}</p>
      )}
      {questions.length > 0 && (
        <div className="mt-2.5 border-t border-border-subtle pt-2.5">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
            <HelpCircle className="size-3.5 shrink-0" aria-hidden />
            {describePendingQuestions(questions.length)}
          </p>
          <ul className="mt-1.5 space-y-1 pl-5 text-[13px] leading-5 text-text-primary">
            {questions.map((item) => (
              <li key={item.opportunityId} className="list-disc marker:text-text-tertiary">
                {item.question}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
