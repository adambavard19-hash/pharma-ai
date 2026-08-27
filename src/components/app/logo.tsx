import { cn } from "@/lib/utils";

/**
 * Marque Pharma.ai. Le symbole évoque une croix d'officine dont le quadrant
 * supérieur droit est « augmenté » — l'assistance, pas la substitution.
 */
export function PharmaLogo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="url(#pharmaLogoGradient)" />
      <path
        d="M13.4 8h5.2v5.4H24v5.2h-5.4V24h-5.2v-5.4H8v-5.2h5.4V8Z"
        fill="white"
        fillOpacity="0.95"
      />
      <circle cx="23.2" cy="8.8" r="3.4" fill="var(--color-accent-400)" />
      <defs>
        <linearGradient id="pharmaLogoGradient" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="var(--color-brand-500)" />
          <stop offset="1" stopColor="var(--color-brand-700)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function PharmaWordmark({
  className,
  size = 32,
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
        <p className="text-[15px] leading-5 font-semibold tracking-[-0.01em] text-text-primary">
          Pharma<span className="text-brand-600 dark:text-brand-400">.ai</span>
        </p>
        {subtitle && (
          <p className="truncate text-[11.5px] leading-4 text-text-tertiary">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
