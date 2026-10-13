import { Robot } from "@/components/robot";
import { cn } from "@/lib/utils";

/**
 * Marque PharmaBoost à l'écran : le robot VIVANT (`components/robot`, celui du menu de l'espace), sans carré ni fond.
 * Il respire, cligne des yeux et, touché, il s'écrase et rit (deux fois : agacé ; trois fois très vite : le tournis).
 * La réaction part du `pointerdown` sans l'empêcher : dans un lien vers l'accueil, la navigation suit normalement.
 * Pour qui a demandé à réduire les animations, il reste immobile (le composant lit `prefers-reduced-motion`).
 *
 * L'image à fond bleu nuit (les PNG et SVG tirés par `scripts/logo-robot.ts`) ne sert plus qu'où rien ne peut
 * bouger : icône d'onglet, icône d'application, images de partage, e-mails, installateur Windows. Un écran n'importe pas ces fichiers (test `brand-robot-only.test.ts`).
 */
export function PharmaLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return <Robot size={size} interactive className={cn("shrink-0", className)} />;
}

export function PharmaWordmark({
  className,
  size = 36,
  subtitle,
}: {
  className?: string;
  size?: number;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <PharmaLogo size={size} />
      <div className="min-w-0">
        <p className="text-sm leading-5 font-bold tracking-[-0.025em] text-text-primary">
          Pharma<span className="text-brand-700 dark:text-brand-400">Boost</span>
        </p>
        {subtitle && (
          <p className="truncate text-xs leading-4 text-text-tertiary">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
