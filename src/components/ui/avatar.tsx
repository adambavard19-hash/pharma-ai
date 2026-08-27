import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
  xl: "size-14 text-base",
} as const;

/**
 * Teinte dérivée du nom : deux collaborateurs différents obtiennent des
 * couleurs différentes, stables d'une session à l'autre.
 */
const PALETTE = [
  "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200",
  "bg-info-100 text-info-700 dark:bg-info-700/30 dark:text-info-500",
  "bg-accent-100 text-accent-800 dark:bg-accent-900/50 dark:text-accent-200",
  "bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-500",
  "bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-200",
];

function toneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({
  initials,
  name,
  imageUrl,
  size = "md",
  className,
}: {
  initials: string;
  name?: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name ?? ""}
        className={cn("shrink-0 rounded-full object-cover", SIZES[size], className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        SIZES[size],
        toneFor(name ?? initials),
        className,
      )}
      title={name}
      aria-hidden={name ? undefined : true}
    >
      {initials}
    </span>
  );
}
