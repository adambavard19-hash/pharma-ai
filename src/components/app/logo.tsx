import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Marque PharmaBoost : le petit robot de la bannière du comptoir. La source est
 * `public/logo.svg`, générée par `scripts/logo-robot.ts` avec les couleurs de la
 * bannière ; les déclinaisons PNG (`logo`, `logo-256`, `icon`, `apple-icon`) en
 * sont tirées par le même script.
 */
export function PharmaLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <Image
      src="/logo-256.png"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[22%]", className)}
      aria-hidden="true"
      // Servi tel quel (25 Ko) : un logo changé apparaît aussitôt, sans copie optimisée gardée en cache.
      unoptimized
      priority
    />
  );
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
