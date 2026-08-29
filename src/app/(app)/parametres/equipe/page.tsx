import type { Metadata } from "next";
import { ShieldCheck, UsersRound } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  resolvePermissions,
  type Permission,
  type Role,
} from "@/server/rbac/permissions";
import { resolvePeriod } from "@/core/analytics/periods";
import { getTeamPerformance } from "@/server/services/analytics";
import { PageHeader, SectionHeader, Grid } from "@/components/ui/page";
import { SettingsTabs } from "../settings-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/feedback";
import { formatCents, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Équipe" };

export default async function TeamPage() {
  const session = await requirePermission(PERMISSIONS.TEAM_VIEW);
  const period = resolvePeriod("month");

  const [memberships, performance] = await Promise.all([
    prisma.membership.findMany({
      where: { pharmacyId: session.scope.pharmacyId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            rppsNumber: true,
            lastLoginAt: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    session.permissions.has(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE)
      ? getTeamPerformance(session.scope, period)
      : Promise.resolve([]),
  ]);

  const performanceById = new Map(performance.map((p) => [p.userId, p]));
  const activeCount = memberships.filter(
    (m) => m.isActive && m.user.status === "ACTIVE",
  ).length;
  const canManage = session.permissions.has(PERMISSIONS.TEAM_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres"
        description="Officine, équipe, règles de conseil, moteur et conformité — tout ce qui se règle une fois, pas à chaque patient."
      />

      <SettingsTabs
        canSeeTeam
        canSeeRules={session.permissions.has(PERMISSIONS.RECOMMENDATION_VIEW)}
        canSeeAudit={session.permissions.has(PERMISSIONS.AUDIT_VIEW)}
      />

      <SectionHeader
        title="Équipe"
        description="Collaborateurs de l'officine, rôles et permissions effectives."
      />

      <Grid cols={4}>
        <StatCard
          label="Collaborateurs actifs"
          value={activeCount}
          sublabel={`${memberships.length} au total`}
          icon={<UsersRound className="size-4" />}
        />
        <StatCard
          label="Pharmaciens"
          value={memberships.filter((m) => m.role === "PHARMACIST" || m.role === "OWNER").length}
          sublabel="habilités à valider un conseil"
          icon={<ShieldCheck className="size-4" />}
        />
        <StatCard
          label="Ordonnances ce mois"
          value={formatNumber(
            performance.reduce((sum, member) => sum + member.prescriptionsHandled, 0),
          )}
          sublabel="traitées par l'équipe"
        />
        <StatCard
          label="CA Pharma.ai ce mois"
          value={formatCents(
            performance.reduce((sum, member) => sum + member.attributedCents, 0),
          )}
          sublabel="généré par l'équipe"
          emphasis="accent"
        />
      </Grid>

      {performance.length > 0 && (
        <Alert tone="warning" title="Indicateurs nominatifs">
          Les chiffres par collaborateur relèvent du suivi de l&apos;activité professionnelle.
          Leur usage suppose information préalable des personnes, proportionnalité, et
          consultation des représentants du personnel lorsque cela s&apos;applique. Voir
          docs/RGPD.md.
        </Alert>
      )}

      <div className="space-y-4">
        {memberships.map((membership) => {
          const role = membership.role as Role;
          const permissions = resolvePermissions(
            role,
            membership.grantedPermissions,
            membership.revokedPermissions,
          );
          const stats = performanceById.get(membership.user.id);
          const isInactive = !membership.isActive || membership.user.status !== "ACTIVE";

          return (
            <Card key={membership.id} id={membership.user.id}>
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <Avatar
                      size="lg"
                      initials={initials(membership.user.firstName, membership.user.lastName)}
                      name={`${membership.user.firstName} ${membership.user.lastName}`}
                      imageUrl={membership.user.avatarUrl}
                    />
                    <div className="space-y-1">
                      <p className="text-[15px] font-semibold text-text-primary">
                        {membership.user.firstName} {membership.user.lastName}
                      </p>
                      <p className="text-[12.5px] text-text-secondary">
                        {membership.user.email}
                        {membership.user.rppsNumber &&
                          ` · RPPS ${membership.user.rppsNumber}`}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={isInactive ? "neutral" : "brand"}>
                          {ROLE_LABELS[role]}
                        </Badge>
                        {isInactive && <Badge tone="neutral">Inactif</Badge>}
                        {membership.grantedPermissions.length > 0 && (
                          <Badge tone="info">
                            +{membership.grantedPermissions.length} permission(s)
                          </Badge>
                        )}
                        {membership.revokedPermissions.length > 0 && (
                          <Badge tone="warning">
                            −{membership.revokedPermissions.length} permission(s)
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[12px] text-text-tertiary">
                    <p>
                      {membership.user.lastLoginAt
                        ? `Dernière connexion ${formatRelative(membership.user.lastLoginAt)}`
                        : "Jamais connecté"}
                    </p>
                  </div>
                </div>

                <p className="text-[12.5px] leading-5 text-text-secondary">
                  {ROLE_DESCRIPTIONS[role]}
                </p>

                {stats && (
                  <dl className="grid gap-4 border-t border-border-subtle pt-3.5 sm:grid-cols-4">
                    <Stat label="Ordonnances" value={formatNumber(stats.prescriptionsHandled)} />
                    <Stat
                      label="Conseils décidés"
                      value={formatNumber(stats.recommendationsDecided)}
                    />
                    <Stat
                      label="Taux d'acceptation"
                      value={
                        stats.recommendationsDecided > 0
                          ? formatPercent(stats.acceptanceRate)
                          : "—"
                      }
                    />
                    <Stat label="CA Pharma.ai" value={formatCents(stats.attributedCents)} />
                  </dl>
                )}

                <details className="group border-t border-border-subtle pt-3.5">
                  <summary className="cursor-pointer list-none text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
                    Voir les {permissions.size} permissions effectives
                  </summary>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {[...permissions].map((permission) => (
                      <li key={permission}>
                        <Badge tone="neutral">
                          {PERMISSION_LABELS[permission as Permission] ?? permission}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canManage && (
        <Alert tone="info" title="Gestion des comptes">
          La création, l&apos;invitation et la désactivation des comptes seront pilotées depuis
          cet écran. Dans cette version, les comptes sont créés par le jeu de démonstration.
        </Alert>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-text-tertiary uppercase">
        {label}
      </dt>
      <dd className="text-[15px] font-semibold tabular text-text-primary">{value}</dd>
    </div>
  );
}
