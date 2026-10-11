import type { Metadata } from "next";
import { ArrowUpRight, BookOpenCheck, Compass, Play, Sparkles, Trophy } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { loadContinueCard, loadMyChallenges, loadPartnerLaunches } from "@/server/services/mobile/home";
import { greetingFor, PROFESSION_LABELS } from "@/core/mobile/profile";
import { FloatingRobot } from "@/app/(public)/decouvrir/_components/floating-robot";
import { MCard, MCardLink, Pill, QuietState, SectionTitle } from "../_components/ui";

export const metadata: Metadata = { title: "Accueil" };

/**
 * L'accueil. Tout ce qui s'affiche vient de la base : pas de carte factice. Quand rien n'est encore publié (pas de
 * formation, pas de nouveauté), l'écran le dit simplement.
 */
export default async function MobileHomePage() {
  const session = await requireUser();
  const now = new Date();
  const [continueCard, launches, challenges] = await Promise.all([
    loadContinueCard(session.user.id, session.scope, now),
    loadPartnerLaunches(now),
    session.scope ? loadMyChallenges(session.scope) : Promise.resolve(null),
  ]);

  const who = session.activePharmacy
    ? `${session.roleLabel} · ${session.activePharmacy.name}`
    : session.user.profession
      ? PROFESSION_LABELS[session.user.profession]
      : "Compte gratuit";

  return (
    <div className="space-y-7">
      {/* Bonjour, avec le robot */}
      <section className="m-rise relative overflow-hidden rounded-[24px] bg-[linear-gradient(140deg,oklch(0.44_0.075_188)_0%,oklch(0.52_0.09_176)_55%,oklch(0.58_0.105_162)_100%)] px-5 py-5 text-white shadow-[0_18px_40px_-18px_oklch(0.42_0.08_180/0.8)]">
        <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/12 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[13px] font-medium text-white/80">{greetingFor(now)},</p>
            <h1 className="text-[28px] leading-none font-bold tracking-[-0.03em]">{session.user.firstName}</h1>
            <p className="truncate text-[13px] text-white/85">{who}</p>
          </div>
          <FloatingRobot className="h-[92px] w-[78px] shrink-0 drop-shadow-[0_12px_18px_rgba(0,0,0,0.2)]" />
        </div>
      </section>

      {/* Continuer ma formation */}
      <section className="m-rise space-y-3" style={{ animationDelay: "60ms" }}>
        <SectionTitle title="Continuer ma formation" action={continueCard ? { href: "/m/formations", label: "Tout voir" } : undefined} />
        {continueCard ? (
          <MCardLink href="/m/formations" className="flex items-center gap-4">
            <span className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-md">
              <Play className="size-7 fill-white" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="flex items-center gap-2 text-[12px] font-semibold text-brand-700">
                {continueCard.kindLabel}
                {continueCard.durationLabel && <span className="text-ink-400">· {continueCard.durationLabel}</span>}
              </span>
              <span className="line-clamp-2 block text-[15.5px] leading-snug font-semibold text-ink-900">{continueCard.title}</span>
              {continueCard.mode === "continue" ? (
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span className="block h-full rounded-full bg-brand-gradient" style={{ width: `${continueCard.percent}%` }} />
                  </span>
                  <span className="text-[12px] font-semibold text-ink-600 tabular">{continueCard.percent} %</span>
                </span>
              ) : (
                <span className="text-[12.5px] font-medium text-ink-500">Nouveau · à découvrir</span>
              )}
            </span>
          </MCardLink>
        ) : (
          <QuietState
            compact
            icon={<BookOpenCheck className="size-6" aria-hidden="true" />}
            title="Les premières formations arrivent"
            body="Des vidéos courtes, relues par des pharmaciens, à suivre entre deux patients. Elles apparaîtront ici."
          />
        )}
      </section>

      {/* Nouveautés partenaires */}
      <section className="m-rise space-y-3" style={{ animationDelay: "120ms" }}>
        <SectionTitle title="Nouveautés partenaires" action={launches.length > 0 ? { href: "/m/decouvertes", label: "Découvrir" } : undefined} />
        {launches.length > 0 ? (
          <div className="m-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:-mx-8 lg:px-8">
            {launches.map((launch) => (
              <MCardLink key={launch.id} href="/m/decouvertes" className="w-[78%] max-w-[300px] shrink-0 space-y-2 p-0 sm:p-0">
                <span className="relative block aspect-[16/10] overflow-hidden rounded-t-[20px] bg-[linear-gradient(135deg,var(--color-brand-100),var(--color-brand-50))]">
                  {launch.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- visuel fourni par le partenaire, domaine non connu à l'avance
                    <img src={launch.posterUrl} alt="" className="size-full object-cover" />
                  )}
                </span>
                <span className="block space-y-1 px-4 pb-4">
                  <span className="block text-[12px] font-semibold text-brand-700">{launch.brandName}</span>
                  <span className="line-clamp-2 block text-[15px] leading-snug font-semibold text-ink-900">{launch.title}</span>
                </span>
              </MCardLink>
            ))}
          </div>
        ) : (
          <QuietState
            compact
            icon={<Sparkles className="size-6" aria-hidden="true" />}
            title="Rien de neuf pour l'instant"
            body="Les lancements et les informations des laboratoires partenaires, vérifiés avant publication, s'afficheront ici."
          />
        )}
      </section>

      {/* Mes challenges (équipes clientes) */}
      {challenges && (
        <section className="m-rise space-y-3" style={{ animationDelay: "180ms" }}>
          <SectionTitle title="Mes challenges" action={challenges.length > 0 ? { href: "/m/challenges", label: "Détails" } : undefined} />
          {challenges.length > 0 ? (
            <div className="space-y-3">
              {challenges.slice(0, 3).map((challenge) => {
                const percent = challenge.target ? Math.min(100, Math.round((challenge.teamUnits / challenge.target) * 100)) : null;
                return (
                  <MCard key={challenge.id} className="space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
                        <Trophy className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-ink-900">{challenge.title}</p>
                        <p className="text-[12.5px] text-text-tertiary">{challenge.laboratory} · {challenge.daysRemaining > 0 ? `encore ${challenge.daysRemaining} j` : "dernier jour"}</p>
                      </div>
                      {challenge.rank && <Pill tone="amber">{challenge.rank === 1 ? "1er" : `${challenge.rank}e`}</Pill>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-ink-50 px-3 py-2">
                        <p className="text-[11.5px] font-medium text-text-tertiary">Mes ventes</p>
                        <p className="text-[18px] font-bold text-ink-900 tabular">{challenge.myUnits}</p>
                      </div>
                      <div className="rounded-xl bg-ink-50 px-3 py-2">
                        <p className="text-[11.5px] font-medium text-text-tertiary">L&apos;équipe{challenge.target ? ` / ${challenge.target}` : ""}</p>
                        <p className="text-[18px] font-bold text-ink-900 tabular">{challenge.teamUnits}</p>
                      </div>
                    </div>
                    {percent !== null && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent-400),var(--color-accent-500))]" style={{ width: `${percent}%` }} />
                      </div>
                    )}
                  </MCard>
                );
              })}
            </div>
          ) : (
            <QuietState
            compact
              icon={<Trophy className="size-6" aria-hidden="true" />}
              title="Aucun challenge en cours"
              body={`Quand ${session.activePharmacy?.name ?? "votre officine"} lancera un challenge, votre progression s'affichera ici.`}
            />
          )}
        </section>
      )}

      {/* L'offre, pour les comptes gratuits */}
      {!session.isClientStaff && (
        <section className="m-rise" style={{ animationDelay: "180ms" }}>
          <a
            href="/decouvrir"
            className="group relative block overflow-hidden rounded-[24px] border border-brand-100 bg-white p-5 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] transition-transform active:scale-[0.985]"
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-8 -bottom-10 size-40 rounded-full bg-brand-100/70 blur-2xl" />
            <div className="relative flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-white">
                <Compass className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[16px] font-bold tracking-[-0.02em] text-ink-900">Découvrir PharmaBoost pour votre officine</p>
                <p className="text-[13.5px] leading-5 text-text-secondary">Au scan de l&apos;ordonnance, le bon conseil au comptoir. Le pharmacien décide, PharmaBoost mesure ce que l&apos;équipe apporte.</p>
              </div>
              <ArrowUpRight className="size-5 shrink-0 text-brand-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </div>
          </a>
        </section>
      )}
    </div>
  );
}
