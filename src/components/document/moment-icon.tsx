import type { Moment } from "@/core/posology";

/**
 * Pictogrammes des moments de la journée, dessinés en trait : cohérents entre
 * eux, lisibles en petit, et imprimables en noir et blanc — là où un emoji
 * change de forme d'un appareil à l'autre et disparaît à l'impression.
 */
export function MomentIcon({ moment, className, color }: { moment: Moment | "followup"; className?: string; color?: string }) {
  const common = { className, fill: "none", stroke: color ?? "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };
  switch (moment) {
    case "morning":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2.5M12 19v2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12H5M19 12h2.5M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      );
    case "noon":
      return (
        <svg {...common}>
          <path d="M7 3v7a2.5 2.5 0 0 0 2.5 2.5V21M4.5 3v4.5M9.5 3v4.5" />
          <path d="M17.5 3c-2 1.5-3 4-3 6.5 0 2 1 3 2.5 3.5V21" />
        </svg>
      );
    case "evening":
      return (
        <svg {...common}>
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
      );
    case "bedtime":
      return (
        <svg {...common}>
          <path d="M3 18V9M3 14h18v4M21 14v-2.5a2.5 2.5 0 0 0-2.5-2.5H11v5" />
          <circle cx="6.5" cy="11" r="1.5" />
        </svg>
      );
    case "followup":
      return (
        <svg {...common}>
          <path d="M4 5h16v11H9l-5 4V5Z" />
          <path d="M8.5 10.5h7M8.5 8h7" />
        </svg>
      );
  }
}
