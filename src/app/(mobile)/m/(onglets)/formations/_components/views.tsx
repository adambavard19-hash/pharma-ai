import Link from "next/link";
import { Award, BookOpenCheck, CheckCircle2, ChevronRight, Clock, GraduationCap, Lock, Route, Search, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateLong } from "@/lib/format";
import { ACADEMY_TOPICS, ACADEMY_TOPIC_LABELS } from "@/core/academy/topics";
import { formatSeconds } from "@/core/academy/content";
import { passportShareText } from "@/core/academy/passport";
import type { AcademyCard, ModuleCard, Passport } from "@/server/services/mobile/academy";
import { MCard, MCardLink, QuietState, SectionTitle } from "../../../_components/ui";
import { PartnerLabel, StatusPill, Thumb } from "./labels";
import { SharePassportButton } from "./share-passport";

/** La ligne d'un contenu dans une liste (catalogue, parcours). */
export function ContentRow({ card, prefix }: { card: AcademyCard; prefix?: React.ReactNode }) {
  return (
    <MCardLink href={`/m/formations/${card.id}`} className="flex items-center gap-3.5 p-3 sm:p-3">
      {prefix}
      <Thumb posterUrl={card.posterUrl} kind={card.kind} vertical={false} className="w-[104px]">
        {card.durationLabel && <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">{card.durationLabel}</span>}
      </Thumb>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="line-clamp-2 block text-[15px] leading-snug font-semibold text-ink-900">{card.title}</span>
        <span className="block truncate text-[12.5px] text-text-tertiary">
          {[card.topic ? ACADEMY_TOPIC_LABELS[card.topic] : null, card.author].filter(Boolean).join(" · ")}
        </span>
        <span className="flex flex-wrap gap-1">
          <StatusPill status={card.status} percent={card.percent} quizPassed={card.quizPassed} />
          {(card.partnerName || card.isSponsored) && <PartnerLabel partnerName={card.partnerName} isSponsored={card.isSponsored} />}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-300" aria-hidden="true" />
    </MCardLink>
  );
}

// --- Catalogue ------------------------------------------------------------------------------------------------

export function CatalogueView({ items, total, q, topic, format, isFree }: { items: AcademyCard[]; total: number; q: string; topic: string | null; format: string | null; isFree: boolean }) {
  const link = (next: { topic?: string | null; format?: string | null }) => {
    const params = new URLSearchParams({ vue: "catalogue" });
    if (q) params.set("q", q);
    const t = next.topic === undefined ? topic : next.topic;
    const f = next.format === undefined ? format : next.format;
    if (t) params.set("theme", t);
    if (f) params.set("format", f);
    return `/m/formations?${params.toString()}`;
  };
  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href + label}
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn("flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap ring-1 transition-colors ring-inset", active ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-200 active:bg-ink-50")}
    >
      {label}
    </Link>
  );
  return (
    <div className="space-y-4">
      <form action="/m/formations" role="search" className="relative">
        <input type="hidden" name="vue" value="catalogue" />
        {topic && <input type="hidden" name="theme" value={topic} />}
        {format && <input type="hidden" name="format" value={format} />}
        <label htmlFor="academie-recherche" className="sr-only">
          Rechercher une formation
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          id="academie-recherche"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Un sujet, un auteur, un laboratoire…"
          enterKeyHint="search"
          className="h-12 w-full rounded-2xl border border-ink-200 bg-white pr-4 pl-11 text-[16px] text-ink-900 shadow-xs outline-none placeholder:text-ink-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
        />
      </form>

      <div className="m-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:-mx-8 lg:px-8" aria-label="Thèmes">
        {chip(link({ topic: null }), "Tout", !topic)}
        {ACADEMY_TOPICS.map((code) => chip(link({ topic: code }), ACADEMY_TOPIC_LABELS[code], topic === code))}
      </div>
      <div className="flex gap-2" aria-label="Formats">
        {chip(link({ format: null }), "Tous formats", !format)}
        {chip(link({ format: "video" }), "Vidéos", format === "video")}
        {chip(link({ format: "fiche" }), "Fiches", format === "fiche")}
      </div>

      <p className="px-1 text-[13px] text-text-tertiary" aria-live="polite">
        {items.length} formation{items.length > 1 ? "s" : ""}
        {q || topic || format ? ` sur ${total}` : ""}
      </p>

      {items.length > 0 ? (
        <div className="space-y-2.5">
          {items.map((card) => (
            <ContentRow key={card.id} card={card} />
          ))}
        </div>
      ) : (
        <QuietState
          icon={<Search className="size-6" aria-hidden="true" />}
          title={total === 0 ? "Les premières formations arrivent" : "Aucune formation ne correspond"}
          body={total === 0 ? "Elles sont relues avant d'être publiées : elles apparaîtront ici." : "Essayez un autre mot ou un autre thème."}
          action={total > 0 && (q || topic || format) ? <Link href="/m/formations?vue=catalogue" className="inline-flex h-11 items-center rounded-full bg-brand-50 px-4 text-[14px] font-semibold text-brand-800">Tout afficher</Link> : undefined}
        />
      )}

      {isFree && (
        <div className="flex items-start gap-3 rounded-[20px] bg-ink-50 px-4 py-3.5 text-[13px] leading-[1.45] text-text-secondary">
          <Lock className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden="true" />
          <p>Compte gratuit : vous voyez les formations ouvertes à tous. Les équipes des officines clientes de PharmaBoost ont accès à toute l&apos;Académie.</p>
        </div>
      )}
    </div>
  );
}

// --- Parcours ----------------------------------------------------------------------------------------------------

export function ModulesView({ modules }: { modules: ModuleCard[] }) {
  if (modules.length === 0) {
    return <QuietState icon={<Route className="size-6" aria-hidden="true" />} title="Pas encore de parcours" body="Les parcours enchaînent quelques vidéos courtes et leurs quiz, dans un ordre pensé pour apprendre. Ils apparaîtront ici." />;
  }
  return (
    <div className="space-y-3">
      {modules.map((module) => (
        <ModuleTile key={module.id} module={module} />
      ))}
    </div>
  );
}

export function ModuleTile({ module, compact = false }: { module: ModuleCard; compact?: boolean }) {
  const { progress } = module;
  return (
    <MCardLink href={`/m/formations/parcours/${module.slug}`} className="relative overflow-hidden p-0 sm:p-0">
      <div className={cn("relative bg-[linear-gradient(140deg,oklch(0.44_0.075_188)_0%,oklch(0.52_0.09_176)_55%,oklch(0.58_0.105_162)_100%)] px-5 text-white", compact ? "py-4" : "py-5")}>
        <div aria-hidden="true" className="pointer-events-none absolute -top-12 -right-8 size-40 rounded-full bg-white/12 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-1.5">
          {module.audience === "NEW_STAFF" && <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-white/25">Pour bien démarrer</span>}
          {(module.partnerName || module.isSponsored) && <PartnerLabel partnerName={module.partnerName} isSponsored={module.isSponsored} onDark />}
          {progress.complete && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-bold text-success-800">
              <Award className="size-3.5" aria-hidden="true" />
              Terminé
            </span>
          )}
        </div>
        <h3 className="relative mt-2.5 text-[19px] leading-tight font-bold tracking-[-0.02em]">{module.title}</h3>
        {!compact && module.summary && <p className="relative mt-1 line-clamp-2 text-[13.5px] leading-[1.4] text-white/85">{module.summary}</p>}
      </div>
      <div className="space-y-2.5 px-5 py-4">
        <div className="flex items-center justify-between text-[12.5px] font-medium text-text-tertiary">
          <span className="flex items-center gap-1.5">
            <BookOpenCheck className="size-4" aria-hidden="true" />
            {module.count} étape{module.count > 1 ? "s" : ""}
            {module.durationLabel && (
              <>
                <span aria-hidden="true">·</span>
                <Clock className="size-3.5" aria-hidden="true" />
                {module.durationLabel}
              </>
            )}
          </span>
          <span className="font-semibold text-ink-700 tabular">
            {progress.doneRequired}/{progress.required} validée{progress.doneRequired > 1 ? "s" : ""}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={`Avancement du parcours : ${progress.percent} %`}>
          <div className="h-full rounded-full bg-brand-gradient transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
    </MCardLink>
  );
}

// --- Passeport -----------------------------------------------------------------------------------------------------

export function PassportView({ passport, firstName, fullName, subtitle }: { passport: Passport; firstName: string; fullName: string; subtitle: string }) {
  const shareText = passportShareText({ firstName, badges: passport.badges, completedCount: passport.completedCount });
  const learned = formatSeconds(passport.totalSeconds);
  return (
    <div className="space-y-6">
      {/* La carte partageable */}
      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(150deg,oklch(0.36_0.06_195)_0%,oklch(0.46_0.08_182)_50%,oklch(0.56_0.1_165)_100%)] p-5 text-white shadow-[0_18px_40px_-18px_oklch(0.42_0.08_180/0.8)]">
        <div aria-hidden="true" className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-accent-300/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-white/75 uppercase">
              <GraduationCap className="size-4" aria-hidden="true" />
              Passeport de compétences
            </p>
            <h2 className="mt-1.5 truncate text-[24px] leading-tight font-bold tracking-[-0.02em]">{fullName}</h2>
            <p className="truncate text-[13px] text-white/80">{subtitle}</p>
          </div>
          <SharePassportButton text={shareText} />
        </div>
        <dl className="relative mt-5 grid grid-cols-3 gap-2">
          {[
            { label: "Formations", value: passport.completedCount },
            { label: "Quiz réussis", value: passport.quizzesPassed },
            { label: "Parcours", value: passport.modulesCompleted },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/12 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur-sm">
              <dd className="text-[24px] leading-none font-bold tabular">{stat.value}</dd>
              <dt className="mt-1 text-[11.5px] font-medium text-white/80">{stat.label}</dt>
            </div>
          ))}
        </dl>
        {learned && <p className="relative mt-3 text-[12.5px] text-white/80">{learned} de vidéos et fiches validées.</p>}
      </section>

      {/* Badges */}
      <section className="space-y-3">
        <SectionTitle title="Mes badges" />
        {passport.badges.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {passport.badges.map((badge) => (
              <li key={badge.id} className="flex flex-col gap-2 rounded-[20px] border border-white/70 bg-white p-3.5 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
                <span className={cn("flex size-10 items-center justify-center rounded-2xl", badge.kind === "MODULE_COMPLETED" ? "bg-accent-100 text-accent-800" : "bg-brand-50 text-brand-700")}>
                  {badge.kind === "MODULE_COMPLETED" ? <Trophy className="size-5" aria-hidden="true" /> : <Award className="size-5" aria-hidden="true" />}
                </span>
                <span className="line-clamp-3 text-[13.5px] leading-snug font-semibold text-ink-900">{badge.title}</span>
                <span className="mt-auto text-[11.5px] text-text-tertiary">
                  {badge.kind === "MODULE_COMPLETED" ? "Parcours terminé" : `Quiz réussi${badge.score !== null ? ` · ${badge.score} %` : ""}`}
                  <br />
                  {formatDateLong(badge.earnedAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <QuietState compact icon={<Award className="size-6" aria-hidden="true" />} title="Votre premier badge vous attend" body="Réussissez le quiz d'une vidéo, ou terminez un parcours : le badge s'ajoute ici et vous suit d'une officine à l'autre." />
        )}
      </section>

      {/* Historique */}
      <section className="space-y-3">
        <SectionTitle title="Formations suivies" />
        {passport.history.length > 0 ? (
          <MCard className="divide-y divide-ink-100 p-0 sm:p-0">
            {passport.history.map((row) => {
              const inner = (
                <>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", row.status === "DONE" ? "bg-success-50 text-success-700" : "bg-brand-50 text-brand-700")}>
                    {row.status === "DONE" ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <Sparkles className="size-5" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink-900">{row.title}</span>
                    <span className="block text-[12px] text-text-tertiary">
                      {row.status === "DONE" ? `Terminée le ${formatDateLong(row.completedAt ?? row.updatedAt)}` : `En cours · ${row.percent} %`}
                      {row.bestScore !== null ? ` · meilleur quiz ${row.bestScore} %` : ""}
                    </span>
                  </span>
                  {row.visible && <ChevronRight className="size-4 shrink-0 text-ink-300" aria-hidden="true" />}
                </>
              );
              return row.visible ? (
                <Link key={row.contentId} href={`/m/formations/${row.contentId}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 active:bg-ink-50">
                  {inner}
                </Link>
              ) : (
                <div key={row.contentId} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
                  {inner}
                </div>
              );
            })}
          </MCard>
        ) : (
          <QuietState compact icon={<BookOpenCheck className="size-6" aria-hidden="true" />} title="Rien pour l'instant" body="Les formations que vous commencez s'affichent ici, avec votre avancement." />
        )}
      </section>
    </div>
  );
}
