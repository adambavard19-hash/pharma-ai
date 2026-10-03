import type { Metadata } from "next";
import Link from "next/link";
import { Ban, MailWarning, MailX, UserX } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadAccessOverview } from "@/server/services/admin/clients";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { AttentionCard } from "@/components/admin/kpis";
import { FilterChips } from "@/components/admin/filters";
import { DispatchStatusBadge, StatusBadge, SubscriptionStatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatFrenchDate } from "@/core/billing/subscription";
import { DISPATCH_KIND_LABELS } from "@/core/admin/statuses";
import { ROLE_LABELS, searchParam, truncate } from "@/core/admin/clients";
import { formatDateTime } from "@/lib/format";
import { AccessToggle } from "../pharmacies/access-toggle";
import { MemberActions } from "../pharmacies/member-actions";
import { Stack, When } from "../pharmacies/client-ui";

export const metadata: Metadata = { title: "Accès des officines" };

const FILTERS = ["invitations", "suspendus"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Les accès : officines et comptes suspendus, invitations en attente, e-mails
 * d'accès qui ne sont pas arrivés. Chaque ligne mène à l'endroit où agir.
 */
export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const raw = searchParam(params, "filtre");
  const filtre: Filter | null = (FILTERS as readonly string[]).includes(raw ?? "") ? (raw as Filter) : null;
  const now = new Date();
  const data = await loadAccessOverview(now);
  const suspendedCount = data.suspendedPharmacies.length + data.suspendedMemberships.length;
  const show = (section: Filter | "emails") => (section === "emails" ? filtre === null : filtre === null || filtre === section);

  return (
    <>
      <AdminPageHeader space={{ label: "Clients", href: "/admin/pharmacies" }} title="Accès" description="Officines et comptes suspendus, invitations en attente, e-mails d'accès en échec." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AttentionCard count={data.suspendedPharmacies.length} title="Officines suspendues" description="Aucun compte ne peut s'y connecter." href="/admin/acces?filtre=suspendus" tone="danger" icon={<Ban className="size-4" />} />
        <AttentionCard count={data.suspendedMemberships.length} title="Comptes suspendus" description="Accès retiré à une officine." href="/admin/acces?filtre=suspendus" tone="warning" icon={<UserX className="size-4" />} />
        <AttentionCard count={data.invitations.length} title="Invitations en attente" description="Dossier pas encore complété." href="/admin/acces?filtre=invitations" tone="info" icon={<MailWarning className="size-4" />} />
        <AttentionCard count={data.failedEmails.length} title="E-mails d'accès en échec" description="Sur les 30 derniers jours." href="/admin/acces#echecs" tone="danger" icon={<MailX className="size-4" />} />
      </div>

      <FilterChips
        label="Filtrer les accès"
        basePath="/admin/acces"
        param="filtre"
        current={filtre}
        options={[
          { value: null, label: "Tout" },
          { value: "invitations", label: "Invitations en attente", count: data.invitations.length },
          { value: "suspendus", label: "Suspendus", count: suspendedCount },
        ]}
      />

      {show("suspendus") && (
        <AdminSection title="Officines suspendues" description="La réactivation restitue l'espace tel quel ; le motif est demandé et tracé." padded={data.suspendedPharmacies.length === 0}>
          {data.suspendedPharmacies.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">Aucune officine suspendue.</p>
          ) : (
            <TableWrapper className="rounded-none border-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Officine</TH>
                    <TH>Suspendue</TH>
                    <TH>Motif</TH>
                    <TH>Abonnement</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {data.suspendedPharmacies.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <Link href={`/admin/pharmacies/${p.id}`} className="block font-medium text-text-primary hover:underline">
                          {p.name}
                        </Link>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-tertiary">
                          {p.city ?? "Ville non renseignée"}
                          {p.isDemo && <Badge tone="neutral">Démo</Badge>}
                        </span>
                      </TD>
                      <TD>
                        <Stack primary={p.suspendedAt ? formatFrenchDate(p.suspendedAt) : "Date inconnue"} secondary={p.by ? `par ${p.by}` : undefined} />
                      </TD>
                      <TD className="max-w-[22rem] whitespace-normal text-[13px] text-text-secondary">{p.reason ? truncate(p.reason, 200) : <span className="text-text-tertiary">Non renseigné</span>}</TD>
                      <TD>{p.organization.subscription ? <SubscriptionStatusBadge status={p.organization.subscription.status} /> : <span className="text-[12.5px] text-text-tertiary">Aucun</span>}</TD>
                      <TD>
                        <span className="flex justify-end">
                          <AccessToggle pharmacyId={p.id} pharmacyName={p.name} suspended />
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </AdminSection>
      )}

      {show("suspendus") && (
        <AdminSection title="Comptes suspendus" description="Un compte suspendu ne peut plus se connecter à l'officine concernée." padded={data.suspendedMemberships.length === 0}>
          {data.suspendedMemberships.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">Aucun compte suspendu.</p>
          ) : (
            <TableWrapper className="rounded-none border-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Compte</TH>
                    <TH>Officine</TH>
                    <TH>Rôle</TH>
                    <TH>État</TH>
                    <TH>Dernière connexion</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {data.suspendedMemberships.map((m) => (
                    <TR key={m.id}>
                      <TD>
                        <Stack primary={<span className="font-medium">{`${m.user.firstName} ${m.user.lastName.toUpperCase()}`}</span>} secondary={m.user.email} />
                      </TD>
                      <TD>
                        <Link href={`/admin/pharmacies/${m.pharmacy.id}?onglet=utilisateurs`} className="text-[13px] text-text-primary hover:underline">
                          {m.pharmacy.name}
                        </Link>
                        {!m.pharmacy.isActive && (
                          <span className="mt-1 block">
                            <Badge tone="warning">Officine suspendue</Badge>
                          </span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={m.role === "OWNER" ? "brand" : "neutral"}>{ROLE_LABELS[m.role] ?? m.role}</Badge>
                      </TD>
                      <TD>
                        <StatusBadge status={m.user.status === "SUSPENDED" ? { label: "Compte suspendu", tone: "danger" } : { label: "Accès à l'officine suspendu", tone: "warning" }} />
                        <span className="mt-1 block text-[12px] text-text-tertiary">Depuis le {formatFrenchDate(m.updatedAt)}</span>
                      </TD>
                      <TD>
                        <When date={m.user.lastLoginAt} empty="Jamais" className="text-[13px]" />
                      </TD>
                      <TD>
                        <MemberActions pharmacyId={m.pharmacy.id} membershipId={m.id} isActive={m.isActive} name={`${m.user.firstName} ${m.user.lastName}`} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </AdminSection>
      )}

      {show("invitations") && (
        <AdminSection title="Invitations en attente" description="Le titulaire a reçu (ou doit recevoir) son lien pour compléter son dossier. Les gestes se font depuis le dossier." padded={data.invitations.length === 0}>
          {data.invitations.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">Aucune invitation en attente.</p>
          ) : (
            <TableWrapper className="rounded-none border-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Destinataire</TH>
                    <TH>Dossier</TH>
                    <TH>État</TH>
                    <TH>Envoi</TH>
                    <TH>Expiration</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.invitations.map((inv) => (
                    <TR key={inv.id}>
                      <TD className="text-[13px] font-medium">{inv.email}</TD>
                      <TD>
                        <Link href={`/admin/dossiers/${inv.prospect.id}`} className="text-[13px] text-text-primary hover:underline">
                          {inv.prospect.name}
                        </Link>
                      </TD>
                      <TD>
                        <StatusBadge status={inv.state} />
                        {inv.openedAt && <span className="mt-1 block text-[12px] text-text-tertiary">Ouverte le {formatFrenchDate(inv.openedAt)}</span>}
                      </TD>
                      <TD>
                        <Stack primary={inv.sentAt ? formatFrenchDate(inv.sentAt) : "Pas encore envoyée"} secondary={inv.sendCount > 1 ? `${inv.sendCount} envois` : inv.lastSendStatus && inv.lastSendStatus !== "SENT" ? truncate(inv.lastSendDetail ?? inv.lastSendStatus, 80) : undefined} />
                      </TD>
                      <TD>
                        <span className={inv.expiresAt < now ? "text-[13px] text-warning-700 dark:text-warning-500" : "text-[13px]"}>{formatFrenchDate(inv.expiresAt)}</span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </AdminSection>
      )}

      {show("emails") && (
        <AdminSection id="echecs" title="E-mails d'accès en échec" description="Invitations, bienvenue et liens d'accès non remis ces 30 derniers jours : corrigez l'adresse depuis la fiche, puis renvoyez." padded={data.failedEmails.length === 0}>
          {data.failedEmails.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">Aucun e-mail d&apos;accès en échec sur 30 jours.</p>
          ) : (
            <TableWrapper className="rounded-none border-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>E-mail</TH>
                    <TH>Destinataire</TH>
                    <TH>Statut</TH>
                    <TH>Officine ou dossier</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.failedEmails.map((e) => (
                    <TR key={e.id}>
                      <TD className="text-[13px] whitespace-nowrap">{formatDateTime(e.createdAt)}</TD>
                      <TD className="text-[13px]">{DISPATCH_KIND_LABELS[e.kind] ?? e.kind}</TD>
                      <TD className="text-[13px] text-text-secondary">{e.recipient}</TD>
                      <TD>
                        <DispatchStatusBadge status={e.status} />
                        {e.detail && <span className="mt-1 block max-w-[18rem] text-[12px] whitespace-normal text-text-tertiary">{truncate(e.detail, 120)}</span>}
                      </TD>
                      <TD>
                        {e.pharmacyId && e.pharmacyName ? (
                          <Link href={`/admin/pharmacies/${e.pharmacyId}?onglet=utilisateurs`} className="text-[13px] text-text-primary hover:underline">
                            {e.pharmacyName}
                          </Link>
                        ) : e.prospectId && e.prospectName ? (
                          <Link href={`/admin/dossiers/${e.prospectId}`} className="text-[13px] text-text-primary hover:underline">
                            {e.prospectName}
                          </Link>
                        ) : (
                          <span className="text-[12.5px] text-text-tertiary">—</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </AdminSection>
      )}
    </>
  );
}
