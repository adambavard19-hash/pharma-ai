import { useId, type ReactNode } from "react";
import { Check, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Les visuels des challenges et des objectifs : anneau de progression, jalons, tuiles de chiffres. Statiques : l'entrée
 * de l'écran (`m-rise`) suffit, et « réduire les animations » n'a rien à couper ici.
 */

const TONES = {
  brand: ["var(--color-brand-400)", "var(--color-brand-700)"],
  amber: ["var(--color-accent-300)", "var(--color-accent-600)"],
  success: ["var(--color-success-400)", "var(--color-success-700)"],
} as const;

export function ProgressRing({
  ratio,
  size = 76,
  stroke = 8,
  tone = "brand",
  label,
  caption,
}: {
  /** 0 → 1 (au-delà, l'anneau reste plein). Null : anneau vide, sans chiffre inventé. */
  ratio: number | null;
  size?: number;
  stroke?: number;
  tone?: keyof typeof TONES;
  label: ReactNode;
  caption?: ReactNode;
}) {
  const id = useId();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = ratio === null ? 0 : Math.max(0, Math.min(1, ratio));
  const [from, to] = TONES[tone];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-ink-100)" strokeWidth={stroke} />
        {filled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${id}-g)`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - filled)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className="text-[17px] font-bold tracking-[-0.02em] text-ink-900 tabular">{label}</span>
        {caption && <span className="mt-1 text-[10.5px] font-semibold tracking-wide text-ink-500 uppercase">{caption}</span>}
      </div>
    </div>
  );
}

/** Les paliers du challenge, en unités, sur une piste : atteints (cochés) puis à venir. */
export function Milestones({ milestones, current }: { milestones: { units: number; reached: boolean }[]; current: number }) {
  if (milestones.length === 0) return null;
  const max = Math.max(current, milestones[milestones.length - 1].units);
  const position = (units: number) => `${Math.min(100, (units / max) * 100)}%`;
  return (
    <div className="space-y-2">
      <div className="relative mx-3 h-2 rounded-full bg-ink-100" role="img" aria-label={`Paliers : ${milestones.map((m) => `${m.units} unités${m.reached ? " (atteint)" : ""}`).join(", ")}. L'équipe en est à ${current}.`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,var(--color-accent-300),var(--color-accent-500))]" style={{ width: position(current) }} />
        {milestones.map((milestone) => (
          <span
            key={milestone.units}
            className={cn(
              "absolute top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-white",
              milestone.reached ? "border-accent-500 text-accent-700" : "border-ink-200 text-ink-400",
            )}
            style={{ left: position(milestone.units) }}
          >
            {milestone.reached ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : <Flag className="size-3" aria-hidden="true" />}
          </span>
        ))}
      </div>
      <div className="relative mx-3 h-4 text-[11px] font-semibold text-ink-500 tabular">
        {milestones.map((milestone) => (
          <span key={milestone.units} className="absolute -translate-x-1/2" style={{ left: position(milestone.units) }}>
            {milestone.units}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatTile({ label, value, hint, emphasis = false }: { label: string; value: ReactNode; hint?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-2xl px-3 py-2.5", emphasis ? "bg-brand-50 ring-1 ring-brand-100 ring-inset" : "bg-ink-50")}>
      <p className="truncate text-[11.5px] font-medium text-text-tertiary">{label}</p>
      <p className={cn("text-[20px] leading-tight font-bold tracking-[-0.02em] tabular", emphasis ? "text-brand-800" : "text-ink-900")}>{value}</p>
      {hint && <p className="truncate text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}

export function rankLabel(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}

export function percentLabel(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)} %`;
}

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export function euros(cents: number): string {
  return EUROS.format(cents / 100);
}

const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
/** « 2026-10-31 » → « 31 oct. ». */
export function shortDay(dayKey: string): string {
  return DAY.format(new Date(`${dayKey}T00:00:00.000Z`));
}
