import type { Metadata } from "next";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Cpu,
  ShieldOff,
  Store,
  Users,
} from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { platformLogoutAction } from "@/server/actions/platform";
import { PageHeader, Grid } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCents, formatDate, formatNumber, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Administration Pharma.ai" };

/**
 * Console d'administration de l'éditeur.
 *
 * ⚠️ RÈGLE STRUCTURELLE : cette page n'accède JAMAIS aux données médicales des
 * patients. Elle ne lit que des compteurs agrégés, l'état des abonnements et
 * les incidents. Aucune requête ci-dessous ne touche `patients`,
 * `patient_health_profiles`, `prescriptions` ni `recommendations` au niveau
 * unitaire.
 */
export default async function PlatformAdminPage() {
  const session = await requirePlatformSession();

  const [
    organizations,
    pharmacyCount,
    userCount,
    subscriptions,
    incidents,
    aiUsage,
    volumeByPharmacy,
  ] = await Promise.all([
    prisma.organization.findMany({
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { pharmacies: true, users: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pharmacy.count(),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.subscription.groupBy({ by: ["status"], _count: true }),
    prisma.platformIncident.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.aiUsageRecord.aggregate({
      _sum: { inputTokens: true, outputTokens: true, costMicroCents: true },
      _count: true,
    }),
    // Volumes agrégés par officine — des compteurs, jamais un contenu.
    prisma.prescription.groupBy({
      by: ["pharmacyId"],
      _count: true,
    }),
  ]);

  const volumeMap = new Map(volumeByPharmacy.map((row) => [row.pharmacyId, row._count]));
  const pharmacies = await prisma.pharmacy.findMany({
    select: {
      id: true,
      name: true,
      city: true,
      isDemo: true,
      isActive: true,
      createdAt: true,
      organization: { select: { name: true } },
      _count: { select: { memberships: true, products: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const activeSubscriptions =
    subscriptions.find((s) => s.status === "ACTIVE")?._count ?? 0;
  const trialing = subscriptions.find((s) => s.status === "TRIALING")?._count ?? 0;
  const mrrCents = organizations.reduce(
    (sum, organization) =>
      sum +
      (organization.subscription?.status === "ACTIVE"
        ? organization.subscription.plan.monthlyPriceCents
        : 0),
    0,
  );

  return (
    <div className="min-h-dvh bg-surface-app">
      <header className="border-b border-border-subtle bg-surface-card">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-[15px] font-semibold text-white">
              ✚
            </span>
            <div>
              <p className="text-[14px] font-semibold text-text-primary">
                Administration Pharma.ai
              </p>
              <p className="text-[11.5px] text-text-tertiary">Console éditeur</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[13px] text-text-secondary">{session.admin.fullName}</span>
            <form action={platformLogoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-8">
        <PageHeader
          title="Vue plateforme"
          description="Officines clientes, abonnements, usage et incidents."
        />

        <Alert tone="info" title="Aucun accès aux données médicales" icon={<ShieldOff className="size-[18px]" />}>
          Cette console n&apos;expose que des compteurs agrégés et l&apos;état des comptes. Les
          fiches patients, les ordonnances et les profils de santé des officines clientes ne
          sont accessibles par aucun chemin de cette interface — la séparation est structurelle,
          pas seulement affichée.
        </Alert>

        <Grid cols={4}>
          <StatCard
            label="Officines clientes"
            value={formatNumber(pharmacyCount)}
            sublabel={`${organizations.length} groupe(s)`}
            icon={<Store className="size-4" />}
          />
          <StatCard
            label="Utilisateurs"
            value={formatNumber(userCount)}
            sublabel="comptes actifs"
            icon={<Users className="size-4" />}
          />
          <StatCard
            label="Abonnements"
            value={formatNumber(activeSubscriptions + trialing)}
            sublabel={`${activeSubscriptions} actif(s) · ${trialing} en essai`}
            icon={<CreditCard className="size-4" />}
          />
          <StatCard
            label="Revenu mensuel récurrent"
            value={formatCents(mrrCents)}
            sublabel="abonnements actifs uniquement"
            emphasis="accent"
            icon={<Building2 className="size-4" />}
          />
        </Grid>

        <Card>
          <CardHeader
            title="Officines"
            description="Compteurs agrégés uniquement."
          />
          <CardContent className="px-0 pb-0">
            <TableWrapper className="rounded-none border-x-0 border-b-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Officine</TH>
                    <TH>Groupe</TH>
                    <TH>Ville</TH>
                    <TH numeric>Collaborateurs</TH>
                    <TH numeric>Références</TH>
                    <TH numeric>Ordonnances</TH>
                    <TH>État</TH>
                    <TH>Créée le</TH>
                  </TR>
                </THead>
                <TBody>
                  {pharmacies.map((pharmacy) => (
                    <TR key={pharmacy.id}>
                      <TD className="font-medium">{pharmacy.name}</TD>
                      <TD className="text-text-secondary">{pharmacy.organization.name}</TD>
                      <TD className="text-text-secondary">{pharmacy.city ?? "—"}</TD>
                      <TD numeric>{pharmacy._count.memberships}</TD>
                      <TD numeric>{pharmacy._count.products}</TD>
                      <TD numeric>{volumeMap.get(pharmacy.id) ?? 0}</TD>
                      <TD>
                        <div className="flex gap-1">
                          <Badge tone={pharmacy.isActive ? "success" : "neutral"}>
                            {pharmacy.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {pharmacy.isDemo && <Badge tone="accent">Démo</Badge>}
                        </div>
                      </TD>
                      <TD className="text-text-secondary">{formatDate(pharmacy.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Consommation IA"
              description="Coûts et volumes agrégés par appel."
              action={<Cpu className="size-[18px] text-text-tertiary" />}
            />
            <CardContent>
              {aiUsage._count === 0 ? (
                <p className="text-[13px] text-text-secondary">
                  Aucun appel enregistré. Le suivi de consommation s&apos;alimente dès qu&apos;un
                  fournisseur réel est branché : la table{" "}
                  <code className="font-mono text-[12px]">ai_usage_records</code> reçoit un
                  enregistrement par appel, avec jetons consommés, durée et coût.
                </p>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-[11px] tracking-wide text-text-tertiary uppercase">
                      Appels
                    </dt>
                    <dd className="text-[18px] font-semibold tabular">
                      {formatNumber(aiUsage._count)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] tracking-wide text-text-tertiary uppercase">
                      Jetons
                    </dt>
                    <dd className="text-[18px] font-semibold tabular">
                      {formatNumber(
                        (aiUsage._sum.inputTokens ?? 0) + (aiUsage._sum.outputTokens ?? 0),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] tracking-wide text-text-tertiary uppercase">
                      Coût
                    </dt>
                    <dd className="text-[18px] font-semibold tabular">
                      {formatCents(Math.round((aiUsage._sum.costMicroCents ?? 0) / 10000))}
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Incidents"
              description="Évènements plateforme, sans donnée patient."
              action={<AlertTriangle className="size-[18px] text-text-tertiary" />}
            />
            <CardContent className="pt-0">
              {incidents.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-text-tertiary">
                  Aucun incident enregistré.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {incidents.map((incident) => (
                    <li key={incident.id} className="space-y-1 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            incident.severity === "CRITICAL"
                              ? "danger"
                              : incident.severity === "WARNING"
                                ? "warning"
                                : "info"
                          }
                        >
                          {incident.code}
                        </Badge>
                        <p className="text-[13px] font-medium text-text-primary">
                          {incident.title}
                        </p>
                      </div>
                      <p className="text-[12.5px] leading-5 text-text-secondary">
                        {incident.detail}
                      </p>
                      <p className="text-[11.5px] text-text-tertiary">
                        {formatRelative(incident.createdAt)}
                        {incident.resolvedAt && " · résolu"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader title="Abonnements" description="Par groupe d'officines." />
          <CardContent className="pt-0">
            <ul className="divide-y divide-border-subtle">
              {organizations.map((organization) => (
                <li
                  key={organization.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-text-primary">
                      {organization.name}
                    </span>
                    <span className="block text-[12px] text-text-tertiary">
                      {organization._count.pharmacies} officine(s) ·{" "}
                      {organization._count.users} utilisateur(s)
                    </span>
                  </span>
                  {organization.subscription ? (
                    <>
                      <Badge tone="brand">{organization.subscription.plan.name}</Badge>
                      <Badge
                        tone={
                          organization.subscription.status === "ACTIVE"
                            ? "success"
                            : organization.subscription.status === "TRIALING"
                              ? "info"
                              : "warning"
                        }
                      >
                        {organization.subscription.status}
                      </Badge>
                      <span className="w-24 text-right text-[13px] tabular text-text-secondary">
                        {formatCents(organization.subscription.plan.monthlyPriceCents)}
                      </span>
                    </>
                  ) : (
                    <Badge tone="neutral">Aucun abonnement</Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
