import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * « Se former sur ce produit » : un lien discret vers la formation la plus
 * précise sur ce produit (voir trainingsForProducts, déjà triée).
 *
 * Il s'ouvre dans un nouvel onglet : au comptoir, quitter la vente en cours
 * ferait perdre ce qui n'est pas encore enregistré. Rien n'est affiché quand
 * aucune formation ne concerne le produit. Aucun hook : utilisable dans un
 * composant serveur comme dans un composant client.
 */
export function ProductTrainingLink({ trainings, className }: { trainings: { id: string; title: string }[]; className?: string }) {
  const first = trainings[0];
  if (!first) return null;
  return (
    <a
      href={`/formation/${first.id}`}
      target="_blank"
      rel="noopener"
      title={trainings.length > 1 ? `${first.title} (et ${trainings.length - 1} autre${trainings.length > 2 ? "s" : ""})` : first.title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm text-[12.5px] text-text-tertiary underline-offset-2 transition-colors hover:text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:outline-none",
        className,
      )}
    >
      <GraduationCap className="size-3.5 shrink-0" aria-hidden="true" />
      Se former sur ce produit
    </a>
  );
}
