import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeCheck, GraduationCap, Megaphone, Play, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandSummary, LaunchSummary, TrainingSummary } from "@/server/services/mobile/discover";
import type { SponsoredCard } from "@/server/services/mobile/sponsoring";
import { SponsoredImpression } from "./sponsored-tracker";
import { FavoriteButton } from "./favorite-button";

/**
 * Les cartes de l'onglet Découvertes. Tout contenu commercial porte son étiquette, lisible au premier coup d'œil :
 * « Sponsorisé » (campagne payée) ou « Partenaire » (contenu publié par une marque).
 */

export function CommercialBadge({ kind, className, onImage = false }: { kind: "Sponsorisé" | "Partenaire"; className?: string; onImage?: boolean }) {
  const sponsored = kind === "Sponsorisé";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] leading-none font-semibold tracking-[0.01em]",
        onImage
          ? "bg-white/92 text-ink-800 shadow-[0_1px_6px_rgb(0_0_0/0.12)] backdrop-blur"
          : sponsored
            ? "bg-accent-50 text-accent-800 ring-1 ring-accent-200 ring-inset"
            : "bg-brand-50 text-brand-800 ring-1 ring-brand-200/70 ring-inset",
        className,
      )}
    >
      {sponsored ? <Megaphone className="size-3" aria-hidden="true" /> : <BadgeCheck className="size-3" aria-hidden="true" />}
      {kind}
    </span>
  );
}

/** Le logo d'une marque, ou ses initiales sur un fond de la marque PharmaBoost quand il n'y en a pas. */
export function BrandLogo({ name, logoUrl, size = 48, className }: { name: string; logoUrl: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-ink-100 bg-white", className)}
      style={{ width: size, height: size }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo fourni par le partenaire, domaine non connu à l'avance
        <img src={logoUrl} alt="" className="size-full object-contain p-1.5" />
      ) : (
        <span className="flex size-full items-center justify-center bg-[linear-gradient(135deg,var(--color-brand-100),var(--color-brand-50))] text-[15px] font-bold tracking-[-0.02em] text-brand-800" aria-hidden="true">
          {initials}
        </span>
      )}
    </span>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink-900">{title}</h2>
        {subtitle && <p className="text-[12.5px] text-text-tertiary">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Une rangée qui défile horizontalement au téléphone, sans barre visible. */
export function Rail({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="list" aria-label={label} className="m-rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:-mx-8 lg:px-8">
      {children}
    </div>
  );
}

const CARD = "rounded-[20px] border border-white/70 bg-white shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

function Poster({ url, video, className }: { url: string | null; video?: boolean; className?: string }) {
  return (
    <span className={cn("relative block overflow-hidden bg-[linear-gradient(135deg,var(--color-brand-100),var(--color-brand-50))]", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- visuel fourni par le partenaire, domaine non connu à l'avance
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-brand-600/60" aria-hidden="true">
          <Sparkles className="size-8" />
        </span>
      )}
      {video && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-brand-800 shadow-lg">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
      )}
    </span>
  );
}

/** Carte sponsorisée : grande, signalée « Sponsorisé » avec le nom du laboratoire, et comptée. */
export function SponsoredHeroCard({ card, className }: { card: SponsoredCard; className?: string }) {
  return (
    <SponsoredImpression campaignId={card.campaignId} placement={card.placement} className={className}>
      <Link href={card.href} className={cn(CARD, FOCUS, "group block overflow-hidden transition-transform duration-150 active:scale-[0.985]")}>
        <span className="relative block">
          <Poster url={card.imageUrl} className={card.imageUrl ? "aspect-[16/9] w-full lg:aspect-[21/9]" : "h-24 w-full"} />
          <span className="absolute top-3 left-3">
            <CommercialBadge kind="Sponsorisé" onImage />
          </span>
        </span>
        <span className="flex items-start gap-3 p-4">
          <BrandLogo name={card.brandName ?? card.partnerName} logoUrl={card.brandLogoUrl} size={40} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block text-[12px] font-semibold text-text-tertiary">
              {card.brandName ?? card.partnerName} · {card.formatLabel}
            </span>
            <span className="line-clamp-2 block text-[16px] leading-snug font-bold tracking-[-0.01em] text-ink-900">{card.title}</span>
            {card.summary && <span className="line-clamp-2 block text-[13px] leading-[1.45] text-text-secondary">{card.summary}</span>}
            <span className="block text-[11.5px] text-text-tertiary">Contenu sponsorisé par {card.partnerName}</span>
          </span>
        </span>
      </Link>
    </SponsoredImpression>
  );
}

export function LaunchCard({ launch, favorite, wide = false }: { launch: LaunchSummary; favorite?: boolean; wide?: boolean }) {
  const video = launch.mediaKind === "embed" || launch.mediaKind === "video";
  return (
    <div role="listitem" className={cn("relative shrink-0 snap-start", wide ? "w-full" : "w-[78%] max-w-[300px]")}>
      <Link href={`/m/decouvertes/nouveautes/${launch.id}`} className={cn(CARD, FOCUS, "block h-full overflow-hidden transition-transform duration-150 active:scale-[0.985]")}>
        <span className="relative block">
          <Poster url={launch.posterUrl} video={video} className="aspect-[16/10] w-full" />
          <span className="absolute top-3 left-3">
            <CommercialBadge kind="Partenaire" onImage />
          </span>
        </span>
        <span className="block space-y-1 px-4 pt-3 pb-4">
          <span className="block truncate text-[12px] font-semibold text-brand-700">{launch.brandName}</span>
          <span className="line-clamp-2 block text-[15px] leading-snug font-semibold text-ink-900">{launch.title}</span>
          {launch.universeLabel && <span className="block text-[12px] text-text-tertiary">{launch.universeLabel}</span>}
        </span>
      </Link>
      {favorite !== undefined && (
        <span className="absolute top-2 right-2">
          <FavoriteButton type="LAUNCH" id={launch.id} initial={favorite} label={launch.title} onImage />
        </span>
      )}
    </div>
  );
}

/** Une vidéo courte de découverte : format vertical, comme les applications de vidéo. */
export function VideoCard({ launch }: { launch: LaunchSummary }) {
  return (
    <div role="listitem" className="w-[46%] max-w-[190px] shrink-0 snap-start">
      <Link href={`/m/decouvertes/nouveautes/${launch.id}`} className={cn(FOCUS, "relative block overflow-hidden rounded-[18px] shadow-[0_8px_24px_-10px_oklch(0.3_0.05_183/0.45)] transition-transform duration-150 active:scale-[0.98]")}>
        <Poster url={launch.posterUrl} video className="aspect-[9/14] w-full" />
        <span className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.72),transparent)] px-3 pt-10 pb-3">
          <span className="block truncate text-[11.5px] font-semibold text-white/85">{launch.brandName}</span>
          <span className="line-clamp-2 block text-[13.5px] leading-snug font-semibold text-white">{launch.title}</span>
        </span>
        <span className="absolute top-2.5 left-2.5">
          <CommercialBadge kind="Partenaire" onImage />
        </span>
      </Link>
    </div>
  );
}

export function BrandCard({ brand, favorite }: { brand: BrandSummary; favorite?: boolean }) {
  return (
    <div className="relative">
      <Link href={`/m/decouvertes/marques/${brand.slug}`} className={cn(CARD, FOCUS, "flex h-full items-start gap-3.5 p-4 transition-transform duration-150 active:scale-[0.985]")}>
        <BrandLogo name={brand.name} logoUrl={brand.logoUrl} size={52} />
        <span className="min-w-0 flex-1 space-y-1 pr-9">
          <span className="block truncate text-[15.5px] font-bold tracking-[-0.01em] text-ink-900">{brand.name}</span>
          <span className="block truncate text-[12.5px] text-text-tertiary">{brand.partnerName}</span>
          {brand.description && <span className="line-clamp-2 block text-[13px] leading-[1.45] text-text-secondary">{brand.description}</span>}
          <span className="flex flex-wrap items-center gap-1.5 pt-1">
            <CommercialBadge kind="Partenaire" />
            {brand.universeLabels.slice(0, 2).map((label) => (
              <span key={label} className="rounded-full bg-ink-50 px-2 py-[3px] text-[11px] font-medium text-ink-600">
                {label}
              </span>
            ))}
          </span>
        </span>
      </Link>
      {favorite !== undefined && (
        <span className="absolute top-2.5 right-2.5">
          <FavoriteButton type="BRAND" id={brand.id} initial={favorite} label={brand.name} />
        </span>
      )}
    </div>
  );
}

export function TrainingCard({ training, favorite }: { training: TrainingSummary; favorite?: boolean }) {
  return (
    <div role="listitem" className="relative w-[78%] max-w-[300px] shrink-0 snap-start">
      <Link href={training.href} className={cn(CARD, FOCUS, "flex h-full gap-3 p-3.5 transition-transform duration-150 active:scale-[0.985]")}>
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-gradient text-white">
          {training.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- vignette de formation, domaine non connu à l'avance
            <img src={training.posterUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <GraduationCap className="size-7" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1 space-y-1 pr-8">
          <span className="block text-[11.5px] font-semibold text-brand-700">
            {training.kindLabel}
            {training.durationLabel && <span className="text-ink-400"> · {training.durationLabel}</span>}
          </span>
          <span className="line-clamp-2 block text-[14.5px] leading-snug font-semibold text-ink-900">{training.title}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {training.partnerId && <CommercialBadge kind={training.isSponsored ? "Sponsorisé" : "Partenaire"} />}
            {training.partnerName && <span className="truncate text-[11.5px] text-text-tertiary">{training.partnerName}</span>}
          </span>
        </span>
      </Link>
      {favorite !== undefined && (
        <span className="absolute top-2 right-2">
          <FavoriteButton type="TRAINING" id={training.id} initial={favorite} label={training.title} />
        </span>
      )}
    </div>
  );
}
