import { PlayCircle } from "lucide-react";

/**
 * Module vidéo — architecture préparée, moteur non branché.
 *
 * Le port `VideoProvider` existe côté serveur ; tant qu'aucun moteur n'est
 * configuré, l'interface l'annonce sans ambiguïté plutôt que de simuler une
 * vidéo qui n'existe pas.
 */
export function VideoPlaceholder() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-border-default bg-surface-card px-5 py-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-tertiary">
        <PlayCircle className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-text-primary">
          Vidéo personnalisée — bientôt disponible
        </p>
        <p className="text-[12.5px] leading-5 text-text-secondary">
          Une courte vidéo reprendra votre traitement et les conseils de votre pharmacien.
          Cette fonctionnalité n&apos;est pas encore active.
        </p>
      </div>
    </div>
  );
}
