import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, Progress } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { DIRECTOR_HOME } from "@/core/sales/director/nav";
import { DIRECTOR_PERIODS, DIRECTOR_PERIOD_LABELS, describeReached, type DirectorPeriodKey } from "@/core/sales/director/dashboard";
import type { DirectorDashboard } from "@/server/services/sales/director-dashboard";
import { formatCents, formatDate, formatDateTime, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Les morceaux du tableau de bord du directeur. Des composants serveur, sans
 * état : chaque chiffre est un lien vers la page qui le détaille.
 */

const link = "text-[13px] text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/** Ce mois · 30 jours · Cette année : de simples liens, la période vit dans l'adresse (`?periode=`). */
export function PeriodSwitch({ current }: { current: DirectorPeriodKey }) {
  return (
    <nav aria-label="Période affichée" className="inline-flex rounded-lg border border-border-default bg-surface-card p-0.5">
      {DIRECTOR_PERIODS.map((key) => (
        <Link
          key={key}
          href={key === "mois" ? DIRECTOR_HOME : `${DIRECTOR_HOME}?periode=${key}`}
          aria-current={key === current ? "true" : undefined}
          className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", focusRing, key === current ? "bg-brand-600 text-white shadow-xs" : "text-text-secondary hover:text-text-primary")}
        >
          {DIRECTOR_PERIOD_LABELS[key]}
        </Link>
      ))}
    </nav>
  );
}

/** UNE phrase, en haut : l'essentiel avant tout chiffre. */
export function SummaryCard({ board }: { board: DirectorDashboard }) {
  return (
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50 to-surface-card dark:border-brand-800/60 dark:from-brand-950 dark:to-surface-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
        <p className="max-w-3xl text-[17px] leading-7 font-medium text-text-primary">{board.summary}</p>
        {board.team.activeReps === 0 && (
          <Button asChild leadingIcon={<Plus className="size-[18px]" />}>
            <Link href="/directeur/commerciaux/nouveau">Ajouter un commercial</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function KpiLink({ href, label, value, sublabel }: { href: string; label: string; value: ReactNode; sublabel?: string }) {
  return (
    <Link href={href} className={cn("group block rounded-xl", focusRing)}>
      <StatCard label={label} value={value} sublabel={sublabel} className="h-full p-4 transition-shadow group-hover:border-border-default group-hover:shadow-md" />
    </Link>
  );
}

export function KpiGrid({ board }: { board: DirectorDashboard }) {
  const { totals, team } = board;
  const conversion = totals.conversion;
  return (
    <section aria-label="Les chiffres de la période" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <KpiLink href="/directeur/commerciaux" label="Commerciaux actifs" value={formatNumber(team.activeReps)} sublabel={team.activeReps === 0 ? "Aucun pour l'instant" : "dans l'équipe"} />
      <KpiLink href="/directeur/commerciaux" label="Dossiers créés" value={formatNumber(totals.opened)} sublabel={`${formatNumber(totals.openNow)} en cours en ce moment`} />
      <KpiLink href="/directeur/commerciaux" label="Démonstrations réalisées" value={formatNumber(totals.demos)} />
      <KpiLink href="/directeur/commerciaux" label="Contrats signés" value={formatNumber(totals.contractsSigned)} />
      <KpiLink href="/directeur/commerciaux" label="Officines activées" value={formatNumber(totals.activated)} />
      <KpiLink
        href="/directeur/commerciaux"
        label="Taux de transformation"
        value={conversion.rate === null ? "—" : formatPercent(conversion.rate)}
        sublabel={conversion.rate === null ? "Aucun dossier ouvert sur la période" : `${formatNumber(conversion.signed)} dossier${conversion.signed > 1 ? "s" : ""} signé${conversion.signed > 1 ? "s" : ""} sur ${formatNumber(conversion.opened)} ouvert${conversion.opened > 1 ? "s" : ""}`}
      />
    </section>
  );
}

type TodoRow = { label: string; count: number; amountCents?: number; href: string };

/** Ce qui attend une décision. Une ligne à zéro reste là, en discret : on sait que c'est vérifié. */
export function TodoCard({ board }: { board: DirectorDashboard }) {
  const { todo } = board;
  const rows: TodoRow[] = [
    { label: "Candidatures à examiner", count: todo.applicationsToReview, href: "/directeur/candidatures?statut=nouvelle" },
    { label: "Dossiers sans commercial", count: todo.unassignedProspects, href: "/directeur/commerciaux" },
    { label: "Commissions à valider", count: todo.commissionsToValidate.count, amountCents: todo.commissionsToValidate.amountCents, href: "/directeur/commissions?statut=EARNED" },
    { label: "Commissions à payer", count: todo.commissionsToPay.count, amountCents: todo.commissionsToPay.amountCents, href: "/directeur/commissions?statut=PAYABLE" },
    { label: "Factures à valider", count: todo.invoicesToValidate.count, amountCents: todo.invoicesToValidate.amountCents, href: "/directeur/factures?statut=RECEIVED" },
  ];
  const nothing = rows.every((row) => row.count === 0);
  return (
    <Card>
      <CardHeader title="À traiter" description={nothing ? "Rien n'attend votre décision." : "Ce qui attend votre décision."} />
      <CardContent className="pt-0">
        <ul className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <li key={row.label}>
              <Link href={row.href} className={cn("-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-sunken", focusRing)}>
                <span className="min-w-0">
                  <span className={cn("block text-[14px]", row.count > 0 ? "font-medium text-text-primary" : "text-text-secondary")}>{row.label}</span>
                  {row.count > 0 && row.amountCents !== undefined && <span className="block text-[12.5px] text-text-secondary tabular">{formatCents(row.amountCents)}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {row.count > 0 ? <Badge tone="brand" className="px-2.5 text-[12.5px] tabular">{formatNumber(row.count)}</Badge> : <CheckCircle2 className="size-[18px] text-success-500" aria-label="Rien à traiter" />}
                  <ChevronRight className="size-4 text-text-tertiary" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ChallengesCard({ board }: { board: DirectorDashboard }) {
  const { challenges } = board;
  return (
    <Card>
      <CardHeader title="Challenges en cours" action={<Link href="/directeur/challenges" className={link}>Tous les challenges</Link>} />
      <CardContent className="pt-0">
        {challenges.length === 0 ? (
          <EmptyState
            className="py-8"
            title="Aucun challenge en cours"
            description="Un challenge donne un objectif à chaque commercial sur une période."
            action={<Button asChild variant="secondary" size="sm" leadingIcon={<Plus className="size-4" />}><Link href="/directeur/challenges/nouveau">Créer un challenge</Link></Button>}
          />
        ) : (
          <ul className="space-y-4">
            {challenges.map((challenge) => (
              <li key={challenge.id}>
                <Link href={`/directeur/challenges/${challenge.id}`} className={cn("-mx-2 block space-y-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-sunken", focusRing)}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[14px] font-medium text-text-primary">{challenge.title}</span>
                    <span className="shrink-0 text-[12px] text-text-tertiary">jusqu&apos;au {formatDate(new Date(challenge.endsAt.getTime() - 1))}</span>
                  </span>
                  <span className="block text-[12.5px] text-text-secondary">{challenge.goal}</span>
                  <Progress value={challenge.share} tone={challenge.participants > 0 && challenge.reached >= challenge.participants ? "success" : "brand"} label={`Part des commerciaux ayant atteint l'objectif : ${challenge.title}`} />
                  <span className="block text-[12.5px] text-text-secondary">{describeReached(challenge.reached, challenge.participants)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const RANK_COLUMNS = [
  { key: "activated", label: "Activées" },
  { key: "contractsSigned", label: "Signés" },
  { key: "demos", label: "Démos" },
  { key: "opened", label: "Dossiers" },
] as const;

/** Des chiffres, rien d'autre : ni note, ni couleur de jugement. */
export function RankingCard({ board }: { board: DirectorDashboard }) {
  const { ranking, quietCount, team, period } = board;
  return (
    <Card>
      <CardHeader title="Classement des commerciaux" description={`${period.label} : d'abord les officines activées, puis les contrats signés, puis les démonstrations.`} />
      <CardContent className="pt-0">
        {ranking.length === 0 ? (
          <EmptyState
            className="py-8"
            title={team.activeReps === 0 ? "Aucun commercial actif" : "Aucune activité sur cette période"}
            description={team.activeReps === 0 ? "Ajoutez un commercial pour suivre ses résultats." : "Aucun dossier, démonstration, signature ni activation n'a été enregistré."}
            action={team.activeReps === 0 ? <Button asChild variant="secondary" size="sm" leadingIcon={<Plus className="size-4" />}><Link href="/directeur/commerciaux/nouveau">Ajouter un commercial</Link></Button> : undefined}
          />
        ) : (
          <ol className="divide-y divide-border-subtle">
            {ranking.map((member) => (
              <li key={member.salesRepId}>
                <Link href={`/directeur/commerciaux/${member.salesRepId}`} className={cn("-mx-2 block rounded-lg px-2 py-3 transition-colors hover:bg-surface-sunken", focusRing)}>
                  <span className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[12px] font-semibold text-text-secondary tabular" aria-label={`Rang ${member.rank}`}>{member.rank}</span>
                    <span className="min-w-0 truncate text-[14px] font-medium text-text-primary">{member.name}</span>
                  </span>
                  <dl className="mt-2 grid grid-cols-4 gap-2 sm:pl-9">
                    {RANK_COLUMNS.map((column) => (
                      <div key={column.key}>
                        <dt className="text-[11px] text-text-tertiary">{column.label}</dt>
                        <dd className="text-[15px] font-semibold text-text-primary tabular">{formatNumber(member[column.key])}</dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            ))}
          </ol>
        )}
        {quietCount > 0 && ranking.length > 0 && (
          <p className="mt-3 text-[12.5px] text-text-secondary">
            {quietCount === 1 ? "1 commercial actif n'a" : `${formatNumber(quietCount)} commerciaux actifs n'ont`} encore rien enregistré sur cette période.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Les 20 derniers événements des dossiers : qui, quoi, quand. Jamais le texte d'une note. */
export function ActivityCard({ board }: { board: DirectorDashboard }) {
  const { feed } = board;
  return (
    <Card>
      <CardHeader title="Activité récente" description="Les derniers gestes sur les dossiers de l'équipe." />
      <CardContent className="pt-0">
        {feed.length === 0 ? (
          <EmptyState className="py-8" title="Aucune activité récente" description="Les gestes des commerciaux sur leurs dossiers apparaîtront ici." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {feed.map((event) => (
              <li key={event.id} className="py-3">
                <p className="text-[14px] font-medium text-text-primary">{event.what}</p>
                <p className="text-[12.5px] text-text-secondary">
                  {event.prospectName}
                  {event.city ? ` · ${event.city}` : ""}
                </p>
                <p className="mt-0.5 text-[12px] text-text-tertiary">
                  {event.whoRepId ? <Link href={`/directeur/commerciaux/${event.whoRepId}`} className="underline underline-offset-2 hover:text-text-secondary">{event.who}</Link> : event.who}
                  {" · "}
                  <time dateTime={event.at.toISOString()} title={formatDateTime(event.at)}>{formatRelative(event.at)}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
