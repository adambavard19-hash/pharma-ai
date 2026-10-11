import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Pill } from "./ui";

/**
 * L'état « en préparation » d'un onglet : la structure de l'onglet (ses sous-onglets, montrés tels qu'ils seront)
 * et, honnêtement, ce qui arrive. Les étapes suivantes du chantier remplacent ce bloc par le vrai contenu.
 */
export function SegmentsPreview({ segments }: { segments: string[] }) {
  return (
    <div className="flex gap-1 rounded-2xl bg-ink-100/80 p-1" role="presentation">
      {segments.map((segment, index) => (
        <span
          key={segment}
          className={
            index === 0
              ? "flex h-10 flex-1 items-center justify-center rounded-xl bg-white text-[13px] font-semibold text-ink-900 shadow-sm"
              : "flex h-10 flex-1 items-center justify-center rounded-xl text-[13px] font-medium text-ink-500"
          }
        >
          {segment}
        </span>
      ))}
    </div>
  );
}

export function ComingSoonCard({ icon, title, body, items }: { icon: ReactNode; title: string; body: ReactNode; items: string[] }) {
  return (
    <section className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white p-5 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
      <div aria-hidden="true" className="pointer-events-none absolute -top-12 -right-12 size-44 rounded-full bg-brand-100/60 blur-2xl" />
      <div className="relative space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-md">{icon}</span>
          <Pill>En préparation</Pill>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-[19px] font-bold tracking-[-0.025em] text-ink-900">{title}</h2>
          <div className="text-[14px] leading-[1.55] text-text-secondary">{body}</div>
        </div>
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[14px] leading-5 text-ink-800">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <Check className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
