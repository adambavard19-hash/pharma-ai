import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Une grande étape numérotée : le numéro à gauche, le titre, puis le détail.
 * Le numéro passe au vert (avec une coche) quand l'étape est faite.
 */
export function StepCard({ number, title, done = false, children }: { number: number; title: string; done?: boolean; children?: ReactNode }) {
  return (
    <li className={cn("flex gap-4 rounded-2xl border p-4 sm:p-5", done ? "border-success-200 bg-success-50/50 dark:border-success-800 dark:bg-success-950/20" : "border-border-subtle bg-surface-card")}>
      <span
        aria-hidden="true"
        className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold text-white tabular", done ? "bg-success-600" : "bg-brand-600")}
      >
        {done ? <Check className="size-5" /> : number}
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        <h3 className="text-[17px] leading-6 font-semibold text-text-primary">
          <span className="sr-only">Étape {number} : </span>
          {title}
        </h3>
        {children}
      </div>
    </li>
  );
}
