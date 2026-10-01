import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { PageHeader, DataItem } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { formatDate, formatRelative } from "@/lib/format";
import { EditPharmacyButton } from "../pharmacy-form";
import { StatusToggle } from "../status-toggle";
import { InstallGuideButton } from "../install-guide-button";
import { MemberActions } from "../member-actions";
import { AddOwnerButton } from "./owner-form";
import { ChangeEmailButton, ResendAccessButton } from "./access-actions";
import { ownerAccessSummary } from "@/server/services/pharmacy-admin";
import { DISPATCH_STATUS_LABELS } from "@/server/services/email-dispatch";
import { onboardingStage } from "@/core/onboarding/stage";
import { missingContractFields, describeMissing } from "@/core/contracts/requirements";

export const metadata: Metadata = { title: "Officine cliente" };

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Titulaire",
  PHARMACIST: "Pharmacien",
  TECHNICIAN: "Préparateur",
  STUDENT: "Étudiant",
  VIEWER: "Consultation",
};

export default async function ClientPharmacyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformSession();
  const { id } = await params;

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      addressLine1: true,
      postalCode: true,
      city: true,
      finessNumber: true,
      siret: true,
      postCount: true,
      brandColor: true,
      isActive: true,
      createdAt: true,
      onboardingCompletedAt: true,
      stockSyncedAt: true,
      organization: { select: { name: true, subscription: { select: { status: true, plan: { select: { name: true } } } } } },
      referralCode: true,
      referredBy: { select: { id: true, name: true } },
      referrals: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, city: true, isActive: true } },
      analysisRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, outcome: true, startedAt: true } },
      memberships: {
        where: { user: { deletedAt: null } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          isActive: true,
          user: {
            select: { firstName: true, lastName: true, email: true, lastLoginAt: true },
          },
        },
      },
      prospect: { select: { id: true, status: true, name: true, legalName: true, siret: true, addressLine1: true, postalCode: true, city: true, ownerName: true, email: true, duplicateWarning: true, contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true, signedArchivedAt: true } } } },
      postCountChanges: { orderBy: { createdAt: "desc" }, take: 5, select: { previous: true, next: true, actorLabel: true, createdAt: true } },
      // Compteurs seulement : aucun contenu de dossier n'est lu ici.
      _count: { select: { patients: true, products: true, drugStocks: true, prescriptions: true, analysisRuns: true } },
    },
  });

  if (!pharmacy) notFound();
  const { posts, lastGuide } = await loadInstallationState(id);

  const unclassified = await prisma.product.count({ where: { pharmacyId: id, deletedAt: null, classifiedAt: null } });
  const lastRun = pharmacy.analysisRuns[0];

  const [access, history] = await Promise.all([ownerAccessSummary(id), loadHistory(id)]);
  const dossier = pharmacy.prospect;
  const missing = dossier ? missingContractFields(dossier) : [];
  const stage = dossier ? onboardingStage({ prospectStatus: dossier.status, contract: dossier.contracts[0] ?? null, missingCount: missing.length }) : null;
  const dispatch = access?.lastDispatch ? DISPATCH_STATUS_LABELS[access.lastDispatch.status] ?? { label: access.lastDispatch.status, tone: "neutral" as const } : null;

  const owners = pharmacy.memberships.filter((m) => m.role === "OWNER");
  const collaborators = pharmacy.memberships.filter((m) => m.role !== "OWNER");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
          <Link href="/admin/pharmacies">Officines clientes</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/abonnements/${pharmacy.id}`}>Abonnement & contrat</Link>
        </Button>
      </div>

      <PageHeader
        title={pharmacy.name}
        description={[pharmacy.city, `cliente depuis le ${formatDate(pharmacy.createdAt)}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <StatusToggle pharmacyId={pharmacy.id} isActive={pharmacy.isActive} size="md" />
            <EditPharmacyButton
              pharmacyId={pharmacy.id}
              initial={{
                name: pharmacy.name,
                email: pharmacy.email ?? "",
                phone: pharmacy.phone ?? "",
                addressLine1: pharmacy.addressLine1 ?? "",
                postalCode: pharmacy.postalCode ?? "",
                city: pharmacy.city ?? "",
                finessNumber: pharmacy.finessNumber ?? "",
                siret: pharmacy.siret ?? "",
                brandColor: pharmacy.brandColor,
                postCount: pharmacy.postCount ? String(pharmacy.postCount) : "",
              }}
            />
            <ChangeEmailButton pharmacyId={pharmacy.id} contactEmail={pharmacy.email} loginEmail={access?.owner.email ?? null} />
          </>
        }
      />

      {!pharmacy.isActive && (
        <Alert tone="warning" title="Officine suspendue">
          Les comptes de cette officine ne peuvent plus se connecter. Aucune donnée n&apos;a été
          supprimée : la réactivation restitue le dossier tel quel.
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Accès du titulaire"
              description="L'e-mail de bienvenue et son issue."
              action={access ? <ResendAccessButton pharmacyId={pharmacy.id} neverLoggedIn={!access.owner.lastLoginAt} /> : <AddOwnerButton pharmacyId={pharmacy.id} />}
            />
            <CardContent className="grid gap-x-6 gap-y-4 pb-5 sm:grid-cols-2">
              {access ? (
                <>
                  <DataItem label="Identifiant de connexion">{access.owner.email}</DataItem>
                  <DataItem label="État">
                    {access.owner.lastLoginAt ? (
                      <Badge tone="success">Actif · vu {formatRelative(access.owner.lastLoginAt)}</Badge>
                    ) : (
                      <Badge tone="warning">Jamais connecté</Badge>
                    )}
                  </DataItem>
                  <DataItem label="Dernier e-mail d'accès">
                    {access.lastDispatch && dispatch ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={dispatch.tone}>{dispatch.label}</Badge>
                        <span className="text-[12.5px] text-text-tertiary">{formatDate(access.lastDispatch.createdAt)} · {access.lastDispatch.recipient}</span>
                      </span>
                    ) : (
                      "aucun envoi tracé"
                    )}
                  </DataItem>
                  {access.lastDispatch && ["FAILED", "BOUNCED", "COMPLAINED", "SIMULATED"].includes(access.lastDispatch.status) && (
                    <div className="sm:col-span-2">
                      <Alert tone="warning">{access.lastDispatch.detail ?? "Envoi en échec."} Corrigez l&apos;adresse avec « Modifier l&apos;e-mail », puis renvoyez l&apos;invitation.</Alert>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-text-secondary sm:col-span-2">Aucun titulaire actif : ajoutez-en un, il recevra son invitation.</p>
              )}
            </CardContent>
          </Card>

          {dossier && stage && (
            <Card>
              <CardHeader
                title="Inscription et contrat"
                description="Le dossier unique de l'officine : contrat, signature, abonnement."
                action={
                  <Button asChild size="sm" variant={stage.stage === "CONTRACT_TO_SEND" ? "primary" : "outline"}>
                    <Link href={`/admin/dossiers/${dossier.id}`}>{stage.stage === "CONTRACT_TO_SEND" ? "Envoyer le contrat" : "Ouvrir le dossier"}</Link>
                  </Button>
                }
              />
              <CardContent className="space-y-3 pb-5">
                <Badge tone={stage.tone === "brand" ? "brand" : stage.tone}>{stage.label}</Badge>
                {missing.length > 0 && <p className="text-[13px] text-text-secondary">Informations nécessaires au contrat à compléter : {describeMissing(missing)}.</p>}
                {dossier.duplicateWarning && <Alert tone="warning">{dossier.duplicateWarning}</Alert>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Comptes"
              description="Qui peut se connecter à cette officine."
              action={<AddOwnerButton pharmacyId={pharmacy.id} />}
            />
            <CardContent className="p-0">
              {pharmacy.memberships.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-text-tertiary">
                  Aucun compte. Ajoutez un titulaire pour ouvrir l&apos;accès.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {[...owners, ...collaborators].map((membership) => (
                    <li
                      key={membership.user.email}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium text-text-primary">
                          {membership.user.firstName} {membership.user.lastName.toUpperCase()}
                        </span>
                        <span className="block truncate text-[12px] text-text-tertiary">
                          {membership.user.email}
                          {membership.user.lastLoginAt
                            ? ` · vu ${formatRelative(membership.user.lastLoginAt)}`
                            : " · jamais connecté"}
                        </span>
                      </span>
                      <Badge tone={membership.role === "OWNER" ? "brand" : "neutral"}>
                        {ROLE_LABELS[membership.role] ?? membership.role}
                      </Badge>
                      {!membership.isActive && <Badge tone="warning">Suspendu</Badge>}
                      <MemberActions pharmacyId={pharmacy.id} membershipId={membership.id} isActive={membership.isActive} name={`${membership.user.firstName} ${membership.user.lastName}`} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Coordonnées" />
            <CardContent className="grid gap-x-6 gap-y-4 pb-5 sm:grid-cols-2">
              <DataItem label="Adresse">
                {[pharmacy.addressLine1, [pharmacy.postalCode, pharmacy.city].filter(Boolean).join(" ")]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </DataItem>
              <DataItem label="Téléphone">{pharmacy.phone ?? "—"}</DataItem>
              <DataItem label="E-mail de contact">{pharmacy.email ?? "—"}</DataItem>
              <DataItem label="SIRET">{pharmacy.siret ?? "—"}</DataItem>
              <DataItem label="FINESS">{pharmacy.finessNumber ?? "non renseigné"}</DataItem>
              <DataItem label="Nombre de postes">
                {pharmacy.postCount ?? "non renseigné"}
                {pharmacy.postCountChanges.length > 1 && (
                  <span className="mt-1 block text-[12px] text-text-tertiary">
                    {pharmacy.postCountChanges.slice(0, 3).map((c) => `${c.previous ?? "—"} → ${c.next} le ${formatDate(c.createdAt)} (${c.actorLabel})`).join(" · ")}
                  </span>
                )}
              </DataItem>
              <DataItem label="Organisation">{pharmacy.organization.name}</DataItem>
              <DataItem label="Code de parrainage">{pharmacy.referralCode ?? "Attribué à la première ouverture de l'onglet Mon abonnement"}</DataItem>
              <DataItem label="Parrainée par">{pharmacy.referredBy ? <Link href={`/admin/pharmacies/${pharmacy.referredBy.id}`} className="text-brand-700 underline dark:text-brand-300">{pharmacy.referredBy.name}</Link> : "—"}</DataItem>
              {pharmacy.referrals.length > 0 && (
                <DataItem label={`Filleuls (${pharmacy.referrals.length})`}>
                  <ul className="space-y-0.5">
                    {pharmacy.referrals.map((r) => (
                      <li key={r.id}><Link href={`/admin/pharmacies/${r.id}`} className="text-brand-700 underline dark:text-brand-300">{r.name}</Link>{r.city ? ` · ${r.city}` : ""}{r.isActive ? "" : " · inactive"}</li>
                    ))}
                  </ul>
                </DataItem>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Historique" description="Création, modifications sensibles, envois." />
            <CardContent className="p-0">
              {history.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-text-tertiary">Rien à signaler.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {history.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-2.5 text-[13px]">
                      <span className="text-text-primary">{h.label}</span>
                      <span className="text-[12px] text-text-tertiary">{formatDate(h.at)}{h.by ? ` · ${h.by}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader title="Volumes" description="Des compteurs, jamais un contenu." />
          <CardContent className="space-y-3 pb-5">
            <Counter label="Patients au dossier" value={pharmacy._count.patients} />
            <Counter label="Références au catalogue" value={pharmacy._count.products + pharmacy._count.drugStocks} />
            <Counter label="Ordonnances traitées" value={pharmacy._count.prescriptions} />
            <Counter label="Analyses du moteur" value={pharmacy._count.analysisRuns} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Installation" description="Accueil, stock, postes, moteur, abonnement — des états, jamais un contenu." action={<InstallGuideButton pharmacyId={pharmacy.id} />} />
          <CardContent className="space-y-2.5 pb-5 text-[13px]">
            <DataItem label="Postes de comptoir reliés">{posts.length === 0 ? "aucun" : posts.map((post) => `${post.label ?? (post.hostname || "poste")}${post.alive ? " · en ligne" : ""}${post.scanCount > 0 ? ` · ${post.scanCount} bips` : ""}${post.exportPath ? " · stock relu" : ""}`).join(" ; ")}</DataItem>
            <DataItem label="Guide d'installation">{lastGuide ? `envoyé le ${formatDate(lastGuide.createdAt)}` : "jamais envoyé"}</DataItem>
            <DataItem label="Accueil du titulaire">{pharmacy.onboardingCompletedAt ? `terminé le ${formatDate(pharmacy.onboardingCompletedAt)}` : "en cours"}</DataItem>
            <DataItem label="Stock importé">{pharmacy.stockSyncedAt ? `oui · synchronisé le ${formatDate(pharmacy.stockSyncedAt)}` : "non"}</DataItem>
            <DataItem label="Anomalies de stock">{unclassified > 0 ? `${unclassified} produit(s) à classer` : "aucune"}</DataItem>
            <DataItem label="Moteur de recommandation">
              {!lastRun ? "jamais sollicité" : lastRun.status === "FAILED" || lastRun.outcome === "ENGINE_ERROR" ? `en erreur (${formatDate(lastRun.startedAt)})` : lastRun.outcome === "AI_UNAVAILABLE" ? "IA indisponible à la dernière analyse" : lastRun.outcome === "STOCK_NOT_CONFIGURED" ? "opérationnel, sans stock" : `opérationnel · dernière analyse le ${formatDate(lastRun.startedAt)}`}
            </DataItem>
            <DataItem label="Abonnement">{pharmacy.organization.subscription ? `${pharmacy.organization.subscription.plan.name} · ${pharmacy.organization.subscription.status.toLowerCase()}` : "non renseigné"}</DataItem>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <span className="text-[18px] font-semibold tabular text-text-primary">{value}</span>
    </div>
  );
}

/** Les postes reliés et le dernier guide envoyé. L'heure se lit ici, pas dans le rendu. */
async function loadInstallationState(pharmacyId: string) {
  const now = Date.now();
  const [rows, lastGuide] = await Promise.all([
    prisma.counterPost.findMany({ where: { pharmacyId, revokedAt: null, pairedAt: { not: null } }, select: { label: true, hostname: true, lastSeenAt: true, scanCount: true, exportPath: true } }),
    prisma.auditLog.findFirst({ where: { pharmacyId, action: "pharmacy.install_guide_sent" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const posts = rows.map((post) => ({ ...post, alive: Boolean(post.lastSeenAt && now - post.lastSeenAt.getTime() < 180_000) }));
  return { posts, lastGuide };
}

const HISTORY_ACTIONS = ["platform.pharmacy_created", "platform.pharmacy_updated", "platform.pharmacy_status_changed", "platform.owner_created", "platform.member_deleted", "platform.pharmacy_email_changed", "platform.owner_email_changed", "platform.owner_welcome_resent", "platform.post_count_changed", "pharmacy.install_guide_sent", "auth.password_link_sent"];

/** L'historique lisible de la fiche : qui a changé quoi, de quelle valeur à quelle valeur. */
async function loadHistory(pharmacyId: string) {
  const owners = await prisma.membership.findMany({ where: { pharmacyId, role: "OWNER" }, select: { userId: true } });
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: HISTORY_ACTIONS }, OR: [{ pharmacyId }, { entityId: pharmacyId }, { entityId: { in: owners.map((o) => o.userId) } }] },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, action: true, metadata: true, createdAt: true, platformAdminId: true },
  });
  const adminIds = [...new Set(rows.map((r) => r.platformAdminId).filter((v): v is string => Boolean(v)))];
  const admins = adminIds.length ? await prisma.platformAdmin.findMany({ where: { id: { in: adminIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const nameOf = (id: string | null) => (() => { const a = admins.find((x) => x.id === id); return a ? `${a.firstName} ${a.lastName}` : null; })();
  return rows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const fromTo = (label: string) => `${label} : ${String(m.from ?? "—")} → ${String(m.to ?? "—")}`;
    const changes = m.changes as Record<string, { from: string | null; to: string | null }> | undefined;
    const label =
      r.action === "platform.pharmacy_created" ? "Officine créée"
      : r.action === "platform.pharmacy_updated" ? (changes && Object.keys(changes).length ? `Fiche modifiée — ${Object.entries(changes).map(([k, v]) => `${k} : ${v.from ?? "—"} → ${v.to ?? "—"}`).join(" ; ")}` : "Fiche modifiée")
      : r.action === "platform.pharmacy_email_changed" ? fromTo("E-mail de contact")
      : r.action === "platform.owner_email_changed" ? fromTo("Identifiant du titulaire")
      : r.action === "platform.post_count_changed" ? fromTo("Nombre de postes")
      : r.action === "platform.owner_created" ? "Titulaire ajouté"
      : r.action === "platform.member_deleted" ? "Compte supprimé"
      : r.action === "platform.pharmacy_status_changed" ? "Statut de l'officine modifié"
      : r.action === "platform.owner_welcome_resent" ? `Accès renvoyé (${String(m.status ?? "")})`
      : r.action === "pharmacy.install_guide_sent" ? `Guide d'installation (${String(m.status ?? "")})`
      : `E-mail ${m.kind === "welcome" ? "de bienvenue" : "d'accès"} : ${String(m.status ?? "")}`;
    return { id: r.id, label, at: r.createdAt, by: nameOf(r.platformAdminId) };
  });
}

