import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck2, CheckCircle2, FolderOpen, Trophy, Wallet } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { challengesOfRep, type RepChallengeRow } from "@/server/services/sales/challenges";
import { getActivity, getMoney, getPortfolio, getTeamMember, listAssignableReps, type TeamMemberActivity, type TeamMemberMoney, type PortfolioProspect, type TeamMemberOverview } from "@/server/services/sales/director-team";
import { ACTIVITY_LIMIT, activityEntry, invitationKind } from "@/core/sales/director/team";
import { CHALLENGE_STATE_LABELS, describeChallengeGoal, challengePeriodLabel, ordinalFr } from "@/core/sales/director/challenge";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES, type InvoiceStatus } from "@/core/sales/director/invoice";
import { describeCommissionRule } from "@/core/sales/commission";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { Timeline } from "@/components/admin/timeline";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState, Progress } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CommissionStatusBadge } from "@/components/sales/status-badge";
import { formatCents, formatDate, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AssignProspects } from "../_components/assign-prospects";
import { EditRepButton } from "../_components/edit-rep";
import { ActiveButton, DeleteButton, InviteButton } from "../_components/rep-actions";

export const metadata: Metadata = { title: "Commercial" };

const TABS = [
  { key: "portefeuille", label: "Portefeuille" },
  { key: "activite", label: "Ce qu'il a fait" },
  { key: "argent", label: "Commissions et factures" },
  { key: "challenges", label: "Challenges" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/**
 * La fiche d'un commercial, pour le directeur : son identité et ses chiffres
 * en haut, puis quatre onglets (`?onglet=`) : son portefeuille (avec la
 * réaffectation), ce qu'il a fait ces 30 derniers jours, ses commissions et
 * factures, ses challenges. En bas, la gestion du compte (désactiver,
 * supprimer). Jamais de contrat ni de pièce : seulement l'état des dossiers.
 */
export default async function TeamMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDirectorSession();
  const { id } = await params;
  const query = await searchParams;
  const overview = await getTeamMember(id);
  if (!overview) notFound();
  const { member, stats } = overview;
  const now = new Date();
  const tab: TabKey = TABS.find((item) => item.key === first(query.onglet))?.key ?? "portefeuille";
  const base = `/directeur/commerciaux/${member.id}`;
  const kind = invitationKind(member);

  // Seules les données de l'onglet ouvert sont lues ; chaque onglet est un composant simple qui reçoit ses données.
  let content: ReactNode;
  if (tab === "portefeuille") {
    const [portfolio, assignable] = await Promise.all([getPortfolio(member.id), listAssignableReps()]);
    content = <PortfolioTab memberId={member.id} portfolio={portfolio} assignable={assignable} now={now} />;
  } else if (tab === "activite") {
    content = <ActivityTab activity={await getActivity(member.id, now)} />;
  } else if (tab === "argent") {
    content = <MoneyTab memberId={member.id} money={await getMoney(member.id)} />;
  } else {
    content = <ChallengesTab isActive={member.isActive} challenges={await challengesOfRep(member.id, now)} />;
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        parent={{ label: "Commerciaux", href: "/directeur/commerciaux" }}
        title={member.name}
        badge={<Badge tone={member.isActive ? "success" : "neutral"}>{member.isActive ? "Actif" : "Désactivé"}</Badge>}
        description={[
          member.email,
          member.phone,
          member.zone,
          describeCommissionRule({ type: member.commissionType, value: member.commissionValue }),
          kind === "CONNECTED" ? `dernière connexion le ${formatDate(member.lastLoginAt)}` : kind === "SENT" ? `invité le ${formatDate(member.invitedAt)}, pas encore connecté` : "invitation non envoyée",
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {member.isActive && kind !== "CONNECTED" && <InviteButton salesRepId={member.id} invited={member.invitedAt !== null} size="md" />}
            <EditRepButton salesRepId={member.id} initial={{ firstName: member.firstName, lastName: member.lastName, email: member.email, phone: member.phone ?? "", zone: member.zone ?? "", commissionType: member.commissionType, commissionValue: member.commissionValue }} />
          </>
        }
      />

      {!member.isActive && (
        <Alert tone="warning" title="Ce compte est désactivé">
          {member.name} ne peut plus se connecter.
          {stats.openProspects > 0 ? ` Ses ${stats.openProspects} dossier${stats.openProspects > 1 ? "s ouverts restent" : " ouvert reste"} à son nom : réaffectez-${stats.openProspects > 1 ? "les" : "le"} depuis l'onglet « Portefeuille ».` : " Son historique est conservé."}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Dossiers ouverts" value={stats.openProspects} hint={`sur ${stats.prospects} au total`} icon={<FolderOpen className="size-4" />} href={hrefTab(base, "portefeuille")} />
        <KpiTile label="Contrats signés" value={stats.contractsSigned} hint={stats.prospects > 0 ? `${formatPercent(stats.conversionRate)} des dossiers` : "aucun dossier"} tone={stats.contractsSigned > 0 ? "success" : "default"} icon={<CheckCircle2 className="size-4" />} />
        <KpiTile label="Officines activées" value={stats.activated} hint={`${stats.lost} dossier${stats.lost > 1 ? "s" : ""} perdu${stats.lost > 1 ? "s" : ""}`} icon={<CalendarCheck2 className="size-4" />} />
        <KpiTile
          label="Commissions acquises"
          value={formatCents(stats.commissionEarnedCents)}
          hint={`${formatCents(stats.commissionPendingCents)} prévisionnelles · ${formatCents(stats.commissionPaidCents)} payées`}
          tone="brand"
          icon={<Wallet className="size-4" />}
          href={`/directeur/commissions?commercial=${encodeURIComponent(member.id)}`}
        />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-border-subtle" aria-label="Sections de la fiche">
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <Link
              key={item.key}
              href={hrefTab(base, item.key)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn("-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500", active ? "border-brand-600 text-brand-700 dark:text-brand-400" : "border-transparent text-text-secondary hover:border-border-default hover:text-text-primary")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {content}

      <AccountSection overview={overview} />
    </div>
  );
}

const hrefTab = (base: string, tab: TabKey) => (tab === "portefeuille" ? base : `${base}?onglet=${tab}`);

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------

function PortfolioTab({ memberId, portfolio, assignable, now }: { memberId: string; portfolio: { prospects: PortfolioProspect[]; truncated: boolean }; assignable: { id: string; name: string }[]; now: Date }) {
  const { prospects, truncated } = portfolio;
  return (
    <AdminSection title="Ses dossiers, par étape" description="Pour chaque dossier : l'officine, la ville, la prochaine action et le dernier contact. Choisissez des dossiers pour les confier à un autre commercial.">
      <AssignProspects
        mode="reassign"
        nowIso={now.toISOString()}
        reps={assignable.filter((rep) => rep.id !== memberId)}
        emptyText="Aucun dossier ne lui est confié pour l'instant."
        prospects={prospects.map((prospect) => ({
          id: prospect.id,
          name: prospect.name,
          city: prospect.city,
          status: prospect.status,
          nextActionAt: prospect.nextActionAt?.toISOString() ?? null,
          nextActionLabel: prospect.nextActionLabel,
          lastContactAt: prospect.lastContactAt?.toISOString() ?? null,
          monthlyPriceCents: prospect.monthlyPriceCents,
          blocked: prospect.blocked,
        }))}
      />
      {truncated && <p className="mt-3 text-[12.5px] text-text-tertiary">Les dossiers les plus récemment modifiés sont affichés ; les plus anciens ne le sont pas.</p>}
    </AdminSection>
  );
}

function ActivityTab({ activity }: { activity: TeamMemberActivity }) {
  const overdue = activity.overdueTasks.length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Relances faites" value={activity.tasksDone} hint="ces 30 derniers jours" />
        <KpiTile label="Relances en retard" value={overdue >= 10 ? "10 ou plus" : overdue} hint="à faire, échéance passée" tone={overdue > 0 ? "warning" : "default"} />
        <KpiTile label="Démonstrations réalisées" value={activity.demosDone} hint="ces 30 derniers jours" />
        <KpiTile label="Démonstrations à venir" value={activity.demosUpcoming} hint="programmées" />
      </div>

      {overdue > 0 && (
        <AdminSection title="Relances en retard" padded={false}>
          <ul className="divide-y divide-border-subtle">
            {activity.overdueTasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-2.5">
                <span className="min-w-0 text-[14px] text-text-primary">
                  {task.label} <span className="text-text-tertiary">· {task.prospect.name}</span>
                </span>
                <span className="text-[12.5px] font-medium text-warning-700 dark:text-warning-500">prévue le {formatDate(task.dueAt)}</span>
              </li>
            ))}
          </ul>
        </AdminSection>
      )}

      <AdminSection title="Activité des 30 derniers jours" description={`Depuis le ${formatDate(activity.since)} : ce qu'il a fait et ce qui est arrivé sur ses dossiers.${activity.events.length >= ACTIVITY_LIMIT ? ` Les ${ACTIVITY_LIMIT} derniers gestes sont affichés.` : ""} Les contrats et les e-mails n'y figurent pas.`}>
        <Timeline entries={activity.events.map(activityEntry)} emptyText="Aucune activité sur ses dossiers ces 30 derniers jours." />
      </AdminSection>
    </div>
  );
}

function MoneyTab({ memberId, money }: { memberId: string; money: TeamMemberMoney }) {
  const commissionsHref = `/directeur/commissions?commercial=${encodeURIComponent(memberId)}`;
  const invoicesHref = `/directeur/factures?commercial=${encodeURIComponent(memberId)}`;
  return (
    <div className="space-y-4">
      <AdminSection
        title="Commissions"
        description="Les plus récentes d'abord. Pour les valider, les payer ou les annuler, ouvrez la page Commissions."
        action={
          <Link href={commissionsHref} className="text-[13px] font-medium text-brand-700 hover:underline dark:text-brand-400">
            Toutes ses commissions
          </Link>
        }
        padded={false}
      >
        {money.commissions.length === 0 ? (
          <EmptyState icon={<Wallet className="size-5" />} title="Aucune commission pour l'instant" description="Une commission apparaît dès qu'un contrat est envoyé à une officine par ce commercial." />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <tr>
                  <TH>Officine</TH>
                  <TH numeric>Montant</TH>
                  <TH>Statut</TH>
                  <TH>Paiement</TH>
                  <TH>Facture</TH>
                </tr>
              </THead>
              <TBody>
                {money.commissions.map((commission) => (
                  <TR key={commission.id}>
                    <TD className="max-w-[260px]">
                      <span className="block truncate font-medium text-text-primary">{commission.prospectName}</span>
                      <span className="block text-[12px] text-text-tertiary">créée le {formatDate(commission.createdAt)}</span>
                    </TD>
                    <TD numeric className="font-medium">
                      {formatCents(commission.amountCents)}
                    </TD>
                    <TD>
                      <CommissionStatusBadge status={commission.status} />
                    </TD>
                    <TD className="text-[13px] text-text-secondary">{commission.paidAt ? `payée le ${formatDate(commission.paidAt)}` : "—"}</TD>
                    <TD className="text-[13px]">
                      {commission.invoiceId ? (
                        <Link href={`/directeur/factures/${commission.invoiceId}`} className="text-brand-700 hover:underline dark:text-brand-400">
                          Voir la facture
                        </Link>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
        {money.commissionsTruncated && <p className="px-5 py-3 text-[12.5px] text-text-tertiary">Les 30 plus récentes sont affichées. Les autres sont dans la page Commissions.</p>}
      </AdminSection>

      <AdminSection
        title="Factures"
        description="Les factures qu'il vous a transmises, les plus récentes d'abord."
        action={
          <Link href={invoicesHref} className="text-[13px] font-medium text-brand-700 hover:underline dark:text-brand-400">
            Toutes ses factures
          </Link>
        }
        padded={false}
      >
        {money.invoices.length === 0 ? (
          <EmptyState icon={<Wallet className="size-5" />} title="Aucune facture pour l'instant" description="Quand il vous envoie une facture, enregistrez-la dans la page Factures : elle apparaît ici." />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <tr>
                  <TH>Numéro</TH>
                  <TH>Date</TH>
                  <TH>Période</TH>
                  <TH numeric>Montant</TH>
                  <TH>Statut</TH>
                </tr>
              </THead>
              <TBody>
                {money.invoices.map((invoice) => {
                  const status = invoice.status as InvoiceStatus;
                  return (
                    <TR key={invoice.id} interactive>
                      <TD>
                        <Link href={`/directeur/factures/${invoice.id}`} className="font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">
                          {invoice.number}
                        </Link>
                      </TD>
                      <TD className="text-[13px] text-text-secondary">{formatDate(invoice.issuedAt)}</TD>
                      <TD className="text-[13px] text-text-secondary">{invoice.periodLabel ?? "—"}</TD>
                      <TD numeric className="font-medium">
                        {formatCents(invoice.amountCents)}
                      </TD>
                      <TD>
                        <Badge tone={INVOICE_STATUS_TONES[status] ?? "neutral"}>{INVOICE_STATUS_LABELS[status] ?? invoice.status}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
        {money.invoicesTruncated && <p className="px-5 py-3 text-[12.5px] text-text-tertiary">Les 30 plus récentes sont affichées. Les autres sont dans la page Factures.</p>}
      </AdminSection>
    </div>
  );
}

function ChallengesTab({ isActive, challenges }: { isActive: boolean; challenges: { running: RepChallengeRow[]; upcoming: RepChallengeRow[]; ended: RepChallengeRow[] } }) {
  const { running, upcoming, ended } = challenges;
  if (running.length + upcoming.length + ended.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface-card">
        <EmptyState
          icon={<Trophy className="size-5" />}
          title="Aucun challenge pour l'instant"
          description="Un challenge fixe un objectif à tous les commerciaux actifs sur une période."
          action={
            <Link href="/directeur/challenges/nouveau" className="text-[13px] font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">
              Créer un challenge
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {!isActive && <Alert tone="info">Ce compte est désactivé : il ne participe plus aux challenges.</Alert>}
      <ChallengeGroup title="En cours" rows={running} />
      <ChallengeGroup title="À venir" rows={upcoming} />
      <ChallengeGroup title="Terminés" rows={ended} />
    </div>
  );
}

function ChallengeGroup({ title, rows }: { title: string; rows: RepChallengeRow[] }) {
  if (rows.length === 0) return null;
  return (
    <AdminSection title={title} padded={false}>
      <ul className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <li key={row.challenge.id} className="space-y-2 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <Link href={`/directeur/challenges/${row.challenge.id}`} className="text-[14px] font-medium break-words text-text-primary hover:underline">
                  {row.challenge.title}
                </Link>
                <p className="text-[12.5px] text-text-secondary">
                  {describeChallengeGoal(row.challenge.metric, row.challenge.target)}, {challengePeriodLabel(row.challenge.startsAt, row.challenge.endsAt)}.
                </p>
              </div>
              <Badge tone={row.state === "RUNNING" ? "success" : row.state === "UPCOMING" ? "info" : "neutral"}>{row.state === "ENDED" && row.stoppedEarly ? "Arrêté" : CHALLENGE_STATE_LABELS[row.state]}</Badge>
            </div>
            {row.mine ? (
              <div className="space-y-1">
                <Progress value={row.mine.value} max={Math.max(1, row.mine.target)} tone={row.mine.reached ? "success" : "brand"} label={`Avancement : ${row.mine.value} sur ${row.mine.target}`} />
                <p className="text-[12.5px] text-text-secondary">
                  <strong className="font-semibold text-text-primary">{row.mine.value}</strong> sur {row.mine.target}
                  {row.mine.reached ? " · objectif atteint" : ` · ${row.mine.percent} %`}
                  {row.mine.rank !== null ? ` · ${ordinalFr(row.mine.rank)} sur ${row.participants}` : ""}
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] text-text-tertiary">{row.state === "UPCOMING" ? "Pas encore commencé." : "Ne participe pas à ce challenge."}</p>
            )}
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

// ---------------------------------------------------------------------------
// Gestion du compte
// ---------------------------------------------------------------------------

function AccountSection({ overview }: { overview: TeamMemberOverview }) {
  const { member } = overview;
  return (
    <AdminSection title="Gérer le compte" description="Désactiver se défait à tout moment. Supprimer est définitif et n'est possible que pour un commercial sans aucun historique.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-[13px] leading-5 text-text-secondary">
            {member.isActive ? "Désactiver ferme ses connexions et l'empêche de se reconnecter. Ses dossiers, commissions et factures sont conservés." : "Le compte est désactivé. Le réactiver lui rend l'accès à son espace."}
          </p>
          <ActiveButton salesRepId={member.id} name={member.name} isActive={member.isActive} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          {overview.deletionRefusal ? (
            <p className="max-w-xl text-[13px] leading-5 text-text-secondary">
              <strong className="font-medium text-text-primary">Suppression impossible.</strong> {overview.deletionRefusal}
            </p>
          ) : (
            <>
              <p className="max-w-xl text-[13px] leading-5 text-text-secondary">Ce commercial n&apos;a aucun dossier, aucune commission, aucune facture ni aucune tâche : vous pouvez le supprimer définitivement.</p>
              <DeleteButton salesRepId={member.id} name={member.name} />
            </>
          )}
        </div>
      </div>
    </AdminSection>
  );
}
