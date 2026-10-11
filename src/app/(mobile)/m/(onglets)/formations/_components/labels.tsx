import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeCheck, CheckCircle2, CircleDashed, FileText, Handshake, Megaphone, PlayCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateLong } from "@/lib/format";
import { ACADEMY_TOPIC_LABELS, type AcademyTopicCode } from "@/core/academy/topics";

/**
 * Les petites pièces de l'onglet Formations : thème, partenaire, relecture, auteur, état. Elles disent toujours d'où
 * vient un contenu et qui l'a relu — jamais de contenu anonyme, jamais de mise en avant cachée.
 */

export function TopicPill({ topic, onDark = false }: { topic: AcademyTopicCode | null; onDark?: boolean }) {
  if (!topic) return null;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold", onDark ? "bg-white/18 text-white ring-1 ring-white/25 backdrop-blur-md" : "bg-brand-50 text-brand-800 ring-1 ring-brand-200/70 ring-inset")}>
      {ACADEMY_TOPIC_LABELS[topic]}
    </span>
  );
}

/** « Sponsorisé · Marque » ou « Partenaire · Marque » : toujours visible quand un partenaire est en jeu. */
export function PartnerLabel({ partnerName, isSponsored, onDark = false }: { partnerName: string | null; isSponsored: boolean; onDark?: boolean }) {
  if (!partnerName && !isSponsored) return null;
  const Icon = isSponsored ? Megaphone : Handshake;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold", onDark ? "bg-accent-400/90 text-ink-950" : "bg-accent-50 text-accent-800 ring-1 ring-accent-200 ring-inset")}>
      <Icon className="size-3.5" aria-hidden="true" />
      {isSponsored ? "Sponsorisé" : "Partenaire"}
      {partnerName && <span className="font-medium">· {partnerName}</span>}
    </span>
  );
}

export function VerifiedLine({ reviewedBy, reviewedAt, reviewerIsPharmacist, validUntil, onDark = false, className }: { reviewedBy: string | null; reviewedAt: Date | null; reviewerIsPharmacist: boolean; validUntil?: Date | null; onDark?: boolean; className?: string }) {
  if (!reviewedAt && !reviewedBy) return null;
  return (
    <p className={cn("flex items-start gap-1.5 text-[12px] leading-4", onDark ? "text-white/85" : "text-text-tertiary", className)}>
      <ShieldCheck className={cn("size-3.5 shrink-0", onDark ? "text-brand-200" : "text-brand-600")} aria-hidden="true" />
      <span>
        Vérifiée{reviewedAt ? ` le ${formatDateLong(reviewedAt)}` : ""}
        {reviewedBy ? ` par ${reviewedBy}` : ""}
        {reviewerIsPharmacist ? " (pharmacien)" : ""}
        {validUntil ? ` · valable jusqu'au ${formatDateLong(validUntil)}` : ""}
      </span>
    </p>
  );
}

function initials(name: string): string {
  return name
    .replace(/^(dr|pr)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AuthorBadge({ name, role, onDark = false, size = "md" }: { name: string | null; role: string | null; onDark?: boolean; size?: "sm" | "md" }) {
  if (!name) return null;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full font-bold",
          size === "sm" ? "size-7 text-[10.5px]" : "size-9 text-[12px]",
          onDark ? "bg-white text-brand-800 ring-2 ring-white/40" : "bg-brand-gradient text-white",
        )}
      >
        {initials(name) || "PB"}
      </span>
      <span className="min-w-0 leading-tight">
        <span className={cn("flex items-center gap-1 truncate text-[13.5px] font-semibold", onDark ? "text-white" : "text-ink-900")}>
          {name}
          <BadgeCheck className={cn("size-3.5 shrink-0", onDark ? "text-brand-200" : "text-brand-600")} aria-label="Auteur identifié" />
        </span>
        {role && <span className={cn("block truncate text-[11.5px]", onDark ? "text-white/75" : "text-text-tertiary")}>{role}</span>}
      </span>
    </span>
  );
}

export function StatusPill({ status, percent, quizPassed }: { status: string; percent: number; quizPassed?: boolean }) {
  if (status === "DONE")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11.5px] font-semibold text-success-800 ring-1 ring-success-200 ring-inset">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {quizPassed ? "Quiz réussi" : "Terminé"}
      </span>
    );
  if (status === "IN_PROGRESS")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-semibold text-brand-800 ring-1 ring-brand-200 ring-inset">
        <CircleDashed className="size-3.5" aria-hidden="true" />
        En cours · {percent} %
      </span>
    );
  return null;
}

/** La vignette d'un contenu : son image d'attente, sinon un aplat de la marque avec l'icône du format. */
export function Thumb({ posterUrl, kind, vertical, className, children }: { posterUrl: string | null; kind: string; vertical?: boolean; className?: string; children?: ReactNode }) {
  const Icon = kind === "SHEET" ? FileText : PlayCircle;
  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded-2xl bg-[linear-gradient(150deg,var(--color-brand-700),var(--color-brand-500))]", vertical ? "aspect-[9/14]" : "aspect-video", className)}>
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- image servie par la route contrôlée de l'Académie (session requise)
        <img src={posterUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-white/90">
          <Icon className="size-7" aria-hidden="true" />
        </span>
      )}
      {children}
    </span>
  );
}

const SEGMENTS = [
  { key: "pour-vous", label: "Pour vous" },
  { key: "catalogue", label: "Catalogue" },
  { key: "parcours", label: "Parcours" },
  { key: "passeport", label: "Passeport" },
] as const;

export type FormationsView = (typeof SEGMENTS)[number]["key"];

export function isFormationsView(value: unknown): value is FormationsView {
  return SEGMENTS.some((segment) => segment.key === value);
}

/** Les sous-onglets : de vrais liens (l'adresse dit la vue), avec l'état courant annoncé. */
export function Segments({ current }: { current: FormationsView }) {
  return (
    <nav aria-label="Vues de l'Académie" className="flex gap-1 rounded-2xl bg-ink-100/80 p-1">
      {SEGMENTS.map((segment) => {
        const active = segment.key === current;
        return (
          <Link
            key={segment.key}
            href={segment.key === "pour-vous" ? "/m/formations" : `/m/formations?vue=${segment.key}`}
            aria-current={active ? "page" : undefined}
            scroll={false}
            className={cn(
              "flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl px-1 text-[13px] transition-all duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
              active ? "bg-white font-semibold text-ink-900 shadow-sm" : "font-medium text-ink-500 active:scale-95",
            )}
          >
            <span className="truncate">{segment.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** L'honnêteté, en une ligne, partout où on parle de « formation ». */
export function NotDpcNote({ className }: { className?: string }) {
  return <p className={cn("px-1 text-[12px] leading-4 text-text-tertiary", className)}>Formations courtes d&apos;information professionnelle de l&apos;Académie PharmaBoost. Ce ne sont pas des actions de DPC.</p>;
}
