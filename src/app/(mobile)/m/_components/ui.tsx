import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Robot } from "@/components/robot";

/**
 * Les pièces de base de PharmaBoost Mobile, partagées par tous les onglets. Elles ne dépendent d'aucun composant de
 * mise en page du comptoir. Une étape suivante ajoute ses propres pièces dans `<onglet>/_components` ; ce qui sert à
 * plusieurs onglets vient ici.
 */

/**
 * Le robot de la marque dans les en-têtes : le robot VIVANT (`components/robot`), sans fond. Touché, il rit ; la
 * navigation du lien qui l'entoure suit normalement. Immobile pour qui a demandé à réduire les animations.
 */
export function RobotMark({ size = 28, className }: { size?: number; className?: string }) {
  return <Robot size={size} interactive className={cn("shrink-0", className)} />;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[17px] leading-none font-bold tracking-[-0.03em] text-ink-900", className)}>
      Pharma<span className="text-brand-700">Boost</span>
    </span>
  );
}

/** Une carte : coins de 20 px, ombre teintée de la marque, retour au toucher. */
export function MCard({ className, children, style }: { className?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className={cn("rounded-[20px] border border-white/70 bg-white p-4 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] sm:p-5", className)} style={style}>
      {children}
    </section>
  );
}

/** Une carte entièrement cliquable (lien). */
export function MCardLink({ href, className, children, style, ...rest }: ComponentProps<typeof Link> & { className?: string; style?: CSSProperties }) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-[20px] border border-white/70 bg-white p-4 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] transition-transform duration-150 active:scale-[0.985] sm:p-5",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        className,
      )}
      style={style}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function SectionTitle({ title, action, className }: { title: ReactNode; action?: { href: string; label: string }; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-3 px-1", className)}>
      <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink-900">{title}</h2>
      {action && (
        <Link href={action.href} className="-my-2 inline-flex min-h-11 items-center gap-0.5 text-[13.5px] font-semibold text-brand-700">
          {action.label}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** Le titre d'un onglet : grand, serré, comme les applications natives. */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <header className="space-y-1 px-1 pt-2">
      <h1 className="text-[28px] leading-[1.15] font-bold tracking-[-0.03em] text-ink-950">{title}</h1>
      {subtitle && <p className="text-[14.5px] leading-6 text-text-secondary">{subtitle}</p>}
    </header>
  );
}

/** Une pastille d'information (« Bientôt », « Non vérifié », « Sponsorisé »). */
export function Pill({ children, tone = "brand", className }: { children: ReactNode; tone?: "brand" | "neutral" | "amber" | "success"; className?: string }) {
  const tones = {
    brand: "bg-brand-50 text-brand-800 ring-brand-200/70",
    neutral: "bg-ink-100 text-ink-700 ring-ink-200",
    amber: "bg-accent-50 text-accent-800 ring-accent-200",
    success: "bg-success-50 text-success-800 ring-success-200",
  } as const;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

/** Un état « en préparation » ou « vide », honnête et soigné : une icône, une phrase, éventuellement un geste. */
export function QuietState({ icon, title, body, action, compact = false }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode; compact?: boolean }) {
  if (compact) {
    // Une ligne : l'accueil empile plusieurs rubriques, un grand bloc vide par rubrique écraserait l'écran.
    return (
      <div className="flex items-start gap-3.5 rounded-[20px] border border-dashed border-brand-200 bg-white/60 px-4 py-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">{icon}</span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-[14.5px] font-semibold text-ink-900">{title}</p>
          <div className="text-[13px] leading-[1.45] text-text-secondary">{body}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-brand-200 bg-white/60 px-6 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">{icon}</span>
      <div className="space-y-1">
        <p className="text-[15px] font-semibold text-ink-900">{title}</p>
        <div className="text-[13.5px] leading-5 text-text-secondary">{body}</div>
      </div>
      {action}
    </div>
  );
}

/** Une ligne de liste réglage-style : icône, libellé, valeur, chevron. */
export function ListRow({ href, icon, label, value, danger }: { href: string; icon: ReactNode; label: string; value?: ReactNode; danger?: boolean }) {
  const external = href.startsWith("mailto:") || href.startsWith("http");
  const content = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", danger ? "bg-danger-50 text-danger-700" : "bg-brand-50 text-brand-700")}>{icon}</span>
      <span className={cn("min-w-0 flex-1 text-[15px] font-medium", danger ? "text-danger-700" : "text-ink-900")}>{label}</span>
      {value && <span className="max-w-[45%] truncate text-[13.5px] text-text-tertiary">{value}</span>}
      <ChevronRight className="size-4 shrink-0 text-ink-400" aria-hidden="true" />
    </>
  );
  const classes = "flex min-h-14 items-center gap-3 px-4 py-2 transition-colors active:bg-ink-50";
  return external ? <a href={href} className={classes}>{content}</a> : <Link href={href} className={classes}>{content}</Link>;
}
