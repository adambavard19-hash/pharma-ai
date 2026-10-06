import { ChevronDown, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { METHOD_SECTIONS } from "@/core/performance/definitions";

/**
 * « Comment c'est calculé » : le texte de `METHOD_SECTIONS`, repris tel quel
 * (une seule source pour le calcul et pour l'écran). Replié par défaut, mais
 * à un clic : la confiance dans un chiffre vient de ce qu'on peut vérifier.
 * Un `<details>` natif : aucun script, le clavier et les lecteurs d'écran
 * le gèrent déjà.
 */
export function MethodPanel({ sections = METHOD_SECTIONS }: { sections?: { title: string; body: string }[] }) {
  return (
    <Card className="overflow-hidden">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 select-none marker:hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-tertiary">
            <BookOpen className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-6 font-semibold text-text-primary">Comment c&apos;est calculé</span>
            <span className="block text-[13px] leading-5 text-text-secondary">Ce que PharmaBoost compte, ce qu&apos;il ne compte pas, et pourquoi.</span>
          </span>
          <ChevronDown
            className="size-4.5 shrink-0 text-text-tertiary transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>

        <div className="grid gap-x-8 gap-y-5 border-t border-border-subtle px-5 py-5 md:grid-cols-2">
          {sections.map((section) => (
            <section key={section.title} className="space-y-1">
              <h3 className="text-[13.5px] leading-5 font-semibold text-text-primary">{section.title}</h3>
              <p className="text-[13px] leading-5 text-text-secondary">{section.body}</p>
            </section>
          ))}
        </div>
      </details>
    </Card>
  );
}
